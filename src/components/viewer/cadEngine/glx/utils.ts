import type { DwgEntityLite, DwgPrimitivePoint } from '@/services/dwgApi';
import type { PrimitiveRecord } from './types';

export function normalizeLayerName(layerRaw: unknown): string {
  const layer = String(layerRaw ?? '').trim();
  return layer || '0';
}

export function layerOrderFromEntities(entities: DwgEntityLite[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entity of entities) {
    const layer = normalizeLayerName(entity.layer);
    if (seen.has(layer)) continue;
    seen.add(layer);
    out.push(layer);
  }
  return out;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseFiniteNumber(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function toNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

export function toRadians(value: number): number {
  if (Math.abs(value) > Math.PI * 2 + 1e-3) {
    return (value * Math.PI) / 180;
  }
  return value;
}

export function pointXY(point: DwgPrimitivePoint | undefined | null): [number, number] | null {
  if (!point) return null;
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null;
  return [point.x, point.y];
}

export function pointFromUnknown(raw: unknown): DwgPrimitivePoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const point = raw as Record<string, unknown>;
  const x = point.x;
  const y = point.y;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  const z = isFiniteNumber(point.z) ? point.z : 0;
  return { x, y, z };
}

export function pointsFromUnknown(raw: unknown): DwgPrimitivePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: DwgPrimitivePoint[] = [];
  for (const item of raw) {
    const point = pointFromUnknown(item);
    if (point) out.push(point);
  }
  return out;
}

export function pickPointFromRecord(record: Record<string, unknown>, keys: string[]): DwgPrimitivePoint | null {
  for (const key of keys) {
    const point = pointFromUnknown(record[key]);
    if (point) return point;
  }
  return null;
}

export function pickPointsFromRecord(record: Record<string, unknown>, keys: string[]): DwgPrimitivePoint[] {
  for (const key of keys) {
    const points = pointsFromUnknown(record[key]);
    if (points.length > 0) return points;
  }
  return [];
}

export function primitiveKind(primitive: PrimitiveRecord): string {
  const kind = (primitive as Record<string, unknown>).kind;
  return String(kind ?? '').trim().toLowerCase();
}

export function firstNonEmptyText(values: unknown[]): string {
  // 仅 trimEnd：尾部空格通常是脏数据，前导空格是用户排版意图（例如 TEXT "  abc"），必须保留。
  for (const value of values) {
    const text = String(value ?? '');
    const cleaned = text.trimEnd();
    if (cleaned.length > 0) return cleaned;
  }
  return '';
}

function decodeCadUnicodeEscapes(text: string): string {
  return text.replace(/\\U\+([0-9a-fA-F]{4})/g, (_all, hex: string) => {
    const code = Number.parseInt(hex, 16);
    if (!Number.isFinite(code)) return '';
    try {
      return String.fromCharCode(code);
    } catch {
      return '';
    }
  });
}

function decodeCadPercentEscapes(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '%' || text[i + 1] !== '%') {
      out += text[i];
      continue;
    }
    const marker = text[i + 2];
    if (marker === '%') {
      out += '%';
      i += 2;
    } else if (marker == null) {
      out += '%';
      i += 1;
    } else if (marker === 'd' || marker === 'D') {
      out += '°';
      i += 2;
    } else if (marker === 'p' || marker === 'P') {
      out += '±';
      i += 2;
    } else if (marker === 'c' || marker === 'C') {
      out += '⌀';
      i += 2;
    } else if (/\d/.test(marker || '')) {
      let digits = marker;
      let j = i + 3;
      while (j < text.length && digits.length < 3 && /\d/.test(text[j])) {
        digits += text[j];
        j += 1;
      }
      const code = Number.parseInt(digits, 10);
      if (Number.isFinite(code) && code > 0) {
        out += String.fromCharCode(code);
        i = j - 1;
      } else {
        out += '%%';
        i += 1;
      }
    } else {
      out += '%%';
      i += 1;
    }
  }
  return out;
}

export function normalizeCadTextContent(value: unknown): string {
  let text = String(value ?? '');
  if (!text) return '';

  text = decodeCadPercentEscapes(decodeCadUnicodeEscapes(text));
  text = text
    .replace(/\\P/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\~/g, ' ');
  text = text.replace(/\r\n?/g, '\n').split(String.fromCharCode(0)).join('');
  // 仅 trimEnd：保留前导空格（TEXT 排版意图），尾部空格视为脏数据。
  return text.trimEnd();
}

