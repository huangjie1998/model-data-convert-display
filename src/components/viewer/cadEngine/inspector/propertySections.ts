import type { DwgPrimitive } from '@/services/dwgApi';
import type { PropertyRow, PropertySection } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value: unknown, digits = 3): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(digits);
}

function formatPointCompact(point: unknown, digits = 3): string | null {
  const p = asRecord(point);
  if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return null;
  const z = isFiniteNumber(p.z) ? `, ${formatNumber(p.z, digits)}` : '';
  return `(${formatNumber(p.x, digits)}, ${formatNumber(p.y, digits)}${z})`;
}

function formatScaleCompact(scaleValue: unknown): string | null {
  const s = asRecord(scaleValue);
  const sx = Number(s.x);
  const sy = Number(s.y);
  const sz = Number(s.z);
  if (![sx, sy, sz].some(Number.isFinite)) return null;
  return `${Number.isFinite(sx) ? formatNumber(sx, 4) : '--'}, ${Number.isFinite(sy) ? formatNumber(sy, 4) : '--'}, ${
    Number.isFinite(sz) ? formatNumber(sz, 4) : '--'
  }`;
}

function cleanCadText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\P/gi, '\n')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '')
    .trim();
}

function boolText(value: unknown): string {
  return value ? '是' : '否';
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }
  return null;
}

function pushRow(rows: PropertyRow[], key: string, value: unknown, formatter?: (v: unknown) => string): void {
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && value.trim() === '') return;
  const text = formatter ? formatter(value) : String(value);
  if (!text || text.trim() === '') return;
  rows.push({ key, value: text });
}

function pushRowFixed(
  rows: PropertyRow[],
  key: string,
  value: unknown,
  formatter?: (v: unknown) => string,
  placeholder = '--'
): void {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    rows.push({ key, value: placeholder });
    return;
  }
  const text = formatter ? formatter(value) : String(value);
  rows.push({ key, value: text && text.trim() ? text : placeholder });
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHexColor(r: number, g: number, b: number): string {
  const rr = clampByte(r).toString(16).padStart(2, '0');
  const gg = clampByte(g).toString(16).padStart(2, '0');
  const bb = clampByte(b).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

function aciToRgb(aciRaw: number): { r: number; g: number; b: number } {
  const aci = Math.round(aciRaw);
  const map: Record<number, [number, number, number]> = {
    1: [255, 0, 0],
    2: [255, 255, 0],
    3: [0, 255, 0],
    4: [0, 255, 255],
    5: [0, 0, 255],
    6: [255, 0, 255],
    7: [255, 255, 255],
    8: [127, 127, 127],
    9: [192, 192, 192],
  };
  const hit = map[aci];
  if (hit) return { r: hit[0], g: hit[1], b: hit[2] };
  if (aci <= 0 || aci > 255) return { r: 255, g: 255, b: 255 };
  const v = Math.round(((aci % 24) / 23) * 255);
  return { r: v, g: v, b: v };
}

function parseCadColorCore(value: unknown): { text: string; swatch: string } | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.round(value);
    if (n >= 0 && n <= 256) {
      const rgb = aciToRgb(n === 0 ? 7 : n === 256 ? 7 : n);
      return {
        text: `ACI ${n} (RGB ${rgb.r},${rgb.g},${rgb.b})`,
        swatch: toHexColor(rgb.r, rgb.g, rgb.b),
      };
    }
    if (n >= 0 && n <= 0xffffff) {
      const r = (n >> 16) & 0xff;
      const g = (n >> 8) & 0xff;
      const b = n & 0xff;
      return {
        text: `RGB ${r},${g},${b} (${toHexColor(r, g, b).toUpperCase()})`,
        swatch: toHexColor(r, g, b),
      };
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'bylayer') return { text: 'ByLayer', swatch: '#9ca3af' };
  if (lower === 'byblock') return { text: 'ByBlock', swatch: '#6b7280' };

  const trueColorMatch = raw.match(/\br\s*[:=]?\s*([0-9]{1,3})\D+\bg\s*[:=]?\s*([0-9]{1,3})\D+\bb\s*[:=]?\s*([0-9]{1,3})/i);
  if (trueColorMatch) {
    const r = Math.max(0, Math.min(255, Number.parseInt(trueColorMatch[1], 10)));
    const g = Math.max(0, Math.min(255, Number.parseInt(trueColorMatch[2], 10)));
    const b = Math.max(0, Math.min(255, Number.parseInt(trueColorMatch[3], 10)));
    return {
      text: `RGB ${r},${g},${b} (${toHexColor(r, g, b).toUpperCase()})`,
      swatch: toHexColor(r, g, b),
    };
  }

  const aciMatch = raw.match(/aci\s*(-?\d+)/i);
  if (aciMatch) {
    const aci = Number(aciMatch[1]);
    if (Number.isFinite(aci)) {
      const rgb = aciToRgb(aci === 0 ? 7 : aci === 256 ? 7 : aci);
      return {
        text: `ACI ${Math.round(aci)} (RGB ${rgb.r},${rgb.g},${rgb.b})`,
        swatch: toHexColor(rgb.r, rgb.g, rgb.b),
      };
    }
  }

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 0 && n <= 256) {
      const rgb = aciToRgb(n === 0 ? 7 : n === 256 ? 7 : n);
      return {
        text: `ACI ${n} (RGB ${rgb.r},${rgb.g},${rgb.b})`,
        swatch: toHexColor(rgb.r, rgb.g, rgb.b),
      };
    }
    if (n >= 0 && n <= 0xffffff) {
      const r = (n >> 16) & 0xff;
      const g = (n >> 8) & 0xff;
      const b = n & 0xff;
      return {
        text: `RGB ${r},${g},${b} (${toHexColor(r, g, b).toUpperCase()})`,
        swatch: toHexColor(r, g, b),
      };
    }
  }

  const hexMatch = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = `#${hexMatch[1].toUpperCase()}`;
    const n = Number.parseInt(hexMatch[1], 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return { text: `RGB ${r},${g},${b} (${hex})`, swatch: hex.toLowerCase() };
  }

  return { text: raw, swatch: '#9ca3af' };
}

