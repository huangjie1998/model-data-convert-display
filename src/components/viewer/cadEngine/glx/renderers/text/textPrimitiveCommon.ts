import type { PrimitiveRecord, TextRenderAccumulator } from '../../types';
import {
  firstNonEmptyText,
  maybeEngineText,
  normalizeCadTextContent,
  parseColorFromUnknown,
  parseFiniteNumber,
  pickPointFromRecord,
  pointXY,
  primitiveColor,
  toNumber,
  toRadians,
} from '../../utils';
import type { TextLayoutKind } from './textPrimitiveClassifier';

function addLayerChild(layerChildren: Map<string, number[]>, layer: string, childIndex: number) {
  const children = layerChildren.get(layer) ?? [];
  children.push(childIndex);
  layerChildren.set(layer, children);
}

export function renderClassifiedTextPrimitive(
  primitive: PrimitiveRecord,
  entityId: string,
  layer: string,
  entityColor: string,
  accumulator: TextRenderAccumulator,
  layoutKind: TextLayoutKind
): { rendered: boolean; overlayText: boolean; engineText: boolean } {
  const record = primitive as Record<string, unknown>;
  const text = normalizeCadTextContent(firstNonEmptyText([record.text, record.contents, record.value, record.display_text]));
  const position = pointXY(pickPointFromRecord(record, ['position', 'text_position', 'insert', 'location']));
  if (!text || !position) return { rendered: false, overlayText: false, engineText: false };

  const color = primitiveColor(primitive, entityColor);
  const isMText = layoutKind === 'mtext';
  const declaredHeight = parseFiniteNumber(record.height);
  const actualHeight = parseFiniteNumber(record.actual_height);
  const resolvedMTextHeight =
    declaredHeight != null && declaredHeight > 0
      ? declaredHeight
      : actualHeight != null && actualHeight > 0
        ? actualHeight
        : undefined;
  const height = Math.max(1, toNumber(isMText ? resolvedMTextHeight : (actualHeight ?? declaredHeight), 120));
  const width = toNumber(
    parseFiniteNumber(record.width) ??
      parseFiniteNumber(record.actual_width) ??
      parseFiniteNumber(record.defined_width) ??
      parseFiniteNumber(record.text_width),
    0
  );
  const rotation = toRadians(toNumber(parseFiniteNumber(record.rotation), 0));
  const widthFactor = toNumber(parseFiniteNumber(record.width_factor), 1);
  const oblique = toNumber(parseFiniteNumber(record.oblique), 0);
  const textMaskColor =
    parseColorFromUnknown(record.text_mask_color ?? record.text_bg_color ?? record.background_color) ?? undefined;

  accumulator.overlayTexts.push({
    entityId,
    layer,
    text,
    x: position[0],
    y: position[1],
    height,
    rotation,
    color,
  });

  if (!accumulator.emitEngineText || !maybeEngineText(text)) {
    return { rendered: true, overlayText: true, engineText: false };
  }

  const entityIndex = accumulator.entitiesJson.length;
  accumulator.entitiesJson.push({
    type: 2,
    extras: {
      text,
      h: height,
      width,
      ro: rotation,
      px: position[0],
      py: position[1],
      color,
      width_factor: widthFactor,
      oblique,
      horizontal_mode: String(record.horizontal_mode ?? ''),
      vertical_mode: String(record.vertical_mode ?? ''),
      attachment: String(record.attachment ?? ''),
      mirrored_x: record.mirrored_x === true,
      mirrored_y: record.mirrored_y === true,
      is_mtext: isMText,
      text_mask: record.text_mask === true,
      text_mask_padding: toNumber(parseFiniteNumber(record.text_mask_padding), 0.25),
      text_mask_color: textMaskColor,
      text_mask_use_canvas_bg: record.text_mask_use_canvas_bg === true,
      subtype: layoutKind === 'dimension_text' ? 'dimension_text' : String(record.subtype ?? ''),
      layout_kind: layoutKind,
      font_key: String(record.font_key ?? ''),
      font_style_name: String(record.font_style_name ?? record.style_name ?? ''),
      font_name: String(record.font_name ?? ''),
      font_family: String(record.font_family ?? ''),
      font_kind: String(record.font_kind ?? ''),
      font_source: String(record.font_source ?? ''),
    },
  });
  addLayerChild(accumulator.layerChildren, layer, entityIndex);
  return { rendered: true, overlayText: true, engineText: true };
}
