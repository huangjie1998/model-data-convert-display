import * as THREE from 'three';
import { ShxFont } from '@mlightcad/shx-parser/dist/index.es.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { clamp, colorToCss, findBundleFile, toFiniteNumber } from '../core/utils.js';
import { parseGlxBundle } from '../core/glxBundleParser.js';
import {
  TEXT_LINE_HEIGHT_FACTOR,
  makeShearMatrix,
  normalizeBigFontScale,
  normalizeCadTextForDisplay,
  normalizeCurveSegments,
  normalizeObliqueToRadians,
  normalizeTextHeightScale,
  safeWidthFactor,
} from '../text/cadTextNormalize.js';
import { layoutCadText } from '../text/textLayout.js';
import { wrapSingleLineToWidth } from '../text/textWrap.js';
import { textCanvasWidthFactorFromTargetWidth, textHorizontalScaleFromTargetWidth } from './textScaleStrategy.js';

const TEXT_MASK_RENDER_ORDER = 9998;
const TEXT_RENDER_ORDER = 9999;
const MAX_TEXT_MISSING_GLYPH_SAMPLES = 24;

function getViewportSize(renderer, container) {
  const width = Math.max(
    1,
    Math.floor((container && container.clientWidth) || renderer.domElement.clientWidth || window.innerWidth || 1)
  );
  const height = Math.max(
    1,
    Math.floor((container && container.clientHeight) || renderer.domElement.clientHeight || window.innerHeight || 1)
  );
  return { width, height };
}

function updateCameraHelpers(camera, renderer, container) {
  camera.sceneToScreen = (point) => {
    if (!point) return null;
    const x = toFiniteNumber(point.x, 0);
    const y = toFiniteNumber(point.y, 0);
    const vp = getViewportSize(renderer, container);
    const zoom = Math.max(1e-6, toFiniteNumber(camera.zoom, 1));
    return {
      x: (x - camera.position.x) * zoom + vp.width * 0.5,
      y: vp.height * 0.5 - (y - camera.position.y) * zoom,
    };
  };

  camera.screenToScene = (point) => {
    if (!point) return null;
    const sx = toFiniteNumber(point.x, 0);
    const sy = toFiniteNumber(point.y, 0);
    const vp = getViewportSize(renderer, container);
    const zoom = Math.max(1e-6, toFiniteNumber(camera.zoom, 1));
    return {
      x: (sx - vp.width * 0.5) / zoom + camera.position.x,
      y: (vp.height * 0.5 - sy) / zoom + camera.position.y,
      z: 0,
    };
  };
}

function decodeGlxJson(glxArrayBuffer) {
  const decoder = new TextDecoder();
  const jsonText = decoder.decode(new Uint8Array(glxArrayBuffer));
  return JSON.parse(jsonText);
}

function createLayerState(layerJson) {
  return {
    id: layerJson.id,
    name: layerJson.name,
    color: layerJson.color,
    isHide: !!layerJson.isHide,
    checked: !layerJson.isHide,
    group: null,
  };
}

function disposeObject3D(root) {
  if (!root || typeof root.traverse !== 'function') return;
  const disposeMaterial = (material) => {
    if (!material) return;
    if (material.map && typeof material.map.dispose === 'function') {
      material.map.dispose();
    }
    if (typeof material.dispose === 'function') {
      material.dispose();
    }
  };
  root.traverse((node) => {
    const geometry = node.geometry;
    if (geometry && typeof geometry.dispose === 'function') {
      geometry.dispose();
    }
    const material = node.material;
    if (Array.isArray(material)) {
      for (let i = 0; i < material.length; i += 1) {
        disposeMaterial(material[i]);
      }
    } else {
      disposeMaterial(material);
    }
  });
}

function glyphMapFromFont(font) {
  const glyphs = font?.data?.glyphs;
  if (!glyphs || typeof glyphs !== 'object') return null;
  return glyphs;
}

function hasGlyph(glyphs, char) {
  if (!glyphs || !char) return true;
  return Object.prototype.hasOwnProperty.call(glyphs, char);
}

export class Scene3D {
  constructor(options = {}) {
    this._options = options;
    this._container = this._options.container || null;
    this.background = colorToCss(0x33334c);
    this.fontPath = null;
    this.shxStrokeTextEnabled = this._options.shxStrokeTextEnabled !== false;
    this.shxFontPath = this._options.shxFontPath || '/vendor/fonts/shx/txt.shx';
    this.shxBigFontPath = this._options.shxBigFontPath || '/vendor/fonts/shx/EngineeringChinese.shx';
    this.shxBigFontMapPath = this._options.shxBigFontMapPath || '/vendor/fonts/shx/EngineeringChinese.gb2312-map.json';
    this.shxBigFontScale = normalizeBigFontScale(this._options.shxBigFontScale);
    this.shxTextHeightScale = normalizeTextHeightScale(this._options.shxTextHeightScale, 1.12);
    this.shxMTextHeightScale = normalizeTextHeightScale(this._options.shxMTextHeightScale, 1.08);
    this.textCurveSegments = normalizeCurveSegments(this._options.textCurveSegments);
    this.needsUpdateGPUData = false;

    this._layers = [];
    this._layerVisibleById = new Map();
    this._parsedFont = null;
    this._fontPromise = null;
    this._shxFont = null;
    this._shxBigFont = null;
    this._shxBigFontCodeMap = null;
    this._shxFontPromise = null;
    this._loadedShxFontPath = null;
    this._loadedShxBigFontPath = null;
    this._loadedShxBigFontMapPath = null;
    this._shxLoadError = null;
    this._textDiagnostics = this._createTextDiagnostics();

    this._renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this._renderer.domElement.className = 'biz-canvas3d cad-runtime-canvas';
    this._renderer.domElement.style.position = 'absolute';
    this._renderer.domElement.style.left = '0';
    this._renderer.domElement.style.top = '0';
    this._renderer.domElement.style.width = '100%';
    this._renderer.domElement.style.height = '100%';
    this._renderer.localClippingEnabled = false;

    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    this._renderer.setPixelRatio(pixelRatio);

    const target = this._container || document.body;
    target.appendChild(this._renderer.domElement);

    const vp = getViewportSize(this._renderer, this._container);
    this._renderer.setSize(vp.width, vp.height, false);

    this.camera = new THREE.OrthographicCamera(-vp.width * 0.5, vp.width * 0.5, vp.height * 0.5, -vp.height * 0.5, 0.1, 1e9);
    this.camera.position.set(0, 0, 1000);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    updateCameraHelpers(this.camera, this._renderer, this._container);

    this.controls = { enabled: false };

    this.MainScene = new THREE.Group();
    this.MainScene.name = 'MainScene';
    this.scenes = new THREE.Group();
    this.scenes.name = 'CadRuntimeRoot';
    this.scenes.add(this.MainScene);
  }

