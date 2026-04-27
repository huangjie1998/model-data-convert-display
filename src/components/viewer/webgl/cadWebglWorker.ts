/// <reference lib="webworker" />

import type { DwgEntityLite, DwgPrimitive } from '@/services/dwgApi';
import type { WebglBuildRequest, WebglBuildResponse } from './cadWebglTypes';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

interface Pt {
  x: number;
  y: number;
}

const ARC_SEGMENT_PX = 18;
const CIRCLE_MIN_SEG = 20;
const CIRCLE_MAX_SEG = 200;

function isPoint(v: unknown): v is { x: number; y: number } {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return Number.isFinite(Number(r.x)) && Number.isFinite(Number(r.y));
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function normalizeAngleRad(a: number): number {
  const twoPi = Math.PI * 2;
  let v = a % twoPi;
  if (v < 0) v += twoPi;
  return v;
}

function parseColorHex(input: string): [number, number, number] | null {
  const v = input.trim();
  if (!v.startsWith('#')) return null;
  const body = v.slice(1);
  if (body.length === 3) {
    const r = parseInt(body[0] + body[0], 16);
    const g = parseInt(body[1] + body[1], 16);
    const b = parseInt(body[2] + body[2], 16);
    if ([r, g, b].every(Number.isFinite)) return [r / 255, g / 255, b / 255];
    return null;
  }
  if (body.length !== 6) return null;
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  if ([r, g, b].every(Number.isFinite)) return [r / 255, g / 255, b / 255];
  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c * 0.5;
  return [r + m, g + m, b + m];
}

function colorFromAciRgb(index: number): [number, number, number] {
  const fixedHex: Record<number, string> = {
    0: '#cbd5e1',
    1: '#ff0000',
    2: '#ffff00',
    3: '#00ff00',
    4: '#00ffff',
    5: '#0000ff',
    6: '#ff00ff',
    7: '#ffffff',
    8: '#808080',
    9: '#c0c0c0',
    250: '#333333',
    251: '#444444',
    252: '#555555',
    253: '#666666',
    254: '#777777',
    255: '#888888',
  };
  const hit = fixedHex[index];
  if (hit) {
    const rgb = parseColorHex(hit);
    if (rgb) return rgb;
  }
  const hue = (index * 137.5) % 360;
  return hslToRgb(hue, 0.7, 0.6);
}

function resolveEntityRgb(entity: DwgEntityLite): [number, number, number] {
  const style = entity.style && typeof entity.style === 'object' ? (entity.style as Record<string, unknown>) : {};
  const geom = entity.geom && typeof entity.geom === 'object' ? (entity.geom as Record<string, unknown>) : {};

  const parseTrueColor = (value: unknown): [number, number, number] | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value) && value > 256 && value <= 0xffffff) {
      const n = Math.round(value);
      return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const hex = parseColorHex(raw);
    if (hex) return hex;
    const rgbMatch = raw.match(/\br\s*[:=]?\s*([0-9]{1,3})\D+\bg\s*[:=]?\s*([0-9]{1,3})\D+\bb\s*[:=]?\s*([0-9]{1,3})/i);
    if (rgbMatch) {
      const r = clamp(Number.parseInt(rgbMatch[1], 10), 0, 255) / 255;
      const g = clamp(Number.parseInt(rgbMatch[2], 10), 0, 255) / 255;
      const b = clamp(Number.parseInt(rgbMatch[3], 10), 0, 255) / 255;
      return [r, g, b];
    }
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 256 && n <= 0xffffff) {
        const rounded = Math.round(n);
        return [((rounded >> 16) & 0xff) / 255, ((rounded >> 8) & 0xff) / 255, (rounded & 0xff) / 255];
      }
    }
    return null;
  };
  for (const candidate of [
    style.effective_color_rgb,
    geom.color_rgb,
    style.color_rgb,
    style.effective_color,
    style.color,
    geom.color,
  ]) {
    const parsed = parseTrueColor(candidate);
    if (parsed) return parsed;
  }

  const colorIndexRaw = style.effective_color_index ?? style.color_index ?? geom.color_index;
  if (Number.isFinite(Number(colorIndexRaw)) && Number(colorIndexRaw) >= 0) {
    const idx = Math.round(Number(colorIndexRaw));
    if (idx === 256) return [148 / 255, 163 / 255, 184 / 255];
    return colorFromAciRgb(clamp(idx, 0, 255));
  }

  const colorName = String(style.effective_color ?? style.color ?? geom.color ?? '').trim();
  const fromHex = parseColorHex(colorName);
  if (fromHex) return fromHex;
  if (/^ACI\s+\d+$/i.test(colorName)) {
    const n = Number(colorName.replace(/\D+/g, ''));
    if (Number.isFinite(n)) return colorFromAciRgb(clamp(Math.round(n), 0, 255));
  }
  if (/^foreground$/i.test(colorName)) return colorFromAciRgb(7);
  return [148 / 255, 163 / 255, 184 / 255];
}

