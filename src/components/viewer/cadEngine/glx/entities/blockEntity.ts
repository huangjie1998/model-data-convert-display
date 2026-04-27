import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';
import { buildBlockFallbackPrimitives } from '../fallback/blockFallback';

export function buildBlockEntityPrimitives(entity: DwgEntityLite, type: string): DwgPrimitive[] {
  if (type !== 'INSERT' && type !== 'BLOCK_REFERENCE' && type !== 'BLOCKREF') return [];
  return buildBlockFallbackPrimitives(entity);
}
