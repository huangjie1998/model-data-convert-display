import type { DwgPrimitive } from '@/services/dwgApi';
import { pointsFromUnknown } from '../utils';

export function buildGenericEntityPrimitives(geom: Record<string, unknown>): DwgPrimitive[] {
  const genericPoints = pointsFromUnknown(geom.points);
  const genericVertices = pointsFromUnknown(geom.vertices);
  const genericPolyline = genericPoints.length >= 2 ? genericPoints : genericVertices;
  if (genericPolyline.length >= 2) {
    return [{ kind: 'polyline', points: genericPolyline, closed: Boolean(geom.closed) }];
  }
  return [];
}
