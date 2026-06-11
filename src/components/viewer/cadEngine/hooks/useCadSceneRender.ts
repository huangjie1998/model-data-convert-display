import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureAssetReachable } from '../assetHealth';
import { waitForLayerReady, readRuntimeLayers } from '../layerRuntime';
import { loadCadEngineScene } from '../loadCadEngineScene';
import {
  CAD_ENGINE_ASSET_CHECK_TIMEOUT_MS,
  CAD_ENGINE_FONT_URL,
  CAD_ENGINE_LOAD_READY_TIMEOUT_MS,
  CAD_ENGINE_READY_POLL_INTERVAL_MS,
  CAD_ENGINE_SHX_BIGFONT_MAP_URL,
  CAD_ENGINE_SHX_BIGFONT_HEIGHT_SCALE,
  CAD_ENGINE_SHX_BIGFONT_SCALE,
  CAD_ENGINE_SHX_BIGFONT_URL,
  CAD_ENGINE_SHX_FONT_URL,
  CAD_ENGINE_SHX_MTEXT_HEIGHT_SCALE,
  CAD_ENGINE_SHX_REBAR_FONT_URL,
  CAD_ENGINE_SHX_STROKE_TEXT_ENABLED,
  CAD_ENGINE_SHX_TEXT_HEIGHT_SCALE,
  CAD_ENGINE_TEXT_CURVE_SEGMENTS,
} from '../runtimeConfig';
import { createRuntimeDiagnostics, type CadEngineRuntimeDiagnostics, type TextGlyphDiagnostics } from '../runtimeDiagnostics';
import { isScenePopulated, patchSceneMaterials, waitForScenePopulation } from '../sceneDiagnostics';
import { buildCadEngineGlx, type BuildGlxDiagnostics } from '../dwgToGlx';
import { resolveCadEngineApi } from '../runtimeBridge';
import { apiPurgeModel, apiSetFontPath, apiSetLayerVisible } from '../apiCompat';
import type { UseCadSceneRenderInput, UseCadSceneRenderResult } from './contracts';

const EMPTY_HIDDEN_ENTITY_IDS = new Set<string>();
const MAX_ENTITY_HIDE_REBUILD_COUNT = 50000;

