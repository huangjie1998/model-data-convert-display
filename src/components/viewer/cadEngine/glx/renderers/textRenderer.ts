import type { PrimitiveRecord, TextRenderAccumulator } from '../types';
import { renderDimensionTextEntityPrimitive } from './text/dimensionTextEntityRenderer';
import { renderMTextEntityPrimitive } from './text/mtextEntityRenderer';
import { renderTextEntityPrimitive } from './text/textEntityRenderer';
import { classifyTextPrimitive } from './text/textPrimitiveClassifier';

export function renderTextPrimitive(
  primitive: PrimitiveRecord,
  entityId: string,
  layer: string,
  entityColor: string,
  accumulator: TextRenderAccumulator
): { rendered: boolean; overlayText: boolean; engineText: boolean } {
  const layoutKind = classifyTextPrimitive(primitive);
  if (layoutKind === 'dimension_text') {
    return renderDimensionTextEntityPrimitive(primitive, entityId, layer, entityColor, accumulator);
  }
  if (layoutKind === 'mtext') {
    return renderMTextEntityPrimitive(primitive, entityId, layer, entityColor, accumulator);
  }
  return renderTextEntityPrimitive(primitive, entityId, layer, entityColor, accumulator);
}
