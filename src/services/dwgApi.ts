const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

export interface DwgSpace {
  id: string;
  display_name: string;
  kind: 'model' | 'layout';
}

export interface DwgOpenResponse {
  ok: boolean;
  doc_id: string;
  mode: string;
  parser_revision?: string;
  spaces: DwgSpace[];
  current_space: string;
  warnings: string[];
  shx_outline_mode?: string;
  shx_status?: {
    detected: boolean;
    outline_mode: 'none' | 'oda_vectorize' | 'stub' | 'disabled' | string;
    true_outline: boolean;
    vectorize_attempted: boolean;
    vectorize_attached_count: number;
    vectorize_error?: string | null;
    fallback_text_count?: number;
    vectorize_available?: boolean;
    missing_original_shx_fonts?: string[];
    resolved_original_shx_fonts?: string[];
    fallback_shx_file?: string | null;
    fallback_hit_count?: number;
    diagnostics_unavailable?: boolean;
    debug_match?: {
      vectorize_text_entity_count?: number;
      vectorize_text_keys_count?: number;
      vectorize_primitives_total?: number;
      shape_file_text_true_count?: number;
      attach_candidate_entity_count?: number;
      matched_entity_count?: number;
      unmatched_entity_count?: number;
      no_vectorize_payload_count?: number;
      key_mismatch_count?: number;
      filtered_by_font_kind_count?: number;
      empty_after_optimize_count?: number;
      filtered_non_shx_count?: number;
      vectorize_cache_hit?: boolean;
      vectorize_error?: string;
      vectorize_text_key_samples?: string[];
      unmatched_key_samples?: string[];
      orphan_vectorize_key_samples?: string[];
      key_mismatch_samples?: Array<{
        entity_id?: string;
        handle?: string;
        instance_path?: string[];
        candidate_keys?: string[];
      }>;
    };
  };
}

export interface DwgPickResponse {
  ok: boolean;
  doc_id: string;
  space_id: string;
  selection_scope?: 'block' | 'entity' | string;
  picked: Array<{
    entity_id: string;
    distance: number;
    picked_kind?: 'block' | 'entity' | string;
    parent_block_id?: string | null;
  }>;
}

export interface DwgSnapResponse {
  ok: boolean;
  doc_id: string;
  space_id: string;
  snapped: boolean;
  point: { x: number; y: number; z?: number } | null;
  mode: string | null;
}

export interface DwgMeasureResponse {
  ok: boolean;
  doc_id: string;
  type: 'distance' | 'angle' | string;
  value?: number;
  unit?: string;
  error?: string;
}

export interface DwgEntityResponse {
  ok: boolean;
  doc_id: string;
  entity: Record<string, unknown>;
}

export interface DwgDocFont {
  key: string;
  style_name?: string | null;
  name?: string | null;
  family?: string | null;
  kind: 'ttf' | 'ttc' | 'otf' | 'shx' | 'unknown' | string;
  source?: string | null;
  usage_count: number;
  available: boolean;
  file_name?: string | null;
  file_url?: string | null;
  reason?: string | null;
  fallback_shx_hit?: boolean;
  fallback_shx_file_name?: string | null;
}

export interface DwgPrimitivePoint {
  x: number;
  y: number;
  z?: number;
}

export interface DwgPrimitiveSemanticMeta {
  arrow_tip?: DwgPrimitivePoint;
  arrow_inward?: DwgPrimitivePoint;
  arrow_base_mid?: DwgPrimitivePoint;
  dimension_arrow_role?: string;
  resolved?: {
    color_index?: number | null;
    color_rgb?: string | number | null;
    lineweight_mm?: number | null;
    linetype?: string | null;
  };
  provenance?: Record<string, unknown>;
  annotation_context?: Record<string, unknown>;
  style_ref?: Record<string, unknown>;
}

type DwgPrimitiveCore =
  | {
      kind: 'line';
      start: DwgPrimitivePoint;
      end: DwgPrimitivePoint;
      subtype?: string;
      arrow_style?: string;
      arrow_block?: string;
    }
  | {
      kind: 'polyline';
      points: DwgPrimitivePoint[];
      closed?: boolean;
      start_width?: number;
      end_width?: number;
      global_width?: number;
      segment_widths?: Array<{ segment?: number; start_width?: number; end_width?: number }>;
      subtype?: string;
      arrow_style?: string;
      arrow_block?: string;
    }
  | { kind: 'circle'; center: DwgPrimitivePoint; radius: number }
  | {
      kind: 'arc';
      center: DwgPrimitivePoint;
      radius: number;
      start?: DwgPrimitivePoint;
      end?: DwgPrimitivePoint;
      start_angle?: number;
      end_angle?: number;
    }
  | {
      kind: 'ellipse';
      center: DwgPrimitivePoint;
      rx: number;
      ry: number;
      rotation?: number;
      start?: DwgPrimitivePoint;
      end?: DwgPrimitivePoint;
      start_angle?: number;
      end_angle?: number;
    }
  | {
      kind: 'text';
      text: string;
      position: DwgPrimitivePoint;
      color?: string | number;
      height?: number;
      actual_height?: number;
      actual_width?: number;
      width?: number;
      rotation?: number;
      width_factor?: number;
      oblique?: number;
      horizontal_mode?: string;
      vertical_mode?: string;
      text_vertical?: boolean;
      attachment?: string;
      mirrored_x?: boolean;
      mirrored_y?: boolean;
      is_mtext?: boolean;
      text_mask?: boolean;
      text_mask_padding?: number;
      text_mask_color?: string | number;
      text_mask_use_canvas_bg?: boolean;
      subtype?: string;
      font_key?: string | null;
      font_style_name?: string | null;
      font_name?: string | null;
      font_family?: string | null;
      font_kind?: string | null;
      font_source?: string | null;
    }
  | { kind: 'point'; position: DwgPrimitivePoint; display_size?: number }
  | {
      kind: 'polygon';
      rings: DwgPrimitivePoint[][];
      filled?: boolean;
      pattern_name?: string;
      pattern_angle?: number;
      pattern_scale?: number;
      pattern_spacing?: number;
      wipeout?: boolean;
      arrow_fill?: boolean;
      subtype?: string;
      arrow_style?: string;
      arrow_block?: string;
    };

