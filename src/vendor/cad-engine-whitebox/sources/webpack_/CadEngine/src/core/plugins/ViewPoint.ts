import { Vector3 } from "three";

import { Camera2D } from "../camera/Camera2D";

export class ViewPoint {
  private _camera: Camera2D;

  constructor(controls: Camera2D) {
    this._camera = controls;
  }

  save() {
    return (this._camera as Camera2D).getPointOfView();
  }

  load(viewPoint: { position: Vector3; direction: Vector3 }) {
    this._camera.setPointOfView(viewPoint);
  }

  capture() {
    return this._camera.domElement.toDataURL("image/jpeg");
  }
}
