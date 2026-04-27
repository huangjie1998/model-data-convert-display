import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closeDwgDocument,
  listDwgEntities,
  listDwgHierarchy,
  listDwgSpaces,
  openDwgDocument,
  type DwgEntityLite,
  type DwgHierarchyNode,
  type DwgSpace,
} from '@/services/dwgApi';
import { collectDefaultExpanded } from '../cadUiUtils';
import type {
  TreeConsistencyDiagnostics,
  UseCadDocumentLifecycleInput,
  UseCadDocumentLifecycleResult,
} from './contracts';
import { normalizeEntityForViewer, normalizeHierarchyNode } from '../document/normalizeDwgDocument';
import { buildTreeConsistencyDiagnostics } from '../document/treeConsistency';

const ENTITY_FETCH_LIMIT = (() => {
  const raw = Number(import.meta.env.VITE_DWG_ENTITY_FETCH_LIMIT ?? 400000);
  if (!Number.isFinite(raw)) return 400000;
  return Math.max(1000, Math.min(1000000, Math.floor(raw)));
})();

const ENTITY_FETCH_PAGE_SIZE = (() => {
  const raw = Number(import.meta.env.VITE_DWG_ENTITY_FETCH_PAGE_SIZE ?? 50000);
  if (!Number.isFinite(raw)) return 50000;
  return Math.max(1000, Math.min(100000, Math.floor(raw)));
})();

async function safeClose(docId: string | null) {
  if (!docId) return;
  try {
    await closeDwgDocument(docId);
  } catch {
    // ignore close errors
  }
}

async function listDwgEntitiesPaged(activeDocId: string, spaceId: string) {
  const firstLimit = Math.min(ENTITY_FETCH_PAGE_SIZE, ENTITY_FETCH_LIMIT);
  const firstPage = await listDwgEntities(activeDocId, spaceId, firstLimit, 0);
  const allEntities = [...(firstPage.entities ?? [])];
  const totalCount = Number(firstPage.total_count ?? allEntities.length);
  const targetCount = Math.min(totalCount, ENTITY_FETCH_LIMIT);

  let offset = allEntities.length;
  while (offset < targetCount) {
    const nextLimit = Math.min(ENTITY_FETCH_PAGE_SIZE, targetCount - offset);
    const nextPage = await listDwgEntities(activeDocId, spaceId, nextLimit, offset);
    const pageEntities = nextPage.entities ?? [];
    if (pageEntities.length === 0) break;
    allEntities.push(...pageEntities);
    offset += pageEntities.length;
  }

  return {
    ...firstPage,
    entities: allEntities,
    total_count: totalCount,
    truncated: totalCount > allEntities.length,
  };
}

