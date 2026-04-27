import { useMemo } from 'react';
import type { RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Eye, EyeOff, LocateFixed, PanelLeftClose } from 'lucide-react';
import type { DwgHierarchyNode } from '@/services/dwgApi';
import { collectNodeEntityIds, flattenHierarchy, normalizeLayerName } from '../cadUiUtils';

interface CadSidebarProps {
  nodes: DwgHierarchyNode[];
  expandedIds: Set<string>;
  selectedEntityId: string | null;
  hiddenLayerNames: Set<string>;
  hiddenEntityIds: Set<string>;
  layers: string[];
  treeScrollRef: RefObject<HTMLDivElement | null>;
  onToggleLayer: (layer: string) => void;
  onToggleNodeExpanded: (nodeId: string) => void;
  onSelectEntity: (entityId: string) => void;
  onFocusBbox: (bbox: DwgHierarchyNode['bbox']) => void;
  onToggleEntity: (entityId: string) => void;
  onToggleNodeEntities: (nodeId: string, entityIds: string[]) => void;
  onCollapse: () => void;
}

function nodeVisibility(node: DwgHierarchyNode, hiddenEntityIds: Set<string>, nodeEntityIdsMap: Map<string, string[]>): boolean {
  if (node.entity_id) {
    return !hiddenEntityIds.has(node.entity_id);
  }

  const groupEntityIds = nodeEntityIdsMap.get(node.node_id) ?? [];
  if (groupEntityIds.length === 0) return true;
  return groupEntityIds.some((entityId) => !hiddenEntityIds.has(entityId));
}

export function CadSidebar(props: CadSidebarProps) {
  const {
    nodes,
    expandedIds,
    selectedEntityId,
    hiddenLayerNames,
    hiddenEntityIds,
    layers,
    treeScrollRef,
    onToggleLayer,
    onToggleNodeExpanded,
    onSelectEntity,
    onFocusBbox,
    onToggleEntity,
    onToggleNodeEntities,
    onCollapse,
  } = props;

  const rows = useMemo(() => flattenHierarchy(nodes, expandedIds), [expandedIds, nodes]);
  const nodeEntityIdsMap = useMemo(() => collectNodeEntityIds(nodes), [nodes]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => treeScrollRef.current,
    estimateSize: () => 30,
    overscan: 8,
  });

  return (
    <aside className="w-80 h-full min-h-0 border-r border-gray-800 bg-gray-900 p-2 text-xs flex flex-col">
      <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>Layers</span>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-gray-100"
          onClick={onCollapse}
          title="Collapse left sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 max-h-40 space-y-1 overflow-auto">
        {layers.map((layer) => {
          const visible = !hiddenLayerNames.has(layer);
          return (
            <div key={layer} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-800">
              <span className={`min-w-0 flex-1 break-all ${visible ? 'text-gray-200' : 'text-gray-500 line-through'}`}>{layer}</span>
              <button
                type="button"
                className={`inline-flex h-5 w-5 items-center justify-center ${visible ? 'text-cyan-300' : 'text-gray-500'}`}
                onClick={() => onToggleLayer(layer)}
                title={visible ? 'Hide layer' : 'Show layer'}
              >
                {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mb-2 text-[11px] text-gray-400">Hierarchy ({rows.length})</div>
      <div ref={treeScrollRef} className="relative flex-1 min-h-0 overflow-auto rounded border border-gray-800 bg-gray-950/70">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            const entityId = row.node.entity_id || null;
            const visible = nodeVisibility(row.node, hiddenEntityIds, nodeEntityIdsMap);
            const rowLayerVisible = !hiddenLayerNames.has(normalizeLayerName(row.node.layer));

            return (
              <div
                key={`${row.node.node_id}-${virtualItem.key}`}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <div
                  className={`mx-1 flex items-center gap-1 rounded px-2 py-1 ${
                    entityId === selectedEntityId ? 'bg-cyan-900/40 text-cyan-100' : 'text-gray-200 hover:bg-gray-800'
                  }`}
                  style={{ paddingLeft: `${8 + row.depth * 14}px` }}
                  onClick={() => {
                    if (!entityId && row.hasChildren) {
                      onToggleNodeExpanded(row.node.node_id);
                      return;
                    }
                    if (!entityId) return;
                    onSelectEntity(entityId);
                    if (row.node.bbox) onFocusBbox(row.node.bbox);
                  }}
                >
                  {row.hasChildren ? (
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center text-gray-400"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleNodeExpanded(row.node.node_id);
                      }}
                    >
                      {row.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span className="inline-block h-4 w-4" />
                  )}

                  <span className={`min-w-0 flex-1 break-all ${rowLayerVisible ? '' : 'text-gray-500 line-through'}`} title={row.node.label}>
                    {row.node.label}
                  </span>

                  <button
                    type="button"
                    className={`inline-flex h-5 w-5 items-center justify-center ${visible ? 'text-cyan-300' : 'text-gray-500'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (entityId) {
                        onToggleEntity(entityId);
                        return;
                      }
                      const entityIds = nodeEntityIdsMap.get(row.node.node_id) ?? [];
                      if (entityIds.length === 0) return;
                      onToggleNodeEntities(row.node.node_id, entityIds);
                    }}
                    title={visible ? 'Hide' : 'Show'}
                  >
                    {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>

                  {row.node.bbox && (
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center text-emerald-300"
                      onClick={(event) => {
                        event.stopPropagation();
                        onFocusBbox(row.node.bbox);
                      }}
                      title="Locate"
                    >
                      <LocateFixed className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
