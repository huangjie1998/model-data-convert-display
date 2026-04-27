export const CAD_ENGINE_FONT_URL =
  (import.meta.env.VITE_CAD_ENGINE_FONT_URL as string | undefined) || '/vendor/fonts/FangSong_GB2312_Regular.json';

export const CAD_ENGINE_SHX_STROKE_TEXT_ENABLED =
  String(import.meta.env.VITE_CAD_ENGINE_SHX_STROKE_TEXT_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

export const CAD_ENGINE_SHX_FONT_URL =
  (import.meta.env.VITE_CAD_ENGINE_SHX_FONT_URL as string | undefined) ||
  '/vendor/fonts/shx/txt.shx';

export const CAD_ENGINE_SHX_BIGFONT_URL =
  (import.meta.env.VITE_CAD_ENGINE_SHX_BIGFONT_URL as string | undefined) ||
  '/vendor/fonts/shx/EngineeringChinese.shx';

export const CAD_ENGINE_SHX_BIGFONT_MAP_URL =
  (import.meta.env.VITE_CAD_ENGINE_SHX_BIGFONT_MAP_URL as string | undefined) ||
  '/vendor/fonts/shx/EngineeringChinese.gb2312-map.json';

function parsePositiveFloat(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export const CAD_ENGINE_SHX_BIGFONT_SCALE = parsePositiveFloat(
  import.meta.env.VITE_CAD_ENGINE_SHX_BIGFONT_SCALE as string | undefined,
  0.56,
  0.1,
  2
);

export const CAD_ENGINE_SHX_TEXT_HEIGHT_SCALE = parsePositiveFloat(
  import.meta.env.VITE_CAD_ENGINE_SHX_TEXT_HEIGHT_SCALE as string | undefined,
  1.12,
  0.5,
  2
);

export const CAD_ENGINE_SHX_MTEXT_HEIGHT_SCALE = parsePositiveFloat(
  import.meta.env.VITE_CAD_ENGINE_SHX_MTEXT_HEIGHT_SCALE as string | undefined,
  1.08,
  0.5,
  2
);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(16, parsed));
}

export const CAD_ENGINE_TEXT_CURVE_SEGMENTS = parsePositiveInt(
  import.meta.env.VITE_CAD_ENGINE_TEXT_CURVE_SEGMENTS as string | undefined,
  1
);

export type CadEngineRuntimeProvider = 'cad_runtime_bundle';

const CAD_ENGINE_SCRIPT_URL_OVERRIDE = import.meta.env.VITE_CAD_ENGINE_SCRIPT_URL as string | undefined;

export const CAD_ENGINE_RUNTIME_PROVIDER: CadEngineRuntimeProvider = 'cad_runtime_bundle';

export const CAD_ENGINE_RUNTIME_SCRIPT_URL =
  (import.meta.env.VITE_CAD_ENGINE_RUNTIME_SCRIPT_URL as string | undefined) ||
  // backward compatibility for historical env naming
  (import.meta.env.VITE_CAD_ENGINE_WHITEBOX_SCRIPT_URL as string | undefined) ||
  '/vendor/cad-engine-runtime.js';

export function resolveCadEngineScriptUrl(): string {
  if (CAD_ENGINE_SCRIPT_URL_OVERRIDE) {
    return CAD_ENGINE_SCRIPT_URL_OVERRIDE;
  }
  return CAD_ENGINE_RUNTIME_SCRIPT_URL;
}

export const CAD_ENGINE_ASSET_CHECK_TIMEOUT_MS = 8000;
export const CAD_ENGINE_LOAD_READY_TIMEOUT_MS = 15000;
export const CAD_ENGINE_READY_POLL_INTERVAL_MS = 80;
