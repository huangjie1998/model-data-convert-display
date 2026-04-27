import type { PrimitiveRecord } from '../types';
import { renderLinePrimitive } from './lineRenderer';

export function renderDimensionPrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  return renderLinePrimitive(target, primitive);
}
