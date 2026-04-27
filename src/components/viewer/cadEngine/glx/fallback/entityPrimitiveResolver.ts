import type { DwgEntityLite } from '@/services/dwgApi';
import type { PrimitiveRecord } from '../types';
import { buildEntityPrimitivesByCategory } from '../entities/entityPrimitiveBuilder';

export function resolveEntityPrimitives(entity: DwgEntityLite): PrimitiveRecord[] {
  const primitives = entity.geom?.primitives;
  if (Array.isArray(primitives) && primitives.length > 0) {
    return primitives as PrimitiveRecord[];
  }
  return buildEntityPrimitivesByCategory(entity);
}
