import type { CadEngineApi, CadEngineInstance, CadEngineLayerInfo } from './cadEngineTypes';
import { apiGetLayers } from './apiCompat';

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function normalizeApiLayers(raw: unknown): CadEngineLayerInfo[] {
  if (!Array.isArray(raw)) return [];

  const out: CadEngineLayerInfo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = Number((item as { id?: unknown }).id);
    if (!Number.isFinite(id)) continue;
    const name = String((item as { name?: unknown }).name ?? '').trim();
    if (!name) continue;
    out.push({ id, name });
  }
  return out;
}

export function readRuntimeLayers(api: CadEngineApi | null, engine: CadEngineInstance | null): CadEngineLayerInfo[] {
  if (api) {
    const apiLayers = normalizeApiLayers(apiGetLayers(api));
    if (apiLayers.length > 0) {
      return apiLayers;
    }
  }
  if (engine?.scene?.getLayers) {
    return normalizeApiLayers(engine.scene.getLayers());
  }
  return [];
}

export async function waitForLayerReady(
  reader: () => CadEngineLayerInfo[],
  timeoutMs: number,
  pollIntervalMs = 50
): Promise<CadEngineLayerInfo[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const layers = reader();
    if (layers.length > 0) {
      return layers;
    }
    await sleep(pollIntervalMs);
  }
  return reader();
}
