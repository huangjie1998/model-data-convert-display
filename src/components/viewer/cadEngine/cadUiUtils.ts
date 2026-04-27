import type { DwgHierarchyNode } from '@/services/dwgApi';

export interface FlatRow {
  node: DwgHierarchyNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
}

export interface BboxFocusInfo {
  cx: number;
  cy: number;
  spanX: number;
  spanY: number;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeLayerName(layerRaw: unknown): string {
  const layer = String(layerRaw ?? '').trim();
  return layer || '0';
}

export function parseColor(input: string): string {
  const value = Number.parseInt(input, 10);
  if (!Number.isFinite(value)) return '#e5e7eb';
  return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`;
}

export function flattenHierarchy(nodes: DwgHierarchyNode[], expanded: Set<string>, depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? node.children : [];
    const hasChildren = children.length > 0;
    out.push({ node, depth, expanded: expanded.has(node.node_id), hasChildren });
    if (hasChildren && expanded.has(node.node_id)) {
      flattenHierarchy(children, expanded, depth + 1, out);
    }
  }
  return out;
}

export function collectDefaultExpanded(nodes: DwgHierarchyNode[]): Set<string> {
  const set = new Set<string>();
  for (const node of nodes) {
    if (node.node_kind === 'category') set.add(node.node_id);
  }
  return set;
}

export function bboxInfo(bbox: DwgHierarchyNode['bbox']): BboxFocusInfo | null {
  if (!bbox) return null;
  if (!isFiniteNumber(bbox.min.x) || !isFiniteNumber(bbox.min.y) || !isFiniteNumber(bbox.max.x) || !isFiniteNumber(bbox.max.y)) return null;

  const minX = Math.min(bbox.min.x, bbox.max.x);
  const maxX = Math.max(bbox.min.x, bbox.max.x);
  const minY = Math.min(bbox.min.y, bbox.max.y);
  const maxY = Math.max(bbox.min.y, bbox.max.y);
  return {
    cx: (minX + maxX) * 0.5,
    cy: (minY + maxY) * 0.5,
    spanX: Math.max(1e-6, maxX - minX),
    spanY: Math.max(1e-6, maxY - minY),
  };
}

export function collectNodeEntityIds(nodes: DwgHierarchyNode[]): Map<string, string[]> {
  const out = new Map<string, string[]>();

  const walk = (node: DwgHierarchyNode): string[] => {
    const own = node.entity_id ? [node.entity_id] : [];
    const children = Array.isArray(node.children) ? node.children : [];
    const merged = [...own];

    for (const child of children) {
      merged.push(...walk(child));
    }

    const unique = [...new Set(merged)];
    out.set(node.node_id, unique);
    return unique;
  };

  for (const node of nodes) {
    walk(node);
  }

  return out;
}
