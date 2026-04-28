import type { PrimitiveRecord } from '../types';
import { appendArc, parseFiniteNumber, pickPointFromRecord } from '../utils';

function degreesToRadians(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? (value * Math.PI) / 180 : undefined;
}

export function renderArcPrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const center = pickPointFromRecord(record, ['center', 'origin']);
  if (!center) return false;

  const radius = parseFiniteNumber(record.radius) ?? parseFiniteNumber(record.r);
  const startPoint = pickPointFromRecord(record, ['start', 'start_point']);
  const endPoint = pickPointFromRecord(record, ['end', 'end_point']);
  const rawStartAngle = parseFiniteNumber(record.start_angle) ?? parseFiniteNumber(record.startAngle);
  const rawEndAngle = parseFiniteNumber(record.end_angle) ?? parseFiniteNumber(record.endAngle);
  if ((!startPoint && rawStartAngle === null) || (!endPoint && rawEndAngle === null)) {
    return false;
  }
  const startAngle =
    startPoint
      ? Math.atan2(startPoint.y - center.y, startPoint.x - center.x)
      : degreesToRadians(rawStartAngle);
  const endAngle =
    endPoint
      ? Math.atan2(endPoint.y - center.y, endPoint.x - center.x)
      : degreesToRadians(rawEndAngle);
  appendArc(target, center, radius, startAngle, endAngle);
  return true;
}
