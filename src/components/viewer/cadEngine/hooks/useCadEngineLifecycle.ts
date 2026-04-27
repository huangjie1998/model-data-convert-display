import { useCallback, useEffect, useRef } from 'react';
import type { DwgHierarchyNode } from '@/services/dwgApi';
import type { CadEngineApi, CadEngineInstance } from '../cadEngineTypes';
import { bboxInfo, isFiniteNumber, normalizeLayerName, parseColor } from '../cadUiUtils';
import { loadCadEngineScript } from '../loadCadEngineScript';
import { resolveCadEngineApi, resolveCadEngineConstructor } from '../runtimeBridge';
import type { OverlayTextItem } from '../dwgToGlx';
import type { UseCadEngineLifecycleInput, UseCadEngineLifecycleResult } from './contracts';

export function useCadEngineLifecycle(input: UseCadEngineLifecycleInput): UseCadEngineLifecycleResult {
  const { hiddenLayerNames, hiddenEntityIds, overlayTexts, onInitError } = input;

  const viewportRef = useRef<HTMLDivElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayTextsRef = useRef<OverlayTextItem[]>([]);
  const overlayRafRef = useRef<number>(0);

  const engineRef = useRef<CadEngineInstance | null>(null);
  const apiRef = useRef<CadEngineApi | null>(null);
  const sceneReadyRef = useRef(false);
  const sceneBlobUrlsRef = useRef<{ glxUrl: string; binUrl: string } | null>(null);
  const didDragRef = useRef(false);

  const revokeSceneBlobUrls = useCallback(() => {
    const urls = sceneBlobUrlsRef.current;
    if (!urls) return;
    URL.revokeObjectURL(urls.glxUrl);
    URL.revokeObjectURL(urls.binUrl);
    sceneBlobUrlsRef.current = null;
  }, []);

  const resizeEngine = useCallback(() => {
    const viewport = viewportRef.current;
    const engine = engineRef.current;
    if (!viewport || !engine?.scene) return;

    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    const renderer = engine.scene._renderer;
    const camera = engine.scene.camera;
    if (!renderer || !camera) return;

    renderer.setPixelRatio?.(window.devicePixelRatio || 1);
    renderer.setSize?.(width, height, false);

    camera.left = -width * 0.5;
    camera.right = width * 0.5;
    camera.top = height * 0.5;
    camera.bottom = -height * 0.5;
    camera.updateProjectionMatrix?.();
    engine.scene.needsUpdateGPUData = true;

    const canvas = textCanvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  }, []);

  const drawOverlayNow = useCallback(() => {
    const canvas = textCanvasRef.current;
    const viewport = viewportRef.current;
    const engine = engineRef.current;
    if (!canvas || !viewport || !engine?.scene?.camera?.sceneToScreen) return;

    const camera = engine.scene.camera;
    const sceneToScreen = camera.sceneToScreen;
    if (!sceneToScreen) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const cadEngineProvider = (window as Window & { CadEngine?: { __provider?: string } }).CadEngine?.__provider;
    const providerToken = String(cadEngineProvider ?? '').trim().toLowerCase();
    if (
      providerToken.startsWith('cad_runtime') ||
      providerToken === 'cad_runtime_bundle' ||
      providerToken === 'whitebox_independent'
    ) {
      return;
    }

    const zoom = isFiniteNumber(camera.zoom) ? camera.zoom : 1;

    for (const text of overlayTextsRef.current) {
      if (hiddenLayerNames.has(normalizeLayerName(text.layer))) continue;
      if (hiddenEntityIds.has(text.entityId)) continue;

      const screen = sceneToScreen({ x: text.x, y: text.y });
      if (!screen || !isFiniteNumber(screen.x) || !isFiniteNumber(screen.y)) continue;
      if (screen.x < -80 || screen.x > width + 80 || screen.y < -80 || screen.y > height + 80) continue;

      const px = Math.max(8, Math.min(96, text.height * zoom));
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(-text.rotation);
      ctx.font = `${px}px Arial,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = parseColor(text.color);
      ctx.fillText(text.text, 0, 0);
      ctx.restore();
    }
  }, [hiddenEntityIds, hiddenLayerNames]);

  const drawOverlay = useCallback(() => {
    if (overlayRafRef.current) return;
    overlayRafRef.current = window.requestAnimationFrame(() => {
      overlayRafRef.current = 0;
      drawOverlayNow();
    });
  }, [drawOverlayNow]);

  const focusBbox = useCallback(
    (bbox: DwgHierarchyNode['bbox']) => {
      const viewport = viewportRef.current;
      const engine = engineRef.current;
      if (!viewport || !engine?.scene?.camera) return;

      const camera = engine.scene.camera;
      const info = bboxInfo(bbox);
      if (!info) return;

      const zoom = Math.max(
        1e-6,
        Math.min(20000, Math.min((viewport.clientWidth * 0.88) / info.spanX, (viewport.clientHeight * 0.88) / info.spanY))
      );
      camera.position.x = info.cx;
      camera.position.y = info.cy;
      camera.zoom = zoom;
      camera.updateProjectionMatrix?.();
      engine.scene.needsUpdateGPUData = true;
      drawOverlay();
    },
    [drawOverlay]
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        await loadCadEngineScript();
        if (cancelled || engineRef.current || !viewportRef.current) return;

        const EngineCtor = resolveCadEngineConstructor();
        if (!EngineCtor) {
          throw new Error('CadEngine constructor not found');
        }

        const engine = new EngineCtor({ container: viewportRef.current });
        engineRef.current = engine;
        apiRef.current = resolveCadEngineApi();

        if (engine.scene?.controls && typeof engine.scene.controls === 'object') {
          engine.scene.controls.enabled = false;
        }

        resizeEngine();
        drawOverlay();
      } catch (initError) {
        if (!cancelled) {
          onInitError(initError instanceof Error ? initError.message : 'Failed to initialize CadEngine');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [drawOverlay, onInitError, resizeEngine]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      resizeEngine();
      drawOverlay();
    });
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [drawOverlay, resizeEngine]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.style.touchAction = 'none';

    let pointerId: number | null = null;
    let dragging = false;
    let lastClientX = 0;
    let lastClientY = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerId = event.pointerId;
      dragging = true;
      didDragRef.current = false;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      viewport.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || pointerId !== event.pointerId) return;
      const engine = engineRef.current;
      const camera = engine?.scene?.camera;
      if (!camera) return;

      const dx = event.clientX - lastClientX;
      const dy = event.clientY - lastClientY;
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        didDragRef.current = true;
      }

      const zoom = isFiniteNumber(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
      camera.position.x -= dx / zoom;
      camera.position.y += dy / zoom;
      camera.updateProjectionMatrix?.();
      if (engine.scene) {
        engine.scene.needsUpdateGPUData = true;
      }
      drawOverlay();

      lastClientX = event.clientX;
      lastClientY = event.clientY;
    };

    const stopDragging = (event: PointerEvent) => {
      if (!dragging || pointerId !== event.pointerId) return;
      dragging = false;
      pointerId = null;
      viewport.releasePointerCapture?.(event.pointerId);
    };

    const onWheel = (event: WheelEvent) => {
      const engine = engineRef.current;
      const camera = engine?.scene?.camera;
      if (!camera?.screenToScene) return;
      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const before = camera.screenToScene({ x: px, y: py });

      const delta = event.deltaY > 0 ? 1 / 1.2 : 1.2;
      const currentZoom = isFiniteNumber(camera.zoom) ? camera.zoom : 1;
      camera.zoom = Math.max(1e-6, Math.min(5e6, currentZoom * delta));

      const after = camera.screenToScene({ x: px, y: py });
      if (before && after && isFiniteNumber(before.x) && isFiniteNumber(before.y) && isFiniteNumber(after.x) && isFiniteNumber(after.y)) {
        camera.position.x += before.x - after.x;
        camera.position.y += before.y - after.y;
      }

      camera.updateProjectionMatrix?.();
      if (engine?.scene) {
        engine.scene.needsUpdateGPUData = true;
      }
      drawOverlay();
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    viewport.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [drawOverlay]);

  useEffect(() => {
    overlayTextsRef.current = overlayTexts;
    drawOverlay();
  }, [drawOverlay, overlayTexts]);

  useEffect(() => {
    const mountedViewport = viewportRef.current;
    return () => {
      sceneReadyRef.current = false;
      revokeSceneBlobUrls();
      if (overlayRafRef.current) {
        window.cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = 0;
      }

      const engine = engineRef.current;
      engineRef.current = null;
      apiRef.current = null;
      if (engine?.dispose) {
        engine.dispose();
      }

      if (mountedViewport) {
        while (mountedViewport.firstChild) {
          mountedViewport.removeChild(mountedViewport.firstChild);
        }
      }
    };
  }, [revokeSceneBlobUrls]);

  return {
    viewportRef,
    textCanvasRef,
    engineRef,
    apiRef,
    sceneReadyRef,
    sceneBlobUrlsRef,
    didDragRef,
    revokeSceneBlobUrls,
    resizeEngine,
    drawOverlay,
    focusBbox,
  };
}