function toRuntimeTextDiagnostics(value: unknown): TextGlyphDiagnostics | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const samplesRaw = Array.isArray(record.glyphMissingSamples) ? record.glyphMissingSamples : [];
  return {
    fontFamily: typeof record.fontFamily === 'string' && record.fontFamily.trim() ? record.fontFamily : null,
    fontPath: typeof record.fontPath === 'string' && record.fontPath.trim() ? record.fontPath : null,
    curveSegments: Number.isFinite(Number(record.curveSegments)) ? Number(record.curveSegments) : CAD_ENGINE_TEXT_CURVE_SEGMENTS,
    renderMode: typeof record.renderMode === 'string' && record.renderMode.trim() ? record.renderMode : null,
    shxStrokeTextEnabled: record.shxStrokeTextEnabled === true,
    shxFontPath: typeof record.shxFontPath === 'string' && record.shxFontPath.trim() ? record.shxFontPath : null,
    shxBigFontPath: typeof record.shxBigFontPath === 'string' && record.shxBigFontPath.trim() ? record.shxBigFontPath : null,
    shxBigFontMapPath:
      typeof record.shxBigFontMapPath === 'string' && record.shxBigFontMapPath.trim() ? record.shxBigFontMapPath : null,
    shxBigFontScale: Number.isFinite(Number(record.shxBigFontScale)) ? Number(record.shxBigFontScale) : CAD_ENGINE_SHX_BIGFONT_SCALE,
    shxTextHeightScale: Number.isFinite(Number(record.shxTextHeightScale)) ? Number(record.shxTextHeightScale) : CAD_ENGINE_SHX_TEXT_HEIGHT_SCALE,
    shxMTextHeightScale: Number.isFinite(Number(record.shxMTextHeightScale)) ? Number(record.shxMTextHeightScale) : CAD_ENGINE_SHX_MTEXT_HEIGHT_SCALE,
    shxFontLoaded: record.shxFontLoaded === true,
    shxBigFontLoaded: record.shxBigFontLoaded === true,
    shxBigFontMapLoaded: record.shxBigFontMapLoaded === true,
    shxLoadError: typeof record.shxLoadError === 'string' && record.shxLoadError.trim() ? record.shxLoadError : null,
    textObjectCount: Number.isFinite(Number(record.textObjectCount)) ? Number(record.textObjectCount) : 0,
    shxTextObjectCount: Number.isFinite(Number(record.shxTextObjectCount)) ? Number(record.shxTextObjectCount) : 0,
    typefaceTextObjectCount: Number.isFinite(Number(record.typefaceTextObjectCount)) ? Number(record.typefaceTextObjectCount) : 0,
    spriteTextObjectCount: Number.isFinite(Number(record.spriteTextObjectCount)) ? Number(record.spriteTextObjectCount) : 0,
    mtextDefinedWidthCount: Number.isFinite(Number(record.mtextDefinedWidthCount)) ? Number(record.mtextDefinedWidthCount) : 0,
    mtextWrappedLineCount: Number.isFinite(Number(record.mtextWrappedLineCount)) ? Number(record.mtextWrappedLineCount) : 0,
    shxMaxLineAdvance: Number.isFinite(Number(record.shxMaxLineAdvance)) ? Number(record.shxMaxLineAdvance) : 0,
    shxWrapWidth: Number.isFinite(Number(record.shxWrapWidth)) ? Number(record.shxWrapWidth) : 0,
    glyphMissingCount: Number.isFinite(Number(record.glyphMissingCount)) ? Number(record.glyphMissingCount) : 0,
    glyphMissingSamples: samplesRaw.map((item) => String(item)).filter(Boolean).slice(0, 24),
    sourceQuestionMarkCount: Number.isFinite(Number(record.sourceQuestionMarkCount)) ? Number(record.sourceQuestionMarkCount) : 0,
    generatedQuestionMarkCount: Number.isFinite(Number(record.generatedQuestionMarkCount)) ? Number(record.generatedQuestionMarkCount) : 0,
  };
}

function readTextDiagnostics(engine: UseCadSceneRenderInput['engineRef']['current']): TextGlyphDiagnostics | null {
  try {
    return toRuntimeTextDiagnostics(engine?.scene?.getTextDiagnostics?.());
  } catch {
    return null;
  }
}

