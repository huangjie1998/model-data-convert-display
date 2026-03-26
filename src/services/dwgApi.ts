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
  spaces: DwgSpace[];
  current_space: string;
  warnings: string[];
}

export interface DwgPickResponse {
  ok: boolean;
  doc_id: string;
  space_id: string;
  picked: Array<{ entity_id: string; distance: number }>;
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

export interface DwgEntityLite {
  id: string;
  type: string;
  layer: string;
  space_id: string;
  geom: Record<string, unknown>;
  bbox?: {
    min: { x: number; y: number; z?: number };
    max: { x: number; y: number; z?: number };
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
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

export async function listDwgEntities(docId: string, spaceId?: string, limit = 6000) {
  const params = new URLSearchParams();
  if (spaceId) params.set('space_id', spaceId);
  if (limit > 0) params.set('limit', String(limit));
  const query = params.toString();
  const url = `${API_BASE_URL}/dwg/${docId}/entities${query ? `?${query}` : ''}`;
  return requestJson<{
    ok: boolean;
    doc_id: string;
    space_id: string;
    entities: DwgEntityLite[];
    total_count: number;
    truncated: boolean;
  }>(url);
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
  payload: { space_id?: string; point: { x: number; y: number; z?: number }; tolerance?: number }
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
