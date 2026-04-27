import type { PrimitiveRecord, TextRenderAccumulator } from '../../types';
import { renderClassifiedTextPrimitive } from './textPrimitiveCommon';

export function renderDimensionTextEntityPrimitive(
  primitive: PrimitiveRecord,
  entityId: string,
  layer: string,
  entityColor: string,
  accumulator: TextRenderAccumulator
) {
  return renderClassifiedTextPrimitive(primitive, entityId, layer, entityColor, accumulator, 'dimension_text');
}
