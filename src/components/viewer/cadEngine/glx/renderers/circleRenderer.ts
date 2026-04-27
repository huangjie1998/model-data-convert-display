import type { PrimitiveRecord } from '../types';
import { appendCircle, parseFiniteNumber, pickPointFromRecord } from '../utils';

export function renderCirclePrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const center = pickPointFromRecord(record, ['center', 'origin']);
  if (!center) return false;
  const radius = parseFiniteNumber(record.radius) ?? parseFiniteNumber(record.r);
  appendCircle(target, center, radius);
  return true;
}
