import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';
import { buildTableFallbackPrimitives } from '../fallback/tableFallback';

export function buildTableEntityPrimitives(entity: DwgEntityLite, type: string): DwgPrimitive[] {
  if (type !== 'TABLE' && type !== 'ACAD_TABLE') return [];
  return buildTableFallbackPrimitives(entity);
}
