import type { PrimitiveRecord } from '../types';
import { appendEllipse, parseFiniteNumber, pickPointFromRecord } from '../utils';

function degreesToRadians(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? (value * Math.PI) / 180 : undefined;
}

export function renderEllipsePrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const center = pickPointFromRecord(record, ['center', 'origin']);
  if (!center) return false;

  const rx = parseFiniteNumber(record.rx) ?? parseFiniteNumber(record.radius_x);
  const ry = parseFiniteNumber(record.ry) ?? parseFiniteNumber(record.radius_y);
  const rotation = degreesToRadians(parseFiniteNumber(record.rotation));
  const startAngle = degreesToRadians(parseFiniteNumber(record.start_angle) ?? parseFiniteNumber(record.startAngle));
  const endAngle = degreesToRadians(parseFiniteNumber(record.end_angle) ?? parseFiniteNumber(record.endAngle));
  appendEllipse(target, center, rx, ry, rotation, startAngle, endAngle);
  return true;
}
