import type { DwgEntityLite } from '@/services/dwgApi';

export function cadEntityType(entity: DwgEntityLite): string {
  const geom = (entity.geom ?? {}) as Record<string, unknown>;
  return String(entity.type || geom.source_type || '').trim().toUpperCase();
}
