import type { CadEngineApi } from './cadEngineTypes';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof (value as { then?: unknown }).then === 'function';
}

export function apiPurgeModel(api: CadEngineApi): boolean {
  if (typeof api.purgeModel === 'function') {
    api.purgeModel();
    return true;
  }
  return false;
}

export function apiSetFontPath(api: CadEngineApi, fontPath: string): boolean {
  if (typeof api.setFontPath === 'function') {
    api.setFontPath(fontPath);
    return true;
  }
  return false;
}

export function apiGetLayers(api: CadEngineApi): unknown {
  if (typeof api.getLayers === 'function') {
    return api.getLayers();
  }
  return undefined;
}

export function apiSetLayerVisible(api: CadEngineApi, layerId: number, visible: boolean): boolean {
  if (typeof api.setLayerVisible === 'function') {
    api.setLayerVisible(layerId, visible);
    return true;
  }
  return false;
}

export function apiSetAllLayerVisible(api: CadEngineApi, visible: boolean): boolean {
  if (typeof api.setAllLayerVisibility === 'function') {
    api.setAllLayerVisibility(visible);
    return true;
  }
  if (typeof api.setAllLayerVisible === 'function') {
    api.setAllLayerVisible(visible);
    return true;
  }
  return false;
}

export function apiSetClippingType(api: CadEngineApi, mode: string): boolean {
  if (typeof api.setClippingType === 'function') {
    api.setClippingType(mode);
    return true;
  }
  if (typeof api.ClippingType === 'function') {
    api.ClippingType(mode);
    return true;
  }
  return false;
}

export function apiSetClippingEnabled(api: CadEngineApi, enabled: boolean): boolean {
  if (typeof api.setClippingEnabled === 'function') {
    api.setClippingEnabled(enabled);
    return true;
  }
  if (typeof api.ClippingEnable === 'function') {
    api.ClippingEnable(enabled);
    return true;
  }
  return false;
}

export function apiSetClippingEditMode(api: CadEngineApi, enabled: boolean): boolean {
  if (typeof api.setClippingEditMode === 'function') {
    api.setClippingEditMode(enabled);
    return true;
  }
  if (typeof api.ClippingEdit === 'function') {
    api.ClippingEdit(enabled);
    return true;
  }
  return false;
}

export function apiAddGltf(api: CadEngineApi, gltf: unknown): boolean {
  if (typeof api.addGltf === 'function') {
    api.addGltf(gltf);
    return true;
  }
  if (typeof api.addglTF === 'function') {
    api.addglTF(gltf);
    return true;
  }
  return false;
}

export function apiLoadRemoteFile(api: CadEngineApi, url: string): unknown {
  if (typeof api.loadFile === 'function') {
    return api.loadFile(url);
  }
  if (typeof api.loadfile === 'function') {
    return api.loadfile(url);
  }
  return undefined;
}

export async function apiLoadBimd(api: CadEngineApi, files: unknown, timeoutMs: number): Promise<boolean> {
  if (typeof api.loadBimd !== 'function') {
    return false;
  }

  const result = api.loadBimd(undefined, files as never, undefined);
  if (isThenable(result)) {
    let timeoutId = 0;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(`api.loadBimd timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      await Promise.race([Promise.resolve(result), timeout]);
    } finally {
      window.clearTimeout(timeoutId);
    }
  } else {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
  }

  return true;
}

export async function apiAddGlx(api: CadEngineApi, glxArrayBuffer: ArrayBuffer, glxMeshBuffer: ArrayBuffer): Promise<boolean> {
  if (typeof api.addGLX === 'function') {
    api.addGLX(glxArrayBuffer, glxMeshBuffer);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    return true;
  }
  if (typeof api.addGlx === 'function') {
    api.addGlx(glxArrayBuffer, glxMeshBuffer);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    return true;
  }
  return false;
}
