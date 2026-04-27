export const TEXT_LAYOUT_KIND = Object.freeze({
  TEXT: 'text',
  MTEXT: 'mtext',
  DIMENSION_TEXT: 'dimension_text',
});

export function isDimensionTextPayload(textPayload) {
  const subtype = String(textPayload?.subtype || '').trim().toLowerCase();
  return subtype === 'dimension_text' || subtype === 'dimension';
}

export function classifyTextPayload(textPayload) {
  if (isDimensionTextPayload(textPayload)) return TEXT_LAYOUT_KIND.DIMENSION_TEXT;
  if (textPayload?.isMText === true) return TEXT_LAYOUT_KIND.MTEXT;
  return TEXT_LAYOUT_KIND.TEXT;
}
