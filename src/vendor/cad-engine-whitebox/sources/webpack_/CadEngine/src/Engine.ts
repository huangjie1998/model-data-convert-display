import { Scene3D } from "./core/Scene3D";
import { WebAPI } from "./api/WebAPI";
import { EventEnum } from "./core/event/EventEnum";
import { EventDispatcher } from "three";
import { ObservablesManager } from "./core/event/ObservablesManager";

export enum SceneMode {
  perspective,
  orthographic
}

export class Engine extends EventDispatcher {
  private _scene3D: Scene3D;
  private _apiBridge: WebAPI;
  private _sceneMode: SceneMode = SceneMode.perspective;
  public static MaxID = 128;
  public static entityMap: any = new Map(); // gpu ID 查找 entity
  public static entityIdToIndex: any = new Map(); // entity.id 查找 gpu ID
  public static indexMap = {}; // gpu ID 查找显存偏移量
  public static IconAndTextScaleFactor3D = 1;
  public static IconAndTextScaleFactor2D = 1;
  constructor(options = {}) {
    super();
    (window as any).engine = this;
    this._scene3D = new Scene3D(options);
    this._apiBridge = new WebAPI(this);
    this.initializeEvents();
    this.startRenderLoop();
  }

  get sceneMode(): SceneMode {
    return this._sceneMode;
  }

  set sceneMode(value: SceneMode) {
    this._sceneMode = value;
  }

  get scene(): Scene3D {
    return this._scene3D;
  }

  get apiBridge(): WebAPI {
    return this._apiBridge;
  }

  private initializeEvents() {
    window.addEventListener(EventEnum.RESIZE, this.onResized);
    window.addEventListener(EventEnum.ORIENTATIONCHANGE, this.onOrientationChanged);
    ObservablesManager.getInstance().onSceneInitObservable.add(() => this.dispatchEvent({type: 'MODEL_ADD'}))
  }

  private onResized = () => {
    this.resizeView();
  };

  private onOrientationChanged = () => {
    this.resizeView();
  };

  private resizeView() {
    this._scene3D.resizeView();
  }

  private startRenderLoop = () => {
    requestAnimationFrame(this.startRenderLoop);
    this._scene3D.render();
  };

  public dispose() {
    window.removeEventListener(EventEnum.RESIZE, this.onResized);
    window.removeEventListener(EventEnum.ORIENTATIONCHANGE, this.onOrientationChanged);
  }
}
