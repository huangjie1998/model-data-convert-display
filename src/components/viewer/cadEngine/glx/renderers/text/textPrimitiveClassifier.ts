import type { PrimitiveRecord } from '../../types';

export type TextLayoutKind = 'text' | 'mtext' | 'dimension_text';

export function classifyTextPrimitive(primitive: PrimitiveRecord): TextLayoutKind {
  const record = primitive as Record<string, unknown>;
  const subtype = String(record.subtype ?? '').trim().toUpperCase();
  if (subtype === 'DIMENSION_TEXT' || subtype === 'DIMENSION') return 'dimension_text';
  if (record.is_mtext === true || subtype === 'MTEXT') return 'mtext';
  return 'text';
}
