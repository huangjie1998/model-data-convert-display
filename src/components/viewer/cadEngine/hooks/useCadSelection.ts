import { useCallback, useEffect, useState } from 'react';
import {
  getDwgEntity,
  pickDwgEntity,
} from '@/services/dwgApi';
import { isFiniteNumber } from '../cadUiUtils';
import type { UseCadSelectionInput, UseCadSelectionResult } from './contracts';

export function useCadSelection(input: UseCadSelectionInput): UseCadSelectionResult {
  const { docId, docIdRef, currentSpace, entityById, engineRef, viewportRef, didDragRef, focusBbox } = input;

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityRecord, setSelectedEntityRecord] = useState<Record<string, unknown> | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedEntityRecord(null);
  }, []);

  useEffect(() => {
    if (!docId || !selectedEntityId) {
      return;
    }

    void getDwgEntity(docId, selectedEntityId)
      .then((response) => setSelectedEntityRecord((response.entity as Record<string, unknown>) ?? null))
      .catch(() => setSelectedEntityRecord(null));
  }, [docId, selectedEntityId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onClick = async (event: MouseEvent) => {
      const activeDocId = docIdRef.current;
      if (!activeDocId) return;
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }

      const camera = engineRef.current?.scene?.camera;
      if (!camera?.screenToScene) return;

      const rect = viewport.getBoundingClientRect();
      const world = camera.screenToScene({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      if (!world) return;
      const zoom = isFiniteNumber(camera.zoom) ? camera.zoom : 1;

      try {
        const picked = await pickDwgEntity(activeDocId, {
          space_id: currentSpace,
          point: { x: world.x, y: world.y, z: 0 },
          tolerance: Math.max(1e-3, 20 / Math.max(zoom, 1e-3)),
          selection_scope: 'entity',
        });

        const first = picked.picked?.[0];
        if (!first?.entity_id) return;

        setSelectedEntityId(first.entity_id);
        const hit = entityById.get(first.entity_id);
        if (hit?.bbox) {
          focusBbox({ min: hit.bbox.min, max: hit.bbox.max });
        }
      } catch {
        // ignore picking errors
      }
    };

    viewport.addEventListener('click', onClick);
    return () => {
      viewport.removeEventListener('click', onClick);
    };
  }, [currentSpace, didDragRef, docIdRef, engineRef, entityById, focusBbox, viewportRef]);

  return {
    selectedEntityId,
    selectedEntityRecord,
    setSelectedEntityId,
    clearSelection,
  };
}