export type DwgPrimitive = DwgPrimitiveCore & DwgPrimitiveSemanticMeta;

export type DwgGeometry = Record<string, unknown> & {
  primitives?: DwgPrimitive[];
  source_type?: string;
  dim_style_record?: Record<string, unknown> | null;
  dim_header_defaults?: Record<string, unknown> | null;
  dimension_payload?: {
    dim_kind?: string;
    measurement?: number | null;
    formatted_measurement?: string | null;
    display_text?: string | null;
    text_position?: DwgPrimitivePoint | null;
    text_height?: number | null;
    rotation?: number | null;
    style_name?: string | null;
    dimension_style?: string | null;
    arrow_block?: string | null;
    arrow_block1?: string | null;
    arrow_block2?: string | null;
    arrow_size?: number | null;
    dim_style_vars?: Record<string, unknown> | null;
    dim_style_sources?: {
      defaults?: Record<string, unknown>;
      style?: Record<string, unknown>;
      entity_overrides?: Record<string, unknown>;
    } | null;
    dim_value_source_map?: Record<string, unknown> | null;
    dim_line_color_raw?: unknown;
    dim_ext_line_color_raw?: unknown;
    dim_line_color_mode?: string | null;
    dim_ext_line_color_mode?: string | null;
    dim_line_color_value_raw?: unknown;
    dim_ext_line_color_value_raw?: unknown;
    dim_line_color_effective_rgb?: unknown;
    dim_ext_line_color_effective_rgb?: unknown;
    dim_line_color_effective_aci?: number | null;
    dim_ext_line_color_effective_aci?: number | null;
    dim_line_color_effective_source?: string | null;
    dim_ext_line_color_effective_source?: string | null;
    effective_dim_line_color?: unknown;
    effective_ext_line_color?: unknown;
    anchors?: Record<string, unknown>;
    primitive_count?: number;
    renderable?: boolean;
  };
  font_key?: string | null;
  font_style_name?: string | null;
  font_name?: string | null;
  font_family?: string | null;
  font_kind?: string | null;
  font_source?: string | null;
};

export interface DwgEntityLite {
  id: string;
  type: string;
  layer: string;
  space_id: string;
  handle?: string;
  parent_block_id?: string | null;
  instance_path?: string[];
  semantic_type?: string;
  semantic_subtype?: string;
  source_acdb_type?: string;
  geom: DwgGeometry;
  style?: Record<string, unknown>;
  raw_semantics?: Record<string, unknown>;
  normalized_semantics?: Record<string, unknown>;
  mapping_status?: {
    ok?: boolean;
    missing_keys?: string[];
    extra_keys?: string[];
    source_trace_complete?: boolean;
  };
  annotation_context?: Record<string, unknown>;
  style_ref?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  bbox?: {
    min: { x: number; y: number; z?: number };
    max: { x: number; y: number; z?: number };
  };
}

export interface DwgStyleTables {
  layers?: Record<string, Record<string, unknown>>;
  linetypes?: Record<string, Record<string, unknown>>;
  text_styles?: Record<string, Record<string, unknown>>;
  dim_styles?: Record<string, Record<string, unknown>>;
  header_dim_defaults?: Record<string, unknown>;
  blocks?: Record<string, Record<string, unknown>>;
}

export interface DwgEntityListResponse {
  ok: boolean;
  doc_id: string;
  space_id: string;
  space_context?: {
    id: string;
    kind: string;
    display_name: string;
  };
  entities: DwgEntityLite[];
  total_count: number;
  offset?: number;
  limit?: number;
  truncated: boolean;
  style_tables?: DwgStyleTables;
  semantic_contract?: {
    tracks?: string[];
    primitive_fields?: string[];
  };
}

