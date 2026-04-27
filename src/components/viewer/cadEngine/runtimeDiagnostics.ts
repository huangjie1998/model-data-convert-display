export interface EngineSceneDiagnostics {
  meshNodes: number;
  lineNodes: number;
  meshVertices: number;
  lineVertices: number;
}

export interface TextGlyphDiagnostics {
  fontFamily: string | null;
  fontPath: string | null;
  curveSegments: number;
  renderMode: string | null;
  shxStrokeTextEnabled: boolean;
  shxFontPath: string | null;
  shxBigFontPath: string | null;
  shxBigFontMapPath: string | null;
  shxBigFontScale: number;
  shxTextHeightScale: number;
  shxMTextHeightScale: number;
  shxFontLoaded: boolean;
  shxBigFontLoaded: boolean;
  shxBigFontMapLoaded: boolean;
  shxLoadError: string | null;
  textObjectCount: number;
  shxTextObjectCount: number;
  typefaceTextObjectCount: number;
  spriteTextObjectCount: number;
  mtextDefinedWidthCount: number;
  mtextWrappedLineCount: number;
  shxMaxLineAdvance: number;
  shxWrapWidth: number;
  glyphMissingCount: number;
  glyphMissingSamples: string[];
  sourceQuestionMarkCount: number;
  generatedQuestionMarkCount: number;
}

export interface CadEngineRuntimeDiagnostics {
  fontAssetUrl: string;
  fontAssetResolved: boolean;
  fontAssetError: string | null;
  loadMode: string | null;
  loadAttempted: boolean;
  loadSuccess: boolean;
  loadDurationMs: number | null;
  layerReady: boolean;
  layerCount: number;
  engineScenePopulated: boolean;
  engineScene: EngineSceneDiagnostics | null;
  textGlyphs: TextGlyphDiagnostics | null;
  perfFrameStats: {
    rafFps: number;
    renderFps: number;
    sampleWindowMs: number;
    renderCount: number;
    rafCount: number;
  } | null;
  failureStage: string | null;
}

export function createRuntimeDiagnostics(fontAssetUrl: string): CadEngineRuntimeDiagnostics {
  return {
    fontAssetUrl,
    fontAssetResolved: false,
    fontAssetError: null,
    loadMode: null,
    loadAttempted: false,
    loadSuccess: false,
    loadDurationMs: null,
    layerReady: false,
    layerCount: 0,
    engineScenePopulated: false,
    engineScene: null,
    textGlyphs: null,
    perfFrameStats: null,
    failureStage: null,
  };
}
