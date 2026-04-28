import type { DwgEntityLite } from '@/services/dwgApi';
import { resolveEntityPrimitives } from './fallback/entityPrimitiveResolver';
import { renderGraphicPrimitive } from './renderers/primitiveDispatcher';
import { polylineWidth, renderWidePolylinePrimitive } from './renderers/polylineRenderer';
import { renderTextPrimitive } from './renderers/textRenderer';
import type {
  BuildGlxDiagnostics,
  BuildGlxOptions,
  BuildGlxResult,
  EntityCoverageDiagnostics,
  MeshBucket,
  PrimitiveKindDiagnostics,
  PrimitiveRecord,
} from './types';
import { layerOrderFromEntities, normalizeLayerName, pointXY, pointsFromUnknown, primitiveColor, primitiveKind, resolveEntityColor } from './utils';

const MAX_FLOATS_PER_MESH_CHUNK = 16384;
const FLOATS_PER_LINE_SEGMENT = 4;
const FLOATS_PER_TRIANGLE = 6;

function addLayerChild(layerChildren: Map<string, number[]>, layer: string, childIndex: number) {
  const children = layerChildren.get(layer) ?? [];
  children.push(childIndex);
  layerChildren.set(layer, children);
}

function getOrCreateBucket(meshBuckets: Map<string, MeshBucket>, layer: string, color: string, mode: 0 | 2 = 0): MeshBucket {
  const key = `${layer}|${color}|${mode}`;
  let bucket = meshBuckets.get(key);
  if (!bucket) {
    bucket = { layer, color, mode, points: [] };
    meshBuckets.set(key, bucket);
  }
  return bucket;
}

function renderFilledPolygonPrimitive(target: number[], primitive: PrimitiveRecord): boolean {
  const record = primitive as Record<string, unknown>;
  const rings = Array.isArray(record.rings) ? record.rings : [];
  if (rings.length > 1) return false;
  let shell = rings.length > 0 ? pointsFromUnknown(rings[0]) : [];
  if (shell.length < 3) {
    shell = pointsFromUnknown(record.points);
  }
  if (shell.length < 3) return false;

  const first = pointXY(shell[0]);
  const last = pointXY(shell[shell.length - 1]);
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    shell = shell.slice(0, shell.length - 1);
  }
  if (shell.length < 3) return false;

  const anchor = pointXY(shell[0]);
  if (!anchor) return false;

  let triCount = 0;
  for (let i = 1; i + 1 < shell.length; i += 1) {
    const b = pointXY(shell[i]);
    const c = pointXY(shell[i + 1]);
    if (!b || !c) continue;
    target.push(anchor[0], anchor[1]);
    target.push(b[0], b[1]);
    target.push(c[0], c[1]);
    triCount += 1;
  }
  return triCount > 0;
}

function buildMeshes(
  meshBuckets: Map<string, MeshBucket>,
  entitiesJson: Array<Record<string, unknown>>,
  layerChildren: Map<string, number[]>,
  materialColors: string[],
  materialIndexByColor: Map<string, number>
): { meshBuffer: Uint8Array; meshMeta: Array<{ offset: number; length: number; material: number }> } {
  const meshChunks: Uint8Array[] = [];
  const meshesMeta: Array<{ offset: number; length: number; material: number }> = [];

  const getMaterialIndex = (color: string): number => {
    if (materialIndexByColor.has(color)) return materialIndexByColor.get(color) as number;
    const next = materialColors.length;
    materialColors.push(color);
    materialIndexByColor.set(color, next);
    return next;
  };

  for (const bucket of meshBuckets.values()) {
    const floatsPerPrimitive = bucket.mode === 2 ? FLOATS_PER_TRIANGLE : FLOATS_PER_LINE_SEGMENT;
    if (bucket.points.length < floatsPerPrimitive) continue;
    let cursor = 0;
    while (cursor < bucket.points.length) {
      let next = Math.min(bucket.points.length, cursor + MAX_FLOATS_PER_MESH_CHUNK);
      if (next < bucket.points.length) {
        const relativeCount = next - cursor;
        const aligned = next - (relativeCount % floatsPerPrimitive);
        next = aligned > cursor ? aligned : Math.min(bucket.points.length, cursor + floatsPerPrimitive);
      }
      const slice = bucket.points.slice(cursor, next);
      cursor = next;
      if (slice.length < floatsPerPrimitive) continue;

      const floatCount = slice.length;
      const byteLength = 1 + floatCount * 8;
      const chunk = new Uint8Array(byteLength);
      chunk[0] = bucket.mode;
      const view = new DataView(chunk.buffer, chunk.byteOffset + 1, floatCount * 8);
      for (let i = 0; i < floatCount; i += 1) {
        view.setFloat64(i * 8, slice[i], true);
      }

      const meshIndex = meshesMeta.length;
      meshesMeta.push({
        offset: 0,
        length: chunk.byteLength,
        material: getMaterialIndex(bucket.color),
      });
      meshChunks.push(chunk);

      const entityIndex = entitiesJson.length;
      entitiesJson.push({ type: 1, meshIds: [meshIndex] });
      addLayerChild(layerChildren, bucket.layer, entityIndex);
    }
  }

  let totalBytes = 0;
  for (const chunk of meshChunks) {
    totalBytes += chunk.byteLength;
  }

  const meshBuffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (let i = 0; i < meshChunks.length; i += 1) {
    const chunk = meshChunks[i];
    meshBuffer.set(chunk, offset);
    meshesMeta[i].offset = offset;
    offset += chunk.byteLength;
  }

  return { meshBuffer, meshMeta: meshesMeta };
}

