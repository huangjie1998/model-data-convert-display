import type { PrimitiveRecord, TextRenderAccumulator } from '../../types';
import { renderClassifiedTextPrimitive } from './textPrimitiveCommon';

export function renderMTextEntityPrimitive(
  primitive: PrimitiveRecord,
  entityId: string,
  layer: string,
  entityColor: string,
  accumulator: TextRenderAccumulator
) {
  return renderClassifiedTextPrimitive(primitive, entityId, layer, entityColor, accumulator, 'mtext');
}
