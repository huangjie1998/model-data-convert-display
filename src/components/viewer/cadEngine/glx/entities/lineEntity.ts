import type { DwgPrimitive } from '@/services/dwgApi';
import { pointFromUnknown } from '../utils';

export function buildLineEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  const start = pointFromUnknown(geom.start);
  const end = pointFromUnknown(geom.end);
  if (start && end && (type === 'LINE' || !type)) return [{ kind: 'line', start, end }];
  return [];
}