function linePush(out: number[], a: Pt, b: Pt, rgb: [number, number, number], pickRgb: [number, number, number]) {
  out.push(a.x, a.y, rgb[0], rgb[1], rgb[2], pickRgb[0], pickRgb[1], pickRgb[2]);
  out.push(b.x, b.y, rgb[0], rgb[1], rgb[2], pickRgb[0], pickRgb[1], pickRgb[2]);
}

function pointPush(out: number[], p: Pt, rgb: [number, number, number], pickRgb: [number, number, number]) {
  out.push(p.x, p.y, rgb[0], rgb[1], rgb[2], pickRgb[0], pickRgb[1], pickRgb[2]);
}

function toPoint(v: unknown): Pt | null {
  if (!isPoint(v)) return null;
  return { x: Number(v.x), y: Number(v.y) };
}

function pointArrayFromUnknown(value: unknown): Pt[] {
  if (!Array.isArray(value)) return [];
  const out: Pt[] = [];
  for (const item of value) {
    const p = toPoint(item);
    if (p) out.push(p);
  }
  return out;
}

function firstPointFromGeom(geom: Record<string, unknown>, keys: string[]): Pt | null {
  for (const k of keys) {
    const p = toPoint(geom[k]);
    if (p) return p;
  }
  return null;
}

function tryConnectOrderedFields(
  geom: Record<string, unknown>,
  keys: string[],
  lineOut: number[],
  rgb: [number, number, number],
  pickRgb: [number, number, number]
): boolean {
  const pts: Pt[] = [];
  for (const key of keys) {
    const p = toPoint(geom[key]);
    if (p) pts.push(p);
  }
  if (pts.length < 2) return false;
  polylineToLines(lineOut, pts, false, rgb, pickRgb);
  return true;
}

function sampleArc(center: Pt, radius: number, startRad: number, sweepRad: number): Pt[] {
  const approx = Math.abs(sweepRad) * Math.max(1, radius);
  const steps = clamp(Math.ceil(approx / ARC_SEGMENT_PX), 8, 220);
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = startRad + sweepRad * t;
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return out;
}

function polylineToLines(out: number[], pts: Pt[], closed: boolean, rgb: [number, number, number], pickRgb: [number, number, number]) {
  if (pts.length < 2) return;
  for (let i = 1; i < pts.length; i += 1) {
    linePush(out, pts[i - 1], pts[i], rgb, pickRgb);
  }
  if (closed && pts.length > 2) {
    linePush(out, pts[pts.length - 1], pts[0], rgb, pickRgb);
  }
}

