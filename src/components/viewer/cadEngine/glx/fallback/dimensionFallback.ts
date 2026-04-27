import type { DwgPrimitive, DwgPrimitivePoint } from '@/services/dwgApi';
import { isFiniteNumber, pointFromUnknown } from '../utils';
import { buildFallbackTextPrimitive } from './textFallback';

interface ArrowDescriptor {
  style: 'none' | 'archtick' | 'dot' | 'open' | 'closed_blank' | 'closed_filled';
  block?: string;
}

function normalize2d(x: number, y: number): [number, number] {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len < 1e-9) return [0, 0];
  return [x / len, y / len];
}

function pointKey(p: DwgPrimitivePoint): string {
  return `${p.x.toFixed(6)}|${p.y.toFixed(6)}|${(p.z ?? 0).toFixed(6)}`;
}

function pickPoint(geom: Record<string, unknown>, keys: string[]): DwgPrimitivePoint | null {
  for (const key of keys) {
    const p = pointFromUnknown(geom[key]);
    if (p) return p;
  }
  return null;
}

function pushLine(
  out: DwgPrimitive[],
  start: DwgPrimitivePoint | null,
  end: DwgPrimitivePoint | null,
  subtype?: string
) {
  if (!start || !end) return;
  if (pointKey(start) === pointKey(end)) return;
  out.push({ kind: 'line', start, end, ...(subtype ? { subtype } : {}) });
}

function buildDimensionTick(
  center: DwgPrimitivePoint,
  dirX: number,
  dirY: number,
  size: number,
  arrow: ArrowDescriptor
): DwgPrimitive | null {
  const [nx, ny] = normalize2d(dirX, dirY);
  if (nx === 0 && ny === 0) return null;
  const half = Math.max(1, size * 0.5);
  return {
    kind: 'line',
    start: { x: center.x - nx * half, y: center.y - ny * half, z: center.z ?? 0 },
    end: { x: center.x + nx * half, y: center.y + ny * half, z: center.z ?? 0 },
    subtype: 'dim_arrow_tick',
    arrow_style: arrow.style,
    arrow_block: arrow.block,
  };
}

function appendArrow(
  out: DwgPrimitive[],
  tip: DwgPrimitivePoint | null,
  inwardX: number,
  inwardY: number,
  arrowSize: number,
  arrow: ArrowDescriptor
) {
  if (!tip) return;
  if (arrow.style === 'none') return;
  if (!Number.isFinite(arrowSize) || arrowSize <= 0) return;
  const [ux, uy] = normalize2d(inwardX, inwardY);
  if (ux === 0 && uy === 0) return;

  const size = arrowSize;
  if (arrow.style === 'archtick') {
    const tick = buildDimensionTick(tip, -ux + -uy, -uy + ux, size, arrow);
    if (tick) out.push(tick);
    return;
  }
  if (arrow.style === 'dot') {
    const steps = 14;
    const radius = Math.max(size * 0.05, Math.min(size * 0.32, size));
    const ring: DwgPrimitivePoint[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const a = (Math.PI * 2 * i) / steps;
      ring.push({
        x: tip.x + radius * Math.cos(a),
        y: tip.y + radius * Math.sin(a),
        z: tip.z ?? 0,
      });
    }
    out.push({
      kind: 'polygon',
      rings: [ring],
      filled: true,
      pattern_name: 'ARROW',
      arrow_fill: true,
      subtype: 'dim_arrow_dot',
      arrow_style: arrow.style,
      arrow_block: arrow.block,
    });
    return;
  }

  const half = size * 0.45;
  const baseX = tip.x + ux * size;
  const baseY = tip.y + uy * size;
  const px = -uy;
  const py = ux;
  const p1 = { x: baseX + px * half, y: baseY + py * half, z: tip.z ?? 0 };
  const p2 = { x: tip.x, y: tip.y, z: tip.z ?? 0 };
  const p3 = { x: baseX - px * half, y: baseY - py * half, z: tip.z ?? 0 };
  if (arrow.style === 'open') {
    out.push({
      kind: 'line',
      start: p1,
      end: p2,
      subtype: 'dim_arrow_open',
      arrow_style: arrow.style,
      arrow_block: arrow.block,
    });
    out.push({
      kind: 'line',
      start: p2,
      end: p3,
      subtype: 'dim_arrow_open',
      arrow_style: arrow.style,
      arrow_block: arrow.block,
    });
    return;
  }
  if (arrow.style === 'closed_blank') {
    out.push({
      kind: 'polyline',
      points: [p1, p2, p3, p1],
      closed: true,
      subtype: 'dim_arrow_closed_blank',
      arrow_style: arrow.style,
      arrow_block: arrow.block,
    });
    return;
  }
  out.push({
    kind: 'polygon',
    rings: [[p1, p2, p3, p1]],
    filled: true,
    pattern_name: 'ARROW',
    arrow_fill: true,
    subtype: 'dim_arrow_fill',
    arrow_style: arrow.style,
    arrow_block: arrow.block,
  });
}

