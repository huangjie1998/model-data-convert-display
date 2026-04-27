import type { PrimitiveRecord } from '../types';
import { appendPolyline, pickPointsFromRecord, pointsFromUnknown } from '../utils';

export function renderPolygonPrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const rings = Array.isArray(record.rings) ? record.rings : [];
  let drawn = false;

  for (const ring of rings) {
    const ringPoints = pointsFromUnknown(ring);
    if (ringPoints.length < 2) continue;
    appendPolyline(target, ringPoints, true);
    drawn = true;
  }

  if (drawn) return true;

  const points = pickPointsFromRecord(record, ['points', 'vertices']);
  if (points.length < 2) return false;
  appendPolyline(target, points, true);
  return true;
}
