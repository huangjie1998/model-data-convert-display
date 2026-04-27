import type { DwgPrimitive } from '@/services/dwgApi';
import { isFiniteNumber, pointFromUnknown } from '../utils';

export function buildArcEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'ARC') return [];
  const center = pointFromUnknown(geom.center);
  const start = pointFromUnknown(geom.start);
  const end = pointFromUnknown(geom.end);
  if (!center || !isFiniteNumber(geom.radius) || geom.radius <= 0) return [];
  const arc: DwgPrimitive = { kind: 'arc', center, radius: geom.radius };
  if (start) arc.start = start;
  if (end) arc.end = end;
  if (isFiniteNumber(geom.start_angle)) arc.start_angle = geom.start_angle;
  if (isFiniteNumber(geom.end_angle)) arc.end_angle = geom.end_angle;
  return [arc];
}
