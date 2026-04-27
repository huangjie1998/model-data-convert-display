import type { CadEngineGlobal } from './cadEngineTypes';
import { CAD_ENGINE_RUNTIME_PROVIDER, resolveCadEngineScriptUrl } from './runtimeConfig';

let scriptPromise: Promise<void> | null = null;

function hasCadEngineLoaded(): boolean {
  const globalCadEngine = (window as Window & { CadEngine?: CadEngineGlobal }).CadEngine;
  return typeof globalCadEngine?.Engine === 'function';
}

export function loadCadEngineScript(): Promise<void> {
  if (hasCadEngineLoaded()) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const scriptUrl = resolveCadEngineScriptUrl();
    const loadErrorMessage = `Failed to load CadEngine runtime (${CAD_ENGINE_RUNTIME_PROVIDER}): ${scriptUrl}`;

    const existing = document.querySelector<HTMLScriptElement>('script[data-cad-engine="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(loadErrorMessage)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.dataset.cadEngine = '1';
    script.dataset.cadEngineProvider = CAD_ENGINE_RUNTIME_PROVIDER;
    script.onload = () => {
      const cadEngine = (window as Window & { CadEngine?: CadEngineGlobal }).CadEngine;
      if (cadEngine && typeof cadEngine === 'object') {
        cadEngine.__provider = CAD_ENGINE_RUNTIME_PROVIDER;
      }
      resolve();
    };
    script.onerror = () => reject(new Error(loadErrorMessage));
    document.head.appendChild(script);
  });

  return scriptPromise;
}
