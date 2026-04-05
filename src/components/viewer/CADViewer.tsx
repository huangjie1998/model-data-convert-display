import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Crosshair, Hand, Layers, LocateFixed, Maximize, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  closeDwgDocument,
  getDwgEntity,
  listDwgEntities,
  listDwgFonts,
  listDwgHierarchy,
  listDwgSpaces,
  measureDwg,
  openDwgDocument,
  pickDwgEntity,
  snapDwgPoint,
  updateDwgView,
  type DwgHierarchyNode,
  type DwgDocFont,
  type DwgPrimitive,
  type DwgEntityLite,
  type DwgSpace,
  type DwgOpenResponse,
} from '@/services/dwgApi';

interface CADViewerProps {
  rawFile: File | null;
  fileName?: string;
}

type ViewerMode = 'select' | 'measure';
type SelectionScope = 'block' | 'entity';
type BoxSelectModifier = 'replace' | 'add' | 'toggle';

interface WorldPoint {
  x: number;
  y: number;
  z?: number;
}

interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CanvasMetrics {
  width: number;
  height: number;
  dpr: number;
}

interface CachedLineMetrics {
  advance: number;
  leftOverhang: number;
  rightOverhang: number;
  ascent: number;
  descent: number;
}

interface ShxDebugMatch {
  vectorizeTextEntityCount: number;
  vectorizeTextKeysCount: number;
  vectorizePrimitivesTotal: number;
  shapeFileTextTrueCount: number;
  attachCandidateEntityCount: number;
  matchedEntityCount: number;
  unmatchedEntityCount: number;
  noVectorizePayloadCount: number;
  keyMismatchCount: number;
  filteredByFontKindCount: number;
  emptyAfterOptimizeCount: number;
  filteredNonShxCount: number;
  vectorizeCacheHit: boolean;
  vectorizeError: string | null;
  vectorizeTextKeySamples: string[];
  unmatchedKeySamples: string[];
  orphanVectorizeKeySamples: string[];
  keyMismatchSamples: Array<{
    entityId: string;
    handle: string;
    instancePath: string[];
    candidateKeys: string[];
  }>;
}

interface ShxRenderStatus {
  detected: boolean;
  outlineMode: 'none' | 'oda_vectorize' | 'stub' | 'disabled' | string;
  trueOutline: boolean;
  vectorizeAttempted: boolean;
  vectorizeAttachedCount: number;
  vectorizeError: string | null;
  fallbackTextCount: number;
  vectorizeAvailable: boolean;
  missingOriginalShxFonts: string[];
  resolvedOriginalShxFonts: string[];
  fallbackShxFile: string | null;
  fallbackHitCount: number;
  diagnosticsUnavailable: boolean;
  debugMatch: ShxDebugMatch | null;
}

interface WarningLineItem {
  id: string;
  text: string;
  kind: 'normal' | 'shx_diagnostic';
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPoint(value: unknown): value is WorldPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return isFiniteNumber(p.x) && isFiniteNumber(p.y);
}

function formatNumber(v: number | undefined, digits = 3): string {
  if (v === undefined || Number.isNaN(v)) return '--';
  return v.toFixed(digits);
}

function formatPointCompact(p: unknown, digits = 3): string | null {
  if (!isPoint(p)) return null;
  const z = typeof p.z === 'number' && Number.isFinite(p.z) ? `, ${formatNumber(p.z, digits)}` : '';
  return `(${formatNumber(p.x, digits)}, ${formatNumber(p.y, digits)}${z})`;
}

function boolToCn(v: unknown): string {
  return Boolean(v) ? '是' : '否';
}

function snapModeToCn(modeRaw: unknown): string {
  const m = String(modeRaw || '').toLowerCase();
  if (m === 'endpoint') return '端点';
  if (m === 'midpoint') return '中点';
  if (m === 'center') return '圆心';
  if (!m) return '--';
  return m;
}

function normalizeLayerName(layerRaw: unknown): string {
  const layer = String(layerRaw ?? '').trim();
  return layer || '0';
}

interface PropertyRow {
  key: string;
  value: string;
}

interface PropertySection {
  id: 'general' | 'geometry' | 'text' | 'style';
  title: string;
  rows: PropertyRow[];
  defaultOpen?: boolean;
}

const PICK_BOX_SIZE_PX = 10;
const BLOCK_PICK_BOX_SIZE_PX = 6;
const PICK_TOLERANCE_FACTORS = [0.65, 0.9, 1.1] as const;
const BOX_SELECT_DRAG_THRESHOLD_PX = 4;
const CAD_TEXT_FALLBACK_FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
const DEFAULT_NORMAL_LINEWEIGHT_MM = 0.25;
const NORMAL_LINEWEIGHT_MM_TO_PX = 2.2; // 中等基准：1mm -> 2.2px（固定屏幕线宽）
const NORMAL_LINEWEIGHT_MIN_PX = 0.9;
const NORMAL_LINEWEIGHT_MAX_PX = 16;
const GEOMETRIC_LINEWEIGHT_MIN_PX = 0.55;
const GEOMETRIC_LINEWEIGHT_MAX_PX = 220;
const DEFAULT_SHX_RENDER_STATUS: ShxRenderStatus = {
  detected: false,
  outlineMode: 'none',
  trueOutline: false,
  vectorizeAttempted: false,
  vectorizeAttachedCount: 0,
  vectorizeError: null,
  fallbackTextCount: 0,
  vectorizeAvailable: false,
  missingOriginalShxFonts: [],
  resolvedOriginalShxFonts: [],
  fallbackShxFile: null,
  fallbackHitCount: 0,
  diagnosticsUnavailable: false,
  debugMatch: null,
};

function sanitizeCssFontFamily(raw: unknown): string {
  const s = String(raw || '').trim().replace(/['"]/g, '');
  return s;
}

function buildCadTextFontFamily(primary: unknown): string {
  const p = sanitizeCssFontFamily(primary);
  if (!p) return CAD_TEXT_FALLBACK_FONT;
  return `"${p}", ${CAD_TEXT_FALLBACK_FONT}`;
}

function _sanitizeFontKeyUi(raw: unknown): string {
  const token = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return token || '';
}

function boxSelectModifierFromEvent(event: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>): BoxSelectModifier {
  if (event.ctrlKey || event.metaKey) return 'toggle';
  if (event.shiftKey) return 'add';
  return 'replace';
}

function buildFileKey(file: File | null): string | null {
  if (!file) return null;
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function extractCadHandleAndPath(entity: Record<string, unknown>): { handle: string; instancePath: string | null; internalId: string | null } {
  const internalId = String(entity.id ?? '').trim() || null;
  const candidateHandle = [entity.handle, entity.raw_handle, entity.source_handle, entity.id]
    .map((v) => String(v ?? '').trim())
    .find((v) => v.length > 0);

  const idRaw = candidateHandle || '';
  const atIndex = idRaw.indexOf('@');
  const base = atIndex >= 0 ? idRaw.slice(0, atIndex) : idRaw;
  const instancePath = atIndex >= 0 ? idRaw.slice(atIndex + 1).trim() || null : null;
  const cleanedBase = base.split('/').pop() || base;
  const handle = cleanedBase ? cleanedBase.toUpperCase() : '--';

  return { handle, instancePath, internalId };
}

function isTextLikeTypeName(typeRaw: unknown): boolean {
  const t = String(typeRaw || '').toUpperCase();
  return t === 'TEXT' || t === 'MTEXT' || t === 'ATTRIB' || t === 'ATTDEF' || t === 'DIMENSION';
}

function isBlockRefType(typeRaw: unknown): boolean {
  return String(typeRaw || '').toUpperCase() === 'BLOCK_REF';
}

function isTextLikeEntityLite(entity: DwgEntityLite): boolean {
  if (isTextLikeTypeName(entity.type)) return true;
  const geom = entity.geom as Record<string, unknown> | undefined;
  const primitives = asPrimitiveList((geom || {}) as Record<string, unknown>);
  return primitives.some((p) => p.kind === 'text');
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t) return t;
  }
  return null;
}

function toUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const t = String(item ?? '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function toNonNegativeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeShxDebugMatch(raw: unknown): ShxDebugMatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const vectorizeError = String(obj.vectorize_error ?? '').trim();
  const keyMismatchSamplesRaw = Array.isArray(obj.key_mismatch_samples) ? obj.key_mismatch_samples : [];
  const keyMismatchSamples = keyMismatchSamplesRaw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .slice(0, 10)
    .map((item) => ({
      entityId: String(item.entity_id ?? '').trim(),
      handle: String(item.handle ?? '').trim(),
      instancePath: toUniqueStringList(item.instance_path),
      candidateKeys: toUniqueStringList(item.candidate_keys),
    }));
  return {
    vectorizeTextEntityCount: toNonNegativeInt(obj.vectorize_text_entity_count),
    vectorizeTextKeysCount: toNonNegativeInt(obj.vectorize_text_keys_count),
    vectorizePrimitivesTotal: toNonNegativeInt(obj.vectorize_primitives_total),
    shapeFileTextTrueCount: toNonNegativeInt(obj.shape_file_text_true_count),
    attachCandidateEntityCount: toNonNegativeInt(obj.attach_candidate_entity_count),
    matchedEntityCount: toNonNegativeInt(obj.matched_entity_count),
    unmatchedEntityCount: toNonNegativeInt(obj.unmatched_entity_count),
    noVectorizePayloadCount: toNonNegativeInt(obj.no_vectorize_payload_count),
    keyMismatchCount: toNonNegativeInt(obj.key_mismatch_count),
    filteredByFontKindCount: toNonNegativeInt(obj.filtered_by_font_kind_count),
    emptyAfterOptimizeCount: toNonNegativeInt(obj.empty_after_optimize_count),
    filteredNonShxCount: toNonNegativeInt(obj.filtered_non_shx_count),
    vectorizeCacheHit: Boolean(obj.vectorize_cache_hit),
    vectorizeError: vectorizeError || null,
    vectorizeTextKeySamples: toUniqueStringList(obj.vectorize_text_key_samples),
    unmatchedKeySamples: toUniqueStringList(obj.unmatched_key_samples),
    orphanVectorizeKeySamples: toUniqueStringList(obj.orphan_vectorize_key_samples),
    keyMismatchSamples,
  };
}

function resolveShxRenderStatus(opened: DwgOpenResponse): ShxRenderStatus {
  const raw = opened.shx_status;
  const outlineMode = String(raw?.outline_mode ?? opened.shx_outline_mode ?? 'none');
  const vectorizeAttachedCountRaw = Number(raw?.vectorize_attached_count);
  const fallbackTextCountRaw = Number(raw?.fallback_text_count);
  const vectorizeAttachedCount = Number.isFinite(vectorizeAttachedCountRaw) ? Math.max(0, vectorizeAttachedCountRaw) : 0;
  const fallbackTextCount = Number.isFinite(fallbackTextCountRaw) ? Math.max(0, fallbackTextCountRaw) : 0;
  const fallbackHitCountRaw = Number(raw?.fallback_hit_count);
  const fallbackHitCount = Number.isFinite(fallbackHitCountRaw) ? Math.max(0, fallbackHitCountRaw) : 0;
  const trueOutline = Boolean(raw?.true_outline) || (outlineMode === 'oda_vectorize' && vectorizeAttachedCount > 0 && fallbackTextCount === 0);
  const vectorizeErrorText = String(raw?.vectorize_error ?? '').trim();
  const missingOriginalShxFonts = toUniqueStringList(raw?.missing_original_shx_fonts);
  const resolvedOriginalShxFonts = toUniqueStringList(raw?.resolved_original_shx_fonts);
  const fallbackShxFile = String(raw?.fallback_shx_file ?? '').trim() || null;
  const debugMatch = normalizeShxDebugMatch(raw?.debug_match);
  return {
    detected: Boolean(raw?.detected) || fallbackTextCount > 0,
    outlineMode,
    trueOutline,
    vectorizeAttempted: Boolean(raw?.vectorize_attempted),
    vectorizeAttachedCount,
    vectorizeError: vectorizeErrorText ? vectorizeErrorText : null,
    fallbackTextCount,
    vectorizeAvailable: Boolean(raw?.vectorize_available),
    missingOriginalShxFonts,
    resolvedOriginalShxFonts,
    fallbackShxFile,
    fallbackHitCount,
    diagnosticsUnavailable: Boolean(raw?.diagnostics_unavailable),
    debugMatch,
  };
}

function isShxFallbackText(status: ShxRenderStatus, fontKindRaw: unknown): boolean {
  const fontKind = String(fontKindRaw || '').trim().toLowerCase();
  if (fontKind !== 'shx') return false;
  if (status.trueOutline) return false;
  return true;
}

function truncateCadLine(line: string, maxChars: number): string {
  if (!line || line.length <= maxChars) return line;
  return `${line.slice(0, maxChars)}...`;
}

function translateDwgWarningToCn(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  if (/^SHX ODA outline extraction produced no matched text entities; fallback to stroke emulation\.?$/i.test(text)) {
    return 'SHX 轮廓提取未匹配到可替换文字实体，已回退为笔画模拟渲染。';
  }
  const shxFailed = text.match(/^SHX ODA outline extraction failed \((.+)\); fallback to stroke emulation\.?$/i);
  if (shxFailed) {
    return `SHX 轮廓提取失败（${shxFailed[1]}），已回退为笔画模拟渲染。`;
  }
  if (/^OdVectorizeEx not configured\/found; SHX uses stroke outline emulation\.?$/i.test(text)) {
    return '未配置或未找到 OdVectorizeEx，SHX 将使用笔画模拟渲染。';
  }
  if (/^ODA parser loaded the DWG but did not extract supported entities yet\.?$/i.test(text)) {
    return 'ODA 已加载 DWG，但尚未提取到可显示的受支持图元。';
  }
  if (/^SHX font file not found on server\.?$/i.test(text)) {
    return 'SHX 字体文件在服务器未找到。';
  }
  if (/^Font file not found on server\.?$/i.test(text)) {
    return '字体文件在服务器未找到。';
  }
  if (/^Remote DWG core did not expose \/fonts endpoint\.?$/i.test(text)) {
    return '远端 DWG 内核未提供 /fonts 接口，无法返回字体明细。';
  }
  if (/^Current file is not a DWG document\.?$/i.test(text)) {
    return '当前文件不是 DWG 图纸。';
  }

  return text;
}
function normalizeWarningsForUi(warningsRaw: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of warningsRaw) {
    const localized = translateDwgWarningToCn(raw).trim();
    if (!localized) continue;
    if (seen.has(localized)) continue;
    seen.add(localized);
    out.push(localized);
  }
  return out;
}

function parseMissingFontWarningForUi(warningRaw: string): { title: string; items: string[] } | null {
  const warning = String(warningRaw || '').trim();
  let title = '';
  let detail = '';
  if (warning.startsWith('以下字体文件在服务器未找到')) {
    title = '字体缺失名单';
    detail = warning.replace(/^以下字体文件在服务器未找到[:：]?/, '').trim();
    detail = detail.replace(/。?已按可用字体或降级策略渲染。?$/, '').trim();
  } else if (warning.startsWith('未命中原始 SHX 字体')) {
    title = 'SHX未命中名单';
    detail = warning.replace(/^未命中原始 SHX 字体[:：]?/, '').trim();
    detail = detail
      .replace(/。?已使用后备字体.*$/, '')
      .replace(/。?未检测到后备 SHX 字体。?$/, '')
      .trim();
  } else {
    return null;
  }

  if (!detail) return { title, items: [] };

  const normalized = detail.replace(/[，；]/g, ';');
  const rawItems = normalized
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const items =
    title === 'SHX未命中名单' && rawItems.length === 1
      ? rawItems[0]
          .split('、')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : rawItems;
  return { title, items };
}
function buildShxFontDiagnosticFromDocFonts(status: ShxRenderStatus, fonts: DwgDocFont[]): string | null {
  if (!status.detected || status.trueOutline) return null;

  if (status.missingOriginalShxFonts.length > 0) {
    const shown = status.missingOriginalShxFonts.slice(0, 8);
    const suffix = status.missingOriginalShxFonts.length > 8 ? ` 等${status.missingOriginalShxFonts.length}项` : '';
    const fallbackNote = status.fallbackShxFile ? `，已使用后备字体 ${status.fallbackShxFile}` : '';
    return `SHX 字体诊断：未命中原始 SHX 字体 ${shown.join('、')}${suffix}${fallbackNote}。`;
  }

  if (status.diagnosticsUnavailable) {
    return 'SHX 字体诊断：远端未提供完整字体诊断信息，当前降级可能由轮廓匹配失败或字体未命中导致。';
  }

  const shxFonts = fonts.filter((f) => String(f.kind || '').trim().toLowerCase() === 'shx');
  if (!shxFonts.length) {
    return 'SHX 字体诊断：未获取到 SHX 字体明细，当前降级可能是轮廓匹配失败或远端未返回字体信息。';
  }

  const missing: string[] = [];
  const found: string[] = [];
  const seenMissing = new Set<string>();
  const seenFound = new Set<string>();
  let fallbackFileName: string | null = status.fallbackShxFile;

  for (const font of shxFonts) {
    const label = String(font.name || font.style_name || font.key || '').trim() || '未命名SHX';
    const reason = String(font.reason || '').toLowerCase();
    const fallbackHit = Boolean(font.fallback_shx_hit);
    const fallbackFile = String(font.fallback_shx_file_name || '').trim();
    if (!fallbackFileName && fallbackFile) fallbackFileName = fallbackFile;
    const looksMissing = fallbackHit || !font.available || reason.includes('not found') || reason.includes('未找到');
    if (looksMissing) {
      if (!seenMissing.has(label)) {
        seenMissing.add(label);
        missing.push(label);
      }
      continue;
    }
    if (!seenFound.has(label)) {
      seenFound.add(label);
      found.push(label);
    }
  }

  if (missing.length > 0) {
    const shown = missing.slice(0, 8);
    const suffix = missing.length > 8 ? ` 等${missing.length}项` : '';
    const fallbackNote = fallbackFileName ? `，已使用后备字体 ${fallbackFileName}` : '';
    return `SHX 字体诊断：未命中原始 SHX 字体 ${shown.join('、')}${suffix}${fallbackNote}。`;
  }

  const foundShown = found.slice(0, 6);
  const foundText = foundShown.length > 0 ? `（已识别 ${foundShown.join('、')}）` : '';
  return `SHX 字体诊断：未发现缺失 SHX 字体${foundText}，当前降级更可能由轮廓匹配失败导致。`;
}

