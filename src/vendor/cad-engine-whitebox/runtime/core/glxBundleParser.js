import * as THREE from 'three';

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toColorValue(rawColor) {
  if (typeof rawColor === 'string') {
    const trimmed = rawColor.trim();
    if (!trimmed) return 0xc8c8c8;
    if (trimmed.startsWith('#')) {
      const hex = Number.parseInt(trimmed.slice(1), 16);
      if (Number.isFinite(hex)) return hex;
      return 0xc8c8c8;
    }
    if (trimmed.startsWith('0x')) {
      const hex = Number.parseInt(trimmed.slice(2), 16);
      if (Number.isFinite(hex)) return hex;
      return 0xc8c8c8;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(0xffffff, parsed));
    return 0xc8c8c8;
  }

  const n = Number(rawColor);
  if (!Number.isFinite(n)) return 0xc8c8c8;
  return Math.max(0, Math.min(0xffffff, n | 0));
}

function toBooleanValue(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const token = String(value).trim().toLowerCase();
  return token === '1' || token === 'true' || token === 'yes' || token === 'y';
}

function toStringValue(value) {
  return String(value ?? '').trim();
}

function decodePointsFloat64(meshView, baseOffset, byteLength) {
  const valueCount = Math.floor(Math.max(0, byteLength - 1) / 8);
  const pointCount = Math.floor(valueCount / 2);
  const points = [];

  for (let i = 0; i < pointCount; i += 1) {
    const x = meshView.getFloat64(baseOffset + 1 + i * 16, true);
    const y = meshView.getFloat64(baseOffset + 1 + i * 16 + 8, true);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  return points;
}

function buildLinePositions(points, mode) {
  if (!Array.isArray(points) || points.length < 2) return null;

  if (mode === 1) {
    const positions = new Float32Array((points.length - 1) * 6);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const p = (i - 1) * 6;
      positions[p] = a.x;
      positions[p + 1] = a.y;
      positions[p + 2] = 0;
      positions[p + 3] = b.x;
      positions[p + 4] = b.y;
      positions[p + 5] = 0;
    }
    return positions;
  }

  const pairCount = Math.floor(points.length / 2);
  if (pairCount <= 0) return null;
  const positions = new Float32Array(pairCount * 6);
  for (let i = 0; i < pairCount; i += 1) {
    const a = points[i * 2];
    const b = points[i * 2 + 1];
    const p = i * 6;
    positions[p] = a.x;
    positions[p + 1] = a.y;
    positions[p + 2] = 0;
    positions[p + 3] = b.x;
    positions[p + 4] = b.y;
    positions[p + 5] = 0;
  }
  return positions;
}