function buildCadColorDisplay(value: unknown, effectiveValue?: unknown): { text: string; swatch: string } | null {
  const rawParsed = parseCadColorCore(value);
  const effectiveParsed = parseCadColorCore(effectiveValue);
  if (effectiveParsed) {
    return effectiveParsed;
  }
  return rawParsed;
}

function pushColorRowFixed(
  rows: PropertyRow[],
  key: string,
  value: unknown,
  placeholder = '--',
  effectiveValue?: unknown
): void {
  const parsed = buildCadColorDisplay(value, effectiveValue);
  if (!parsed) {
    rows.push({ key, value: placeholder });
    return;
  }
  rows.push({ key, value: parsed.text, colorSwatch: parsed.swatch });
}

function firstDefined(values: unknown[]): unknown {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const token = value.trim();
      if (!token) continue;
      if (token.toLowerCase() === 'null' || token.toLowerCase() === 'none') continue;
    }
    return value;
  }
  return null;
}

function dimKindLabelCn(kindRaw: unknown): string {
  const kind = String(kindRaw ?? '').trim().toLowerCase();
  if (kind === 'aligned') return '对齐标注';
  if (kind === 'rotated') return '旋转标注';
  if (kind === 'angular') return '角度标注';
  if (kind === 'radius') return '半径标注';
  if (kind === 'diameter') return '直径标注';
  if (kind === 'ordinate') return '坐标标注';
  if (kind === 'arc_length') return '弧长标注';
  return '标注';
}

function parseFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cadSwitchText(value: unknown, reverse = false): string {
  let enabled = false;
  if (typeof value === 'boolean') {
    enabled = value;
  } else {
    const n = parseFiniteNumber(value);
    if (n !== null) {
      enabled = Math.abs(n) > 1e-9;
    } else {
      const token = String(value ?? '').trim().toLowerCase();
      enabled = ['true', 'yes', 'on', '1', 'ktrue', '开'].includes(token);
    }
  }
  if (reverse) enabled = !enabled;
  return enabled ? '开' : '关';
}

function cadDimUnitFormatText(value: unknown): string {
  const n = parseFiniteNumber(value);
  if (n === null) return String(value ?? '--');
  const code = Math.round(n);
  const map: Record<number, string> = {
    1: '科学',
    2: '十进制',
    3: '工程',
    4: '建筑',
    5: '分数',
    6: 'Windows 桌面',
  };
  return map[code] ? `${map[code]} (${code})` : String(code);
}

function cadDimTextMoveText(value: unknown): string {
  const n = parseFiniteNumber(value);
  if (n === null) return String(value ?? '--');
  const code = Math.round(n);
  const map: Record<number, string> = {
    0: '移动尺寸线',
    1: '添加引线',
    2: '自由拖动',
  };
  return map[code] ? `${map[code]} (${code})` : String(code);
}

function cadDimTextVerticalText(value: unknown): string {
  const n = parseFiniteNumber(value);
  if (n === null) return String(value ?? '--');
  const code = Math.round(n);
  const map: Record<number, string> = {
    0: '居中',
    1: '上方',
    2: '远离尺寸线',
    3: 'JIS',
    4: '尺寸线下方',
  };
  return map[code] ? `${map[code]} (${code})` : String(code);
}

function cadDimTextJustifyText(value: unknown): string {
  const n = parseFiniteNumber(value);
  if (n === null) return String(value ?? '--');
  const code = Math.round(n);
  const map: Record<number, string> = {
    0: '居中',
    1: '第一条尺寸界线旁',
    2: '第二条尺寸界线旁',
    3: '第一条界线上方',
    4: '第二条界线上方',
  };
  return map[code] ? `${map[code]} (${code})` : String(code);
}

function cadDimFitText(value: unknown): string {
  const n = parseFiniteNumber(value);
  if (n === null) return String(value ?? '--');
  const code = Math.round(n);
  const map: Record<number, string> = {
    0: '移动文字与箭头',
    1: '先移动箭头',
    2: '先移动文字',
    3: '仅移动文字',
  };
  return map[code] ? `${map[code]} (${code})` : String(code);
}

function cadDecimalSeparatorText(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  const n = parseFiniteNumber(value);
  if (n === null) return '--';
  const code = Math.round(n);
  if (code >= 32 && code <= 126) return `${String.fromCharCode(code)} (${code})`;
  return String(code);
}

function cadDimToleranceAlignText(value: unknown): string {
  const n = parseFiniteNumber(value);
  if (n === null) return String(value ?? '--');
  const code = Math.round(n);
  const map: Record<number, string> = {
    0: '底部',
    1: '中间',
    2: '顶部',
  };
  return map[code] ? `${map[code]} (${code})` : String(code);
}

function cadTextDirectionText(value: unknown): string {
  const n = parseFiniteNumber(value);
  if (n === null) return String(value ?? '--');
  const code = Math.round(n);
  const map: Record<number, string> = {
    0: '从左到右',
    1: '从右到左',
    2: '自上而下',
    3: '自下而上',
  };
  return map[code] ? `${map[code]} (${code})` : String(code);
}

function cadZeroFlagText(value: unknown, flag: number): string {
  const n = parseFiniteNumber(value);
  if (n === null) return '--';
  const code = Math.round(n);
  return (code & flag) !== 0 ? '开' : '关';
}