export function useCadDocumentLifecycle(input: UseCadDocumentLifecycleInput): UseCadDocumentLifecycleResult {
  const {
    rawFile,
    apiRef,
    sceneReadyRef,
    revokeSceneBlobUrls,
    onError,
    onClearSelection,
    onResetHiddenLayerNames,
    onResetHiddenEntityIds,
    onResetExpandedIds,
  } = input;

  const [loading, setLoading] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);
  const docIdRef = useRef<string | null>(null);

  const [spaces, setSpaces] = useState<DwgSpace[]>([]);
  const [currentSpace, setCurrentSpace] = useState<string>('model');
  const [entities, setEntities] = useState<DwgEntityLite[]>([]);
  const [nodes, setNodes] = useState<DwgHierarchyNode[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [treeConsistency, setTreeConsistency] = useState<TreeConsistencyDiagnostics | null>(null);
  const baseWarningsRef = useRef<string[]>([]);
  const orderSignatureBySpaceRef = useRef<Map<string, string>>(new Map());

  const loadSpace = useCallback(async (activeDocId: string, spaceId: string) => {
    setLoading(true);
    onError(null);

    try {
      const [entitiesResp, hierarchyResp] = await Promise.all([
        listDwgEntitiesPaged(activeDocId, spaceId),
        listDwgHierarchy(activeDocId, spaceId),
      ]);

      const nextEntities = (entitiesResp.entities ?? []).map((entity) => normalizeEntityForViewer(entity, spaceId));
      const nextNodes = (hierarchyResp.nodes ?? []).map(normalizeHierarchyNode);
      const mergedWarnings = [...baseWarningsRef.current];
      if (entitiesResp.truncated) {
        mergedWarnings.push(
          `Entity list truncated: rendered ${nextEntities.length}/${entitiesResp.total_count}. Increase VITE_DWG_ENTITY_FETCH_LIMIT or backend DWG caps.`
        );
      }
      if (!entitiesResp.truncated && hierarchyResp.total_entity_count > nextEntities.length) {
        mergedWarnings.push(
          `Hierarchy/entity mismatch: hierarchy=${hierarchyResp.total_entity_count}, rendered=${nextEntities.length}.`
        );
      }

      const consistency = buildTreeConsistencyDiagnostics(nextEntities, nextNodes, spaceId, orderSignatureBySpaceRef.current);
      for (const mismatch of consistency.typeMismatches) {
        mergedWarnings.push(
          `Type count mismatch ${mismatch.type}: entities=${mismatch.entities}, hierarchy=${mismatch.hierarchy}.`
        );
      }
      for (const mismatch of consistency.subtypeMismatches ?? []) {
        mergedWarnings.push(
          `Subtype count mismatch ${mismatch.subtype}: entities=${mismatch.entities}, hierarchy=${mismatch.hierarchy}.`
        );
      }
      if (consistency.missingInTree.length > 0) {
        const preview = consistency.missingInTree.slice(0, 8).join(', ');
        mergedWarnings.push(`Hierarchy missing entity IDs (${consistency.missingInTree.length}): ${preview}${consistency.missingInTree.length > 8 ? ', ...' : ''}`);
      }
      if (consistency.extraInTree.length > 0) {
        const preview = consistency.extraInTree.slice(0, 8).join(', ');
        mergedWarnings.push(`Hierarchy contains unknown entity IDs (${consistency.extraInTree.length}): ${preview}${consistency.extraInTree.length > 8 ? ', ...' : ''}`);
      }
      if (consistency.missingRequiredFields.length > 0) {
        const preview = consistency.missingRequiredFields
          .slice(0, 4)
          .map((item) => `${item.nodeId}[${item.missing.join('/')}]`)
          .join(', ');
        mergedWarnings.push(
          `Hierarchy nodes missing required fields (${consistency.missingRequiredFields.length}): ${preview}${consistency.missingRequiredFields.length > 4 ? ', ...' : ''}`
        );
      }
      if (!consistency.orderStable) {
        mergedWarnings.push('Hierarchy leaf order changed for same space during session.');
      }
      setEntities(nextEntities);
      setNodes(nextNodes);
      setTreeConsistency(consistency);
      setWarnings(mergedWarnings);
      onResetExpandedIds(collectDefaultExpanded(nextNodes));
      setCurrentSpace(spaceId);
      onResetHiddenEntityIds();
      onClearSelection();
    } catch (loadError) {
      onError(loadError instanceof Error ? loadError.message : 'Failed to load DWG space data');
    } finally {
      setLoading(false);
    }
  }, [onClearSelection, onError, onResetExpandedIds, onResetHiddenEntityIds]);

  useEffect(() => {
    const run = async () => {
      if (!rawFile) {
        sceneReadyRef.current = false;
        revokeSceneBlobUrls();
        apiRef.current?.purgeModel?.();

        setDocId(null);
        docIdRef.current = null;
        setSpaces([]);
        setCurrentSpace('model');
        setEntities([]);
        setNodes([]);
        setTreeConsistency(null);
        setWarnings([]);
        baseWarningsRef.current = [];
        orderSignatureBySpaceRef.current.clear();
        onResetHiddenLayerNames();
        onClearSelection();
        onResetExpandedIds(new Set());
        return;
      }

      if (!rawFile.name.toLowerCase().endsWith('.dwg')) {
        onError('Only .dwg is supported in this viewer');
        return;
      }

      setLoading(true);
      onError(null);

      try {
        sceneReadyRef.current = false;
        revokeSceneBlobUrls();
        if (docIdRef.current) {
          await closeDwgDocument(docIdRef.current).catch(() => undefined);
        }

        const opened = await openDwgDocument(rawFile);
        docIdRef.current = opened.doc_id;
        setDocId(opened.doc_id);
        onResetHiddenLayerNames();
        orderSignatureBySpaceRef.current.clear();
        baseWarningsRef.current = Array.isArray(opened.warnings) ? opened.warnings : [];
        setWarnings(baseWarningsRef.current);
        setTreeConsistency(null);
        setSpaces(Array.isArray(opened.spaces) ? opened.spaces : []);

        const listed = await listDwgSpaces(opened.doc_id).catch(() => null);
        if (listed?.spaces?.length) {
          setSpaces(listed.spaces);
        }

        const nextSpace = opened.current_space || opened.spaces?.[0]?.id || 'model';
        await loadSpace(opened.doc_id, nextSpace);
      } catch (openError) {
        onError(openError instanceof Error ? openError.message : 'Failed to open DWG');
      } finally {
        setLoading(false);
      }
    };

    void run();

    return () => {
      if (docIdRef.current) {
        void safeClose(docIdRef.current);
      }
      sceneReadyRef.current = false;
      revokeSceneBlobUrls();
    };
  }, [apiRef, loadSpace, onClearSelection, onError, onResetExpandedIds, onResetHiddenLayerNames, rawFile, revokeSceneBlobUrls, sceneReadyRef]);

  return {
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
  };
}
