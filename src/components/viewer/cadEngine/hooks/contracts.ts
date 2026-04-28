import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { DwgEntityLite, DwgHierarchyNode, DwgSpace } from '@/services/dwgApi';
import type { CadEngineApi, CadEngineInstance } from '../cadEngineTypes';
import type { BuildGlxDiagnostics, OverlayTextItem } from '../dwgToGlx';
import type { CadEngineRuntimeDiagnostics } from '../runtimeDiagnostics';

export interface TreeConsistencyTypeMismatch {
  type: string;
  entities: number;
  hierarchy: number;
}

export interface TreeConsistencySubtypeMismatch {
  subtype: string;
  entities: number;
  hierarchy: number;
}

export interface TreeConsistencyDiagnostics {
  ok: boolean;
  spaceId: string;
  entityCount: number;
  hierarchyCount: number;
  typeMismatches: TreeConsistencyTypeMismatch[];
  subtypeMismatches?: TreeConsistencySubtypeMismatch[];
  missingInTree: string[];
  extraInTree: string[];
  missingRequiredFields: Array<{ nodeId: string; missing: string[] }>;
  orderStable: boolean;
}

export interface CadRuntimeRefs {
  engineRef: MutableRefObject<CadEngineInstance | null>;
  apiRef: MutableRefObject<CadEngineApi | null>;
  sceneReadyRef: MutableRefObject<boolean>;
  sceneBlobUrlsRef: MutableRefObject<{ glxUrl: string; binUrl: string } | null>;
  didDragRef: MutableRefObject<boolean>;
}

export interface CadViewportRefs {
  viewportRef: RefObject<HTMLDivElement | null>;
  textCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export interface UseCadEngineLifecycleInput {
  hiddenLayerNames: Set<string>;
  hiddenEntityIds: Set<string>;
  overlayTexts: OverlayTextItem[];
  onInitError: (message: string) => void;
}

export interface UseCadEngineLifecycleResult extends CadRuntimeRefs, CadViewportRefs {
  revokeSceneBlobUrls: () => void;
  resizeEngine: () => void;
  drawOverlay: () => void;
  focusBbox: (bbox: DwgHierarchyNode['bbox']) => void;
}

export interface UseCadSceneRenderInput {
  entities: DwgEntityLite[];
  currentSpace: string;
  hiddenEntityIds: Set<string>;
  hiddenLayerNames: Set<string>;
  engineRef: MutableRefObject<CadEngineInstance | null>;
  apiRef: MutableRefObject<CadEngineApi | null>;
  sceneReadyRef: MutableRefObject<boolean>;
  sceneBlobUrlsRef: MutableRefObject<{ glxUrl: string; binUrl: string } | null>;
  revokeSceneBlobUrls: () => void;
  drawOverlay: () => void;
  resizeEngine: () => void;
  onOverlayTextsChange: (texts: OverlayTextItem[]) => void;
  onError: (message: string) => void;
}

export interface UseCadSceneRenderResult {
  layerIdByName: Map<string, number>;
  renderDiagnostics: BuildGlxDiagnostics | null;
  runtimeDiagnostics: CadEngineRuntimeDiagnostics | null;
  resetRenderState: () => void;
}

export interface UseCadSelectionInput {
  docId: string | null;
  docIdRef: MutableRefObject<string | null>;
  currentSpace: string;
  entityById: Map<string, DwgEntityLite>;
  engineRef: MutableRefObject<CadEngineInstance | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  didDragRef: MutableRefObject<boolean>;
}

export interface UseCadSelectionResult {
  selectedEntityId: string | null;
  selectedEntityRecord: Record<string, unknown> | null;
  setSelectedEntityId: Dispatch<SetStateAction<string | null>>;
  clearSelection: () => void;
}

export interface UseCadDocumentLifecycleInput {
  rawFile: File | null;
  apiRef: MutableRefObject<CadEngineApi | null>;
  sceneReadyRef: MutableRefObject<boolean>;
  revokeSceneBlobUrls: () => void;
  onError: (message: string | null) => void;
  onClearSelection: () => void;
  onResetHiddenLayerNames: () => void;
  onResetHiddenEntityIds: () => void;
  onResetExpandedIds: (next: Set<string>) => void;
}

export interface UseCadDocumentLifecycleResult {
  loading: boolean;
  docId: string | null;
  docIdRef: MutableRefObject<string | null>;
  spaces: DwgSpace[];
  currentSpace: string;
  entities: DwgEntityLite[];
  nodes: DwgHierarchyNode[];
  warnings: string[];
  treeConsistency: TreeConsistencyDiagnostics | null;
  loadSpace: (activeDocId: string, spaceId: string) => Promise<unknown>;
}

export interface UseCadViewStateInput {
  initialLeftSidebarCollapsed?: boolean;
  initialRightSidebarCollapsed?: boolean;
}

export interface UseCadViewStateResult {
  hiddenLayerNames: Set<string>;
  hiddenEntityIds: Set<string>;
  expandedIds: Set<string>;
  overlayTexts: OverlayTextItem[];
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  setOverlayTexts: Dispatch<SetStateAction<OverlayTextItem[]>>;
  setExpandedIds: Dispatch<SetStateAction<Set<string>>>;
  setLeftSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  setRightSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  resetHiddenLayerNames: () => void;
  resetHiddenEntityIds: () => void;
  toggleLayer: (layer: string) => void;
  toggleEntityVisibility: (entityId: string) => void;
  toggleNodeEntityVisibility: (nodeId: string, entityIds: string[]) => void;
  toggleNodeExpanded: (nodeId: string) => void;
}
