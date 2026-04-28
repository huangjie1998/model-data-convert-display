import type { PrimitiveRecord } from '../types';
import { appendPolyline, isFiniteNumber, pickPointsFromRecord, pointXY } from '../utils';

function nonNegativeFinite(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? value : null;
}

export function renderPolylinePrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const points = pickPointsFromRecord(record, ['points', 'vertices']);
  if (points.length < 2) return false;
  appendPolyline(target, points, Boolean(record.closed));
  return true;
}

export function polylineWidth(primitive: PrimitiveRecord): number {
  const record = primitive as Record<string, unknown>;
  const segmentWidths = Array.isArray(record.segment_widths) ? record.segment_widths : [];
  for (const item of segmentWidths) {
      if (!item || typeof item !== 'object') continue;
      const segment = item as Record<string, unknown>;
    const startWidth = nonNegativeFinite(segment.start_width);
    const endWidth = nonNegativeFinite(segment.end_width);
    if (startWidth != null && startWidth > 0) return startWidth;
    if (endWidth != null && endWidth > 0) return endWidth;
  }
  const globalWidth = record.global_width;
  if (isFiniteNumber(globalWidth) && globalWidth > 0) return globalWidth;
  const startWidth = record.start_width;
  const endWidth = record.end_width;
  if (isFiniteNumber(startWidth) && startWidth > 0 && isFiniteNumber(endWidth) && endWidth > 0) {
    return Math.max(startWidth, endWidth);
  }
  if (isFiniteNumber(startWidth) && startWidth > 0) return startWidth;
  if (isFiniteNumber(endWidth) && endWidth > 0) return endWidth;
  return 0;
}

export function renderWidePolylinePrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const points = pickPointsFromRecord(record, ['points', 'vertices']);
  if (points.length < 2) return false;
  const explicitStartWidth = nonNegativeFinite(record.start_width);
  const explicitEndWidth = nonNegativeFinite(record.end_width);
  const hasExplicitEndpointWidth = explicitStartWidth != null || explicitEndWidth != null;
  const globalWidth = !hasExplicitEndpointWidth && isFiniteNumber(record.global_width) && record.global_width > 0 ? record.global_width : 0;
  const startWidth = explicitStartWidth ?? globalWidth;
  const endWidth = explicitEndWidth ?? startWidth;
  const segmentWidthMap = new Map<number, { startWidth: number; endWidth: number }>();
  if (Array.isArray(record.segment_widths)) {
    for (const item of record.segment_widths) {
      if (!item || typeof item !== 'object') continue;
      const segment = item as Record<string, unknown>;
      const indexRaw = Number(segment.segment);
      const index = Number.isFinite(indexRaw) ? Math.floor(indexRaw) : segmentWidthMap.size;
      const explicitSegmentStart = nonNegativeFinite(segment.start_width);
      const explicitSegmentEnd = nonNegativeFinite(segment.end_width);
      const segmentStart = explicitSegmentStart ?? 0;
      const segmentEnd = explicitSegmentEnd ?? segmentStart;
      if (index >= 0 && (explicitSegmentStart != null || explicitSegmentEnd != null)) {
        segmentWidthMap.set(index, { startWidth: segmentStart, endWidth: segmentEnd });
      }
    }
  }
  if (Math.max(startWidth, endWidth, globalWidth) <= 0 && segmentWidthMap.size === 0) return false;
  const segments = Boolean(record.closed) ? points.length : points.length - 1;
  let rendered = false;
  const lengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < segments; i += 1) {
    const a = pointXY(points[i]);
    const b = pointXY(points[(i + 1) % points.length]);
    const length = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
    lengths.push(length);
    totalLength += length;
  }

  let lengthBefore = 0;

  for (let i = 0; i < segments; i += 1) {
    const a = pointXY(points[i]);
    const b = pointXY(points[(i + 1) % points.length]);
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = lengths[i] ?? Math.hypot(dx, dy);
    if (len <= 1e-9) {
      lengthBefore += Math.max(0, len);
      continue;
    }
    const explicitSegmentWidth = segmentWidthMap.get(i);
    const startT = totalLength > 1e-9 ? lengthBefore / totalLength : 0;
    const endT = totalLength > 1e-9 ? (lengthBefore + len) / totalLength : 1;
    const widthA = explicitSegmentWidth
      ? explicitSegmentWidth.startWidth
      : globalWidth > 0
        ? globalWidth
        : startWidth + (endWidth - startWidth) * startT;
    const widthB = explicitSegmentWidth
      ? explicitSegmentWidth.endWidth
      : globalWidth > 0
        ? globalWidth
        : startWidth + (endWidth - startWidth) * endT;
    lengthBefore += len;
    if (Math.max(widthA, widthB) <= 0) continue;
    const nxA = (-dy / len) * widthA * 0.5;
    const nyA = (dx / len) * widthA * 0.5;
    const nxB = (-dy / len) * widthB * 0.5;
    const nyB = (dx / len) * widthB * 0.5;
    const p1: [number, number] = [a[0] + nxA, a[1] + nyA];
    const p2: [number, number] = [b[0] + nxB, b[1] + nyB];
    const p3: [number, number] = [b[0] - nxB, b[1] - nyB];
    const p4: [number, number] = [a[0] - nxA, a[1] - nyA];
    target.push(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    target.push(p1[0], p1[1], p3[0], p3[1], p4[0], p4[1]);
    rendered = true;
  }

  return rendered;
}
