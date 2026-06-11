import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface LoadedSpaceData {
  spaceId: string;
  entities: DwgEntityLite[];
  nodes: DwgHierarchyNode[];
  warnings: string[];
  treeConsistency: TreeConsistencyDiagnostics;
}

interface RetainedDwgSession {
  key: string;
  docId: string;
  spaces: DwgSpace[];
  currentSpace: string;
  loadedSpace: LoadedSpaceData;
  baseWarnings: string[];
  orderSignatureBySpace: Map<string, string>;
  closeTimer: number | null;
  shxFontUrls?: { main?: string | null; bigfont?: string | null };
}

interface InFlightDwgOpen {
  key: string;
  promise: Promise<RetainedDwgSession>;
}

let retainedDwgSession: RetainedDwgSession | null = null;
let inFlightDwgOpen: InFlightDwgOpen | null = null;
const RETAINED_SESSION_CLOSE_DELAY_MS = 3000;

async function safeClose(docId: string | null) {
  if (!docId) return;
  try {
    await closeDwgDocument(docId);
  } catch {
    // ignore close errors
  }
}

function cancelRetainedClose(session: RetainedDwgSession | null) {
  if (!session?.closeTimer) return;
  window.clearTimeout(session.closeTimer);
  session.closeTimer = null;
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

async function loadDwgSpaceData(
  activeDocId: string,
  spaceId: string,
  baseWarnings: string[],
  orderSignatureBySpace: Map<string, string>
): Promise<LoadedSpaceData> {
  const [entitiesResp, hierarchyResp] = await Promise.all([
    listDwgEntitiesPaged(activeDocId, spaceId),
    listDwgHierarchy(activeDocId, spaceId),
  ]);

  const nextEntities = (entitiesResp.entities ?? []).map((entity) => normalizeEntityForViewer(entity, spaceId));
  const nextNodes = (hierarchyResp.nodes ?? []).map(normalizeHierarchyNode);
  const mergedWarnings = [...baseWarnings];
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

  const consistency = buildTreeConsistencyDiagnostics(nextEntities, nextNodes, spaceId, orderSignatureBySpace);
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

  return {
    spaceId,
    entities: nextEntities,
    nodes: nextNodes,
    warnings: mergedWarnings,
    treeConsistency: consistency,
  };
}

async function openDwgSessionForFile(rawFile: File, key: string): Promise<RetainedDwgSession> {
  if (retainedDwgSession?.key === key) {
    cancelRetainedClose(retainedDwgSession);
    return retainedDwgSession;
  }
  if (inFlightDwgOpen?.key === key) {
    return inFlightDwgOpen.promise;
  }

  const promise = (async () => {
    if (retainedDwgSession && retainedDwgSession.key !== key) {
      cancelRetainedClose(retainedDwgSession);
      await safeClose(retainedDwgSession.docId);
      retainedDwgSession = null;
    }

    const opened = await openDwgDocument(rawFile);
    const spaces = Array.isArray(opened.spaces) ? opened.spaces : [];
    const listed = await listDwgSpaces(opened.doc_id).catch(() => null);
    const effectiveSpaces = listed?.spaces?.length ? listed.spaces : spaces;
    const nextSpace = opened.current_space || opened.spaces?.[0]?.id || 'model';
    const baseWarnings = Array.isArray(opened.warnings) ? opened.warnings : [];
    const orderSignatureBySpace = new Map<string, string>();
    const loadedSpace = await loadDwgSpaceData(opened.doc_id, nextSpace, baseWarnings, orderSignatureBySpace);
    const session: RetainedDwgSession = {
      key,
      docId: opened.doc_id,
      spaces: effectiveSpaces,
      currentSpace: nextSpace,
      loadedSpace,
      baseWarnings,
      orderSignatureBySpace: new Map(orderSignatureBySpace),
      closeTimer: null,
      shxFontUrls: opened.shx_font_urls,
    };
    retainedDwgSession = session;
    return session;
  })();

  inFlightDwgOpen = { key, promise };
  try {
    return await promise;
  } finally {
    if (inFlightDwgOpen?.key === key) {
      inFlightDwgOpen = null;
    }
  }
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
  const [shxFontUrls, setShxFontUrls] = useState<{ main?: string | null; bigfont?: string | null } | undefined>();
  const baseWarningsRef = useRef<string[]>([]);
  const orderSignatureBySpaceRef = useRef<Map<string, string>>(new Map());
  const rawFileKey = useMemo(
    () => (rawFile ? `${rawFile.name}|${rawFile.size}|${rawFile.lastModified}` : ''),
    [rawFile]
  );
  const loadedFileKeyRef = useRef<string>('');

  const loadSpace = useCallback(async (activeDocId: string, spaceId: string): Promise<LoadedSpaceData | null> => {
    setLoading(true);
    onError(null);

    try {
      const loaded = await loadDwgSpaceData(activeDocId, spaceId, baseWarningsRef.current, orderSignatureBySpaceRef.current);
      setEntities(loaded.entities);
      setNodes(loaded.nodes);
      setTreeConsistency(loaded.treeConsistency);
      setWarnings(loaded.warnings);
      onResetExpandedIds(collectDefaultExpanded(loaded.nodes));
      setCurrentSpace(spaceId);
      onResetHiddenEntityIds();
      onClearSelection();
      if (retainedDwgSession?.docId === activeDocId) {
        retainedDwgSession = {
          ...retainedDwgSession,
          currentSpace: spaceId,
          loadedSpace: loaded,
          orderSignatureBySpace: new Map(orderSignatureBySpaceRef.current),
        };
      }
      return loaded;
    } catch (loadError) {
      onError(loadError instanceof Error ? loadError.message : 'Failed to load DWG space data');
      return null;
    } finally {
      setLoading(false);
    }
  }, [onClearSelection, onError, onResetExpandedIds, onResetHiddenEntityIds]);

  useEffect(() => {
    let cancelled = false;

    const applySession = (session: RetainedDwgSession) => {
      if (cancelled) return;
      cancelRetainedClose(session);
      docIdRef.current = session.docId;
      loadedFileKeyRef.current = session.key;
      setDocId(session.docId);
      setSpaces(session.spaces);
      setCurrentSpace(session.currentSpace);
      setEntities(session.loadedSpace.entities);
      setNodes(session.loadedSpace.nodes);
      setWarnings(session.loadedSpace.warnings);
      setTreeConsistency(session.loadedSpace.treeConsistency);
      baseWarningsRef.current = session.baseWarnings;
      orderSignatureBySpaceRef.current = new Map(session.orderSignatureBySpace);
      setShxFontUrls(session.shxFontUrls);
      onResetExpandedIds(collectDefaultExpanded(session.loadedSpace.nodes));
      onResetHiddenLayerNames();
      onResetHiddenEntityIds();
      onClearSelection();
    };

    const run = async () => {
      if (!rawFile) {
        if (retainedDwgSession) {
          cancelRetainedClose(retainedDwgSession);
          void safeClose(retainedDwgSession.docId);
          retainedDwgSession = null;
        }
        loadedFileKeyRef.current = '';
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

      if (loadedFileKeyRef.current === rawFileKey && docIdRef.current) {
        return;
      }

      if (retainedDwgSession?.key === rawFileKey) {
        applySession(retainedDwgSession);
        setLoading(false);
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
        if (docIdRef.current && retainedDwgSession?.docId !== docIdRef.current) {
          await closeDwgDocument(docIdRef.current).catch(() => undefined);
        }

        const session = await openDwgSessionForFile(rawFile, rawFileKey);
        applySession(session);
      } catch (openError) {
        if (!cancelled) onError(openError instanceof Error ? openError.message : 'Failed to open DWG');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      const closingDocId = docIdRef.current;
      const closingKey = loadedFileKeyRef.current;
      if (closingDocId && retainedDwgSession?.docId === closingDocId && retainedDwgSession.key === closingKey) {
        cancelRetainedClose(retainedDwgSession);
        retainedDwgSession.closeTimer = window.setTimeout(() => {
          if (retainedDwgSession?.docId === closingDocId) {
            void safeClose(closingDocId);
            retainedDwgSession = null;
          }
        }, RETAINED_SESSION_CLOSE_DELAY_MS);
      } else if (closingDocId) {
        void safeClose(closingDocId);
      }
      loadedFileKeyRef.current = '';
      sceneReadyRef.current = false;
      revokeSceneBlobUrls();
    };
  }, [rawFileKey]);

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
    shxFontUrls,
  };
}
