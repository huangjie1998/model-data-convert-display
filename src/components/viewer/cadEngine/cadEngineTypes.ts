export interface CadEngineSceneFile {
  model3DName: string;
  url: string;
}

export interface CadEnginePerfStats {
  rafFps?: number;
  renderFps?: number;
  sampleWindowMs?: number;
  renderCount?: number;
  rafCount?: number;
}

export interface CadEngineLayerInfo {
  id: number;
  name: string;
}

export interface CadEngineCamera {
  zoom: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  position: {
    x: number;
    y: number;
    z?: number;
  };
  updateProjectionMatrix?: () => void;
  sceneToScreen?: (point: { x: number; y: number }) => { x: number; y: number } | null;
  screenToScene?: (point: { x: number; y: number }) => { x: number; y: number } | null;
}

export interface CadEngineMaterialLike {
  clipping?: boolean;
  clippingPlanes?: unknown[];
  clipShadows?: boolean;
  transparent?: boolean;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  color?: {
    set?: (value: number | string) => void;
  };
  needsUpdate?: boolean;
}

export interface CadEngineSceneNode {
  type?: string;
  visible?: boolean;
  frustumCulled?: boolean;
  renderOrder?: number;
  material?: CadEngineMaterialLike | CadEngineMaterialLike[];
  geometry?: {
    attributes?: {
      position?: {
        count?: number;
      };
    };
  };
  traverse?: (visitor: (node: CadEngineSceneNode) => void) => void;
}

export interface CadEngineRendererLike {
  localClippingEnabled?: boolean;
  setPixelRatio?: (value: number) => void;
  setSize?: (width: number, height: number, updateStyle?: boolean) => void;
}

export interface CadEngineScene {
  _renderer?: CadEngineRendererLike;
  camera?: CadEngineCamera;
  MainScene?: CadEngineSceneNode;
  scenes?: CadEngineSceneNode;
  controls?: {
    enabled?: boolean;
  };
  fontPath?: string;
  shxStrokeTextEnabled?: boolean;
  shxFontPath?: string;
  shxBigFontPath?: string;
  shxBigFontMapPath?: string;
  shxBigFontScale?: number;
  shxTextHeightScale?: number;
  shxMTextHeightScale?: number;
  needsUpdateGPUData?: boolean;
  textCurveSegments?: number;
  traverse?: (visitor: (node: CadEngineSceneNode) => void) => void;
  loadBimd?: (files: CadEngineSceneFile[]) => unknown;
  getLayers?: () => unknown;
  getTextDiagnostics?: () => unknown;
}

export interface CadEngineInstance {
  scene?: CadEngineScene;
  dispose?: () => void;
  getPerfStats?: () => CadEnginePerfStats | null | undefined;
}

export interface CadEngineApi {
  purgeModel?: () => void;
  setFontPath?: (fontPath: string) => void;
  getLayers?: () => unknown;
  setLayerVisible?: (layerId: number, visible: boolean) => void;
  setAllLayerVisibility?: (visible: boolean) => void;
  setAllLayerVisible?: (visible: boolean) => void;
  loadBimd?: (modelName?: string, files?: CadEngineSceneFile[], options?: unknown) => unknown;
  addGLX?: (glxArrayBuffer: ArrayBuffer, glxMeshBuffer: ArrayBuffer) => unknown;
  addGlx?: (glxArrayBuffer: ArrayBuffer, glxMeshBuffer: ArrayBuffer) => unknown;
  addGltf?: (gltf: unknown) => unknown;
  addglTF?: (gltf: unknown) => unknown;
  loadFile?: (url: string) => unknown;
  loadfile?: (url: string) => unknown;
  setClippingEditMode?: (enabled: boolean) => void;
  setClippingType?: (mode: string) => void;
  setClippingEnabled?: (enabled: boolean) => void;
  ClippingEdit?: (enabled: boolean) => void;
  ClippingType?: (mode: string) => void;
  ClippingEnable?: (enabled: boolean) => void;
}

export interface CadEngineCtor {
  new (options: { container: HTMLElement }): CadEngineInstance;
}

export interface CadEngineGlobal {
  Engine?: CadEngineCtor;
  __provider?: string;
}

declare global {
  interface Window {
    CadEngine?: CadEngineGlobal;
    api?: CadEngineApi;
  }
}
