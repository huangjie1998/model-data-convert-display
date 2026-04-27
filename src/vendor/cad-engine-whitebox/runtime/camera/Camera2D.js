import { toFiniteNumber } from '../core/utils.js';

export class Camera2D {
  constructor(renderer) {
    this._renderer = renderer;
    this.zoom = 1;
    this.left = -1;
    this.right = 1;
    this.top = 1;
    this.bottom = -1;
    this.position = { x: 0, y: 0, z: 1000 };
  }

  updateProjectionMatrix() {}

  sceneToScreen(point) {
    if (!point) return null;
    const x = toFiniteNumber(point.x, 0);
    const y = toFiniteNumber(point.y, 0);
    const vp = this._renderer.getViewport();
    const zoom = Math.max(1e-6, toFiniteNumber(this.zoom, 1));

    return {
      x: (x - this.position.x) * zoom + vp.width * 0.5,
      y: vp.height * 0.5 - (y - this.position.y) * zoom,
    };
  }

  screenToScene(point) {
    if (!point) return null;
    const sx = toFiniteNumber(point.x, 0);
    const sy = toFiniteNumber(point.y, 0);
    const vp = this._renderer.getViewport();
    const zoom = Math.max(1e-6, toFiniteNumber(this.zoom, 1));

    return {
      x: (sx - vp.width * 0.5) / zoom + this.position.x,
      y: (vp.height * 0.5 - sy) / zoom + this.position.y,
      z: 0,
    };
  }
}
