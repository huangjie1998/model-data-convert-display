import type { DwgPrimitive } from '@/services/dwgApi';
import { isFiniteNumber, pointFromUnknown } from '../utils';

export function buildEllipseEntityPrimitives(geom: Record<string, unknown>, type: string): DwgPrimitive[] {
  if (type !== 'ELLIPSE') return [];
  const center = pointFromUnknown(geom.center);
  const start = pointFromUnknown(geom.start);
  const end = pointFromUnknown(geom.end);
  if (!center || !isFiniteNumber(geom.rx) || !isFiniteNumber(geom.ry) || geom.rx <= 0 || geom.ry <= 0) return [];
  const ellipse: DwgPrimitive = { kind: 'ellipse', center, rx: geom.rx, ry: geom.ry };
  if (isFiniteNumber(geom.rotation)) ellipse.rotation = geom.rotation;
  if (start) ellipse.start = start;
  if (end) ellipse.end = end;
  if (isFiniteNumber(geom.start_angle)) ellipse.start_angle = geom.start_angle;
  if (isFiniteNumber(geom.end_angle)) ellipse.end_angle = geom.end_angle;
  return [ellipse];
}
