import type { DwgPrimitive, DwgPrimitivePoint } from '@/services/dwgApi';

function extractLoops(geom: Record<string, unknown>): DwgPrimitivePoint[][] {
  const loops = geom.loops;
  if (!Array.isArray(loops) || loops.length === 0) return [];

  const out: DwgPrimitivePoint[][] = [];
  for (const loop of loops) {
    if (!loop || typeof loop !== 'object') continue;
    const raw = loop as Record<string, unknown>;
    let points: DwgPrimitivePoint[] | undefined;

    // Try edges path
    const edges = raw.edges;
    if (Array.isArray(edges)) {
      const edgePoints: DwgPrimitivePoint[] = [];
      for (const edge of edges) {
        if (!edge || typeof edge !== 'object') continue;
        const er = edge as Record<string, unknown>;
        const sp = er.start_point as DwgPrimitivePoint | undefined;
        const ep = er.end_point as DwgPrimitivePoint | undefined;
        if (sp && typeof sp.x === 'number' && typeof sp.y === 'number') edgePoints.push(sp);
        if (ep && typeof ep.x === 'number' && typeof ep.y === 'number') edgePoints.push(ep);
      }
      if (edgePoints.length >= 3) {
        out.push(edgePoints);
        continue;
      }
    }

    // Try direct points
    const rawPoints = raw.points;
    if (Array.isArray(rawPoints)) {
      points = rawPoints
        .filter((p): p is DwgPrimitivePoint => !!p && typeof (p as Record<string, unknown>).x === 'number' && typeof (p as Record<string, unknown>).y === 'number')
        .map(p => p as DwgPrimitivePoint);
    }
    if (points && points.length >= 3) {
      out.push(points);
    }
  }
  return out;
}

export function buildHatchEntityPrimitives(
  geom: Record<string, unknown>,
  type: string
): DwgPrimitive[] {
  if (type !== 'HATCH' && type !== 'HATCHREGION') return [];
  if (!geom || typeof geom !== 'object') return [];

  const loops = extractLoops(geom);
  if (loops.length === 0) {
    // Fallback: try extracting from deprecated points/vertices
    const rawPoints = geom.points;
    if (Array.isArray(rawPoints) && rawPoints.length >= 3) {
      const pts = rawPoints
        .filter((p): p is DwgPrimitivePoint => !!p && typeof (p as Record<string, unknown>).x === 'number')
        .map(p => p as DwgPrimitivePoint);
      if (pts.length >= 3) {
        loops.push(pts);
      }
    }
  }
  if (loops.length === 0) return [];

  const solid = geom.solid === true;
  const rings = loops.map(loop => loop.map(p => ({ x: Number(p.x), y: Number(p.y), z: Number((p as unknown as Record<string, unknown>).z ?? 0) })));

  return [
    {
      kind: 'polygon',
      rings,
      filled: solid,
      pattern_name: solid ? 'SOLID' : (String(geom.pattern_name ?? '').trim() || undefined),
      pattern_angle: typeof geom.pattern_angle === 'number' ? geom.pattern_angle : undefined,
      pattern_scale: typeof geom.pattern_scale === 'number' ? geom.pattern_scale : undefined,
      pattern_spacing: typeof geom.pattern_spacing === 'number' ? geom.pattern_spacing : undefined,
      subtype: solid ? 'hatch_solid' : 'hatch_boundary',
    },
  ] as DwgPrimitive[];
}