function buildTriangleMeshGeometry(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const triVertexCount = Math.floor(points.length / 3) * 3;
  if (triVertexCount < 3) return null;
  const positions = new Float32Array(triVertexCount * 3);
  for (let i = 0; i < triVertexCount; i += 1) {
    const p = points[i];
    const base = i * 3;
    positions[base] = p.x;
    positions[base + 1] = p.y;
    positions[base + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildMeshTemplate(meshMeta, materials, meshBytes, meshView) {
  const offset = toFiniteNumber(meshMeta?.offset, 0) | 0;
  const length = toFiniteNumber(meshMeta?.length, 0) | 0;
  if (offset < 0 || length <= 1 || offset + length > meshBytes.byteLength) {
    return null;
  }

  const mode = meshBytes[offset];
  const materialIndex = toFiniteNumber(meshMeta?.material, 0) | 0;
  const materialRaw = materials[materialIndex] || {};
  const colorValue = toColorValue(materialRaw.color);
  const points = decodePointsFloat64(meshView, offset, length);

  if (mode === 2) {
    const geometry = buildTriangleMeshGeometry(points);
    if (!geometry) return null;
    const material = new THREE.MeshBasicMaterial({
      color: colorValue,
      side: THREE.DoubleSide,
    });
    return {
      mode,
      pointCount: geometry.getAttribute('position')?.count || 0,
      object: new THREE.Mesh(geometry, material),
    };
  }

  const positions = buildLinePositions(points, mode);
  if (!positions) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({ color: colorValue });
  return {
    mode,
    pointCount: geometry.getAttribute('position')?.count || 0,
    object: new THREE.LineSegments(geometry, material),
  };
}

function parseEntityText(entity) {
  if (!entity || entity.type !== 2 || typeof entity.extras !== 'object' || !entity.extras) return null;
  const extras = entity.extras;
  const text = String(extras.text ?? '').trim();
  if (!text) return null;

  const height = Math.max(1, toFiniteNumber(extras.h, 120));
  let rotation = toFiniteNumber(extras.ro, 0);
  if (Math.abs(rotation) > Math.PI * 2 + 1e-3) {
    rotation = (rotation * Math.PI) / 180;
  }

  const rawMaskColor = extras.text_mask_color;
  const hasExplicitMaskColor =
    (typeof rawMaskColor === 'string' && rawMaskColor.trim().length > 0) ||
    (typeof rawMaskColor === 'number' && Number.isFinite(rawMaskColor));

  return {
    text,
    x: toFiniteNumber(extras.px, 0),
    y: toFiniteNumber(extras.py, 0),
    height,
    width: Math.max(0, toFiniteNumber(extras.width, 0)),
    rotation,
    color: toColorValue(extras.color),
    widthFactor: Math.max(1e-6, toFiniteNumber(extras.width_factor, 1)),
    oblique: toFiniteNumber(extras.oblique, 0),
    mirroredX: toBooleanValue(extras.mirrored_x),
    mirroredY: toBooleanValue(extras.mirrored_y),
    isMText: toBooleanValue(extras.is_mtext),
    textMask: toBooleanValue(extras.text_mask),
    textMaskPadding: Math.max(0, toFiniteNumber(extras.text_mask_padding, 0.25)),
    textMaskColor: hasExplicitMaskColor ? toColorValue(rawMaskColor) : null,
    textMaskUseCanvasBg: toBooleanValue(extras.text_mask_use_canvas_bg),
    horizontalMode: toStringValue(extras.horizontal_mode),
    verticalMode: toStringValue(extras.vertical_mode),
    attachment: toStringValue(extras.attachment),
    subtype: toStringValue(extras.subtype),
    fontKey: toStringValue(extras.font_key),
    fontStyleName: toStringValue(extras.font_style_name),
    fontName: toStringValue(extras.font_name),
    fontFamily: toStringValue(extras.font_family),
    fontKind: toStringValue(extras.font_kind),
    fontSource: toStringValue(extras.font_source),
  };
}

function parseEntityRefs(entity) {
  if (!entity || entity.type !== 1 || !Array.isArray(entity.meshIds)) return [];
  const out = [];
  for (let i = 0; i < entity.meshIds.length; i += 1) {
    const id = Number(entity.meshIds[i]);
    if (Number.isFinite(id) && id >= 0) {
      out.push(id | 0);
    }
  }
  return out;
}

export function parseGlxBundle(glxJson, meshArrayBuffer) {
  const materials = Array.isArray(glxJson?.materials) ? glxJson.materials : [];
  const meshes = Array.isArray(glxJson?.meshes) ? glxJson.meshes : [];
  const entities = Array.isArray(glxJson?.entities) ? glxJson.entities : [];
  const layers = Array.isArray(glxJson?.layers) ? glxJson.layers : [];

  const meshBytes = new Uint8Array(meshArrayBuffer);
  const meshView = new DataView(meshBytes.buffer, meshBytes.byteOffset, meshBytes.byteLength);

  const meshTemplates = new Map();
  for (let i = 0; i < meshes.length; i += 1) {
    const template = buildMeshTemplate(meshes[i], materials, meshBytes, meshView);
    if (template) {
      template.object.frustumCulled = false;
      meshTemplates.set(i, template);
    }
  }

  const parsedLayers = [];
  for (let i = 0; i < layers.length; i += 1) {
    const layerJson = layers[i] || {};
    const entityIndices = Array.isArray(layerJson.children) ? layerJson.children : [];
    const items = [];

    for (let j = 0; j < entityIndices.length; j += 1) {
      const entityIndex = Number(entityIndices[j]);
      if (!Number.isFinite(entityIndex)) continue;
      const entity = entities[entityIndex];
      if (!entity || typeof entity !== 'object') continue;

      const text = parseEntityText(entity);
      if (text) {
        items.push({ kind: 'text', payload: text });
        continue;
      }

      const meshRefs = parseEntityRefs(entity);
      for (let k = 0; k < meshRefs.length; k += 1) {
        const template = meshTemplates.get(meshRefs[k]);
        if (!template) continue;
        items.push({
          kind: template.mode === 2 ? 'mesh' : 'line',
          payload: template,
        });
      }
    }

    parsedLayers.push({
      id: i + 1,
      name: typeof layerJson.name === 'string' ? layerJson.name : `Layer_${i + 1}`,
      color: typeof layerJson.color === 'string' ? layerJson.color : '13421772',
      isHide: !!layerJson.isHide,
      items,
    });
  }

  return {
    layers: parsedLayers,
  };
}
