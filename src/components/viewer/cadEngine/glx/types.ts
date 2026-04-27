import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';

export interface OverlayTextItem {
  entityId: string;
  layer: string;
  text: string;
  x: number;
  y: number;
  height: number;
  rotation: number;
  color: string;
}

export interface BuildGlxOptions {
  hiddenLayerNames?: Set<string>;
  hiddenEntityIds?: Set<string>;
  spaceName?: string;
  emitEngineText?: boolean;
}

export interface BuildGlxResult {
  glxJsonBytes: Uint8Array;
  glxMeshBuffer: ArrayBuffer;
  layerIdByName: Map<string, number>;
  overlayTexts: OverlayTextItem[];
  diagnostics: BuildGlxDiagnostics;
}

export interface MeshBucket {
  layer: string;
  color: string;
  mode: 0 | 2;
  points: number[];
}

export type PrimitiveRecord = DwgPrimitive | (Record<string, unknown> & { kind?: unknown });

export interface TextRenderAccumulator {
  overlayTexts: OverlayTextItem[];
  entitiesJson: Array<Record<string, unknown>>;
  layerChildren: Map<string, number[]>;
  emitEngineText: boolean;
}

export interface EntityRenderContext extends TextRenderAccumulator {
  entity: DwgEntityLite;
  layer: string;
  entityColor: string;
}

export interface PrimitiveKindDiagnostics {
  input: number;
  rendered: number;
  skipped: number;
}

export interface EntityCoverageDiagnostics {
  input: number;
  rendered: number;
  missing: number;
}

export interface BuildGlxDiagnostics {
  entitiesInput: number;
  entitiesHidden: number;
  entitiesProcessed: number;
  entitiesWithPrimitives: number;
  entitiesWithoutPrimitives: number;
  entitiesRendered: number;
  entitiesMissingRender: number;
  entitiesUsingFallback: number;
  primitivesInput: number;
  primitivesRendered: number;
  primitivesSkipped: number;
  overlayTextCount: number;
  engineTextCount: number;
  meshEntityCount: number;
  kinds: Record<string, PrimitiveKindDiagnostics>;
  missingByType: Record<string, EntityCoverageDiagnostics>;
  missingEntityIds: string[];
  missingDimensionEntityIds: string[];
  dimensionKindCoverage: Record<string, EntityCoverageDiagnostics>;
}
