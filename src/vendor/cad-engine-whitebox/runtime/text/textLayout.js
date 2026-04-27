import { classifyTextPayload, TEXT_LAYOUT_KIND } from './textKinds.js';
import { layoutDimensionText } from './dimensionTextLayout.js';
import { layoutMText } from './mtextLayout.js';
import { layoutSingleLineText } from './singleLineTextLayout.js';

export function layoutCadText(text, textPayload, advanceFn) {
  const kind = classifyTextPayload(textPayload);
  if (kind === TEXT_LAYOUT_KIND.DIMENSION_TEXT) {
    return { kind, lines: layoutDimensionText(text, textPayload, advanceFn) };
  }
  if (kind === TEXT_LAYOUT_KIND.MTEXT) {
    return { kind, lines: layoutMText(text, textPayload, advanceFn) };
  }
  return { kind, lines: layoutSingleLineText(text, textPayload, advanceFn) };
}
