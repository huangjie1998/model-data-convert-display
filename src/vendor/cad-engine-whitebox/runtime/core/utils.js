export function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

export function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function colorToCss(input) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed[0] === '#') {
      return trimmed;
    }
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return colorToCss(asNumber);
    }
    return '#c8c8c8';
  }

  const value = Number(input);
  if (!Number.isFinite(value)) {
    return '#c8c8c8';
  }

  const intValue = value | 0;
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgb(${r},${g},${b})`;
}

export function createMaterial(colorValue) {
  let colorCss = colorToCss(colorValue);
  return {
    clipping: false,
    clippingPlanes: [],
    clipShadows: false,
    transparent: false,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    needsUpdate: false,
    color: {
      set(nextColor) {
        colorCss = colorToCss(nextColor);
      },
    },
    get cssColor() {
      return colorCss;
    },
  };
}

export function createGeometry(pointCount) {
  return {
    attributes: {
      position: {
        count: Math.max(0, pointCount | 0),
      },
    },
  };
}

export function parseMeshChunk(dataView, byteOffset, byteLength, type) {
  const floatCount = Math.floor(Math.max(0, byteLength - 1) / 8);
  const pointCount = Math.floor(floatCount / 2);
  const points = new Array(pointCount);
  const baseOffset = byteOffset + 1;

  for (let i = 0; i < pointCount; i += 1) {
    const x = dataView.getFloat64(baseOffset + i * 16, true);
    const y = dataView.getFloat64(baseOffset + i * 16 + 8, true);
    points[i] = { x, y };
  }

  return {
    type,
    points,
  };
}

export function findBundleFile(files, extName) {
  if (!Array.isArray(files)) return null;
  const extLower = `.${extName.toLowerCase()}`;

  for (let i = 0; i < files.length; i += 1) {
    const item = files[i];
    if (!item || typeof item !== 'object') continue;
    const model3DName = typeof item.model3DName === 'string' ? item.model3DName : '';
    const url = typeof item.url === 'string' ? item.url : '';
    const sourceName = (model3DName || url).toLowerCase();
    if (sourceName.endsWith(extLower)) {
      return item;
    }
  }

  return null;
}

export function createLayerState(layerJson, index) {
  return {
    id: index + 1,
    name: typeof layerJson.name === 'string' ? layerJson.name : `Layer_${index + 1}`,
    color: typeof layerJson.color === 'string' ? layerJson.color : '13421772',
    isHide: !!layerJson.isHide,
    checked: !layerJson.isHide,
  };
}
