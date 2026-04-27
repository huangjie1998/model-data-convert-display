import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';
import { buildDimensionFallbackPrimitives } from '../fallback/dimensionFallback';

export function buildDimensionEntityPrimitives(_entity: DwgEntityLite, geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'DIMENSION') return [];
  return buildDimensionFallbackPrimitives(geom);
}