function getEntityPropertySections(entity: Record<string, unknown>): PropertySection[] {
  const generalRows: PropertyRow[] = [];
  const geometryRows: PropertyRow[] = [];
  const textRows: PropertyRow[] = [];
  const styleRows: PropertyRow[] = [];

  const type = String(entity.type || '').toUpperCase();
  const layer = String(entity.layer || '--');
  const space = String(entity.space_id || '--');
  const { handle, instancePath, internalId } = extractCadHandleAndPath(entity);
  const style = (entity.style && typeof entity.style === 'object' ? (entity.style as Record<string, unknown>) : {}) || {};
  const geom = (entity.geom && typeof entity.geom === 'object' ? (entity.geom as Record<string, unknown>) : {}) || {};

  generalRows.push({ key: '句柄', value: handle });
  generalRows.push({ key: '类型', value: type || '--' });
  generalRows.push({ key: '图层', value: layer });
  generalRows.push({ key: '空间', value: space });
  if (instancePath) generalRows.push({ key: '实例路径', value: instancePath });
  if (internalId) {
    const internalUpper = internalId.toUpperCase();
    if (internalUpper !== handle && !internalUpper.startsWith(`${handle}@`)) {
      generalRows.push({ key: '内部ID', value: internalId });
    }
  }
  if (geom.source_type !== undefined) generalRows.push({ key: '源类型', value: String(geom.source_type) });

  const color = String(style.effective_color ?? style.color ?? '--');
  const colorIndex = style.effective_color_index ?? style.color_index ?? '--';
  const linetype = String(style.linetype ?? '--');
  const lineweight = String(style.lineweight ?? '--');
  styleRows.push({ key: '颜色', value: color });
  styleRows.push({ key: '色号(ACI)', value: String(colorIndex) });
  styleRows.push({ key: '线型', value: linetype });
  styleRows.push({ key: '线宽', value: lineweight });
  const effectiveLineweightMm = toPositiveFiniteNumber(style.effective_lineweight_mm);
  if (effectiveLineweightMm) styleRows.push({ key: '有效线宽(mm)', value: formatNumber(effectiveLineweightMm, 3) });
  if (style.effective_lineweight_source !== undefined) {
    styleRows.push({ key: '线宽来源', value: String(style.effective_lineweight_source) });
  }
  if (style.effective_color_source !== undefined) {
    styleRows.push({ key: '颜色来源', value: String(style.effective_color_source) });
  }

  if (type === 'BLOCK_REF') {
    geometryRows.push({ key: '块名称', value: String(geom.block_name ?? '--') });
    const p = formatPointCompact(geom.position);
    if (p) geometryRows.push({ key: '插入点', value: p });
    if (geom.rotation !== undefined) geometryRows.push({ key: '旋转角', value: formatNumber(Number(geom.rotation), 3) });
    const scale = geom.scale && typeof geom.scale === 'object' ? (geom.scale as Record<string, unknown>) : null;
    if (scale) {
      const sx = Number(scale.x);
      const sy = Number(scale.y);
      const sz = Number(scale.z);
      if (Number.isFinite(sx) || Number.isFinite(sy) || Number.isFinite(sz)) {
        geometryRows.push({
          key: '缩放',
          value: `${Number.isFinite(sx) ? formatNumber(sx, 4) : '--'}, ${Number.isFinite(sy) ? formatNumber(sy, 4) : '--'}, ${
            Number.isFinite(sz) ? formatNumber(sz, 4) : '--'
          }`,
        });
      }
    }
    if (geom.insert_handle !== undefined) generalRows.push({ key: '插入句柄', value: String(geom.insert_handle) });
  } else if (type === 'LINE') {
    const s = formatPointCompact(geom.start);
    const e = formatPointCompact(geom.end);
    if (s) geometryRows.push({ key: '起点', value: s });
    if (e) geometryRows.push({ key: '终点', value: e });
    if (isPoint(geom.start) && isPoint(geom.end)) {
      const dx = geom.end.x - geom.start.x;
      const dy = geom.end.y - geom.start.y;
      geometryRows.push({ key: '长度', value: formatNumber(Math.hypot(dx, dy), 4) });
    }
  } else if (type === 'POLYLINE' || type === 'SPLINE') {
    const pts = Array.isArray(geom.vertices) ? geom.vertices : Array.isArray(geom.points) ? geom.points : [];
    geometryRows.push({ key: '顶点数', value: String(pts.length) });
    if (type === 'POLYLINE') {
      geometryRows.push({ key: '闭合', value: boolToCn(geom.closed) });
      const startW = toPositiveFiniteNumber(geom.start_width);
      const endW = toPositiveFiniteNumber(geom.end_width);
      const globalW = toPositiveFiniteNumber(geom.global_width);
      if (globalW) geometryRows.push({ key: '几何线宽', value: `${formatNumber(globalW, 3)}` });
      if (startW) geometryRows.push({ key: '起始宽度', value: formatNumber(startW, 3) });
      if (endW) geometryRows.push({ key: '终止宽度', value: formatNumber(endW, 3) });
    }
  } else if (type === 'CIRCLE') {
    const c = formatPointCompact(geom.center);
    if (c) geometryRows.push({ key: '中心点', value: c });
    geometryRows.push({ key: '半径', value: formatNumber(Number(geom.radius), 4) });
  } else if (type === 'ARC') {
    const c = formatPointCompact(geom.center);
    if (c) geometryRows.push({ key: '中心点', value: c });
    geometryRows.push({ key: '半径', value: formatNumber(Number(geom.radius), 4) });
    geometryRows.push({ key: '起始角', value: formatNumber(Number(geom.start_angle), 3) });
    geometryRows.push({ key: '终止角', value: formatNumber(Number(geom.end_angle), 3) });
  } else if (type === 'ELLIPSE') {
    const c = formatPointCompact(geom.center);
    if (c) geometryRows.push({ key: '中心点', value: c });
    geometryRows.push({ key: '长轴半径', value: formatNumber(Number(geom.rx), 4) });
    geometryRows.push({ key: '短轴半径', value: formatNumber(Number(geom.ry), 4) });
    geometryRows.push({ key: '旋转角', value: formatNumber(Number(geom.rotation), 3) });
  } else if (type === 'DIMENSION') {
    const p = formatPointCompact(geom.text_position);
    if (p) geometryRows.push({ key: '文本位置', value: p });
    if (geom.measurement !== undefined) geometryRows.push({ key: '标注值', value: formatNumber(Number(geom.measurement), 4) });
    geometryRows.push({ key: '标注类型', value: String(geom.dim_kind ?? '--') });
    const dimText = firstNonEmptyString([geom.text]);
    if (dimText) textRows.push({ key: '文字内容', value: cleanCadText(dimText) || dimText });
  } else if (type === 'LEADER') {
    const pts = Array.isArray(geom.points) ? geom.points : [];
    geometryRows.push({ key: '顶点数', value: String(pts.length) });
    geometryRows.push({ key: '箭头', value: boolToCn(geom.has_arrowhead) });
    geometryRows.push({ key: '样条', value: boolToCn(geom.splined) });
  } else if (type === 'HATCH') {
    const loops = Array.isArray(geom.loops) ? geom.loops : [];
    geometryRows.push({ key: '填充图案', value: String(geom.pattern_name ?? '--') });
    geometryRows.push({ key: '实体填充', value: boolToCn(geom.solid_fill) });
    geometryRows.push({ key: '环数量', value: String(loops.length) });
  } else if (type === 'POINT') {
    const p = formatPointCompact(geom.position);
    if (p) geometryRows.push({ key: '位置', value: p });
  } else if (type === 'WIPEOUT') {
    const vs = Array.isArray(geom.vertices) ? geom.vertices : [];
    geometryRows.push({ key: '顶点数', value: String(vs.length) });
  }

  const primitives = asPrimitiveList(geom);
  const textPrimitive = primitives.find((p): p is Extract<DwgPrimitive, { kind: 'text' }> => p.kind === 'text');
  const isTextLikeType = type === 'TEXT' || type === 'MTEXT' || type === 'ATTRIB' || type === 'ATTDEF';
  if (isTextLikeType || textPrimitive) {
    const rawText = firstNonEmptyString([geom.text, geom.contents, geom.plain_text, geom.value, textPrimitive?.text]);
    const cleanText = rawText ? cleanCadText(rawText) : '';
    if (rawText) {
      textRows.push({ key: '文字内容', value: cleanText || rawText });
    } else {
      textRows.push({ key: '文字内容', value: '--' });
    }
    const textPos = formatPointCompact(geom.position ?? geom.text_position ?? textPrimitive?.position);
    if (textPos) textRows.push({ key: '位置', value: textPos });
    const textStyle = firstNonEmptyString([String(geom.style_name ?? ''), String(geom.text_style ?? '')]);
    if (textStyle) textRows.push({ key: '文字样式', value: textStyle });
    const textHeightRaw = Number(geom.actual_height ?? geom.height ?? textPrimitive?.actual_height ?? textPrimitive?.height);
    if (Number.isFinite(textHeightRaw)) textRows.push({ key: '文字高度', value: formatNumber(textHeightRaw, 4) });
    const textRotationRaw = Number(geom.rotation ?? textPrimitive?.rotation);
    if (Number.isFinite(textRotationRaw)) textRows.push({ key: '旋转角', value: formatNumber(textRotationRaw, 3) });
    const widthFactorRaw = Number(geom.width_factor ?? textPrimitive?.width_factor);
    if (Number.isFinite(widthFactorRaw)) textRows.push({ key: '宽度比例', value: formatNumber(widthFactorRaw, 3) });
    const obliqueRaw = Number(geom.oblique ?? textPrimitive?.oblique);
    if (Number.isFinite(obliqueRaw)) textRows.push({ key: '倾斜角', value: formatNumber(obliqueRaw, 3) });
    const alignH = firstNonEmptyString([String(geom.horizontal_mode ?? ''), String(textPrimitive?.horizontal_mode ?? '')]);
    if (alignH) textRows.push({ key: '水平对齐', value: alignH });
    const alignV = firstNonEmptyString([String(geom.vertical_mode ?? ''), String(textPrimitive?.vertical_mode ?? '')]);
    if (alignV) textRows.push({ key: '垂直对齐', value: alignV });
    if (textPrimitive?.attachment) textRows.push({ key: '附着点', value: textPrimitive.attachment });
    if (typeof textPrimitive?.is_mtext === 'boolean') textRows.push({ key: '多行文字', value: boolToCn(textPrimitive.is_mtext) });
    const fontFamily = firstNonEmptyString([String(geom.font_family ?? ''), String(textPrimitive?.font_family ?? '')]);
    const fontName = firstNonEmptyString([String(geom.font_name ?? ''), String(textPrimitive?.font_name ?? '')]);
    const fontKind = firstNonEmptyString([String(geom.font_kind ?? ''), String(textPrimitive?.font_kind ?? '')]);
    const fontSource = firstNonEmptyString([String(geom.font_source ?? ''), String(textPrimitive?.font_source ?? '')]);
    if (fontFamily) textRows.push({ key: '字体族', value: fontFamily });
    if (fontName) textRows.push({ key: '字体名称', value: fontName });
    if (fontKind) textRows.push({ key: '字体类型', value: fontKind.toUpperCase() });
    if (fontSource) textRows.push({ key: '字体来源', value: fontSource });
  }

  return [
    { id: 'general', title: '常规', rows: generalRows, defaultOpen: true },
    { id: 'geometry', title: '几何', rows: geometryRows, defaultOpen: true },
    { id: 'text', title: '文字', rows: textRows, defaultOpen: true },
    { id: 'style', title: '样式', rows: styleRows, defaultOpen: true },
  ];
}

function buildMultiEntityPropertySections(entities: Record<string, unknown>[]): PropertySection[] {
  if (!entities.length) return [];
  if (entities.length === 1) return getEntityPropertySections(entities[0]);

  const sectionOrder: Array<PropertySection['id']> = ['general', 'geometry', 'text', 'style'];
  const sectionTitle: Record<PropertySection['id'], string> = {
    general: '常规',
    geometry: '几何',
    text: '文字',
    style: '样式',
  };
  const perEntitySections = entities.map((e) => getEntityPropertySections(e));
  const result: PropertySection[] = sectionOrder.map((sid) => {
    const rowMaps = perEntitySections.map((sections) => {
      const section = sections.find((s) => s.id === sid);
      const m = new Map<string, string>();
      for (const row of section?.rows || []) m.set(row.key, row.value);
      return m;
    });

    const keys: string[] = [];
    for (const m of rowMaps) {
      for (const key of m.keys()) {
        if (!keys.includes(key)) keys.push(key);
      }
    }

    const rows: PropertyRow[] = keys.map((key) => {
      const values = rowMaps.map((m) => m.get(key) ?? '--');
      const same = values.every((v) => v === values[0]);
      return { key, value: same ? values[0] : '*多种*' };
    });
    return { id: sid, title: sectionTitle[sid], rows, defaultOpen: true };
  });

  const general = result.find((s) => s.id === 'general');
  if (general) {
    const types = new Set(entities.map((e) => String(e.type || '--').toUpperCase()));
    const typeValue = types.size === 1 ? Array.from(types)[0] : '*多种*';
    const rowsWithoutOverrides = general.rows.filter((r) => r.key !== '选择数量' && r.key !== '类型');
    general.rows = [
      { key: '选择数量', value: String(entities.length) },
      { key: '类型', value: typeValue },
      ...rowsWithoutOverrides,
    ];
  }
  return result;
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

function colorFromAci(index: number): string {
  const fixed: Record<number, string> = {
    0: '#cbd5e1',
    1: '#ff0000',
    2: '#ffff00',
    3: '#00ff00',
    4: '#00ffff',
    5: '#0000ff',
    6: '#ff00ff',
    7: '#ffffff',
    8: '#808080',
    9: '#c0c0c0',
    250: '#333333',
    251: '#444444',
    252: '#555555',
    253: '#666666',
    254: '#777777',
    255: '#888888',
  };
  if (fixed[index]) return fixed[index];
  return `hsl(${(index * 137.5) % 360} 70% 60%)`;
}

function resolveTextAlign(modeRaw: string): CanvasTextAlign {
  const m = modeRaw.toLowerCase();
  if (m.includes('right')) return 'right';
  if (m.includes('center') || m.includes('mid')) return 'center';
  return 'left';
}

function resolveTextBaseline(modeRaw: string): CanvasTextBaseline {
  const m = modeRaw.toLowerCase();
  if (m.includes('top')) return 'top';
  if (m.includes('middle') || m.includes('mid') || m.includes('center')) return 'middle';
  if (m.includes('bottom')) return 'bottom';
  return 'alphabetic';
}

function getBboxAnchor(bbox: DwgEntityLite['bbox'], align: CanvasTextAlign, baseline: CanvasTextBaseline): WorldPoint | null {
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const x = align === 'center' ? (minX + maxX) * 0.5 : align === 'right' ? maxX : minX;
  const y = baseline === 'top' ? maxY : baseline === 'middle' ? (minY + maxY) * 0.5 : minY;
  return { x, y, z: Number(bbox.min.z || 0) };
}

function entityColor(entity: DwgEntityLite): string {
  const style = entity.style as Record<string, unknown> | undefined;
  const geom = entity.geom as Record<string, unknown> | undefined;
  const colorIndexRaw = style?.effective_color_index ?? style?.color_index ?? geom?.color_index;
  if (isFiniteNumber(colorIndexRaw) && colorIndexRaw >= 0) {
    if (colorIndexRaw === 256) return '#94a3b8';
    return colorFromAci(Math.round(colorIndexRaw));
  }

  const colorName = String(style?.effective_color ?? style?.color ?? geom?.color ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(colorName)) return colorName;
  if (/^ACI\s+\d+$/i.test(colorName)) {
    const n = Number(colorName.replace(/\D+/g, ''));
    if (Number.isFinite(n)) return colorFromAci(n);
  }
  if (/^foreground$/i.test(colorName)) return colorFromAci(7);
  return '#94a3b8';
}

function toPositiveFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseCadLineweightMm(raw: unknown): number | null {
  const token = String(raw ?? '').trim();
  if (!token) return null;
  const lower = token.toLowerCase();
  if (
    lower === 'default' ||
    lower === 'bylayer' ||
    lower === 'byblock' ||
    lower === 'klnwtbylayer' ||
    lower === 'klnwtbyblock' ||
    lower === 'klnwtbylwdefault'
  ) {
    return null;
  }
  const enumMatch = lower.match(/^klnwt(\d+)$/);
  if (enumMatch) {
    const centiMm = Number(enumMatch[1]);
    if (Number.isFinite(centiMm) && centiMm > 0) return centiMm / 100;
    return null;
  }
  const n = Number(token);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveEntityNormalLineweightMm(entity: DwgEntityLite): number {
  const style = (entity.style || {}) as Record<string, unknown>;
  const effective = toPositiveFiniteNumber(style.effective_lineweight_mm);
  if (effective) return effective;
  const parsed = parseCadLineweightMm(style.lineweight);
  if (parsed) return parsed;
  const mm = toPositiveFiniteNumber(style.lineweight_mm);
  if (mm) return mm;
  return DEFAULT_NORMAL_LINEWEIGHT_MM;
}

function resolvePolylineGeometricWidthWorld(
  entity: DwgEntityLite,
  primitive?: Extract<DwgPrimitive, { kind: 'polyline' }>
): number | null {
  const geom = (entity.geom || {}) as Record<string, unknown>;
  const globalW = toPositiveFiniteNumber(primitive?.global_width ?? geom.global_width);
  if (globalW) return globalW;
  const startW = toPositiveFiniteNumber(primitive?.start_width ?? geom.start_width);
  const endW = toPositiveFiniteNumber(primitive?.end_width ?? geom.end_width);
  if (startW && endW) return Math.max(startW, endW);
  return startW ?? endW ?? null;
}

function resolveStrokeWidthPx(
  entity: DwgEntityLite,
  zoom: number,
  showNormalLineweight: boolean,
  primitive?: DwgPrimitive
): number {
  const entityType = String(entity.type || '').toUpperCase();
  const polylinePrimitive = primitive && primitive.kind === 'polyline' ? primitive : undefined;
  if (entityType === 'POLYLINE' || polylinePrimitive) {
    const worldW = resolvePolylineGeometricWidthWorld(entity, polylinePrimitive);
    if (worldW && Number.isFinite(zoom) && zoom > 0) {
      const px = worldW * zoom;
      if (Number.isFinite(px) && px > 0) {
        return Math.max(GEOMETRIC_LINEWEIGHT_MIN_PX, Math.min(GEOMETRIC_LINEWEIGHT_MAX_PX, px));
      }
    }
  }
  if (!showNormalLineweight) return 1.1;
  const mm = resolveEntityNormalLineweightMm(entity);
  const px = mm * NORMAL_LINEWEIGHT_MM_TO_PX;
  if (!Number.isFinite(px) || px <= 0) return 1.1;
  return Math.max(NORMAL_LINEWEIGHT_MIN_PX, Math.min(NORMAL_LINEWEIGHT_MAX_PX, px));
}

function hatchPatternIsCross(patternNameRaw: unknown): boolean {
  const name = String(patternNameRaw || '').trim().toLowerCase();
  if (!name) return false;
  return (
    name.includes('cross') ||
    name.includes('grid') ||
    name.includes('net') ||
    name.includes('ansi32') ||
    name.includes('ansi33') ||
    name.includes('ansi34') ||
    name.includes('ansi35')
  );
}

function traceClosedScreenRingsPath(ctx: CanvasRenderingContext2D, rings: Array<Array<{ x: number; y: number }>>): boolean {
  let traced = false;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const first = ring[0];
    if (!Number.isFinite(first.x) || !Number.isFinite(first.y)) continue;
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < ring.length; i += 1) {
      const p = ring[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    traced = true;
  }
  return traced;
}

function drawHatchPatternLinesInClip(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  color: string,
  angleDeg: number,
  spacingPx: number,
  cross: boolean
): void {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const radius = Math.hypot(w, h) * 0.6 + spacingPx * 2;
  const drawOneDirection = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.beginPath();
    for (let x = -radius; x <= radius; x += spacingPx) {
      ctx.moveTo(x, -radius);
      ctx.lineTo(x, radius);
    }
    ctx.stroke();
    ctx.restore();
  };

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = 1;
  drawOneDirection(angleDeg);
  if (cross) drawOneDirection(angleDeg + 90);
  ctx.restore();
}

function bboxVisible(bbox: DwgEntityLite['bbox'], view: WorldBounds): boolean {
  if (!bbox?.min || !bbox?.max) return true;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return true;
  if (maxX < view.minX || minX > view.maxX) return false;
  if (maxY < view.minY || minY > view.maxY) return false;
  return true;
}

function distanceToBboxWorld(point: WorldPoint, bbox: DwgEntityLite['bbox']): number | null {
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const loX = Math.min(minX, maxX);
  const hiX = Math.max(minX, maxX);
  const loY = Math.min(minY, maxY);
  const hiY = Math.max(minY, maxY);
  const dx = point.x < loX ? loX - point.x : point.x > hiX ? point.x - hiX : 0;
  const dy = point.y < loY ? loY - point.y : point.y > hiY ? point.y - hiY : 0;
  return Math.hypot(dx, dy);
}

function asPrimitiveList(geom: Record<string, unknown>): DwgPrimitive[] {
  const raw = geom.primitives;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is DwgPrimitive => Boolean(p) && typeof p === 'object' && typeof (p as any).kind === 'string');
}