function primitiveToGeometry(
  primitive: DwgPrimitive,
  lineOut: number[],
  pointOut: number[],
  rgb: [number, number, number],
  pickRgb: [number, number, number]
) {
  if (primitive.kind === 'line') {
    if (!isPoint(primitive.start) || !isPoint(primitive.end)) return;
    linePush(lineOut, primitive.start, primitive.end, rgb, pickRgb);
    return;
  }
  if (primitive.kind === 'polyline') {
    const pts = primitive.points.filter(isPoint).map((p) => ({ x: p.x, y: p.y }));
    polylineToLines(lineOut, pts, Boolean(primitive.closed), rgb, pickRgb);
    return;
  }
  if (primitive.kind === 'polygon') {
    for (const ring of primitive.rings) {
      const pts = ring.filter(isPoint).map((p) => ({ x: p.x, y: p.y }));
      polylineToLines(lineOut, pts, true, rgb, pickRgb);
    }
    return;
  }
  if (primitive.kind === 'circle') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.radius) || primitive.radius <= 0) return;
    const seg = clamp(Math.ceil((Math.PI * 2 * primitive.radius) / ARC_SEGMENT_PX), CIRCLE_MIN_SEG, CIRCLE_MAX_SEG);
    const pts: Pt[] = [];
    for (let i = 0; i <= seg; i += 1) {
      const a = (i / seg) * Math.PI * 2;
      pts.push({
        x: primitive.center.x + primitive.radius * Math.cos(a),
        y: primitive.center.y + primitive.radius * Math.sin(a),
      });
    }
    polylineToLines(lineOut, pts, false, rgb, pickRgb);
    return;
  }
  if (primitive.kind === 'arc') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.radius) || primitive.radius <= 0) return;
    let start = Number(primitive.start_angle);
    let end = Number(primitive.end_angle);
    if (isPoint(primitive.start)) start = (Math.atan2(primitive.start.y - primitive.center.y, primitive.start.x - primitive.center.x) * 180) / Math.PI;
    if (isPoint(primitive.end)) end = (Math.atan2(primitive.end.y - primitive.center.y, primitive.end.x - primitive.center.x) * 180) / Math.PI;
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(end)) end = 360;
    const startRad = (start * Math.PI) / 180;
    let sweep = normalizeAngleRad((end * Math.PI) / 180 - startRad);
    if (Math.abs(sweep) < 1e-6) sweep = Math.PI * 2;
    const pts = sampleArc(primitive.center, primitive.radius, startRad, sweep);
    polylineToLines(lineOut, pts, false, rgb, pickRgb);
    return;
  }
  if (primitive.kind === 'ellipse') {
    if (!isPoint(primitive.center)) return;
    const rx = Number(primitive.rx);
    const ry = Number(primitive.ry);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return;
    const rot = ((Number(primitive.rotation) || 0) * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    let start = Number(primitive.start_angle);
    let end = Number(primitive.end_angle);
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(end)) end = 360;
    const startRad = (start * Math.PI) / 180;
    let sweep = normalizeAngleRad((end * Math.PI) / 180 - startRad);
    if (Math.abs(sweep) < 1e-6) sweep = Math.PI * 2;
    const steps = clamp(Math.ceil((Math.max(rx, ry) * Math.abs(sweep)) / ARC_SEGMENT_PX), 16, 220);
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = startRad + sweep * t;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      pts.push({
        x: primitive.center.x + ex * cosR - ey * sinR,
        y: primitive.center.y + ex * sinR + ey * cosR,
      });
    }
    polylineToLines(lineOut, pts, false, rgb, pickRgb);
    return;
  }
  if (primitive.kind === 'point') {
    if (!isPoint(primitive.position)) return;
    pointPush(pointOut, primitive.position, rgb, pickRgb);
  }
}

function addEntityBboxFallback(entity: DwgEntityLite, lineOut: number[], rgb: [number, number, number], pickRgb: [number, number, number]) {
  const bbox = entity.bbox;
  if (!bbox?.min || !bbox?.max) return;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return;
  const p1 = { x: Math.min(minX, maxX), y: Math.min(minY, maxY) };
  const p2 = { x: Math.max(minX, maxX), y: Math.min(minY, maxY) };
  const p3 = { x: Math.max(minX, maxX), y: Math.max(minY, maxY) };
  const p4 = { x: Math.min(minX, maxX), y: Math.max(minY, maxY) };
  linePush(lineOut, p1, p2, rgb, pickRgb);
  linePush(lineOut, p2, p3, rgb, pickRgb);
  linePush(lineOut, p3, p4, rgb, pickRgb);
  linePush(lineOut, p4, p1, rgb, pickRgb);
}