function normalizeArrowToken(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeArrowStyle(raw: unknown): ArrowDescriptor['style'] {
  const source = String(raw ?? '').trim().toLowerCase();
  const token = normalizeArrowToken(raw);
  if (!token || token === 'null' || token === 'none' || token === '_none') return 'closed_filled';
  if (token === 'none' || token === '_none' || token === 'non') return 'none';
  if (token.includes('none') && !token.includes('open')) return 'none';
  if (source.includes('archtick') || token.includes('architecturaltick') || source.includes('tick') || source.includes('oblique')) {
    return 'archtick';
  }
  if (token.includes('slash') || token.includes('integral') || token.includes('tshape') || token === 't') return 'archtick';
  if (token.includes('origin') || token.includes('dot') || token.includes('circle')) return 'dot';
  if (token.includes('box') || token.includes('square') || token.includes('diamond')) {
    return token.includes('open') || token.includes('blank') ? 'closed_blank' : 'closed_filled';
  }
  if (token.includes('datumtriangle')) return token.includes('filled') ? 'closed_filled' : 'closed_blank';
  if (token.includes('rightangle')) return 'open';
  if (token.includes('closedblank') || token.includes('blank')) return 'closed_blank';
  if (source.includes('open') && !source.includes('filled')) return 'open';
  return 'closed_filled';
}

function resolveArrowDescriptors(geom: Record<string, unknown>): { start: ArrowDescriptor; end: ArrowDescriptor } {
  const common = String(geom.arrow_block ?? '').trim();
  const startBlock = String(geom.arrow_block1 ?? common).trim();
  const endBlock = String(geom.arrow_block2 ?? common).trim();
  return {
    start: {
      style: normalizeArrowStyle(startBlock || common),
      block: startBlock || common || undefined,
    },
    end: {
      style: normalizeArrowStyle(endBlock || common),
      block: endBlock || common || undefined,
    },
  };
}

function addDimensionText(out: DwgPrimitive[], geom: Record<string, unknown>) {
  const text = buildFallbackTextPrimitive(geom, 'dimension_text');
  if (!text) return;
  if (!isFiniteNumber(text.height) && isFiniteNumber(geom.text_height)) {
    text.height = geom.text_height;
  }
  out.push(text);
}

function buildLinearDimension(
  out: DwgPrimitive[],
  geom: Record<string, unknown>,
  arrowSize: number,
  arrows: { start: ArrowDescriptor; end: ArrowDescriptor }
) {
  const ext1 = pickPoint(geom, ['ext1']);
  const ext2 = pickPoint(geom, ['ext2']);
  const lineStart = pickPoint(geom, ['line_start', 'dim_line_start']);
  const lineEnd = pickPoint(geom, ['line_end', 'dim_line_end']);
  pushLine(out, ext1, lineStart);
  pushLine(out, ext2, lineEnd);
  pushLine(out, lineStart, lineEnd);
  if (lineStart && lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    appendArrow(out, lineStart, dx, dy, arrowSize, arrows.start);
    appendArrow(out, lineEnd, -dx, -dy, arrowSize, arrows.end);
  }
}

function buildAngularDimension(
  out: DwgPrimitive[],
  geom: Record<string, unknown>,
  arrowSize: number,
  arrows: { start: ArrowDescriptor; end: ArrowDescriptor }
) {
  const center = pickPoint(geom, ['center', 'vertex', 'dim_line_point']);
  const lineStart = pickPoint(geom, ['line_start']);
  const lineEnd = pickPoint(geom, ['line_end']);
  const ext1 = pickPoint(geom, ['ext1']);
  const ext2 = pickPoint(geom, ['ext2']);

  pushLine(out, ext1, lineStart);
  pushLine(out, ext2, lineEnd);

  if (center && lineStart && lineEnd) {
    const radius = Math.max(
      1e-6,
      Math.hypot(lineStart.x - center.x, lineStart.y - center.y),
      Math.hypot(lineEnd.x - center.x, lineEnd.y - center.y)
    );
    out.push({
      kind: 'arc',
      center,
      radius,
      start: lineStart,
      end: lineEnd,
    });
    appendArrow(out, lineStart, center.x - lineStart.x, center.y - lineStart.y, arrowSize, arrows.start);
    appendArrow(out, lineEnd, center.x - lineEnd.x, center.y - lineEnd.y, arrowSize, arrows.end);
  } else {
    pushLine(out, lineStart, lineEnd);
  }
}

function buildRadiusDimension(
  out: DwgPrimitive[],
  geom: Record<string, unknown>,
  arrowSize: number,
  arrows: { start: ArrowDescriptor; end: ArrowDescriptor }
) {
  const center = pickPoint(geom, ['center', 'ext1']);
  const tip = pickPoint(geom, ['line_end', 'ext2', 'chord_point']);
  pushLine(out, center, tip);
  if (center && tip) {
    appendArrow(out, tip, center.x - tip.x, center.y - tip.y, arrowSize, arrows.start);
  }
}

function buildDiameterDimension(
  out: DwgPrimitive[],
  geom: Record<string, unknown>,
  arrowSize: number,
  arrows: { start: ArrowDescriptor; end: ArrowDescriptor }
) {
  const p1 = pickPoint(geom, ['line_start', 'ext1', 'chord_point']);
  const p2 = pickPoint(geom, ['line_end', 'ext2', 'far_chord_point']);
  pushLine(out, p1, p2);
  if (p1 && p2) {
    appendArrow(out, p1, p2.x - p1.x, p2.y - p1.y, arrowSize, arrows.start);
    appendArrow(out, p2, p1.x - p2.x, p1.y - p2.y, arrowSize, arrows.end);
  }
}

function buildOrdinateDimension(
  out: DwgPrimitive[],
  geom: Record<string, unknown>,
  arrowSize: number,
  arrows: { start: ArrowDescriptor; end: ArrowDescriptor }
) {
  const feature = pickPoint(geom, ['line_start', 'ext1']);
  const leader = pickPoint(geom, ['line_end', 'ext2', 'leader_end_point']);
  pushLine(out, feature, leader);
  if (feature && leader) {
    appendArrow(out, feature, leader.x - feature.x, leader.y - feature.y, arrowSize, arrows.start);
  }
}

export function buildDimensionFallbackPrimitives(geom: Record<string, unknown>): DwgPrimitive[] {
  const out: DwgPrimitive[] = [];
  const dimKind = String(geom.dim_kind ?? 'dimension')
    .trim()
    .toLowerCase();
  const arrowSizeRaw =
    isFiniteNumber(geom.arrow_size) && (geom.arrow_size as number) > 0
      ? (geom.arrow_size as number)
      : isFiniteNumber(geom.text_height) && (geom.text_height as number) > 0
        ? (geom.text_height as number) * 0.18
        : 0;
  const arrowSize = arrowSizeRaw > 0 ? arrowSizeRaw : 0;
  const arrows = resolveArrowDescriptors(geom);

  if (dimKind === 'angular' || dimKind === 'arc_length') {
    buildAngularDimension(out, geom, arrowSize, arrows);
  } else if (dimKind === 'radius') {
    buildRadiusDimension(out, geom, arrowSize, arrows);
  } else if (dimKind === 'diameter') {
    buildDiameterDimension(out, geom, arrowSize, arrows);
  } else if (dimKind === 'ordinate') {
    buildOrdinateDimension(out, geom, arrowSize, arrows);
  } else {
    buildLinearDimension(out, geom, arrowSize, arrows);
  }

  addDimensionText(out, geom);
  return out;
}
