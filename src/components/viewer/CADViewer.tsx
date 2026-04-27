import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crosshair, Eye, EyeOff, Hand, Layers, Maximize, Ruler } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import {
  closeDwgDocument,
  getDwgEntity,
  listDwgEntities,
  listDwgFonts,
  listDwgHierarchy,
  listDwgSpaces,
  measureDwg,
  openDwgDocument,
  pickDwgEntity,
  snapDwgPoint,
  updateDwgView,
  type DwgHierarchyNode,
  type DwgDocFont,
  type DwgEntityLite,
  type DwgSpace,
} from '@/services/dwgApi';

interface CADViewerProps {
  rawFile: File | null;
  fileName?: string;
}

import type {
  WorldPoint,
  WorldBounds,
  CanvasMetrics,
  CachedLineMetrics,
  ShxRenderStatus,
  WarningLineItem,
  FlatHierarchyRow,
  ViewerMode,
  SelectionScope,
  BoxSelectModifier,
} from './cadViewerUtils';
import {
  isPoint,
  formatNumber,
  snapModeToCn,
  normalizeLayerName,
  sanitizeCssFontFamily,
  buildCadTextFontFamily,
  _sanitizeFontKeyUi,
  boxSelectModifierFromEvent,
  buildFileKey,
  extractCadHandleAndPath,
  isBlockRefType,
  firstNonEmptyString,
  toUniqueStringList,
  resolveShxRenderStatus,
  isShxFallbackText,
  truncateCadLine,
  translateDwgWarningToCn,
  normalizeWarningsForUi,
  parseMissingFontWarningForUi,
  buildShxFontDiagnosticFromDocFonts,
  cleanCadText,
  resolveTextAlign,
  resolveTextBaseline,
  getBboxAnchor,
  entityColor,
  resolveStrokeWidthPx,
  hatchPatternIsCross,
  traceClosedScreenRingsPath,
  drawHatchPatternLinesInClip,
  bboxVisible,
  asPrimitiveList,
  findLocalPickEntityId,
  isEntityRecordHit,
  normalizeAngleRad,
  fillRoundedRect,
  sampleArcWorld,
  sampleEllipseWorld,
  bboxFromWorldPoints,
  arcBboxScore,
  computeEntitiesBounds,
  hierarchyChildren,
  collectHierarchyEntityPathMap,
  areStringSetsEqual,
  collectFirstLayerExpandedNodeIds,
  collectHierarchyLayers,
  collectHierarchyNodeMap,
  collectHierarchyEntityIdsFromNode,
  getEntityRecordId,
  entityWorldBounds,
  boundsIntersects,
  boundsContains,
  hierarchyBboxToWorldBounds,
  HierarchyVirtualRow,
  PICK_BOX_SIZE_PX,
  BLOCK_PICK_BOX_SIZE_PX,
  PICK_TOLERANCE_FACTORS,
  BOX_SELECT_DRAG_THRESHOLD_PX,
  CAD_TEXT_FALLBACK_FONT,
  DEFAULT_SHX_RENDER_STATUS,
} from './cadViewerUtils';
import { buildMultiEntityPropertySections, getEntityPropertySections } from './cadInspectorProperties';

