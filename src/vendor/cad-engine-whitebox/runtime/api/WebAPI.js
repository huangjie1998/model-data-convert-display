export class WebAPI {
  constructor(engine) {
    this._engine = engine;
    window.api = this;
  }

  purgeModel() {
    return this._engine.scene.purgeModel();
  }

  setFontPath(fontPath) {
    this._engine.scene.fontPath = fontPath;
  }

  getLayers() {
    return this._engine.scene.getLayers();
  }

  setLayerVisible(id, visible) {
    this._engine.scene.setLayer(id, !visible);
  }

  setAllLayerVisibility(visible) {
    this._engine.scene.setAllLayerHidden(!visible);
  }

  setAllLayerVisible(visible) {
    this.setAllLayerVisibility(visible);
  }

  loadBimd(modelName, files, options) {
    return this._engine.scene.loadBimd(files);
  }

  addGLX(glxArrayBuffer, glxMeshBuffer) {
    return this._engine.scene.addGLX(glxArrayBuffer, glxMeshBuffer);
  }

  addGlx(glxArrayBuffer, glxMeshBuffer) {
    return this._engine.scene.addGlx(glxArrayBuffer, glxMeshBuffer);
  }

  addGltf() {}

  addglTF() {}

  loadFile(url) {
    return fetch(String(url)).then((resp) => {
      if (!resp.ok) {
        throw new Error(`Failed to load file: ${url} (${resp.status})`);
      }
      return resp.arrayBuffer();
    });
  }

  loadfile(url) {
    return this.loadFile(url);
  }

  setClippingType() {}

  setClippingEnabled() {}

  setClippingEditMode() {}

  ClippingType(type) {
    this.setClippingType(type);
  }

  ClippingEnable(enabled) {
    this.setClippingEnabled(enabled);
  }

  ClippingEdit(enabled) {
    this.setClippingEditMode(enabled);
  }
}