function buildSemanticRows(
  mappingStatus: Record<string, unknown>,
  normalized: Record<string, unknown>,
  provenance: Record<string, unknown>
): PropertyRow[] {
  const semanticRows: PropertyRow[] = [];
  pushRow(semanticRows, '映射状态', boolText(Boolean(mappingStatus.ok)));
  pushRow(semanticRows, '来源链完整', boolText(Boolean(mappingStatus.source_trace_complete)));
  if (Array.isArray(mappingStatus.missing_keys)) {
    pushRow(semanticRows, '缺失字段', mappingStatus.missing_keys.join(', '));
  }
  if (Array.isArray(mappingStatus.extra_keys)) {
    pushRow(semanticRows, '额外字段', mappingStatus.extra_keys.join(', '));
  }
  pushRow(semanticRows, '规范化图层', normalized.layer);
  pushRow(semanticRows, '规范化色号', normalized.color_index);
  pushRow(semanticRows, '规范化颜色', normalized.color_rgb);
  pushRow(semanticRows, '规范化图元数', normalized.primitive_count);
  pushRow(semanticRows, '来源(线宽)', provenance.lineweight_mm);
  pushRow(semanticRows, '来源(颜色)', provenance.color_index);
  return semanticRows;
}

function buildDimensionPropertySections(
  entity: Record<string, unknown>,
  geom: Record<string, unknown>,
  style: Record<string, unknown>,
  normalized: Record<string, unknown>,
  mappingStatus: Record<string, unknown>,
  provenance: Record<string, unknown>
): PropertySection[] {
  const payload = asRecord(geom.dimension_payload);
  const anchors = asRecord(payload.anchors);
  const primitives = asPrimitiveList(geom);
  const dimTextPrimitive = primitives.find(
    (primitive) => primitive.kind === 'text' && primitive.subtype === 'dimension_text'
  ) as Extract<DwgPrimitive, { kind: 'text' }> | undefined;
  const dimStyleVars = asRecord(payload.dim_style_vars ?? geom.dim_style_vars);
  const dimStyleSources = asRecord(payload.dim_style_sources);
  const dimStyleRecord = asRecord(geom.dim_style_record ?? dimStyleSources.style);
  const dimHeaderDefaults = asRecord(geom.dim_header_defaults ?? dimStyleSources.defaults);
  const dimEntityOverrides = asRecord(dimStyleSources.entity_overrides);
  const dimVar = (...keys: string[]): unknown => {
    for (const key of keys) {
      const value = firstDefined([
        geom[key],
        payload[key],
        dimEntityOverrides[key],
        dimStyleVars[key],
        dimStyleRecord[key],
        dimHeaderDefaults[key],
      ]);
      if (value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')) {
        return value;
      }
    }
    return null;
  };

  const dimKind = firstDefined([payload.dim_kind, geom.dim_kind]);
  const dimStyleName = firstDefined([payload.dimension_style, geom.dimension_style, normalized.dimension_style]);
  const textPos = firstDefined([payload.text_position, geom.text_position, dimTextPrimitive?.position]);
  const textValue = firstDefined([
    payload.display_text,
    geom.display_text,
    geom.text,
    payload.formatted_measurement,
    geom.formatted_measurement,
    dimTextPrimitive?.text,
  ]);

  const arrow1 = dimVar('arrow_block1', 'dimblk1', 'arrow_block', 'dimblk');
  const arrow2 = dimVar('arrow_block2', 'dimblk2', 'arrow_block', 'dimblk');
  const arrowSize = firstDefined([payload.arrow_size, geom.arrow_size, dimStyleVars.dimasz]);
  const textHeight = firstDefined([payload.text_height, geom.text_height, dimStyleVars.dimtxt, dimTextPrimitive?.actual_height]);
  const textColor = firstDefined([payload.text_color, geom.text_color, dimStyleVars.dimclrt, dimTextPrimitive?.color]);
  const textMaskColor = firstDefined([payload.text_mask_color, geom.text_mask_color, dimStyleVars.dimtfillclr, dimTextPrimitive?.text_mask_color]);
  const textRotation = firstDefined([payload.rotation, geom.rotation, dimTextPrimitive?.rotation]);
  const dimLineColorEffective = firstDefined([
    payload.dim_line_color_effective_aci,
    payload.dim_line_color_effective_rgb,
    payload.effective_dim_line_color,
  ]);
  const dimExtLineColorEffective = firstDefined([
    payload.dim_ext_line_color_effective_aci,
    payload.dim_ext_line_color_effective_rgb,
    payload.effective_ext_line_color,
  ]);

  const commonRows: PropertyRow[] = [];
  pushRowFixed(commonRows, '对象类型', dimKindLabelCn(dimKind));
  pushColorRowFixed(
    commonRows,
    '颜色',
    firstDefined([style.effective_color_rgb, normalized.color_rgb, style.color_rgb, style.effective_color, style.color])
  );
  pushRowFixed(commonRows, '图层', entity.layer);
  pushRowFixed(commonRows, '线型', firstDefined([style.linetype, normalized.linetype]));
  pushRowFixed(commonRows, '线型比例', firstDefined([style.linetype_scale, geom.linetype_scale]), (v) => formatNumber(v, 4));
  pushRowFixed(commonRows, '打印样式', firstDefined([style.plot_style_name, style.plot_style]));
  pushRowFixed(commonRows, '线宽', firstDefined([style.lineweight, style.effective_lineweight_mm]), (v) =>
    typeof v === 'string' ? v : `${formatNumber(v, 4)} mm`
  );
  pushRowFixed(commonRows, '透明度', firstDefined([style.transparency, style.effective_transparency]));
  pushRowFixed(commonRows, '超链接', firstDefined([geom.hyperlink, entity.hyperlink]));
  pushRowFixed(commonRows, '关联', firstDefined([geom.associative, payload.associative]), boolText);

  const otherRows: PropertyRow[] = [];
  pushRowFixed(otherRows, '标注样式', dimStyleName);
  pushRowFixed(otherRows, '注释性', firstDefined([geom.annotative, entity.annotative, dimVar('dimanno')]), boolText);
  pushRowFixed(otherRows, '标注比例', dimVar('dimscale'), (v) => formatNumber(v, 4));
  pushRowFixed(otherRows, '测量比例', dimVar('dimlfac'), (v) => formatNumber(v, 4));
  pushRowFixed(otherRows, '句柄', extractCadHandle(entity));
  pushRowFixed(otherRows, '实体ID', entity.id);

  const lineArrowRows: PropertyRow[] = [];
  pushRowFixed(lineArrowRows, '箭头 1', arrow1);
  pushRowFixed(lineArrowRows, '箭头 2', arrow2);
  pushRowFixed(lineArrowRows, '箭头大小', arrowSize, (v) => formatNumber(v, 4));
  pushRowFixed(lineArrowRows, '尺寸线线宽', dimVar('dimlwd'));
  pushRowFixed(lineArrowRows, '尺寸界线线宽', dimVar('dimlwe'));
  pushRowFixed(lineArrowRows, '尺寸线 1', dimVar('dimsd1'), (v) => cadSwitchText(v, true));
  pushRowFixed(lineArrowRows, '尺寸线 2', dimVar('dimsd2'), (v) => cadSwitchText(v, true));
  pushColorRowFixed(lineArrowRows, '尺寸线颜色', dimLineColorEffective, '--');
  pushRowFixed(lineArrowRows, '尺寸线的线型', dimVar('dimltype'));
  pushRowFixed(lineArrowRows, '尺寸线范围', dimVar('dimdle'), (v) => formatNumber(v, 4));
  pushRowFixed(lineArrowRows, '尺寸界线 1 的线型', dimVar('dimltex1'));
  pushRowFixed(lineArrowRows, '尺寸界线 2 的线型', dimVar('dimltex2'));
  pushRowFixed(lineArrowRows, '尺寸界线 1', dimVar('dimse1'), (v) => cadSwitchText(v, true));
  pushRowFixed(lineArrowRows, '尺寸界线 2', dimVar('dimse2'), (v) => cadSwitchText(v, true));
  pushRowFixed(lineArrowRows, '固定的尺寸界线', dimVar('dimfxlenon'), (v) => cadSwitchText(v));
  pushRowFixed(lineArrowRows, '尺寸界线的固定长度', dimVar('dimfxlen'), (v) => formatNumber(v, 4));
  pushColorRowFixed(lineArrowRows, '尺寸界线颜色', dimExtLineColorEffective, '--');
  pushRowFixed(lineArrowRows, '尺寸界线范围', dimVar('dimexe'), (v) => formatNumber(v, 4));
  pushRowFixed(lineArrowRows, '尺寸界线偏移', dimVar('dimexo'), (v) => formatNumber(v, 4));

  const textRows: PropertyRow[] = [];
  pushColorRowFixed(textRows, '填充颜色', textMaskColor);
  pushRowFixed(textRows, '分数类型', dimVar('dimfrac'));
  pushColorRowFixed(textRows, '文字颜色', textColor);
  pushRowFixed(textRows, '文字高度', textHeight, (v) => formatNumber(v, 4));
  pushRowFixed(textRows, '文字偏移', dimVar('dimgap'), (v) => formatNumber(v, 4));
  pushRowFixed(textRows, '文字界外对齐', dimVar('dimtoh'), (v) => cadSwitchText(v));
  pushRowFixed(textRows, '水平放置文字', dimVar('dimjust'), cadDimTextJustifyText);
  pushRowFixed(textRows, '垂直放置文字', dimVar('dimtad'), cadDimTextVerticalText);
  pushRowFixed(textRows, '文字样式', firstDefined([payload.style_name, geom.style_name, geom.text_style, dimStyleVars.dimtxsty, normalized.text_style]));
  pushRowFixed(textRows, '文字界内对齐', dimVar('dimtih'), (v) => cadSwitchText(v));
  pushRowFixed(textRows, '文字位置 X 坐标', asRecord(textPos).x, (v) => formatNumber(v, 4));
  pushRowFixed(textRows, '文字位置 Y 坐标', asRecord(textPos).y, (v) => formatNumber(v, 4));
  pushRowFixed(textRows, '文字旋转', textRotation, (v) => formatNumber(v, 4));
  pushRowFixed(textRows, '文字观察方向', dimVar('dimtxtdirection'), cadTextDirectionText);
  pushRowFixed(textRows, '测量单位', dimVar('dimlunit'), cadDimUnitFormatText);
  pushRowFixed(textRows, '文字替代', firstDefined([geom.text_override, geom.override_text, payload.display_text, geom.text, textValue]), (v) => cleanCadText(String(v)));

  const fitRows: PropertyRow[] = [];
  pushRowFixed(fitRows, '尺寸线强制', dimVar('dimtofl'), (v) => cadSwitchText(v));
  pushRowFixed(fitRows, '尺寸线内', dimVar('dimsoxd'), (v) => cadSwitchText(v));
  pushRowFixed(fitRows, '标注全局比例', dimVar('dimscale'), (v) => formatNumber(v, 4));
  pushRowFixed(fitRows, '调整', dimVar('dimatfit'), cadDimFitText);
  pushRowFixed(fitRows, '文字在内', dimVar('dimtix'), (v) => cadSwitchText(v));
  pushRowFixed(fitRows, '文字移动', dimVar('dimtmove'), cadDimTextMoveText);

  const primaryUnitRows: PropertyRow[] = [];
  pushRowFixed(primaryUnitRows, '小数分隔符', dimVar('dimdsep'), cadDecimalSeparatorText);
  pushRowFixed(primaryUnitRows, '标注前缀', firstDefined([dimVar('dimprefix'), dimVar('dim_prefix')]));
  pushRowFixed(primaryUnitRows, '标注后缀', firstDefined([dimVar('dimsuffix'), dimVar('dim_suffix'), dimVar('dimpost')]));
  pushRowFixed(primaryUnitRows, '标注辅单位后缀', dimVar('dimapost'));
  pushRowFixed(primaryUnitRows, '标注舍入', dimVar('dimrnd'), (v) => formatNumber(v, 4));
  pushRowFixed(primaryUnitRows, '标注线性比例', dimVar('dimlfac'), (v) => formatNumber(v, 4));
  pushRowFixed(primaryUnitRows, '标注辅单位比例', dimVar('dimaltf'), (v) => formatNumber(v, 4));
  pushRowFixed(primaryUnitRows, '标注单位', dimVar('dimlunit'), cadDimUnitFormatText);
  pushRowFixed(primaryUnitRows, '消去前导零', dimVar('dimzin'), (v) => cadZeroFlagText(v, 4));
  pushRowFixed(primaryUnitRows, '消去后续零', dimVar('dimzin'), (v) => cadZeroFlagText(v, 8));
  pushRowFixed(primaryUnitRows, '消去零英尺', dimVar('dimzin'), (v) => cadZeroFlagText(v, 1));
  pushRowFixed(primaryUnitRows, '消去零英寸', dimVar('dimzin'), (v) => cadZeroFlagText(v, 2));
  pushRowFixed(primaryUnitRows, '精度', dimVar('dimdec'));

  const altUnitRows: PropertyRow[] = [];
  pushRowFixed(altUnitRows, '启用换算', dimVar('dimalt'), (v) => cadSwitchText(v));
  pushRowFixed(altUnitRows, '换算格式', dimVar('dimaltu'), cadDimUnitFormatText);
  pushRowFixed(altUnitRows, '换算精度', firstDefined([dimVar('dimadec'), dimVar('dimaltd')]));
  pushRowFixed(altUnitRows, '换算圆整', dimVar('dimaltrnd'), (v) => formatNumber(v, 4));
  pushRowFixed(altUnitRows, '换算比例因子', dimVar('dimaltf'), (v) => formatNumber(v, 4));
  pushRowFixed(altUnitRows, '换算辅单位比例', dimVar('dimaltf'), (v) => formatNumber(v, 4));
  pushRowFixed(altUnitRows, '换算消去前导零', dimVar('dimaltz'), (v) => cadZeroFlagText(v, 4));
  pushRowFixed(altUnitRows, '换算消去后续零', dimVar('dimaltz'), (v) => cadZeroFlagText(v, 8));
  pushRowFixed(altUnitRows, '换算消去零英尺', dimVar('dimaltz'), (v) => cadZeroFlagText(v, 1));
  pushRowFixed(altUnitRows, '换算消去零英寸', dimVar('dimaltz'), (v) => cadZeroFlagText(v, 2));
  pushRowFixed(altUnitRows, '换算前缀', firstDefined([dimVar('dimaprefix')]));
  pushRowFixed(altUnitRows, '换算后缀', dimVar('dimapost'));
  pushRowFixed(altUnitRows, '换算辅单位后缀', firstDefined([dimVar('dimapost2'), dimVar('dimapost')]));

  const toleranceRows: PropertyRow[] = [];
  pushRowFixed(toleranceRows, '换算公差消去零英寸', dimVar('dimalttz'), (v) => cadZeroFlagText(v, 2));
  pushRowFixed(toleranceRows, '公差对齐', dimVar('dimtolj'), cadDimToleranceAlignText);
  pushRowFixed(toleranceRows, '显示公差', dimVar('dimtol'), (v) => (cadSwitchText(v) === '开' ? '是' : '无'));
  pushRowFixed(toleranceRows, '公差下偏差', dimVar('dimtm'), (v) => formatNumber(v, 4));
  pushRowFixed(toleranceRows, '公差上偏差', dimVar('dimtp'), (v) => formatNumber(v, 4));
  pushRowFixed(toleranceRows, '水平放置公差', dimVar('dimtolj'), cadDimToleranceAlignText);
  pushRowFixed(toleranceRows, '公差精度', dimVar('dimtdec'));
  pushRowFixed(toleranceRows, '公差消去前导零', dimVar('dimtzin'), (v) => cadZeroFlagText(v, 4));
  pushRowFixed(toleranceRows, '公差消去后续零', dimVar('dimtzin'), (v) => cadZeroFlagText(v, 8));
  pushRowFixed(toleranceRows, '公差消去零英尺', dimVar('dimtzin'), (v) => cadZeroFlagText(v, 1));
  pushRowFixed(toleranceRows, '公差消去零英寸', dimVar('dimtzin'), (v) => cadZeroFlagText(v, 2));
  pushRowFixed(toleranceRows, '公差文字高度', dimVar('dimtfac'), (v) => formatNumber(v, 4));
  pushRowFixed(toleranceRows, '换算公差精度', dimVar('dimalttd'));
  pushRowFixed(toleranceRows, '换算公差消去前导零', dimVar('dimalttz'), (v) => cadZeroFlagText(v, 4));
  pushRowFixed(toleranceRows, '换算公差消去后续零', dimVar('dimalttz'), (v) => cadZeroFlagText(v, 8));
  pushRowFixed(toleranceRows, '换算公差消去零英尺', dimVar('dimalttz'), (v) => cadZeroFlagText(v, 1));

  const geometryRows: PropertyRow[] = [];
  pushRowFixed(geometryRows, '标注类型', dimKindLabelCn(dimKind));
  pushRowFixed(geometryRows, '文字点', formatPointCompact(textPos));
  pushRowFixed(geometryRows, '尺寸线点', formatPointCompact(anchors.dim_line_point ?? geom.dim_line_point));
  pushRowFixed(geometryRows, '扩展线点 1', formatPointCompact(anchors.ext1 ?? geom.ext1));
  pushRowFixed(geometryRows, '扩展线点 2', formatPointCompact(anchors.ext2 ?? geom.ext2));
  pushRowFixed(geometryRows, '尺寸线起点', formatPointCompact(anchors.line_start ?? geom.line_start));
  pushRowFixed(geometryRows, '尺寸线终点', formatPointCompact(anchors.line_end ?? geom.line_end));
  pushRowFixed(geometryRows, '图元来源', firstDefined([payload.primitive_source, geom.primitive_source, normalized.primitive_source]));
  pushRowFixed(geometryRows, '匿名块名', firstDefined([payload.dimension_block_name_resolved, geom.dimension_block_name_resolved, payload.dimension_block_name, geom.dimension_block_name]));
  pushRowFixed(geometryRows, '匿名块状态', firstDefined([payload.dimension_block_status, geom.dimension_block_status]));
  pushRowFixed(geometryRows, '匿名块图元数', firstDefined([payload.dimension_block_primitive_count, geom.dimension_block_primitive_count]));
  pushRowFixed(geometryRows, '匿名块失败原因', firstDefined([payload.dimension_block_failure_reason, geom.dimension_block_failure_reason]));
  pushRowFixed(geometryRows, '匿名块精度修复', firstDefined([asRecord(payload.dimension_block_repair).kinds, asRecord(geom.dimension_block_repair).kinds]), (v) =>
    Array.isArray(v) ? v.join(', ') : String(v ?? '')
  );
  pushRowFixed(geometryRows, '图元数量', firstDefined([payload.primitive_count]));
  pushRowFixed(geometryRows, '可渲染', firstDefined([payload.renderable]), boolText);

  const semanticRows = buildSemanticRows(mappingStatus, normalized, provenance);

  return [
    { id: 'general', title: '常规', rows: commonRows, defaultOpen: true },
    { id: 'other', title: '其他', rows: otherRows, defaultOpen: true },
    { id: 'line_arrow', title: '直线和箭头', rows: lineArrowRows, defaultOpen: true },
    { id: 'text', title: '文字', rows: textRows, defaultOpen: true },
    { id: 'fit', title: '调整', rows: fitRows, defaultOpen: false },
    { id: 'primary_units', title: '主单位', rows: primaryUnitRows, defaultOpen: false },
    { id: 'alt_units', title: '换算单位', rows: altUnitRows, defaultOpen: false },
    { id: 'tolerance', title: '公差', rows: toleranceRows, defaultOpen: false },
    { id: 'geometry_debug', title: '几何(调试)', rows: geometryRows, defaultOpen: false },
    { id: 'semantic', title: '语义映射(调试)', rows: semanticRows, defaultOpen: false },
  ];
}

