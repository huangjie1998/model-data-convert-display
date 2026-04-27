import type { PrimitiveRecord } from '../types';
import { renderPolygonPrimitive } from './polygonRenderer';

export function renderTablePrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  return renderPolygonPrimitive(target, primitive);
}
