import { toFiniteNumber } from '../core/utils.js';
import { wrapSingleLineToWidth } from './textWrap.js';

export function layoutMText(text, textPayload, advanceFn) {
  const explicitLines = String(text || '').split('\n');
  const width = toFiniteNumber(textPayload?.width, 0);
  if (!Number.isFinite(width) || width <= 1e-6) return explicitLines;

  const out = [];
  for (const line of explicitLines) {
    const wrapped = wrapSingleLineToWidth(line, width, advanceFn);
    for (const item of wrapped) out.push(item);
  }
  return out;
}