export function extractCadHandle(entity: Record<string, unknown>): string {
  const candidateHandle = [entity.handle, entity.raw_handle, entity.source_handle, entity.id]
    .map((value) => String(value ?? '').trim())
    .find((value) => value.length > 0);
  if (!candidateHandle) return '--';
  const base = candidateHandle.includes('@') ? candidateHandle.split('@', 1)[0] : candidateHandle;
  const cleaned = base.split('/').pop() || base;
  return cleaned.toUpperCase() || '--';
}

function asPrimitiveList(geom: Record<string, unknown>): DwgPrimitive[] {
  const raw = geom.primitives;
  if (!Array.isArray(raw)) return [];
  return raw as DwgPrimitive[];
}

function cadTypeLabelCn(type: string): string {
  const map: Record<string, string> = {
    LINE: '直线',
    POLYLINE: '多段线',
    SPLINE: '样条曲线',
    ARC: '圆弧',
    CIRCLE: '圆',
    ELLIPSE: '椭圆',
    TEXT: '单行文字',
    MTEXT: '多行文字',
    ATTRIB: '属性文字',
    ATTDEF: '属性定义',
    DIMENSION: '标注',
    INSERT: '块参照',
    BLOCK_REF: '块参照',
    HATCH: '填充',
    POINT: '点',
    LEADER: '引线',
    WIPEOUT: '遮挡',
  };
  return map[type] || type || '--';
}