function colorToHexString(r: number, g: number, b: number): string {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return String((cr << 16) | (cg << 8) | cb);
}

function aciToRgbDecimal(aciRaw: number): string {
  const aci = Math.round(aciRaw);
  const normalized = aci <= 0 || aci > 255 ? 7 : aci === 256 ? 7 : aci;
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
  const hit = map[normalized];
  if (hit) {
    return colorToHexString(hit[0], hit[1], hit[2]);
  }
  const v = Math.round(((normalized % 24) / 23) * 255);
  return colorToHexString(v, v, v);
}

function parseAciFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const m = raw.match(/aci\s*(-?\d+)/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (/^[-+]?\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 256 ? Math.round(n) : null;
  }
  return null;
}

export function parseColorFromUnknown(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.max(0, Math.min(0xffffff, Math.round(value)));
    return String(n);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === 'bylayer' || v === 'byblock' || v === 'null' || v === 'none') return null;

  const aciMatch = v.match(/aci\s*(-?\d+)/i);
  if (aciMatch) {
    const aci = Number.parseInt(aciMatch[1], 10);
    if (Number.isFinite(aci)) {
      return aciToRgbDecimal(aci);
    }
  }

  if (v.startsWith('#')) {
    const n = Number.parseInt(v.slice(1), 16);
    return Number.isFinite(n) ? String(n) : null;
  }

  if (v.startsWith('0x')) {
    const n = Number.parseInt(v.slice(2), 16);
    return Number.isFinite(n) ? String(n) : null;
  }

  if (v.startsWith('rgb(') || v.startsWith('rgba(')) {
    const nums = v
      .replace(/rgba?\(/g, '')
      .replace(')', '')
      .split(',')
      .map((x) => Number.parseFloat(x.trim()));
    if (nums.length >= 3 && nums.every((x) => Number.isFinite(x))) {
      return colorToHexString(nums[0], nums[1], nums[2]);
    }
  }

  const trueColorMatch = v.match(/\br\s*[:=]?\s*([0-9]{1,3})\D+\bg\s*[:=]?\s*([0-9]{1,3})\D+\bb\s*[:=]?\s*([0-9]{1,3})/i);
  if (trueColorMatch) {
    return colorToHexString(
      Number.parseInt(trueColorMatch[1], 10),
      Number.parseInt(trueColorMatch[2], 10),
      Number.parseInt(trueColorMatch[3], 10)
    );
  }

  const decimal = Number.parseInt(v, 10);
  if (Number.isFinite(decimal)) {
    return String(Math.max(0, Math.min(0xffffff, decimal)));
  }

  return null;
}

export function resolveEntityColor(entity: DwgEntityLite): string {
  const style = entity.style ?? {};
  const geom = entity.geom ?? {};
  const styleRecord = style as Record<string, unknown>;
  const geomRecord = geom as Record<string, unknown>;

  const trueColorCandidates = [
    styleRecord.effective_color_rgb,
    styleRecord.effective_color,
    styleRecord.color_rgb,
    styleRecord.color_hex,
    styleRecord.rgb,
    styleRecord.line_color,
    geomRecord.color_rgb,
    geomRecord.color_hex,
  ];
  for (const value of trueColorCandidates) {
    const parsed = parseColorFromUnknown(value);
    if (parsed) return parsed;
  }

  const explicitAciCandidates = [
    styleRecord.effective_color_index,
    styleRecord.color_index,
    styleRecord.color,
    geomRecord.color_index,
    geomRecord.color,
  ];
  for (const aciRaw of explicitAciCandidates) {
    const aci = parseAciFromUnknown(aciRaw);
    if (aci !== null) return aciToRgbDecimal(aci);
  }

  return '13421772';
}

export function primitiveColor(primitive: PrimitiveRecord, entityColor: string): string {
  const record = primitive as Record<string, unknown>;
  const resolved = record.resolved as Record<string, unknown> | undefined;
  if (resolved && typeof resolved === 'object') {
    const resolvedRgb = parseColorFromUnknown(resolved.color_rgb);
    if (resolvedRgb) return resolvedRgb;
    const resolvedAci = parseAciFromUnknown(resolved.color_index);
    if (resolvedAci !== null) return aciToRgbDecimal(resolvedAci);
  }

  const explicitAciCandidates = [record.color_index, record.color];
  for (const aciRaw of explicitAciCandidates) {
    const aci = parseAciFromUnknown(aciRaw);
    if (aci !== null) return aciToRgbDecimal(aci);
  }

  const candidate = parseColorFromUnknown(record.color);
  return candidate ?? entityColor;
}

