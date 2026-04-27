import { toFiniteNumber } from '../core/utils.js';

export class CanvasRenderer {
  constructor(container) {
    this.domElement = document.createElement('canvas');
    this.domElement.className = 'biz-canvas3d cad-runtime-canvas';
    this.domElement.style.position = 'absolute';
    this.domElement.style.left = '0';
    this.domElement.style.top = '0';
    this.domElement.style.width = '100%';
    this.domElement.style.height = '100%';
    this.domElement.style.display = 'block';

    this.ctx = this.domElement.getContext('2d', { alpha: true });
    this.localClippingEnabled = false;

    this._pixelRatio = window.devicePixelRatio || 1;
    this._width = 1;
    this._height = 1;

    const target = container || document.body;
    target.appendChild(this.domElement);

    this.setSize(target.clientWidth || window.innerWidth || 1, target.clientHeight || window.innerHeight || 1, true);
  }

  setPixelRatio(value) {
    this._pixelRatio = Math.max(1, toFiniteNumber(value, 1));
  }

  setSize(width, height, updateStyle = true) {
    this._width = Math.max(1, Math.floor(toFiniteNumber(width, 1)));
    this._height = Math.max(1, Math.floor(toFiniteNumber(height, 1)));

    this.domElement.width = Math.max(1, Math.floor(this._width * this._pixelRatio));
    this.domElement.height = Math.max(1, Math.floor(this._height * this._pixelRatio));

    if (updateStyle !== false) {
      this.domElement.style.width = `${this._width}px`;
      this.domElement.style.height = `${this._height}px`;
    }
  }

  getViewport() {
    return {
      width: this._width,
      height: this._height,
      pixelRatio: this._pixelRatio,
      pixelWidth: this.domElement.width,
      pixelHeight: this.domElement.height,
    };
  }

  clear(backgroundCss = '#33334c') {
    const ctx = this.ctx;
    if (!ctx) return;
    const vp = this.getViewport();
    ctx.setTransform(vp.pixelRatio, 0, 0, vp.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, vp.width, vp.height);
    ctx.fillStyle = backgroundCss;
    ctx.fillRect(0, 0, vp.width, vp.height);
  }
}
