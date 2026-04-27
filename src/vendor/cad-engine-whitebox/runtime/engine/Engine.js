import { EventDispatcher } from '../core/EventDispatcher.js';
import { Scene3D } from '../scene/Scene3D.js';
import { WebAPI } from '../api/WebAPI.js';

export class Engine extends EventDispatcher {
  constructor(options) {
    super();

    this.sceneMode = 0;
    this.scene = new Scene3D(options || {});
    this.apiBridge = new WebAPI(this);

    this._disposed = false;
    this._rafId = 0;
    this._lastRenderTime = 0;
    this._idleRefreshMs = 1200;
    this._perfWindowMs = 1200;
    this._perf = {
      windowStart: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      rafCount: 0,
      renderCount: 0,
      rafFps: 0,
      renderFps: 0,
      sampleWindowMs: this._perfWindowMs,
    };
    this._loop = this._loop.bind(this);
    this._loop();

    window.engine = this;
  }

  _loop() {
    if (this._disposed) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._perf.rafCount += 1;
    const scene = this.scene;
    const shouldRender = !!scene?.needsUpdateGPUData || now - this._lastRenderTime >= this._idleRefreshMs;
    if (shouldRender && scene && typeof scene.render === 'function') {
      scene.render();
      this._lastRenderTime = now;
      this._perf.renderCount += 1;
    }

    const elapsed = now - this._perf.windowStart;
    if (elapsed >= this._perfWindowMs) {
      const safeElapsed = Math.max(1, elapsed);
      this._perf.rafFps = (this._perf.rafCount * 1000) / safeElapsed;
      this._perf.renderFps = (this._perf.renderCount * 1000) / safeElapsed;
      this._perf.sampleWindowMs = safeElapsed;
      this._perf.windowStart = now;
      this._perf.rafCount = 0;
      this._perf.renderCount = 0;
    }
    this._rafId = window.requestAnimationFrame(this._loop);
  }

  getPerfStats() {
    return {
      rafFps: this._perf.rafFps,
      renderFps: this._perf.renderFps,
      sampleWindowMs: this._perf.sampleWindowMs,
      rafCount: this._perf.rafCount,
      renderCount: this._perf.renderCount,
    };
  }

  dispose() {
    this._disposed = true;
    if (this._rafId) {
      window.cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (this.scene && typeof this.scene.dispose === 'function') {
      this.scene.dispose();
    }
  }
}
