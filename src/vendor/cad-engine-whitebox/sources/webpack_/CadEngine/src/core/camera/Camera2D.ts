import * as THREE from "three";
import { OrthographicCamera, Vector3 } from "three";
import { IPoint, IPoint3 } from "../../util/MathUtils";

export class Camera2D extends OrthographicCamera {
  private _domElement: HTMLCanvasElement;
  constructor(left: number, right: number, top: number, bottom: number, near?: number, far?: number) {
    super(left, right, top, bottom, near, far);
  }

  public getPointOfView() {
    const position = this.getWorldPosition(new Vector3());
    const direction = this.rotation.toArray();
    const zoom = this.zoom;
    return { position, direction, zoom };
  }

  public setPointOfView(pointOfView: any) {
    this.position.copy(pointOfView.position);
    this.rotation.fromArray(pointOfView.direction);
    this.zoom = pointOfView.zoom;
  }

  get domElement(): HTMLCanvasElement {
    return this._domElement;
  }

  set domElement(value: HTMLCanvasElement) {
    this._domElement = value;
  }

  public sceneToScreen = (point: IPoint3 | IPoint) => {
    const centerX = this.position.x;
    const centerY = this.position.y;
    const x = this.domElement.clientWidth / 2 + (point.x - centerX) * this.zoom;
    const y = this.domElement.clientHeight / 2 - (point.y - centerY) * this.zoom;
    return new THREE.Vector2(x, y);
  };

  public screenToScene = (point: IPoint) => {
    const centerX = this.position.x;
    const centerY = this.position.y;
    const x = centerX + (point.x - this.domElement.clientWidth / 2) / this.zoom;
    const y = centerY - (point.y - this.domElement.clientHeight / 2) / this.zoom;
    return new THREE.Vector3(x, y, 0);
  };
}
