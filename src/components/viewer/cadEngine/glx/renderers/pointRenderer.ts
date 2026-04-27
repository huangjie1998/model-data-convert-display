import type { PrimitiveRecord } from '../types';
import { appendPointMarker, parseFiniteNumber, pickPointFromRecord } from '../utils';

export function renderPointPrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const point = pickPointFromRecord(record, ['position', 'point', 'location']);
  if (!point) return false;
  const size = parseFiniteNumber(record.display_size) ?? parseFiniteNumber(record.size);
  appendPointMarker(target, point, size);
  return true;
}
