import type { DwgPrimitive } from '@/services/dwgApi';
import { isFiniteNumber, pointFromUnknown } from '../utils';

export function buildPointEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'POINT') return [];
  const point = pointFromUnknown(geom.position);
  if (!point) return [];
  return [{ kind: 'point', position: point, display_size: isFiniteNumber(geom.display_size) ? geom.display_size : undefined }];
}