function entityToGeometry(
  entity: DwgEntityLite,
  lineOut: number[],
  pointOut: number[],
  rgb: [number, number, number],
  pickRgb: [number, number, number]
) {
  const geom = (entity.geom || {}) as Record<string, unknown>;
  const type = String(entity.type || '').toUpperCase();
  const lineBefore = lineOut.length;
  const pointBefore = pointOut.length;
  const primitivesRaw = Array.isArray(geom.primitives) ? (geom.primitives as unknown[]) : [];
  const drawPrimitives = (): boolean => {
    const l0 = lineOut.length;
    const p0 = pointOut.length;
    for (const p of primitivesRaw) {
      if (!p || typeof p !== 'object' || typeof (p as Record<string, unknown>).kind !== 'string') continue;
      primitiveToGeometry(p as DwgPrimitive, lineOut, pointOut, rgb, pickRgb);
    }
    return lineOut.length !== l0 || pointOut.length !== p0;
  };

  if (type === 'LINE') {
    const s = geom.start;
    const e = geom.end;
    if (isPoint(s) && isPoint(e)) linePush(lineOut, s, e, rgb, pickRgb);
    return;
  }
  if (type === 'POLYLINE' || type === 'LWPOLYLINE' || type === 'SPLINE') {
    const raw = (Array.isArray(geom.vertices) ? geom.vertices : Array.isArray(geom.points) ? geom.points : []) as unknown[];
    const pts = raw.filter(isPoint).map((p) => ({ x: p.x, y: p.y }));
    polylineToLines(lineOut, pts, Boolean(geom.closed), rgb, pickRgb);
    return;
  }
  if (type === 'POINT') {
    if (isPoint(geom.position)) pointPush(pointOut, geom.position, rgb, pickRgb);
    return;
  }
  if (type === 'CIRCLE') {
    const c = geom.center;
    const r = Number(geom.radius);
    if (isPoint(c) && Number.isFinite(r) && r > 0) {
      const seg = clamp(Math.ceil((Math.PI * 2 * r) / ARC_SEGMENT_PX), CIRCLE_MIN_SEG, CIRCLE_MAX_SEG);
      const pts: Pt[] = [];
      for (let i = 0; i <= seg; i += 1) {
        const a = (i / seg) * Math.PI * 2;
        pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
      }
      polylineToLines(lineOut, pts, false, rgb, pickRgb);
    }
    return;
  }
  if (type === 'ARC') {
    const c = geom.center;
    const r = Number(geom.radius);
    if (!isPoint(c) || !Number.isFinite(r) || r <= 0) return;
    const s = geom.start;
    const e = geom.end;
    let startRad = Number.NaN;
    let endRad = Number.NaN;
    if (isPoint(s)) startRad = Math.atan2(s.y - c.y, s.x - c.x);
    if (isPoint(e)) endRad = Math.atan2(e.y - c.y, e.x - c.x);
    if (!Number.isFinite(startRad)) {
      const sa = Number(geom.start_angle);
      startRad = Number.isFinite(sa) ? (sa * Math.PI) / 180 : 0;
    }
    if (!Number.isFinite(endRad)) {
      const ea = Number(geom.end_angle);
      endRad = Number.isFinite(ea) ? (ea * Math.PI) / 180 : Math.PI * 2;
    }
    let sweep = normalizeAngleRad(endRad - startRad);
    if (Math.abs(sweep) < 1e-6) sweep = Math.PI * 2;
    const pts = sampleArc(c, r, startRad, sweep);
    polylineToLines(lineOut, pts, false, rgb, pickRgb);
    return;
  }
  if (type === 'ELLIPSE') {
    const c = geom.center;
    const rx = Number(geom.rx);
    const ry = Number(geom.ry);
    const rot = ((Number(geom.rotation) || 0) * Math.PI) / 180;
    if (!isPoint(c) || !Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const startDeg = Number.isFinite(Number(geom.start_angle)) ? Number(geom.start_angle) : 0;
    const endDeg = Number.isFinite(Number(geom.end_angle)) ? Number(geom.end_angle) : 360;
    const startRad = (startDeg * Math.PI) / 180;
    let sweep = normalizeAngleRad((endDeg * Math.PI) / 180 - startRad);
    if (Math.abs(sweep) < 1e-6) sweep = Math.PI * 2;
    const steps = clamp(Math.ceil((Math.max(rx, ry) * Math.abs(sweep)) / ARC_SEGMENT_PX), 16, 220);
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = startRad + sweep * t;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      pts.push({ x: c.x + ex * cosR - ey * sinR, y: c.y + ex * sinR + ey * cosR });
    }
    polylineToLines(lineOut, pts, false, rgb, pickRgb);
    return;
  }
  if (type === 'HATCH') {
    const loops = Array.isArray(geom.loops) ? geom.loops : [];
    let hasLoop = false;
    for (const loop of loops) {
      const raw = Array.isArray((loop as Record<string, unknown>).points) ? ((loop as Record<string, unknown>).points as unknown[]) : [];
      const pts = raw.filter(isPoint).map((p) => ({ x: p.x, y: p.y }));
       if (pts.length >= 2) hasLoop = true;
      polylineToLines(lineOut, pts, true, rgb, pickRgb);
    }
    if (hasLoop) return;
  }
  if (type === 'WIPEOUT') {
    const pts = pointArrayFromUnknown(geom.vertices);
    if (pts.length >= 3) {
      polylineToLines(lineOut, pts, true, rgb, pickRgb);
      return;
    }
  }
  if (type === 'SOLID' || type === 'TRACE' || type === '3DFACE') {
    const pts = pointArrayFromUnknown(geom.vertices);
    if (pts.length >= 3) {
      polylineToLines(lineOut, pts, true, rgb, pickRgb);
      return;
    }
    if (
      tryConnectOrderedFields(
        geom,
        ['p1', 'p2', 'p3', 'p4', 'v1', 'v2', 'v3', 'v4'],
        lineOut,
        rgb,
        pickRgb
      )
    ) {
      return;
    }
  }
  if (type === 'XLINE' || type === 'RAY') {
    const origin = firstPointFromGeom(geom, ['start', 'origin', 'position']);
    const through = firstPointFromGeom(geom, ['through', 'end', 'second_point']);
    if (origin && through) {
      linePush(lineOut, origin, through, rgb, pickRgb);
      return;
    }
  }
  if (type === 'LEADER') {
    const points =
      pointArrayFromUnknown(geom.points).length >= 2
        ? pointArrayFromUnknown(geom.points)
        : pointArrayFromUnknown(geom.vertices).length >= 2
          ? pointArrayFromUnknown(geom.vertices)
          : pointArrayFromUnknown(geom.leader_points);
    if (points.length >= 2) {
      polylineToLines(lineOut, points, false, rgb, pickRgb);
      return;
    }
    if (
      tryConnectOrderedFields(
        geom,
        ['start', 'vertex', 'end', 'arrow_tip', 'landing', 'text_position'],
        lineOut,
        rgb,
        pickRgb
      )
    ) {
      return;
    }
  }
  if (type === 'DIMENSION') {
    if (drawPrimitives()) return;
    const arrays = ['definition_points', 'def_points', 'points', 'line_points', 'vertices'];
    for (const k of arrays) {
      const pts = pointArrayFromUnknown(geom[k]);
      if (pts.length >= 2) {
        polylineToLines(lineOut, pts, false, rgb, pickRgb);
        return;
      }
    }
    if (
      tryConnectOrderedFields(
        geom,
        ['xline1', 'xline2', 'dim_line_point', 'text_position'],
        lineOut,
        rgb,
        pickRgb
      )
    ) {
      return;
    }
    if (
      tryConnectOrderedFields(
        geom,
        ['defpoint', 'defpoint2', 'defpoint3', 'defpoint4'],
        lineOut,
        rgb,
        pickRgb
      )
    ) {
      return;
    }
  }
  if (type === 'BLOCK_REF' || type === 'INSERT') {
    if (drawPrimitives()) return;
    const insert = firstPointFromGeom(geom, ['position', 'insert', 'insertion_point']);
    if (insert) pointPush(pointOut, insert, rgb, pickRgb);
    addEntityBboxFallback(entity, lineOut, rgb, pickRgb);
    return;
  }
  drawPrimitives();
  if (lineOut.length === lineBefore && pointOut.length === pointBefore) {
    if (type !== 'TEXT' && type !== 'MTEXT' && type !== 'ATTRIB' && type !== 'ATTDEF') {
      addEntityBboxFallback(entity, lineOut, rgb, pickRgb);
    }
  }
}