export interface DwgHierarchyNode {
  node_id: string;
  node_kind: 'category' | 'entity' | 'block_ref' | string;
  label: string;
  type?: string;
  semantic_type?: string;
  semantic_subtype?: string;
  category_key?: string;
  category_label?: string;
  entity_subtype?: string;
  layer?: string | null;
  handle?: string | null;
  entity_id?: string | null;
  parent_block_id?: string | null;
  render_state?: {
    primitive_count?: number;
    renderable?: boolean;
    source?: string;
  } | null;
  bbox?: {
    min: { x: number; y: number; z?: number };
    max: { x: number; y: number; z?: number };
  } | null;
  children?: DwgHierarchyNode[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('DWG API request timed out');
      }
      const msg = error.message.toLowerCase();
      if (msg === 'failed to fetch' || msg.includes('networkerror') || msg.includes('network request failed')) {
        throw new Error('Failed to reach DWG backend');
      }
      throw error;
    }
    throw new Error('Failed to reach DWG backend');
  }

  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    if (response.ok) {
      throw new Error(`Invalid JSON response from API: ${text.slice(0, 160) || response.statusText || 'empty response'}`);
    }
    body = {};
  }
  if (!response.ok) {
    throw new Error(body.error || response.statusText || 'request failed');
  }
  return body as T;
}

export async function getDwgHealth() {
  return requestJson(`${API_BASE_URL}/dwg/health`);
}

export async function openDwgDocument(file: File): Promise<DwgOpenResponse> {
  const form = new FormData();
  form.append('file', file);
  return requestJson<DwgOpenResponse>(`${API_BASE_URL}/dwg/open`, {
    method: 'POST',
    body: form,
  });
}

export async function listDwgSpaces(docId: string) {
  return requestJson<{ ok: boolean; doc_id: string; current_space: string; spaces: DwgSpace[] }>(
    `${API_BASE_URL}/dwg/${docId}/spaces`
  );
}

export async function listDwgEntities(docId: string, spaceId?: string, limit?: number, offset?: number) {
  const params = new URLSearchParams();
  if (spaceId) params.set('space_id', spaceId);
  if (typeof limit === 'number' && Number.isFinite(limit)) params.set('limit', String(limit));
  if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) params.set('offset', String(offset));
  const query = params.toString();
  const url = `${API_BASE_URL}/dwg/${docId}/entities${query ? `?${query}` : ''}`;
  return requestJson<DwgEntityListResponse>(url);
}

export async function listDwgHierarchy(docId: string, spaceId?: string) {
  const params = new URLSearchParams();
  if (spaceId) params.set('space_id', spaceId);
  const query = params.toString();
  const url = `${API_BASE_URL}/dwg/${docId}/hierarchy${query ? `?${query}` : ''}`;
  return requestJson<{
    ok: boolean;
    doc_id: string;
    space_id: string;
    nodes: DwgHierarchyNode[];
    total_entity_count: number;
    total_block_ref_count: number;
  }>(url);
}

export async function listDwgFonts(docId: string) {
  return requestJson<{
    ok: boolean;
    doc_id: string;
    fonts: DwgDocFont[];
    count: number;
    warnings?: string[];
    shx_outline_mode?: string;
    shx_diagnostics?: {
      missing_original_shx_fonts?: string[];
      resolved_original_shx_fonts?: string[];
      fallback_shx_file?: string | null;
      fallback_hit_count?: number;
      diagnostics_unavailable?: boolean;
    };
  }>(`${API_BASE_URL}/dwg/${docId}/fonts`);
}

export async function updateDwgView(
  docId: string,
  payload: { space_id?: string; zoom?: number; center?: { x: number; y: number; z?: number } }
) {
  return requestJson(`${API_BASE_URL}/dwg/${docId}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function pickDwgEntity(
  docId: string,
  payload: {
    space_id?: string;
    point: { x: number; y: number; z?: number };
    tolerance?: number;
    selection_scope?: 'block' | 'entity';
    parent_block_id?: string;
  }
) {
  return requestJson<DwgPickResponse>(`${API_BASE_URL}/dwg/${docId}/pick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function snapDwgPoint(
  docId: string,
  payload: {
    space_id?: string;
    point: { x: number; y: number; z?: number };
    tolerance?: number;
    modes?: string[];
  }
) {
  return requestJson<DwgSnapResponse>(`${API_BASE_URL}/dwg/${docId}/snap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function measureDwg(
  docId: string,
  payload:
    | { type: 'distance'; p1: { x: number; y: number; z?: number }; p2: { x: number; y: number; z?: number } }
    | {
        type: 'angle';
        p1: { x: number; y: number; z?: number };
        vertex: { x: number; y: number; z?: number };
        p2: { x: number; y: number; z?: number };
      }
) {
  return requestJson<DwgMeasureResponse>(`${API_BASE_URL}/dwg/${docId}/measure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getDwgEntity(docId: string, entityId: string) {
  return requestJson<DwgEntityResponse>(`${API_BASE_URL}/dwg/${docId}/entity/${encodeURIComponent(entityId)}`);
}

export async function closeDwgDocument(docId: string) {
  return requestJson(`${API_BASE_URL}/dwg/${docId}/close`, {
    method: 'POST',
  });
}
