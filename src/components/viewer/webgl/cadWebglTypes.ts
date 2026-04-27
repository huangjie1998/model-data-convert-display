import type { DwgEntityLite } from '@/services/dwgApi';

export interface WebglBuildRequest {
  seq: number;
  entities: DwgEntityLite[];
  visibleEntityIds: string[];
}

export interface WebglBuildSuccess {
  ok: true;
  seq: number;
  lineVertex: Float32Array;
  pointVertex: Float32Array;
  pickEntityIds: string[];
}

export interface WebglBuildFailure {
  ok: false;
  seq: number;
  error: string;
}

export type WebglBuildResponse = WebglBuildSuccess | WebglBuildFailure;

