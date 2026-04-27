import type { DwgEntityLite, DwgHierarchyNode } from '@/services/dwgApi';

export function normalizeDimSubtype(kindRaw: unknown): string {
  const kind = String(kindRaw ?? '').trim().toLowerCase();
  if (kind === 'aligned') return 'DIM_ALIGNED';
  if (kind === 'rotated') return 'DIM_ROTATED';
  if (kind === 'angular') return 'DIM_ANGULAR';
  if (kind === 'radius') return 'DIM_RADIUS';
  if (kind === 'diameter') return 'DIM_DIAMETER';
  if (kind === 'ordinate') return 'DIM_ORDINATE';
  if (kind === 'arc_length') return 'DIM_ARC_LENGTH';
  return 'DIM_GENERIC';
}

export function normalizeEntityForViewer(entity: DwgEntityLite, fallbackSpaceId: string): DwgEntityLite {
  const bbox =
    entity.bbox &&
    Number.isFinite(entity.bbox.min?.x) &&
    Number.isFinite(entity.bbox.min?.y) &&
    Number.isFinite(entity.bbox.max?.x) &&
    Number.isFinite(entity.bbox.max?.y)
      ? {
          min: { x: entity.bbox.min.x, y: entity.bbox.min.y, z: Number(entity.bbox.min?.z ?? 0) },
          max: { x: entity.bbox.max.x, y: entity.bbox.max.y, z: Number(entity.bbox.max?.z ?? 0) },
        }
      : undefined;

  const geomRaw = (entity.geom ?? {}) as Record<string, unknown>;
  const dimensionPayloadRaw =
    geomRaw.dimension_payload && typeof geomRaw.dimension_payload === 'object'
      ? (geomRaw.dimension_payload as Record<string, unknown>)
      : null;

  // Keep only fields needed by: GLX build/render, layer grouping, pick-focus bbox.
  return {
    id: String(entity.id ?? ''),
    type: String(entity.type ?? ''),
    layer: String(entity.layer ?? '0'),
    space_id: String(entity.space_id ?? fallbackSpaceId),
    handle: entity.handle ? String(entity.handle) : undefined,
    parent_block_id: typeof entity.parent_block_id === 'string' ? entity.parent_block_id : null,
    instance_path: Array.isArray(entity.instance_path) ? entity.instance_path.map((item) => String(item)) : undefined,
    semantic_type: entity.semantic_type ? String(entity.semantic_type) : undefined,
    semantic_subtype: entity.semantic_subtype ? String(entity.semantic_subtype) : undefined,
    source_acdb_type: entity.source_acdb_type ? String(entity.source_acdb_type) : undefined,
    geom: {
      ...(entity.geom ?? {}),
      ...(dimensionPayloadRaw
        ? {
            dimension_payload: {
              ...dimensionPayloadRaw,
              dim_kind: String(dimensionPayloadRaw.dim_kind ?? ''),
            },
          }
        : {}),
    } as DwgEntityLite['geom'],
    style: entity.style && typeof entity.style === 'object' ? entity.style : undefined,
    bbox,
  };
}

export function normalizeHierarchyNode(node: DwgHierarchyNode): DwgHierarchyNode {
  const bbox =
    node.bbox &&
    Number.isFinite(node.bbox.min?.x) &&
    Number.isFinite(node.bbox.min?.y) &&
    Number.isFinite(node.bbox.max?.x) &&
    Number.isFinite(node.bbox.max?.y)
      ? {
          min: { x: node.bbox.min.x, y: node.bbox.min.y, z: Number(node.bbox.min?.z ?? 0) },
          max: { x: node.bbox.max.x, y: node.bbox.max.y, z: Number(node.bbox.max?.z ?? 0) },
        }
      : null;

  // Keep only fields needed by sidebar tree, visibility toggles and locate.
  return {
    node_id: String(node.node_id ?? ''),
    node_kind: node.node_kind ?? 'category',
    label: String((node.category_label && node.node_kind === 'category' ? node.category_label : node.label) ?? ''),
    type: node.type ?? undefined,
    semantic_type: node.semantic_type ? String(node.semantic_type) : undefined,
    semantic_subtype: node.semantic_subtype ? String(node.semantic_subtype) : undefined,
    category_key: node.category_key ? String(node.category_key) : undefined,
    category_label: node.category_label ? String(node.category_label) : undefined,
    entity_subtype: node.entity_subtype ? String(node.entity_subtype) : undefined,
    layer: node.layer ?? null,
    handle: node.handle ?? null,
    entity_id: node.entity_id ?? null,
    parent_block_id: node.parent_block_id ?? null,
    render_state:
      node.render_state && typeof node.render_state === 'object'
        ? {
            primitive_count: Number(node.render_state.primitive_count ?? 0),
            renderable: node.render_state.renderable === true,
            source: String(node.render_state.source ?? ''),
          }
        : null,
    bbox,
    children: Array.isArray(node.children) ? node.children.map(normalizeHierarchyNode) : [],
  };
}
