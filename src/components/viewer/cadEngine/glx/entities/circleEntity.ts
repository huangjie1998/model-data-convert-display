import type { DwgPrimitive } from '@/services/dwgApi';
import { isFiniteNumber, pointFromUnknown } from '../utils';

export function buildCircleEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'CIRCLE') return [];
  const center = pointFromUnknown(geom.center);
  if (center && isFiniteNumber(geom.radius) && geom.radius > 0) {
    return [{ kind: 'circle', center, radius: geom.radius }];
  }
  return [];
}
