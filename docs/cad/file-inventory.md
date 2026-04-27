# CAD Core File Inventory

Last updated: 2026-04-23

## Frontend Entry

- `src/components/viewer/Drawing2DViewer.tsx`: Routes DWG files to `CADViewerCadEngine`.
- `src/components/viewer/CADViewerCadEngine.tsx`: CAD page orchestrator. Manages DWG session lifecycle, scene loading, interaction wiring, and panel states.

## CAD Engine Runtime

- `src/components/viewer/cadEngine/loadCadEngineScript.ts`: Loads CadEngine runtime script (`/vendor/cad-engine-runtime.js` or `VITE_CAD_ENGINE_SCRIPT_URL`).
- `src/components/viewer/cadEngine/runtimeBridge.ts`: Reads `window.CadEngine` and `window.api` safely.
- `src/components/viewer/cadEngine/cadEngineTypes.ts`: Type definitions for CadEngine instance/API/scene/material/node.
- `src/components/viewer/cadEngine/apiCompat.ts`: New/legacy CadEngine API compatibility helpers.
- `src/components/viewer/cadEngine/loadCadEngineScene.ts`: Unified scene loading (`engine.scene.loadBimd` -> `api.loadBimd` -> `api.addGLX`).
- `src/components/viewer/cadEngine/runtimeConfig.ts`: Font URL + runtime timeouts + runtime provider/script URL resolution.
- `src/components/viewer/cadEngine/runtimeDiagnostics.ts`: Runtime diagnostic model.
- `src/components/viewer/cadEngine/sceneDiagnostics.ts`: Scene readiness probing + material patching + scene population waits.
- `src/components/viewer/cadEngine/assetHealth.ts`: Asset reachability check before scene load.
- `src/components/viewer/cadEngine/layerRuntime.ts`: Layer normalization and polling helpers.
- `src/components/viewer/cadEngine/cadUiUtils.ts`: Shared UI utility methods (bbox/flatten/entity aggregation/color/layer normalization).

## Whitebox Runtime Source

- `src/vendor/cad-engine-whitebox/runtime/bootstrap.js`: Whitebox runtime global entry (`window.CadEngine.Engine` export).
- `src/vendor/cad-engine-whitebox/runtime/engine/Engine.js`: Engine lifecycle and render loop.
- `src/vendor/cad-engine-whitebox/runtime/api/WebAPI.js`: Public API surface (`window.api`) compatibility layer.
- `src/vendor/cad-engine-whitebox/runtime/scene/Scene3D.js`: GLX parsing (line/mesh/text entities), layer state, and 2D canvas render pipeline.
- `src/vendor/cad-engine-whitebox/runtime/scene/SceneNode.js`: Lightweight scene graph nodes for diagnostics traversal compatibility.
- `src/vendor/cad-engine-whitebox/runtime/render/CanvasRenderer.js`: Canvas renderer abstraction matching expected renderer methods.
- `src/vendor/cad-engine-whitebox/runtime/camera/Camera2D.js`: Scene/screen coordinate conversion and camera state.
- `src/vendor/cad-engine-whitebox/runtime/core/EventDispatcher.js`: Event subscription utility.
- `src/vendor/cad-engine-whitebox/runtime/core/utils.js`: Shared math/color/GLX parsing helpers.
- `scripts/cad-engine/build-cad-runtime.mjs`: Esbuild bundling script for runtime source -> vendor artifact (`cad-engine-runtime.js`) plus legacy alias output.

## CAD UI Components

- `src/components/viewer/cadEngine/components/CadSidebar.tsx`: Left panel (layers + hierarchy tree + entity/category visibility toggle + locate).
- `src/components/viewer/cadEngine/components/CadInspectorPanel.tsx`: Right panel (selection payload + runtime diagnostics + warning/error surface).

## CAD Hook Contracts

- `src/components/viewer/cadEngine/hooks/contracts.ts`: Shared hook input/output contracts and cross-hook ref/state interfaces.
- `src/components/viewer/cadEngine/hooks/useCadEngineLifecycle.ts`: Engine bootstrap, viewport controls, overlay draw, bbox focus.
- `src/components/viewer/cadEngine/hooks/useCadDocumentLifecycle.ts`: DWG open/close, space loading, document/session state.
- `src/components/viewer/cadEngine/hooks/useCadSelection.ts`: Pick/select flow and selected entity details fetch.
- `src/components/viewer/cadEngine/hooks/useCadSceneRender.ts`: GLX build/load, layer sync, runtime diagnostics.
- `src/components/viewer/cadEngine/hooks/useCadViewState.ts`: View-layer state store (layer/entity visibility, tree expansion, overlay list, sidebar collapse).

