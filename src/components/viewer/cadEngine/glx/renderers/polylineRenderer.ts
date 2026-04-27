import type { PrimitiveRecord } from '../types';
import { appendPolyline, pickPointsFromRecord } from '../utils';

export function renderPolylinePrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const points = pickPointsFromRecord(record, ['points', 'vertices']);
  if (points.length < 2) return false;
  appendPolyline(target, points, Boolean(record.closed));
  return true;
}
