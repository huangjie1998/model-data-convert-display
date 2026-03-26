import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crosshair, Hand, Layers, Ruler, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  closeDwgDocument,
  getDwgEntity,
  listDwgEntities,
  listDwgSpaces,
  measureDwg,
  openDwgDocument,
  pickDwgEntity,
  snapDwgPoint,
  updateDwgView,
  type DwgEntityLite,
  type DwgSpace,
} from '@/services/dwgApi';

interface CADViewerProps {
  rawFile: File | null;
  fileName?: string;
}

type ViewerMode = 'select' | 'measure';

interface WorldPoint {
  x: number;
  y: number;
  z?: number;
}

function formatNumber(v: number | undefined, digits = 3): string {
  if (v === undefined || Number.isNaN(v)) return '--';
  return v.toFixed(digits);
}

function isPoint(value: unknown): value is WorldPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.x === 'number' && typeof p.y === 'number';
}

function computeEntitiesBounds(entities: DwgEntityLite[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  const includePoint = (p: WorldPoint) => {
    found = true;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const entity of entities) {
    if (entity.bbox?.min && entity.bbox?.max) {
      includePoint({ x: Number(entity.bbox.min.x), y: Number(entity.bbox.min.y), z: Number(entity.bbox.min.z || 0) });
      includePoint({ x: Number(entity.bbox.max.x), y: Number(entity.bbox.max.y), z: Number(entity.bbox.max.z || 0) });
      continue;
    }

    const geom = entity.geom || {};
    if (entity.type === 'LINE') {
      const start = (geom as any).start;
      const end = (geom as any).end;
      if (isPoint(start)) includePoint(start);
      if (isPoint(end)) includePoint(end);
    } else if (entity.type === 'POLYLINE') {
      const vertices = (geom as any).vertices;
      if (Array.isArray(vertices)) {
        vertices.forEach((v) => {
          if (isPoint(v)) includePoint(v);
        });
      }
    } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      const center = (geom as any).center;
      const radius = Number((geom as any).radius);
      if (isPoint(center) && Number.isFinite(radius)) {
        includePoint({ x: center.x - radius, y: center.y - radius, z: center.z || 0 });
        includePoint({ x: center.x + radius, y: center.y + radius, z: center.z || 0 });
      }
    }
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

export function CADViewer({ rawFile, fileName }: CADViewerProps) {
  const [docId, setDocId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<DwgSpace[]>([]);
  const [activeSpace, setActiveSpace] = useState<string>('model');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [backendMode, setBackendMode] = useState<string>('unknown');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewerMode>('select');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [measurePoints, setMeasurePoints] = useState<WorldPoint[]>([]);
  const [measureValue, setMeasureValue] = useState<string>('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Record<string, unknown> | null>(null);
  const [entities, setEntities] = useState<DwgEntityLite[]>([]);
  const [entityTotal, setEntityTotal] = useState(0);
  const [entityTruncated, setEntityTruncated] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const screenCenter = useMemo(() => {
    const width = viewportRef.current?.clientWidth || 1;
    const height = viewportRef.current?.clientHeight || 1;
    return { x: width * 0.5, y: height * 0.5 };
  }, [viewportRef.current?.clientWidth, viewportRef.current?.clientHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const screenToWorld = useCallback(
    (sx: number, sy: number): WorldPoint => {
      const x = (sx - screenCenter.x - pan.x) / zoom;
      const y = -(sy - screenCenter.y - pan.y) / zoom;
      return { x, y, z: 0 };
    },
    [screenCenter.x, screenCenter.y, pan.x, pan.y, zoom]
  );

  const worldToScreen = useCallback(
    (p: WorldPoint) => {
      return {
        x: p.x * zoom + pan.x + screenCenter.x,
        y: -p.y * zoom + pan.y + screenCenter.y,
      };
    },
    [zoom, pan.x, pan.y, screenCenter.x, screenCenter.y]
  );

  const fitViewToEntities = useCallback((nextEntities: DwgEntityLite[]) => {
    const bounds = computeEntitiesBounds(nextEntities);
    if (!bounds || !viewportRef.current) return;

    const width = viewportRef.current.clientWidth || 1;
    const height = viewportRef.current.clientHeight || 1;
    const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
    const nextZoom = Math.max(0.05, Math.min(40, Math.min((width * 0.85) / spanX, (height * 0.85) / spanY)));

    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerY = (bounds.minY + bounds.maxY) * 0.5;
    setZoom(nextZoom);
    setPan({
      x: -centerX * nextZoom,
      y: centerY * nextZoom,
    });
  }, []);

  const loadSpaceEntities = useCallback(
    async (nextDocId: string, nextSpaceId: string, fitView = false) => {
      const res = await listDwgEntities(nextDocId, nextSpaceId, 6000);
      const nextEntities = res.entities || [];
      setEntities(nextEntities);
      setEntityTotal(typeof res.total_count === 'number' ? res.total_count : nextEntities.length);
      setEntityTruncated(Boolean(res.truncated));
      if (fitView) fitViewToEntities(nextEntities);
    },
    [fitViewToEntities]
  );

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      setError(null);
      setSelectedEntity(null);
      setSelectedEntityId(null);
      setMeasurePoints([]);
      setMeasureValue('');
      if (!rawFile) {
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        return;
      }
      if (!rawFile.name.toLowerCase().endsWith('.dwg')) {
        setError('Current file is not a DWG document.');
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
        return;
      }
      setLoading(true);
      try {
        const opened = await openDwgDocument(rawFile);
        if (cancelled) return;
        setDocId(opened.doc_id);
        setSpaces(opened.spaces || []);
        setActiveSpace(opened.current_space || 'model');
        setWarnings(opened.warnings || []);
        setBackendMode(opened.mode || 'unknown');
        await loadSpaceEntities(opened.doc_id, opened.current_space || 'model', true);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'Failed to open DWG document.';
        if (message.includes('only .dwg is supported for direct open')) {
          setError(
            `${message} (If the filename contains Chinese/special characters, the backend filename sanitizer may cause suffix mismatch.)`
          );
        } else {
          setError(message);
        }
        setDocId(null);
        setSpaces([]);
        setEntities([]);
        setEntityTotal(0);
        setEntityTruncated(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    open();
    return () => {
      cancelled = true;
    };
  }, [rawFile, loadSpaceEntities]);

  useEffect(() => {
    return () => {
      if (docId) closeDwgDocument(docId).catch(() => void 0);
    };
  }, [docId]);

  const switchSpace = useCallback(
    async (nextSpace: string) => {
      if (!docId) return;
      setActiveSpace(nextSpace);
      setSelectedEntity(null);
      setSelectedEntityId(null);
      setMeasurePoints([]);
      setMeasureValue('');
      try {
        await updateDwgView(docId, { space_id: nextSpace });
        const latest = await listDwgSpaces(docId);
        setSpaces(latest.spaces || []);
        await loadSpaceEntities(docId, nextSpace, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to switch space.');
      }
    },
    [docId, loadSpaceEntities]
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

  const handleCanvasClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      if (!docId || isPanning) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const worldPoint = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);

      if (mode === 'measure') {
        let pointToUse = worldPoint;
        if (snapEnabled) {
          try {
            const snapped = await snapDwgPoint(docId, {
              space_id: activeSpace,
              point: worldPoint,
              tolerance: 12 / zoom,
              modes: ['endpoint', 'midpoint', 'center'],
            });
            if (snapped.snapped && snapped.point) {
              pointToUse = snapped.point;
            }
          } catch {
            // Keep raw point when snap request fails.
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
        const picked = await pickDwgEntity(docId, {
          space_id: activeSpace,
          point: worldPoint,
          tolerance: 14 / zoom,
        });
        if (!picked.picked?.length) {
          setSelectedEntityId(null);
          setSelectedEntity(null);
          return;
        }
        const id = picked.picked[0].entity_id;
        setSelectedEntityId(id);
        const detail = await getDwgEntity(docId, id);
        setSelectedEntity(detail.entity || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'pick failed');
      }
    },
    [docId, isPanning, screenToWorld, mode, snapEnabled, activeSpace, zoom, handleMeasure]
  );

  const renderedEntities = useMemo(
    () =>
      entities.map((entity) => {
        const geom = entity.geom || {};
        if (entity.type === 'LINE') {
          const start = (geom as any).start;
          const end = (geom as any).end;
          if (!isPoint(start) || !isPoint(end)) return null;
          const s = worldToScreen(start);
          const e = worldToScreen(end);
          return <line key={`ent-${entity.id}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#94a3b8" strokeWidth={1.2} />;
        }

        if (entity.type === 'POLYLINE') {
          const vertices = (geom as any).vertices;
          if (!Array.isArray(vertices)) return null;
          const points = vertices.filter(isPoint).map((p) => worldToScreen(p));
          if (points.length < 2) return null;
          const pts = points.map((p) => `${p.x},${p.y}`).join(' ');
          return <polyline key={`ent-${entity.id}`} points={pts} fill="none" stroke="#94a3b8" strokeWidth={1.1} />;
        }

        if (entity.type === 'CIRCLE') {
          const center = (geom as any).center;
          const radius = Number((geom as any).radius);
          if (!isPoint(center) || !Number.isFinite(radius) || radius <= 0) return null;
          const c = worldToScreen(center);
          const r = Math.max(radius * zoom, 0.4);
          return <circle key={`ent-${entity.id}`} cx={c.x} cy={c.y} r={r} fill="none" stroke="#94a3b8" strokeWidth={1.1} />;
        }

        if (entity.type === 'ARC') {
          const center = (geom as any).center;
          const start = (geom as any).start;
          const end = (geom as any).end;
          if (!isPoint(center) || !isPoint(start) || !isPoint(end)) return null;
          const c = worldToScreen(center);
          const s = worldToScreen(start);
          const e = worldToScreen(end);
          const r = Math.max(Math.hypot(s.x - c.x, s.y - c.y), 0.4);

          const startAngle = Number((geom as any).start_angle);
          const endAngle = Number((geom as any).end_angle);
          let deltaDeg = 180;
          if (Number.isFinite(startAngle) && Number.isFinite(endAngle)) {
            deltaDeg = ((endAngle - startAngle) % 360 + 360) % 360;
          }
          const largeArcFlag = deltaDeg > 180 ? 1 : 0;
          const sweepFlag = 0;
          const d = `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${e.x} ${e.y}`;
          return <path key={`ent-${entity.id}`} d={d} fill="none" stroke="#94a3b8" strokeWidth={1.1} />;
        }

        return null;
      }),
    [entities, worldToScreen, zoom]
  );

  const selectedLine = useMemo(() => {
    if (!selectedEntity || selectedEntity.type !== 'LINE' || typeof selectedEntity.geom !== 'object') return null;
    const geom = selectedEntity.geom as Record<string, any>;
    if (!geom.start || !geom.end) return null;
    return {
      start: geom.start as WorldPoint,
      end: geom.end as WorldPoint,
    };
  }, [selectedEntity]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">CAD Viewer</span>
          {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
          <span className="text-xs text-blue-300">mode: {backendMode}</span>
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
            title="Select"
          >
            <Crosshair className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${mode === 'measure' ? 'text-amber-300' : 'text-gray-400'}`}
            onClick={() => {
              setMode('measure');
              setSelectedEntityId(null);
              setSelectedEntity(null);
            }}
            title="Measure"
          >
            <Ruler className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${snapEnabled ? 'text-emerald-300' : 'text-gray-400'}`}
            onClick={() => setSnapEnabled((s) => !s)}
            title="Snap"
          >
            <Layers className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400"
            onClick={() => {
              setPan({ x: 0, y: 0 });
              setZoom(1);
            }}
            title="Reset View"
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-gray-850 border-b border-gray-800">
        <span className="text-xs text-gray-400">Space</span>
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
        <span className="text-xs text-gray-500 ml-2">zoom {zoom.toFixed(2)}x</span>
        <span className="text-xs text-gray-500 ml-2">
          entities {entities.length}
          {entityTotal > entities.length ? ` / ${entityTotal}` : ''}
        </span>
        {entityTruncated && <span className="text-xs text-amber-300 ml-2">truncated</span>}
        {measureValue && <span className="text-xs text-amber-300 ml-2">measure: {measureValue}</span>}
      </div>

      <div
        ref={viewportRef}
        className="flex-1 relative bg-gray-950 select-none"
        onMouseDown={(e) => {
          if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
          }
        }}
        onMouseMove={(e) => {
          if (!isPanning) return;
          setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
        }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => setIsPanning(false)}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          setZoom((z) => Math.max(0.1, Math.min(20, z * factor)));
        }}
        onClick={handleCanvasClick}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <g>
            {Array.from({ length: 21 }).map((_, i) => {
              const worldX = (i - 10) * 50;
              const p1 = worldToScreen({ x: worldX, y: -500 });
              const p2 = worldToScreen({ x: worldX, y: 500 });
              return (
                <line
                  key={`vx-${i}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#1f2937"
                  strokeWidth={1}
                />
              );
            })}
            {Array.from({ length: 21 }).map((_, i) => {
              const worldY = (i - 10) * 50;
              const p1 = worldToScreen({ x: -500, y: worldY });
              const p2 = worldToScreen({ x: 500, y: worldY });
              return (
                <line
                  key={`hy-${i}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#1f2937"
                  strokeWidth={1}
                />
              );
            })}
          </g>

          <g>{renderedEntities}</g>

          {selectedLine && (
            <line
              x1={worldToScreen(selectedLine.start).x}
              y1={worldToScreen(selectedLine.start).y}
              x2={worldToScreen(selectedLine.end).x}
              y2={worldToScreen(selectedLine.end).y}
              stroke="#22d3ee"
              strokeWidth={3}
            />
          )}

          {measurePoints.map((p, idx) => {
            const screen = worldToScreen(p);
            return (
              <circle
                key={`m-${idx}`}
                cx={screen.x}
                cy={screen.y}
                r={5}
                fill={idx === 0 ? '#22d3ee' : '#f59e0b'}
              />
            );
          })}

          {measurePoints.length === 2 && (
            <line
              x1={worldToScreen(measurePoints[0]).x}
              y1={worldToScreen(measurePoints[0]).y}
              x2={worldToScreen(measurePoints[1]).x}
              y2={worldToScreen(measurePoints[1]).y}
              stroke="#f59e0b"
              strokeWidth={2}
            />
          )}
        </svg>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 bg-gray-950/70">
            Loading DWG session...
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="px-3 py-2 bg-amber-900/20 border-t border-amber-800 text-amber-300 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <p key={`w-${i}`}>{w}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedEntity && (
        <div className="px-3 py-2 bg-gray-850 border-t border-gray-800 text-xs text-gray-300">
          <div className="flex items-center gap-2 mb-1">
            <Hand className="h-3.5 w-3.5 text-cyan-300" />
            <span className="font-medium">Selected Entity</span>
            <span className="text-gray-500">{selectedEntityId}</span>
          </div>
          <p>type: {String(selectedEntity.type || '--')}</p>
          <p>layer: {String(selectedEntity.layer || '--')}</p>
          {selectedLine && (
            <p>
              line: ({formatNumber(selectedLine.start.x)}, {formatNumber(selectedLine.start.y)}) - (
              {formatNumber(selectedLine.end.x)}, {formatNumber(selectedLine.end.y)})
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 bg-red-900/20 border-t border-red-800 text-red-300 text-xs">{error}</div>
      )}
    </div>
  );
}