## GLX Build Pipeline

- `src/components/viewer/cadEngine/dwgToGlx.ts`: Public export for GLX build entry.
- `src/components/viewer/cadEngine/glx/buildCadEngineGlx.ts`: Entity->GLX main pipeline + diagnostics aggregation.
- `src/components/viewer/cadEngine/glx/types.ts`: GLX intermediate types.
- `src/components/viewer/cadEngine/glx/utils.ts`: Geometry/color/math utilities.

## Primitive Renderers

- `src/components/viewer/cadEngine/glx/renderers/primitiveDispatcher.ts`: Dispatch primitives to concrete renderers.
- `src/components/viewer/cadEngine/glx/renderers/lineRenderer.ts`: LINE.
- `src/components/viewer/cadEngine/glx/renderers/polylineRenderer.ts`: POLYLINE/LWPOLYLINE.
- `src/components/viewer/cadEngine/glx/renderers/polygonRenderer.ts`: HATCH-like polygon rings.
- `src/components/viewer/cadEngine/glx/renderers/arcRenderer.ts`: ARC.
- `src/components/viewer/cadEngine/glx/renderers/circleRenderer.ts`: CIRCLE.
- `src/components/viewer/cadEngine/glx/renderers/ellipseRenderer.ts`: ELLIPSE.
- `src/components/viewer/cadEngine/glx/renderers/pointRenderer.ts`: POINT.
- `src/components/viewer/cadEngine/glx/renderers/blockRenderer.ts`: INSERT/BLOCK primitives.
- `src/components/viewer/cadEngine/glx/renderers/textRenderer.ts`: TEXT/MTEXT engine text + overlay text.
- `src/components/viewer/cadEngine/glx/renderers/dimensionRenderer.ts`: DIMENSION primitives.
- `src/components/viewer/cadEngine/glx/renderers/tableRenderer.ts`: TABLE fallback primitives.

## Primitive Fallback Resolvers

- `src/components/viewer/cadEngine/glx/fallback/entityPrimitiveResolver.ts`: Fallback routing for entity-level primitive extraction.
- `src/components/viewer/cadEngine/glx/fallback/textFallback.ts`: Text fallback extraction.
- `src/components/viewer/cadEngine/glx/fallback/dimensionFallback.ts`: Dimension fallback extraction.
- `src/components/viewer/cadEngine/glx/fallback/blockFallback.ts`: Block fallback extraction.
- `src/components/viewer/cadEngine/glx/fallback/tableFallback.ts`: Table fallback extraction.

## Optional WebGL Parallel Path

- `src/components/viewer/webgl/cadWebglTypes.ts`: WebGL side data contracts.
- `src/components/viewer/webgl/cadWebglRenderer.ts`: Custom WebGL renderer path.
- `src/components/viewer/webgl/cadWebglWorker.ts`: Worker-side preprocessing.

## Vendor Assets

- `public/vendor/cadPreivew.min.js`: Historical legacy runtime bundle (kept only as archived reference; not used by active frontend path).
- `public/vendor/cad-engine-runtime.js`: Built runtime bundle used by `cad_runtime_bundle` provider.
- `public/vendor/cad-engine-runtime.js.map`: Source map for runtime bundle.
- `public/vendor/cad-engine-whitebox.js`: Legacy alias bundle path retained for compatibility.
- `public/vendor/cad-engine-whitebox.js.map`: Source map for legacy alias bundle.
- `public/vendor/fonts/MPLUSRounded1c-Regular.typeface.json`: Default font asset.
- `public/vendor/fonts/droid_sans_regular.typeface.json`: Alternate font asset.

## Backend DWG Service (Core)

- `server/app.py`: Backend entrypoint + health aggregator.
- `server/app_skp_api.py`: DWG HTTP API routes (`/api/dwg/*`).
- `server/dwg_service_core.py`: ODA process integration, DWG parse/open/entities/hierarchy/pick/font workflows.
- `server/requirements.txt`: Python deps.
- `server/Dockerfile`: Runtime image + healthcheck.
