import type { DwgPrimitive } from '@/services/dwgApi';
import { buildFallbackTextPrimitive } from '../fallback/textFallback';

export function buildTextEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'TEXT' && type !== 'ATTDEF' && type !== 'ATTRIB') return [];
  const text = buildFallbackTextPrimitive(geom, type === 'TEXT' ? 'TEXT' : type);
  return text ? [text] : [];
}
