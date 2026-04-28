import { toFiniteNumber } from '../core/utils.js';
import { safeWidthFactor } from '../text/cadTextNormalize.js';
import { isDimensionTextPayload } from '../text/textKinds.js';

export function textHorizontalScaleFromTargetWidth(bbox, textPayload) {
  const widthFactor = safeWidthFactor(textPayload?.widthFactor);
  const rotation = toFiniteNumber(textPayload?.rotation, 0);
  const isSideways = Math.abs(Math.sin(rotation)) > 0.985;
  if (isDimensionTextPayload(textPayload) || textPayload?.isMText === true || textPayload?.verticalText === true || isSideways) {
    return widthFactor;
  }
  const targetWidth = toFiniteNumber(textPayload?.width, 0);
  if (!Number.isFinite(targetWidth) || targetWidth <= 1e-6 || !bbox || bbox.isEmpty()) {
    return widthFactor;
  }
  const naturalWidth = Math.max(0, bbox.max.x - bbox.min.x);
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 1e-6) {
    return widthFactor;
  }
  return Math.max(1e-6, Math.min(1000, targetWidth / naturalWidth));
}

export function textCanvasWidthFactorFromTargetWidth(textPayload, measuredPixelWidth, pixelToWorld) {
  const widthFactor = safeWidthFactor(textPayload?.widthFactor);
  const rotation = toFiniteNumber(textPayload?.rotation, 0);
  const isSideways = Math.abs(Math.sin(rotation)) > 0.985;
  if (isDimensionTextPayload(textPayload) || textPayload?.isMText === true || textPayload?.verticalText === true || isSideways) {
    return widthFactor;
  }
  const targetWidth = toFiniteNumber(textPayload?.width, 0);
  if (
    !Number.isFinite(targetWidth) ||
    targetWidth <= 1e-6 ||
    !Number.isFinite(measuredPixelWidth) ||
    measuredPixelWidth <= 1e-6 ||
    !Number.isFinite(pixelToWorld) ||
    pixelToWorld <= 1e-9
  ) {
    return widthFactor;
  }
  return Math.max(1e-6, Math.min(1000, targetWidth / (measuredPixelWidth * pixelToWorld)));
}
