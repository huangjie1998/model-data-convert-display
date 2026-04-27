import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';
import { pointFromUnknown } from '../utils';
import { buildFallbackTextPrimitive } from './textFallback';

export function buildBlockFallbackPrimitives(entity: DwgEntityLite): DwgPrimitive[] {
  const geom = (entity.geom ?? {}) as Record<string, unknown>;
  const out: DwgPrimitive[] = [];

  const position = pointFromUnknown(geom.position) ?? pointFromUnknown(geom.insert);
  if (position) {
    out.push({
      kind: 'point',
      position,
      display_size: 30,
    });
  }

  const label = String(geom.block_name ?? geom.name ?? '').trim();
  if (label && position) {
    out.push({
      kind: 'text',
      text: label,
      position,
      height: 120,
      actual_height: 120,
      rotation: 0,
      subtype: 'block_name',
    });
  } else {
    const text = buildFallbackTextPrimitive(geom, 'block_text');
    if (text) out.push(text);
  }

  return out;
}
