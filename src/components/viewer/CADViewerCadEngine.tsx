import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers, Maximize2, MousePointer2, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import type { DwgEntityLite } from '@/services/dwgApi';
import { normalizeLayerName } from './cadEngine/cadUiUtils';
import { CadInspectorPanel } from './cadEngine/components/CadInspectorPanel';
import { CadSidebar } from './cadEngine/components/CadSidebar';
import { useCadDocumentLifecycle } from './cadEngine/hooks/useCadDocumentLifecycle';
import { useCadEngineLifecycle } from './cadEngine/hooks/useCadEngineLifecycle';
import { useCadSceneRender } from './cadEngine/hooks/useCadSceneRender';
import { useCadSelection } from './cadEngine/hooks/useCadSelection';
import { useCadViewState } from './cadEngine/hooks/useCadViewState';

interface CADViewerCadEngineProps {
  rawFile: File | null;
}

export function CADViewerCadEngine({ rawFile }: CADViewerCadEngineProps) {
  const [error, setError] = useState<string | null>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const clearSelectionRef = useRef<() => void>(() => undefined);
  const handleClearSelection = useCallback(() => {
    clearSelectionRef.current();
  }, []);

  const {
    hiddenLayerNames,
    hiddenEntityIds,
    expandedIds,
    overlayTexts,
    leftSidebarCollapsed,
    rightSidebarCollapsed,
    setOverlayTexts,
    setExpandedIds,
    setLeftSidebarCollapsed,
    setRightSidebarCollapsed,
    resetHiddenLayerNames,
    resetHiddenEntityIds,
    toggleLayer,
    toggleEntityVisibility,
    toggleNodeEntityVisibility,
    toggleNodeExpanded,
  } = useCadViewState();

  const {
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
  } = useCadEngineLifecycle({
    hiddenLayerNames,
    hiddenEntityIds,
    overlayTexts,
    onInitError: setError,
  });

  const {
    loading,
    docId,
    docIdRef,
    spaces,
    currentSpace,
    entities,
    nodes,
    warnings,
    treeConsistency,
    loadSpace,
  } = useCadDocumentLifecycle({
    rawFile,
    apiRef,
    sceneReadyRef,
    revokeSceneBlobUrls,
    onError: setError,
    onClearSelection: handleClearSelection,
    onResetHiddenLayerNames: resetHiddenLayerNames,
    onResetHiddenEntityIds: resetHiddenEntityIds,
    onResetExpandedIds: setExpandedIds,
  });

  const entityById = useMemo(() => {
    const map = new Map<string, DwgEntityLite>();
    for (const entity of entities) {
      map.set(entity.id, entity);
    }
    return map;
  }, [entities]);

  const layers = useMemo(() => {
    const unique = new Set<string>();
    for (const entity of entities) {
      unique.add(normalizeLayerName(entity.layer));
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [entities]);

  const drawingBbox = useMemo(() => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const entity of entities) {
      const bbox = entity.bbox;
      if (!bbox) continue;
      minX = Math.min(minX, bbox.min.x, bbox.max.x);
      minY = Math.min(minY, bbox.min.y, bbox.max.y);
      maxX = Math.max(maxX, bbox.min.x, bbox.max.x);
      maxY = Math.max(maxY, bbox.min.y, bbox.max.y);
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return null;
    return { min: { x: minX, y: minY, z: 0 }, max: { x: maxX, y: maxY, z: 0 } };
  }, [entities]);

  const {
    selectedEntityId,
    selectedEntityRecord,
    setSelectedEntityId,
    clearSelection,
  } = useCadSelection({
    docId,
    docIdRef,
    currentSpace,
    entityById,
    engineRef,
    viewportRef,
    didDragRef,
    focusBbox,
  });
  useEffect(() => {
    clearSelectionRef.current = clearSelection;
  }, [clearSelection]);

  const {
    renderDiagnostics,
    runtimeDiagnostics,
  } = useCadSceneRender({
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
    onOverlayTextsChange: setOverlayTexts,
    onError: setError,
  });

  const diagnosticRows = useMemo(() => {
    if (!renderDiagnostics) return [] as Array<{ kind: string; input: number; rendered: number; skipped: number }>;
    return Object.entries(renderDiagnostics.kinds)
      .map(([kind, item]) => ({ kind, input: item.input, rendered: item.rendered, skipped: item.skipped }))
      .sort((a, b) => b.input - a.input);
  }, [renderDiagnostics]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-cyan-300" />
          <span>DWG CadEngine Mode</span>
          {rawFile?.name && <span className="max-w-[260px] truncate text-gray-500">{rawFile.name}</span>}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded px-2 text-gray-300 hover:bg-gray-800 hover:text-gray-100"
            onClick={() => {
              clearSelection();
            }}
            title="选择/清空选择"
          >
            <MousePointer2 className="h-3.5 w-3.5" />
            选择
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded px-2 text-gray-300 hover:bg-gray-800 hover:text-gray-100"
            onClick={() => focusBbox(drawingBbox)}
            disabled={!drawingBbox}
            title="全图"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            全图
          </button>
          {leftSidebarCollapsed && (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded px-2 text-gray-300 hover:bg-gray-800 hover:text-gray-100"
              onClick={() => setLeftSidebarCollapsed(false)}
              title="显示元素树"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
              元素树
            </button>
          )}
          {rightSidebarCollapsed && (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded px-2 text-gray-300 hover:bg-gray-800 hover:text-gray-100"
              onClick={() => setRightSidebarCollapsed(false)}
              title="显示属性栏"
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              属性栏
            </button>
          )}
          <select
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200"
            value={currentSpace}
            onChange={(event) => {
              if (!docId) return;
              void loadSpace(docId, event.target.value);
            }}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {leftSidebarCollapsed ? (
          <div className="flex w-8 items-start justify-center border-r border-gray-800 bg-gray-900 py-2">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-300 hover:bg-gray-800"
              onClick={() => setLeftSidebarCollapsed(false)}
              title="Expand left sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <CadSidebar
            nodes={nodes}
            expandedIds={expandedIds}
            selectedEntityId={selectedEntityId}
            hiddenLayerNames={hiddenLayerNames}
            hiddenEntityIds={hiddenEntityIds}
            layers={layers}
            treeScrollRef={treeScrollRef}
            onToggleLayer={toggleLayer}
            onToggleNodeExpanded={toggleNodeExpanded}
            onSelectEntity={setSelectedEntityId}
            onFocusBbox={focusBbox}
            onToggleEntity={toggleEntityVisibility}
            onToggleNodeEntities={toggleNodeEntityVisibility}
            onCollapse={() => setLeftSidebarCollapsed(true)}
          />
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0a0f1f]">
          <div ref={viewportRef} className="absolute inset-0 overflow-hidden" />
          <canvas ref={textCanvasRef} className="pointer-events-none absolute inset-0" />
          {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 text-sm text-gray-200">Loading...</div>}
        </div>

        {rightSidebarCollapsed ? (
          <div className="flex w-8 items-start justify-center border-l border-gray-800 bg-gray-900 py-2">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-300 hover:bg-gray-800"
              onClick={() => setRightSidebarCollapsed(false)}
              title="Expand right sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <CadInspectorPanel
            selectedEntityId={selectedEntityId}
            selectedEntityRecord={selectedEntityRecord}
            renderDiagnostics={renderDiagnostics}
            runtimeDiagnostics={runtimeDiagnostics}
            diagnosticRows={diagnosticRows}
            treeConsistency={treeConsistency}
            warnings={warnings}
            error={error}
            onCollapse={() => setRightSidebarCollapsed(true)}
          />
        )}
      </div>

      {error && rightSidebarCollapsed && (
        <div className="border-t border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">{error}</div>
      )}
    </div>
  );
}
