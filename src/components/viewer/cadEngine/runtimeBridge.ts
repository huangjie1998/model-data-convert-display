import type { CadEngineApi, CadEngineCtor } from './cadEngineTypes';

export function resolveCadEngineConstructor(): CadEngineCtor | null {
  return window.CadEngine?.Engine ?? null;
}

export function resolveCadEngineApi(): CadEngineApi | null {
  return window.api ?? null;
}
