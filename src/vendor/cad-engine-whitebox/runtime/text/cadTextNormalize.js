import * as THREE from 'three';
import { clamp, toFiniteNumber } from '../core/utils.js';

export const TEXT_LINE_HEIGHT_FACTOR = 1.25;
export const DEFAULT_TEXT_CURVE_SEGMENTS = 1;

export function decodeCadUnicodeEscapes(text) {
  return String(text || '').replace(/\\U\+([0-9a-fA-F]{4})/g, (_all, hex) => {
    const code = Number.parseInt(hex, 16);
    if (!Number.isFinite(code)) return '';
    try {
      return String.fromCharCode(code);
    } catch {
      return '';
    }
  });
}

export function normalizeCadTextForDisplay(value) {
  let text = decodeCadUnicodeEscapes(value);
  if (!text) return '';

  text = text
    .replace(/%%d/gi, '\u00B0')
    .replace(/%%p/gi, '\u00B1')
    .replace(/%%c/gi, '\u2300')
    .replace(/\u33A1/g, 'm2')
    .replace(/\\P/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\~/g, ' ');

  // Strip AutoCAD %%nnn numeric glyph codes (SHX font-internal glyph indices,
  // not Unicode code points — cannot be decoded without the specific font's
  // glyph table, so remove them to avoid blank placeholder characters).
  text = text.replace(/%%\d{1,3}/g, '');

  text = text.replace(/\\S([^;]*?)[#^/]([^;]*?);/gi, (_all, top, bottom) => `${top}/${bottom}`);
  text = text
    .replace(/\\[ACFHQTW][^;]*;/gi, '')
    .replace(/\\[LOK]/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '');

  // 仅 trimEnd：保留前导空格（TEXT 排版意图），尾部空格视为脏数据。
  return text.trimEnd();
}

export function normalizeObliqueToRadians(value) {
  const degrees = toFiniteNumber(value, 0);
  if (!Number.isFinite(degrees) || Math.abs(degrees) < 1e-9) return 0;
  const clamped = clamp(degrees, -85, 85);
  return (clamped * Math.PI) / 180;
}

export function safeWidthFactor(value) {
  const raw = toFiniteNumber(value, 1);
  if (!Number.isFinite(raw) || Math.abs(raw) < 1e-6) return 1;
  return Math.max(1e-6, Math.min(1000, Math.abs(raw)));
}

export function makeShearMatrix(shear) {
  return new THREE.Matrix4().set(
    1, shear, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  );
}

export function normalizeCurveSegments(value) {
  const parsed = Math.round(toFiniteNumber(value, DEFAULT_TEXT_CURVE_SEGMENTS));
  if (!Number.isFinite(parsed)) return DEFAULT_TEXT_CURVE_SEGMENTS;
  return Math.max(1, Math.min(16, parsed));
}

export function normalizeBigFontScale(value) {
  const parsed = toFiniteNumber(value, 0.56);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.56;
  return Math.max(0.1, Math.min(2, parsed));
}

export function normalizeTextHeightScale(value, fallback) {
  const parsed = toFiniteNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(0.5, Math.min(2, parsed));
}

export function isCjkChar(char) {
  const code = char.codePointAt(0);
  if (!Number.isFinite(code)) return false;
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2ffff)
  );
}

export function isCjkText(text) {
  return [...String(text || '')].some((char) => isCjkChar(char));
}
