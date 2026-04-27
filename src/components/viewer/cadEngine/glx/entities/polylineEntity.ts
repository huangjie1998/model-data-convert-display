import type { DwgPrimitive } from '@/services/dwgApi';
import { pointsFromUnknown } from '../utils';

export function buildPolylineEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'POLYLINE' && type !== 'LWPOLYLINE') return [];
  const points = pointsFromUnknown(geom.points);
  const vertices = pointsFromUnknown(geom.vertices);
  const merged = points.length >= 2 ? points : vertices;
  if (merged.length >= 2) return [{ kind: 'polyline', points: merged, closed: Boolean(geom.closed) }];
  return [];
}
