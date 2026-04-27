import type { CadEngineApi, CadEngineInstance, CadEngineSceneFile } from './cadEngineTypes';
import { apiAddGlx, apiLoadBimd } from './apiCompat';

interface LoadCadEngineSceneInput {
  engine: CadEngineInstance;
  api: CadEngineApi;
  files: CadEngineSceneFile[];
  glxArrayBuffer: ArrayBuffer;
  glxMeshBuffer: ArrayBuffer;
  timeoutMs: number;
}

export interface LoadCadEngineSceneResult {
  mode: 'engine.scene.loadBimd' | 'api.loadBimd' | 'api.addGLX';
  durationMs: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loadCadEngineScene(input: LoadCadEngineSceneInput): Promise<LoadCadEngineSceneResult> {
  const start = performance.now();
  const { engine, api, files, glxArrayBuffer, glxMeshBuffer, timeoutMs } = input;

  if (typeof engine?.scene?.loadBimd === 'function') {
    await withTimeout(Promise.resolve(engine.scene.loadBimd(files)), timeoutMs, 'engine.scene.loadBimd');
    return {
      mode: 'engine.scene.loadBimd',
      durationMs: performance.now() - start,
    };
  }

  if (await apiLoadBimd(api, files, timeoutMs)) {
    return {
      mode: 'api.loadBimd',
      durationMs: performance.now() - start,
    };
  }

  if (await apiAddGlx(api, glxArrayBuffer, glxMeshBuffer)) {
    return {
      mode: 'api.addGLX',
      durationMs: performance.now() - start,
    };
  }

  throw new Error('CadEngine API does not expose scene loading entrypoints');
}
