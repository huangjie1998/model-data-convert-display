import type { DwgPrimitive } from '@/services/dwgApi';
import { buildFallbackTextPrimitive } from '../fallback/textFallback';

export function buildMTextEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'MTEXT') return [];
  const text = buildFallbackTextPrimitive({ ...geom, is_mtext: true }, 'MTEXT');
  return text ? [text] : [];
}