function isTextLikeType(type: string): boolean {
  return ['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF', 'DIMENSION'].includes(type);
}

export function buildEntityPropertySections(entity: Record<string, unknown>): PropertySection[] {
  const geom = asRecord(entity.geom);
  const style = asRecord(entity.style);
  const normalized = asRecord(entity.normalized_semantics);
  const mappingStatus = asRecord(entity.mapping_status);
  const styleRef = asRecord(entity.style_ref);
  const provenance = asRecord(entity.provenance);
  const type = String(entity.type ?? '').trim().toUpperCase();

  if (type === 'DIMENSION') {
    return buildDimensionPropertySections(entity, geom, style, normalized, mappingStatus, provenance);
  }

  const generalRows: PropertyRow[] = [];
  const geometryRows: PropertyRow[] = [];
  const textRows: PropertyRow[] = [];
  const dimensionRows: PropertyRow[] = [];
  const blockRows: PropertyRow[] = [];
  const styleRows: PropertyRow[] = [];
  const semanticRows: PropertyRow[] = [];

  pushRow(generalRows, '句柄', extractCadHandle(entity));
  pushRow(generalRows, '实体ID', entity.id);
  pushRow(generalRows, '对象类型', cadTypeLabelCn(type));
  pushRow(generalRows, '原始类型', type);
  pushRow(generalRows, '语义子类', entity.semantic_subtype);
  pushRow(generalRows, '图层', entity.layer);
  pushRow(generalRows, '空间', entity.space_id);
  pushRow(generalRows, '上级块ID', entity.parent_block_id);
  pushRow(generalRows, '源ACDB类型', entity.source_acdb_type);

  const bbox = asRecord(entity.bbox);
  const bmin = asRecord(bbox.min);
  const bmax = asRecord(bbox.max);
  if (isFiniteNumber(bmin.x) && isFiniteNumber(bmin.y) && isFiniteNumber(bmax.x) && isFiniteNumber(bmax.y)) {
    const width = Math.abs(bmax.x - bmin.x);
    const height = Math.abs(bmax.y - bmin.y);
    pushRow(geometryRows, '包围框最小点', formatPointCompact(bmin));
    pushRow(geometryRows, '包围框最大点', formatPointCompact(bmax));
    pushRow(geometryRows, '包围框宽度', width, (v) => formatNumber(v, 4));
    pushRow(geometryRows, '包围框高度', height, (v) => formatNumber(v, 4));
  }

  if (type === 'LINE') {
    const start = asRecord(geom.start);
    const end = asRecord(geom.end);
    pushRow(geometryRows, '起点', formatPointCompact(start));
    pushRow(geometryRows, '终点', formatPointCompact(end));
    if (isFiniteNumber(start.x) && isFiniteNumber(start.y) && isFiniteNumber(end.x) && isFiniteNumber(end.y)) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      pushRow(geometryRows, '长度', Math.hypot(dx, dy), (v) => formatNumber(v, 4));
      pushRow(geometryRows, '角度(度)', (Math.atan2(dy, dx) * 180) / Math.PI, (v) => formatNumber(v, 3));
    }
  } else if (type === 'POLYLINE') {
    const vertices = Array.isArray(geom.vertices) ? geom.vertices : [];
    pushRow(geometryRows, '顶点数量', vertices.length);
    pushRow(geometryRows, '闭合', boolText(Boolean(geom.closed)));
    pushRow(geometryRows, '全局宽度', geom.global_width, (v) => formatNumber(v, 4));
    pushRow(geometryRows, '起始宽度', geom.start_width, (v) => formatNumber(v, 4));
    pushRow(geometryRows, '终止宽度', geom.end_width, (v) => formatNumber(v, 4));
  } else if (type === 'SPLINE') {
    const points = Array.isArray(geom.points) ? geom.points : [];
    pushRow(geometryRows, '控制点数量', points.length);
  } else if (type === 'CIRCLE') {
    const radius = Number(geom.radius);
    pushRow(geometryRows, '圆心', formatPointCompact(geom.center));
    pushRow(geometryRows, '半径', radius, (v) => formatNumber(v, 4));
    if (Number.isFinite(radius)) {
      pushRow(geometryRows, '直径', radius * 2, (v) => formatNumber(v, 4));
      pushRow(geometryRows, '周长', Math.PI * radius * 2, (v) => formatNumber(v, 4));
      pushRow(geometryRows, '面积', Math.PI * radius * radius, (v) => formatNumber(v, 4));
    }
  } else if (type === 'ARC') {
    pushRow(geometryRows, '圆心', formatPointCompact(geom.center));
    pushRow(geometryRows, '半径', geom.radius, (v) => formatNumber(v, 4));
    pushRow(geometryRows, '起始角', geom.start_angle, (v) => formatNumber(v, 3));
    pushRow(geometryRows, '终止角', geom.end_angle, (v) => formatNumber(v, 3));
  } else if (type === 'ELLIPSE') {
    pushRow(geometryRows, '中心点', formatPointCompact(geom.center));
    pushRow(geometryRows, '长轴半径', geom.rx, (v) => formatNumber(v, 4));
    pushRow(geometryRows, '短轴半径', geom.ry, (v) => formatNumber(v, 4));
    pushRow(geometryRows, '旋转角', geom.rotation, (v) => formatNumber(v, 3));
  } else if (type === 'HATCH') {
    pushRow(geometryRows, '填充图案', geom.pattern_name);
    pushRow(geometryRows, '实体填充', boolText(Boolean(geom.solid_fill)));
    pushRow(geometryRows, '边界环数量', Array.isArray(geom.loops) ? geom.loops.length : 0);
  } else if (type === 'POINT') {
    pushRow(geometryRows, '位置', formatPointCompact(geom.position));
  } else if (type === 'LEADER') {
    const points = Array.isArray(geom.points) ? geom.points : [];
    pushRow(geometryRows, '顶点数量', points.length);
    pushRow(geometryRows, '带箭头', boolText(Boolean(geom.has_arrowhead)));
    pushRow(geometryRows, '样条引线', boolText(Boolean(geom.splined)));
  }

  if (type === 'DIMENSION') {
    const payload = asRecord(geom.dimension_payload);
    pushRow(dimensionRows, '标注类型', payload.dim_kind ?? geom.dim_kind);
    pushRow(dimensionRows, '测量值', payload.measurement ?? geom.measurement, (v) => formatNumber(v, 4));
    pushRow(dimensionRows, '显示文字', payload.display_text ?? geom.text);
    pushRow(dimensionRows, '标注样式', payload.dimension_style ?? geom.dimension_style);
    pushRow(dimensionRows, '文字位置', formatPointCompact(payload.text_position ?? geom.text_position));
    pushRow(dimensionRows, '文字高度', payload.text_height ?? geom.text_height, (v) => formatNumber(v, 4));
    pushRow(dimensionRows, '文字旋转', payload.rotation ?? geom.rotation, (v) => formatNumber(v, 3));
    pushRow(dimensionRows, '箭头1', payload.arrow_block1 ?? geom.arrow_block1 ?? geom.arrow_block);
    pushRow(dimensionRows, '箭头2', payload.arrow_block2 ?? geom.arrow_block2 ?? geom.arrow_block);
    pushRow(dimensionRows, '箭头尺寸', payload.arrow_size ?? geom.arrow_size, (v) => formatNumber(v, 4));
    pushColorRowFixed(dimensionRows, '文字颜色', payload.text_color ?? geom.text_color);
    pushRow(dimensionRows, '文字背景遮罩', boolText(Boolean(payload.text_mask ?? geom.text_mask)));
    pushColorRowFixed(dimensionRows, '遮罩颜色', payload.text_mask_color ?? geom.text_mask_color);
  }

  if (type === 'BLOCK_REF' || type === 'INSERT') {
    pushRow(blockRows, '块名称', geom.block_name);
    pushRow(blockRows, '插入点', formatPointCompact(geom.position));
    pushRow(blockRows, '缩放', formatScaleCompact(geom.scale));
    pushRow(blockRows, '旋转角', geom.rotation, (v) => formatNumber(v, 3));
    if (Array.isArray(entity.instance_path) && entity.instance_path.length > 0) {
      pushRow(blockRows, '实例路径', entity.instance_path.join('/'));
    }
  }

  const primitives = asPrimitiveList(geom);
  const textPrimitive = primitives.find((primitive) => primitive.kind === 'text') as Extract<DwgPrimitive, { kind: 'text' }> | undefined;
  if (isTextLikeType(type) || textPrimitive) {
    const rawText = firstNonEmptyString([
      geom.text,
      geom.contents,
      geom.plain_text,
      geom.value,
      asRecord(geom.dimension_payload).display_text,
      textPrimitive?.text,
    ]);
    if (rawText) pushRow(textRows, '文字内容', cleanCadText(rawText) || rawText);
    pushRow(textRows, '文字位置', formatPointCompact(geom.position ?? geom.text_position ?? textPrimitive?.position));
    pushRow(textRows, '文字样式', firstNonEmptyString([geom.style_name, geom.text_style, textPrimitive?.font_style_name]));
    pushRow(textRows, '文字高度', geom.actual_height ?? geom.height ?? geom.text_height ?? textPrimitive?.actual_height, (v) => formatNumber(v, 4));
    pushRow(textRows, '旋转角', geom.rotation ?? textPrimitive?.rotation, (v) => formatNumber(v, 3));
    pushRow(textRows, '宽度因子', geom.width_factor ?? textPrimitive?.width_factor, (v) => formatNumber(v, 3));
    pushRow(textRows, '倾斜角', geom.oblique ?? textPrimitive?.oblique, (v) => formatNumber(v, 3));
    pushRow(textRows, '字体名称', firstNonEmptyString([geom.font_name, textPrimitive?.font_name]));
    pushRow(textRows, '字体族', firstNonEmptyString([geom.font_family, textPrimitive?.font_family]));
    pushRow(textRows, '字体类型', firstNonEmptyString([geom.font_kind, textPrimitive?.font_kind]), (v) => String(v).toUpperCase());
    pushRow(textRows, '背景遮罩', boolText(Boolean(geom.text_mask ?? textPrimitive?.text_mask)));
    pushColorRowFixed(textRows, '遮罩颜色', geom.text_mask_color ?? textPrimitive?.text_mask_color);
    pushColorRowFixed(textRows, '文字颜色', geom.text_color ?? textPrimitive?.color);
  }

  pushColorRowFixed(
    styleRows,
    '颜色',
    firstDefined([style.effective_color_rgb, normalized.color_rgb, style.color_rgb, style.effective_color, style.color])
  );
  pushRow(styleRows, '色号(ACI)', style.effective_color_index ?? style.color_index ?? normalized.color_index);
  pushRow(styleRows, '线型', style.linetype ?? normalized.linetype);
  pushRow(styleRows, '线宽', style.lineweight);
  pushRow(styleRows, '有效线宽(mm)', style.effective_lineweight_mm ?? normalized.lineweight_mm, (v) => formatNumber(v, 3));
  pushRow(styleRows, '颜色来源', style.effective_color_source);
  pushRow(styleRows, '线宽来源', style.effective_lineweight_source);
  pushRow(styleRows, '文字样式引用', styleRef.text_style ?? normalized.text_style);
  pushRow(styleRows, '标注样式引用', styleRef.dim_style ?? normalized.dimension_style);

  semanticRows.push(...buildSemanticRows(mappingStatus, normalized, provenance));

  const sections: PropertySection[] = [
    { id: 'general', title: '常规', rows: generalRows, defaultOpen: true },
    { id: 'geometry', title: '几何', rows: geometryRows, defaultOpen: true },
    { id: 'text', title: '文字', rows: textRows, defaultOpen: true },
    { id: 'dimension', title: '标注', rows: dimensionRows, defaultOpen: true },
    { id: 'block', title: '块', rows: blockRows, defaultOpen: true },
    { id: 'style', title: '样式', rows: styleRows, defaultOpen: true },
    { id: 'semantic', title: '语义映射(调试)', rows: semanticRows, defaultOpen: false },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

export function buildMultiEntityPropertySections(entities: Record<string, unknown>[]): PropertySection[] {
  if (!entities.length) return [];
  if (entities.length === 1) return buildEntityPropertySections(entities[0]);

  const perEntitySections = entities.map((entity) => buildEntityPropertySections(entity));
  const sectionIds: string[] = [];
  const sectionTitles = new Map<string, string>();
  const defaultOpen = new Map<string, boolean | undefined>();

  for (const sections of perEntitySections) {
    for (const section of sections) {
      if (!sectionIds.includes(section.id)) sectionIds.push(section.id);
      if (!sectionTitles.has(section.id)) sectionTitles.set(section.id, section.title);
      if (!defaultOpen.has(section.id)) defaultOpen.set(section.id, section.defaultOpen);
    }
  }

  return sectionIds
    .map((sectionId): PropertySection => {
      const rowMaps = perEntitySections.map((sections) => {
        const section = sections.find((candidate) => candidate.id === sectionId);
        const rows = new Map<string, string>();
        for (const row of section?.rows ?? []) rows.set(row.key, row.value);
        return rows;
      });

      const keys: string[] = [];
      for (const rows of rowMaps) {
        for (const key of rows.keys()) {
          if (!keys.includes(key)) keys.push(key);
        }
      }

      const rows = keys.map((key): PropertyRow => {
        const values = rowMaps.map((rowMap) => rowMap.get(key) ?? '--');
        const same = values.every((value) => value === values[0]);
        return { key, value: same ? values[0] : '*多种*' };
      });

      if (sectionId === 'general') {
        const types = new Set(entities.map((entity) => String(entity.type || '--').toUpperCase()));
        const typeValue = types.size === 1 ? Array.from(types)[0] : '*多种*';
        return {
          id: sectionId,
          title: sectionTitles.get(sectionId) ?? '常规',
          rows: [
            { key: '选择数量', value: String(entities.length) },
            { key: '对象类型', value: typeValue },
            ...rows.filter((row) => row.key !== '选择数量' && row.key !== '对象类型'),
          ],
          defaultOpen: defaultOpen.get(sectionId),
        };
      }

      return {
        id: sectionId,
        title: sectionTitles.get(sectionId) ?? sectionId,
        rows,
        defaultOpen: defaultOpen.get(sectionId),
      };
    })
    .filter((section) => section.rows.length > 0);
}
