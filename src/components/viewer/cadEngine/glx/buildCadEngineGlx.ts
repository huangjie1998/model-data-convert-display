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

/**
 * Ear-clipping triangulation for simple polygons (convex or concave).
 * Returns triangle indices as flat array [i0,i1,i2, i0,i1,i2, ...].
 */
function earClipTriangles(pts: Array<[number, number]>): number[] {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Signed area: positive = CCW, negative = CW
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  const ccw = area2 > 0;

  // Working index list
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(i);

  const result: number[] = [];
  let remaining = n;
  let safetyCounter = remaining * 3; // prevent infinite loops on degenerate input

  while (remaining > 2 && safetyCounter-- > 0) {
    let earFound = false;
    for (let i = 0; i < remaining; i++) {
      const prev = (i + remaining - 1) % remaining;
      const next = (i + 1) % remaining;
      const ai = indices[prev];
      const bi = indices[i];
      const ci = indices[next];
      const ax = pts[ai][0], ay = pts[ai][1];
      const bx = pts[bi][0], by = pts[bi][1];
      const cx = pts[ci][0], cy = pts[ci][1];

      // Cross product: determines convexity at vertex b
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (ccw ? cross <= 0 : cross >= 0) continue; // reflex vertex

      // Check no other vertex lies inside this triangle
      let hasInteriorPoint = false;
      for (let k = 0; k < remaining; k++) {
        const ki = indices[k];
        if (ki === ai || ki === bi || ki === ci) continue;
        const px = pts[ki][0], py = pts[ki][1];
        const d1 = sign(px, py, ax, ay, bx, by);
        const d2 = sign(px, py, bx, by, cx, cy);
        const d3 = sign(px, py, cx, cy, ax, ay);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) {
          hasInteriorPoint = true;
          break;
        }
      }
      if (hasInteriorPoint) continue;

      // This is an ear
      result.push(ai, bi, ci);
      indices.splice(i, 1);
      remaining--;
      earFound = true;
      break;
    }
    if (!earFound) break; // degenerate polygon
  }
  return result;
}

function sign(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - px) * (by - py) - (bx - px) * (ay - py);
}

function isConvex(pts: Array<[number, number]>): boolean {
  const n = pts.length;
  if (n < 3) return true;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  const ccw = area2 > 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const k = (i + 2) % n;
    const cross = (pts[j][0] - pts[i][0]) * (pts[k][1] - pts[i][1])
                - (pts[j][1] - pts[i][1]) * (pts[k][0] - pts[i][0]);
    if (ccw ? cross < 0 : cross > 0) return false;
  }
  return true;
}

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

  const shellPts: Array<[number, number]> = shell.map((p) => {
    const xy = pointXY(p);
    return xy ? [xy[0], xy[1]] : [0, 0];
  });

  // Use fast fan triangulation for convex polygons, ear-clipping for concave
  let indices: number[];
  if (shellPts.length <= 3 || isConvex(shellPts)) {
    // Fan triangulation (fast path for convex shapes)
    indices = [];
    for (let i = 1; i + 1 < shellPts.length; i += 1) {
      indices.push(0, i, i + 1);
    }
  } else {
    // Ear-clipping (handles concave polygons correctly)
    indices = earClipTriangles(shellPts);
  }

  let triCount = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = shellPts[indices[t]];
    const b = shellPts[indices[t + 1]];
    const c = shellPts[indices[t + 2]];
    if (!a || !b || !c) continue;
    target.push(a[0], a[1]);
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
  const hiddenEntityIds = options.hiddenEntityIds ?? new Set<string>();
  const emitEngineText = options.emitEngineText ?? true;

  const layers = layerOrderFromEntities(entities);
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
    if (hiddenEntityIds.has(entity.id)) {
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
