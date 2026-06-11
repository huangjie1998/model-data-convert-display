import { useCallback, useRef, useState } from 'react';
import type { OverlayTextItem } from '../dwgToGlx';
import type { UseCadViewStateInput, UseCadViewStateResult } from './contracts';

export function useCadViewState(input: UseCadViewStateInput = {}): UseCadViewStateResult {
  const {
    initialLeftSidebarCollapsed = false,
    initialRightSidebarCollapsed = false,
  } = input;

  const [hiddenLayerNames, setHiddenLayerNames] = useState<Set<string>>(new Set());
  const [hiddenEntityIds, setHiddenEntityIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [overlayTexts, setOverlayTexts] = useState<OverlayTextItem[]>([]);

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(initialLeftSidebarCollapsed);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(initialRightSidebarCollapsed);

  const layerDebounceRef = useRef<number | null>(null);
  const pendingLayerRef = useRef<string | null>(null);

  const resetHiddenLayerNames = useCallback(() => {
    if (layerDebounceRef.current != null && typeof window !== 'undefined') {
      window.clearTimeout(layerDebounceRef.current);
      layerDebounceRef.current = null;
    }
    pendingLayerRef.current = null;
    setHiddenLayerNames(new Set());
  }, []);

  const resetHiddenEntityIds = useCallback(() => {
    setHiddenEntityIds(new Set());
  }, []);

  const toggleLayer = useCallback((layer: string) => {
    // Debounce rapid consecutive layer toggles (50ms) so the CAD engine
    // receives a single batch of layer-visibility changes instead of one per click.
    if (typeof window === 'undefined') {
      setHiddenLayerNames((prev) => {
        const next = new Set(prev);
        if (next.has(layer)) { next.delete(layer); } else { next.add(layer); }
        return next;
      });
      return;
    }
    pendingLayerRef.current = layer;
    if (layerDebounceRef.current != null) {
      window.clearTimeout(layerDebounceRef.current);
    }
    layerDebounceRef.current = window.setTimeout(() => {
      layerDebounceRef.current = null;
      const pending = pendingLayerRef.current;
      pendingLayerRef.current = null;
      if (pending != null) {
        setHiddenLayerNames((prev) => {
          const next = new Set(prev);
          if (next.has(pending)) { next.delete(pending); } else { next.add(pending); }
          return next;
        });
      }
    }, 50);
  }, []);

  const toggleEntityVisibility = useCallback((entityId: string) => {
    setHiddenEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  }, []);

  const toggleNodeEntityVisibility = useCallback((_: string, entityIds: string[]) => {
    if (entityIds.length === 0) return;

    setHiddenEntityIds((prev) => {
      const next = new Set(prev);
      const allHidden = entityIds.every((entityId) => next.has(entityId));
      for (const entityId of entityIds) {
        if (allHidden) {
          next.delete(entityId);
        } else {
          next.add(entityId);
        }
      }
      return next;
    });
  }, []);

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  return {
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
  };
}
