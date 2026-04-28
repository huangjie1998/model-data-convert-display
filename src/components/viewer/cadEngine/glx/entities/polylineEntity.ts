import type { DwgPrimitive } from '@/services/dwgApi';
import { isFiniteNumber, pointsFromUnknown } from '../utils';

export function buildPolylineEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'POLYLINE' && type !== 'LWPOLYLINE') return [];
  const points = pointsFromUnknown(geom.points);
  const vertices = pointsFromUnknown(geom.vertices);
  const merged = points.length >= 2 ? points : vertices;
  if (merged.length >= 2) {
    const primitive: DwgPrimitive = { kind: 'polyline', points: merged, closed: Boolean(geom.closed) };
    if (isFiniteNumber(geom.global_width) && geom.global_width > 0) primitive.global_width = geom.global_width;
    if (isFiniteNumber(geom.start_width) && geom.start_width >= 0) primitive.start_width = geom.start_width;
    if (isFiniteNumber(geom.end_width) && geom.end_width >= 0) primitive.end_width = geom.end_width;
    if (Array.isArray(geom.segment_widths)) {
      primitive.segment_widths = geom.segment_widths as Array<{ segment?: number; start_width?: number; end_width?: number }>;
    }
    return [primitive];
  }
  return [];
}