function buildPayload(req: WebglBuildRequest): WebglBuildResponse {
  try {
    const visibleIds = Array.isArray(req.visibleEntityIds) ? req.visibleEntityIds : [];
    const useVisibleFilter = visibleIds.length > 0;
    const visible = useVisibleFilter ? new Set(visibleIds) : null;
    const lineVertex: number[] = [];
    const pointVertex: number[] = [];
    const pickEntityIds: string[] = [];
    const pickIndexById = new Map<string, number>();

    for (const entity of req.entities) {
      if (visible && !visible.has(entity.id)) continue;
      let pickIdx = pickIndexById.get(entity.id);
      if (!pickIdx) {
        pickEntityIds.push(entity.id);
        pickIdx = pickEntityIds.length;
        pickIndexById.set(entity.id, pickIdx);
      }
      const rgb = resolveEntityRgb(entity);
      const r = (pickIdx & 0xff) / 255;
      const g = ((pickIdx >> 8) & 0xff) / 255;
      const b = ((pickIdx >> 16) & 0xff) / 255;
      entityToGeometry(entity, lineVertex, pointVertex, rgb, [r, g, b]);
    }

    return {
      ok: true,
      seq: req.seq,
      lineVertex: new Float32Array(lineVertex),
      pointVertex: new Float32Array(pointVertex),
      pickEntityIds,
    };
  } catch (error) {
    return {
      ok: false,
      seq: req.seq,
      error: error instanceof Error ? error.message : 'geometry worker failed',
    };
  }
}

workerScope.onmessage = (event: MessageEvent<WebglBuildRequest>) => {
  const out = buildPayload(event.data);
  if (out.ok) {
    workerScope.postMessage(out, [out.lineVertex.buffer as ArrayBuffer, out.pointVertex.buffer as ArrayBuffer]);
  } else {
    workerScope.postMessage(out);
  }
};
