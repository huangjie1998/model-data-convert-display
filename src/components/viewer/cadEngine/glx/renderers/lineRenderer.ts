import type { PrimitiveRecord } from '../types';
import { appendSegment, pickPointFromRecord, pointXY } from '../utils';

export function renderLinePrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const a = pointXY(pickPointFromRecord(record, ['start', 'start_point', 'from', 'p1']));
  const b = pointXY(pickPointFromRecord(record, ['end', 'end_point', 'to', 'p2']));
  if (!a || !b) return false;
  appendSegment(target, a, b);
  return true;
}