function pointDistanceWorld(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegmentWorld(point: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-12) return Math.hypot(apx, apy);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(point.x - cx, point.y - cy);
}

function normalizeAngleDeg(a: number): number {
  let v = a % 360;
  if (v < 0) v += 360;
  return v;
}

function distanceToPrimitiveWorld(point: WorldPoint, primitive: DwgPrimitive, targetBbox?: DwgEntityLite['bbox']): number | null {
  if (primitive.kind === 'line') {
    if (!isPoint(primitive.start) || !isPoint(primitive.end)) return null;
    return distanceToSegmentWorld(point, primitive.start, primitive.end);
  }
  if (primitive.kind === 'polyline') {
    const pts = primitive.points.filter(isPoint);
    if (pts.length < 2) return null;
    let d = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pts.length - 1; i += 1) d = Math.min(d, distanceToSegmentWorld(point, pts[i], pts[i + 1]));
    if (Boolean(primitive.closed) && pts.length > 2) d = Math.min(d, distanceToSegmentWorld(point, pts[pts.length - 1], pts[0]));
    return Number.isFinite(d) ? d : null;
  }
  if (primitive.kind === 'polygon') {
    let d = Number.POSITIVE_INFINITY;
    for (const ring of primitive.rings) {
      const pts = ring.filter(isPoint);
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i += 1) d = Math.min(d, distanceToSegmentWorld(point, pts[i], pts[i + 1]));
      d = Math.min(d, distanceToSegmentWorld(point, pts[pts.length - 1], pts[0]));
    }
    return Number.isFinite(d) ? d : null;
  }
  if (primitive.kind === 'circle') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.radius)) return null;
    return Math.abs(pointDistanceWorld(point, primitive.center) - Number(primitive.radius));
  }
  if (primitive.kind === 'arc') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.radius)) return null;
    const center = primitive.center;
    const radius = Number(primitive.radius);
    let startDeg = Number(primitive.start_angle ?? 0);
    let deltaDeg = ((Number(primitive.end_angle ?? 360) - startDeg) % 360 + 360) % 360;
    if (deltaDeg <= 1e-6) deltaDeg = 360;

    if (isPoint(primitive.start) && isPoint(primitive.end)) {
      const sp = normalizeAngleDeg((Math.atan2(primitive.start.y - center.y, primitive.start.x - center.x) * 180) / Math.PI);
      const ep = normalizeAngleDeg((Math.atan2(primitive.end.y - center.y, primitive.end.x - center.x) * 180) / Math.PI);
      startDeg = sp;
      const ccwDelta = ((ep - sp) % 360 + 360) % 360 || 360;
      const cwDelta = 360 - ccwDelta;
      let sweepDeg = ccwDelta;
      if (targetBbox && ccwDelta < 360 - 1e-6 && cwDelta < 360 - 1e-6) {
        const sampleA = sampleArcWorld(center, radius, (startDeg * Math.PI) / 180, (ccwDelta * Math.PI) / 180, 24);
        const sampleB = sampleArcWorld(center, radius, (startDeg * Math.PI) / 180, (-cwDelta * Math.PI) / 180, 24);
        const scoreA = arcBboxScore(bboxFromWorldPoints(sampleA), targetBbox);
        const scoreB = arcBboxScore(bboxFromWorldPoints(sampleB), targetBbox);
        if (scoreB < scoreA) sweepDeg = -cwDelta;
      }
      deltaDeg = sweepDeg;
    }

    const sweepRad = (deltaDeg * Math.PI) / 180;
    const approxPxRadius = Math.max(radius, 1);
    const steps = Math.max(8, Math.min(160, Math.ceil((Math.abs(sweepRad) * approxPxRadius) / 10)));
    const pts = sampleArcWorld(center, radius, (startDeg * Math.PI) / 180, sweepRad, steps);
    if (pts.length < 2) return null;

    let d = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pts.length - 1; i += 1) {
      d = Math.min(d, distanceToSegmentWorld(point, pts[i], pts[i + 1]));
    }
    if (!Number.isFinite(d)) return null;
    return d;
  }
  if (primitive.kind === 'ellipse') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.rx) || !Number.isFinite(primitive.ry)) return null;
    const center = primitive.center;
    const rx = Math.abs(Number(primitive.rx));
    const ry = Math.abs(Number(primitive.ry));
    if (rx <= 1e-9 || ry <= 1e-9) return null;
    const rot = (Number(primitive.rotation || 0) * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const start = Number(primitive.start_angle ?? 0);
    let delta = ((Number(primitive.end_angle ?? 360) - start) % 360 + 360) % 360;
    if (delta <= 1e-9) delta = 360;
    const steps = 48;
    let d = Number.POSITIVE_INFINITY;
    let prev: WorldPoint | null = null;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = ((start + delta * t) * Math.PI) / 180;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      const p: WorldPoint = {
        x: center.x + ex * cosR - ey * sinR,
        y: center.y + ex * sinR + ey * cosR,
        z: center.z || 0,
      };
      if (prev) d = Math.min(d, distanceToSegmentWorld(point, prev, p));
      prev = p;
    }
    return Number.isFinite(d) ? d : null;
  }
  if (primitive.kind === 'text') return isPoint(primitive.position) ? pointDistanceWorld(point, primitive.position) : null;
  if (primitive.kind === 'point') return isPoint(primitive.position) ? pointDistanceWorld(point, primitive.position) : null;
  return null;
}

function distanceToEntityWorld(point: WorldPoint, entity: DwgEntityLite): number | null {
  const geom = (entity.geom || {}) as Record<string, unknown>;
  const primitives = asPrimitiveList(geom);
  let d = Number.POSITIVE_INFINITY;

  for (const primitive of primitives) {
    const pd = distanceToPrimitiveWorld(point, primitive, entity.bbox);
    if (pd !== null) d = Math.min(d, pd);
  }

  const typeUpper = String(entity.type || '').toUpperCase();
  if (!primitives.length && typeUpper === 'LINE') {
    const start = geom.start;
    const end = geom.end;
    if (isPoint(start) && isPoint(end)) d = Math.min(d, distanceToSegmentWorld(point, start, end));
  }

  if (isTextLikeEntityLite(entity)) {
    const bboxDist = distanceToBboxWorld(point, entity.bbox);
    if (bboxDist !== null) d = Math.min(d, bboxDist);
  }

  return Number.isFinite(d) ? d : null;
}

function findLocalPickEntityId(point: WorldPoint, tolWorld: number, entities: DwgEntityLite[], view: WorldBounds): string | null {
  let best: { id: string; dist: number } | null = null;

  for (const ent of entities) {
    if (!bboxVisible(ent.bbox, view)) continue;
    const bboxDist = distanceToBboxWorld(point, ent.bbox);
    if (bboxDist !== null && bboxDist > tolWorld * 1.5) continue;

    const dist = distanceToEntityWorld(point, ent);
    if (dist === null || dist > tolWorld) continue;
    if (!best || dist < best.dist) best = { id: ent.id, dist };
  }

  return best?.id || null;
}

function toEntityLiteForPick(entity: Record<string, unknown>, fallbackSpaceId: string): DwgEntityLite | null {
  const id = String(entity.id ?? '').trim();
  const type = String(entity.type ?? '').trim();
  const geom = entity.geom;
  if (!id || !type || !geom || typeof geom !== 'object') return null;

  let bbox: DwgEntityLite['bbox'] | undefined;
  const rawBbox = entity.bbox;
  if (rawBbox && typeof rawBbox === 'object') {
    const b = rawBbox as Record<string, unknown>;
    const bmin = b.min;
    const bmax = b.max;
    if (bmin && typeof bmin === 'object' && bmax && typeof bmax === 'object') {
      const minObj = bmin as Record<string, unknown>;
      const maxObj = bmax as Record<string, unknown>;
      const minX = Number(minObj.x);
      const minY = Number(minObj.y);
      const maxX = Number(maxObj.x);
      const maxY = Number(maxObj.y);
      if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
        bbox = {
          min: { x: minX, y: minY, z: Number(minObj.z || 0) },
          max: { x: maxX, y: maxY, z: Number(maxObj.z || 0) },
        };
      }
    }
  }

  return {
    id,
    type,
    layer: String(entity.layer ?? '0'),
    space_id: String(entity.space_id ?? fallbackSpaceId),
    geom: geom as DwgEntityLite['geom'],
    style: entity.style && typeof entity.style === 'object' ? (entity.style as Record<string, unknown>) : undefined,
    bbox,
  };
}

function isEntityRecordHit(entity: Record<string, unknown>, point: WorldPoint, tolWorld: number, fallbackSpaceId: string): boolean {
  const lite = toEntityLiteForPick(entity, fallbackSpaceId);
  if (!lite) return false;
  const dist = distanceToEntityWorld(point, lite);
  return typeof dist === 'number' && Number.isFinite(dist) && dist <= tolWorld;
}

function includePrimitiveBounds(includePoint: (p: WorldPoint) => void, primitives: DwgPrimitive[]) {
  for (const primitive of primitives) {
    if (primitive.kind === 'line') {
      if (isPoint(primitive.start)) includePoint(primitive.start);
      if (isPoint(primitive.end)) includePoint(primitive.end);
      continue;
    }
    if (primitive.kind === 'polyline') {
      primitive.points.forEach((p) => {
        if (isPoint(p)) includePoint(p);
      });
      continue;
    }
    if (primitive.kind === 'polygon') {
      primitive.rings.forEach((ring) =>
        ring.forEach((p) => {
          if (isPoint(p)) includePoint(p);
        })
      );
      continue;
    }
    if (primitive.kind === 'circle') {
      const c = primitive.center;
      const r = Number(primitive.radius);
      if (isPoint(c) && Number.isFinite(r)) {
        includePoint({ x: c.x - r, y: c.y - r, z: c.z || 0 });
        includePoint({ x: c.x + r, y: c.y + r, z: c.z || 0 });
      }
      continue;
    }
    if (primitive.kind === 'arc') {
      const c = primitive.center;
      const r = Number(primitive.radius);
      if (isPoint(c) && Number.isFinite(r)) {
        includePoint({ x: c.x - r, y: c.y - r, z: c.z || 0 });
        includePoint({ x: c.x + r, y: c.y + r, z: c.z || 0 });
      }
      continue;
    }
    if (primitive.kind === 'ellipse') {
      const c = primitive.center;
      const rx = Number(primitive.rx);
      const ry = Number(primitive.ry);
      if (isPoint(c) && Number.isFinite(rx) && Number.isFinite(ry)) {
        includePoint({ x: c.x - rx, y: c.y - ry, z: c.z || 0 });
        includePoint({ x: c.x + rx, y: c.y + ry, z: c.z || 0 });
      }
      continue;
    }
    if (primitive.kind === 'text') {
      if (isPoint(primitive.position)) includePoint(primitive.position);
      continue;
    }
    if (primitive.kind === 'point') {
      if (isPoint(primitive.position)) includePoint(primitive.position);
    }
  }
}

function normalizeAngleRad(a: number): number {
  const twoPi = Math.PI * 2;
  let v = a % twoPi;
  if (v < 0) v += twoPi;
  return v;
}

function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const r = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));
  ctx.beginPath();
  const roundRectCapable = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, radii?: number) => void };
  if (typeof roundRectCapable.roundRect === 'function') {
    roundRectCapable.roundRect(x, y, width, height, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }
  ctx.fill();
}

function sampleArcWorld(center: WorldPoint, radius: number, startRad: number, sweepRad: number, steps: number): WorldPoint[] {
  const n = Math.max(2, steps);
  const pts: WorldPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = startRad + sweepRad * t;
    pts.push({
      x: center.x + radius * Math.cos(a),
      y: center.y + radius * Math.sin(a),
      z: center.z || 0,
    });
  }
  return pts;
}

function sampleEllipseWorld(
  center: WorldPoint,
  rx: number,
  ry: number,
  rotationRad: number,
  startRad: number,
  sweepRad: number,
  steps: number
): WorldPoint[] {
  const n = Math.max(8, steps);
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);
  const pts: WorldPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = startRad + sweepRad * t;
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    pts.push({
      x: center.x + ex * cosR - ey * sinR,
      y: center.y + ex * sinR + ey * cosR,
      z: center.z || 0,
    });
  }
  return pts;
}