export function maybeEngineText(text: string): boolean {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= 4096;
}

export function appendSegment(target: number[], a: [number, number], b: [number, number]) {
  target.push(a[0], a[1], b[0], b[1]);
}

export function appendPolyline(target: number[], points: DwgPrimitivePoint[], closed: boolean) {
  if (!Array.isArray(points) || points.length < 2) return;

  let prev = pointXY(points[0]);
  if (!prev) return;

  for (let i = 1; i < points.length; i += 1) {
    const next = pointXY(points[i]);
    if (!next) continue;
    appendSegment(target, prev, next);
    prev = next;
  }

  if (closed) {
    const first = pointXY(points[0]);
    if (first && prev) {
      appendSegment(target, prev, first);
    }
  }
}

export function appendCircle(target: number[], center: DwgPrimitivePoint, radiusRaw: unknown) {
  if (!isFiniteNumber(radiusRaw) || radiusRaw <= 0) return;
  const centerXY = pointXY(center);
  if (!centerXY) return;

  const steps = 64;
  let prev: [number, number] | null = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const p: [number, number] = [centerXY[0] + Math.cos(t) * radiusRaw, centerXY[1] + Math.sin(t) * radiusRaw];
    if (prev) appendSegment(target, prev, p);
    prev = p;
  }
}

export function appendArc(
  target: number[],
  center: DwgPrimitivePoint,
  radiusRaw: unknown,
  startAngleRaw: unknown,
  endAngleRaw: unknown
) {
  if (!isFiniteNumber(radiusRaw) || radiusRaw <= 0) return;
  const centerXY = pointXY(center);
  if (!centerXY) return;

  const start = toRadians(toNumber(startAngleRaw, 0));
  let end = toRadians(toNumber(endAngleRaw, 360));

  while (end < start) end += Math.PI * 2;
  const span = end - start;
  if (span <= 1e-6) return;
  // Full circle: delegate to circle tessellation
  if (span >= Math.PI * 2 - 1e-6) {
    appendCircle(target, center, radiusRaw);
    return;
  }
  const steps = Math.max(12, Math.min(192, Math.ceil((span / (Math.PI * 2)) * 128)));

  let prev: [number, number] | null = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = start + (span * i) / steps;
    const p: [number, number] = [centerXY[0] + Math.cos(t) * radiusRaw, centerXY[1] + Math.sin(t) * radiusRaw];
    if (prev) appendSegment(target, prev, p);
    prev = p;
  }
}

export function appendEllipse(
  target: number[],
  center: DwgPrimitivePoint,
  rxRaw: unknown,
  ryRaw: unknown,
  rotationRaw: unknown,
  startAngleRaw: unknown,
  endAngleRaw: unknown
) {
  if (!isFiniteNumber(rxRaw) || !isFiniteNumber(ryRaw) || rxRaw <= 0 || ryRaw <= 0) return;
  const centerXY = pointXY(center);
  if (!centerXY) return;

  const rotation = toRadians(toNumber(rotationRaw, 0));
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const start = toRadians(toNumber(startAngleRaw, 0));
  let end = toRadians(toNumber(endAngleRaw, Math.PI * 2));
  while (end < start) end += Math.PI * 2;
  const span = Math.max(1e-6, end - start);
  const steps = Math.max(12, Math.min(192, Math.ceil((span / (Math.PI * 2)) * 128)));

  let prev: [number, number] | null = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = start + (span * i) / steps;
    const ex = Math.cos(t) * rxRaw;
    const ey = Math.sin(t) * ryRaw;
    const x = centerXY[0] + ex * cosR - ey * sinR;
    const y = centerXY[1] + ex * sinR + ey * cosR;
    const p: [number, number] = [x, y];
    if (prev) appendSegment(target, prev, p);
    prev = p;
  }
}

export function appendPointMarker(target: number[], point: DwgPrimitivePoint, sizeRaw: unknown) {
  const p = pointXY(point);
  if (!p) return;
  const size = Math.max(1, Math.min(500, toNumber(sizeRaw, 30)));
  const half = size * 0.5;

  appendSegment(target, [p[0] - half, p[1]], [p[0] + half, p[1]]);
  appendSegment(target, [p[0], p[1] - half], [p[0], p[1] + half]);
}

