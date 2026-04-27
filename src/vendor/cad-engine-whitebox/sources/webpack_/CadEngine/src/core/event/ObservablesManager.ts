import { Observable } from "./Observable";
import { Scene3D } from "../Scene3D";

export class ObservablesManager {
  public static Instance: ObservablesManager;

  public onSceneInitObservable: Observable<Scene3D>;
  public onSceneOverlayObservable: Observable<Scene3D>;
  public onFrameRenderedObservable: Observable<any>;
  public onScenePointerUpObservable: Observable<any>;
  public onCameraChangedObservable: Observable<any>;

  private constructor() {
    this.onSceneInitObservable = new Observable();
    this.onSceneOverlayObservable = new Observable();
    this.onFrameRenderedObservable = new Observable();
    this.onScenePointerUpObservable = new Observable();
    this.onCameraChangedObservable = new Observable();
  }

  public static getInstance(): ObservablesManager {
    if (!ObservablesManager.Instance) {
      ObservablesManager.Instance = new ObservablesManager();
    }
    return ObservablesManager.Instance;
  }

  public dispose() {
    this.onSceneInitObservable.clear();
    this.onSceneOverlayObservable.clear();
    this.onFrameRenderedObservable.clear();
    this.onScenePointerUpObservable.clear();
    this.onCameraChangedObservable.clear();
  }
}
