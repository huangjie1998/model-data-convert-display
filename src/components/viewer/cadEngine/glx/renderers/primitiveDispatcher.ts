import type { PrimitiveRecord } from '../types';
import { renderArcPrimitive } from './arcRenderer';
import { renderBlockPrimitive } from './blockRenderer';
import { renderCirclePrimitive } from './circleRenderer';
import { renderDimensionPrimitive } from './dimensionRenderer';
import { renderEllipsePrimitive } from './ellipseRenderer';
import { renderLinePrimitive } from './lineRenderer';
import { renderPointPrimitive } from './pointRenderer';
import { renderPolygonPrimitive } from './polygonRenderer';
import { renderPolylinePrimitive } from './polylineRenderer';
import { renderTablePrimitive } from './tableRenderer';

export function renderGraphicPrimitive(kind: string, target: number[], primitive: PrimitiveRecord): boolean {
  switch (kind) {
    case 'line':
      return renderLinePrimitive(target, primitive);
    case 'polyline':
      return renderPolylinePrimitive(target, primitive);
    case 'circle':
      return renderCirclePrimitive(target, primitive);
    case 'arc':
      return renderArcPrimitive(target, primitive);
    case 'ellipse':
      return renderEllipsePrimitive(target, primitive);
    case 'polygon':
      return renderPolygonPrimitive(target, primitive);
    case 'point':
      return renderPointPrimitive(target, primitive);
    case 'dimension':
      return renderDimensionPrimitive(target, primitive);
    case 'block':
      return renderBlockPrimitive(target, primitive);
    case 'table':
      return renderTablePrimitive(target, primitive);
    default:
      return renderLinePrimitive(target, primitive) || renderPolylinePrimitive(target, primitive);
  }
}