export function buildCadEngineGlx(entities: DwgEntityLite[], options: BuildGlxOptions = {}): BuildGlxResult {
  const hiddenLayerNames = options.hiddenLayerNames ?? new Set<string>();
  const hiddenEntityIds = options.hiddenEntityIds ?? new Set<string>();
  const emitEngineText = options.emitEngineText ?? true;

  const layers = layerOrderFromEntities(entities).filter((layer) => !hiddenLayerNames.has(layer));
  const layerChildren = new Map<string, number[]>();
  const meshBuckets = new Map<string, MeshBucket>();

  const overlayTexts: BuildGlxResult['overlayTexts'] = [];
  const entitiesJson: Array<Record<string, unknown>> = [];
  const materialColors: string[] = [];
  const materialIndexByColor = new Map<string, number>();
  const diagnostics: BuildGlxDiagnostics = {
    entitiesInput: 0,
    entitiesHidden: 0,
    entitiesProcessed: 0,
    entitiesWithPrimitives: 0,
    entitiesWithoutPrimitives: 0,
    entitiesRendered: 0,
    entitiesMissingRender: 0,
    entitiesUsingFallback: 0,
    primitivesInput: 0,
    primitivesRendered: 0,
    primitivesSkipped: 0,
    overlayTextCount: 0,
    engineTextCount: 0,
    meshEntityCount: 0,
    kinds: {},
    missingByType: {},
    missingEntityIds: [],
    missingDimensionEntityIds: [],
    dimensionKindCoverage: {},
  };
  const missingEntityIdSet = new Set<string>();
  const missingDimensionIdSet = new Set<string>();

  const ensureKindDiagnostics = (kind: string): PrimitiveKindDiagnostics => {
    const key = kind || 'unknown';
    const existing = diagnostics.kinds[key];
    if (existing) return existing;
    const created: PrimitiveKindDiagnostics = { input: 0, rendered: 0, skipped: 0 };
    diagnostics.kinds[key] = created;
    return created;
  };

  const ensureEntityCoverage = (
    container: Record<string, EntityCoverageDiagnostics>,
    keyRaw: string
  ): EntityCoverageDiagnostics => {
    const key = keyRaw || 'UNKNOWN';
    const hit = container[key];
    if (hit) return hit;
    const created: EntityCoverageDiagnostics = { input: 0, rendered: 0, missing: 0 };
    container[key] = created;
    return created;
  };

  for (const entity of entities) {
    diagnostics.entitiesInput += 1;
    const layer = normalizeLayerName(entity.layer);
    if (hiddenLayerNames.has(layer) || hiddenEntityIds.has(entity.id)) {
      diagnostics.entitiesHidden += 1;
      continue;
    }
    diagnostics.entitiesProcessed += 1;
    const entityType = String(entity.type || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const typeCoverage = ensureEntityCoverage(diagnostics.missingByType, entityType);
    typeCoverage.input += 1;

    const dimensionKindRaw =
      entityType === 'DIMENSION'
        ? String(
            (entity.geom?.dimension_payload as Record<string, unknown> | undefined)?.dim_kind ??
              entity.geom?.dim_kind ??
              'dimension'
          )
            .trim()
            .toLowerCase() || 'dimension'
        : '';
    const dimensionCoverage =
      entityType === 'DIMENSION' ? ensureEntityCoverage(diagnostics.dimensionKindCoverage, dimensionKindRaw) : null;
    if (dimensionCoverage) {
      dimensionCoverage.input += 1;
    }

    const hasNativePrimitives = Array.isArray(entity.geom?.primitives) && entity.geom.primitives.length > 0;
    const primitives = (hasNativePrimitives ? (entity.geom?.primitives as PrimitiveRecord[]) : resolveEntityPrimitives(entity)) ?? [];
    if (!hasNativePrimitives) diagnostics.entitiesUsingFallback += 1;
    let entityRendered = false;
    if (primitives.length === 0) {
      diagnostics.entitiesWithoutPrimitives += 1;
      diagnostics.entitiesMissingRender += 1;
      typeCoverage.missing += 1;
      if (dimensionCoverage) {
        dimensionCoverage.missing += 1;
        missingDimensionIdSet.add(entity.id);
      }
      missingEntityIdSet.add(entity.id);
      continue;
    }
    diagnostics.entitiesWithPrimitives += 1;

    const entityColor = resolveEntityColor(entity);
    for (const primitive of primitives) {
      const kind = primitiveKind(primitive) || 'unknown';
      diagnostics.primitivesInput += 1;
      const kindStat = ensureKindDiagnostics(kind);
      kindStat.input += 1;

      if (kind === 'text') {
        const textResult = renderTextPrimitive(primitive, entity.id, layer, entityColor, {
          overlayTexts,
          entitiesJson,
          layerChildren,
          emitEngineText,
        });
        if (textResult.overlayText) diagnostics.overlayTextCount += 1;
        if (textResult.engineText) diagnostics.engineTextCount += 1;
        if (textResult.rendered) {
          diagnostics.primitivesRendered += 1;
          kindStat.rendered += 1;
          entityRendered = true;
        } else {
          diagnostics.primitivesSkipped += 1;
          kindStat.skipped += 1;
        }
        continue;
      }

      const color = primitiveColor(primitive, entityColor);
      let rendered = false;

      if (kind === 'polygon') {
        const polygonRecord = primitive as Record<string, unknown>;
        const isFilled = polygonRecord.filled === true || polygonRecord.wipeout === true || polygonRecord.arrow_fill === true;

        if (isFilled) {
          const fillBucket = getOrCreateBucket(meshBuckets, layer, color, 2);
          const beforeFillLen = fillBucket.points.length;
          const fillRendered = renderFilledPolygonPrimitive(fillBucket.points, primitive);
          rendered = fillRendered && fillBucket.points.length > beforeFillLen;
        }

        const outlineBucket = getOrCreateBucket(meshBuckets, layer, color, 0);
        const beforeOutlineLen = outlineBucket.points.length;
        renderGraphicPrimitive(kind, outlineBucket.points, primitive);
        rendered = rendered || outlineBucket.points.length > beforeOutlineLen;
      } else if (kind === 'polyline' && polylineWidth(primitive) > 0) {
        const fillBucket = getOrCreateBucket(meshBuckets, layer, color, 2);
        const beforeFillLen = fillBucket.points.length;
        const fillRendered = renderWidePolylinePrimitive(fillBucket.points, primitive);
        rendered = fillRendered && fillBucket.points.length > beforeFillLen;

        const outlineBucket = getOrCreateBucket(meshBuckets, layer, color, 0);
        const beforeOutlineLen = outlineBucket.points.length;
        renderGraphicPrimitive(kind, outlineBucket.points, primitive);
        rendered = rendered || outlineBucket.points.length > beforeOutlineLen;
      } else {
        const bucket = getOrCreateBucket(meshBuckets, layer, color, 0);
        const beforeLen = bucket.points.length;
        renderGraphicPrimitive(kind, bucket.points, primitive);
        rendered = bucket.points.length > beforeLen;
      }

      if (rendered) {
        diagnostics.primitivesRendered += 1;
        kindStat.rendered += 1;
        entityRendered = true;
      } else {
        diagnostics.primitivesSkipped += 1;
        kindStat.skipped += 1;
      }
    }

    if (entityRendered) {
      diagnostics.entitiesRendered += 1;
      typeCoverage.rendered += 1;
      if (dimensionCoverage) {
        dimensionCoverage.rendered += 1;
      }
    } else {
      diagnostics.entitiesMissingRender += 1;
      typeCoverage.missing += 1;
      missingEntityIdSet.add(entity.id);
      if (dimensionCoverage) {
        dimensionCoverage.missing += 1;
        missingDimensionIdSet.add(entity.id);
      }
    }
  }

  diagnostics.missingEntityIds = [...missingEntityIdSet].sort((a, b) => a.localeCompare(b));
  diagnostics.missingDimensionEntityIds = [...missingDimensionIdSet].sort((a, b) => a.localeCompare(b));

  const { meshBuffer, meshMeta } = buildMeshes(meshBuckets, entitiesJson, layerChildren, materialColors, materialIndexByColor);
  diagnostics.meshEntityCount = meshMeta.length;

  const layersJson = layers.map((layer) => ({
    name: layer,
    color: '13421772',
    isHide: false,
    children: layerChildren.get(layer) ?? [],
  }));

  const glxSceneJson = {
    materials: materialColors.map((color) => ({ color })),
    meshes: meshMeta,
    entities: entitiesJson,
    layers: layersJson,
    scenes: [
      {
        name: options.spaceName || 'model',
        children: [],
      },
    ],
  };

  const encoder = new TextEncoder();
  const glxJsonBytes = encoder.encode(JSON.stringify(glxSceneJson));

  const layerIdByName = new Map<string, number>();
  for (let i = 0; i < layers.length; i += 1) {
    layerIdByName.set(layers[i], i + 1);
  }

  return {
    glxJsonBytes,
    glxMeshBuffer: meshBuffer.buffer.slice(meshBuffer.byteOffset, meshBuffer.byteOffset + meshBuffer.byteLength) as ArrayBuffer,
    layerIdByName,
    overlayTexts,
    diagnostics,
  };
}
