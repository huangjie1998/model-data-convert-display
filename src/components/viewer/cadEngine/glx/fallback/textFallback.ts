import type { DwgPrimitive } from '@/services/dwgApi';
import { firstNonEmptyText, isFiniteNumber, normalizeCadTextContent, pointFromUnknown } from '../utils';

type TextPrimitive = Extract<DwgPrimitive, { kind: 'text' }>;

export function buildFallbackTextPrimitive(geom: Record<string, unknown>, subtype?: string): TextPrimitive | null {
  const text = normalizeCadTextContent(firstNonEmptyText([
    geom.text,
    geom.display_text,
    geom.formatted_measurement,
    geom.override_text,
    geom.contents,
    geom.plain_text,
    geom.value,
    geom.user_text,
    geom.text_override,
  ]));
  if (!text) return null;

  const position =
    pointFromUnknown(geom.position) ??
    pointFromUnknown(geom.text_position) ??
    pointFromUnknown(geom.insert) ??
    pointFromUnknown(geom.location);
  if (!position) return null;

  return {
    kind: 'text',
    text,
    position,
    color:
      typeof geom.text_color === 'string' || typeof geom.text_color === 'number'
        ? geom.text_color
        : typeof geom.color === 'string' || typeof geom.color === 'number'
          ? geom.color
          : undefined,
    height: isFiniteNumber(geom.height) ? geom.height : undefined,
    actual_height: isFiniteNumber(geom.actual_height) ? geom.actual_height : undefined,
    actual_width: isFiniteNumber(geom.actual_width) ? geom.actual_width : undefined,
    width: isFiniteNumber(geom.width) ? geom.width : undefined,
    rotation: isFiniteNumber(geom.rotation) ? geom.rotation : undefined,
    width_factor: isFiniteNumber(geom.width_factor) ? geom.width_factor : undefined,
    oblique: isFiniteNumber(geom.oblique) ? geom.oblique : undefined,
    horizontal_mode: typeof geom.horizontal_mode === 'string' ? geom.horizontal_mode : undefined,
    vertical_mode: typeof geom.vertical_mode === 'string' ? geom.vertical_mode : undefined,
    text_vertical: geom.text_vertical === true,
    attachment: typeof geom.attachment === 'string' ? geom.attachment : undefined,
    mirrored_x: geom.mirrored_x === true,
    mirrored_y: geom.mirrored_y === true,
    is_mtext: geom.is_mtext === true,
    text_mask: geom.text_mask === true,
    text_mask_padding: isFiniteNumber(geom.text_mask_padding) ? geom.text_mask_padding : undefined,
    text_mask_color:
      typeof geom.text_mask_color === 'string' || typeof geom.text_mask_color === 'number'
        ? geom.text_mask_color
        : undefined,
    text_mask_use_canvas_bg: geom.text_mask_use_canvas_bg === true,
    subtype,
  };
}
