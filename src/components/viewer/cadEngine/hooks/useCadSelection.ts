import { useCallback, useEffect, useState } from 'react';
import {
  getDwgEntity,
  pickDwgEntity,
  type DwgEntityLite,
} from '@/services/dwgApi';
import { isFiniteNumber } from '../cadUiUtils';
import type { UseCadSelectionInput, UseCadSelectionResult } from './contracts';

function distanceToEntityBbox(point: { x: number; y: number }, entity: DwgEntityLite): number {
  const bbox = entity.bbox;
  if (!bbox) return Number.POSITIVE_INFINITY;
  const minX = Math.min(bbox.min.x, bbox.max.x);
  const maxX = Math.max(bbox.min.x, bbox.max.x);
  const minY = Math.min(bbox.min.y, bbox.max.y);
  const maxY = Math.max(bbox.min.y, bbox.max.y);
  const dx = point.x < minX ? minX - point.x : point.x > maxX ? point.x - maxX : 0;
  const dy = point.y < minY ? minY - point.y : point.y > maxY ? point.y - maxY : 0;
  return Math.hypot(dx, dy);
}

function pickLocalEntity(
  point: { x: number; y: number },
  tolerance: number,
  entityById: Map<string, DwgEntityLite>
): DwgEntityLite | null {
  let best: DwgEntityLite | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entity of entityById.values()) {
    const distance = distanceToEntityBbox(point, entity);
    if (distance > tolerance || distance >= bestDistance) continue;
    best = entity;
    bestDistance = distance;
  }
  return best;
}

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

    const localEntity = entityById.get(selectedEntityId);
    if (localEntity) {
      queueMicrotask(() => {
        setSelectedEntityRecord(localEntity as unknown as Record<string, unknown>);
      });
    }

    let cancelled = false;
    void getDwgEntity(docId, selectedEntityId)
      .then((response) => {
        if (!cancelled) setSelectedEntityRecord((response.entity as Record<string, unknown>) ?? null);
      })
      .catch(() => {
        if (!cancelled && !localEntity) setSelectedEntityRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [docId, entityById, selectedEntityId]);

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
      const tolerance = Math.max(1e-3, 20 / Math.max(zoom, 1e-3));
      const localHit = pickLocalEntity(world, tolerance, entityById);
      if (localHit?.id) {
        setSelectedEntityId(localHit.id);
        setSelectedEntityRecord(localHit as unknown as Record<string, unknown>);
        if (localHit.bbox) {
          focusBbox({ min: localHit.bbox.min, max: localHit.bbox.max });
        }
      }

      try {
        const picked = await pickDwgEntity(activeDocId, {
          space_id: currentSpace,
          point: { x: world.x, y: world.y, z: 0 },
          tolerance,
          selection_scope: 'entity',
        });

        const first = picked.picked?.[0];
        if (!first?.entity_id) return;
        if (first.entity_id === localHit?.id) return;

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
