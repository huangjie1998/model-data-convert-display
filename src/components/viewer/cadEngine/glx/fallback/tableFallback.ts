import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';
import { pointFromUnknown } from '../utils';
import { buildFallbackTextPrimitive } from './textFallback';

function bboxToRing(entity: DwgEntityLite): DwgPrimitive | null {
  const bbox = entity.bbox;
  if (!bbox) return null;
  const min = pointFromUnknown(bbox.min);
  const max = pointFromUnknown(bbox.max);
  if (!min || !max) return null;

  return {
    kind: 'polyline',
    points: [
      { x: min.x, y: min.y, z: 0 },
      { x: max.x, y: min.y, z: 0 },
      { x: max.x, y: max.y, z: 0 },
      { x: min.x, y: max.y, z: 0 },
    ],
    closed: true,
    subtype: 'table_outline',
  };
}

export function buildTableFallbackPrimitives(entity: DwgEntityLite): DwgPrimitive[] {
  const out: DwgPrimitive[] = [];
  const outline = bboxToRing(entity);
  if (outline) out.push(outline);

  const geom = (entity.geom ?? {}) as Record<string, unknown>;
  const text = buildFallbackTextPrimitive(geom, 'table_text');
  if (text) out.push(text);
  return out;
}
