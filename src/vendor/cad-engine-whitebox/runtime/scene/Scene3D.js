import * as THREE from 'three';
import { ShxFont } from '../../../shx-parser-src/index.ts';
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
    this.shxTextHeightScale = normalizeTextHeightScale(this._options.shxTextHeightScale, 1.33);
    this.shxMTextHeightScale = normalizeTextHeightScale(this._options.shxMTextHeightScale, 1.0);
    this.shxBigFontHeightScale = normalizeTextHeightScale(this._options.shxBigFontHeightScale, 1.0);
    this.shxRebarFontPath = this._options.shxRebarFontPath || '/vendor/fonts/shx/tssdeng.shx';
    this.textCurveSegments = normalizeCurveSegments(this._options.textCurveSegments);
    this.needsUpdateGPUData = false;

    this._layers = [];
    this._layerVisibleById = new Map();
    this._parsedFont = null;
    this._fontPromise = null;
    this._shxFont = null;
    this._shxBigFont = null;
    this._shxBigFontCodeMap = null;
    this._shxRebarFont = null;
    this._shxFontByKey = new Map(); // 按 font_key 缓存的 SHX 字体
    this._docId = this._options.docId || null; // 当前文档 ID，用于加载字体文件
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

    const fontPath = String(this.fontPath || '').trim();
    if (!fontPath) {
      this._textDiagnostics.fontPath = null;
      return Promise.resolve(null);
    }
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
    if (this._shxRebarFont && typeof this._shxRebarFont.release === 'function') {
      this._shxRebarFont.release();
    }
    for (const font of this._shxFontByKey.values()) {
      if (font && typeof font.release === 'function') font.release();
    }
    this._shxFont = null;
    this._shxBigFont = null;
    this._shxBigFontCodeMap = null;
    this._shxRebarFont = null;
    this._shxFontByKey.clear();
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
    const rebarFontPath = String(this.shxRebarFontPath || '').trim();
    this._textDiagnostics.shxStrokeTextEnabled = true;
    this._textDiagnostics.shxFontPath = fontPath || null;
    this._textDiagnostics.shxBigFontPath = bigFontPath || null;
    this._textDiagnostics.shxBigFontMapPath = mapPath || null;

    const pathsUnchanged =
      this._loadedShxFontPath === fontPath &&
      this._loadedShxBigFontPath === bigFontPath &&
      this._loadedShxBigFontMapPath === mapPath &&
      this._loadedShxRebarFontPath === rebarFontPath;
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
      rebarFontPath ? loadFont(rebarFontPath) : Promise.resolve(null),
    ])
      .then(([fontResult, bigFontResult, mapResult, rebarFontResult]) => {
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

        // 钢筋符号字体（tssdeng.shx），加载失败不影响主流程
        if (rebarFontResult && rebarFontResult.status === 'fulfilled') {
          this._shxRebarFont = rebarFontResult.value;
          this._loadedShxRebarFontPath = rebarFontPath;
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
      shxTextHeightScale: normalizeTextHeightScale(this.shxTextHeightScale, 1.33),
      shxMTextHeightScale: normalizeTextHeightScale(this.shxMTextHeightScale, 1.0),
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

  /**
   * 用 ODA 的 actualWidth/actualHeight 计算锚点偏移。
   * 这些尺寸来自 AutoCAD 自身的渲染结果，与替代字体无关，因此位置更准确。
   * 旧的统一入口：按 isMText 分流到 _text / _mtext 两条路径。
   * 仅用于 typeface 回退等需要"两种都吃"的兜底调用；SHX 路径应直接调 _text / _mtext。
   */
  _textAnchorFromActualDimensions(textPayload) {
    return textPayload?.isMText === true
      ? this._textAnchorFromActualDimensions_mtext(textPayload)
      : this._textAnchorFromActualDimensions_text(textPayload);
  }

  /**
   * TEXT 专用 actual-dimension 锚点：只识别 horizontalMode / verticalMode 编码。
   * horizontalMode: 0=left, 1=center, 2=right, 3=aligned, 4=middle, 5=fit
   * verticalMode  : 0=baseline, 1=bottom, 2=middle, 3=top
   */
  _textAnchorFromActualDimensions_text(textPayload) {
    const actualWidth = toFiniteNumber(textPayload?.actualWidth, 0);
    const actualHeight = toFiniteNumber(textPayload?.actualHeight, 0);
    if (actualWidth <= 1e-6 && actualHeight <= 1e-6) return null;

    const horizontalMode = String(textPayload?.horizontalMode || '').toLowerCase();
    const verticalMode = String(textPayload?.verticalMode || '').toLowerCase();
    const horizontalNumber = Number.parseInt(horizontalMode, 10);
    const verticalNumber = Number.parseInt(verticalMode, 10);

    let anchorX = 0;
    if (actualWidth > 1e-6) {
      if (
        horizontalMode.includes('center') ||
        horizontalMode.includes('middle') ||
        horizontalNumber === 1 ||
        horizontalNumber === 4
      ) {
        anchorX = actualWidth * 0.5;
      } else if (horizontalMode.includes('right') || horizontalNumber === 2) {
        anchorX = actualWidth;
      }
    }

    let anchorY = 0;
    if (actualHeight > 1e-6) {
      if (verticalMode.includes('top') || verticalNumber === 3) {
        anchorY = actualHeight;
      } else if (
        verticalMode.includes('middle') ||
        verticalMode.includes('vertmid') ||
        verticalNumber === 2
      ) {
        anchorY = actualHeight * 0.5;
      } else if (verticalMode.includes('bottom') || verticalNumber === 1) {
        anchorY = 0;
      } else {
        // baseline：保持 0，cap-height 偏差由 _shxGlyphFontSize_text 的 heightScale 处理
        anchorY = 0;
      }
    }

    return { x: anchorX, y: anchorY, source: 'actual' };
  }

  /**
   * MTEXT 专用 actual-dimension 锚点：只识别 attachment 1..9。
   * 1=TL 2=TC 3=TR 4=ML 5=MC 6=MR 7=BL 8=BC 9=BR
   * 同时兼容字符串形式（"topLeft"、"middleCenter" 等）。
   */
  _textAnchorFromActualDimensions_mtext(textPayload) {
    const actualWidth = toFiniteNumber(textPayload?.actualWidth, 0);
    const actualHeight = toFiniteNumber(textPayload?.actualHeight, 0);
    if (actualWidth <= 1e-6 && actualHeight <= 1e-6) return null;

    const attachment = String(textPayload?.attachment || '').toLowerCase();
    const attachmentNumber = Number.parseInt(attachment, 10);

    let anchorX = 0;
    if (actualWidth > 1e-6) {
      if (
        attachment.includes('center') ||
        attachment.includes('middle') ||
        attachmentNumber === 2 ||
        attachmentNumber === 5 ||
        attachmentNumber === 8
      ) {
        anchorX = actualWidth * 0.5;
      } else if (
        attachment.includes('right') ||
        attachmentNumber === 3 ||
        attachmentNumber === 6 ||
        attachmentNumber === 9
      ) {
        anchorX = actualWidth;
      }
    }

    let anchorY = 0;
    if (actualHeight > 1e-6) {
      if (
        attachment.includes('top') ||
        attachmentNumber === 1 ||
        attachmentNumber === 2 ||
        attachmentNumber === 3
      ) {
        anchorY = actualHeight;
      } else if (
        attachment.includes('middle') ||
        attachment.includes('center') ||
        attachmentNumber === 4 ||
        attachmentNumber === 5 ||
        attachmentNumber === 6
      ) {
        anchorY = actualHeight * 0.5;
      } else if (
        attachment.includes('bottom') ||
        attachmentNumber === 7 ||
        attachmentNumber === 8 ||
        attachmentNumber === 9
      ) {
        anchorY = 0;
      }
    }

    return { x: anchorX, y: anchorY, source: 'actual' };
  }

  _textMaskPaddingWorld(textPayload, textHeight) {
    const rawPadding = Math.max(0, toFiniteNumber(textPayload?.textMaskPadding, 0.25));
    if (rawPadding > 1) {
      return Math.min(2.0, (rawPadding - 1) * 0.5) * textHeight;
    }
    return Math.min(1.0, rawPadding) * textHeight * 0.5;
  }

  _textAnchorBBox(bbox, textPayload) {
    return textPayload?.isMText === true
      ? this._textAnchorBBox_mtext(bbox)
      : this._textAnchorBBox_text(bbox);
  }

  _textAnchorBBox_text(bbox) {
    if (!bbox || typeof bbox.clone !== 'function') return bbox;
    const box = bbox.clone();
    // TEXT 的锚点应当从插入点（cursor 起点 x=0）起算，而不是最左笔画——
    // 否则左对齐 TEXT 的 _applyShxGeometryTransform 会用 -bbox.min.x 把
    // 前导空格 (例如 "  abc") 的 cursor 前进量"扣回去"，导致前导空格被忽略。
    // 与 _textAnchorBBox_mtext 对齐：从插入边而非笔画边量起。
    box.min.x = 0;
    return box;
  }

  _textAnchorBBox_mtext(bbox) {
    if (!bbox || typeof bbox.clone !== 'function') return bbox;
    const box = bbox.clone();
    // MTEXT 锚点应当从插入边而非最左笔画边量起。
    box.min.x = 0;
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

  /**
   * 按 font_key 异步加载 SHX 字体（从后端 API 获取）。
   * 加载完成后缓存在 _shxFontByKey 中。
   */
  async _loadShxFontByKey(fontKey) {
    if (!fontKey || this._shxFontByKey.has(fontKey)) return;
    const docId = this.docId || this._docId;
    if (!docId) return;
    this._shxFontByKey.set(fontKey, null); // 标记为正在加载
    try {
      const url = `/api/dwg/${encodeURIComponent(docId)}/fonts/${encodeURIComponent(fontKey)}/file`;
      const buf = await this._fetchArrayBuffer(url);
      const font = new ShxFont(buf);
      this._shxFontByKey.set(fontKey, font);
    } catch {
      this._shxFontByKey.delete(fontKey); // 加载失败，允许重试
    }
  }

  /**
   * 获取已加载的按 font_key 缓存的 SHX 字体。
   */
  _getShxFontByKey(fontKey) {
    if (!fontKey) return null;
    const font = this._shxFontByKey.get(fontKey);
    return font || null;
  }

  /**
   * 获取 bigfont 字形，以基线为原点。
   * 原始字形坐标除以 cellH 归一化，再减去 baseDown/cellH 移基线到 y=0。
   * 渲染器的 fontSize 和 bigfontScale 负责最终缩放。
   */
  _getBigFontShapeAtBaseline(code) {
    if (!this._shxBigFont?.shapeParser) return null;
    const rawShape = this._shxBigFont.shapeParser.parseAndScale(code, { factor: 1 });
    if (!rawShape?.polylines) return null;

    const fontData = this._shxBigFont.fontData;
    const baseDown = fontData?.content?.baseDown || 0;
    const baseUp = fontData?.content?.baseUp || 0;
    const cellH = baseUp + baseDown || 1;
    const baselineInUnits = baseDown / cellH; // 基线在归一化坐标中的位置

    // 归一化到单位空间，并移基线到 y=0
    const newPolylines = rawShape.polylines.map(pl =>
      pl.map(p => ({ x: p.x / cellH, y: p.y / cellH - baselineInUnits }))
    );
    const newLastPoint = rawShape.lastPoint
      ? { x: rawShape.lastPoint.x / cellH, y: rawShape.lastPoint.y / cellH - baselineInUnits }
      : null;

    // 计算 bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pl of newPolylines) {
      for (const p of pl) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    return {
      polylines: newPolylines,
      lastPoint: newLastPoint,
      bbox: { minX, minY, maxX, maxY },
    };
  }

  _resolveShxGlyph(char, textPayload, recordMissing = true) {
    if (!char || char === '\n') return null;
    const codePoint = char.codePointAt(0);
    const shxCode = this._shxCodeForChar(char);
    const fontSize = this._shxGlyphFontSize(textPayload, 'font');
    const bigFontSize = this._shxGlyphFontSize(textPayload, 'bigfont');

    // 1. 优先使用文字实体指定的 SHX 字体（如 SIMPLEX.SHX）
    const entityFontKey = textPayload?.fontKey;
    const entityFont = this._getShxFontByKey(entityFontKey);
    if (entityFont && Number.isFinite(codePoint) && entityFont.hasChar(codePoint)) {
      const shape = entityFont.getCharShape(codePoint, fontSize);
      if (shape) return { shape, source: 'entity_font', code: codePoint };
    }

    // 2. 主字体（如 txt.shx）
    if (this._shxFont && Number.isFinite(codePoint) && this._shxFont.hasChar(codePoint)) {
      const shape = this._shxFont.getCharShape(codePoint, fontSize);
      if (shape) return { shape, source: 'font', code: codePoint };
    }

    // 3. 大字体（如 gbcbig.shx）— 使用 getCadCharShape 内联执行，保留基线
    if (this._shxBigFont && Number.isFinite(shxCode) && this._shxBigFont.hasChar(shxCode)) {
      const cadShape = this._shxBigFont.getCadCharShape(shxCode, {
        fontSize: bigFontSize,
        verticalText: textPayload?.verticalText === true,
      });
      if (cadShape) {
        const shape = { polylines: cadShape.polylines, bbox: cadShape.bbox, lastPoint: cadShape.lastPoint };
        return { shape, source: 'bigfont', code: shxCode };
      }
    }

    if (this._shxBigFont && Number.isFinite(codePoint) && this._shxBigFont.hasChar(codePoint)) {
      const cadShape = this._shxBigFont.getCadCharShape(codePoint, {
        fontSize: bigFontSize,
        verticalText: textPayload?.verticalText === true,
      });
      if (cadShape) {
        const shape = { polylines: cadShape.polylines, bbox: cadShape.bbox, lastPoint: cadShape.lastPoint };
        return { shape, source: 'bigfont', code: codePoint };
      }
    }

    // 4. 钢筋符号字体回退（tssdeng.shx）
    if (this._shxRebarFont && Number.isFinite(codePoint) && this._shxRebarFont.hasChar(codePoint)) {
      const shape = this._shxRebarFont.getCharShape(codePoint, fontSize);
      if (shape) return { shape, source: 'rebar', code: codePoint };
    }

    if (char === '\t') return null;

    // 全角空格 (U+3000) 的回退：BigFont 通常有 0xA1A1（已在第 3 步查询过），
    // 如果 BigFont 没有该字形，退一步用主 SHX 的半角空格 *32 给出 advancePoint。
    // 不走 missing-glyph 通道，避免被替换成 '?'。
    if (codePoint === 0x3000) {
      if (this._shxFont && this._shxFont.hasChar(0x20)) {
        const shape = this._shxFont.getCharShape(0x20, fontSize);
        if (shape) return { shape, source: 'font', code: 0x20 };
      }
      if (entityFont && entityFont.hasChar(0x20)) {
        const shape = entityFont.getCharShape(0x20, fontSize);
        if (shape) return { shape, source: 'entity_font', code: 0x20 };
      }
    }

    if (recordMissing) {
      if (char === '?') {
        this._textDiagnostics.sourceQuestionMarkCount += 1;
      } else {
        this._recordMissingGlyph(char);
      }
    }

    if (this._shxFont && char !== '?') {
      const fallbackShape = this._shxFont.getCharShape('?'.codePointAt(0), this._shxGlyphFontSize(textPayload, 'font'));
      if (fallbackShape) {
        if (recordMissing) this._textDiagnostics.generatedQuestionMarkCount += 1;
        return { shape: fallbackShape, source: 'fallback', code: '?'.codePointAt(0) };
      }
    }
    return null;
  }

  /**
   * 旧的统一入口：按 isMText 分流到 _text / _mtext 两条路径。
   * 仅用于历史调用点（typeface 回退等）；SHX 路径应直接调对应的 _text / _mtext。
   */
  _shxGlyphFontSize(textPayload, glyphSource) {
    return textPayload?.isMText === true
      ? this._shxGlyphFontSize_mtext(textPayload, glyphSource)
      : this._shxGlyphFontSize_text(textPayload, glyphSource);
  }

  _shxGlyphFontSize_text(textPayload, glyphSource) {
    const height = Math.max(1e-6, toFiniteNumber(textPayload?.height, 1));
    if (glyphSource === 'bigfont') {
      return height * normalizeTextHeightScale(this.shxBigFontHeightScale, 1.0);
    }
    return height * normalizeTextHeightScale(this.shxTextHeightScale, 1.33);
  }

  _shxGlyphFontSize_mtext(textPayload, glyphSource) {
    const height = Math.max(1e-6, toFiniteNumber(textPayload?.height, 1));
    if (glyphSource === 'bigfont') {
      return height * normalizeTextHeightScale(this.shxBigFontHeightScale, 1.0);
    }
    return height * normalizeTextHeightScale(this.shxMTextHeightScale, 1.0);
  }

  /**
   * 字符前进点 (advancePoint) 解析。
   *
   * 下一字符的起点 = 上一字符的 advancePoint。这个值来自 parser 的
   *   ShxShape.lastPoint  (= state.lastRenderedPoint)
   * = SHX 程序整体执行完后的 currentPoint × wrapperScale，按 fontSize 缩好。
   * 它包含主路径 + inline 子形 (cmd 7、7,0…) + 抬笔空移 (cmd 2/8/9) 的全部位移；
   * 例如 BigFont 字形里 `7,143` 跳到 `*143`、`*143` 里 `2,8,(66,5)` 推进的前进点
   * 同样会被累计进来（参见 shapeParser.ts:832 renderLogicalPoint，并在 cmd 8/9
   * 的处理路径里无 penDown 守卫地更新 lastRenderedPoint）。
   *
   * 规则：advancePoint 是唯一前进基准，BigFont / 普通 SHX 一视同仁，没有 fallback。
   * 如果 parser 没给出有效的 advancePoint，视为契约违反 — 记录诊断并抛错，
   * 不允许悄悄回退到 height / bboxWidth 等启发式估值。
   *
   * 空白特例：
   *   '\t' 走旧的快路 height * 1.8（tab stop 排版后续单独做）。
   *   ' ' 走标准查找链，让主 SHX 字体里的 *32 给出 advancePoint。
   *   全角空格 (U+3000) 同样走查找链；BigFont 通常有 0xA1A1，没有就按
   *   "entity font → 主 SHX → BigFont → rebar" 顺序回退到主 SHX 的半角空格。
   *
   * 缺字符（resolveShxGlyph 返回 null 且无 fallback 字形）：走 missing-glyph 通道，
   * 走 '?' 回退字形的 advancePoint；这是 "找不到字符"，与 "找到字符但没前进点" 不同。
   */
  _shxGlyphAdvance(char, textPayload, recordMissing = false) {
    if (char === '\t') {
      const height = Math.max(1e-6, toFiniteNumber(textPayload?.height, 1));
      return height * 1.8;
    }
    const glyph = this._resolveShxGlyph(char, textPayload, recordMissing);
    if (!glyph) {
      // 完全找不到字形（连 '?' 回退也没有）。原行为给 height * 0.45 占位。
      const height = Math.max(1e-6, toFiniteNumber(textPayload?.height, 1));
      return height * 0.45;
    }
    const advancePointX = toFiniteNumber(glyph?.shape?.lastPoint?.x, NaN);
    if (!Number.isFinite(advancePointX) || advancePointX <= 0) {
      this._recordShxZeroAdvance(char, glyph);
      throw new Error(
        `SHX glyph has no advancePoint: char=${JSON.stringify(char)} ` +
        `code=${glyph?.code} source=${glyph?.source} ` +
        `lastPoint=${JSON.stringify(glyph?.shape?.lastPoint)}`
      );
    }
    return advancePointX;
  }

  _recordShxZeroAdvance(char, glyph) {
    if (!this._textDiagnostics.shxZeroAdvanceSamples) {
      this._textDiagnostics.shxZeroAdvanceSamples = [];
      this._textDiagnostics.shxZeroAdvanceCount = 0;
    }
    this._textDiagnostics.shxZeroAdvanceCount += 1;
    const key = `${glyph?.source || 'unknown'}:${glyph?.code ?? char.codePointAt(0)}`;
    if (this._textDiagnostics.shxZeroAdvanceSamples.length < MAX_TEXT_MISSING_GLYPH_SAMPLES &&
        !this._textDiagnostics.shxZeroAdvanceSamples.includes(key)) {
      this._textDiagnostics.shxZeroAdvanceSamples.push(key);
    }
  }

  _shxGlyphYOffset(glyph, textPayload) {
    if (glyph?.source !== 'bigfont') return 0;
    // BigFont glyphs from getCadCharShape are already CAD-positioned: the parser
    // preserves the glyph baseline/origin and applies the SHX program scale once.
    // Do not apply the old normalize-to-origin baseline compensation here, or the
    // glyph will be shifted upward by roughly one font cell after the parser has
    // already returned final CAD coordinates.
    return 0;
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

  /**
   * TEXT 行集合：AutoCAD 中 TEXT 不会自动换行，也不识别 \n / \P 段落。
   * 整段文本作为单行返回；vertical 时按字符切，但仍不引入换行。
   */
  _shxTextLines_text(textPayload) {
    const text = normalizeCadTextForDisplay(textPayload?.text);
    if (!text) return [];
    if (textPayload?.verticalText === true) {
      return [...text].filter((char) => char !== '\n');
    }
    return [text];
  }

  /**
   * MTEXT 行集合：保留 \n 切行 + width 包裹（layoutMText），并写入诊断计数。
   */
  _shxTextLines_mtext(textPayload) {
    const text = normalizeCadTextForDisplay(textPayload?.text);
    if (!text) return [];
    if (textPayload?.verticalText === true) {
      return [...text].filter((char) => char !== '\n');
    }
    const lines = this._wrapTextToWidth(text, textPayload, (line) => this._shxTextLineAdvance(line, textPayload, false));
    const width = toFiniteNumber(textPayload?.width, 0);
    if (width > 1e-6) {
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

    // TTF 也用 actual 尺寸锚点
    const actualAnchor = this._textAnchorFromActualDimensions(textPayload);
    let anchor;
    if (actualAnchor) {
      anchor = actualAnchor;
    } else {
      anchor = this._textAnchorFromBBox(this._textAnchorBBox(geometry.boundingBox, textPayload), textPayload);
    }
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

  /**
   * 通用几何构造：按行枚举 lines，每个字符用 _resolveShxGlyph 拿字形、
   * 用 advanceFn 计算下一个字符的起点。advanceFn 由 TEXT / MTEXT 各自传入，
   * 内部统一调用 advancePoint 规则。
   *
   * lines: string[]，已按 TEXT/MTEXT 各自的规则切好行（TEXT 永远只有 1 行）。
   * 返回：未做 anchor / widthFactor 变换的原始几何，或 null。
   */
  _buildShxStrokeLineGeometry(lines, textPayload, advanceFn) {
    if (!lines || !lines.length) return null;
    const positions = [];
    const lineHeight = Math.max(1e-6, textPayload.height * TEXT_LINE_HEIGHT_FACTOR);

    for (let i = 0; i < lines.length; i += 1) {
      const line = String(lines[i] || '').trimEnd();
      const lineY = -i * lineHeight;
      let cursorX = 0;

      for (const char of line) {
        const advance = advanceFn(char, textPayload, true);
        const glyph = this._resolveShxGlyph(char, textPayload, false);
        // getCadCharShape 返回的坐标已按 fontSize 缩放，不需要额外的 bigfontScale
        const glyphYOffset = this._shxGlyphYOffset(glyph, textPayload);
        const polylines = Array.isArray(glyph?.shape?.polylines) ? glyph.shape.polylines : [];

        for (const polyline of polylines) {
          if (!Array.isArray(polyline) || polyline.length < 2) continue;
          for (let j = 1; j < polyline.length; j += 1) {
            const a = polyline[j - 1];
            const b = polyline[j];
            const ax = cursorX + a.x;
            const ay = lineY + a.y + glyphYOffset;
            const bx = cursorX + b.x;
            const by = lineY + b.y + glyphYOffset;
            positions.push(ax, ay, 0, bx, by, 0);
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
    return geometry;
  }

  /**
   * 应用 anchor + widthFactor + mirror + oblique 几何变换。
   * actualAnchorFn / bboxAnchorRefFn 由 TEXT / MTEXT 各自传入。
   */
  _applyShxGeometryTransform(geometry, textPayload, actualAnchor, bboxRef) {
    let anchor;
    if (actualAnchor) {
      anchor = actualAnchor;
    } else {
      anchor = this._textAnchorFromBBox(bboxRef, textPayload);
    }
    geometry.translate(-anchor.x, -anchor.y, 0);

    // SHX 已按 CAD 字高和 widthFactor 生成，不能再用 bbox/actualWidth 二次回填，
    // 否则 BigFont 的可见 bbox 会把字宽重新拉大，导致比 AutoCAD 宽。
    const horizontalScale = safeWidthFactor(textPayload?.widthFactor);
    const mirrorX = textPayload.mirroredX === true ? -1 : 1;
    const mirrorY = textPayload.mirroredY === true ? -1 : 1;
    const shear = Math.tan(normalizeObliqueToRadians(textPayload.oblique));
    const scaleMatrix = new THREE.Matrix4().makeScale(horizontalScale * mirrorX, mirrorY, 1);
    const shearMatrix = makeShearMatrix(shear);
    geometry.applyMatrix4(scaleMatrix);
    geometry.applyMatrix4(shearMatrix);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  _buildShxStrokeTextGeometry_text(textPayload) {
    if (textPayload?.isMText === true) {
      throw new Error('_buildShxStrokeTextGeometry_text 不能用于 MTEXT');
    }
    if (!this._shxFont) return null;
    const fontKey = textPayload?.fontKey;
    if (fontKey && !this._shxFontByKey.has(fontKey)) {
      this._loadShxFontByKey(fontKey).then(() => { this.needsUpdateGPUData = true; });
    }
    const lines = this._shxTextLines_text(textPayload);
    const geometry = this._buildShxStrokeLineGeometry(lines, textPayload, (c, p, r) => this._shxGlyphAdvance(c, p, r));
    if (!geometry) return null;

    const actualAnchor = this._textAnchorFromActualDimensions_text(textPayload);
    const bboxRef = this._textAnchorBBox_text(geometry.boundingBox);
    this._applyShxGeometryTransform(geometry, textPayload, actualAnchor, bboxRef);
    return geometry;
  }

  _buildShxStrokeTextGeometry_mtext(textPayload) {
    if (textPayload?.isMText !== true) {
      throw new Error('_buildShxStrokeTextGeometry_mtext 只能用于 MTEXT');
    }
    if (!this._shxFont) return null;
    const fontKey = textPayload?.fontKey;
    if (fontKey && !this._shxFontByKey.has(fontKey)) {
      this._loadShxFontByKey(fontKey).then(() => { this.needsUpdateGPUData = true; });
    }
    const lines = this._shxTextLines_mtext(textPayload);
    const geometry = this._buildShxStrokeLineGeometry(lines, textPayload, (c, p, r) => this._shxGlyphAdvance(c, p, r));
    if (!geometry) return null;

    const actualAnchor = this._textAnchorFromActualDimensions_mtext(textPayload);
    const bboxRef = this._textAnchorBBox_mtext(geometry.boundingBox);
    this._applyShxGeometryTransform(geometry, textPayload, actualAnchor, bboxRef);
    return geometry;
  }

  /**
   * 把已构造好的 geometry 包成 LineSegments + Group + mask + rotation/position。
   * TEXT 和 MTEXT 路径共用。
   */
  _buildShxStrokeObjectFromGeometry(geometry, textPayload) {
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
    group.userData.textPayload = textPayload;
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

  _buildShxStrokeTextObject(textPayload) {
    if (this.shxStrokeTextEnabled !== true || !this._shxFont) return null;
    if (textPayload?.isMText === true) {
      throw new Error('_buildShxStrokeTextObject 只服务 TEXT，MTEXT 请走 _buildShxStrokeMTextObject');
    }
    const geometry = this._buildShxStrokeTextGeometry_text(textPayload);
    if (!geometry) return null;
    return this._buildShxStrokeObjectFromGeometry(geometry, textPayload);
  }

  _buildShxStrokeMTextObject(textPayload) {
    if (this.shxStrokeTextEnabled !== true || !this._shxFont) return null;
    if (textPayload?.isMText !== true) {
      throw new Error('_buildShxStrokeMTextObject 只服务 MTEXT');
    }
    const geometry = this._buildShxStrokeTextGeometry_mtext(textPayload);
    if (!geometry) return null;
    return this._buildShxStrokeObjectFromGeometry(geometry, textPayload);
  }

  _buildTextObject(textPayload) {
    if (!textPayload?.text) return null;
    this._textDiagnostics.textObjectCount += 1;
    this._textDiagnostics.curveSegments = normalizeCurveSegments(this.textCurveSegments);

    const shxObject = textPayload?.isMText === true
      ? this._buildShxStrokeMTextObject(textPayload)
      : this._buildShxStrokeTextObject(textPayload);
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
    group.userData.textPayload = textPayload;
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
    group.userData.textPayload = textPayload;
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