export function CADViewer({ rawFile, fileName }: CADViewerProps) {
  const [docId, setDocId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<DwgSpace[]>([]);
  const [activeSpace, setActiveSpace] = useState<string>('model');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [backendMode, setBackendMode] = useState<string>('unknown');
  const [shxRenderStatus, setShxRenderStatus] = useState<ShxRenderStatus>(DEFAULT_SHX_RENDER_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewerMode>('select');
  const snapEnabled = true;
  const [measurePoints, setMeasurePoints] = useState<WorldPoint[]>([]);
  const [measureValue, setMeasureValue] = useState<string>('');
  const [selectionScope, setSelectionScope] = useState<SelectionScope>('block');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeBlockName, setActiveBlockName] = useState<string>('');
  const [activeBlockEntity, setActiveBlockEntity] = useState<Record<string, unknown> | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Record<string, unknown> | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<Record<string, unknown>[]>([]);
  const [entities, setEntities] = useState<DwgEntityLite[]>([]);
  const [entityTotal, setEntityTotal] = useState(0);
  const [entityTruncated, setEntityTruncated] = useState(false);
  const [cursorWorld, setCursorWorld] = useState<WorldPoint | null>(null);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [layerFilterEnabled, setLayerFilterEnabled] = useState(false);
  const [layerWhitelist, setLayerWhitelist] = useState<Set<string>>(new Set());
  const [hiddenLayerNames, setHiddenLayerNames] = useState<Set<string>>(new Set());
  const [hiddenHierarchyNodeIds, setHiddenHierarchyNodeIds] = useState<Set<string>>(new Set());
  const [snapCandidatePoint, setSnapCandidatePoint] = useState<WorldPoint | null>(null);
  const [snapCandidateMode, setSnapCandidateMode] = useState<string | null>(null);
  const [showNormalLineweight, setShowNormalLineweight] = useState(true);
  const [showTreeSidebar, setShowTreeSidebar] = useState(true);
  const [showPropertySidebar, setShowPropertySidebar] = useState(true);
  const [hierarchyNodes, setHierarchyNodes] = useState<DwgHierarchyNode[]>([]);
  const [hierarchyEntityTotal, setHierarchyEntityTotal] = useState(0);
  const [hierarchyBlockTotal, setHierarchyBlockTotal] = useState(0);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const expandedHierarchyNodeIdsRef = useRef<Set<string>>(new Set());
  const [expandedHierarchyVersion, setExpandedHierarchyVersion] = useState(0);
  const [selectedHierarchyNodeIds, setSelectedHierarchyNodeIds] = useState<Set<string>>(new Set());
  const [docFonts, setDocFonts] = useState<DwgDocFont[]>([]);
  const [fontFamilyByKey, setFontFamilyByKey] = useState<Record<string, string>>({});

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectCurrent, setBoxSelectCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectModifier, setBoxSelectModifier] = useState<BoxSelectModifier>('replace');

  const viewportRef = useRef<HTMLDivElement>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const geometryCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastMiddleDownAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const snapHoverSeqRef = useRef(0);
  const suppressClickAfterBoxRef = useRef(false);
  const textMetricsCacheRef = useRef<Map<string, CachedLineMetrics>>(new Map());
  const loadedCadFontsRef = useRef<Map<string, string>>(new Map());
  const lastOpenedFileKeyRef = useRef<string | null>(null);
  const docIdRef = useRef<string | null>(null);

  const [canvasMetrics, setCanvasMetrics] = useState<CanvasMetrics>({ width: 1, height: 1, dpr: 1 });

  const screenCenter = useMemo(() => ({ x: canvasMetrics.width * 0.5, y: canvasMetrics.height * 0.5 }), [canvasMetrics.width, canvasMetrics.height]);

  const worldToScreen = useCallback(
    (p: WorldPoint) => ({
      x: p.x * zoom + pan.x + screenCenter.x,
      y: -p.y * zoom + pan.y + screenCenter.y,
    }),
    [zoom, pan.x, pan.y, screenCenter.x, screenCenter.y]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number): WorldPoint => ({
      x: (sx - screenCenter.x - pan.x) / zoom,
      y: -(sy - screenCenter.y - pan.y) / zoom,
      z: 0,
    }),
    [screenCenter.x, screenCenter.y, pan.x, pan.y, zoom]
  );

  const worldViewBounds = useMemo<WorldBounds>(() => {
    const minX = (0 - screenCenter.x - pan.x) / zoom;
    const maxX = (canvasMetrics.width - screenCenter.x - pan.x) / zoom;
    const topY = -(0 - screenCenter.y - pan.y) / zoom;
    const bottomY = -(canvasMetrics.height - screenCenter.y - pan.y) / zoom;
    return {
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minY: Math.min(bottomY, topY),
      maxY: Math.max(bottomY, topY),
    };
  }, [canvasMetrics.width, canvasMetrics.height, pan.x, pan.y, screenCenter.x, screenCenter.y, zoom]);

  const replaceExpandedHierarchyNodeIds = useCallback((next: Set<string>) => {
    expandedHierarchyNodeIdsRef.current = next;
    setExpandedHierarchyVersion((prev) => prev + 1);
  }, []);

  const mutateExpandedHierarchyNodeIds = useCallback((mutator: (next: Set<string>) => boolean) => {
    const next = expandedHierarchyNodeIdsRef.current;
    if (!mutator(next)) return;
    setExpandedHierarchyVersion((prev) => prev + 1);
  }, []);

  const availableLayers = useMemo(() => {
    const out = new Set<string>();
    for (const ent of entities) out.add(normalizeLayerName(ent.layer));
    collectHierarchyLayers(hierarchyNodes, out);
    return Array.from(out).sort((a, b) => a.localeCompare(b, 'en-US'));
  }, [entities, hierarchyNodes]);

  const entityById = useMemo(() => {
    const out = new Map<string, DwgEntityLite>();
    for (const ent of entities) out.set(ent.id, ent);
    return out;
  }, [entities]);

  const hierarchyNodeById = useMemo(() => {
    const out = new Map<string, DwgHierarchyNode>();
    collectHierarchyNodeMap(hierarchyNodes, out);
    return out;
  }, [hierarchyNodes]);

  const hierarchyEntityPathById = useMemo(() => {
    const out = new Map<string, string[]>();
    collectHierarchyEntityPathMap(hierarchyNodes, out);
    return out;
  }, [hierarchyNodes]);

  const hiddenEntityIdsByTree = useMemo(() => {
    if (hiddenHierarchyNodeIds.size === 0) return new Set<string>();
    const out = new Set<string>();
    for (const nodeId of hiddenHierarchyNodeIds) {
      const node = hierarchyNodeById.get(nodeId);
      if (!node) continue;
      collectHierarchyEntityIdsFromNode(node, out);
    }
    return out;
  }, [hiddenHierarchyNodeIds, hierarchyNodeById]);

  const isLayerSelectable = useCallback(
    (layerRaw: unknown) => {
      if (!layerFilterEnabled) return true;
      if (layerRaw === undefined || layerRaw === null) return true;
      return layerWhitelist.has(normalizeLayerName(layerRaw));
    },
    [layerFilterEnabled, layerWhitelist]
  );

  const isEntityVisible = useCallback(
    (layerRaw: unknown, entityIdRaw: unknown) => {
      const layer = normalizeLayerName(layerRaw);
      if (hiddenLayerNames.has(layer)) return false;
      const entityId = String(entityIdRaw ?? '').trim();
      if (!entityId) return true;
      return !hiddenEntityIdsByTree.has(entityId);
    },
    [hiddenEntityIdsByTree, hiddenLayerNames]
  );

  const nodeVisibleMap = useMemo(() => {
    const out = new Map<string, boolean>();
    const visit = (node: DwgHierarchyNode): boolean => {
      if (hiddenHierarchyNodeIds.has(node.node_id)) {
        out.set(node.node_id, false);
        return false;
      }
      if (node.node_kind === 'category') {
        const children = hierarchyChildren(node);
        if (children.length === 0) {
          out.set(node.node_id, true);
          return true;
        }
        const anyVisible = children.some((child) => visit(child));
        out.set(node.node_id, anyVisible);
        return anyVisible;
      }
      const visible = isEntityVisible(node.layer, node.entity_id);
      out.set(node.node_id, visible);
      return visible;
    };

    for (const root of hierarchyNodes) {
      visit(root);
    }
    return out;
  }, [hierarchyNodes, hiddenHierarchyNodeIds, isEntityVisible]);

  const isNodeVisible = useCallback((node: DwgHierarchyNode): boolean => nodeVisibleMap.get(node.node_id) ?? true, [nodeVisibleMap]);

  const filterSummaryLabel = useMemo(() => {
    if (!layerFilterEnabled) return '不过滤';
    return `已启用（${layerWhitelist.size}/${availableLayers.length}）`;
  }, [availableLayers.length, layerFilterEnabled, layerWhitelist.size]);

  const clearSelection = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedEntity(null);
    setSelectedEntityIds([]);
    setSelectedEntities([]);
    setSelectedHierarchyNodeIds(new Set());
  }, []);

  const applySelection = useCallback(
    (ids: string[], records: Record<string, unknown>[]) => {
      if (!ids.length || !records.length) {
        clearSelection();
        return;
      }
      setSelectedEntityId(ids[0]);
      setSelectedEntity(records[0]);
      setSelectedEntityIds(ids);
      setSelectedEntities(records);
    },
    [clearSelection]
  );

  const mergeSelectionByModifier = useCallback(
    (
      incomingIds: string[],
      incomingRecords: Record<string, unknown>[],
      modifier: BoxSelectModifier
    ): { ids: string[]; records: Record<string, unknown>[] } => {
      if (modifier === 'replace') {
        return { ids: incomingIds, records: incomingRecords };
      }

      const current = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < selectedEntityIds.length; i += 1) {
        const id = selectedEntityIds[i];
        const rec = selectedEntities[i];
        if (!id || !rec) continue;
        current.set(id, rec);
      }

      if (modifier === 'add') {
        for (let i = 0; i < incomingIds.length; i += 1) {
          const id = incomingIds[i];
          const rec = incomingRecords[i];
          if (!id || !rec) continue;
          if (!current.has(id)) current.set(id, rec);
        }
      } else {
        for (let i = 0; i < incomingIds.length; i += 1) {
          const id = incomingIds[i];
          const rec = incomingRecords[i];
          if (!id) continue;
          if (current.has(id)) current.delete(id);
          else if (rec) current.set(id, rec);
        }
      }

      const ids = Array.from(current.keys());
      const records = ids.map((id) => current.get(id)).filter((v): v is Record<string, unknown> => Boolean(v));
      return { ids, records };
    },
    [selectedEntityIds, selectedEntities]
  );

  const fitViewToEntities = useCallback(
    (nextEntities: DwgEntityLite[]) => {
      const bounds = computeEntitiesBounds(nextEntities);
      if (!bounds || canvasMetrics.width <= 0 || canvasMetrics.height <= 0) return;

      const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
      const nextZoom = Math.max(1e-5, Math.min(20000, Math.min((canvasMetrics.width * 0.92) / spanX, (canvasMetrics.height * 0.92) / spanY)));
      if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;

      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerY = (bounds.minY + bounds.maxY) * 0.5;
      setZoom(nextZoom);
      setPan({ x: -centerX * nextZoom, y: centerY * nextZoom });
    },
    [canvasMetrics.height, canvasMetrics.width]
  );

  const focusExtents = useCallback(() => {
    fitViewToEntities(entities);
  }, [entities, fitViewToEntities]);

  const focusOrigin = useCallback(() => {
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleLayerFilterEnabled = useCallback(() => {
    setLayerFilterEnabled((prev) => {
      const next = !prev;
      if (next) {
        setLayerWhitelist((existing) => {
          if (existing.size > 0) return existing;
          return new Set(availableLayers);
        });
      }
      return next;
    });
  }, [availableLayers]);

  const setLayerFilterAll = useCallback(() => {
    setLayerWhitelist(new Set(availableLayers));
  }, [availableLayers]);

  const clearLayerFilterSelection = useCallback(() => {
    setLayerWhitelist(new Set());
  }, []);

  const toggleLayerInWhitelist = useCallback((layer: string) => {
    setLayerWhitelist((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const toggleLayerVisibility = useCallback((layer: string) => {
    setHiddenLayerNames((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const toggleHierarchyNodeVisibility = useCallback((nodeId: string) => {
    setHiddenHierarchyNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const focusWorldBounds = useCallback(
    (bounds: WorldBounds | null) => {
      if (!bounds || canvasMetrics.width <= 0 || canvasMetrics.height <= 0) return;
      const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
      const nextZoom = Math.max(1e-5, Math.min(20000, Math.min((canvasMetrics.width * 0.9) / spanX, (canvasMetrics.height * 0.9) / spanY)));
      if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerY = (bounds.minY + bounds.maxY) * 0.5;
      setZoom(nextZoom);
      setPan({ x: -centerX * nextZoom, y: centerY * nextZoom });
    },
    [canvasMetrics.height, canvasMetrics.width]
  );

  const loadSpaceEntities = useCallback(
    async (nextDocId: string, nextSpaceId: string, fitView = false) => {
      const res = await listDwgEntities(nextDocId, nextSpaceId, 0);
      const nextEntities = res.entities || [];
      setEntities(nextEntities);
      setEntityTotal(typeof res.total_count === 'number' ? res.total_count : nextEntities.length);
      setEntityTruncated(Boolean(res.truncated));
      if (fitView) fitViewToEntities(nextEntities);
    },
    [fitViewToEntities]
  );

  const loadSpaceHierarchy = useCallback(async (nextDocId: string, nextSpaceId: string) => {
    setHierarchyLoading(true);
    setHierarchyError(null);
    try {
      const res = await listDwgHierarchy(nextDocId, nextSpaceId);
      const nodes = Array.isArray(res.nodes) ? res.nodes : [];
      setHierarchyNodes(nodes);
      setHierarchyEntityTotal(typeof res.total_entity_count === 'number' ? res.total_entity_count : 0);
      setHierarchyBlockTotal(typeof res.total_block_ref_count === 'number' ? res.total_block_ref_count : 0);
      replaceExpandedHierarchyNodeIds(collectFirstLayerExpandedNodeIds(nodes));
    } catch (e) {
      setHierarchyNodes([]);
      setHierarchyEntityTotal(0);
      setHierarchyBlockTotal(0);
      replaceExpandedHierarchyNodeIds(new Set());
      setHierarchyError(e instanceof Error ? e.message : '元素树加载失败');
    } finally {
      setHierarchyLoading(false);
    }
  }, [replaceExpandedHierarchyNodeIds]);

  const loadSpaceEntitiesRef = useRef(loadSpaceEntities);
  useEffect(() => {
    loadSpaceEntitiesRef.current = loadSpaceEntities;
  }, [loadSpaceEntities]);

  const loadSpaceHierarchyRef = useRef(loadSpaceHierarchy);
  useEffect(() => {
    loadSpaceHierarchyRef.current = loadSpaceHierarchy;
  }, [loadSpaceHierarchy]);

  useEffect(() => {
    if (!layerFilterEnabled) return;
    setLayerWhitelist((prev) => {
      const next = new Set<string>();
      for (const layer of prev) {
        if (availableLayers.includes(layer)) next.add(layer);
      }
      if (next.size === 0 && availableLayers.length > 0) {
        return new Set(availableLayers);
      }
      return next;
    });
  }, [availableLayers, layerFilterEnabled]);

  useEffect(() => {
    setHiddenLayerNames((prev) => {
      if (prev.size === 0) return prev;
      const availableLayerSet = new Set(availableLayers);
      const next = new Set<string>();
      for (const layer of prev) {
        if (availableLayerSet.has(layer)) next.add(layer);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [availableLayers]);

  useEffect(() => {
    setHiddenHierarchyNodeIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const nodeId of prev) {
        if (hierarchyNodeById.has(nodeId)) next.add(nodeId);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [hierarchyNodeById]);

  useEffect(() => {
    docIdRef.current = docId;
  }, [docId]);

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      const incomingFileKey = buildFileKey(rawFile);
      if (incomingFileKey && incomingFileKey === lastOpenedFileKeyRef.current && docIdRef.current) {
        return;
      }

      setError(null);
      clearSelection();
      setSelectionScope('block');
      setActiveBlockId(null);
      setActiveBlockName('');
      setActiveBlockEntity(null);
      setMeasurePoints([]);
      setMeasureValue('');
      setLayerFilterEnabled(false);
      setLayerWhitelist(new Set());
      setHiddenLayerNames(new Set());
      setHiddenHierarchyNodeIds(new Set());
      setSnapCandidatePoint(null);
      setSnapCandidateMode(null);
      setHierarchyNodes([]);
      setHierarchyEntityTotal(0);
      setHierarchyBlockTotal(0);
      replaceExpandedHierarchyNodeIds(new Set());
      setSelectedHierarchyNodeIds(new Set());
      setHierarchyError(null);
      setWarnings([]);
      setShxRenderStatus(DEFAULT_SHX_RENDER_STATUS);
      if (!rawFile) {
        lastOpenedFileKeyRef.current = null;
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        setLayerFilterEnabled(false);
        setLayerWhitelist(new Set());
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
        return;
      }
      if (!rawFile.name.toLowerCase().endsWith('.dwg')) {
        lastOpenedFileKeyRef.current = null;
        setError('当前文件不是 DWG 图纸。');
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        setHierarchyNodes([]);
        setHierarchyEntityTotal(0);
        setHierarchyBlockTotal(0);
        replaceExpandedHierarchyNodeIds(new Set());
        setSelectedHierarchyNodeIds(new Set());
        setLayerFilterEnabled(false);
        setLayerWhitelist(new Set());
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
        return;
      }
      setLoading(true);
      try {
        const opened = await openDwgDocument(rawFile);
        if (cancelled) return;
        const shxStatus = resolveShxRenderStatus(opened);
        const openWarnings = Array.isArray(opened.warnings) ? [...opened.warnings] : [];
        if (shxStatus.detected && !shxStatus.trueOutline) {
          const fallbackCountText = shxStatus.fallbackTextCount > 0 ? `，降级文字 ${shxStatus.fallbackTextCount} 条` : '';
          let reason = '';
          if (shxStatus.outlineMode === 'disabled') {
            reason = '（后端未启用 SHX 轮廓）';
          } else if (!shxStatus.vectorizeAvailable) {
            reason = '（未检测到 OdVectorizeEx）';
          } else if (shxStatus.vectorizeAttempted && shxStatus.vectorizeAttachedCount <= 0) {
            reason = '（OdVectorizeEx 未返回可附加轮廓）';
          } else if (shxStatus.outlineMode === 'stub') {
            reason = '（当前为 stub 模式）';
          }
          const degradedWarning = `检测到 SHX 字体，当前为降级文本渲染${fallbackCountText}${reason}`;
          if (!openWarnings.includes(degradedWarning)) {
            openWarnings.push(degradedWarning);
          }
        }

        setDocId(opened.doc_id);
        setSpaces(opened.spaces || []);
        setActiveSpace(opened.current_space || 'model');
        setWarnings(normalizeWarningsForUi(openWarnings));
        setShxRenderStatus(shxStatus);
        const rev = String(opened.parser_revision || '').trim();
        setBackendMode(rev ? `${opened.mode || 'unknown'} (${rev})` : opened.mode || 'unknown');
        await loadSpaceEntitiesRef.current(opened.doc_id, opened.current_space || 'model', true);
        await loadSpaceHierarchyRef.current(opened.doc_id, opened.current_space || 'model');
        lastOpenedFileKeyRef.current = incomingFileKey;
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '打开 DWG 图纸失败。';
        lastOpenedFileKeyRef.current = null;
        if (message.includes('only .dwg is supported for direct open')) {
          setError(`${translateDwgWarningToCn(message)}（如文件名包含中文或特殊字符，后端文件名清洗可能影响后缀识别）`);
        } else {
          setError(translateDwgWarningToCn(message));
        }
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        setHierarchyNodes([]);
        setHierarchyEntityTotal(0);
        setHierarchyBlockTotal(0);
        replaceExpandedHierarchyNodeIds(new Set());
        setSelectedHierarchyNodeIds(new Set());
        setLayerFilterEnabled(false);
        setLayerWhitelist(new Set());
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
        setWarnings([]);
        setShxRenderStatus(DEFAULT_SHX_RENDER_STATUS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    open();
    return () => {
      cancelled = true;
    };
  }, [rawFile, clearSelection]);

  useEffect(() => {
    return () => {
      if (docId) closeDwgDocument(docId).catch(() => void 0);
    };
  }, [docId]);

  useEffect(() => {
    let cancelled = false;
    setDocFonts([]);
    setFontFamilyByKey({});
    if (!docId) {
      return () => {
        cancelled = true;
      };
    }

    const loadDocFonts = async () => {
      try {
        const res = await listDwgFonts(docId);
        if (cancelled) return;
        const fonts = Array.isArray(res.fonts) ? res.fonts : [];
        setDocFonts(fonts);
        const fontWarnings = Array.isArray(res.warnings) ? res.warnings : [];
        if (fontWarnings.length > 0) {
          setWarnings((prev) => normalizeWarningsForUi([...prev, ...fontWarnings]));
        }
        const shxDiag = res.shx_diagnostics;
        const hasShxFonts = fonts.some((f) => String(f.kind || '').trim().toLowerCase() === 'shx');
        if (shxDiag || hasShxFonts) {
          const missingOriginalShxFonts = toUniqueStringList(shxDiag?.missing_original_shx_fonts);
          const resolvedOriginalShxFonts = toUniqueStringList(shxDiag?.resolved_original_shx_fonts);
          const fallbackShxFile = String(shxDiag?.fallback_shx_file || '').trim() || null;
          const fallbackHitCountRaw = Number(shxDiag?.fallback_hit_count);
          const fallbackHitCount = Number.isFinite(fallbackHitCountRaw) ? Math.max(0, fallbackHitCountRaw) : 0;
          setShxRenderStatus((prev) => {
            const nextOutlineMode = String(res.shx_outline_mode || '').trim() || prev.outlineMode;
            return {
              ...prev,
              detected: prev.detected || hasShxFonts,
              outlineMode: nextOutlineMode,
              missingOriginalShxFonts: missingOriginalShxFonts.length > 0 ? missingOriginalShxFonts : prev.missingOriginalShxFonts,
              resolvedOriginalShxFonts: resolvedOriginalShxFonts.length > 0 ? resolvedOriginalShxFonts : prev.resolvedOriginalShxFonts,
              fallbackShxFile: fallbackShxFile || prev.fallbackShxFile,
              fallbackHitCount: Math.max(prev.fallbackHitCount, fallbackHitCount),
              diagnosticsUnavailable: prev.diagnosticsUnavailable || Boolean(shxDiag?.diagnostics_unavailable),
            };
          });
        }

        const next: Record<string, string> = {};
        for (const font of fonts) {
          const key = String(font.key || '').trim();
          if (!key) continue;
          const cacheKey = `${docId}:${key}`;
          const cachedFamily = loadedCadFontsRef.current.get(cacheKey);
          if (cachedFamily) {
            next[key] = cachedFamily;
            continue;
          }

          const fallbackFamily = sanitizeCssFontFamily(font.family || font.name || '');
          const kind = String(font.kind || '').toLowerCase();
          if (font.available && font.file_url && (kind === 'ttf' || kind === 'ttc' || kind === 'otf')) {
            try {
              const familyId = `DWG_FONT_${docId.replace(/[^a-zA-Z0-9_]/g, '_')}_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
              const face = new FontFace(familyId, `url("${font.file_url}")`);
              const loadedFace = await face.load();
              document.fonts.add(loadedFace);
              loadedCadFontsRef.current.set(cacheKey, familyId);
              next[key] = familyId;
              continue;
            } catch {
              // fallback below
            }
          }

          if (fallbackFamily) {
            loadedCadFontsRef.current.set(cacheKey, fallbackFamily);
            next[key] = fallbackFamily;
          }
        }
        if (!cancelled) setFontFamilyByKey(next);
      } catch {
        if (cancelled) return;
        setDocFonts([]);
        setFontFamilyByKey({});
      }
    };

    void loadDocFonts();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const switchSpace = useCallback(
    async (nextSpace: string) => {
      if (!docId) return;
      setActiveSpace(nextSpace);
      clearSelection();
      setSelectionScope('block');
      setActiveBlockId(null);
      setActiveBlockName('');
      setActiveBlockEntity(null);
      setMeasurePoints([]);
      setMeasureValue('');
      setLayerFilterEnabled(false);
      setLayerWhitelist(new Set());
      setHiddenLayerNames(new Set());
      setHiddenHierarchyNodeIds(new Set());
      setSnapCandidatePoint(null);
      setSnapCandidateMode(null);
      setSelectedHierarchyNodeIds(new Set());
      setHierarchyError(null);
      try {
        await updateDwgView(docId, { space_id: nextSpace });
        const latest = await listDwgSpaces(docId);
        setSpaces(latest.spaces || []);
        await loadSpaceEntities(docId, nextSpace, true);
        await loadSpaceHierarchy(docId, nextSpace);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to switch space.');
      }
    },
    [docId, loadSpaceEntities, loadSpaceHierarchy, clearSelection]
  );

  const handleMeasure = useCallback(
    async (points: WorldPoint[]) => {
      if (!docId || points.length !== 2) return;
      try {
        const result = await measureDwg(docId, { type: 'distance', p1: points[0], p2: points[1] });
        if (result.ok && typeof result.value === 'number') {
          setMeasureValue(`${result.value.toFixed(4)} (${result.unit || 'unit'})`);
        } else {
          setMeasureValue(result.error || 'measure failed');
        }
      } catch (e) {
        setMeasureValue(e instanceof Error ? e.message : 'measure failed');
      }
    },
    [docId]
  );

  const exitBlockInternalSelection = useCallback(() => {
    setSelectionScope('block');
    if (activeBlockEntity && activeBlockId) {
      applySelection([activeBlockId], [activeBlockEntity]);
    } else {
      clearSelection();
    }
    setActiveBlockId(null);
    setActiveBlockName('');
    setActiveBlockEntity(null);
  }, [activeBlockEntity, activeBlockId, applySelection, clearSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      clearSelection();
      setIsBoxSelecting(false);
      setBoxSelectStart(null);
      setBoxSelectCurrent(null);
      setBoxSelectModifier('replace');
      if (selectionScope === 'entity') {
        setSelectionScope('block');
        setActiveBlockId(null);
        setActiveBlockName('');
        setActiveBlockEntity(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionScope, clearSelection]);

  useEffect(() => {
    if (!docId || mode !== 'measure' || !snapEnabled || !cursorWorld || isPanning) {
      setSnapCandidatePoint(null);
      setSnapCandidateMode(null);
      return;
    }
    const seq = ++snapHoverSeqRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const snapped = await snapDwgPoint(docId, {
          space_id: activeSpace,
          point: cursorWorld,
          tolerance: 12 / zoom,
          modes: ['endpoint', 'midpoint', 'center'],
        });
        if (seq !== snapHoverSeqRef.current) return;
        if (snapped.snapped && snapped.point) {
          setSnapCandidatePoint(snapped.point);
          setSnapCandidateMode(snapped.mode || null);
        } else {
          setSnapCandidatePoint(null);
          setSnapCandidateMode(null);
        }
      } catch {
        if (seq !== snapHoverSeqRef.current) return;
        setSnapCandidatePoint(null);
        setSnapCandidateMode(null);
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [docId, mode, snapEnabled, cursorWorld, isPanning, activeSpace, zoom]);

  const handleCanvasDoubleClick = useCallback(() => {
    if (mode !== 'select') return;
    if (!selectedEntity || !selectedEntityId || !isBlockRefType(selectedEntity.type)) return;
    const geom = selectedEntity.geom && typeof selectedEntity.geom === 'object' ? (selectedEntity.geom as Record<string, unknown>) : {};
    setSelectionScope('entity');
    setActiveBlockId(selectedEntityId);
    setActiveBlockEntity(selectedEntity);
    setActiveBlockName(String(geom.block_name ?? selectedEntityId));
  }, [mode, selectedEntity, selectedEntityId]);

  const handleBoxSelect = useCallback(
    async (
      startScreen: { x: number; y: number },
      endScreen: { x: number; y: number },
      modifier: BoxSelectModifier = 'replace'
    ) => {
      if (!docId) return;
      const w1 = screenToWorld(startScreen.x, startScreen.y);
      const w2 = screenToWorld(endScreen.x, endScreen.y);
      const selectBounds: WorldBounds = {
        minX: Math.min(w1.x, w2.x),
        minY: Math.min(w1.y, w2.y),
        maxX: Math.max(w1.x, w2.x),
        maxY: Math.max(w1.y, w2.y),
      };
      const windowMode = endScreen.x >= startScreen.x;

      let scoped = entities.filter((ent) => isLayerSelectable(ent.layer) && isEntityVisible(ent.layer, ent.id));
      if (selectionScope === 'entity' && activeBlockId) {
        scoped = scoped.filter((ent) => String(ent.parent_block_id || '') === activeBlockId);
      }

      const hits = scoped.filter((ent) => {
        const b = entityWorldBounds(ent);
        if (!b) return false;
        return windowMode ? boundsContains(selectBounds, b) : boundsIntersects(selectBounds, b);
      });

      if (!hits.length) {
        if (modifier === 'replace') clearSelection();
        return;
      }

      if (selectionScope === 'block') {
        const uniqueTargets: Array<{ id: string; kind: 'block' | 'entity'; source: DwgEntityLite }> = [];
        const seen = new Set<string>();
        for (const ent of hits) {
          const parent = String(ent.parent_block_id || '').trim();
          const id = parent || ent.id;
          const kind: 'block' | 'entity' = parent ? 'block' : 'entity';
          const key = `${kind}:${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          uniqueTargets.push({ id, kind, source: ent });
        }

        const selectedIds: string[] = [];
        const selectedRecords: Record<string, unknown>[] = [];
        for (const target of uniqueTargets) {
          if (target.kind === 'entity') {
            selectedIds.push(target.id);
            selectedRecords.push(target.source as unknown as Record<string, unknown>);
            continue;
          }
          try {
            const detail = await getDwgEntity(docId, target.id);
            if (detail.entity && typeof detail.entity === 'object') {
              if (!isEntityVisible((detail.entity as Record<string, unknown>).layer, getEntityRecordId(detail.entity))) {
                continue;
              }
              selectedIds.push(target.id);
              selectedRecords.push(detail.entity);
            }
          } catch {
            // ignore unresolved block entity
          }
        }
        if (!selectedIds.length) {
          if (modifier === 'replace') clearSelection();
          return;
        }
        const merged = mergeSelectionByModifier(selectedIds, selectedRecords, modifier);
        if (!merged.ids.length || !merged.records.length) {
          clearSelection();
          return;
        }
        applySelection(merged.ids, merged.records);
        setSelectionScope('block');
        if (merged.ids.length === 1 && isBlockRefType(merged.records[0].type)) {
          const geom = merged.records[0].geom && typeof merged.records[0].geom === 'object' ? (merged.records[0].geom as Record<string, unknown>) : {};
          setActiveBlockName(String(geom.block_name ?? merged.ids[0]));
        } else {
          setActiveBlockId(null);
          setActiveBlockName('');
          setActiveBlockEntity(null);
        }
        return;
      }

      const seenEntityIds = new Set<string>();
      const selectedIds: string[] = [];
      const selectedRecords: Record<string, unknown>[] = [];
      for (const ent of hits) {
        if (seenEntityIds.has(ent.id)) continue;
        seenEntityIds.add(ent.id);
        selectedIds.push(ent.id);
        selectedRecords.push(ent as unknown as Record<string, unknown>);
      }
      const merged = mergeSelectionByModifier(selectedIds, selectedRecords, modifier);
      if (!merged.ids.length || !merged.records.length) {
        clearSelection();
        return;
      }
      applySelection(merged.ids, merged.records);
    },
    [
      docId,
      screenToWorld,
      entities,
      isLayerSelectable,
      isEntityVisible,
      selectionScope,
      activeBlockId,
      clearSelection,
      applySelection,
      mergeSelectionByModifier,
    ]
  );

  const boxSelectPreview = useMemo(() => {
    if (mode !== 'select' || !boxSelectStart || !boxSelectCurrent) return null;
    const dx = boxSelectCurrent.x - boxSelectStart.x;
    const dy = boxSelectCurrent.y - boxSelectStart.y;
    if (Math.hypot(dx, dy) < BOX_SELECT_DRAG_THRESHOLD_PX) return null;

    const w1 = screenToWorld(boxSelectStart.x, boxSelectStart.y);
    const w2 = screenToWorld(boxSelectCurrent.x, boxSelectCurrent.y);
    const selectBounds: WorldBounds = {
      minX: Math.min(w1.x, w2.x),
      minY: Math.min(w1.y, w2.y),
      maxX: Math.max(w1.x, w2.x),
      maxY: Math.max(w1.y, w2.y),
    };
    const windowMode = boxSelectCurrent.x >= boxSelectStart.x;

    let scoped = entities.filter((ent) => isLayerSelectable(ent.layer) && isEntityVisible(ent.layer, ent.id));
    if (selectionScope === 'entity' && activeBlockId) {
      scoped = scoped.filter((ent) => String(ent.parent_block_id || '') === activeBlockId);
    }

    const hits = scoped.filter((ent) => {
      const b = entityWorldBounds(ent);
      if (!b) return false;
      return windowMode ? boundsContains(selectBounds, b) : boundsIntersects(selectBounds, b);
    });

    if (selectionScope === 'block') {
      const unique = new Set<string>();
      for (const ent of hits) {
        const parent = String(ent.parent_block_id || '').trim();
        unique.add(parent || ent.id);
      }
      return { count: unique.size, windowMode, modifier: boxSelectModifier };
    }

    return { count: new Set(hits.map((ent) => ent.id)).size, windowMode, modifier: boxSelectModifier };
  }, [
    mode,
    boxSelectStart,
    boxSelectCurrent,
    screenToWorld,
    entities,
    isLayerSelectable,
    isEntityVisible,
    selectionScope,
    activeBlockId,
    boxSelectModifier,
  ]);

  const boxSelectModifierLabel = useMemo(() => {
    if (boxSelectModifier === 'add') return '累加';
    if (boxSelectModifier === 'toggle') return '反选';
    return '替换';
  }, [boxSelectModifier]);

  const resolveCadTextFontFamily = useCallback(
    (fontKeyRaw: unknown, fontFamilyRaw?: unknown, fontNameRaw?: unknown) => {
      const fontKey = _sanitizeFontKeyUi(fontKeyRaw);
      if (fontKey && fontFamilyByKey[fontKey]) {
        return buildCadTextFontFamily(fontFamilyByKey[fontKey]);
      }
      const family = sanitizeCssFontFamily(fontFamilyRaw || '');
      if (family) return buildCadTextFontFamily(family);
      const name = sanitizeCssFontFamily(fontNameRaw || '');
      if (name) return buildCadTextFontFamily(name);
      return CAD_TEXT_FALLBACK_FONT;
    },
    [fontFamilyByKey]
  );

  const handleCanvasClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      if (!docId || isPanning) return;
      if (suppressClickAfterBoxRef.current) {
        suppressClickAfterBoxRef.current = false;
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const worldPoint = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);

      if (mode === 'measure') {
        let pointToUse = worldPoint;
        if (snapEnabled) {
          if (snapCandidatePoint) {
            pointToUse = snapCandidatePoint;
          } else {
            try {
              const snapped = await snapDwgPoint(docId, {
                space_id: activeSpace,
                point: worldPoint,
                tolerance: 12 / zoom,
                modes: ['endpoint', 'midpoint', 'center'],
              });
              if (snapped.snapped && snapped.point) pointToUse = snapped.point;
            } catch {
              // ignore snap errors
            }
          }
        }

        setMeasurePoints((prev) => {
          const next = prev.length >= 2 ? [pointToUse] : [...prev, pointToUse];
          if (next.length === 2) {
            handleMeasure(next);
          } else {
            setMeasureValue('');
          }
          return next;
        });
        return;
      }

      try {
        const maxTolWorld = (PICK_BOX_SIZE_PX * PICK_TOLERANCE_FACTORS[PICK_TOLERANCE_FACTORS.length - 1]) / zoom;
        const blockMaxTolWorld = (BLOCK_PICK_BOX_SIZE_PX * PICK_TOLERANCE_FACTORS[PICK_TOLERANCE_FACTORS.length - 1]) / zoom;
        const tryResolveEntity = async (entityId: string): Promise<Record<string, unknown> | null> => {
          try {
            const detail = await getDwgEntity(docId, entityId);
            if (detail.entity && typeof detail.entity === 'object') return detail.entity;
          } catch {
            // fall back to local cache
          }
          const localEnt = entityById.get(entityId) || null;
          return localEnt ? (localEnt as unknown as Record<string, unknown>) : null;
        };

        if (selectionScope === 'block') {
          // Block mode: only pick a block when the cursor actually hits a child entity.
          // This avoids false positives where clicking blank area inside block bbox selects the block.
          let pickedSourceEntityId: string | null = null;
          let pickedSourceParentBlockId: string | null = null;
          for (const factor of PICK_TOLERANCE_FACTORS) {
            const picked = await pickDwgEntity(docId, {
              space_id: activeSpace,
              point: worldPoint,
              tolerance: (BLOCK_PICK_BOX_SIZE_PX * factor) / zoom,
              selection_scope: 'entity',
            });
            const first = picked.picked?.[0];
            if (!first?.entity_id) continue;
            const candidateSourceEntityId = String(first.entity_id);
            const localSourceEntity = entityById.get(candidateSourceEntityId);
            if (localSourceEntity) {
              if (!isLayerSelectable(localSourceEntity.layer)) continue;
              if (!isEntityVisible(localSourceEntity.layer, localSourceEntity.id)) continue;
            }
            pickedSourceEntityId = candidateSourceEntityId;
            const parentId = typeof first.parent_block_id === 'string' ? first.parent_block_id.trim() : '';
            pickedSourceParentBlockId = parentId || null;
            break;
          }

          if (!pickedSourceEntityId) {
            clearSelection();
            setSelectionScope('block');
            setActiveBlockId(null);
            setActiveBlockName('');
            setActiveBlockEntity(null);
            return;
          }

          const sourceEntity = await tryResolveEntity(pickedSourceEntityId);
          if (!sourceEntity) {
            clearSelection();
            return;
          }
          if (!isLayerSelectable((sourceEntity as Record<string, unknown>).layer)) {
            clearSelection();
            return;
          }
          if (!isEntityVisible((sourceEntity as Record<string, unknown>).layer, getEntityRecordId(sourceEntity))) {
            clearSelection();
            return;
          }
          const sourceHitTolWorld = pickedSourceParentBlockId ? blockMaxTolWorld : maxTolWorld;
          if (!isEntityRecordHit(sourceEntity, worldPoint, sourceHitTolWorld, activeSpace)) {
            clearSelection();
            return;
          }

          if (!pickedSourceParentBlockId) {
            setSelectionScope('block');
            setActiveBlockId(null);
            setActiveBlockName('');
            setActiveBlockEntity(null);
            applySelection([pickedSourceEntityId], [sourceEntity]);
            return;
          }

          const blockEntity = await tryResolveEntity(pickedSourceParentBlockId);
          if (!blockEntity) {
            applySelection([pickedSourceEntityId], [sourceEntity]);
            return;
          }
          if (!isLayerSelectable((blockEntity as Record<string, unknown>).layer)) {
            clearSelection();
            return;
          }
          if (!isEntityVisible((blockEntity as Record<string, unknown>).layer, getEntityRecordId(blockEntity))) {
            clearSelection();
            return;
          }
          const geom = blockEntity.geom && typeof blockEntity.geom === 'object' ? (blockEntity.geom as Record<string, unknown>) : {};
          setSelectionScope('block');
          setActiveBlockId(null);
          setActiveBlockName('');
          setActiveBlockEntity(null);
          applySelection([pickedSourceParentBlockId], [blockEntity]);
          if (isBlockRefType(blockEntity.type)) {
            setActiveBlockName(String(geom.block_name ?? pickedSourceParentBlockId));
          }
          return;
        }

        if (!activeBlockId) {
          exitBlockInternalSelection();
          return;
        }

        let pickedEntityId: string | null = null;
        for (const factor of PICK_TOLERANCE_FACTORS) {
          const picked = await pickDwgEntity(docId, {
            space_id: activeSpace,
            point: worldPoint,
            tolerance: (PICK_BOX_SIZE_PX * factor) / zoom,
            selection_scope: 'entity',
            parent_block_id: activeBlockId,
          });
          const first = picked.picked?.[0];
          if (first?.entity_id) {
            const candidateEntityId = first.entity_id;
            const localCandidate = entityById.get(candidateEntityId);
            if (localCandidate) {
              if (!isLayerSelectable(localCandidate.layer)) continue;
              if (!isEntityVisible(localCandidate.layer, localCandidate.id)) continue;
            }
            pickedEntityId = candidateEntityId;
            break;
          }
        }

        if (!pickedEntityId) {
          const scopedEntities = entities.filter(
            (ent) =>
              String(ent.parent_block_id || '') === activeBlockId && isLayerSelectable(ent.layer) && isEntityVisible(ent.layer, ent.id)
          );
          const localScopedId = findLocalPickEntityId(worldPoint, maxTolWorld, scopedEntities, worldViewBounds);
          if (localScopedId) {
            pickedEntityId = localScopedId;
          }
        }

        if (!pickedEntityId) {
          if (activeBlockEntity) {
            applySelection([activeBlockId], [activeBlockEntity]);
          }
          return;
        }

        const entityRecord = await tryResolveEntity(pickedEntityId);
        if (!entityRecord) return;
        if (!isLayerSelectable((entityRecord as Record<string, unknown>).layer)) return;
        if (!isEntityVisible((entityRecord as Record<string, unknown>).layer, getEntityRecordId(entityRecord))) return;
        if (!isEntityRecordHit(entityRecord, worldPoint, maxTolWorld, activeSpace)) return;
        applySelection([pickedEntityId], [entityRecord]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'pick failed');
      }
    },
    [
      docId,
      isPanning,
      screenToWorld,
      mode,
      snapEnabled,
      snapCandidatePoint,
      activeSpace,
      zoom,
      handleMeasure,
      entities,
      entityById,
      worldViewBounds,
      selectionScope,
      activeBlockId,
      activeBlockEntity,
      exitBlockInternalSelection,
      clearSelection,
      applySelection,
      isLayerSelectable,
      isEntityVisible,
    ]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvases = [geometryCanvasRef.current, textCanvasRef.current, overlayCanvasRef.current];
    if (!viewport || canvases.some((c) => !c)) return;

    const updateSize = () => {
      const rect = viewport.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      setCanvasMetrics((prev) => {
        if (prev.width === width && prev.height === height && Math.abs(prev.dpr - dpr) < 1e-6) return prev;
        return { width, height, dpr };
      });
    };

    updateSize();
    const obs = new ResizeObserver(updateSize);
    obs.observe(viewport);
    window.addEventListener('resize', updateSize);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    const canvases = [geometryCanvasRef.current, textCanvasRef.current, overlayCanvasRef.current];
    for (const canvas of canvases) {
      if (!canvas) continue;
      canvas.width = Math.max(1, Math.floor(canvasMetrics.width * canvasMetrics.dpr));
      canvas.height = Math.max(1, Math.floor(canvasMetrics.height * canvasMetrics.dpr));
      canvas.style.width = `${canvasMetrics.width}px`;
      canvas.style.height = `${canvasMetrics.height}px`;
    }
  }, [canvasMetrics]);

  const selectedLine = useMemo(() => {
    if (selectedEntities.length > 1) return null;
    if (!selectedEntity || selectedEntity.type !== 'LINE' || typeof selectedEntity.geom !== 'object') return null;
    const geom = selectedEntity.geom as Record<string, any>;
    if (!isPoint(geom.start) || !isPoint(geom.end)) return null;
    return { start: geom.start as WorldPoint, end: geom.end as WorldPoint };
  }, [selectedEntities.length, selectedEntity]);

  const selectedBlockBBox = useMemo(() => {
    if (selectedEntities.length > 1) return null;
    if (!selectedEntity || !isBlockRefType(selectedEntity.type)) return null;
    const bbox = selectedEntity.bbox as Record<string, unknown> | undefined;
    if (!bbox || typeof bbox !== 'object') return null;
    const bmin = bbox.min as Record<string, unknown> | undefined;
    const bmax = bbox.max as Record<string, unknown> | undefined;
    if (!bmin || !bmax) return null;
    const minX = Number(bmin.x);
    const minY = Number(bmin.y);
    const maxX = Number(bmax.x);
    const maxY = Number(bmax.y);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return {
      min: { x: Math.min(minX, maxX), y: Math.min(minY, maxY) },
      max: { x: Math.max(minX, maxX), y: Math.max(minY, maxY) },
    };
  }, [selectedEntities.length, selectedEntity]);

  const selectedCount = useMemo(() => {
    if (selectedEntities.length > 0) return selectedEntities.length;
    if (selectedEntity) return 1;
    return 0;
  }, [selectedEntities, selectedEntity]);

  const selectedPropertySections = useMemo(() => {
    if (selectedEntities.length > 1) return buildMultiEntityPropertySections(selectedEntities);
    if (selectedEntities.length === 1) return getEntityPropertySections(selectedEntities[0]);
    if (!selectedEntity) return [];
    return getEntityPropertySections(selectedEntity);
  }, [selectedEntities, selectedEntity]);

  const selectedCadHandle = useMemo(() => {
    if (selectedCount > 1) return `已选${selectedCount}`;
    if (selectedEntities.length === 1) return extractCadHandleAndPath(selectedEntities[0]).handle;
    if (selectedEntity) return extractCadHandleAndPath(selectedEntity).handle;
    if (selectedEntityId) return extractCadHandleAndPath({ id: selectedEntityId }).handle;
    return '--';
  }, [selectedCount, selectedEntities, selectedEntity, selectedEntityId]);

  const selectedJsonPreview = useMemo(() => {
    if (selectedEntities.length > 1) {
      return {
        selection_count: selectedEntities.length,
        types: Array.from(new Set(selectedEntities.map((ent) => String(ent.type || '--').toUpperCase()))),
        ids: selectedEntityIds,
      };
    }
    if (selectedEntities.length === 1) return selectedEntities[0];
    return selectedEntity;
  }, [selectedEntities, selectedEntityIds, selectedEntity]);

  const docFontSummary = useMemo(() => {
    const total = docFonts.length;
    const available = docFonts.filter((f) => f.available).length;
    const shx = docFonts.filter((f) => String(f.kind || '').toLowerCase() === 'shx').length;
    return { total, available, shx };
  }, [docFonts]);

  const shxStatusBadge = useMemo(() => {
    if (!shxRenderStatus.detected) return null;
    if (shxRenderStatus.trueOutline) {
      return {
        label: 'SHX 真实轮廓',
        className: 'border-emerald-600/40 bg-emerald-950/30 text-emerald-200',
      };
    }
    return {
      label: 'SHX 降级显示',
      className: 'border-amber-600/40 bg-amber-950/30 text-amber-200',
    };
  }, [shxRenderStatus]);

  const shxFontDiagnosticWarning = useMemo(
    () => buildShxFontDiagnosticFromDocFonts(shxRenderStatus, docFonts),
    [shxRenderStatus, docFonts]
  );
  const shxDebugMatch = useMemo(() => shxRenderStatus.debugMatch, [shxRenderStatus.debugMatch]);
  const warningLines = useMemo<WarningLineItem[]>(() => {
    const merged: WarningLineItem[] = warnings.map((text, index) => ({
      id: `w-${index}-${text}`,
      text,
      kind: 'normal',
    }));
    if (shxFontDiagnosticWarning && !warnings.includes(shxFontDiagnosticWarning)) {
      merged.push({
        id: `shx-diagnostic-${shxFontDiagnosticWarning}`,
        text: shxFontDiagnosticWarning,
        kind: 'shx_diagnostic',
      });
    }
    return merged;
  }, [warnings, shxFontDiagnosticWarning]);
  const canToggleWarnings = warningLines.length > 0;

  const shxMissingOriginalFontNames = useMemo(() => {
    if (shxRenderStatus.missingOriginalShxFonts.length > 0) return shxRenderStatus.missingOriginalShxFonts;
    const names: string[] = [];
    const seen = new Set<string>();
    for (const font of docFonts) {
      if (String(font.kind || '').trim().toLowerCase() !== 'shx') continue;
      if (!Boolean(font.fallback_shx_hit)) continue;
      const label = String(font.name || font.style_name || font.key || '').trim() || '未命名SHX';
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(label);
    }
    return names;
  }, [shxRenderStatus.missingOriginalShxFonts, docFonts]);

  const selectionScopeLabel = useMemo(() => {
    if (selectionScope === 'entity') return activeBlockName ? `块内选择: ${activeBlockName}` : '块内选择';
    return '块选择';
  }, [activeBlockName, selectionScope]);

  const toggleHierarchyNode = useCallback((nodeId: string) => {
    startTransition(() => {
      mutateExpandedHierarchyNodeIds((next) => {
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return true;
      });
    });
  }, [mutateExpandedHierarchyNodeIds]);

  const handleHierarchyNodeSelect = useCallback(
    async (node: DwgHierarchyNode) => {
      if (node.node_kind === 'category') {
        toggleHierarchyNode(node.node_id);
        return;
      }
      if (!isLayerSelectable(node.layer)) return;
      if (!isNodeVisible(node)) return;
      const entityId = typeof node.entity_id === 'string' ? node.entity_id.trim() : '';
      if (!entityId || !docId) return;

      let detailRecord: Record<string, unknown> | null = null;
      const localEnt = entityById.get(entityId) || null;
      if (localEnt) detailRecord = localEnt as unknown as Record<string, unknown>;

      try {
        const detail = await getDwgEntity(docId, entityId);
        if (detail.entity && typeof detail.entity === 'object') detailRecord = detail.entity;
      } catch {
        // ignore detail fetch errors, keep best local info
      }
      if (!detailRecord) return;
      if (!isEntityVisible(detailRecord.layer, getEntityRecordId(detailRecord))) return;
      applySelection([entityId], [detailRecord]);
    },
    [docId, entityById, isLayerSelectable, isEntityVisible, isNodeVisible, toggleHierarchyNode, applySelection]
  );

  const handleHierarchyLocate = useCallback(
    (node: DwgHierarchyNode) => {
      const bounds = hierarchyBboxToWorldBounds(node.bbox);
      if (!bounds) return;
      focusWorldBounds(bounds);
    },
    [focusWorldBounds]
  );

  useEffect(() => {
    if (!selectedEntityIds.length) {
      setSelectedHierarchyNodeIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    const selectedNodeIds = new Set<string>();
    mutateExpandedHierarchyNodeIds((next) => {
      let changed = false;
      for (const entityId of selectedEntityIds) {
        const path = hierarchyEntityPathById.get(entityId);
        if (!path || path.length === 0) continue;
        selectedNodeIds.add(path[path.length - 1]);
        for (let i = 0; i < path.length - 1; i += 1) {
          const nodeId = path[i];
          if (next.has(nodeId)) continue;
          next.add(nodeId);
          changed = true;
        }
      }
      return changed;
    });
    setSelectedHierarchyNodeIds((prev) => (areStringSetsEqual(prev, selectedNodeIds) ? prev : selectedNodeIds));
  }, [hierarchyEntityPathById, mutateExpandedHierarchyNodeIds, selectedEntityIds]);

  useEffect(() => {
    if (selectedEntities.length > 0) {
      const allVisibleAndSelectable = selectedEntities.every((ent) => {
        const entityId = getEntityRecordId(ent);
        return isLayerSelectable(ent.layer) && isEntityVisible(ent.layer, entityId);
      });
      if (allVisibleAndSelectable) return;
      clearSelection();
      return;
    }
    if (!selectedEntity) return;
    if (isLayerSelectable(selectedEntity.layer) && isEntityVisible(selectedEntity.layer, getEntityRecordId(selectedEntity))) return;
    clearSelection();
  }, [isLayerSelectable, isEntityVisible, selectedEntities, selectedEntity, clearSelection]);

  const flattenedHierarchyRows = useMemo(() => {
    const rows: FlatHierarchyRow[] = [];
    const walk = (nodes: DwgHierarchyNode[], depth: number) => {
      for (const node of nodes) {
        const children = hierarchyChildren(node);
        const hasChildren = children.length > 0;
        const expanded = hasChildren && expandedHierarchyNodeIdsRef.current.has(node.node_id);
        const isSelected = selectedHierarchyNodeIds.has(node.node_id);
        const selectable = node.node_kind === 'category' ? true : isLayerSelectable(node.layer);
        const visible = nodeVisibleMap.get(node.node_id) ?? true;
        const rowInteractive = node.node_kind === 'category' || (selectable && visible);
        const rowLabel = node.node_kind === 'category' ? `${node.label} (${children.length})` : node.label || node.handle || '--';

        rows.push({
          node,
          depth,
          hasChildren,
          expanded,
          isSelected,
          visible,
          rowInteractive,
          rowLabel,
        });

        if (expanded) walk(children, depth + 1);
      }
    };

    walk(hierarchyNodes, 0);
    return rows;
  }, [expandedHierarchyVersion, hierarchyNodes, isLayerSelectable, nodeVisibleMap, selectedHierarchyNodeIds]);

  const treeVirtualizer = useVirtualizer({
    count: flattenedHierarchyRows.length,
    getScrollElement: () => treeScrollRef.current,
    getItemKey: (index) => flattenedHierarchyRows[index]?.node.node_id ?? index,
    estimateSize: () => 28,
    overscan: 8,
  });

  useEffect(() => {
    if (!showTreeSidebar) return;
    const timer = window.setTimeout(() => treeVirtualizer.measure(), 0);
    return () => window.clearTimeout(timer);
  }, [showTreeSidebar, treeVirtualizer]);

  useEffect(() => {
    const gCanvas = geometryCanvasRef.current;
    const tCanvas = textCanvasRef.current;
    const oCanvas = overlayCanvasRef.current;
    if (!gCanvas || !tCanvas || !oCanvas) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const gctx = gCanvas.getContext('2d');
      const tctx = tCanvas.getContext('2d');
      const octx = oCanvas.getContext('2d');
      if (!gctx || !tctx || !octx) return;

      const pixelW = gCanvas.width;
      const pixelH = gCanvas.height;
      const dpr = canvasMetrics.dpr;

      for (const ctx of [gctx, tctx, octx]) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pixelW, pixelH);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      gctx.fillStyle = '#030712';
      gctx.fillRect(0, 0, canvasMetrics.width, canvasMetrics.height);

      gctx.strokeStyle = '#111827';
      gctx.lineWidth = 1;
      for (let i = 0; i <= 20; i += 1) {
        const worldX = (i - 10) * 50;
        const p1 = worldToScreen({ x: worldX, y: -500, z: 0 });
        const p2 = worldToScreen({ x: worldX, y: 500, z: 0 });
        gctx.beginPath();
        gctx.moveTo(p1.x, p1.y);
        gctx.lineTo(p2.x, p2.y);
        gctx.stroke();
      }
      for (let i = 0; i <= 20; i += 1) {
        const worldY = (i - 10) * 50;
        const p1 = worldToScreen({ x: -500, y: worldY, z: 0 });
        const p2 = worldToScreen({ x: 500, y: worldY, z: 0 });
        gctx.beginPath();
        gctx.moveTo(p1.x, p1.y);
        gctx.lineTo(p2.x, p2.y);
        gctx.stroke();
      }

      const origin = worldToScreen({ x: 0, y: 0, z: 0 });
      const originInView =
        origin.x >= -80 &&
        origin.x <= canvasMetrics.width + 80 &&
        origin.y >= -80 &&
        origin.y <= canvasMetrics.height + 80;
      if (originInView) {
        octx.save();
        octx.strokeStyle = 'rgba(239,68,68,0.8)';
        octx.lineWidth = 1.2;
        octx.beginPath();
        octx.moveTo(0, origin.y);
        octx.lineTo(canvasMetrics.width, origin.y);
        octx.stroke();

        octx.strokeStyle = 'rgba(34,197,94,0.8)';
        octx.beginPath();
        octx.moveTo(origin.x, 0);
        octx.lineTo(origin.x, canvasMetrics.height);
        octx.stroke();

        octx.fillStyle = '#f8fafc';
        octx.strokeStyle = 'rgba(15,23,42,0.95)';
        octx.lineWidth = 1.5;
        octx.beginPath();
        octx.arc(origin.x, origin.y, 4.5, 0, Math.PI * 2);
        octx.fill();
        octx.stroke();

        octx.font = '12px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
        octx.fillStyle = '#e2e8f0';
        octx.strokeStyle = 'rgba(2,6,23,0.9)';
        octx.lineWidth = 3;
        octx.textAlign = 'left';
        octx.textBaseline = 'bottom';
        octx.strokeText('O (0,0)', origin.x + 8, origin.y - 8);
        octx.fillText('O (0,0)', origin.x + 8, origin.y - 8);
        octx.textBaseline = 'top';
        octx.strokeText('+X', canvasMetrics.width - 24, origin.y + 4);
        octx.fillText('+X', canvasMetrics.width - 24, origin.y + 4);
        octx.textAlign = 'center';
        octx.strokeText('+Y', origin.x, 6);
        octx.fillText('+Y', origin.x, 6);
        octx.restore();
      } else {
        octx.save();
        octx.font = '12px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
        octx.textAlign = 'left';
        octx.textBaseline = 'top';
        octx.fillStyle = '#94a3b8';
        octx.fillText('WCS 原点不在当前视图: (0,0)', 12, 12);
        octx.restore();
      }

      const wipeoutDrawQueue: Array<() => void> = [];
      const textDrawQueue: Array<() => void> = [];
      const metricsCache = textMetricsCacheRef.current;
      const readCachedLineMetrics = (fontKey: string, line: string, fallbackFontSize: number): CachedLineMetrics => {
        const key = `${fontKey}\n${line}`;
        const cached = metricsCache.get(key);
        if (cached) return cached;
        const m = tctx.measureText(line);
        const advance = Number.isFinite(m.width) ? m.width : line.length * fallbackFontSize * 0.55;
        const leftOverhang = Number.isFinite((m as TextMetrics).actualBoundingBoxLeft) ? (m as TextMetrics).actualBoundingBoxLeft : 0;
        const rightOverhang = Number.isFinite((m as TextMetrics).actualBoundingBoxRight)
          ? (m as TextMetrics).actualBoundingBoxRight - advance
          : 0;
        const ascent = Number.isFinite((m as TextMetrics).actualBoundingBoxAscent)
          ? Math.max((m as TextMetrics).actualBoundingBoxAscent, fallbackFontSize * 0.72)
          : fallbackFontSize * 0.82;
        const descent = Number.isFinite((m as TextMetrics).actualBoundingBoxDescent)
          ? Math.max((m as TextMetrics).actualBoundingBoxDescent, fallbackFontSize * 0.18)
          : fallbackFontSize * 0.24;
        const packed: CachedLineMetrics = { advance, leftOverhang, rightOverhang, ascent, descent };
        metricsCache.set(key, packed);
        if (metricsCache.size > 12000) {
          metricsCache.clear();
        }
        return packed;
      };
      const queueTextDraw = (options: {
        text: string;
        anchor: WorldPoint;
        color: string;
        rotation: number;
        actualHeight: number;
        widthFactor: number;
        oblique: number;
        mirroredX: boolean;
        mirroredY: boolean;
        align: CanvasTextAlign;
        baseline: CanvasTextBaseline;
        isMText: boolean;
        textMask?: boolean;
        textMaskPadding?: number;
        subtype?: string;
        fontFamily?: string;
        lightweightMode?: boolean;
      }) => {
        textDrawQueue.push(() => {
          const p = worldToScreen(options.anchor);
          if (![p.x, p.y].every(Number.isFinite)) return;

          const lightweightMode = Boolean(options.lightweightMode);
          const projectedFontSize = options.actualHeight * zoom;
          const minProjectedFontSize = lightweightMode ? 1.1 : 0.35;
          if (!Number.isFinite(projectedFontSize) || projectedFontSize <= minProjectedFontSize) return;
          const isDimensionText = String(options.subtype || '').toLowerCase() === 'dimension_text';
          let fontSize = Math.min(lightweightMode ? 112 : 256, projectedFontSize);
          if (isDimensionText && !lightweightMode) {
            // Keep dimension annotations readable at far zoom-out without affecting normal CAD TEXT.
            fontSize = Math.max(5.5, Math.min(56, fontSize));
          }
          const shear = Math.tan((options.oblique * Math.PI) / 180);
          const rawLines = options.text.split('\n').filter((l) => l.length > 0);
          const lines = lightweightMode ? rawLines.slice(0, 4).map((line) => truncateCadLine(line, 42)) : rawLines;
          if (!lines.length) return;

          tctx.save();
          tctx.translate(p.x, p.y);
          tctx.rotate((-options.rotation * Math.PI) / 180);
          tctx.scale((options.mirroredX ? -1 : 1) * (Number.isFinite(options.widthFactor) && options.widthFactor > 0 ? options.widthFactor : 1), options.mirroredY ? -1 : 1);
          if (Number.isFinite(shear) && Math.abs(shear) > 1e-6) tctx.transform(1, 0, -shear, 1, 0, 0);
          tctx.font = `${fontSize}px ${options.fontFamily || CAD_TEXT_FALLBACK_FONT}`;
          tctx.fillStyle = options.color;
          tctx.strokeStyle = 'rgba(15,23,42,0.95)';
          tctx.lineWidth = Math.min(2.4, Math.max(0.12, fontSize * 0.08));
          tctx.textAlign = options.align;
          tctx.textBaseline = options.baseline;
          const lineGap = fontSize * (options.isMText ? 1.22 : 1.0);

          if (options.textMask && !lightweightMode) {
            const padScale = Number(options.textMaskPadding);
            const pad = Math.max(1.5, fontSize * (Number.isFinite(padScale) ? padScale : 0.2));
            const maskCorner = Math.max(1.5, Math.min(8, fontSize * 0.26));
            tctx.save();
            tctx.fillStyle = '#030712';
            tctx.globalAlpha = 0.92;
            const fontKey = tctx.font;
            lines.forEach((line, i) => {
              const y = i * lineGap;
              const { advance, leftOverhang, rightOverhang, ascent, descent } = readCachedLineMetrics(fontKey, line, fontSize);

              const xStart = options.align === 'center' ? -advance * 0.5 : options.align === 'right' ? -advance : 0;
              const xLeft = xStart - leftOverhang;
              const xRight = xStart + advance + rightOverhang;

              const textHeight = ascent + descent;
              let yTop = y - ascent;
              if (options.baseline === 'top') {
                yTop = y;
              } else if (options.baseline === 'middle') {
                yTop = y - textHeight * 0.5;
              } else if (options.baseline === 'bottom') {
                yTop = y - textHeight;
              }
              const maskX = xLeft - pad;
              const maskY = yTop - pad;
              const maskW = (xRight - xLeft) + pad * 2;
              const maskH = textHeight + pad * 2;
              fillRoundedRect(tctx, maskX, maskY, maskW, maskH, maskCorner);
            });
            tctx.restore();
          }

          lines.forEach((line, i) => {
            const y = i * lineGap;
            if (!lightweightMode && fontSize >= 2.2) tctx.strokeText(line, 0, y);
            tctx.fillText(line, 0, y);
          });
          tctx.restore();
        });
      };

      for (const entity of entities) {
        if (!isEntityVisible(entity.layer, entity.id)) continue;
        if (!bboxVisible(entity.bbox, worldViewBounds)) continue;
        const geom = (entity.geom || {}) as Record<string, any>;
        const type = String(entity.type || '').toUpperCase();
        const strokeColor = entityColor(entity);
        const entityBaseStrokeWidth = resolveStrokeWidthPx(entity, zoom, showNormalLineweight);

        if (type === 'TEXT') {
          const pos = geom.position;
          const text = cleanCadText(String(geom.text || ''));
          if (!isPoint(pos) || !text) continue;

          const horizontalMode = `${String(geom.horizontal_mode || '')} ${String(geom.attachment || '')}`.trim();
          const verticalMode = `${String(geom.vertical_mode || '')} ${String(geom.attachment || '')}`.trim();
          const align = resolveTextAlign(horizontalMode);
          const baseline = resolveTextBaseline(verticalMode);
          const anchor = getBboxAnchor(entity.bbox, align, baseline) || pos;
          const rotation = Number(geom.rotation || 0);
          const textHeight = Number(geom.height || 100);
          const actualHeight = Number(geom.actual_height || textHeight || 100);
          const widthFactor = Number(geom.width_factor || 1);
          const oblique = Number(geom.oblique || 0);
          const mirroredX = Boolean(geom.mirrored_x);
          const mirroredY = Boolean(geom.mirrored_y);
          const textFontKind = firstNonEmptyString([String(geom.font_kind ?? '')]);
          const cadFontFamily = resolveCadTextFontFamily(geom.font_key, geom.font_family, geom.font_name);
          queueTextDraw({
            text,
            anchor,
            color: strokeColor,
            rotation,
            actualHeight,
            widthFactor,
            oblique,
            mirroredX,
            mirroredY,
            align,
            baseline,
            isMText: Boolean(geom.is_mtext),
            subtype: String(geom.subtype || ''),
            fontFamily: cadFontFamily,
            lightweightMode: isShxFallbackText(shxRenderStatus, textFontKind),
          });
          continue;
        }

        gctx.strokeStyle = strokeColor;
        gctx.fillStyle = 'transparent';
        gctx.lineWidth = entityBaseStrokeWidth;
        gctx.lineCap = 'round';
        gctx.lineJoin = 'round';

        if (type === 'POINT') {
          const pos = geom.position;
          if (!isPoint(pos)) continue;
          const p = worldToScreen(pos);
          const markerPx = Math.max(2, Math.min(8, Number(geom.display_size || 6)));
          gctx.beginPath();
          gctx.arc(p.x, p.y, markerPx * 0.35, 0, Math.PI * 2);
          gctx.fillStyle = strokeColor;
          gctx.fill();
          gctx.beginPath();
          gctx.moveTo(p.x - markerPx, p.y);
          gctx.lineTo(p.x + markerPx, p.y);
          gctx.moveTo(p.x, p.y - markerPx);
          gctx.lineTo(p.x, p.y + markerPx);
          gctx.stroke();
          continue;
        }

        if (type === 'LINE') {
          const start = geom.start;
          const end = geom.end;
          if (!isPoint(start) || !isPoint(end)) continue;
          const s = worldToScreen(start);
          const e = worldToScreen(end);
          gctx.beginPath();
          gctx.moveTo(s.x, s.y);
          gctx.lineTo(e.x, e.y);
          gctx.stroke();
          continue;
        }

        if (type === 'POLYLINE' || type === 'SPLINE') {
          const points = (geom.vertices || geom.points) as unknown;
          if (!Array.isArray(points)) continue;
          const screenPts = points.filter(isPoint).map((p) => worldToScreen(p));
          if (screenPts.length < 2) continue;
          gctx.beginPath();
          gctx.moveTo(screenPts[0].x, screenPts[0].y);
          for (let i = 1; i < screenPts.length; i += 1) gctx.lineTo(screenPts[i].x, screenPts[i].y);
          if (type === 'POLYLINE' && Boolean(geom.closed) && screenPts.length > 2) {
            gctx.closePath();
          }
          gctx.stroke();
          continue;
        }

        if (type === 'HATCH') {
          const loops = Array.isArray(geom.loops) ? geom.loops : [];
          const hasSolidFill = Boolean(geom.solid_fill);
          const patternName = String(geom.pattern_name || 'SOLID');
          const patternAngle = Number(geom.pattern_angle);
          const patternScale = Number(geom.pattern_scale);
          const patternSpacing = Number(geom.pattern_spacing);
          const rings: Array<Array<{ x: number; y: number }>> = [];
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          for (const loop of loops) {
            const points = Array.isArray(loop?.points) ? loop.points : [];
            const screenPts = points
              .filter((p: unknown): p is WorldPoint => isPoint(p))
              .map((p: WorldPoint) => worldToScreen(p))
              .filter((p: { x: number; y: number }) => Number.isFinite(p.x) && Number.isFinite(p.y));
            if (screenPts.length < 3) continue;
            rings.push(screenPts);
            for (const p of screenPts) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
          }
          if (!rings.length) continue;

          const patternNameLower = patternName.trim().toLowerCase();
          const patternEnabled = patternNameLower && patternNameLower !== 'solid';
          const hatchStrokeWidth = Math.max(0.7, Math.min(3.2, entityBaseStrokeWidth));
          gctx.lineWidth = hatchStrokeWidth;

          gctx.save();
          gctx.beginPath();
          const traced = traceClosedScreenRingsPath(gctx, rings);
          if (traced && hasSolidFill) {
            gctx.fillStyle = strokeColor;
            gctx.globalAlpha = 0.2;
            gctx.fill('evenodd');
          }
          gctx.restore();

          if (traced && patternEnabled && Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
            const scale = Number.isFinite(patternScale) && patternScale > 0 ? patternScale : 1;
            const worldSpacing = Number.isFinite(patternSpacing) && patternSpacing > 0 ? patternSpacing : 8;
            const spacingPx = Math.max(4, Math.min(64, worldSpacing * scale * zoom));
            const angleDeg = Number.isFinite(patternAngle) ? patternAngle : 45;
            const cross = hatchPatternIsCross(patternName);

            gctx.save();
            gctx.beginPath();
            traceClosedScreenRingsPath(gctx, rings);
            gctx.clip('evenodd');
            drawHatchPatternLinesInClip(
              gctx,
              { minX, minY, maxX, maxY },
              strokeColor,
              angleDeg,
              spacingPx,
              cross
            );
            gctx.restore();
          }

          gctx.beginPath();
          for (const ring of rings) {
            gctx.moveTo(ring[0].x, ring[0].y);
            for (let i = 1; i < ring.length; i += 1) gctx.lineTo(ring[i].x, ring[i].y);
            gctx.closePath();
          }
          gctx.stroke();
          continue;
        }

        if (type === 'CIRCLE') {
          const center = geom.center;
          const radius = Number(geom.radius);
          if (!isPoint(center) || !Number.isFinite(radius) || radius <= 0) continue;
          const c = worldToScreen(center);
          gctx.beginPath();
          gctx.arc(c.x, c.y, Math.max(radius * zoom, 0.5), 0, Math.PI * 2);
          gctx.stroke();
          continue;
        }

        if (type === 'ARC') {
          const center = geom.center;
          const start = geom.start;
          const end = geom.end;
          const radius = Number(geom.radius);
          if (!isPoint(center) || !isPoint(start) || !isPoint(end) || !Number.isFinite(radius) || radius <= 0) continue;
          const saWorld = Math.atan2(start.y - center.y, start.x - center.x);
          const eaWorld = Math.atan2(end.y - center.y, end.x - center.x);
          const ccwDelta = normalizeAngleRad(eaWorld - saWorld);
          const cwDelta = Math.PI * 2 - ccwDelta;
          const candidateSweepA = ccwDelta;
          const candidateSweepB = -cwDelta;

          let sweep = candidateSweepA;
          if (entity.bbox?.min && entity.bbox?.max && ccwDelta > 1e-6 && cwDelta > 1e-6) {
            const sampleA = sampleArcWorld(center, radius, saWorld, candidateSweepA, 12);
            const sampleB = sampleArcWorld(center, radius, saWorld, candidateSweepB, 12);
            const scoreA = arcBboxScore(bboxFromWorldPoints(sampleA), entity.bbox);
            const scoreB = arcBboxScore(bboxFromWorldPoints(sampleB), entity.bbox);
            if (scoreB < scoreA) sweep = candidateSweepB;
          }

          const screenRadius = Math.max(radius * zoom, 0.5);
          const steps = Math.max(8, Math.min(180, Math.ceil((Math.abs(sweep) * screenRadius) / 24)));
          const arcPts = sampleArcWorld(center, radius, saWorld, sweep, steps);
          if (arcPts.length < 2) continue;

          const p0 = worldToScreen(arcPts[0]);
          gctx.beginPath();
          gctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < arcPts.length; i += 1) {
            const p = worldToScreen(arcPts[i]);
            gctx.lineTo(p.x, p.y);
          }
          gctx.stroke();
          continue;
        }

        if (type === 'ELLIPSE') {
          const center = geom.center;
          const rx = Number(geom.rx);
          const ry = Number(geom.ry);
          const rotation = Number(geom.rotation || 0);
          if (!isPoint(center) || !Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) continue;

          const rotRad = (rotation * Math.PI) / 180;
          const cosR = Math.cos(rotRad);
          const sinR = Math.sin(rotRad);

          const startPoint = isPoint(geom.start) ? (geom.start as WorldPoint) : null;
          const endPoint = isPoint(geom.end) ? (geom.end as WorldPoint) : null;

          const paramFromPoint = (p: WorldPoint): number => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            const xr = dx * cosR + dy * sinR;
            const yr = -dx * sinR + dy * cosR;
            return Math.atan2(yr / ry, xr / rx);
          };

          let startRad: number;
          let deltaRad: number;
          if (startPoint && endPoint) {
            const sp = paramFromPoint(startPoint);
            const ep = paramFromPoint(endPoint);
            startRad = sp;
            deltaRad = normalizeAngleRad(ep - sp);
            if (deltaRad < 1e-6) deltaRad = Math.PI * 2;
          } else {
            const startAngle = Number(geom.start_angle);
            const endAngle = Number(geom.end_angle);
            let deltaDeg = 360;
            let startDeg = 0;
            if (Number.isFinite(startAngle) && Number.isFinite(endAngle)) {
              startDeg = startAngle;
              deltaDeg = ((endAngle - startAngle) % 360 + 360) % 360;
              if (deltaDeg < 1e-6) deltaDeg = 360;
            }
            startRad = (startDeg * Math.PI) / 180;
            deltaRad = (deltaDeg * Math.PI) / 180;
          }

          const candidateSweepA = deltaRad;
          const candidateSweepB = -(Math.PI * 2 - deltaRad);
          let sweep = candidateSweepA;
          if (entity.bbox?.min && entity.bbox?.max && deltaRad < Math.PI * 2 - 1e-6 && deltaRad > 1e-6) {
            const sampleA = sampleEllipseWorld(center, rx, ry, rotRad, startRad, candidateSweepA, 24);
            const sampleB = sampleEllipseWorld(center, rx, ry, rotRad, startRad, candidateSweepB, 24);
            const scoreA = arcBboxScore(bboxFromWorldPoints(sampleA), entity.bbox);
            const scoreB = arcBboxScore(bboxFromWorldPoints(sampleB), entity.bbox);
            if (scoreB < scoreA) sweep = candidateSweepB;
          }

          const approxPxRadius = Math.max(rx, ry) * zoom;
          const steps = Math.max(24, Math.min(240, Math.ceil((Math.abs(sweep) * Math.max(approxPxRadius, 1)) / 18)));
          const pts = sampleEllipseWorld(center, rx, ry, rotRad, startRad, sweep, steps);
          if (pts.length < 2) continue;
          const p0 = worldToScreen(pts[0]);
          gctx.beginPath();
          gctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i += 1) {
            const p = worldToScreen(pts[i]);
            gctx.lineTo(p.x, p.y);
          }
          gctx.stroke();
          continue;
        }

        const primitives = asPrimitiveList(geom as Record<string, unknown>);
        if (!primitives.length) continue;
        for (const primitive of primitives) {
          const primitiveStrokeWidth = resolveStrokeWidthPx(entity, zoom, showNormalLineweight, primitive);
          gctx.strokeStyle = strokeColor;
          gctx.lineWidth = primitiveStrokeWidth;
          if (primitive.kind === 'line') {
            if (!isPoint(primitive.start) || !isPoint(primitive.end)) continue;
            const s = worldToScreen(primitive.start);
            const e = worldToScreen(primitive.end);
            gctx.beginPath();
            gctx.moveTo(s.x, s.y);
            gctx.lineTo(e.x, e.y);
            gctx.stroke();
            continue;
          }
          if (primitive.kind === 'polyline') {
            const screenPts = primitive.points.filter(isPoint).map((p) => worldToScreen(p));
            if (screenPts.length < 2) continue;
            gctx.beginPath();
            gctx.moveTo(screenPts[0].x, screenPts[0].y);
            for (let i = 1; i < screenPts.length; i += 1) gctx.lineTo(screenPts[i].x, screenPts[i].y);
            if (Boolean(primitive.closed) && screenPts.length > 2) gctx.closePath();
            gctx.stroke();
            continue;
          }
          if (primitive.kind === 'polygon') {
            for (const ring of primitive.rings) {
              const screenPts = ring.filter(isPoint).map((p) => worldToScreen(p));
              if (screenPts.length < 3) continue;
              gctx.beginPath();
              gctx.moveTo(screenPts[0].x, screenPts[0].y);
              for (let i = 1; i < screenPts.length; i += 1) gctx.lineTo(screenPts[i].x, screenPts[i].y);
              gctx.closePath();
              if (primitive.wipeout) {
                const ptsCopy = screenPts.map((p) => ({ x: p.x, y: p.y }));
                wipeoutDrawQueue.push(() => {
                  gctx.save();
                  gctx.beginPath();
                  gctx.moveTo(ptsCopy[0].x, ptsCopy[0].y);
                  for (let i = 1; i < ptsCopy.length; i += 1) gctx.lineTo(ptsCopy[i].x, ptsCopy[i].y);
                  gctx.closePath();
                  gctx.fillStyle = '#030712';
                  gctx.globalAlpha = 1;
                  gctx.fill();
                  gctx.restore();
                });
                continue;
              }
              if (primitive.arrow_fill) {
                // If the world-space triangle becomes too small on screen, draw a readable
                // screen-space fallback arrow so dimensions/leaders remain usable when zoomed out.
                const area = Math.abs(
                  screenPts.reduce((acc, cur, i) => {
                    const next = screenPts[(i + 1) % screenPts.length];
                    return acc + cur.x * next.y - next.x * cur.y;
                  }, 0) * 0.5
                );
                if (area < 20 && screenPts.length >= 3) {
                  const tip = screenPts[0];
                  const baseMid = {
                    x: (screenPts[1].x + screenPts[2].x) * 0.5,
                    y: (screenPts[1].y + screenPts[2].y) * 0.5,
                  };
                  const dx = baseMid.x - tip.x;
                  const dy = baseMid.y - tip.y;
                  const dn = Math.hypot(dx, dy);
                  if (dn > 1e-6) {
                    const ux = dx / dn;
                    const uy = dy / dn;
                    const nx = -uy;
                    const ny = ux;
                    const arrowLen = 7.5;
                    const halfW = 3.6;
                    const b1 = { x: tip.x + ux * arrowLen + nx * halfW, y: tip.y + uy * arrowLen + ny * halfW };
                    const b2 = { x: tip.x + ux * arrowLen - nx * halfW, y: tip.y + uy * arrowLen - ny * halfW };
                    gctx.save();
                    gctx.beginPath();
                    gctx.moveTo(tip.x, tip.y);
                    gctx.lineTo(b1.x, b1.y);
                    gctx.lineTo(b2.x, b2.y);
                    gctx.closePath();
                    gctx.fillStyle = strokeColor;
                    gctx.lineWidth = Math.max(0.8, primitiveStrokeWidth);
                    gctx.globalAlpha = 1;
                    gctx.fill();
                    gctx.restore();
                  }
                } else {
                  gctx.save();
                  gctx.fillStyle = strokeColor;
                  gctx.globalAlpha = 1;
                  gctx.fill();
                  gctx.restore();
                  gctx.stroke();
                }
                continue;
              }
              if (primitive.filled) {
                gctx.save();
                gctx.fillStyle = strokeColor;
                gctx.globalAlpha = 0.18;
                gctx.fill();
                gctx.restore();
              }
              gctx.stroke();
            }
            continue;
          }
          if (primitive.kind === 'text') {
            const pos = primitive.position;
            const text = cleanCadText(String(primitive.text || ''));
            if (!isPoint(pos) || !text) continue;
            const align = resolveTextAlign(String(primitive.horizontal_mode || ''));
            const baseline = resolveTextBaseline(String(primitive.vertical_mode || ''));
            const textHeight = Number(primitive.height || 100);
            const actualHeight = Number(primitive.actual_height || textHeight || 100);
            const widthFactor = Number(primitive.width_factor || 1);
            const oblique = Number(primitive.oblique || 0);
            const mirroredX = Boolean(primitive.mirrored_x);
            const mirroredY = Boolean(primitive.mirrored_y);
            const textFontKind = firstNonEmptyString([String(primitive.font_kind ?? ''), String(geom.font_kind ?? '')]);
            const cadFontFamily = resolveCadTextFontFamily(primitive.font_key, primitive.font_family, primitive.font_name);
            queueTextDraw({
              text,
              anchor: pos,
              color: strokeColor,
              rotation: Number(primitive.rotation || 0),
              actualHeight,
              widthFactor,
              oblique,
              mirroredX,
              mirroredY,
              align,
              baseline,
              isMText: Boolean(primitive.is_mtext),
              textMask: Boolean(primitive.text_mask),
              textMaskPadding: Number(primitive.text_mask_padding),
              subtype: String(primitive.subtype || ''),
              fontFamily: cadFontFamily,
              lightweightMode: isShxFallbackText(shxRenderStatus, textFontKind),
            });
            continue;
          }
          if (primitive.kind === 'point') {
            if (!isPoint(primitive.position)) continue;
            const p = worldToScreen(primitive.position);
            const markerPx = Math.max(2, Math.min(8, Number(primitive.display_size || 6)));
            gctx.beginPath();
            gctx.arc(p.x, p.y, markerPx * 0.35, 0, Math.PI * 2);
            gctx.fillStyle = strokeColor;
            gctx.fill();
            gctx.beginPath();
            gctx.moveTo(p.x - markerPx, p.y);
            gctx.lineTo(p.x + markerPx, p.y);
            gctx.moveTo(p.x, p.y - markerPx);
            gctx.lineTo(p.x, p.y + markerPx);
            gctx.stroke();
          }
        }
      }

      wipeoutDrawQueue.forEach((draw) => draw());
      textDrawQueue.forEach((draw) => draw());

      if (selectedLine) {
        octx.strokeStyle = '#22d3ee';
        octx.lineWidth = 3;
        const s = worldToScreen(selectedLine.start);
        const e = worldToScreen(selectedLine.end);
        octx.beginPath();
        octx.moveTo(s.x, s.y);
        octx.lineTo(e.x, e.y);
        octx.stroke();
      }

      if (selectedBlockBBox) {
        const p1 = worldToScreen({ x: selectedBlockBBox.min.x, y: selectedBlockBBox.min.y, z: 0 });
        const p2 = worldToScreen({ x: selectedBlockBBox.max.x, y: selectedBlockBBox.max.y, z: 0 });
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        octx.save();
        octx.strokeStyle = '#22d3ee';
        octx.lineWidth = 2;
        octx.setLineDash([6, 4]);
        octx.strokeRect(x, y, Math.max(1, w), Math.max(1, h));
        octx.restore();
      }

      if (measurePoints.length > 0) {
        for (let i = 0; i < measurePoints.length; i += 1) {
          const p = worldToScreen(measurePoints[i]);
          octx.beginPath();
          octx.fillStyle = i === 0 ? '#22d3ee' : '#f59e0b';
          octx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          octx.fill();
        }
      }

      if (measurePoints.length === 2) {
        const p1 = worldToScreen(measurePoints[0]);
        const p2 = worldToScreen(measurePoints[1]);
        octx.strokeStyle = '#f59e0b';
        octx.lineWidth = 2;
        octx.beginPath();
        octx.moveTo(p1.x, p1.y);
        octx.lineTo(p2.x, p2.y);
        octx.stroke();
      }

      if (mode === 'measure' && snapEnabled && snapCandidatePoint) {
        const sp = worldToScreen(snapCandidatePoint);
        const modeLabel = snapModeToCn(snapCandidateMode);
        octx.save();
        octx.strokeStyle = '#67e8f9';
        octx.fillStyle = 'rgba(6,182,212,0.18)';
        octx.lineWidth = 1.3;
        octx.beginPath();
        octx.rect(sp.x - 5, sp.y - 5, 10, 10);
        octx.fill();
        octx.stroke();
        octx.beginPath();
        octx.moveTo(sp.x - 8, sp.y);
        octx.lineTo(sp.x + 8, sp.y);
        octx.moveTo(sp.x, sp.y - 8);
        octx.lineTo(sp.x, sp.y + 8);
        octx.stroke();
        octx.font = '11px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
        octx.textAlign = 'left';
        octx.textBaseline = 'bottom';
        octx.strokeStyle = 'rgba(2,6,23,0.96)';
        octx.lineWidth = 3;
        octx.strokeText(`捕捉: ${modeLabel}`, sp.x + 8, sp.y - 8);
        octx.fillStyle = '#a5f3fc';
        octx.fillText(`捕捉: ${modeLabel}`, sp.x + 8, sp.y - 8);
        octx.restore();
      }

      if (mode === 'select' && boxSelectStart && boxSelectCurrent) {
        const x = Math.min(boxSelectStart.x, boxSelectCurrent.x);
        const y = Math.min(boxSelectStart.y, boxSelectCurrent.y);
        const w = Math.abs(boxSelectCurrent.x - boxSelectStart.x);
        const h = Math.abs(boxSelectCurrent.y - boxSelectStart.y);
        const windowMode = boxSelectCurrent.x >= boxSelectStart.x;
        octx.save();
        octx.lineWidth = 1;
        octx.setLineDash(windowMode ? [] : [6, 4]);
        octx.strokeStyle = windowMode ? '#3b82f6' : '#22c55e';
        octx.fillStyle = windowMode ? 'rgba(59,130,246,0.12)' : 'rgba(34,197,94,0.10)';
        octx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
        octx.strokeRect(x, y, Math.max(1, w), Math.max(1, h));
        octx.restore();
      }

      if (mode === 'select' && cursorScreen && !isPanning) {
        const half = PICK_BOX_SIZE_PX * 0.5;
        octx.save();
        octx.strokeStyle = '#22d3ee';
        octx.lineWidth = 1;
        octx.strokeRect(cursorScreen.x - half, cursorScreen.y - half, PICK_BOX_SIZE_PX, PICK_BOX_SIZE_PX);
        octx.beginPath();
        octx.moveTo(cursorScreen.x - 3, cursorScreen.y);
        octx.lineTo(cursorScreen.x + 3, cursorScreen.y);
        octx.moveTo(cursorScreen.x, cursorScreen.y - 3);
        octx.lineTo(cursorScreen.x, cursorScreen.y + 3);
        octx.stroke();
        octx.restore();
      }
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [
    canvasMetrics.dpr,
    canvasMetrics.height,
    canvasMetrics.width,
    entities,
    measurePoints,
    selectedLine,
    selectedBlockBBox,
    worldToScreen,
    worldViewBounds,
    zoom,
    showNormalLineweight,
    mode,
    snapEnabled,
    snapCandidatePoint,
    snapCandidateMode,
    boxSelectStart,
    boxSelectCurrent,
    cursorScreen,
    isPanning,
    isEntityVisible,
    resolveCadTextFontFamily,
    shxRenderStatus,
  ]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">CAD 查看器</span>
          {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
          <span className="text-xs text-blue-300">模式: {backendMode}</span>
          {shxStatusBadge && <span className={`rounded border px-1.5 py-0.5 text-[11px] ${shxStatusBadge.className}`}>{shxStatusBadge.label}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${mode === 'select' ? 'text-cyan-300' : 'text-gray-400'}`}
            onClick={() => {
              setMode('select');
              setMeasurePoints([]);
              setMeasureValue('');
            }}
            title="选择"
          >
            <Crosshair className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${mode === 'measure' ? 'text-amber-300' : 'text-gray-400'}`}
            onClick={() => {
              setMode('measure');
              clearSelection();
            }}
            title="测量"
          >
            <Ruler className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400"
            onClick={focusExtents}
            title="全图"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-gray-300" onClick={focusOrigin} title="原点 (0,0)">
            O
          </Button>
          <span className="text-xs text-gray-400 px-1">{selectionScopeLabel}</span>
          {selectionScope === 'entity' && (
            <Button variant="ghost" size="sm" className="h-8 text-amber-300" onClick={exitBlockInternalSelection} title="退出块内选择">
              退出块内
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-gray-300"
            onClick={() => setShowTreeSidebar((v) => !v)}
            title={showTreeSidebar ? '隐藏元素树' : '显示元素树'}
          >
            {showTreeSidebar ? '隐藏元素树' : '元素树'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-gray-300"
            onClick={() => setShowPropertySidebar((v) => !v)}
            title={showPropertySidebar ? '隐藏属性栏' : '显示属性栏'}
          >
            {showPropertySidebar ? '隐藏属性' : '属性栏'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 ${showNormalLineweight ? 'text-cyan-300' : 'text-gray-300'}`}
            onClick={() => setShowNormalLineweight((v) => !v)}
            title={showNormalLineweight ? '已开启普通线宽(固定像素)' : '已关闭普通线宽(固定像素)'}
          >
            {showNormalLineweight ? '普通线宽:开' : '普通线宽:关'}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-gray-850 border-b border-gray-800">
        <span className="text-xs text-gray-400">空间</span>
        <select
          value={activeSpace}
          onChange={(e) => switchSpace(e.target.value)}
          className="bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700"
          disabled={!docId}
        >
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.display_name}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500 ml-2">缩放 {zoom.toFixed(4)}x</span>
        <span className="text-xs text-gray-500 ml-2">线宽模式: {showNormalLineweight ? 'CAD线宽(固定像素)' : '统一细线'}</span>
        <span className="text-xs text-gray-500 ml-2">左键点击拾取/框选 | 中键拖拽平移 | 中键双击全图</span>
        {cursorWorld && (
          <span className="text-xs text-gray-500 ml-2">
            光标 ({formatNumber(cursorWorld.x, 2)}, {formatNumber(cursorWorld.y, 2)})
          </span>
        )}
        <span className="text-xs text-gray-500 ml-2">
          图元 {entities.length}
          {entityTotal > entities.length ? ` / ${entityTotal}` : ''}
        </span>
        <span className="text-xs text-gray-500 ml-2">已选{selectedCount}</span>
        {boxSelectPreview && (
          <span className="text-xs text-cyan-300 ml-2">
            框选{boxSelectPreview.windowMode ? '窗口' : '交叉'} / {boxSelectModifierLabel} / 候选{boxSelectPreview.count}
          </span>
        )}
        <span className="text-xs text-gray-500 ml-2">
          树: 图元 {hierarchyEntityTotal} / 块{hierarchyBlockTotal}
        </span>
        <span className="text-xs text-gray-500 ml-2">
          字体 {docFontSummary.available}/{docFontSummary.total}
          {docFontSummary.shx > 0 ? ` · SHX ${docFontSummary.shx}` : ''}
        </span>
        {shxMissingOriginalFontNames.length > 0 && (
          <span
            className="text-xs text-amber-300 ml-2"
            title={`未命中原始 SHX 字体：${shxMissingOriginalFontNames.join('、')}`}
          >
            未命中SHX {shxMissingOriginalFontNames.slice(0, 2).join('、')}
            {shxMissingOriginalFontNames.length > 2 ? ` 等${shxMissingOriginalFontNames.length}项` : ''}
          </span>
        )}
        <span className="text-xs text-gray-500 ml-2">图层过滤: {filterSummaryLabel}</span>
        {mode === 'measure' && snapEnabled && (
          <span className="text-xs text-cyan-300 ml-2">
            捕捉: {snapCandidatePoint ? snapModeToCn(snapCandidateMode) : '无'}
          </span>
        )}
        {entityTruncated && <span className="text-xs text-amber-300 ml-2">已截断</span>}
        {measureValue && <span className="text-xs text-amber-300 ml-2">测量: {measureValue}</span>}
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className={`border-r border-gray-800 bg-gray-900 transition-all duration-200 overflow-hidden ${showTreeSidebar ? 'w-80' : 'w-0'}`}>
          <div className={`h-full text-xs text-gray-300 flex flex-col ${showTreeSidebar ? 'opacity-100' : 'opacity-0'}`}>
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-cyan-300" />
                <span className="font-medium">元素树</span>
              </div>
              <span className="text-gray-500">{activeSpace}</span>
            </div>

            <div className="px-3 py-1.5 border-b border-gray-800 text-[11px] text-gray-500">
              图元 {hierarchyEntityTotal} · 块{hierarchyBlockTotal}
            </div>

            <div className="px-3 py-2 border-b border-gray-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">图层过滤</span>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    layerFilterEnabled ? 'border-cyan-600 text-cyan-200 bg-cyan-900/25' : 'border-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                  onClick={toggleLayerFilterEnabled}
                >
                  {layerFilterEnabled ? '已启用' : '未启用'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-0.5 rounded border border-gray-700 text-[11px] text-gray-300 hover:text-gray-100 disabled:opacity-40"
                  onClick={setLayerFilterAll}
                  disabled={!layerFilterEnabled || availableLayers.length === 0}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded border border-gray-700 text-[11px] text-gray-300 hover:text-gray-100 disabled:opacity-40"
                  onClick={clearLayerFilterSelection}
                  disabled={!layerFilterEnabled}
                >
                  清空
                </button>
                <span className="text-[11px] text-gray-500 ml-auto">{filterSummaryLabel}</span>
              </div>

              <div className="text-[11px] text-gray-500">Filter controls selection; eye controls visibility.</div>

              <div className="max-h-24 overflow-auto space-y-1 pr-1">
                {availableLayers.length === 0 ? (
                  <div className="text-[11px] text-gray-500">当前空间无图层数据</div>
                ) : (
                  availableLayers.map((layer) => {
                    const visible = !hiddenLayerNames.has(layer);
                    return (
                      <div key={`layer-filter-${layer}`} className="flex items-center gap-2 text-[11px] text-gray-300">
                        <label className="flex items-center gap-2 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-cyan-500"
                            checked={layerFilterEnabled && layerWhitelist.has(layer)}
                            disabled={!layerFilterEnabled}
                            onChange={() => toggleLayerInWhitelist(layer)}
                          />
                          <span className={`truncate ${visible ? '' : 'text-gray-500 line-through'}`}>{layer}</span>
                        </label>
                        <button
                          type="button"
                          className={`h-5 w-5 inline-flex items-center justify-center ${
                            visible ? 'text-cyan-300 hover:text-cyan-100' : 'text-gray-500 hover:text-gray-300'
                          }`}
                          title={visible ? 'Hide layer' : 'Show layer'}
                          onClick={() => toggleLayerVisibility(layer)}
                        >
                          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {hierarchyLoading ? (
              <div className="p-3 text-gray-500">正在加载元素树...</div>
            ) : hierarchyError ? (
              <div className="p-3 text-red-300">{hierarchyError}</div>
            ) : flattenedHierarchyRows.length === 0 ? (
              <div className="p-3 text-gray-500">当前空间暂无可展示元素。</div>
            ) : (
              <div ref={treeScrollRef} className="flex-1 overflow-auto p-2">
                <div className="relative w-full" style={{ height: `${treeVirtualizer.getTotalSize()}px` }}>
                  {treeVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = flattenedHierarchyRows[virtualRow.index];
                    if (!row) return null;
                    return (
                      <HierarchyVirtualRow
                        key={row.node.node_id}
                        row={row}
                        virtualStart={virtualRow.start}
                        onToggleNode={toggleHierarchyNode}
                        onSelectNode={handleHierarchyNodeSelect}
                        onLocateNode={handleHierarchyLocate}
                        onToggleVisibility={toggleHierarchyNodeVisibility}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div
          ref={viewportRef}
          className="flex-1 relative bg-gray-950 select-none"
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              const now = Date.now();
              if (now - lastMiddleDownAtRef.current <= 450) {
                lastMiddleDownAtRef.current = 0;
                setIsPanning(false);
                focusExtents();
                return;
              }
              lastMiddleDownAtRef.current = now;
              setIsPanning(true);
              setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
              return;
            }

            if (e.button !== 0) return;
            if (mode !== 'select' || loading) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            setBoxSelectModifier(boxSelectModifierFromEvent(e));
            setBoxSelectStart({ x: sx, y: sy });
            setBoxSelectCurrent({ x: sx, y: sy });
            setIsBoxSelecting(false);
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            setCursorWorld(screenToWorld(sx, sy));
            setCursorScreen({ x: sx, y: sy });
            if (isPanning) {
              setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
              return;
            }

            if (mode !== 'select' || !boxSelectStart) return;
            if ((e.buttons & 1) !== 1) return;
            setBoxSelectModifier(boxSelectModifierFromEvent(e));
            const next = { x: sx, y: sy };
            setBoxSelectCurrent(next);
            const dx = next.x - boxSelectStart.x;
            const dy = next.y - boxSelectStart.y;
            if (!isBoxSelecting && Math.hypot(dx, dy) >= BOX_SELECT_DRAG_THRESHOLD_PX) {
              setIsBoxSelecting(true);
            }
          }}
          onMouseUp={(e) => {
            if (e.button === 1) {
              setIsPanning(false);
              return;
            }
            if (e.button !== 0) return;
            if (!boxSelectStart) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const releasePoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const end = boxSelectCurrent || releasePoint;
            const dx = end.x - boxSelectStart.x;
            const dy = end.y - boxSelectStart.y;
            const dragged = isBoxSelecting || Math.hypot(dx, dy) >= BOX_SELECT_DRAG_THRESHOLD_PX;

            setIsBoxSelecting(false);
            setBoxSelectStart(null);
            setBoxSelectCurrent(null);
            const finalModifier = boxSelectModifierFromEvent(e);
            setBoxSelectModifier('replace');

            if (!dragged || mode !== 'select') return;
            suppressClickAfterBoxRef.current = true;
            void handleBoxSelect(boxSelectStart, end, finalModifier);
          }}
          onMouseLeave={() => {
            setIsPanning(false);
            setIsBoxSelecting(false);
            setBoxSelectStart(null);
            setBoxSelectCurrent(null);
            setBoxSelectModifier('replace');
            setCursorWorld(null);
            setCursorScreen(null);
            setSnapCandidatePoint(null);
            setSnapCandidateMode(null);
          }}
          onWheel={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const worldX = (sx - screenCenter.x - pan.x) / zoom;
            const worldY = -(sy - screenCenter.y - pan.y) / zoom;
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const nextZoom = Math.max(1e-5, Math.min(20000, zoom * factor));
            setZoom(nextZoom);
            setPan({
              x: sx - screenCenter.x - worldX * nextZoom,
              y: sy - screenCenter.y + worldY * nextZoom,
            });
          }}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
        >
          <canvas ref={geometryCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 bg-gray-950/70">
              正在加载 DWG 会话...
            </div>
          )}
        </div>

        <aside className={`border-l border-gray-800 bg-gray-900 transition-all duration-200 overflow-hidden ${showPropertySidebar ? 'w-80' : 'w-0'}`}>
          <div className={`h-full text-xs text-gray-300 flex flex-col ${showPropertySidebar ? 'opacity-100' : 'opacity-0'}`}>
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hand className="h-3.5 w-3.5 text-cyan-300" />
                <span className="font-medium">属性</span>
              </div>
              <span className="text-gray-500">{selectedCadHandle}</span>
            </div>

            {selectedCount === 0 ? (
              <div className="p-3 text-gray-500">点击图元后在此显示属性。</div>
            ) : (
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {selectedPropertySections.map((section) => (
                  <details key={section.id} open={section.defaultOpen} className="rounded border border-gray-800 bg-gray-950/35">
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-gray-300 hover:text-gray-100 flex items-center justify-between">
                      <span>{section.title}</span>
                      <span className="text-[10px] text-gray-500">{section.rows.length}</span>
                    </summary>
                    <div className="px-2 pb-2 pt-1">
                      {section.rows.length === 0 ? (
                        <div className="text-[11px] text-gray-600">无</div>
                      ) : (
                        <div className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1">
                          {section.rows.map((row, idx) => (
                            <div key={`${section.id}-${row.key}-${idx}`} className="contents">
                              <span className="text-gray-500">{row.key}</span>
                              <span className="text-gray-200 break-all">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
                {selectedLine && (
                  <p className="text-gray-400">
                    线段: ({formatNumber(selectedLine.start.x)}, {formatNumber(selectedLine.start.y)}) - ({formatNumber(selectedLine.end.x)},{' '}
                    {formatNumber(selectedLine.end.y)})
                  </p>
                )}
                <details className="mt-1">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300">原始 JSON</summary>
                  <pre className="mt-1 max-h-56 overflow-auto rounded bg-gray-950/70 p-2 text-[11px] leading-4 text-gray-300">
                    {JSON.stringify(selectedJsonPreview, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </aside>
      </div>

      {warningLines.length > 0 && (
        <div className="px-3 py-2 bg-amber-900/20 border-t border-amber-800 text-amber-300 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-amber-200">警告 {warningLines.length} 条</p>
                {canToggleWarnings && (
                  <button
                    type="button"
                    onClick={() => setWarningsExpanded((prev) => !prev)}
                    className="shrink-0 rounded border border-amber-600/80 bg-amber-950/40 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/45"
                  >
                    {warningsExpanded ? '收起' : '展开'}
                  </button>
                )}
              </div>
              {warningsExpanded && shxDebugMatch && (
                <details className="rounded border border-cyan-700/70 bg-slate-950/60 px-2 py-1.5 text-cyan-100">
                  <summary className="cursor-pointer font-semibold text-cyan-200">SHX 匹配诊断（调试）</summary>
                  <div className="mt-1.5 space-y-1 text-[11px] leading-5">
                    <p>
                      向量文本 {shxDebugMatch.vectorizeTextEntityCount} / 键{shxDebugMatch.vectorizeTextKeysCount} / 图元{' '}
                      {shxDebugMatch.vectorizePrimitivesTotal}
                      {shxDebugMatch.vectorizeCacheHit ? ' / 缓存命中' : ' / 实时解析'}
                    </p>
                    <p>
                      候选实体{shxDebugMatch.attachCandidateEntityCount} / 匹配成功 {shxDebugMatch.matchedEntityCount} / 匹配失败{' '}
                      {shxDebugMatch.unmatchedEntityCount}
                    </p>
                    <p>
                      失败分类: 无轮廓{shxDebugMatch.noVectorizePayloadCount} · 键不一致{shxDebugMatch.keyMismatchCount} ·
                      字体过滤 {shxDebugMatch.filteredByFontKindCount} · 优化后空 {shxDebugMatch.emptyAfterOptimizeCount}
                    </p>
                    {shxDebugMatch.vectorizeError && <p>向量化错误 {shxDebugMatch.vectorizeError}</p>}
                    {shxDebugMatch.unmatchedKeySamples.length > 0 && (
                      <p>未匹配实体键样本: {shxDebugMatch.unmatchedKeySamples.slice(0, 8).join('、')}</p>
                    )}
                    {shxDebugMatch.orphanVectorizeKeySamples.length > 0 && (
                      <p>孤立向量键样本: {shxDebugMatch.orphanVectorizeKeySamples.slice(0, 8).join('、')}</p>
                    )}
                  </div>
                </details>
              )}
              {warningsExpanded &&
                warningLines.map((line) => {
                const missingFont = parseMissingFontWarningForUi(line.text);
                if (line.kind === 'shx_diagnostic' && !missingFont) {
                  return (
                    <div key={line.id} className="rounded border border-amber-600/70 bg-amber-950/45 px-2 py-1.5 text-amber-100">
                      <p className="font-semibold text-amber-200">SHX 字体诊断</p>
                      <p className="leading-5">{line.text}</p>
                    </div>
                  );
                }
                if (!missingFont) {
                  return <p key={line.id}>{line.text}</p>;
                }
                return (
                  <div key={line.id} className="rounded border border-amber-600/70 bg-amber-950/45 px-2 py-1.5 text-amber-100">
                    <p className="font-semibold text-amber-200">{missingFont.title}</p>
                    {missingFont.items.length > 0 ? (
                      missingFont.items.map((item, idx) => (
                        <p key={`${line.id}-item-${idx}`} className="leading-5">
                          {item}
                        </p>
                      ))
                    ) : (
                      <p className="leading-5">{line.text}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {error && <div className="px-3 py-2 bg-red-900/20 border-t border-red-800 text-red-300 text-xs">{error}</div>}
    </div>
  );
}