export function useCadSceneRender(input: UseCadSceneRenderInput): UseCadSceneRenderResult {
  const {
    entities,
    currentSpace,
    hiddenEntityIds,
    hiddenLayerNames,
    engineRef,
    apiRef,
    sceneReadyRef,
    sceneBlobUrlsRef,
    revokeSceneBlobUrls,
    drawOverlay,
    resizeEngine,
    onOverlayTextsChange,
    onError,
    shxFontUrls,
  } = input;

  const [layerIdByName, setLayerIdByName] = useState<Map<string, number>>(new Map());
  const [renderDiagnostics, setRenderDiagnostics] = useState<BuildGlxDiagnostics | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<CadEngineRuntimeDiagnostics | null>(null);
  const renderHiddenEntityIds = useMemo(
    () => (hiddenEntityIds.size > 0 && hiddenEntityIds.size <= MAX_ENTITY_HIDE_REBUILD_COUNT ? hiddenEntityIds : EMPTY_HIDDEN_ENTITY_IDS),
    [hiddenEntityIds]
  );

  const resetRenderState = useCallback(() => {
    setLayerIdByName(new Map());
    setRenderDiagnostics(null);
    setRuntimeDiagnostics(null);
    onOverlayTextsChange([]);
  }, [onOverlayTextsChange]);

  useEffect(() => {
    let api = apiRef.current;
    const engine = engineRef.current;

    if (!api) {
      api = resolveCadEngineApi();
      apiRef.current = api;
    }
    if (!api || !engine) return;

    if (entities.length === 0) {
      setLayerIdByName(new Map());
      setRenderDiagnostics(null);
      setRuntimeDiagnostics(null);
      onOverlayTextsChange([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      let runtime = createRuntimeDiagnostics(CAD_ENGINE_FONT_URL);
      const commitRuntime = (patch: Partial<CadEngineRuntimeDiagnostics>) => {
        runtime = { ...runtime, ...patch };
        setRuntimeDiagnostics(runtime);
      };

      try {
        const built = buildCadEngineGlx(entities, {
          hiddenEntityIds: renderHiddenEntityIds,
          spaceName: currentSpace,
          emitEngineText: true,
        });

        const glxArrayBuffer = built.glxJsonBytes.buffer.slice(
          built.glxJsonBytes.byteOffset,
          built.glxJsonBytes.byteOffset + built.glxJsonBytes.byteLength
        ) as ArrayBuffer;

        setLayerIdByName(built.layerIdByName);
        onOverlayTextsChange(built.overlayTexts);
        setRenderDiagnostics(built.diagnostics);
        setRuntimeDiagnostics(runtime);

        sceneReadyRef.current = false;
        revokeSceneBlobUrls();
        apiPurgeModel(api);

        if (engine.scene) {
          engine.scene.shxStrokeTextEnabled = CAD_ENGINE_SHX_STROKE_TEXT_ENABLED;
          // Use DWG-specific SHX fonts when available, fall back to defaults
          engine.scene.shxFontPath = shxFontUrls?.main || CAD_ENGINE_SHX_FONT_URL;
          engine.scene.shxBigFontPath = shxFontUrls?.bigfont || CAD_ENGINE_SHX_BIGFONT_URL;
          engine.scene.shxBigFontMapPath = CAD_ENGINE_SHX_BIGFONT_MAP_URL;
          engine.scene.shxBigFontScale = CAD_ENGINE_SHX_BIGFONT_SCALE;
          engine.scene.shxTextHeightScale = CAD_ENGINE_SHX_TEXT_HEIGHT_SCALE;
          engine.scene.shxMTextHeightScale = CAD_ENGINE_SHX_MTEXT_HEIGHT_SCALE;
          engine.scene.shxBigFontHeightScale = CAD_ENGINE_SHX_BIGFONT_HEIGHT_SCALE;
          engine.scene.shxRebarFontPath = CAD_ENGINE_SHX_REBAR_FONT_URL;
          engine.scene.docId = input.docId;
          engine.scene.textCurveSegments = CAD_ENGINE_TEXT_CURVE_SEGMENTS;
        }

        const fontCheck = await ensureAssetReachable(CAD_ENGINE_FONT_URL, CAD_ENGINE_ASSET_CHECK_TIMEOUT_MS);
        if (!fontCheck.ok) {
          commitRuntime({
            fontAssetResolved: false,
            fontAssetError: fontCheck.error || `HTTP ${fontCheck.status ?? 'unknown'}`,
          });
        } else {
          apiSetFontPath(api, CAD_ENGINE_FONT_URL);
          if (engine.scene) {
            engine.scene.fontPath = CAD_ENGINE_FONT_URL;
          }
          commitRuntime({
            fontAssetResolved: true,
            fontAssetError: null,
          });
        }

        const glxBlob = new Blob([glxArrayBuffer], { type: 'application/octet-stream' });
        const binBlob = new Blob([built.glxMeshBuffer], { type: 'application/octet-stream' });
        const glxUrl = URL.createObjectURL(glxBlob);
        const binUrl = URL.createObjectURL(binBlob);
        const files = [
          { model3DName: 'scene.glx', url: glxUrl },
          { model3DName: 'scene.bin', url: binUrl },
        ];

        sceneBlobUrlsRef.current = { glxUrl, binUrl };

        commitRuntime({ loadAttempted: true });

        const loadResult = await loadCadEngineScene({
          engine,
          api,
          files,
          glxArrayBuffer,
          glxMeshBuffer: built.glxMeshBuffer,
          timeoutMs: CAD_ENGINE_LOAD_READY_TIMEOUT_MS,
        });

        commitRuntime({
          loadMode: loadResult.mode,
          loadSuccess: true,
          loadDurationMs: Math.round(loadResult.durationMs),
        });

        const loadedLayers = await waitForLayerReady(
          () => readRuntimeLayers(api, engine),
          CAD_ENGINE_LOAD_READY_TIMEOUT_MS
        );

        const layerReady = loadedLayers.length > 0;
        commitRuntime({
          layerReady,
          layerCount: loadedLayers.length,
        });

        const sceneStats = await waitForScenePopulation(
          engineRef.current,
          CAD_ENGINE_LOAD_READY_TIMEOUT_MS,
          CAD_ENGINE_READY_POLL_INTERVAL_MS
        );

        const sceneReady = isScenePopulated(sceneStats);
        commitRuntime({
          engineScene: sceneStats,
          engineScenePopulated: sceneReady,
          textGlyphs: readTextDiagnostics(engineRef.current),
        });

        if (!layerReady || !sceneReady) {
          commitRuntime({ failureStage: 'engine_population' });
          throw new Error(
            `EnginePopulationFailure: layers=${loadedLayers.length}, meshNodes=${sceneStats.meshNodes}, lineNodes=${sceneStats.lineNodes}`
          );
        }

        if (cancelled) return;
        sceneReadyRef.current = true;

        const runtimeLayerMap = new Map<string, number>();
        for (const layer of loadedLayers) {
          runtimeLayerMap.set(layer.name, layer.id);
        }

        const effectiveLayerMap = runtimeLayerMap.size > 0 ? runtimeLayerMap : built.layerIdByName;
        setLayerIdByName(effectiveLayerMap);

        const patched = patchSceneMaterials(engineRef.current);
        commitRuntime({
          engineScene: patched,
          engineScenePopulated: isScenePopulated(patched),
          textGlyphs: readTextDiagnostics(engineRef.current),
        });

        resizeEngine();
        drawOverlay();
      } catch (buildError) {
        if (!cancelled) {
          setRuntimeDiagnostics((prev) => (prev ? { ...prev, failureStage: prev.failureStage ?? 'load' } : prev));
          onError(buildError instanceof Error ? buildError.message : 'Failed to build GLX scene');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      sceneReadyRef.current = false;
    };
  }, [apiRef, currentSpace, drawOverlay, engineRef, entities, onError, onOverlayTextsChange, renderHiddenEntityIds, resizeEngine, revokeSceneBlobUrls, sceneBlobUrlsRef, sceneReadyRef]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!sceneReadyRef.current) return;
      const perf = engineRef.current?.getPerfStats?.();
      if (!perf) return;

      const rafFps = Number(perf.rafFps);
      const renderFps = Number(perf.renderFps);
      const sampleWindowMs = Number(perf.sampleWindowMs);
      setRuntimeDiagnostics((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          perfFrameStats: {
            rafFps: Number.isFinite(rafFps) ? rafFps : 0,
            renderFps: Number.isFinite(renderFps) ? renderFps : 0,
            sampleWindowMs: Number.isFinite(sampleWindowMs) ? sampleWindowMs : 0,
            rafCount: Number.isFinite(Number(perf.rafCount)) ? Number(perf.rafCount) : 0,
            renderCount: Number.isFinite(Number(perf.renderCount)) ? Number(perf.renderCount) : 0,
          },
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [engineRef, sceneReadyRef]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !sceneReadyRef.current) return;

    const loadedLayers = readRuntimeLayers(api, engineRef.current);
    const readyIds = new Set<number>(loadedLayers.map((item) => Number(item.id)).filter(Number.isFinite));

    for (const [layerName, layerId] of layerIdByName.entries()) {
      if (readyIds.size > 0 && !readyIds.has(layerId)) continue;
      try {
        apiSetLayerVisible(api, layerId, !hiddenLayerNames.has(layerName));
      } catch {
        // ignore transient layer visibility races
      }
    }
    drawOverlay();
  }, [apiRef, drawOverlay, engineRef, hiddenLayerNames, layerIdByName, sceneReadyRef]);

  return {
    layerIdByName,
    renderDiagnostics,
    runtimeDiagnostics,
    resetRenderState,
  };
}
