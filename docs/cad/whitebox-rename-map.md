# CAD Runtime Rename Map (Batch 1-2)

Last updated: 2026-04-23

Historical note: file path is kept for continuity, but active runtime naming now uses `cad runtime`.

This mapping is based on actual call semantics from extracted legacy source-map files, not on string-only replacements.

## Engine.ts

- `_webAPI` -> `_apiBridge`
  - Reason: this object is the external API bridge between engine and page layer.
- `initEvent()` -> `initializeEvents()`
  - Reason: function wires runtime events, not a generic init.
- `animate()` -> `startRenderLoop()`
  - Reason: method starts and continues frame loop.
- Added `apiBridge` getter.

## api/WebAPI.ts

- Local callback names:
  - `callback_` -> `onMoveFinished` / `onScaleFinished` / `onMeasureFinished`
  - `updateGPU` -> `requestGpuRefresh`
- Clipping API methods:
  - `ClippingEdit` -> `setClippingEditMode`
  - `ClippingType` -> `setClippingType`
  - `ClippingEnable` -> `setClippingEnabled`
  - Legacy names kept as aliases for compatibility.
- Model/file naming:
  - `addglTF` -> `addGltf` (legacy alias kept)
  - `loadfile` -> `loadFile` (legacy alias kept)
- Visibility semantics:
  - `setLayerVisible(id, Visible)` -> `setLayerVisible(id, visible)`
  - `setAllLayerVisible(Visible)` -> `setAllLayerVisibility(visible)` (legacy alias kept)
- Zoom callback naming:
  - `setCameraZoom(CallBack)` -> `setCameraZoom(onZoomFinished)`

## core/Scene3D.ts

- Camera zoom controller naming:
  - `CamreaZoom` import alias -> `CameraZoomController`
  - `camreaZoom` -> `cameraZoomController`
  - `_camreaZoomCallBack` -> `_onCameraZoomFinished`
  - `camreaZoomFinish` -> `onCameraZoomFinished`
- Layer visibility semantics:
  - `setAllLayerVisible(Visible)` now delegated to clearer method `setAllLayerHidden(isHidden)`
  - Legacy `setAllLayerVisible` kept as alias.
- Overlay transform typo:
  - `stopTranlatingOverlay` -> `stopTranslatingOverlay`
  - Legacy typo method kept as alias.
- Zoom callback naming:
  - `setCameraZoom(CallBack)` -> `setCameraZoom(onZoomFinished)`

## core/plugins/GlxLoader.ts

- Loader and font fields:
  - `fileLoader` -> `binaryFileLoader`
  - `font` -> `parsedFont`
- Parse and load pipeline naming:
  - `parse` -> `parseWithCompanionBin` (legacy `parse` alias kept)
  - `loadFont` -> `loadFontAsset`
  - `load` -> `loadSceneBundle` (legacy `load` alias kept)
  - `parse2` -> `parseBuffers` (legacy `parse2` alias kept)
  - `loadfile` -> `loadFileBuffer` (legacy `loadfile` alias kept)
- Typo normalization:
  - `glxArryBuffer` -> `glxArrayBuffer`

## core/plugins/Clipping.ts

- Core lifecycle and mode naming:
  - `init` -> `initialize`
  - `change` -> `onTransformChanged`
  - `ClippingType` -> `setClipMode`
  - `ClippingEdit` -> `setClipEditEnabled`
  - `type` -> `clipMode`
- State serialization naming:
  - `getClippingPara` -> `getClippingParams`
  - `setClippingPara` -> `applyClippingParams`
- Scene reset/stencil helper naming:
  - `reset` -> `resetForScene`
  - `addPlaneStencilGroup` -> `createPlaneStencilGroup`
- Legacy names are preserved as wrappers.

## core/camera/Camera2DControls.ts

- State and intent naming:
  - `STATE` -> `CONTROL_STATE`
  - `state` -> `interactionState`
  - `initEvents` -> `bindEvents`
  - `dollyCamera` -> `zoomByWheel`
  - `panCamera` -> `panByPointer`
- Binding object naming:
  - `mouseButtons` -> `pointerBindings`
  - `touches` -> `touchBindings`

## Frontend Bridge

- Added `src/components/viewer/cadEngine/apiCompat.ts` to normalize new/legacy runtime API calls.
- `useCadSceneRender` now uses compat wrappers for `purgeModel/setFontPath/setLayerVisible`.
- `loadCadEngineScene` and `layerRuntime` now consume compat wrappers for scene-load and layer-read calls.
- Added split runtime source under `src/vendor/cad-engine-whitebox/runtime/*`, bundled to `public/vendor/cad-engine-runtime.js` with legacy alias output `public/vendor/cad-engine-whitebox.js`, preserving public contract (`window.CadEngine.Engine`, `window.api`).
- `useCadEngineLifecycle` overlay draw now short-circuits under `cad_runtime` (with `whitebox_independent` fallback) to avoid duplicate text rendering while engine-side text is active.

## Batch 3 (2026-04-23)

- `core/Scene3D.ts` state naming refresh:
  - `ModelFileList` -> `modelFiles`
  - `moveCount` -> `pointerMoveCount`
  - `oldSize` -> `previousCanvasSize`
  - `layer` -> `layerStates`
  - `layout` -> `layoutStates`
  - `currentlayout` -> `currentLayout`
- `core/Scene3D.ts` event wiring naming:
  - `initEvent()` -> `bindEvents()`
  - Legacy `initEvent()` wrapper kept and forwards to `bindEvents()`.
- `core/plugins/Snapper.ts` typo cleanup:
  - `camrea` -> `camera`
  - `camreaChanged()` -> `cameraChanged()`
  - Legacy `camreaChanged()` alias kept.

## Compatibility Rule

For each renamed public method, keep old method name as thin alias until frontend fully migrates to new names. Remove aliases only after adapter migration and runtime switch are complete.



