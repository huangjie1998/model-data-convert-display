# CAD Runtime Transition Notes

> Historical note: this document keeps legacy "whitebox" terminology for migration traceability.  
> Active runtime naming has been standardized to `cad runtime` / `cad_runtime_bundle`.

This project now uses the split whitebox runtime as the only active CAD frontend runtime path.

## Current state

- Runtime loading and API access are isolated in:
  - `src/components/viewer/cadEngine/loadCadEngineScript.ts`
  - `src/components/viewer/cadEngine/runtimeBridge.ts`
  - `src/components/viewer/cadEngine/cadEngineTypes.ts`
- Scene load and diagnostics are isolated in:
  - `src/components/viewer/cadEngine/loadCadEngineScene.ts`
  - `src/components/viewer/cadEngine/sceneDiagnostics.ts`
- Runtime provider is fixed to CAD runtime:
  - `cad_runtime_bundle` is the active runtime provider in frontend config.
  - Script URL resolution in `src/components/viewer/cadEngine/runtimeConfig.ts`
  - Loader wiring in `src/components/viewer/cadEngine/loadCadEngineScript.ts`
- Runtime entry script added:
  - `public/vendor/cad-engine-runtime.js`
  - Legacy alias path: `public/vendor/cad-engine-whitebox.js`
  - Current behavior: independent runtime entry that exposes `window.CadEngine.Engine` and `window.api` without loading `cadPreivew.min.js`.
  - Source split: `src/vendor/cad-engine-whitebox/runtime/*`
  - Build command: `npm run build:cad-runtime`
  - Text coverage: whitebox runtime now parses and renders GLX `entity.type=2` text payloads directly on engine canvas.
  - MTEXT normalization: frontend GLX text conversion now strips common CAD control codes and preserves multiline output.
  - Dimension fallback: when native dimension primitives are missing, fallback now synthesizes arch-tick-like endpoint marks.
- `cadPreivew.min.js` inline source-map sources are extracted to:
  - `src/vendor/cad-engine-whitebox/sources/`
  - This folder is now excluded from app lint/build so it can be iterated as raw whitebox material.
- Semantic rename batches 1-2 completed on extracted core files:
  - `src/vendor/cad-engine-whitebox/sources/webpack_/CadEngine/src/Engine.ts`
  - `src/vendor/cad-engine-whitebox/sources/webpack_/CadEngine/src/api/WebAPI.ts`
  - `src/vendor/cad-engine-whitebox/sources/webpack_/CadEngine/src/core/Scene3D.ts`
  - `src/vendor/cad-engine-whitebox/sources/webpack_/CadEngine/src/core/plugins/GlxLoader.ts`
  - `src/vendor/cad-engine-whitebox/sources/webpack_/CadEngine/src/core/plugins/Clipping.ts`
  - `src/vendor/cad-engine-whitebox/sources/webpack_/CadEngine/src/core/camera/Camera2DControls.ts`
  - Frontend compatibility adapter: `src/components/viewer/cadEngine/apiCompat.ts`
  - Mapping doc: `docs/cad/whitebox-rename-map.md`

## Why this matters

- The outer chain is now maintainable and typed.
- If/when a whitebox engine source is introduced, only the bridge/adapter layer should need replacement.

## Recommended next migration step

1. Expand whitebox renderer coverage for `TEXT/MTEXT/DIMENSION` visual parity.
2. Keep CAD viewer using adapter-style API boundaries (`apiCompat`) while whitebox internals evolve.
3. Add focused whitebox diagnostics for missing entities/text/annotation mismatches.