function bboxFromWorldPoints(points: WorldPoint[]): WorldBounds | null {
  if (!points.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

function arcBboxScore(candidate: WorldBounds | null, target: DwgEntityLite['bbox']): number {
  if (!candidate || !target?.min || !target?.max) return Number.POSITIVE_INFINITY;
  const tMinX = Number(target.min.x);
  const tMinY = Number(target.min.y);
  const tMaxX = Number(target.max.x);
  const tMaxY = Number(target.max.y);
  if (![tMinX, tMinY, tMaxX, tMaxY].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return (
    Math.abs(candidate.minX - tMinX) +
    Math.abs(candidate.minY - tMinY) +
    Math.abs(candidate.maxX - tMaxX) +
    Math.abs(candidate.maxY - tMaxY)
  );
}

function computeEntitiesBounds(entities: DwgEntityLite[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  const includePoint = (p: WorldPoint) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    found = true;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const entity of entities) {
    if (entity.bbox?.min && entity.bbox?.max) {
      includePoint({ x: Number(entity.bbox.min.x), y: Number(entity.bbox.min.y), z: Number(entity.bbox.min.z || 0) });
      includePoint({ x: Number(entity.bbox.max.x), y: Number(entity.bbox.max.y), z: Number(entity.bbox.max.z || 0) });
      continue;
    }

    const geom = entity.geom || {};
    const primitives = asPrimitiveList(geom as Record<string, unknown>);
    if (primitives.length > 0) {
      includePrimitiveBounds(includePoint, primitives);
      continue;
    }
    if (entity.type === 'LINE') {
      const start = (geom as any).start;
      const end = (geom as any).end;
      if (isPoint(start)) includePoint(start);
      if (isPoint(end)) includePoint(end);
    } else if (entity.type === 'POLYLINE' || entity.type === 'SPLINE') {
      const points = (geom as any).vertices || (geom as any).points;
      if (Array.isArray(points)) {
        points.forEach((v) => {
          if (isPoint(v)) includePoint(v);
        });
      }
    } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      const center = (geom as any).center;
      const radius = Number((geom as any).radius);
      if (isPoint(center) && Number.isFinite(radius)) {
        includePoint({ x: center.x - radius, y: center.y - radius, z: center.z || 0 });
        includePoint({ x: center.x + radius, y: center.y + radius, z: center.z || 0 });
      }
    } else if (entity.type === 'ELLIPSE') {
      const center = (geom as any).center;
      const rx = Number((geom as any).rx);
      const ry = Number((geom as any).ry);
      if (isPoint(center) && Number.isFinite(rx) && Number.isFinite(ry)) {
        includePoint({ x: center.x - rx, y: center.y - ry, z: center.z || 0 });
        includePoint({ x: center.x + rx, y: center.y + ry, z: center.z || 0 });
      }
    } else if (entity.type === 'TEXT') {
      const pos = (geom as any).position;
      if (isPoint(pos)) includePoint(pos);
    }
  }

  if (!found) return null;
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

function hierarchyChildren(node: DwgHierarchyNode): DwgHierarchyNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

function findHierarchyPathByEntityId(nodes: DwgHierarchyNode[], entityId: string, path: string[] = []): string[] | null {
  for (const node of nodes) {
    const nextPath = [...path, node.node_id];
    if (node.entity_id === entityId) return nextPath;
    const childPath = findHierarchyPathByEntityId(hierarchyChildren(node), entityId, nextPath);
    if (childPath) return childPath;
  }
  return null;
}

function collectFirstLayerExpandedNodeIds(nodes: DwgHierarchyNode[]): Set<string> {
  const expanded = new Set<string>();
  for (const node of nodes) {
    if (node.node_kind === 'category') expanded.add(node.node_id);
  }
  return expanded;
}

function collectHierarchyLayers(nodes: DwgHierarchyNode[], out: Set<string>) {
  for (const node of nodes) {
    if (node.node_kind !== 'category') {
      out.add(normalizeLayerName(node.layer));
    }
    const children = hierarchyChildren(node);
    if (children.length > 0) collectHierarchyLayers(children, out);
  }
}

function entityWorldBounds(entity: DwgEntityLite): WorldBounds | null {
  const bbox = entity.bbox;
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  };
}

function boundsIntersects(a: WorldBounds, b: WorldBounds): boolean {
  if (a.maxX < b.minX || a.minX > b.maxX) return false;
  if (a.maxY < b.minY || a.minY > b.maxY) return false;
  return true;
}

function boundsContains(outer: WorldBounds, inner: WorldBounds): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

function hierarchyBboxToWorldBounds(
  bbox: DwgHierarchyNode['bbox'] | DwgEntityLite['bbox'] | null | undefined
): WorldBounds | null {
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  };
}

export function CADViewer({ rawFile, fileName }: CADViewerProps) {
  const [docId, setDocId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<DwgSpace[]>([]);
  const [activeSpace, setActiveSpace] = useState<string>('model');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [backendMode, setBackendMode] = useState<string>('unknown');
  const [shxRenderStatus, setShxRenderStatus] = useState<ShxRenderStatus>(DEFAULT_SHX_RENDER_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewerMode>('select');
  const snapEnabled = true;
  const [measurePoints, setMeasurePoints] = useState<WorldPoint[]>([]);
  const [measureValue, setMeasureValue] = useState<string>('');
  const [selectionScope, setSelectionScope] = useState<SelectionScope>('block');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeBlockName, setActiveBlockName] = useState<string>('');
  const [activeBlockEntity, setActiveBlockEntity] = useState<Record<string, unknown> | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Record<string, unknown> | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<Record<string, unknown>[]>([]);
  const [entities, setEntities] = useState<DwgEntityLite[]>([]);
  const [entityTotal, setEntityTotal] = useState(0);
  const [entityTruncated, setEntityTruncated] = useState(false);
  const [cursorWorld, setCursorWorld] = useState<WorldPoint | null>(null);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [layerFilterEnabled, setLayerFilterEnabled] = useState(false);
  const [layerWhitelist, setLayerWhitelist] = useState<Set<string>>(new Set());
  const [snapCandidatePoint, setSnapCandidatePoint] = useState<WorldPoint | null>(null);
  const [snapCandidateMode, setSnapCandidateMode] = useState<string | null>(null);
  const [showNormalLineweight, setShowNormalLineweight] = useState(true);
  const [showTreeSidebar, setShowTreeSidebar] = useState(true);
  const [showPropertySidebar, setShowPropertySidebar] = useState(true);
  const [hierarchyNodes, setHierarchyNodes] = useState<DwgHierarchyNode[]>([]);
  const [hierarchyEntityTotal, setHierarchyEntityTotal] = useState(0);
  const [hierarchyBlockTotal, setHierarchyBlockTotal] = useState(0);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [expandedHierarchyNodeIds, setExpandedHierarchyNodeIds] = useState<Set<string>>(new Set());
  const [selectedHierarchyNodeIds, setSelectedHierarchyNodeIds] = useState<Set<string>>(new Set());
  const [docFonts, setDocFonts] = useState<DwgDocFont[]>([]);
  const [fontFamilyByKey, setFontFamilyByKey] = useState<Record<string, string>>({});

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectCurrent, setBoxSelectCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectModifier, setBoxSelectModifier] = useState<BoxSelectModifier>('replace');

  const viewportRef = useRef<HTMLDivElement>(null);
  const geometryCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastMiddleDownAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const snapHoverSeqRef = useRef(0);
  const suppressClickAfterBoxRef = useRef(false);
  const textMetricsCacheRef = useRef<Map<string, CachedLineMetrics>>(new Map());
  const loadedCadFontsRef = useRef<Map<string, string>>(new Map());
  const lastOpenedFileKeyRef = useRef<string | null>(null);
  const docIdRef = useRef<string | null>(null);

  const [canvasMetrics, setCanvasMetrics] = useState<CanvasMetrics>({ width: 1, height: 1, dpr: 1 });

  const screenCenter = useMemo(() => ({ x: canvasMetrics.width * 0.5, y: canvasMetrics.height * 0.5 }), [canvasMetrics.width, canvasMetrics.height]);

  const worldToScreen = useCallback(
    (p: WorldPoint) => ({
      x: p.x * zoom + pan.x + screenCenter.x,
      y: -p.y * zoom + pan.y + screenCenter.y,
    }),
    [zoom, pan.x, pan.y, screenCenter.x, screenCenter.y]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number): WorldPoint => ({
      x: (sx - screenCenter.x - pan.x) / zoom,
      y: -(sy - screenCenter.y - pan.y) / zoom,
      z: 0,
    }),
    [screenCenter.x, screenCenter.y, pan.x, pan.y, zoom]
  );

  const worldViewBounds = useMemo<WorldBounds>(() => {
    const minX = (0 - screenCenter.x - pan.x) / zoom;
    const maxX = (canvasMetrics.width - screenCenter.x - pan.x) / zoom;
    const topY = -(0 - screenCenter.y - pan.y) / zoom;
    const bottomY = -(canvasMetrics.height - screenCenter.y - pan.y) / zoom;
    return {
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minY: Math.min(bottomY, topY),
      maxY: Math.max(bottomY, topY),
    };
  }, [canvasMetrics.width, canvasMetrics.height, pan.x, pan.y, screenCenter.x, screenCenter.y, zoom]);

  const availableLayers = useMemo(() => {
    const out = new Set<string>();
    for (const ent of entities) out.add(normalizeLayerName(ent.layer));
    collectHierarchyLayers(hierarchyNodes, out);
    return Array.from(out).sort((a, b) => a.localeCompare(b, 'en-US'));
  }, [entities, hierarchyNodes]);

  const isLayerSelectable = useCallback(
    (layerRaw: unknown) => {
      if (!layerFilterEnabled) return true;
      if (layerRaw === undefined || layerRaw === null) return true;
      return layerWhitelist.has(normalizeLayerName(layerRaw));
    },
    [layerFilterEnabled, layerWhitelist]
  );

  const filterSummaryLabel = useMemo(() => {
    if (!layerFilterEnabled) return '不过滤';
    return `已启用（${layerWhitelist.size}/${availableLayers.length}）`;
  }, [availableLayers.length, layerFilterEnabled, layerWhitelist.size]);

  const clearSelection = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedEntity(null);
    setSelectedEntityIds([]);
    setSelectedEntities([]);
    setSelectedHierarchyNodeIds(new Set());
  }, []);

  const applySelection = useCallback(
    (ids: string[], records: Record<string, unknown>[]) => {
      if (!ids.length || !records.length) {
        clearSelection();
        return;
      }
      setSelectedEntityId(ids[0]);
      setSelectedEntity(records[0]);
      setSelectedEntityIds(ids);
      setSelectedEntities(records);
    },
    [clearSelection]
  );

  const mergeSelectionByModifier = useCallback(
    (
      incomingIds: string[],
      incomingRecords: Record<string, unknown>[],
      modifier: BoxSelectModifier
    ): { ids: string[]; records: Record<string, unknown>[] } => {
      if (modifier === 'replace') {
        return { ids: incomingIds, records: incomingRecords };
      }

      const current = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < selectedEntityIds.length; i += 1) {
        const id = selectedEntityIds[i];
        const rec = selectedEntities[i];
        if (!id || !rec) continue;
        current.set(id, rec);
      }

      if (modifier === 'add') {
        for (let i = 0; i < incomingIds.length; i += 1) {
          const id = incomingIds[i];
          const rec = incomingRecords[i];
          if (!id || !rec) continue;
          if (!current.has(id)) current.set(id, rec);
        }
      } else {
        for (let i = 0; i < incomingIds.length; i += 1) {
          const id = incomingIds[i];
          const rec = incomingRecords[i];
          if (!id) continue;
          if (current.has(id)) current.delete(id);
          else if (rec) current.set(id, rec);
        }
      }

      const ids = Array.from(current.keys());
      const records = ids.map((id) => current.get(id)).filter((v): v is Record<string, unknown> => Boolean(v));
      return { ids, records };
    },
    [selectedEntityIds, selectedEntities]
  );

  const fitViewToEntities = useCallback(
    (nextEntities: DwgEntityLite[]) => {
      const bounds = computeEntitiesBounds(nextEntities);
      if (!bounds || canvasMetrics.width <= 0 || canvasMetrics.height <= 0) return;

      const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
      const nextZoom = Math.max(1e-5, Math.min(20000, Math.min((canvasMetrics.width * 0.92) / spanX, (canvasMetrics.height * 0.92) / spanY)));
      if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;

      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerY = (bounds.minY + bounds.maxY) * 0.5;
      setZoom(nextZoom);
      setPan({ x: -centerX * nextZoom, y: centerY * nextZoom });
    },
    [canvasMetrics.height, canvasMetrics.width]
  );

  const focusExtents = useCallback(() => {
    fitViewToEntities(entities);
  }, [entities, fitViewToEntities]);

  const focusOrigin = useCallback(() => {
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleLayerFilterEnabled = useCallback(() => {
    setLayerFilterEnabled((prev) => {
      const next = !prev;
      if (next) {
        setLayerWhitelist((existing) => {
          if (existing.size > 0) return existing;
          return new Set(availableLayers);
        });
      }
      return next;
    });
  }, [availableLayers]);

  const setLayerFilterAll = useCallback(() => {
    setLayerWhitelist(new Set(availableLayers));
  }, [availableLayers]);

  const clearLayerFilterSelection = useCallback(() => {
    setLayerWhitelist(new Set());
  }, []);

  const toggleLayerInWhitelist = useCallback((layer: string) => {
    setLayerWhitelist((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const focusWorldBounds = useCallback(
    (bounds: WorldBounds | null) => {
      if (!bounds || canvasMetrics.width <= 0 || canvasMetrics.height <= 0) return;
      const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
      const nextZoom = Math.max(1e-5, Math.min(20000, Math.min((canvasMetrics.width * 0.9) / spanX, (canvasMetrics.height * 0.9) / spanY)));
      if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerY = (bounds.minY + bounds.maxY) * 0.5;
      setZoom(nextZoom);
      setPan({ x: -centerX * nextZoom, y: centerY * nextZoom });
    },
    [canvasMetrics.height, canvasMetrics.width]
  );

  const loadSpaceEntities = useCallback(
    async (nextDocId: string, nextSpaceId: string, fitView = false) => {
      const res = await listDwgEntities(nextDocId, nextSpaceId, 0);
      const nextEntities = res.entities || [];
      setEntities(nextEntities);
      setEntityTotal(typeof res.total_count === 'number' ? res.total_count : nextEntities.length);
      setEntityTruncated(Boolean(res.truncated));
      if (fitView) fitViewToEntities(nextEntities);
    },
    [fitViewToEntities]
  );

  const loadSpaceHierarchy = useCallback(async (nextDocId: string, nextSpaceId: string) => {
    setHierarchyLoading(true);
    setHierarchyError(null);
    try {
      const res = await listDwgHierarchy(nextDocId, nextSpaceId);
      const nodes = Array.isArray(res.nodes) ? res.nodes : [];
      setHierarchyNodes(nodes);
      setHierarchyEntityTotal(typeof res.total_entity_count === 'number' ? res.total_entity_count : 0);
      setHierarchyBlockTotal(typeof res.total_block_ref_count === 'number' ? res.total_block_ref_count : 0);
      setExpandedHierarchyNodeIds(collectFirstLayerExpandedNodeIds(nodes));
    } catch (e) {
      setHierarchyNodes([]);
      setHierarchyEntityTotal(0);
      setHierarchyBlockTotal(0);
      setExpandedHierarchyNodeIds(new Set());
      setHierarchyError(e instanceof Error ? e.message : '元素树加载失败');
    } finally {
      setHierarchyLoading(false);
    }
  }, []);

  const loadSpaceEntitiesRef = useRef(loadSpaceEntities);
  useEffect(() => {
    loadSpaceEntitiesRef.current = loadSpaceEntities;
  }, [loadSpaceEntities]);

  const loadSpaceHierarchyRef = useRef(loadSpaceHierarchy);
  useEffect(() => {
    loadSpaceHierarchyRef.current = loadSpaceHierarchy;
  }, [loadSpaceHierarchy]);

  useEffect(() => {
    if (!layerFilterEnabled) return;
    setLayerWhitelist((prev) => {
      const next = new Set<string>();
      for (const layer of prev) {
        if (availableLayers.includes(layer)) next.add(layer);
      }
      if (next.size === 0 && availableLayers.length > 0) {
        return new Set(availableLayers);
      }
      return next;
    });
  }, [availableLayers, layerFilterEnabled]);

  useEffect(() => {
    docIdRef.current = docId;
  }, [docId]);

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      const incomingFileKey = buildFileKey(rawFile);
      if (incomingFileKey && incomingFileKey === lastOpenedFileKeyRef.current && docIdRef.current) {
        return;
      }

      setError(null);
      clearSelection();
      setSelectionScope('block');
      setActiveBlockId(null);
      setActiveBlockName('');
      setActiveBlockEntity(null);
      setMeasurePoints([]);
      setMeasureValue('');
      setLayerFilterEnabled(false);
      setLayerWhitelist(new Set());
      setSnapCandidatePoint(null);
      setSnapCandidateMode(null);
      setHierarchyNodes([]);
      setHierarchyEntityTotal(0);
      setHierarchyBlockTotal(0);
      setExpandedHierarchyNodeIds(new Set());
      setSelectedHierarchyNodeIds(new Set());
      setHierarchyError(null);
      setWarnings([]);
      setShxRenderStatus(DEFAULT_SHX_RENDER_STATUS);
      if (!rawFile) {
        lastOpenedFileKeyRef.current = null;
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        setLayerFilterEnabled(false);
        setLayerWhitelist(new Set());
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
        return;
      }
      if (!rawFile.name.toLowerCase().endsWith('.dwg')) {
        lastOpenedFileKeyRef.current = null;
        setError('当前文件不是 DWG 图纸。');
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        setHierarchyNodes([]);
        setHierarchyEntityTotal(0);
        setHierarchyBlockTotal(0);
        setExpandedHierarchyNodeIds(new Set());
        setSelectedHierarchyNodeIds(new Set());
        setLayerFilterEnabled(false);
        setLayerWhitelist(new Set());
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
        return;
      }
      setLoading(true);
      try {
        const opened = await openDwgDocument(rawFile);
        if (cancelled) return;
        const shxStatus = resolveShxRenderStatus(opened);
        const openWarnings = Array.isArray(opened.warnings) ? [...opened.warnings] : [];
        if (shxStatus.detected && !shxStatus.trueOutline) {
          const fallbackCountText = shxStatus.fallbackTextCount > 0 ? `，降级文字 ${shxStatus.fallbackTextCount} 条` : '';
          let reason = '';
          if (shxStatus.outlineMode === 'disabled') {
            reason = '（后端未启用 SHX 轮廓）';
          } else if (!shxStatus.vectorizeAvailable) {
            reason = '（未检测到 OdVectorizeEx）';
          } else if (shxStatus.vectorizeAttempted && shxStatus.vectorizeAttachedCount <= 0) {
            reason = '（OdVectorizeEx 未返回可附加轮廓）';
          } else if (shxStatus.outlineMode === 'stub') {
            reason = '（当前为 stub 模式）';
          }
          const degradedWarning = `检测到 SHX 字体，当前为降级文本渲染${fallbackCountText}${reason}`;
          if (!openWarnings.includes(degradedWarning)) {
            openWarnings.push(degradedWarning);
          }
        }

        setDocId(opened.doc_id);
        setSpaces(opened.spaces || []);
        setActiveSpace(opened.current_space || 'model');
        setWarnings(normalizeWarningsForUi(openWarnings));
        setShxRenderStatus(shxStatus);
        const rev = String(opened.parser_revision || '').trim();
        setBackendMode(rev ? `${opened.mode || 'unknown'} (${rev})` : opened.mode || 'unknown');
        await loadSpaceEntitiesRef.current(opened.doc_id, opened.current_space || 'model', true);
        await loadSpaceHierarchyRef.current(opened.doc_id, opened.current_space || 'model');
        lastOpenedFileKeyRef.current = incomingFileKey;
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '打开 DWG 图纸失败。';
        lastOpenedFileKeyRef.current = null;
        if (message.includes('only .dwg is supported for direct open')) {
          setError(`${translateDwgWarningToCn(message)}（如文件名包含中文或特殊字符，后端文件名清洗可能影响后缀识别）`);
        } else {
          setError(translateDwgWarningToCn(message));
        }
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        setHierarchyNodes([]);
        setHierarchyEntityTotal(0);
        setHierarchyBlockTotal(0);
        setExpandedHierarchyNodeIds(new Set());
        setSelectedHierarchyNodeIds(new Set());
        setLayerFilterEnabled(false);
        setLayerWhitelist(new Set());
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
        setWarnings([]);
        setShxRenderStatus(DEFAULT_SHX_RENDER_STATUS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    open();
    return () => {
      cancelled = true;
    };
  }, [rawFile, clearSelection]);

  useEffect(() => {
    return () => {
      if (docId) closeDwgDocument(docId).catch(() => void 0);
    };
  }, [docId]);

  useEffect(() => {
    let cancelled = false;
    setDocFonts([]);
    setFontFamilyByKey({});
    if (!docId) {
      return () => {
        cancelled = true;
      };
    }

    const loadDocFonts = async () => {
      try {
        const res = await listDwgFonts(docId);
        if (cancelled) return;
        const fonts = Array.isArray(res.fonts) ? res.fonts : [];
        setDocFonts(fonts);
        const fontWarnings = Array.isArray(res.warnings) ? res.warnings : [];
        if (fontWarnings.length > 0) {
          setWarnings((prev) => normalizeWarningsForUi([...prev, ...fontWarnings]));
        }
        const shxDiag = res.shx_diagnostics;
        const hasShxFonts = fonts.some((f) => String(f.kind || '').trim().toLowerCase() === 'shx');
        if (shxDiag || hasShxFonts) {
          const missingOriginalShxFonts = toUniqueStringList(shxDiag?.missing_original_shx_fonts);
          const resolvedOriginalShxFonts = toUniqueStringList(shxDiag?.resolved_original_shx_fonts);
          const fallbackShxFile = String(shxDiag?.fallback_shx_file || '').trim() || null;
          const fallbackHitCountRaw = Number(shxDiag?.fallback_hit_count);
          const fallbackHitCount = Number.isFinite(fallbackHitCountRaw) ? Math.max(0, fallbackHitCountRaw) : 0;
          setShxRenderStatus((prev) => {
            const nextOutlineMode = String(res.shx_outline_mode || '').trim() || prev.outlineMode;
            return {
              ...prev,
              detected: prev.detected || hasShxFonts,
              outlineMode: nextOutlineMode,
              missingOriginalShxFonts: missingOriginalShxFonts.length > 0 ? missingOriginalShxFonts : prev.missingOriginalShxFonts,
              resolvedOriginalShxFonts: resolvedOriginalShxFonts.length > 0 ? resolvedOriginalShxFonts : prev.resolvedOriginalShxFonts,
              fallbackShxFile: fallbackShxFile || prev.fallbackShxFile,
              fallbackHitCount: Math.max(prev.fallbackHitCount, fallbackHitCount),
              diagnosticsUnavailable: prev.diagnosticsUnavailable || Boolean(shxDiag?.diagnostics_unavailable),
            };
          });
        }

        const next: Record<string, string> = {};
        for (const font of fonts) {
          const key = String(font.key || '').trim();
          if (!key) continue;
          const cacheKey = `${docId}:${key}`;
          const cachedFamily = loadedCadFontsRef.current.get(cacheKey);
          if (cachedFamily) {
            next[key] = cachedFamily;
            continue;
          }

          const fallbackFamily = sanitizeCssFontFamily(font.family || font.name || '');
          const kind = String(font.kind || '').toLowerCase();
          if (font.available && font.file_url && (kind === 'ttf' || kind === 'ttc' || kind === 'otf')) {
            try {
              const familyId = `DWG_FONT_${docId.replace(/[^a-zA-Z0-9_]/g, '_')}_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
              const face = new FontFace(familyId, `url("${font.file_url}")`);
              const loadedFace = await face.load();
              document.fonts.add(loadedFace);
              loadedCadFontsRef.current.set(cacheKey, familyId);
              next[key] = familyId;
              continue;
            } catch {
              // fallback below
            }
          }

          if (fallbackFamily) {
            loadedCadFontsRef.current.set(cacheKey, fallbackFamily);
            next[key] = fallbackFamily;
          }
        }
        if (!cancelled) setFontFamilyByKey(next);
      } catch {
        if (cancelled) return;
        setDocFonts([]);
        setFontFamilyByKey({});
      }
    };

    void loadDocFonts();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const switchSpace = useCallback(
    async (nextSpace: string) => {
      if (!docId) return;
      setActiveSpace(nextSpace);
      clearSelection();
      setSelectionScope('block');
      setActiveBlockId(null);
      setActiveBlockName('');
      setActiveBlockEntity(null);
      setMeasurePoints([]);
      setMeasureValue('');
      setLayerFilterEnabled(false);
      setLayerWhitelist(new Set());
      setSnapCandidatePoint(null);
      setSnapCandidateMode(null);
      setSelectedHierarchyNodeIds(new Set());
      setHierarchyError(null);
      try {
        await updateDwgView(docId, { space_id: nextSpace });
        const latest = await listDwgSpaces(docId);
        setSpaces(latest.spaces || []);
        await loadSpaceEntities(docId, nextSpace, true);
        await loadSpaceHierarchy(docId, nextSpace);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to switch space.');
      }
    },
    [docId, loadSpaceEntities, loadSpaceHierarchy, clearSelection]
  );

  const handleMeasure = useCallback(
    async (points: WorldPoint[]) => {
      if (!docId || points.length !== 2) return;
      try {
        const result = await measureDwg(docId, { type: 'distance', p1: points[0], p2: points[1] });
        if (result.ok && typeof result.value === 'number') {
          setMeasureValue(`${result.value.toFixed(4)} (${result.unit || 'unit'})`);
        } else {
          setMeasureValue(result.error || 'measure failed');
        }
      } catch (e) {
        setMeasureValue(e instanceof Error ? e.message : 'measure failed');
      }
    },
    [docId]
  );

  const exitBlockInternalSelection = useCallback(() => {
    setSelectionScope('block');
    if (activeBlockEntity && activeBlockId) {
      applySelection([activeBlockId], [activeBlockEntity]);
    } else {
      clearSelection();
    }
    setActiveBlockId(null);
    setActiveBlockName('');
    setActiveBlockEntity(null);
  }, [activeBlockEntity, activeBlockId, applySelection, clearSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      clearSelection();
      setIsBoxSelecting(false);
      setBoxSelectStart(null);
      setBoxSelectCurrent(null);
      setBoxSelectModifier('replace');
      if (selectionScope === 'entity') {
        setSelectionScope('block');
        setActiveBlockId(null);
        setActiveBlockName('');
        setActiveBlockEntity(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionScope, clearSelection]);

  useEffect(() => {
    if (!docId || mode !== 'measure' || !snapEnabled || !cursorWorld || isPanning) {
      setSnapCandidatePoint(null);
      setSnapCandidateMode(null);
      return;
    }
    const seq = ++snapHoverSeqRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const snapped = await snapDwgPoint(docId, {
          space_id: activeSpace,
          point: cursorWorld,
          tolerance: 12 / zoom,
          modes: ['endpoint', 'midpoint', 'center'],
        });
        if (seq !== snapHoverSeqRef.current) return;
        if (snapped.snapped && snapped.point) {
          setSnapCandidatePoint(snapped.point);
          setSnapCandidateMode(snapped.mode || null);
        } else {
          setSnapCandidatePoint(null);
          setSnapCandidateMode(null);
        }
      } catch {
        if (seq !== snapHoverSeqRef.current) return;
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [docId, mode, snapEnabled, cursorWorld, isPanning, activeSpace, zoom]);

  const handleCanvasDoubleClick = useCallback(() => {
    if (mode !== 'select') return;
    if (!selectedEntity || !selectedEntityId || !isBlockRefType(selectedEntity.type)) return;
    const geom = selectedEntity.geom && typeof selectedEntity.geom === 'object' ? (selectedEntity.geom as Record<string, unknown>) : {};
    setSelectionScope('entity');
    setActiveBlockId(selectedEntityId);
    setActiveBlockEntity(selectedEntity);
    setActiveBlockName(String(geom.block_name ?? selectedEntityId));
  }, [mode, selectedEntity, selectedEntityId]);

  const handleBoxSelect = useCallback(
    async (
      startScreen: { x: number; y: number },
      endScreen: { x: number; y: number },
      modifier: BoxSelectModifier = 'replace'
    ) => {
      if (!docId) return;
      const w1 = screenToWorld(startScreen.x, startScreen.y);
      const w2 = screenToWorld(endScreen.x, endScreen.y);
      const selectBounds: WorldBounds = {
        minX: Math.min(w1.x, w2.x),
        minY: Math.min(w1.y, w2.y),
        maxX: Math.max(w1.x, w2.x),
        maxY: Math.max(w1.y, w2.y),
      };
      const windowMode = endScreen.x >= startScreen.x;

      let scoped = entities.filter((ent) => isLayerSelectable(ent.layer));
      if (selectionScope === 'entity' && activeBlockId) {
        scoped = scoped.filter((ent) => String(ent.parent_block_id || '') === activeBlockId);
      }

      const hits = scoped.filter((ent) => {
        const b = entityWorldBounds(ent);
        if (!b) return false;
        return windowMode ? boundsContains(selectBounds, b) : boundsIntersects(selectBounds, b);
      });

      if (!hits.length) {
        if (modifier === 'replace') clearSelection();
        return;
      }

      if (selectionScope === 'block') {
        const uniqueTargets: Array<{ id: string; kind: 'block' | 'entity'; source: DwgEntityLite }> = [];
        const seen = new Set<string>();
        for (const ent of hits) {
          const parent = String(ent.parent_block_id || '').trim();
          const id = parent || ent.id;
          const kind: 'block' | 'entity' = parent ? 'block' : 'entity';
          const key = `${kind}:${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          uniqueTargets.push({ id, kind, source: ent });
        }

        const selectedIds: string[] = [];
        const selectedRecords: Record<string, unknown>[] = [];
        for (const target of uniqueTargets) {
          if (target.kind === 'entity') {
            selectedIds.push(target.id);
            selectedRecords.push(target.source as unknown as Record<string, unknown>);
            continue;
          }
          try {
            const detail = await getDwgEntity(docId, target.id);
            if (detail.entity && typeof detail.entity === 'object') {
              selectedIds.push(target.id);
              selectedRecords.push(detail.entity);
            }
          } catch {
            // ignore unresolved block entity
          }
        }
        if (!selectedIds.length) {
          if (modifier === 'replace') clearSelection();
          return;
        }
        const merged = mergeSelectionByModifier(selectedIds, selectedRecords, modifier);
        if (!merged.ids.length || !merged.records.length) {
          clearSelection();
          return;
        }
        applySelection(merged.ids, merged.records);
        setSelectionScope('block');
        if (merged.ids.length === 1 && isBlockRefType(merged.records[0].type)) {
          const geom = merged.records[0].geom && typeof merged.records[0].geom === 'object' ? (merged.records[0].geom as Record<string, unknown>) : {};
          setActiveBlockName(String(geom.block_name ?? merged.ids[0]));
        } else {
          setActiveBlockId(null);
          setActiveBlockName('');
          setActiveBlockEntity(null);
        }
        return;
      }

      const seenEntityIds = new Set<string>();
      const selectedIds: string[] = [];
      const selectedRecords: Record<string, unknown>[] = [];
      for (const ent of hits) {
        if (seenEntityIds.has(ent.id)) continue;
        seenEntityIds.add(ent.id);
        selectedIds.push(ent.id);
        selectedRecords.push(ent as unknown as Record<string, unknown>);
      }
      const merged = mergeSelectionByModifier(selectedIds, selectedRecords, modifier);
      if (!merged.ids.length || !merged.records.length) {
        clearSelection();
        return;
      }
      applySelection(merged.ids, merged.records);
    },
    [
      docId,
      screenToWorld,
      entities,
      isLayerSelectable,
      selectionScope,
      activeBlockId,
      clearSelection,
      applySelection,
      mergeSelectionByModifier,
    ]
  );

  const boxSelectPreview = useMemo(() => {
    if (mode !== 'select' || !boxSelectStart || !boxSelectCurrent) return null;
    const dx = boxSelectCurrent.x - boxSelectStart.x;
    const dy = boxSelectCurrent.y - boxSelectStart.y;
    if (Math.hypot(dx, dy) < BOX_SELECT_DRAG_THRESHOLD_PX) return null;

    const w1 = screenToWorld(boxSelectStart.x, boxSelectStart.y);
    const w2 = screenToWorld(boxSelectCurrent.x, boxSelectCurrent.y);
    const selectBounds: WorldBounds = {
      minX: Math.min(w1.x, w2.x),
      minY: Math.min(w1.y, w2.y),
      maxX: Math.max(w1.x, w2.x),
      maxY: Math.max(w1.y, w2.y),
    };
    const windowMode = boxSelectCurrent.x >= boxSelectStart.x;

    let scoped = entities.filter((ent) => isLayerSelectable(ent.layer));
    if (selectionScope === 'entity' && activeBlockId) {
      scoped = scoped.filter((ent) => String(ent.parent_block_id || '') === activeBlockId);
    }

    const hits = scoped.filter((ent) => {
      const b = entityWorldBounds(ent);
      if (!b) return false;
      return windowMode ? boundsContains(selectBounds, b) : boundsIntersects(selectBounds, b);
    });

    if (selectionScope === 'block') {
      const unique = new Set<string>();
      for (const ent of hits) {
        const parent = String(ent.parent_block_id || '').trim();
        unique.add(parent || ent.id);
      }
      return { count: unique.size, windowMode, modifier: boxSelectModifier };
    }

    return { count: new Set(hits.map((ent) => ent.id)).size, windowMode, modifier: boxSelectModifier };
  }, [
    mode,
    boxSelectStart,
    boxSelectCurrent,
    screenToWorld,
    entities,
    isLayerSelectable,
    selectionScope,
    activeBlockId,
    boxSelectModifier,
  ]);

  const boxSelectModifierLabel = useMemo(() => {
    if (boxSelectModifier === 'add') return '累加';
    if (boxSelectModifier === 'toggle') return '反选';
    return '替换';
  }, [boxSelectModifier]);

  const resolveCadTextFontFamily = useCallback(
    (fontKeyRaw: unknown, fontFamilyRaw?: unknown, fontNameRaw?: unknown) => {
      const fontKey = _sanitizeFontKeyUi(fontKeyRaw);
      if (fontKey && fontFamilyByKey[fontKey]) {
        return buildCadTextFontFamily(fontFamilyByKey[fontKey]);
      }
      const family = sanitizeCssFontFamily(fontFamilyRaw || '');
      if (family) return buildCadTextFontFamily(family);
      const name = sanitizeCssFontFamily(fontNameRaw || '');
      if (name) return buildCadTextFontFamily(name);
      return CAD_TEXT_FALLBACK_FONT;
    },
    [fontFamilyByKey]
  );

  const handleCanvasClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      if (!docId || isPanning) return;
      if (suppressClickAfterBoxRef.current) {
        suppressClickAfterBoxRef.current = false;
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const worldPoint = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);

      if (mode === 'measure') {
        let pointToUse = worldPoint;
        if (snapEnabled) {
          if (snapCandidatePoint) {
            pointToUse = snapCandidatePoint;
          } else {
            try {
              const snapped = await snapDwgPoint(docId, {
                space_id: activeSpace,
                point: worldPoint,
                tolerance: 12 / zoom,
                modes: ['endpoint', 'midpoint', 'center'],
              });
              if (snapped.snapped && snapped.point) pointToUse = snapped.point;
            } catch {
              // ignore snap errors
            }
          }
        }

        setMeasurePoints((prev) => {
          const next = prev.length >= 2 ? [pointToUse] : [...prev, pointToUse];
          if (next.length === 2) {
            handleMeasure(next);
          } else {
            setMeasureValue('');
          }
          return next;
        });
        return;
      }

      try {
        const maxTolWorld = (PICK_BOX_SIZE_PX * PICK_TOLERANCE_FACTORS[PICK_TOLERANCE_FACTORS.length - 1]) / zoom;
        const blockMaxTolWorld = (BLOCK_PICK_BOX_SIZE_PX * PICK_TOLERANCE_FACTORS[PICK_TOLERANCE_FACTORS.length - 1]) / zoom;
        const tryResolveEntity = async (entityId: string): Promise<Record<string, unknown> | null> => {
          try {
            const detail = await getDwgEntity(docId, entityId);
            if (detail.entity && typeof detail.entity === 'object') return detail.entity;
          } catch {
            // fall back to local cache
          }
          const localEnt = entities.find((e) => e.id === entityId) || null;
          return localEnt ? (localEnt as unknown as Record<string, unknown>) : null;
        };

        if (selectionScope === 'block') {
          // Block mode: only pick a block when the cursor actually hits a child entity.
          // This avoids false positives where clicking blank area inside block bbox selects the block.
          let pickedSourceEntityId: string | null = null;
          let pickedSourceParentBlockId: string | null = null;
          for (const factor of PICK_TOLERANCE_FACTORS) {
            const picked = await pickDwgEntity(docId, {
              space_id: activeSpace,
              point: worldPoint,
              tolerance: (BLOCK_PICK_BOX_SIZE_PX * factor) / zoom,
              selection_scope: 'entity',
            });
            const first = picked.picked?.[0];
            if (!first?.entity_id) continue;
            pickedSourceEntityId = String(first.entity_id);
            const parentId = typeof first.parent_block_id === 'string' ? first.parent_block_id.trim() : '';
            pickedSourceParentBlockId = parentId || null;
            break;
          }

          if (!pickedSourceEntityId) {
            clearSelection();
            setSelectionScope('block');
            setActiveBlockId(null);
            setActiveBlockName('');
            setActiveBlockEntity(null);
            return;
          }

          const sourceEntity = await tryResolveEntity(pickedSourceEntityId);
          if (!sourceEntity) {
            clearSelection();
            return;
          }
          if (!isLayerSelectable((sourceEntity as Record<string, unknown>).layer)) {
            clearSelection();
            return;
          }
          const sourceHitTolWorld = pickedSourceParentBlockId ? blockMaxTolWorld : maxTolWorld;
          if (!isEntityRecordHit(sourceEntity, worldPoint, sourceHitTolWorld, activeSpace)) {
            clearSelection();
            return;
          }

          if (!pickedSourceParentBlockId) {
            setSelectionScope('block');
            setActiveBlockId(null);
            setActiveBlockName('');
            setActiveBlockEntity(null);
            applySelection([pickedSourceEntityId], [sourceEntity]);
            return;
          }

          const blockEntity = await tryResolveEntity(pickedSourceParentBlockId);
          if (!blockEntity) {
            applySelection([pickedSourceEntityId], [sourceEntity]);
            return;
          }
          if (!isLayerSelectable((blockEntity as Record<string, unknown>).layer)) {
            clearSelection();
            return;
          }
          const geom = blockEntity.geom && typeof blockEntity.geom === 'object' ? (blockEntity.geom as Record<string, unknown>) : {};
          setSelectionScope('block');
          setActiveBlockId(null);
          setActiveBlockName('');
          setActiveBlockEntity(null);
          applySelection([pickedSourceParentBlockId], [blockEntity]);
          if (isBlockRefType(blockEntity.type)) {
            setActiveBlockName(String(geom.block_name ?? pickedSourceParentBlockId));
          }
          return;
        }

        if (!activeBlockId) {
          exitBlockInternalSelection();
          return;
        }

        let pickedEntityId: string | null = null;
        for (const factor of PICK_TOLERANCE_FACTORS) {
          const picked = await pickDwgEntity(docId, {
            space_id: activeSpace,
            point: worldPoint,
            tolerance: (PICK_BOX_SIZE_PX * factor) / zoom,
            selection_scope: 'entity',
            parent_block_id: activeBlockId,
          });
          const first = picked.picked?.[0];
          if (first?.entity_id) {
            pickedEntityId = first.entity_id;
            break;
          }
        }

        if (!pickedEntityId) {
          const scopedEntities = entities.filter(
            (ent) => String(ent.parent_block_id || '') === activeBlockId && isLayerSelectable(ent.layer)
          );
          const localScopedId = findLocalPickEntityId(worldPoint, maxTolWorld, scopedEntities, worldViewBounds);
          if (localScopedId) {
            pickedEntityId = localScopedId;
          }
        }

        if (!pickedEntityId) {
          if (activeBlockEntity) {
            applySelection([activeBlockId], [activeBlockEntity]);
          }
          return;
        }

        const entityRecord = await tryResolveEntity(pickedEntityId);
        if (!entityRecord) return;
        if (!isLayerSelectable((entityRecord as Record<string, unknown>).layer)) return;
        if (!isEntityRecordHit(entityRecord, worldPoint, maxTolWorld, activeSpace)) return;
        applySelection([pickedEntityId], [entityRecord]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'pick failed');
      }
    },
    [
      docId,
      isPanning,
      screenToWorld,
      mode,
      snapEnabled,
      snapCandidatePoint,
      activeSpace,
      zoom,
      handleMeasure,
      entities,
      worldViewBounds,
      selectionScope,
      activeBlockId,
      activeBlockEntity,
      exitBlockInternalSelection,
      clearSelection,
      applySelection,
      isLayerSelectable,
    ]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvases = [geometryCanvasRef.current, textCanvasRef.current, overlayCanvasRef.current];
    if (!viewport || canvases.some((c) => !c)) return;

    const updateSize = () => {
      const rect = viewport.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      setCanvasMetrics((prev) => {
        if (prev.width === width && prev.height === height && Math.abs(prev.dpr - dpr) < 1e-6) return prev;
        return { width, height, dpr };
      });
    };

    updateSize();
    const obs = new ResizeObserver(updateSize);
    obs.observe(viewport);
    window.addEventListener('resize', updateSize);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    const canvases = [geometryCanvasRef.current, textCanvasRef.current, overlayCanvasRef.current];
    for (const canvas of canvases) {
      if (!canvas) continue;
      canvas.width = Math.max(1, Math.floor(canvasMetrics.width * canvasMetrics.dpr));
      canvas.height = Math.max(1, Math.floor(canvasMetrics.height * canvasMetrics.dpr));
      canvas.style.width = `${canvasMetrics.width}px`;
      canvas.style.height = `${canvasMetrics.height}px`;
    }
  }, [canvasMetrics]);

  const selectedLine = useMemo(() => {
    if (selectedEntities.length > 1) return null;
    if (!selectedEntity || selectedEntity.type !== 'LINE' || typeof selectedEntity.geom !== 'object') return null;
    const geom = selectedEntity.geom as Record<string, any>;
    if (!isPoint(geom.start) || !isPoint(geom.end)) return null;
    return { start: geom.start as WorldPoint, end: geom.end as WorldPoint };
  }, [selectedEntities.length, selectedEntity]);

  const selectedBlockBBox = useMemo(() => {
    if (selectedEntities.length > 1) return null;
    if (!selectedEntity || !isBlockRefType(selectedEntity.type)) return null;
    const bbox = selectedEntity.bbox as Record<string, unknown> | undefined;
    if (!bbox || typeof bbox !== 'object') return null;
    const bmin = bbox.min as Record<string, unknown> | undefined;
    const bmax = bbox.max as Record<string, unknown> | undefined;
    if (!bmin || !bmax) return null;
    const minX = Number(bmin.x);
    const minY = Number(bmin.y);
    const maxX = Number(bmax.x);
    const maxY = Number(bmax.y);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return {
      min: { x: Math.min(minX, maxX), y: Math.min(minY, maxY) },
      max: { x: Math.max(minX, maxX), y: Math.max(minY, maxY) },
    };
  }, [selectedEntities.length, selectedEntity]);

  const selectedCount = useMemo(() => {
    if (selectedEntities.length > 0) return selectedEntities.length;
    if (selectedEntity) return 1;
    return 0;
  }, [selectedEntities, selectedEntity]);

  const selectedPropertySections = useMemo(() => {
    if (selectedEntities.length > 1) return buildMultiEntityPropertySections(selectedEntities);
    if (selectedEntities.length === 1) return getEntityPropertySections(selectedEntities[0]);
    if (!selectedEntity) return [];
    return getEntityPropertySections(selectedEntity);
  }, [selectedEntities, selectedEntity]);

  const selectedCadHandle = useMemo(() => {
    if (selectedCount > 1) return `已选${selectedCount}`;
    if (selectedEntities.length === 1) return extractCadHandleAndPath(selectedEntities[0]).handle;
    if (selectedEntity) return extractCadHandleAndPath(selectedEntity).handle;
    if (selectedEntityId) return extractCadHandleAndPath({ id: selectedEntityId }).handle;
    return '--';
  }, [selectedCount, selectedEntities, selectedEntity, selectedEntityId]);

  const selectedJsonPreview = useMemo(() => {
    if (selectedEntities.length > 1) {
      return {
        selection_count: selectedEntities.length,
        types: Array.from(new Set(selectedEntities.map((ent) => String(ent.type || '--').toUpperCase()))),
        ids: selectedEntityIds,
      };
    }
    if (selectedEntities.length === 1) return selectedEntities[0];
    return selectedEntity;
  }, [selectedEntities, selectedEntityIds, selectedEntity]);

  const docFontSummary = useMemo(() => {
    const total = docFonts.length;
    const available = docFonts.filter((f) => f.available).length;
    const shx = docFonts.filter((f) => String(f.kind || '').toLowerCase() === 'shx').length;
    return { total, available, shx };
  }, [docFonts]);

  const shxStatusBadge = useMemo(() => {
    if (!shxRenderStatus.detected) return null;
    if (shxRenderStatus.trueOutline) {
      return {
        label: 'SHX 真实轮廓',
        className: 'border-emerald-600/40 bg-emerald-950/30 text-emerald-200',
      };
    }
    return {
      label: 'SHX 降级显示',
      className: 'border-amber-600/40 bg-amber-950/30 text-amber-200',
    };
  }, [shxRenderStatus]);

  const shxFontDiagnosticWarning = useMemo(
    () => buildShxFontDiagnosticFromDocFonts(shxRenderStatus, docFonts),
    [shxRenderStatus, docFonts]
  );
  const shxDebugMatch = useMemo(() => shxRenderStatus.debugMatch, [shxRenderStatus.debugMatch]);
  const warningLines = useMemo<WarningLineItem[]>(() => {
    const merged: WarningLineItem[] = warnings.map((text, index) => ({
      id: `w-${index}-${text}`,
      text,
      kind: 'normal',
    }));
    if (shxFontDiagnosticWarning && !warnings.includes(shxFontDiagnosticWarning)) {
      merged.push({
        id: `shx-diagnostic-${shxFontDiagnosticWarning}`,
        text: shxFontDiagnosticWarning,
        kind: 'shx_diagnostic',
      });
    }
    return merged;
  }, [warnings, shxFontDiagnosticWarning]);
  const canToggleWarnings = warningLines.length > 0;

  const shxMissingOriginalFontNames = useMemo(() => {
    if (shxRenderStatus.missingOriginalShxFonts.length > 0) return shxRenderStatus.missingOriginalShxFonts;
    const names: string[] = [];
    const seen = new Set<string>();
    for (const font of docFonts) {
      if (String(font.kind || '').trim().toLowerCase() !== 'shx') continue;
      if (!Boolean(font.fallback_shx_hit)) continue;
      const label = String(font.name || font.style_name || font.key || '').trim() || '未命名SHX';
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(label);
    }
    return names;
  }, [shxRenderStatus.missingOriginalShxFonts, docFonts]);

  const selectionScopeLabel = useMemo(() => {
    if (selectionScope === 'entity') return activeBlockName ? `块内选择: ${activeBlockName}` : '块内选择';
    return '块选择';
  }, [activeBlockName, selectionScope]);

  const toggleHierarchyNode = useCallback((nodeId: string) => {
    setExpandedHierarchyNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleHierarchyNodeSelect = useCallback(
    async (node: DwgHierarchyNode) => {
      if (node.node_kind === 'category') {
        toggleHierarchyNode(node.node_id);
        return;
      }
      if (!isLayerSelectable(node.layer)) return;
      const entityId = typeof node.entity_id === 'string' ? node.entity_id.trim() : '';
      if (!entityId || !docId) return;

      let detailRecord: Record<string, unknown> | null = null;
      const localEnt = entities.find((e) => e.id === entityId) || null;
      if (localEnt) detailRecord = localEnt as unknown as Record<string, unknown>;

      try {
        const detail = await getDwgEntity(docId, entityId);
        if (detail.entity && typeof detail.entity === 'object') detailRecord = detail.entity;
      } catch {
        // ignore detail fetch errors, keep best local info
      }
      if (!detailRecord) return;
      applySelection([entityId], [detailRecord]);
    },
    [docId, entities, isLayerSelectable, toggleHierarchyNode, applySelection]
  );

  const handleHierarchyLocate = useCallback(
    (node: DwgHierarchyNode) => {
      const bounds = hierarchyBboxToWorldBounds(node.bbox);
      if (!bounds) return;
      focusWorldBounds(bounds);
    },
    [focusWorldBounds]
  );

  useEffect(() => {
    if (!selectedEntityIds.length) {
      setSelectedHierarchyNodeIds(new Set());
      return;
    }
    const selectedNodeIds = new Set<string>();
    setExpandedHierarchyNodeIds((prev) => {
      const next = new Set(prev);
      for (const entityId of selectedEntityIds) {
        const path = findHierarchyPathByEntityId(hierarchyNodes, entityId);
        if (!path || path.length === 0) continue;
        selectedNodeIds.add(path[path.length - 1]);
        for (let i = 0; i < path.length - 1; i += 1) next.add(path[i]);
      }
      return next;
    });
    setSelectedHierarchyNodeIds(selectedNodeIds);
  }, [hierarchyNodes, selectedEntityIds]);

  useEffect(() => {
    if (selectedEntities.length === 0) return;
    if (selectedEntities.every((ent) => isLayerSelectable(ent.layer))) return;
    clearSelection();
  }, [isLayerSelectable, selectedEntities, clearSelection]);

  const hierarchyRows = useMemo(() => {
    const rows: ReactElement[] = [];
    const renderNodes = (nodes: DwgHierarchyNode[], depth: number) => {
      for (const node of nodes) {
        const children = hierarchyChildren(node);
        const hasChildren = children.length > 0;
        const expanded = hasChildren && expandedHierarchyNodeIds.has(node.node_id);
        const isSelected = selectedHierarchyNodeIds.has(node.node_id);
        const selectable = node.node_kind === 'category' ? true : isLayerSelectable(node.layer);
        const rowLabel = node.node_kind === 'category' ? `${node.label} (${children.length})` : node.label || node.handle || '--';

        rows.push(
          <div
            key={node.node_id}
            className={`flex items-center gap-1 px-2 py-1 rounded ${selectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'} ${
              isSelected ? 'bg-cyan-900/35 text-cyan-100' : 'hover:bg-gray-800/70 text-gray-200'
            }`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            onClick={() => {
              if (node.node_kind === 'category') toggleHierarchyNode(node.node_id);
              else if (selectable) handleHierarchyNodeSelect(node);
            }}
            title={node.node_kind === 'category' ? `类别 ${node.label}` : `${selectable ? '' : '已被图层过滤 '}句柄 ${node.handle || '--'}`}
          >
            {hasChildren ? (
              <button
                type="button"
                className="h-4 w-4 inline-flex items-center justify-center text-gray-400 hover:text-gray-200"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHierarchyNode(node.node_id);
                }}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="inline-block h-4 w-4" />
            )}

            <span className={`truncate flex-1 ${node.node_kind === 'category' ? 'text-gray-300 font-medium' : ''}`}>{rowLabel}</span>

            {node.node_kind !== 'category' && (
              <span className="text-[10px] text-gray-500">{node.type || '--'}</span>
            )}

            {node.node_kind !== 'category' && node.bbox && (
              <button
                type="button"
                className="h-5 w-5 inline-flex items-center justify-center text-emerald-300 hover:text-emerald-200"
                title="定位"
                onClick={(e) => {
                  e.stopPropagation();
                  handleHierarchyLocate(node);
                }}
              >
                <LocateFixed className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );

        if (expanded) renderNodes(children, depth + 1);
      }
    };

    renderNodes(hierarchyNodes, 0);
    return rows;
  }, [expandedHierarchyNodeIds, handleHierarchyLocate, handleHierarchyNodeSelect, hierarchyNodes, isLayerSelectable, selectedHierarchyNodeIds, toggleHierarchyNode]);

  useEffect(() => {
    const gCanvas = geometryCanvasRef.current;
    const tCanvas = textCanvasRef.current;
    const oCanvas = overlayCanvasRef.current;
    if (!gCanvas || !tCanvas || !oCanvas) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const gctx = gCanvas.getContext('2d');
      const tctx = tCanvas.getContext('2d');
      const octx = oCanvas.getContext('2d');
      if (!gctx || !tctx || !octx) return;

      const pixelW = gCanvas.width;
      const pixelH = gCanvas.height;
      const dpr = canvasMetrics.dpr;

      for (const ctx of [gctx, tctx, octx]) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pixelW, pixelH);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      gctx.fillStyle = '#030712';
      gctx.fillRect(0, 0, canvasMetrics.width, canvasMetrics.height);

      gctx.strokeStyle = '#111827';
      gctx.lineWidth = 1;
      for (let i = 0; i <= 20; i += 1) {
        const worldX = (i - 10) * 50;
        const p1 = worldToScreen({ x: worldX, y: -500, z: 0 });
        const p2 = worldToScreen({ x: worldX, y: 500, z: 0 });
        gctx.beginPath();
        gctx.moveTo(p1.x, p1.y);
        gctx.lineTo(p2.x, p2.y);
        gctx.stroke();
      }
      for (let i = 0; i <= 20; i += 1) {
        const worldY = (i - 10) * 50;
        const p1 = worldToScreen({ x: -500, y: worldY, z: 0 });
        const p2 = worldToScreen({ x: 500, y: worldY, z: 0 });
        gctx.beginPath();
        gctx.moveTo(p1.x, p1.y);
        gctx.lineTo(p2.x, p2.y);
        gctx.stroke();
      }

      const origin = worldToScreen({ x: 0, y: 0, z: 0 });
      const originInView =
        origin.x >= -80 &&
        origin.x <= canvasMetrics.width + 80 &&
        origin.y >= -80 &&
        origin.y <= canvasMetrics.height + 80;
      if (originInView) {
        octx.save();
        octx.strokeStyle = 'rgba(239,68,68,0.8)';
        octx.lineWidth = 1.2;
        octx.beginPath();
        octx.moveTo(0, origin.y);
        octx.lineTo(canvasMetrics.width, origin.y);
        octx.stroke();

        octx.strokeStyle = 'rgba(34,197,94,0.8)';
        octx.beginPath();
        octx.moveTo(origin.x, 0);
        octx.lineTo(origin.x, canvasMetrics.height);
        octx.stroke();

        octx.fillStyle = '#f8fafc';
        octx.strokeStyle = 'rgba(15,23,42,0.95)';
        octx.lineWidth = 1.5;
        octx.beginPath();
        octx.arc(origin.x, origin.y, 4.5, 0, Math.PI * 2);
        octx.fill();
        octx.stroke();

        octx.font = '12px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
        octx.fillStyle = '#e2e8f0';
        octx.strokeStyle = 'rgba(2,6,23,0.9)';
        octx.lineWidth = 3;
        octx.textAlign = 'left';
        octx.textBaseline = 'bottom';
        octx.strokeText('O (0,0)', origin.x + 8, origin.y - 8);
        octx.fillText('O (0,0)', origin.x + 8, origin.y - 8);
        octx.textBaseline = 'top';
        octx.strokeText('+X', canvasMetrics.width - 24, origin.y + 4);
        octx.fillText('+X', canvasMetrics.width - 24, origin.y + 4);
        octx.textAlign = 'center';
        octx.strokeText('+Y', origin.x, 6);
        octx.fillText('+Y', origin.x, 6);
        octx.restore();
      } else {
        octx.save();
        octx.font = '12px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
        octx.textAlign = 'left';
        octx.textBaseline = 'top';
        octx.fillStyle = '#94a3b8';
        octx.fillText('WCS 原点不在当前视图: (0,0)', 12, 12);
        octx.restore();
      }

      const wipeoutDrawQueue: Array<() => void> = [];
      const textDrawQueue: Array<() => void> = [];
      const metricsCache = textMetricsCacheRef.current;
      const readCachedLineMetrics = (fontKey: string, line: string, fallbackFontSize: number): CachedLineMetrics => {
        const key = `${fontKey}\n${line}`;
        const cached = metricsCache.get(key);
        if (cached) return cached;
        const m = tctx.measureText(line);
        const advance = Number.isFinite(m.width) ? m.width : line.length * fallbackFontSize * 0.55;
        const leftOverhang = Number.isFinite((m as TextMetrics).actualBoundingBoxLeft) ? (m as TextMetrics).actualBoundingBoxLeft : 0;
        const rightOverhang = Number.isFinite((m as TextMetrics).actualBoundingBoxRight)
          ? (m as TextMetrics).actualBoundingBoxRight - advance
          : 0;
        const ascent = Number.isFinite((m as TextMetrics).actualBoundingBoxAscent)
          ? Math.max((m as TextMetrics).actualBoundingBoxAscent, fallbackFontSize * 0.72)
          : fallbackFontSize * 0.82;
        const descent = Number.isFinite((m as TextMetrics).actualBoundingBoxDescent)
          ? Math.max((m as TextMetrics).actualBoundingBoxDescent, fallbackFontSize * 0.18)
          : fallbackFontSize * 0.24;
        const packed: CachedLineMetrics = { advance, leftOverhang, rightOverhang, ascent, descent };
        metricsCache.set(key, packed);
        if (metricsCache.size > 12000) {
          metricsCache.clear();
        }
        return packed;
      };
      const queueTextDraw = (options: {
        text: string;
        anchor: WorldPoint;
        color: string;
        rotation: number;
        actualHeight: number;
        widthFactor: number;
        oblique: number;
        mirroredX: boolean;
        mirroredY: boolean;
        align: CanvasTextAlign;
        baseline: CanvasTextBaseline;
        isMText: boolean;
        textMask?: boolean;
        textMaskPadding?: number;
        subtype?: string;
        fontFamily?: string;
        lightweightMode?: boolean;
      }) => {
        textDrawQueue.push(() => {
          const p = worldToScreen(options.anchor);
          if (![p.x, p.y].every(Number.isFinite)) return;

          const lightweightMode = Boolean(options.lightweightMode);
          const projectedFontSize = options.actualHeight * zoom;
          const minProjectedFontSize = lightweightMode ? 1.1 : 0.35;
          if (!Number.isFinite(projectedFontSize) || projectedFontSize <= minProjectedFontSize) return;
          const isDimensionText = String(options.subtype || '').toLowerCase() === 'dimension_text';
          let fontSize = Math.min(lightweightMode ? 112 : 256, projectedFontSize);
          if (isDimensionText && !lightweightMode) {
            // Keep dimension annotations readable at far zoom-out without affecting normal CAD TEXT.
            fontSize = Math.max(5.5, Math.min(56, fontSize));
          }
          const shear = Math.tan((options.oblique * Math.PI) / 180);
          const rawLines = options.text.split('\n').filter((l) => l.length > 0);
          const lines = lightweightMode ? rawLines.slice(0, 4).map((line) => truncateCadLine(line, 42)) : rawLines;
          if (!lines.length) return;

          tctx.save();
          tctx.translate(p.x, p.y);
          tctx.rotate((-options.rotation * Math.PI) / 180);
          tctx.scale((options.mirroredX ? -1 : 1) * (Number.isFinite(options.widthFactor) && options.widthFactor > 0 ? options.widthFactor : 1), options.mirroredY ? -1 : 1);
          if (Number.isFinite(shear) && Math.abs(shear) > 1e-6) tctx.transform(1, 0, -shear, 1, 0, 0);
          tctx.font = `${fontSize}px ${options.fontFamily || CAD_TEXT_FALLBACK_FONT}`;
          tctx.fillStyle = options.color;
          tctx.strokeStyle = 'rgba(15,23,42,0.95)';
          tctx.lineWidth = Math.min(2.4, Math.max(0.12, fontSize * 0.08));
          tctx.textAlign = options.align;
          tctx.textBaseline = options.baseline;
          const lineGap = fontSize * (options.isMText ? 1.22 : 1.0);

          if (options.textMask && !lightweightMode) {
            const padScale = Number(options.textMaskPadding);
            const pad = Math.max(1.5, fontSize * (Number.isFinite(padScale) ? padScale : 0.2));
            const maskCorner = Math.max(1.5, Math.min(8, fontSize * 0.26));
            tctx.save();
            tctx.fillStyle = '#030712';
            tctx.globalAlpha = 0.92;
            const fontKey = tctx.font;
            lines.forEach((line, i) => {
              const y = i * lineGap;
              const { advance, leftOverhang, rightOverhang, ascent, descent } = readCachedLineMetrics(fontKey, line, fontSize);

              const xStart = options.align === 'center' ? -advance * 0.5 : options.align === 'right' ? -advance : 0;
              const xLeft = xStart - leftOverhang;
              const xRight = xStart + advance + rightOverhang;

              const textHeight = ascent + descent;
              let yTop = y - ascent;
              if (options.baseline === 'top') {
                yTop = y;
              } else if (options.baseline === 'middle') {
                yTop = y - textHeight * 0.5;
              } else if (options.baseline === 'bottom') {
                yTop = y - textHeight;
              }
              const maskX = xLeft - pad;
              const maskY = yTop - pad;
              const maskW = (xRight - xLeft) + pad * 2;
              const maskH = textHeight + pad * 2;
              fillRoundedRect(tctx, maskX, maskY, maskW, maskH, maskCorner);
            });
            tctx.restore();
          }

          lines.forEach((line, i) => {
            const y = i * lineGap;
            if (!lightweightMode && fontSize >= 2.2) tctx.strokeText(line, 0, y);
            tctx.fillText(line, 0, y);
          });
          tctx.restore();
        });
      };

      for (const entity of entities) {
        if (!bboxVisible(entity.bbox, worldViewBounds)) continue;
        const geom = (entity.geom || {}) as Record<string, any>;
        const type = String(entity.type || '').toUpperCase();
        const strokeColor = entityColor(entity);
        const entityBaseStrokeWidth = resolveStrokeWidthPx(entity, zoom, showNormalLineweight);

        if (type === 'TEXT') {
          const pos = geom.position;
          const text = cleanCadText(String(geom.text || ''));
          if (!isPoint(pos) || !text) continue;

          const horizontalMode = `${String(geom.horizontal_mode || '')} ${String(geom.attachment || '')}`.trim();
          const verticalMode = `${String(geom.vertical_mode || '')} ${String(geom.attachment || '')}`.trim();
          const align = resolveTextAlign(horizontalMode);
          const baseline = resolveTextBaseline(verticalMode);
          const anchor = getBboxAnchor(entity.bbox, align, baseline) || pos;
          const rotation = Number(geom.rotation || 0);
          const textHeight = Number(geom.height || 100);
          const actualHeight = Number(geom.actual_height || textHeight || 100);
          const widthFactor = Number(geom.width_factor || 1);
          const oblique = Number(geom.oblique || 0);
          const mirroredX = Boolean(geom.mirrored_x);
          const mirroredY = Boolean(geom.mirrored_y);
          const textFontKind = firstNonEmptyString([String(geom.font_kind ?? '')]);
          const cadFontFamily = resolveCadTextFontFamily(geom.font_key, geom.font_family, geom.font_name);
          queueTextDraw({
            text,
            anchor,
            color: strokeColor,
            rotation,
            actualHeight,
            widthFactor,
            oblique,
            mirroredX,
            mirroredY,
            align,
            baseline,
            isMText: Boolean(geom.is_mtext),
            subtype: String(geom.subtype || ''),
            fontFamily: cadFontFamily,
            lightweightMode: isShxFallbackText(shxRenderStatus, textFontKind),
          });
          continue;
        }

        gctx.strokeStyle = strokeColor;
        gctx.fillStyle = 'transparent';
        gctx.lineWidth = entityBaseStrokeWidth;
        gctx.lineCap = 'round';
        gctx.lineJoin = 'round';

        if (type === 'POINT') {
          const pos = geom.position;
          if (!isPoint(pos)) continue;
          const p = worldToScreen(pos);
          const markerPx = Math.max(2, Math.min(8, Number(geom.display_size || 6)));
          gctx.beginPath();
          gctx.arc(p.x, p.y, markerPx * 0.35, 0, Math.PI * 2);
          gctx.fillStyle = strokeColor;
          gctx.fill();
          gctx.beginPath();
          gctx.moveTo(p.x - markerPx, p.y);
          gctx.lineTo(p.x + markerPx, p.y);
          gctx.moveTo(p.x, p.y - markerPx);
          gctx.lineTo(p.x, p.y + markerPx);
          gctx.stroke();
          continue;
        }

        if (type === 'LINE') {
          const start = geom.start;
          const end = geom.end;
          if (!isPoint(start) || !isPoint(end)) continue;
          const s = worldToScreen(start);
          const e = worldToScreen(end);
          gctx.beginPath();
          gctx.moveTo(s.x, s.y);
          gctx.lineTo(e.x, e.y);
          gctx.stroke();
          continue;
        }

        if (type === 'POLYLINE' || type === 'SPLINE') {
          const points = (geom.vertices || geom.points) as unknown;
          if (!Array.isArray(points)) continue;
          const screenPts = points.filter(isPoint).map((p) => worldToScreen(p));
          if (screenPts.length < 2) continue;
          gctx.beginPath();
          gctx.moveTo(screenPts[0].x, screenPts[0].y);
          for (let i = 1; i < screenPts.length; i += 1) gctx.lineTo(screenPts[i].x, screenPts[i].y);
          if (type === 'POLYLINE' && Boolean(geom.closed) && screenPts.length > 2) {
            gctx.closePath();
          }
          gctx.stroke();
          continue;
        }

        if (type === 'HATCH') {
          const loops = Array.isArray(geom.loops) ? geom.loops : [];
          const hasSolidFill = Boolean(geom.solid_fill);
          const patternName = String(geom.pattern_name || 'SOLID');
          const patternAngle = Number(geom.pattern_angle);
          const patternScale = Number(geom.pattern_scale);
          const patternSpacing = Number(geom.pattern_spacing);
          const rings: Array<Array<{ x: number; y: number }>> = [];
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          for (const loop of loops) {
            const points = Array.isArray(loop?.points) ? loop.points : [];
            const screenPts = points
              .filter((p: unknown): p is WorldPoint => isPoint(p))
              .map((p: WorldPoint) => worldToScreen(p))
              .filter((p: { x: number; y: number }) => Number.isFinite(p.x) && Number.isFinite(p.y));
            if (screenPts.length < 3) continue;
            rings.push(screenPts);
            for (const p of screenPts) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
          }
          if (!rings.length) continue;

          const patternNameLower = patternName.trim().toLowerCase();
          const patternEnabled = patternNameLower && patternNameLower !== 'solid';
          const hatchStrokeWidth = Math.max(0.7, Math.min(3.2, entityBaseStrokeWidth));
          gctx.lineWidth = hatchStrokeWidth;

          gctx.save();
          gctx.beginPath();
          const traced = traceClosedScreenRingsPath(gctx, rings);
          if (traced && hasSolidFill) {
            gctx.fillStyle = strokeColor;
            gctx.globalAlpha = 0.2;
            gctx.fill('evenodd');
          }
          gctx.restore();

          if (traced && patternEnabled && Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
            const scale = Number.isFinite(patternScale) && patternScale > 0 ? patternScale : 1;
            const worldSpacing = Number.isFinite(patternSpacing) && patternSpacing > 0 ? patternSpacing : 8;
            const spacingPx = Math.max(4, Math.min(64, worldSpacing * scale * zoom));
            const angleDeg = Number.isFinite(patternAngle) ? patternAngle : 45;
            const cross = hatchPatternIsCross(patternName);

            gctx.save();
            gctx.beginPath();
            traceClosedScreenRingsPath(gctx, rings);
            gctx.clip('evenodd');
            drawHatchPatternLinesInClip(
              gctx,
              { minX, minY, maxX, maxY },
              strokeColor,
              angleDeg,
              spacingPx,
              cross
            );
            gctx.restore();
          }

          gctx.beginPath();
          for (const ring of rings) {
            gctx.moveTo(ring[0].x, ring[0].y);
            for (let i = 1; i < ring.length; i += 1) gctx.lineTo(ring[i].x, ring[i].y);
            gctx.closePath();
          }
          gctx.stroke();
          continue;
        }

        if (type === 'CIRCLE') {
          const center = geom.center;
          const radius = Number(geom.radius);
          if (!isPoint(center) || !Number.isFinite(radius) || radius <= 0) continue;
          const c = worldToScreen(center);
          gctx.beginPath();
          gctx.arc(c.x, c.y, Math.max(radius * zoom, 0.5), 0, Math.PI * 2);
          gctx.stroke();
          continue;
        }

        if (type === 'ARC') {
          const center = geom.center;
          const start = geom.start;
          const end = geom.end;
          const radius = Number(geom.radius);
          if (!isPoint(center) || !isPoint(start) || !isPoint(end) || !Number.isFinite(radius) || radius <= 0) continue;
          const saWorld = Math.atan2(start.y - center.y, start.x - center.x);
          const eaWorld = Math.atan2(end.y - center.y, end.x - center.x);
          const ccwDelta = normalizeAngleRad(eaWorld - saWorld);
          const cwDelta = Math.PI * 2 - ccwDelta;
          const candidateSweepA = ccwDelta;
          const candidateSweepB = -cwDelta;

          let sweep = candidateSweepA;
          if (entity.bbox?.min && entity.bbox?.max && ccwDelta > 1e-6 && cwDelta > 1e-6) {
            const sampleA = sampleArcWorld(center, radius, saWorld, candidateSweepA, 12);
            const sampleB = sampleArcWorld(center, radius, saWorld, candidateSweepB, 12);
            const scoreA = arcBboxScore(bboxFromWorldPoints(sampleA), entity.bbox);
            const scoreB = arcBboxScore(bboxFromWorldPoints(sampleB), entity.bbox);
            if (scoreB < scoreA) sweep = candidateSweepB;
          }

          const screenRadius = Math.max(radius * zoom, 0.5);
          const steps = Math.max(8, Math.min(180, Math.ceil((Math.abs(sweep) * screenRadius) / 24)));
          const arcPts = sampleArcWorld(center, radius, saWorld, sweep, steps);
          if (arcPts.length < 2) continue;

          const p0 = worldToScreen(arcPts[0]);
          gctx.beginPath();
          gctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < arcPts.length; i += 1) {
            const p = worldToScreen(arcPts[i]);
            gctx.lineTo(p.x, p.y);
          }
          gctx.stroke();
          continue;
        }

        if (type === 'ELLIPSE') {
          const center = geom.center;
          const rx = Number(geom.rx);
          const ry = Number(geom.ry);
          const rotation = Number(geom.rotation || 0);
          if (!isPoint(center) || !Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) continue;

          const rotRad = (rotation * Math.PI) / 180;
          const cosR = Math.cos(rotRad);
          const sinR = Math.sin(rotRad);

          const startPoint = isPoint(geom.start) ? (geom.start as WorldPoint) : null;
          const endPoint = isPoint(geom.end) ? (geom.end as WorldPoint) : null;

          const paramFromPoint = (p: WorldPoint): number => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            const xr = dx * cosR + dy * sinR;
            const yr = -dx * sinR + dy * cosR;
            return Math.atan2(yr / ry, xr / rx);
          };

          let startRad: number;
          let deltaRad: number;
          if (startPoint && endPoint) {
            const sp = paramFromPoint(startPoint);
            const ep = paramFromPoint(endPoint);
            startRad = sp;
            deltaRad = normalizeAngleRad(ep - sp);
            if (deltaRad < 1e-6) deltaRad = Math.PI * 2;
          } else {
            const startAngle = Number(geom.start_angle);
            const endAngle = Number(geom.end_angle);
            let deltaDeg = 360;
            let startDeg = 0;
            if (Number.isFinite(startAngle) && Number.isFinite(endAngle)) {
              startDeg = startAngle;
              deltaDeg = ((endAngle - startAngle) % 360 + 360) % 360;
              if (deltaDeg < 1e-6) deltaDeg = 360;
            }
            startRad = (startDeg * Math.PI) / 180;
            deltaRad = (deltaDeg * Math.PI) / 180;
          }

          const candidateSweepA = deltaRad;
          const candidateSweepB = -(Math.PI * 2 - deltaRad);
          let sweep = candidateSweepA;
          if (entity.bbox?.min && entity.bbox?.max && deltaRad < Math.PI * 2 - 1e-6 && deltaRad > 1e-6) {
            const sampleA = sampleEllipseWorld(center, rx, ry, rotRad, startRad, candidateSweepA, 24);
            const sampleB = sampleEllipseWorld(center, rx, ry, rotRad, startRad, candidateSweepB, 24);
            const scoreA = arcBboxScore(bboxFromWorldPoints(sampleA), entity.bbox);
            const scoreB = arcBboxScore(bboxFromWorldPoints(sampleB), entity.bbox);
            if (scoreB < scoreA) sweep = candidateSweepB;
          }

          const approxPxRadius = Math.max(rx, ry) * zoom;
          const steps = Math.max(24, Math.min(240, Math.ceil((Math.abs(sweep) * Math.max(approxPxRadius, 1)) / 18)));
          const pts = sampleEllipseWorld(center, rx, ry, rotRad, startRad, sweep, steps);
          if (pts.length < 2) continue;
          const p0 = worldToScreen(pts[0]);
          gctx.beginPath();
          gctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i += 1) {
            const p = worldToScreen(pts[i]);
            gctx.lineTo(p.x, p.y);
          }
          gctx.stroke();
          continue;
        }

        const primitives = asPrimitiveList(geom as Record<string, unknown>);
        if (!primitives.length) continue;
        for (const primitive of primitives) {
          const primitiveStrokeWidth = resolveStrokeWidthPx(entity, zoom, showNormalLineweight, primitive);
          gctx.strokeStyle = strokeColor;
          gctx.lineWidth = primitiveStrokeWidth;
          if (primitive.kind === 'line') {
            if (!isPoint(primitive.start) || !isPoint(primitive.end)) continue;
            const s = worldToScreen(primitive.start);
            const e = worldToScreen(primitive.end);
            gctx.beginPath();
            gctx.moveTo(s.x, s.y);
            gctx.lineTo(e.x, e.y);
            gctx.stroke();
            continue;
          }
          if (primitive.kind === 'polyline') {
            const screenPts = primitive.points.filter(isPoint).map((p) => worldToScreen(p));
            if (screenPts.length < 2) continue;
            gctx.beginPath();
            gctx.moveTo(screenPts[0].x, screenPts[0].y);
            for (let i = 1; i < screenPts.length; i += 1) gctx.lineTo(screenPts[i].x, screenPts[i].y);
            if (Boolean(primitive.closed) && screenPts.length > 2) gctx.closePath();
            gctx.stroke();
            continue;
          }
          if (primitive.kind === 'polygon') {
            for (const ring of primitive.rings) {
              const screenPts = ring.filter(isPoint).map((p) => worldToScreen(p));
              if (screenPts.length < 3) continue;
              gctx.beginPath();
              gctx.moveTo(screenPts[0].x, screenPts[0].y);
              for (let i = 1; i < screenPts.length; i += 1) gctx.lineTo(screenPts[i].x, screenPts[i].y);
              gctx.closePath();
              if (primitive.wipeout) {
                const ptsCopy = screenPts.map((p) => ({ x: p.x, y: p.y }));
                wipeoutDrawQueue.push(() => {
                  gctx.save();
                  gctx.beginPath();
                  gctx.moveTo(ptsCopy[0].x, ptsCopy[0].y);
                  for (let i = 1; i < ptsCopy.length; i += 1) gctx.lineTo(ptsCopy[i].x, ptsCopy[i].y);
                  gctx.closePath();
                  gctx.fillStyle = '#030712';
                  gctx.globalAlpha = 1;
                  gctx.fill();
                  gctx.restore();
                });
                continue;
              }
              if (primitive.arrow_fill) {
                // If the world-space triangle becomes too small on screen, draw a readable
                // screen-space fallback arrow so dimensions/leaders remain usable when zoomed out.
                const area = Math.abs(
                  screenPts.reduce((acc, cur, i) => {
                    const next = screenPts[(i + 1) % screenPts.length];
                    return acc + cur.x * next.y - next.x * cur.y;
                  }, 0) * 0.5
                );
                if (area < 20 && screenPts.length >= 3) {
                  const tip = screenPts[0];
                  const baseMid = {
                    x: (screenPts[1].x + screenPts[2].x) * 0.5,
                    y: (screenPts[1].y + screenPts[2].y) * 0.5,
                  };
                  const dx = baseMid.x - tip.x;
                  const dy = baseMid.y - tip.y;
                  const dn = Math.hypot(dx, dy);
                  if (dn > 1e-6) {
                    const ux = dx / dn;
                    const uy = dy / dn;
                    const nx = -uy;
                    const ny = ux;
                    const arrowLen = 7.5;
                    const halfW = 3.6;
                    const b1 = { x: tip.x + ux * arrowLen + nx * halfW, y: tip.y + uy * arrowLen + ny * halfW };
                    const b2 = { x: tip.x + ux * arrowLen - nx * halfW, y: tip.y + uy * arrowLen - ny * halfW };
                    gctx.save();
                    gctx.beginPath();
                    gctx.moveTo(tip.x, tip.y);
                    gctx.lineTo(b1.x, b1.y);
                    gctx.lineTo(b2.x, b2.y);
                    gctx.closePath();
                    gctx.fillStyle = strokeColor;
                    gctx.lineWidth = Math.max(0.8, primitiveStrokeWidth);
                    gctx.globalAlpha = 1;
                    gctx.fill();
                    gctx.restore();
                  }
                } else {
                  gctx.save();
                  gctx.fillStyle = strokeColor;
                  gctx.globalAlpha = 1;
                  gctx.fill();
                  gctx.restore();
                  gctx.stroke();
                }
                continue;
              }
              if (primitive.filled) {
                gctx.save();
                gctx.fillStyle = strokeColor;
                gctx.globalAlpha = 0.18;
                gctx.fill();
                gctx.restore();
              }
              gctx.stroke();
            }
            continue;
          }
          if (primitive.kind === 'text') {
            const pos = primitive.position;
            const text = cleanCadText(String(primitive.text || ''));
            if (!isPoint(pos) || !text) continue;
            const align = resolveTextAlign(String(primitive.horizontal_mode || ''));
            const baseline = resolveTextBaseline(String(primitive.vertical_mode || ''));
            const textHeight = Number(primitive.height || 100);
            const actualHeight = Number(primitive.actual_height || textHeight || 100);
            const widthFactor = Number(primitive.width_factor || 1);
            const oblique = Number(primitive.oblique || 0);
            const mirroredX = Boolean(primitive.mirrored_x);
            const mirroredY = Boolean(primitive.mirrored_y);
            const textFontKind = firstNonEmptyString([String(primitive.font_kind ?? ''), String(geom.font_kind ?? '')]);
            const cadFontFamily = resolveCadTextFontFamily(primitive.font_key, primitive.font_family, primitive.font_name);
            queueTextDraw({
              text,
              anchor: pos,
              color: strokeColor,
              rotation: Number(primitive.rotation || 0),
              actualHeight,
              widthFactor,
              oblique,
              mirroredX,
              mirroredY,
              align,
              baseline,
              isMText: Boolean(primitive.is_mtext),
              textMask: Boolean(primitive.text_mask),
              textMaskPadding: Number(primitive.text_mask_padding),
              subtype: String(primitive.subtype || ''),
              fontFamily: cadFontFamily,
              lightweightMode: isShxFallbackText(shxRenderStatus, textFontKind),
            });
            continue;
          }
          if (primitive.kind === 'point') {
            if (!isPoint(primitive.position)) continue;
            const p = worldToScreen(primitive.position);
            const markerPx = Math.max(2, Math.min(8, Number(primitive.display_size || 6)));
            gctx.beginPath();
            gctx.arc(p.x, p.y, markerPx * 0.35, 0, Math.PI * 2);
            gctx.fillStyle = strokeColor;
            gctx.fill();
            gctx.beginPath();
            gctx.moveTo(p.x - markerPx, p.y);
            gctx.lineTo(p.x + markerPx, p.y);
            gctx.moveTo(p.x, p.y - markerPx);
            gctx.lineTo(p.x, p.y + markerPx);
            gctx.stroke();
          }
        }
      }

      wipeoutDrawQueue.forEach((draw) => draw());
      textDrawQueue.forEach((draw) => draw());

      if (selectedLine) {
        octx.strokeStyle = '#22d3ee';
        octx.lineWidth = 3;
        const s = worldToScreen(selectedLine.start);
        const e = worldToScreen(selectedLine.end);
        octx.beginPath();
        octx.moveTo(s.x, s.y);
        octx.lineTo(e.x, e.y);
        octx.stroke();
      }

      if (selectedBlockBBox) {
        const p1 = worldToScreen({ x: selectedBlockBBox.min.x, y: selectedBlockBBox.min.y, z: 0 });
        const p2 = worldToScreen({ x: selectedBlockBBox.max.x, y: selectedBlockBBox.max.y, z: 0 });
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        octx.save();
        octx.strokeStyle = '#22d3ee';
        octx.lineWidth = 2;
        octx.setLineDash([6, 4]);
        octx.strokeRect(x, y, Math.max(1, w), Math.max(1, h));
        octx.restore();
      }

      if (measurePoints.length > 0) {
        for (let i = 0; i < measurePoints.length; i += 1) {
          const p = worldToScreen(measurePoints[i]);
          octx.beginPath();
          octx.fillStyle = i === 0 ? '#22d3ee' : '#f59e0b';
          octx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          octx.fill();
        }
      }

      if (measurePoints.length === 2) {
        const p1 = worldToScreen(measurePoints[0]);
        const p2 = worldToScreen(measurePoints[1]);
        octx.strokeStyle = '#f59e0b';
        octx.lineWidth = 2;
        octx.beginPath();
        octx.moveTo(p1.x, p1.y);
        octx.lineTo(p2.x, p2.y);
        octx.stroke();
      }

      if (mode === 'measure' && snapEnabled && snapCandidatePoint) {
        const sp = worldToScreen(snapCandidatePoint);
        const modeLabel = snapModeToCn(snapCandidateMode);
        octx.save();
        octx.strokeStyle = '#67e8f9';
        octx.fillStyle = 'rgba(6,182,212,0.18)';
        octx.lineWidth = 1.3;
        octx.beginPath();
        octx.rect(sp.x - 5, sp.y - 5, 10, 10);
        octx.fill();
        octx.stroke();
        octx.beginPath();
        octx.moveTo(sp.x - 8, sp.y);
        octx.lineTo(sp.x + 8, sp.y);
        octx.moveTo(sp.x, sp.y - 8);
        octx.lineTo(sp.x, sp.y + 8);
        octx.stroke();
        octx.font = '11px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
        octx.textAlign = 'left';
        octx.textBaseline = 'bottom';
        octx.strokeStyle = 'rgba(2,6,23,0.96)';
        octx.lineWidth = 3;
        octx.strokeText(`捕捉: ${modeLabel}`, sp.x + 8, sp.y - 8);
        octx.fillStyle = '#a5f3fc';
        octx.fillText(`捕捉: ${modeLabel}`, sp.x + 8, sp.y - 8);
        octx.restore();
      }

      if (mode === 'select' && boxSelectStart && boxSelectCurrent) {
        const x = Math.min(boxSelectStart.x, boxSelectCurrent.x);
        const y = Math.min(boxSelectStart.y, boxSelectCurrent.y);
        const w = Math.abs(boxSelectCurrent.x - boxSelectStart.x);
        const h = Math.abs(boxSelectCurrent.y - boxSelectStart.y);
        const windowMode = boxSelectCurrent.x >= boxSelectStart.x;
        octx.save();
        octx.lineWidth = 1;
        octx.setLineDash(windowMode ? [] : [6, 4]);
        octx.strokeStyle = windowMode ? '#3b82f6' : '#22c55e';
        octx.fillStyle = windowMode ? 'rgba(59,130,246,0.12)' : 'rgba(34,197,94,0.10)';
        octx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
        octx.strokeRect(x, y, Math.max(1, w), Math.max(1, h));
        octx.restore();
      }

      if (mode === 'select' && cursorScreen && !isPanning) {
        const half = PICK_BOX_SIZE_PX * 0.5;
        octx.save();
        octx.strokeStyle = '#22d3ee';
        octx.lineWidth = 1;
        octx.strokeRect(cursorScreen.x - half, cursorScreen.y - half, PICK_BOX_SIZE_PX, PICK_BOX_SIZE_PX);
        octx.beginPath();
        octx.moveTo(cursorScreen.x - 3, cursorScreen.y);
        octx.lineTo(cursorScreen.x + 3, cursorScreen.y);
        octx.moveTo(cursorScreen.x, cursorScreen.y - 3);
        octx.lineTo(cursorScreen.x, cursorScreen.y + 3);
        octx.stroke();
        octx.restore();
      }
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [
    canvasMetrics.dpr,
    canvasMetrics.height,
    canvasMetrics.width,
    entities,
    measurePoints,
    selectedLine,
    selectedBlockBBox,
    worldToScreen,
    worldViewBounds,
    zoom,
    showNormalLineweight,
    mode,
    snapEnabled,
    snapCandidatePoint,
    snapCandidateMode,
    boxSelectStart,
    boxSelectCurrent,
    cursorScreen,
    isPanning,
    resolveCadTextFontFamily,
    shxRenderStatus,
  ]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">CAD 查看器</span>
          {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
          <span className="text-xs text-blue-300">模式: {backendMode}</span>
          {shxStatusBadge && <span className={`rounded border px-1.5 py-0.5 text-[11px] ${shxStatusBadge.className}`}>{shxStatusBadge.label}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${mode === 'select' ? 'text-cyan-300' : 'text-gray-400'}`}
            onClick={() => {
              setMode('select');
              setMeasurePoints([]);
              setMeasureValue('');
            }}
            title="选择"
          >
            <Crosshair className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${mode === 'measure' ? 'text-amber-300' : 'text-gray-400'}`}
            onClick={() => {
              setMode('measure');
              clearSelection();
            }}
            title="测量"
          >
            <Ruler className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400"
            onClick={focusExtents}
            title="全图"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-gray-300" onClick={focusOrigin} title="原点 (0,0)">
            O
          </Button>
          <span className="text-xs text-gray-400 px-1">{selectionScopeLabel}</span>
          {selectionScope === 'entity' && (
            <Button variant="ghost" size="sm" className="h-8 text-amber-300" onClick={exitBlockInternalSelection} title="退出块内选择">
              退出块内
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-gray-300"
            onClick={() => setShowTreeSidebar((v) => !v)}
            title={showTreeSidebar ? '隐藏元素树' : '显示元素树'}
          >
            {showTreeSidebar ? '隐藏元素树' : '元素树'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-gray-300"
            onClick={() => setShowPropertySidebar((v) => !v)}
            title={showPropertySidebar ? '隐藏属性栏' : '显示属性栏'}
          >
            {showPropertySidebar ? '隐藏属性' : '属性栏'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 ${showNormalLineweight ? 'text-cyan-300' : 'text-gray-300'}`}
            onClick={() => setShowNormalLineweight((v) => !v)}
            title={showNormalLineweight ? '已开启普通线宽(固定像素)' : '已关闭普通线宽(固定像素)'}
          >
            {showNormalLineweight ? '普通线宽:开' : '普通线宽:关'}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-gray-850 border-b border-gray-800">
        <span className="text-xs text-gray-400">空间</span>
        <select
          value={activeSpace}
          onChange={(e) => switchSpace(e.target.value)}
          className="bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700"
          disabled={!docId}
        >
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.display_name}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500 ml-2">缩放 {zoom.toFixed(4)}x</span>
        <span className="text-xs text-gray-500 ml-2">线宽模式: {showNormalLineweight ? 'CAD线宽(固定像素)' : '统一细线'}</span>
        <span className="text-xs text-gray-500 ml-2">左键点击拾取/框选 | 中键拖拽平移 | 中键双击全图</span>
        {cursorWorld && (
          <span className="text-xs text-gray-500 ml-2">
            光标 ({formatNumber(cursorWorld.x, 2)}, {formatNumber(cursorWorld.y, 2)})
          </span>
        )}
        <span className="text-xs text-gray-500 ml-2">
          图元 {entities.length}
          {entityTotal > entities.length ? ` / ${entityTotal}` : ''}
        </span>
        <span className="text-xs text-gray-500 ml-2">已选{selectedCount}</span>
        {boxSelectPreview && (
          <span className="text-xs text-cyan-300 ml-2">
            框选{boxSelectPreview.windowMode ? '窗口' : '交叉'} / {boxSelectModifierLabel} / 候选{boxSelectPreview.count}
          </span>
        )}
        <span className="text-xs text-gray-500 ml-2">
          树: 图元 {hierarchyEntityTotal} / 块{hierarchyBlockTotal}
        </span>
        <span className="text-xs text-gray-500 ml-2">
          字体 {docFontSummary.available}/{docFontSummary.total}
          {docFontSummary.shx > 0 ? ` · SHX ${docFontSummary.shx}` : ''}
        </span>
        {shxMissingOriginalFontNames.length > 0 && (
          <span
            className="text-xs text-amber-300 ml-2"
            title={`未命中原始 SHX 字体：${shxMissingOriginalFontNames.join('、')}`}
          >
            未命中SHX {shxMissingOriginalFontNames.slice(0, 2).join('、')}
            {shxMissingOriginalFontNames.length > 2 ? ` 等${shxMissingOriginalFontNames.length}项` : ''}
          </span>
        )}
        <span className="text-xs text-gray-500 ml-2">图层过滤: {filterSummaryLabel}</span>
        {mode === 'measure' && snapEnabled && (
          <span className="text-xs text-cyan-300 ml-2">
            捕捉: {snapCandidatePoint ? snapModeToCn(snapCandidateMode) : '无'}
          </span>
        )}
        {entityTruncated && <span className="text-xs text-amber-300 ml-2">已截断</span>}
        {measureValue && <span className="text-xs text-amber-300 ml-2">测量: {measureValue}</span>}
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className={`border-r border-gray-800 bg-gray-900 transition-all duration-200 overflow-hidden ${showTreeSidebar ? 'w-80' : 'w-0'}`}>
          <div className={`h-full text-xs text-gray-300 flex flex-col ${showTreeSidebar ? 'opacity-100' : 'opacity-0'}`}>
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-cyan-300" />
                <span className="font-medium">元素树</span>
              </div>
              <span className="text-gray-500">{activeSpace}</span>
            </div>

            <div className="px-3 py-1.5 border-b border-gray-800 text-[11px] text-gray-500">
              图元 {hierarchyEntityTotal} · 块{hierarchyBlockTotal}
            </div>

            <div className="px-3 py-2 border-b border-gray-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">图层过滤</span>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    layerFilterEnabled ? 'border-cyan-600 text-cyan-200 bg-cyan-900/25' : 'border-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                  onClick={toggleLayerFilterEnabled}
                >
                  {layerFilterEnabled ? '已启用' : '未启用'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-0.5 rounded border border-gray-700 text-[11px] text-gray-300 hover:text-gray-100 disabled:opacity-40"
                  onClick={setLayerFilterAll}
                  disabled={!layerFilterEnabled || availableLayers.length === 0}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded border border-gray-700 text-[11px] text-gray-300 hover:text-gray-100 disabled:opacity-40"
                  onClick={clearLayerFilterSelection}
                  disabled={!layerFilterEnabled}
                >
                  清空
                </button>
                <span className="text-[11px] text-gray-500 ml-auto">{filterSummaryLabel}</span>
              </div>

              <div className="text-[11px] text-gray-500">过滤仅影响选择，不影响图元显示。</div>

              <div className="max-h-24 overflow-auto space-y-1 pr-1">
                {availableLayers.length === 0 ? (
                  <div className="text-[11px] text-gray-500">当前空间无图层数据</div>
                ) : (
                  availableLayers.map((layer) => (
                    <label key={`layer-filter-${layer}`} className="flex items-center gap-2 text-[11px] text-gray-300">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-cyan-500"
                        checked={layerFilterEnabled && layerWhitelist.has(layer)}
                        disabled={!layerFilterEnabled}
                        onChange={() => toggleLayerInWhitelist(layer)}
                      />
                      <span className="truncate">{layer}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {hierarchyLoading ? (
              <div className="p-3 text-gray-500">正在加载元素树...</div>
            ) : hierarchyError ? (
              <div className="p-3 text-red-300">{hierarchyError}</div>
            ) : hierarchyRows.length === 0 ? (
              <div className="p-3 text-gray-500">当前空间暂无可展示元素。</div>
            ) : (
              <div className="flex-1 overflow-auto p-2 space-y-0.5">{hierarchyRows}</div>
            )}
          </div>
        </aside>

        <div
          ref={viewportRef}
          className="flex-1 relative bg-gray-950 select-none"
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              const now = Date.now();
              if (now - lastMiddleDownAtRef.current <= 450) {
                lastMiddleDownAtRef.current = 0;
                setIsPanning(false);
                focusExtents();
                return;
              }
              lastMiddleDownAtRef.current = now;
              setIsPanning(true);
              setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
              return;
            }

            if (e.button !== 0) return;
            if (mode !== 'select' || loading) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            setBoxSelectModifier(boxSelectModifierFromEvent(e));
            setBoxSelectStart({ x: sx, y: sy });
            setBoxSelectCurrent({ x: sx, y: sy });
            setIsBoxSelecting(false);
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            setCursorWorld(screenToWorld(sx, sy));
            setCursorScreen({ x: sx, y: sy });
            if (isPanning) {
              setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
              return;
            }

            if (mode !== 'select' || !boxSelectStart) return;
            if ((e.buttons & 1) !== 1) return;
            setBoxSelectModifier(boxSelectModifierFromEvent(e));
            const next = { x: sx, y: sy };
            setBoxSelectCurrent(next);
            const dx = next.x - boxSelectStart.x;
            const dy = next.y - boxSelectStart.y;
            if (!isBoxSelecting && Math.hypot(dx, dy) >= BOX_SELECT_DRAG_THRESHOLD_PX) {
              setIsBoxSelecting(true);
            }
          }}
          onMouseUp={(e) => {
            if (e.button === 1) {
              setIsPanning(false);
              return;
            }
            if (e.button !== 0) return;
            if (!boxSelectStart) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const releasePoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const end = boxSelectCurrent || releasePoint;
            const dx = end.x - boxSelectStart.x;
            const dy = end.y - boxSelectStart.y;
            const dragged = isBoxSelecting || Math.hypot(dx, dy) >= BOX_SELECT_DRAG_THRESHOLD_PX;

            setIsBoxSelecting(false);
            setBoxSelectStart(null);
            setBoxSelectCurrent(null);
            const finalModifier = boxSelectModifierFromEvent(e);
            setBoxSelectModifier('replace');

            if (!dragged || mode !== 'select') return;
            suppressClickAfterBoxRef.current = true;
            void handleBoxSelect(boxSelectStart, end, finalModifier);
          }}
          onMouseLeave={() => {
            setIsPanning(false);
            setIsBoxSelecting(false);
            setBoxSelectStart(null);
            setBoxSelectCurrent(null);
            setBoxSelectModifier('replace');
            setCursorWorld(null);
            setCursorScreen(null);
            setSnapCandidatePoint(null);
            setSnapCandidateMode(null);
          }}
          onWheel={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const worldX = (sx - screenCenter.x - pan.x) / zoom;
            const worldY = -(sy - screenCenter.y - pan.y) / zoom;
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const nextZoom = Math.max(1e-5, Math.min(20000, zoom * factor));
            setZoom(nextZoom);
            setPan({
              x: sx - screenCenter.x - worldX * nextZoom,
              y: sy - screenCenter.y + worldY * nextZoom,
            });
          }}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
        >
          <canvas ref={geometryCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 bg-gray-950/70">
              正在加载 DWG 会话...
            </div>
          )}
        </div>

        <aside className={`border-l border-gray-800 bg-gray-900 transition-all duration-200 overflow-hidden ${showPropertySidebar ? 'w-80' : 'w-0'}`}>
          <div className={`h-full text-xs text-gray-300 flex flex-col ${showPropertySidebar ? 'opacity-100' : 'opacity-0'}`}>
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hand className="h-3.5 w-3.5 text-cyan-300" />
                <span className="font-medium">属性</span>
              </div>
              <span className="text-gray-500">{selectedCadHandle}</span>
            </div>

            {selectedCount === 0 ? (
              <div className="p-3 text-gray-500">点击图元后在此显示属性。</div>
            ) : (
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {selectedPropertySections.map((section) => (
                  <details key={section.id} open={section.defaultOpen} className="rounded border border-gray-800 bg-gray-950/35">
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-gray-300 hover:text-gray-100 flex items-center justify-between">
                      <span>{section.title}</span>
                      <span className="text-[10px] text-gray-500">{section.rows.length}</span>
                    </summary>
                    <div className="px-2 pb-2 pt-1">
                      {section.rows.length === 0 ? (
                        <div className="text-[11px] text-gray-600">无</div>
                      ) : (
                        <div className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1">
                          {section.rows.map((row, idx) => (
                            <div key={`${section.id}-${row.key}-${idx}`} className="contents">
                              <span className="text-gray-500">{row.key}</span>
                              <span className="text-gray-200 break-all">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
                {selectedLine && (
                  <p className="text-gray-400">
                    线段: ({formatNumber(selectedLine.start.x)}, {formatNumber(selectedLine.start.y)}) - ({formatNumber(selectedLine.end.x)},{' '}
                    {formatNumber(selectedLine.end.y)})
                  </p>
                )}
                <details className="mt-1">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300">原始 JSON</summary>
                  <pre className="mt-1 max-h-56 overflow-auto rounded bg-gray-950/70 p-2 text-[11px] leading-4 text-gray-300">
                    {JSON.stringify(selectedJsonPreview, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </aside>
      </div>

      {warningLines.length > 0 && (
        <div className="px-3 py-2 bg-amber-900/20 border-t border-amber-800 text-amber-300 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-amber-200">警告 {warningLines.length} 条</p>
                {canToggleWarnings && (
                  <button
                    type="button"
                    onClick={() => setWarningsExpanded((prev) => !prev)}
                    className="shrink-0 rounded border border-amber-600/80 bg-amber-950/40 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/45"
                  >
                    {warningsExpanded ? '收起' : '展开'}
                  </button>
                )}
              </div>
              {warningsExpanded && shxDebugMatch && (
                <details className="rounded border border-cyan-700/70 bg-slate-950/60 px-2 py-1.5 text-cyan-100">
                  <summary className="cursor-pointer font-semibold text-cyan-200">SHX 匹配诊断（调试）</summary>
                  <div className="mt-1.5 space-y-1 text-[11px] leading-5">
                    <p>
                      向量文本 {shxDebugMatch.vectorizeTextEntityCount} / 键{shxDebugMatch.vectorizeTextKeysCount} / 图元{' '}
                      {shxDebugMatch.vectorizePrimitivesTotal}
                      {shxDebugMatch.vectorizeCacheHit ? ' / 缓存命中' : ' / 实时解析'}
                    </p>
                    <p>
                      候选实体{shxDebugMatch.attachCandidateEntityCount} / 匹配成功 {shxDebugMatch.matchedEntityCount} / 匹配失败{' '}
                      {shxDebugMatch.unmatchedEntityCount}
                    </p>
                    <p>
                      失败分类: 无轮廓{shxDebugMatch.noVectorizePayloadCount} · 键不一致{shxDebugMatch.keyMismatchCount} ·
                      字体过滤 {shxDebugMatch.filteredByFontKindCount} · 优化后空 {shxDebugMatch.emptyAfterOptimizeCount}
                    </p>
                    {shxDebugMatch.vectorizeError && <p>向量化错误 {shxDebugMatch.vectorizeError}</p>}
                    {shxDebugMatch.unmatchedKeySamples.length > 0 && (
                      <p>未匹配实体键样本: {shxDebugMatch.unmatchedKeySamples.slice(0, 8).join('、')}</p>
                    )}
                    {shxDebugMatch.orphanVectorizeKeySamples.length > 0 && (
                      <p>孤立向量键样本: {shxDebugMatch.orphanVectorizeKeySamples.slice(0, 8).join('、')}</p>
                    )}
                  </div>
                </details>
              )}
              {warningsExpanded &&
                warningLines.map((line) => {
                const missingFont = parseMissingFontWarningForUi(line.text);
                if (line.kind === 'shx_diagnostic' && !missingFont) {
                  return (
                    <div key={line.id} className="rounded border border-amber-600/70 bg-amber-950/45 px-2 py-1.5 text-amber-100">
                      <p className="font-semibold text-amber-200">SHX 字体诊断</p>
                      <p className="leading-5">{line.text}</p>
                    </div>
                  );
                }
                if (!missingFont) {
                  return <p key={line.id}>{line.text}</p>;
                }
                return (
                  <div key={line.id} className="rounded border border-amber-600/70 bg-amber-950/45 px-2 py-1.5 text-amber-100">
                    <p className="font-semibold text-amber-200">{missingFont.title}</p>
                    {missingFont.items.length > 0 ? (
                      missingFont.items.map((item, idx) => (
                        <p key={`${line.id}-item-${idx}`} className="leading-5">
                          {item}
                        </p>
                      ))
                    ) : (
                      <p className="leading-5">{line.text}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {error && <div className="px-3 py-2 bg-red-900/20 border-t border-red-800 text-red-300 text-xs">{error}</div>}
    </div>
  );
}
