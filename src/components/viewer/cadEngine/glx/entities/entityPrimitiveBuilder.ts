import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';
import { buildArcEntityPrimitives } from './arcEntity';
import { buildBlockEntityPrimitives } from './blockEntity';
import { buildCircleEntityPrimitives } from './circleEntity';
import { buildDimensionEntityPrimitives } from './dimensionEntity';
import { buildEllipseEntityPrimitives } from './ellipseEntity';
import { buildGenericEntityPrimitives } from './genericEntity';
import { buildHatchEntityPrimitives } from './hatchEntity';
import { buildLineEntityPrimitives } from './lineEntity';
import { buildMTextEntityPrimitives } from './mtextEntity';
import { buildPointEntityPrimitives } from './pointEntity';
import { buildPolylineEntityPrimitives } from './polylineEntity';
import { buildSplineEntityPrimitives } from './splineEntity';
import { buildTableEntityPrimitives } from './tableEntity';
import { buildTextEntityPrimitives } from './textEntity';
import { cadEntityType } from './entityType';

const GEOMETRY_BUILDERS = [
  buildLineEntityPrimitives,
  buildPolylineEntityPrimitives,
  buildSplineEntityPrimitives,
  buildCircleEntityPrimitives,
  buildArcEntityPrimitives,
  buildEllipseEntityPrimitives,
  buildTextEntityPrimitives,
  buildMTextEntityPrimitives,
  buildPointEntityPrimitives,
  buildHatchEntityPrimitives,
];

export function buildEntityPrimitivesByCategory(entity: DwgEntityLite): DwgPrimitive[] {
  const geom = (entity.geom ?? {}) as Record<string, unknown>;
  const type = cadEntityType(entity);

  for (const builder of GEOMETRY_BUILDERS) {
    const primitives = builder(geom, type);
    if (primitives.length > 0) return primitives;
  }

  const dimensionPrimitives = buildDimensionEntityPrimitives(entity, geom, type);
  if (dimensionPrimitives.length > 0) return dimensionPrimitives;

  const blockPrimitives = buildBlockEntityPrimitives(entity, type);
  if (blockPrimitives.length > 0) return blockPrimitives;

  const tablePrimitives = buildTableEntityPrimitives(entity, type);
  if (tablePrimitives.length > 0) return tablePrimitives;

  return buildGenericEntityPrimitives(geom);
}