  resizeView() {
    const vp = getViewportSize(this._renderer, this._container);
    this._renderer.setSize(vp.width, vp.height, false);

    this.camera.left = -vp.width * 0.5;
    this.camera.right = vp.width * 0.5;
    this.camera.top = vp.height * 0.5;
    this.camera.bottom = -vp.height * 0.5;
    this.camera.updateProjectionMatrix();
    this.needsUpdateGPUData = true;
  }

  _fetchArrayBuffer(url) {
    return fetch(String(url)).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${String(url)} (${response.status})`);
      }
      return response.arrayBuffer();
    });
  }

  _fetchJson(url) {
    return fetch(String(url)).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${String(url)} (${response.status})`);
      }
      return response.json();
    });
  }

  _loadFontAsset() {
    if (this._parsedFont) {
      return Promise.resolve(this._parsedFont);
    }
    if (this._fontPromise) {
      return this._fontPromise;
    }

    const fontPath = this.fontPath || './assets/FangSong_GB2312_Regular.json';
    this._textDiagnostics.fontPath = fontPath;
    const loader = new FontLoader();
    this._fontPromise = new Promise((resolve, reject) => {
      loader.load(
        fontPath,
        (font) => {
          this._parsedFont = font;
          resolve(font);
        },
        undefined,
        (error) => {
          reject(error || new Error(`Failed to load font asset: ${fontPath}`));
        }
      );
    }).finally(() => {
      this._fontPromise = null;
    });

    return this._fontPromise;
  }

  _releaseShxFontAssets() {
    if (this._shxFont && typeof this._shxFont.release === 'function') {
      this._shxFont.release();
    }
    if (this._shxBigFont && typeof this._shxBigFont.release === 'function') {
      this._shxBigFont.release();
    }
    this._shxFont = null;
    this._shxBigFont = null;
    this._shxBigFontCodeMap = null;
    this._loadedShxFontPath = null;
    this._loadedShxBigFontPath = null;
    this._loadedShxBigFontMapPath = null;
  }

  _loadShxFontAssets() {
    if (this.shxStrokeTextEnabled !== true) {
      this._textDiagnostics.shxStrokeTextEnabled = false;
      return Promise.resolve(null);
    }

    const fontPath = String(this.shxFontPath || '').trim();
    const bigFontPath = String(this.shxBigFontPath || '').trim();
    const mapPath = String(this.shxBigFontMapPath || '').trim();
    this._textDiagnostics.shxStrokeTextEnabled = true;
    this._textDiagnostics.shxFontPath = fontPath || null;
    this._textDiagnostics.shxBigFontPath = bigFontPath || null;
    this._textDiagnostics.shxBigFontMapPath = mapPath || null;

    const pathsUnchanged =
      this._loadedShxFontPath === fontPath &&
      this._loadedShxBigFontPath === bigFontPath &&
      this._loadedShxBigFontMapPath === mapPath;
    if (pathsUnchanged && this._shxFont) {
      return Promise.resolve({ font: this._shxFont, bigFont: this._shxBigFont, codeMap: this._shxBigFontCodeMap });
    }
    if (this._shxFontPromise) {
      return this._shxFontPromise;
    }

    this._releaseShxFontAssets();
    this._shxLoadError = null;
    const loadFont = async (url) => new ShxFont(await this._fetchArrayBuffer(url));

    this._shxFontPromise = Promise.allSettled([
      fontPath ? loadFont(fontPath) : Promise.reject(new Error('SHX font path is empty')),
      bigFontPath ? loadFont(bigFontPath) : Promise.resolve(null),
      mapPath ? this._fetchJson(mapPath) : Promise.resolve(null),
    ])
      .then(([fontResult, bigFontResult, mapResult]) => {
        const errors = [];
        if (fontResult.status === 'fulfilled') {
          this._shxFont = fontResult.value;
          this._loadedShxFontPath = fontPath;
        } else {
          errors.push(`font: ${fontResult.reason?.message || String(fontResult.reason)}`);
        }

        if (bigFontResult.status === 'fulfilled') {
          this._shxBigFont = bigFontResult.value;
          this._loadedShxBigFontPath = bigFontPath;
        } else {
          errors.push(`bigfont: ${bigFontResult.reason?.message || String(bigFontResult.reason)}`);
        }

        if (mapResult.status === 'fulfilled') {
          this._shxBigFontCodeMap = mapResult.value && typeof mapResult.value === 'object' ? mapResult.value : null;
          this._loadedShxBigFontMapPath = mapPath;
        } else {
          errors.push(`map: ${mapResult.reason?.message || String(mapResult.reason)}`);
        }

        this._shxLoadError = errors.length ? errors.join('; ') : null;
        this._textDiagnostics.shxLoadError = this._shxLoadError;
        return { font: this._shxFont, bigFont: this._shxBigFont, codeMap: this._shxBigFontCodeMap };
      })
      .finally(() => {
        this._shxFontPromise = null;
      });

    return this._shxFontPromise;
  }

  _clearSceneGraph() {
    for (let i = this.MainScene.children.length - 1; i >= 0; i -= 1) {
      const child = this.MainScene.children[i];
      this.MainScene.remove(child);
      disposeObject3D(child);
    }
    this._layers = [];
    this._layerVisibleById.clear();
    this._textDiagnostics = this._createTextDiagnostics();
  }

  _createTextDiagnostics() {
    return {
      fontFamily: null,
      fontPath: this.fontPath || null,
      curveSegments: normalizeCurveSegments(this.textCurveSegments),
      renderMode: null,
      shxStrokeTextEnabled: this.shxStrokeTextEnabled === true,
      shxFontPath: this.shxFontPath || null,
      shxBigFontPath: this.shxBigFontPath || null,
      shxBigFontMapPath: this.shxBigFontMapPath || null,
      shxBigFontScale: normalizeBigFontScale(this.shxBigFontScale),
      shxTextHeightScale: normalizeTextHeightScale(this.shxTextHeightScale, 1.12),
      shxMTextHeightScale: normalizeTextHeightScale(this.shxMTextHeightScale, 1.08),
      shxFontLoaded: !!this._shxFont,
      shxBigFontLoaded: !!this._shxBigFont,
      shxBigFontMapLoaded: !!this._shxBigFontCodeMap,
      shxLoadError: this._shxLoadError || null,
      textObjectCount: 0,
      shxTextObjectCount: 0,
      typefaceTextObjectCount: 0,
      spriteTextObjectCount: 0,
      mtextDefinedWidthCount: 0,
      mtextWrappedLineCount: 0,
      shxMaxLineAdvance: 0,
      shxWrapWidth: 0,
      glyphMissingCount: 0,
      glyphMissingSamples: [],
      sourceQuestionMarkCount: 0,
      generatedQuestionMarkCount: 0,
    };
  }

  getTextDiagnostics() {
    return {
      ...this._textDiagnostics,
      glyphMissingSamples: [...this._textDiagnostics.glyphMissingSamples],
      shxFontLoaded: !!this._shxFont,
      shxBigFontLoaded: !!this._shxBigFont,
      shxBigFontMapLoaded: !!this._shxBigFontCodeMap,
      shxLoadError: this._shxLoadError || this._textDiagnostics.shxLoadError || null,
    };
  }

  _setTextRenderMode(mode) {
    if (!mode) return;
    if (!this._textDiagnostics.renderMode) {
      this._textDiagnostics.renderMode = mode;
    } else if (this._textDiagnostics.renderMode !== mode) {
      this._textDiagnostics.renderMode = 'mixed';
    }
  }

  _recordMissingGlyph(char) {
    if (!char) return;
    this._textDiagnostics.glyphMissingCount += 1;
    if (this._textDiagnostics.glyphMissingSamples.length >= MAX_TEXT_MISSING_GLYPH_SAMPLES) return;
    if (this._textDiagnostics.glyphMissingSamples.includes(char)) return;
    this._textDiagnostics.glyphMissingSamples.push(char);
  }

  _sanitizeTextForFont(text) {
    const glyphs = glyphMapFromFont(this._parsedFont);
    if (!glyphs) return text;

    const missingGlyphBox = '\u25a1';
    const fallbackChar = hasGlyph(glyphs, missingGlyphBox) ? missingGlyphBox : '?';
    let out = '';
    for (const char of String(text || '')) {
      if (char === '\n') {
        out += char;
        continue;
      }
      if (char === '?') {
        this._textDiagnostics.sourceQuestionMarkCount += 1;
        out += char;
        continue;
      }
      if (hasGlyph(glyphs, char)) {
        out += char;
        continue;
      }
      this._recordMissingGlyph(char);
      if (fallbackChar === '?') {
        this._textDiagnostics.generatedQuestionMarkCount += 1;
      }
      out += fallbackChar;
    }
    return out;
  }

  _updateLayerVisibilityIndex() {
    this._layerVisibleById.clear();
    for (let i = 0; i < this._layers.length; i += 1) {
      const layer = this._layers[i];
      this._layerVisibleById.set(layer.id, !layer.isHide);
      if (layer.group) {
        layer.group.visible = !layer.isHide;
      }
    }
  }

  _resolveTextMaskColor(textPayload) {
    const wantsCanvasBg = textPayload.textMaskUseCanvasBg === true || textPayload.textMaskColor == null;
    if (!wantsCanvasBg) return textPayload.textMaskColor;
    const fallback = new THREE.Color(this.background || colorToCss(0x33334c));
    return fallback.getHex();
  }

  _ensureTextContrast(textColorNum, maskColorNum) {
    const text = new THREE.Color(textColorNum);
    const mask = new THREE.Color(maskColorNum);
    const dr = text.r - mask.r;
    const dg = text.g - mask.g;
    const db = text.b - mask.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist >= 0.12) return textColorNum;
    const luminance = mask.r * 0.299 + mask.g * 0.587 + mask.b * 0.114;
    return luminance > 0.5 ? 0x000000 : 0xffffff;
  }

  _textAnchorFromBBox(bbox, textPayload) {
    const attachment = String(textPayload?.attachment || '').toLowerCase();
    const horizontalMode = String(textPayload?.horizontalMode || '').toLowerCase();
    const verticalMode = String(textPayload?.verticalMode || '').toLowerCase();
    const attachmentNumber = Number.parseInt(attachment, 10);
    const horizontalNumber = Number.parseInt(horizontalMode, 10);
    const verticalNumber = Number.parseInt(verticalMode, 10);

    let anchorX = bbox.min.x;
    if (
      attachment.includes('center') ||
      attachment.includes('middle') ||
      horizontalMode.includes('center') ||
      horizontalMode.includes('middle') ||
      attachmentNumber === 2 ||
      attachmentNumber === 5 ||
      attachmentNumber === 8 ||
      horizontalNumber === 1 ||
      horizontalNumber === 4
    ) {
      anchorX = (bbox.min.x + bbox.max.x) * 0.5;
    } else if (
      attachment.includes('right') ||
      horizontalMode.includes('right') ||
      attachmentNumber === 3 ||
      attachmentNumber === 6 ||
      attachmentNumber === 9 ||
      horizontalNumber === 2
    ) {
      anchorX = bbox.max.x;
    }

    let anchorY = 0;
    if (
      attachment.includes('top') ||
      verticalMode.includes('top') ||
      attachmentNumber === 1 ||
      attachmentNumber === 2 ||
      attachmentNumber === 3 ||
      verticalNumber === 3
    ) {
      anchorY = bbox.max.y;
    } else if (
      attachment.includes('middle') ||
      attachment.includes('center') ||
      verticalMode.includes('middle') ||
      verticalMode.includes('vertmid') ||
      attachmentNumber === 4 ||
      attachmentNumber === 5 ||
      attachmentNumber === 6 ||
      verticalNumber === 2
    ) {
      anchorY = (bbox.min.y + bbox.max.y) * 0.5;
    } else if (
      attachment.includes('bottom') ||
      verticalMode.includes('bottom') ||
      attachmentNumber === 7 ||
      attachmentNumber === 8 ||
      attachmentNumber === 9 ||
      verticalNumber === 1
    ) {
      anchorY = bbox.min.y;
    }

    return { x: anchorX, y: anchorY };
  }

  _textMaskPaddingWorld(textPayload, textHeight) {
    const rawPadding = Math.max(0, toFiniteNumber(textPayload?.textMaskPadding, 0.25));
    if (rawPadding > 1) {
      return Math.min(2.0, (rawPadding - 1) * 0.5) * textHeight;
    }
    return Math.min(1.0, rawPadding) * textHeight * 0.5;
  }

  _textAnchorBBox(bbox, textPayload) {
    if (!bbox || typeof bbox.clone !== 'function') return bbox;
    const box = bbox.clone();
    const width = textPayload?.isMText === true ? 0 : toFiniteNumber(textPayload?.width, 0);
    const isMText = textPayload?.isMText === true;
    if (isMText && Number.isFinite(width) && width > 1e-6) {
      const widthFactor = safeWidthFactor(textPayload?.widthFactor);
      box.min.x = 0;
      box.max.x = Math.max(1e-6, width / widthFactor);
    }
    return box;
  }

  _textLines(textPayload) {
    const text = normalizeCadTextForDisplay(textPayload?.text);
    if (!text) return [];
    if (textPayload?.verticalText === true) {
      return [...this._sanitizeTextForFont(text)].filter((char) => char !== '\n');
    }
    return this._wrapTextToWidth(this._sanitizeTextForFont(text), textPayload);
  }

  _shxCodeForChar(char) {
    const codePoint = char.codePointAt(0);
    if (!Number.isFinite(codePoint)) return null;
    if (this._shxBigFontCodeMap && Object.prototype.hasOwnProperty.call(this._shxBigFontCodeMap, char)) {
      const mapped = Number(this._shxBigFontCodeMap[char]);
      if (Number.isFinite(mapped) && mapped > 0) return mapped;
    }
    return codePoint;
  }

  _resolveShxGlyph(char, textPayload, recordMissing = true) {
    if (!char || char === '\n') return null;
    const fontSize = this._shxGlyphFontSize(textPayload);
    const codePoint = char.codePointAt(0);
    const shxCode = this._shxCodeForChar(char);

    if (this._shxFont && Number.isFinite(codePoint) && this._shxFont.hasChar(codePoint)) {
      const shape = this._shxFont.getCharShape(codePoint, fontSize);
      if (shape) return { shape, source: 'font', code: codePoint };
    }

    if (this._shxBigFont && Number.isFinite(shxCode) && this._shxBigFont.hasChar(shxCode)) {
      const shape = this._shxBigFont.getCharShape(shxCode, fontSize);
      if (shape) return { shape, source: 'bigfont', code: shxCode };
    }

    if (this._shxBigFont && Number.isFinite(codePoint) && this._shxBigFont.hasChar(codePoint)) {
      const shape = this._shxBigFont.getCharShape(codePoint, fontSize);
      if (shape) return { shape, source: 'bigfont', code: codePoint };
    }

    if (char === ' ' || char === '\t') return null;

    if (recordMissing) {
      if (char === '?') {
        this._textDiagnostics.sourceQuestionMarkCount += 1;
      } else {
        this._recordMissingGlyph(char);
      }
    }

    if (this._shxFont && char !== '?') {
      const fallbackShape = this._shxFont.getCharShape('?'.codePointAt(0), fontSize);
      if (fallbackShape) {
        if (recordMissing) this._textDiagnostics.generatedQuestionMarkCount += 1;
        return { shape: fallbackShape, source: 'fallback', code: '?'.codePointAt(0) };
      }
    }
    return null;
  }

  _shxGlyphFontSize(textPayload) {
    const height = Math.max(1e-6, toFiniteNumber(textPayload?.height, 1));
    const scale =
      textPayload?.isMText === true
        ? normalizeTextHeightScale(this.shxMTextHeightScale, 1.08)
        : normalizeTextHeightScale(this.shxTextHeightScale, 1.12);
    return height * scale;
  }

  _shxBigFontXScale() {
    return 1;
  }

  _shxBigFontYScale() {
    return normalizeBigFontScale(this.shxBigFontScale);
  }

  _shxGlyphAdvance(char, textPayload, recordMissing = false) {
    const height = Math.max(1e-6, toFiniteNumber(textPayload?.height, 1));
    if (char === ' ' || char === '\t') return height * (char === '\t' ? 1.8 : 0.45);
    const glyph = this._resolveShxGlyph(char, textPayload, recordMissing);
    const bbox = glyph?.shape?.bbox;
    const bboxWidth =
      bbox && Number.isFinite(bbox.minX) && Number.isFinite(bbox.maxX) ? Math.max(0, bbox.maxX - bbox.minX) : 0;
    const bboxHeight =
      bbox && Number.isFinite(bbox.minY) && Number.isFinite(bbox.maxY) ? Math.max(0, bbox.maxY - bbox.minY) : 0;
    const lastPointX = toFiniteNumber(glyph?.shape?.lastPoint?.x, 0);
    if (glyph?.source === 'bigfont') {
      const nominalCellHeight = this._shxBigFontNominalCellHeight(textPayload);
      const scaleX = this._shxBigFontXScale();
      const sideBearing = Math.max(height * 0.02, nominalCellHeight * 0.08);
      const scaledBBoxWidth = bboxWidth * scaleX;
      const scaledLastPointX = lastPointX * scaleX;
      if (scaledBBoxWidth > height * 1e-4) {
        return Math.max(scaledLastPointX, scaledBBoxWidth + sideBearing);
      }
      return Math.max(scaledLastPointX, nominalCellHeight * 0.5);
    }
    if (lastPointX > height * 1e-4) {
      return lastPointX;
    }
    if (bboxWidth > height * 1e-4) {
      return bboxWidth + Math.max(height * 0.02, bboxHeight * 0.08);
    }
    return height * 0.45;
  }

  _shxBigFontNominalCellHeight(textPayload) {
    const fontSize = this._shxGlyphFontSize(textPayload);
    const scaleY = this._shxBigFontYScale();
    return Math.max(1e-6, Math.min(fontSize, fontSize * scaleY * 1.4));
  }

  _shxGlyphYOffset(glyph, textPayload) {
    if (glyph?.source !== 'bigfont') return 0;
    const bbox = glyph?.shape?.bbox;
    if (!bbox || !Number.isFinite(bbox.minY) || !Number.isFinite(bbox.maxY)) return 0;
    const scaleY = this._shxBigFontYScale();
    const bboxHeight = Math.max(0, bbox.maxY - bbox.minY) * scaleY;
    const nominalCellHeight = this._shxBigFontNominalCellHeight(textPayload);
    if (bboxHeight <= 1e-6 || bboxHeight >= nominalCellHeight) return -bbox.minY * scaleY;
    return (nominalCellHeight - bboxHeight) * 0.5 - bbox.minY * scaleY;
  }

  _textLineAdvance(text, textPayload) {
    const fontData = this._parsedFont?.data;
    const glyphs = fontData?.glyphs;
    const resolution = Math.max(1e-6, toFiniteNumber(fontData?.resolution, 1000));
    const height = Math.max(1e-6, toFiniteNumber(textPayload?.height, 1));
    const widthFactor = safeWidthFactor(textPayload?.widthFactor);
    let advance = 0;
    for (const char of String(text || '')) {
      if (char === '\n') continue;
      const glyph = glyphs && glyphs[char];
      const glyphAdvance = toFiniteNumber(glyph?.ha, 0);
      if (glyphAdvance > 0) {
        advance += (glyphAdvance / resolution) * height;
      } else {
        advance += height * 0.62;
      }
    }
    return advance * widthFactor;
  }

  _shxTextLineAdvance(text, textPayload, recordMissing = false) {
    const widthFactor = safeWidthFactor(textPayload?.widthFactor);
    let advance = 0;
    for (const char of String(text || '')) {
      if (char === '\n') continue;
      advance += this._shxGlyphAdvance(char, textPayload, recordMissing);
    }
    return advance * widthFactor;
  }

  _wrapSingleLineToWidth(line, textPayload, maxWidth, advanceFn = (value) => this._textLineAdvance(value, textPayload)) {
    return wrapSingleLineToWidth(line, maxWidth, advanceFn);
  }

  _wrapTextToWidth(text, textPayload, advanceFn = (value) => this._textLineAdvance(value, textPayload)) {
    return layoutCadText(text, textPayload, advanceFn).lines;
  }

  _shxTextLines(textPayload) {
    const text = normalizeCadTextForDisplay(textPayload?.text);
    if (!text) return [];
    if (textPayload?.verticalText === true) {
      return [...text].filter((char) => char !== '\n');
    }
    const lines = this._wrapTextToWidth(text, textPayload, (line) => this._shxTextLineAdvance(line, textPayload, false));
    const width = textPayload?.isMText === true ? 0 : toFiniteNumber(textPayload?.width, 0);
    if (textPayload?.isMText === true && width > 1e-6) {
      this._textDiagnostics.mtextDefinedWidthCount += 1;
      this._textDiagnostics.mtextWrappedLineCount += lines.length;
      this._textDiagnostics.shxWrapWidth = Math.max(this._textDiagnostics.shxWrapWidth || 0, width);
    }
    for (const line of lines) {
      this._textDiagnostics.shxMaxLineAdvance = Math.max(
        this._textDiagnostics.shxMaxLineAdvance || 0,
        this._shxTextLineAdvance(line, textPayload, false)
      );
    }
    return lines;
  }

  _mergeTextGeometries(geometries) {
    const positions = [];
    for (const geometry of geometries) {
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      const position = source.getAttribute('position');
      if (position) {
        for (let i = 0; i < position.count; i += 1) {
          positions.push(position.getX(i), position.getY(i), position.getZ(i));
        }
      }
      if (source !== geometry) source.dispose();
      geometry.dispose();
    }

    if (positions.length < 9) return null;
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }

  _buildTextGeometry(textPayload) {
    const lines = this._textLines(textPayload);
    if (!lines.length) return null;

    const geometries = [];
    const lineHeight = Math.max(1e-6, textPayload.height * TEXT_LINE_HEIGHT_FACTOR);
    const curveSegments = normalizeCurveSegments(this.textCurveSegments);

    for (let i = 0; i < lines.length; i += 1) {
      const line = String(lines[i] || '').trimEnd();
      if (!line) continue;

      const shapes = this._parsedFont.generateShapes(line, textPayload.height);
      if (!Array.isArray(shapes) || shapes.length === 0) continue;

      const geometry = new THREE.ShapeGeometry(shapes, curveSegments);
      geometry.translate(0, -i * lineHeight, 0);
      geometries.push(geometry);
    }

    if (!geometries.length) return null;
    const geometry = this._mergeTextGeometries(geometries);
    if (!geometry || !geometry.boundingBox || geometry.boundingBox.isEmpty()) {
      geometry?.dispose?.();
      return null;
    }

    const anchor = this._textAnchorFromBBox(this._textAnchorBBox(geometry.boundingBox, textPayload), textPayload);
    geometry.translate(-anchor.x, -anchor.y, 0);

    const horizontalScale = textHorizontalScaleFromTargetWidth(geometry.boundingBox, textPayload);
    const mirrorX = textPayload.mirroredX === true ? -1 : 1;
    const mirrorY = textPayload.mirroredY === true ? -1 : 1;
    const shear = Math.tan(normalizeObliqueToRadians(textPayload.oblique));
    const scaleMatrix = new THREE.Matrix4().makeScale(horizontalScale * mirrorX, mirrorY, 1);
    geometry.applyMatrix4(scaleMatrix);
    geometry.applyMatrix4(makeShearMatrix(shear));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _addTextMask(group, bbox, textPayload) {
    if (!textPayload.textMask || !bbox || bbox.isEmpty()) return;
    const padding = this._textMaskPaddingWorld(textPayload, textPayload.height);
    const width = Math.max(1e-6, bbox.max.x - bbox.min.x + padding * 2);
    const height = Math.max(1e-6, bbox.max.y - bbox.min.y + padding * 2);
    const maskGeometry = new THREE.PlaneGeometry(width, height);
    maskGeometry.translate((bbox.min.x + bbox.max.x) * 0.5, (bbox.min.y + bbox.max.y) * 0.5, -0.001);
    const maskMesh = new THREE.Mesh(
      maskGeometry,
      new THREE.MeshBasicMaterial({
        color: this._resolveTextMaskColor(textPayload),
        side: THREE.DoubleSide,
        transparent: false,
        depthTest: false,
        depthWrite: false,
      })
    );
    maskMesh.frustumCulled = false;
    maskMesh.renderOrder = TEXT_MASK_RENDER_ORDER;
    group.add(maskMesh);
  }

  _buildShxStrokeTextGeometry(textPayload) {
    if (!this._shxFont) return null;
    const lines = this._shxTextLines(textPayload);
    if (!lines.length) return null;

    const positions = [];
    const lineHeight = Math.max(1e-6, textPayload.height * TEXT_LINE_HEIGHT_FACTOR);

    for (let i = 0; i < lines.length; i += 1) {
      const line = String(lines[i] || '').trimEnd();
      const lineY = -i * lineHeight;
      let cursorX = 0;

      for (const char of line) {
        const advance = this._shxGlyphAdvance(char, textPayload, true);
        const glyph = this._resolveShxGlyph(char, textPayload, false);
        const glyphXScale = glyph?.source === 'bigfont' ? this._shxBigFontXScale() : 1;
        const glyphYScale = glyph?.source === 'bigfont' ? this._shxBigFontYScale() : 1;
        const glyphYOffset = this._shxGlyphYOffset(glyph, textPayload);
        const polylines = Array.isArray(glyph?.shape?.polylines) ? glyph.shape.polylines : [];
        for (const polyline of polylines) {
          if (!Array.isArray(polyline) || polyline.length < 2) continue;
          for (let j = 1; j < polyline.length; j += 1) {
            const a = polyline[j - 1];
            const b = polyline[j];
            positions.push(
              cursorX + a.x * glyphXScale,
              lineY + a.y * glyphYScale + glyphYOffset,
              0,
              cursorX + b.x * glyphXScale,
              lineY + b.y * glyphYScale + glyphYOffset,
              0
            );
          }
        }
        cursorX += advance;
      }
    }

    if (positions.length < 6) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
      geometry.dispose();
      return null;
    }

    const anchor = this._textAnchorFromBBox(this._textAnchorBBox(geometry.boundingBox, textPayload), textPayload);
    geometry.translate(-anchor.x, -anchor.y, 0);

    const horizontalScale = textHorizontalScaleFromTargetWidth(geometry.boundingBox, textPayload);
    const mirrorX = textPayload.mirroredX === true ? -1 : 1;
    const mirrorY = textPayload.mirroredY === true ? -1 : 1;
    const shear = Math.tan(normalizeObliqueToRadians(textPayload.oblique));
    const scaleMatrix = new THREE.Matrix4().makeScale(horizontalScale * mirrorX, mirrorY, 1);
    geometry.applyMatrix4(scaleMatrix);
    geometry.applyMatrix4(makeShearMatrix(shear));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _buildShxStrokeTextObject(textPayload) {
    if (this.shxStrokeTextEnabled !== true || !this._shxFont) return null;
    const geometry = this._buildShxStrokeTextGeometry(textPayload);
    if (!geometry) return null;

    const textObject = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: textPayload.color,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        linewidth: 1,
      })
    );
    textObject.frustumCulled = false;
    textObject.renderOrder = TEXT_RENDER_ORDER;

    const group = new THREE.Group();
    group.renderOrder = TEXT_RENDER_ORDER;
    this._addTextMask(group, geometry.boundingBox, textPayload);
    group.add(textObject);
    if (Math.abs(textPayload.rotation) > 1e-9) {
      group.rotation.z = textPayload.rotation;
    }
    group.position.set(textPayload.x, textPayload.y, 0);
    group.frustumCulled = false;

    this._textDiagnostics.shxTextObjectCount += 1;
    this._setTextRenderMode('shx_stroke');
    return group;
  }

  _buildTextObject(textPayload) {
    if (!textPayload?.text) return null;
    this._textDiagnostics.textObjectCount += 1;
    this._textDiagnostics.curveSegments = normalizeCurveSegments(this.textCurveSegments);

    const shxObject = this._buildShxStrokeTextObject(textPayload);
    if (shxObject) {
      return shxObject;
    }

    if (!this._parsedFont) {
      return this._buildTextSpriteFallback(textPayload);
    }
    this._textDiagnostics.fontFamily = String(this._parsedFont?.data?.familyName || '').trim() || null;

    const geometry = this._buildTextGeometry(textPayload);
    if (!geometry) {
      return this._buildTextSpriteFallback(textPayload);
    }

    const textMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: textPayload.color,
        side: THREE.DoubleSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    );
    textMesh.frustumCulled = false;
    textMesh.renderOrder = TEXT_RENDER_ORDER;

    const group = new THREE.Group();
    group.renderOrder = TEXT_RENDER_ORDER;
    this._addTextMask(group, geometry.boundingBox, textPayload);
    group.add(textMesh);
    if (Math.abs(textPayload.rotation) > 1e-9) {
      group.rotation.z = textPayload.rotation;
    }
    group.position.set(textPayload.x, textPayload.y, 0);
    group.frustumCulled = false;
    this._textDiagnostics.typefaceTextObjectCount += 1;
    this._setTextRenderMode('typeface_fallback');
    return group;
  }

  _buildTextSpriteFallback(textPayload) {
    const text = normalizeCadTextForDisplay(textPayload.text);
    if (!text) return null;
    const lines = text.split('\n');

    const fontPx = Math.max(12, Math.min(256, Math.round(textPayload.height)));
    const lineHeightPx = Math.ceil(fontPx * TEXT_LINE_HEIGHT_FACTOR);
    const shear = Math.tan(normalizeObliqueToRadians(textPayload.oblique));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.font = `${fontPx}px sans-serif`;
    let maxLineWidth = 0;
    for (let i = 0; i < lines.length; i += 1) {
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(lines[i] || ' ').width);
    }
    const pixelToWorld = textPayload.height / fontPx;
    const effectiveWidthFactor = textCanvasWidthFactorFromTargetWidth(textPayload, maxLineWidth, pixelToWorld);
    const textWidthPx = Math.max(1, maxLineWidth * effectiveWidthFactor);
    const textHeightPx = Math.max(fontPx, lineHeightPx * Math.max(1, lines.length));
    const skewPadPx = Math.abs(shear) * textHeightPx;
    const paddingPx = Math.max(4, Math.ceil(fontPx * 0.35));
    const width = Math.max(8, Math.ceil(textWidthPx + skewPadPx + paddingPx * 2));
    const height = Math.max(8, Math.ceil(textHeightPx + paddingPx * 2));
    canvas.width = width;
    canvas.height = height;

    const draw = canvas.getContext('2d');
    if (!draw) return null;
    draw.font = `${fontPx}px sans-serif`;
    draw.textAlign = 'left';
    draw.textBaseline = 'alphabetic';
    if (textPayload.textMask) {
      const resolvedMaskColor = this._resolveTextMaskColor(textPayload);
      draw.fillStyle = colorToCss(resolvedMaskColor);
      draw.fillRect(0, 0, width, height);
    }
    draw.fillStyle = '#ffffff';
    draw.save();
    draw.translate(paddingPx + (shear < 0 ? skewPadPx : 0), paddingPx + fontPx);
    draw.transform(effectiveWidthFactor * (textPayload.mirroredX === true ? -1 : 1), 0, -shear, textPayload.mirroredY === true ? -1 : 1, 0, 0);
    for (let i = 0; i < lines.length; i += 1) {
      draw.fillText(lines[i] || ' ', 0, i * lineHeightPx);
    }
    draw.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const spriteColor = textPayload.textMask
      ? this._ensureTextContrast(textPayload.color, this._resolveTextMaskColor(textPayload))
      : textPayload.color;
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: spriteColor,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const worldWidth = width * pixelToWorld;
    const worldHeight = height * pixelToWorld;
    const bbox = new THREE.Box3(
      new THREE.Vector3(0, -worldHeight, 0),
      new THREE.Vector3(worldWidth, 0, 0)
    );
    const anchor = this._textAnchorFromBBox(bbox, textPayload);
    const sprite = new THREE.Sprite(material);
    sprite.position.set(worldWidth * 0.5 - anchor.x, -worldHeight * 0.5 - anchor.y, 0);
    sprite.scale.set(worldWidth, worldHeight, 1);
    sprite.renderOrder = TEXT_RENDER_ORDER;
    sprite.frustumCulled = false;

    const group = new THREE.Group();
    group.renderOrder = TEXT_RENDER_ORDER;
    group.add(sprite);
    if (Math.abs(textPayload.rotation) > 1e-9) {
      group.rotation.z = textPayload.rotation;
    }
    group.position.set(textPayload.x, textPayload.y, 0);
    group.frustumCulled = false;
    this._textDiagnostics.spriteTextObjectCount += 1;
    this._setTextRenderMode('sprite_fallback');
    return group;
  }

  _fitToView() {
    const box = new THREE.Box3().setFromObject(this.MainScene);
    if (box.isEmpty()) return;
    const vp = getViewportSize(this._renderer, this._container);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const spanX = Math.max(1e-6, Math.abs(size.x));
    const spanY = Math.max(1e-6, Math.abs(size.y));
    let zoom = Math.min((vp.width * 0.9) / spanX, (vp.height * 0.9) / spanY);
    zoom = clamp(zoom, 1e-6, 5e6);
    this.camera.position.x = center.x;
    this.camera.position.y = center.y;
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
  }

  async _applyParsedBundle(glxJson, meshArrayBuffer) {
    this._clearSceneGraph();

    const parsed = parseGlxBundle(glxJson, meshArrayBuffer);

    for (let i = 0; i < parsed.layers.length; i += 1) {
      const layerJson = parsed.layers[i];
      const layerState = createLayerState(layerJson);
      const layerGroup = new THREE.Group();
      layerGroup.name = layerState.name;
      layerGroup.userData = {
        id: layerState.id,
        name: layerState.name,
        isHide: layerState.isHide,
      };
      layerState.group = layerGroup;
      this._layers.push(layerState);
      this.MainScene.add(layerGroup);

      for (let j = 0; j < layerJson.items.length; j += 1) {
        const item = layerJson.items[j];
        if (item.kind === 'text') {
          const textObject = this._buildTextObject(item.payload);
          if (textObject) {
            layerGroup.add(textObject);
          }
          continue;
        }

        const template = item.payload;
        if (!template?.object || typeof template.object.clone !== 'function') continue;
        const instance = template.object.clone();
        instance.geometry = template.object.geometry;
        instance.material = template.object.material;
        instance.frustumCulled = false;
        layerGroup.add(instance);
      }
    }

    this._updateLayerVisibilityIndex();
    this._fitToView();
    this.needsUpdateGPUData = true;
  }

  loadBimd(files) {
    const glxFile = findBundleFile(files, 'glx');
    const binFile = findBundleFile(files, 'bin');
    if (!glxFile || !binFile) {
      return Promise.reject(new Error('cad runtime loadBimd requires both .glx and .bin files'));
    }
    return Promise.all([this._fetchArrayBuffer(glxFile.url), this._fetchArrayBuffer(binFile.url)]).then(([glx, bin]) =>
      this.addGLX(glx, bin)
    );
  }

  async addGLX(glxArrayBuffer, meshArrayBuffer) {
    const glxJson = decodeGlxJson(glxArrayBuffer);
    await Promise.all([
      this._loadShxFontAssets().catch(() => undefined),
      this._loadFontAsset().catch(() => undefined),
    ]);
    await this._applyParsedBundle(glxJson, meshArrayBuffer);
  }

  addGlx(glxArrayBuffer, meshArrayBuffer) {
    return this.addGLX(glxArrayBuffer, meshArrayBuffer);
  }

  purgeModel() {
    this._clearSceneGraph();
    this.needsUpdateGPUData = true;
  }

  getLayers() {
    const out = [];
    for (let i = 0; i < this._layers.length; i += 1) {
      const layer = this._layers[i];
      out.push({
        id: layer.id,
        name: layer.name,
        checked: !layer.isHide,
        color: layer.color,
      });
    }
    return out;
  }

  setLayer(id, isHide) {
    const layerId = toFiniteNumber(id, 0) | 0;
    const layer = this._layers.find((item) => item.id === layerId);
    if (!layer) return;
    layer.isHide = !!isHide;
    this._updateLayerVisibilityIndex();
    this.needsUpdateGPUData = true;
  }

  setAllLayerHidden(isHidden) {
    for (let i = 0; i < this._layers.length; i += 1) {
      this._layers[i].isHide = !!isHidden;
    }
    this._updateLayerVisibilityIndex();
    this.needsUpdateGPUData = true;
  }

  setAllLayerVisible(isHidden) {
    this.setAllLayerHidden(isHidden);
  }

  setBackgroundColor(color) {
    this.background = colorToCss(color);
    this.needsUpdateGPUData = true;
  }

  setCameraZoom(onZoomFinished) {
    if (typeof onZoomFinished === 'function') {
      onZoomFinished('zoomD');
    }
  }

  _isLayerVisible(layerId) {
    if (this._layerVisibleById.has(layerId)) {
      return this._layerVisibleById.get(layerId) === true;
    }
    return true;
  }

  render() {
    const clearColor = new THREE.Color(this.background);
    this._renderer.setClearColor(clearColor, 1);
    this._renderer.render(this.scenes, this.camera);
    this.needsUpdateGPUData = false;
  }

  dispose() {
    this._releaseShxFontAssets();
    this._clearSceneGraph();
    this._renderer.dispose();
    const dom = this._renderer.domElement;
    const parent = dom && dom.parentNode;
    if (parent) {
      parent.removeChild(dom);
    }
  }
}
