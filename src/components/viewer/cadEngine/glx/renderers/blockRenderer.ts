import type { PrimitiveRecord } from '../types';
import { renderPointPrimitive } from './pointRenderer';

export function renderBlockPrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  return renderPointPrimitive(target, primitive);
}
