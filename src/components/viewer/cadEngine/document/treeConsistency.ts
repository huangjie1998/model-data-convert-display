import type { DwgEntityLite, DwgHierarchyNode } from '@/services/dwgApi';
import type { TreeConsistencyDiagnostics, TreeConsistencySubtypeMismatch, TreeConsistencyTypeMismatch } from '../hooks/contracts';
import { normalizeDimSubtype } from './normalizeDwgDocument';

const CRITICAL_TYPES = ['DIMENSION', 'TEXT', 'MTEXT', 'POLYLINE', 'LINE'] as const;
const CRITICAL_SUBTYPES = ['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF', 'DIM_ALIGNED', 'DIM_ROTATED', 'DIM_ANGULAR', 'DIM_RADIUS', 'DIM_DIAMETER', 'DIM_ORDINATE', 'DIM_ARC_LENGTH'] as const;
const REQUIRED_NODE_FIELDS = ['node_id', 'node_kind', 'label', 'type', 'layer', 'entity_id', 'semantic_type', 'semantic_subtype', 'render_state'] as const;


function normalizeEntitySubtype(entity: DwgEntityLite): string {
  const fromSemantic = String(entity.semantic_subtype ?? '').trim().toUpperCase();
  if (fromSemantic) return fromSemantic;

  const type = String(entity.type ?? '').trim().toUpperCase();
  if (type === 'DIMENSION') {
    const dimKind = (entity.geom?.dimension_payload as Record<string, unknown> | undefined)?.dim_kind ?? entity.geom?.dim_kind;
    return normalizeDimSubtype(dimKind);
  }
  return type || 'UNKNOWN';
}

function normalizeNodeSubtype(node: DwgHierarchyNode): string {
  const fromEntitySubtype = String(node.entity_subtype ?? '').trim().toUpperCase();
  if (fromEntitySubtype) return fromEntitySubtype;
  const fromSemantic = String(node.semantic_subtype ?? '').trim().toUpperCase();
  if (fromSemantic) return fromSemantic;
  return String(node.type ?? '').trim().toUpperCase() || 'UNKNOWN';
}



function flattenHierarchyLeafNodes(nodes: DwgHierarchyNode[]): DwgHierarchyNode[] {
  const out: DwgHierarchyNode[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as DwgHierarchyNode;
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      stack.push(child);
    }
    if (node.node_kind === 'entity' || node.node_kind === 'block_ref') {
      out.push(node);
    }
  }
  return out;
}

function countByType(items: Array<{ type?: string | null }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const key = String(item.type ?? '').trim().toUpperCase();
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function countEntitySubtypes(items: DwgEntityLite[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const key = normalizeEntitySubtype(item);
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function countNodeSubtypes(items: DwgHierarchyNode[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const key = normalizeNodeSubtype(item);
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function normalizeEntityId(value: unknown): string {
  return String(value ?? '').trim();
}

function setDifference(left: Set<string>, right: Set<string>): string[] {
  const out: string[] = [];
  for (const item of left) {
    if (!right.has(item)) out.push(item);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export function buildTreeConsistencyDiagnostics(
  entities: DwgEntityLite[],
  nodes: DwgHierarchyNode[],
  spaceId: string,
  previousOrderBySpace: Map<string, string>
): TreeConsistencyDiagnostics {
  const leafNodes = flattenHierarchyLeafNodes(nodes);
  const entityTypeCounts = countByType(entities);
  const nodeTypeCounts = countByType(leafNodes);
  const entitySubtypeCounts = countEntitySubtypes(entities);
  const nodeSubtypeCounts = countNodeSubtypes(leafNodes);

  const typeMismatches: TreeConsistencyTypeMismatch[] = [];
  for (const type of CRITICAL_TYPES) {
    const entityCount = entityTypeCounts.get(type) ?? 0;
    const treeCount = nodeTypeCounts.get(type) ?? 0;
    if (entityCount !== treeCount) {
      typeMismatches.push({ type, entities: entityCount, hierarchy: treeCount });
    }
  }
  const subtypeMismatches: TreeConsistencySubtypeMismatch[] = [];
  for (const subtype of CRITICAL_SUBTYPES) {
    const entityCount = entitySubtypeCounts.get(subtype) ?? 0;
    const treeCount = nodeSubtypeCounts.get(subtype) ?? 0;
    if (entityCount !== treeCount) {
      subtypeMismatches.push({ subtype, entities: entityCount, hierarchy: treeCount });
    }
  }

  const entityIds = new Set<string>();
  for (const entity of entities) {
    const id = normalizeEntityId(entity.id);
    if (id) entityIds.add(id);
  }

  const hierarchyIds = new Set<string>();
  const orderedHierarchyIds: string[] = [];
  const missingRequiredFields: Array<{ nodeId: string; missing: string[] }> = [];
  for (const node of leafNodes) {
    const missing: string[] = [];
    for (const field of REQUIRED_NODE_FIELDS) {
      const raw = (node as unknown as Record<string, unknown>)[field];
      if (field === 'render_state') {
        if (!raw || typeof raw !== 'object') {
          missing.push(field);
        }
        continue;
      }
      if (raw === null || raw === undefined || String(raw).trim().length === 0) {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      missingRequiredFields.push({ nodeId: String(node.node_id ?? ''), missing });
    }

    const entityId = normalizeEntityId(node.entity_id);
    if (!entityId) continue;
    hierarchyIds.add(entityId);
    orderedHierarchyIds.push(entityId);
  }

  const missingInTree = setDifference(entityIds, hierarchyIds);
  const extraInTree = setDifference(hierarchyIds, entityIds);
  const currentOrderSignature = orderedHierarchyIds.join('|');
  const previousOrderSignature = previousOrderBySpace.get(spaceId);
  const orderStable = previousOrderSignature === undefined || previousOrderSignature === currentOrderSignature;
  previousOrderBySpace.set(spaceId, currentOrderSignature);

  return {
    ok:
      typeMismatches.length === 0 &&
      subtypeMismatches.length === 0 &&
      missingInTree.length === 0 &&
      extraInTree.length === 0 &&
      missingRequiredFields.length === 0 &&
      orderStable,
    spaceId,
    entityCount: entities.length,
    hierarchyCount: leafNodes.length,
    typeMismatches,
    subtypeMismatches,
    missingInTree,
    extraInTree,
    missingRequiredFields,
    orderStable,
  };
}
