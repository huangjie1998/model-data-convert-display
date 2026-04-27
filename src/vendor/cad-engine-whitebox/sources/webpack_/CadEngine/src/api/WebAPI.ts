import { Engine, SceneMode } from "../Engine";
import { PointOfView, PointOfViewOptions } from "../core/plugins/PointOfView";
import { ObjectPaint, ObjectPaintMode } from "@/core/plugins/ObjectPaint";
import { HeatmapPlugin, IHeatmapPoint } from "../core/plugins/HeatmapPlugin";
import { MeasurePlugin, MeasureType } from "../core/plugins/MeasurePlugin";
import { MarkPlugin } from "../core/plugins/MarkPlugin";
import { MapPlugin } from "../core/plugins/MapPlugin";
import { Clipping } from "../core/plugins/Clipping";
import { ViewPoint } from "@/core/plugins/ViewPoint";
import { Snapper } from "@/core/plugins/Snapper";
import { GlxLoader } from "@/core/plugins/GlxLoader";

export class WebAPI {
  private _engine: Engine;
  private _objectPaint: ObjectPaint;
  private _pointOfView: PointOfView;
  private _heatmap: HeatmapPlugin;
  private _measurePlugin: MeasurePlugin;
  private _markPlugin: MarkPlugin;
  private _mapPlugin: MapPlugin;

  constructor(engine: Engine) {
    this._engine = engine;

    this._measurePlugin = new MeasurePlugin({ units: "mm", precision: 3 }, this._engine.scene.camera);
    this._markPlugin = new MarkPlugin(this._engine.scene.camera);
    this._mapPlugin = new MapPlugin(this._engine.scene.camera,this._engine.scene.hitPosition);
    //just for test
    (window as any).api = this;
  }

  public moveMap(mapId,callBack){
    // this._engine.scene.moveMap(callBack);
    this._engine.scene.hitEnable = true;
    Snapper.extendedLineActive = true;
    let onMoveFinished = (e)=>{
      this._engine.scene.hitEnable = false;
      this._engine.scene.needsUpdateGPUData = true;
      Snapper.extendedLineActive = false;
      callBack(e);
    }

    let requestGpuRefresh = ()=>{
      this._engine.scene.needsUpdateGPUData = true;
    }

    this._mapPlugin.moveMap(this._engine.scene.getMap(mapId),onMoveFinished,requestGpuRefresh)
  }

  public scaleMap(mapId,callBack){
    this._engine.scene.hitEnable = true;
    Snapper.extendedLineActive = true;
    let onScaleFinished = (e)=>{
      this._engine.scene.hitEnable = false;
      this._engine.scene.needsUpdateGPUData = true;
      Snapper.extendedLineActive = false;
      callBack(e);
    }

    let requestGpuRefresh = ()=>{
      this._engine.scene.needsUpdateGPUData = true;
    }

    this._mapPlugin.scaleMap(this._engine.scene.getMap(mapId),onScaleFinished,requestGpuRefresh)
  }

  public loadMap(mapId,data,arrayBuffer, cb, color){
    this._engine.scene.loadMap(mapId,data,arrayBuffer, cb, color);
  }

  public unloadMap(mapId){
    this._engine.scene.unloadMap(mapId);
  }

  public Mark(color, _callback?) {
    this._markPlugin.Mark(color, _callback);
  }

  public clearMark() {
    this._markPlugin.clearMark();
  }

  public setMark(color, data) {
    this._markPlugin.setMark(color, data);
  }

  public removeMark(id) {
    this._markPlugin.removeMark(id);
  }

  public switchMode(mode: SceneMode) {
    this._engine.sceneMode = mode;
  }

  public objectPaintPlugin(add: boolean, drawType?: ObjectPaintMode) {
    if (this._objectPaint) this._objectPaint.dispose();
    if (add) {
      this._objectPaint = new ObjectPaint(this._engine.scene, drawType);
    }
  }

  public pointOfViewPlugin(add: boolean, options?: PointOfViewOptions) {
    if (this._pointOfView) {
      this._pointOfView.dispose();
      this._pointOfView = undefined;
    }
    if (add) {
      this._pointOfView = new PointOfView(this._engine.scene.camera, options);
    }
  }

  public getViewport() {
    this.pointOfViewPlugin(true);
    const data = this._pointOfView?.save();
    this.pointOfViewPlugin(false);

    return data;
  }

  public setViewport(data: any) {
    this.pointOfViewPlugin(true);
    this._pointOfView?.load(data);
    this.pointOfViewPlugin(false);
  }

  public capture() {
    const viewPoint = new ViewPoint(this._engine.scene.camera);
    return viewPoint.capture();
  }

  public screenCapture(useCanvas,callback){
    let data = this.capture();

    let image = new Image();
    image.onload = ()=>{
      let canvas = document.createElement('canvas');
      // canvas.width = window.innerWidth ;
      // canvas.height = window.innerHeight;
      // canvas.style.width = image.width + "px";
      // canvas.style.height = image.height + "px";

      canvas.width = image.width;
      canvas.height = image.height;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";

      var ctx=canvas.getContext("2d");

      ctx.drawImage(image,0,0);

      this._measurePlugin.drawInCanvas(ctx);
      this._markPlugin.drawInCanvas(ctx);
      if(useCanvas){
        callback(canvas);
      }else{
        callback(canvas.toDataURL());
      }
    }

    image.src = data;
  }

  public heatmapPlugin(add: boolean, points?: IHeatmapPoint[]) {
    this._heatmap && this._heatmap.dispose();
    if (add) {
      this._heatmap = new HeatmapPlugin(this._engine.scene, this._engine.scene);
      this._heatmap.setDatas(points);
    }
  }

  public setClippingEditMode(enable: boolean) {
    if (Clipping.enable) {
      Clipping.setClipEditEnabled(enable);
      if (enable) {
        this._engine.scene._renderer.localClippingEnabled = enable;
      }
    }
  }

  public setClippingType(type: string) {
    Clipping.setClipMode(type);
  }

  public setClippingEnabled(enable: boolean) {
    // Clipping.enable = enable;
    if (enable == false) {
      Clipping.setClipEditEnabled(enable);
    }
    this._engine.scene._renderer.localClippingEnabled = enable;
  }

  // Legacy aliases kept for backward compatibility with existing scripts.
  public ClippingEdit(enable: boolean) {
    this.setClippingEditMode(enable);
  }

  public ClippingType(type: string) {
    this.setClippingType(type);
  }

  public ClippingEnable(enable: boolean) {
    this.setClippingEnabled(enable);
  }

  public getClippingPara() {
    return Clipping.getClippingParams();
  }

  public setClippingPara(para) {
    return Clipping.applyClippingParams(para);
  }

  public measurePlugin(add: boolean, options = { units: "mm", precision: 3 }) {
    // if (this._measurePlugin) this._measurePlugin.dispose();
    // if (add) {
    //   this._measurePlugin = new MeasurePlugin(options, this._engine.scene.camera);
    // }
  }

  public Measure(type: MeasureType, callback?, style?: { lineColor?: string; lineWidth?: number; fontColor?: string; fontSize?: number; backgroundColor?: string }) {
    this._engine.scene.hitEnable = true;
    Snapper.extendedLineActive = true;
    const onMeasureFinished = (e) => {
      this._engine.scene.hitEnable = false;
      this._engine.scene.closeHit();
      Snapper.extendedLineActive = false;
      callback(e);
    };
    this._measurePlugin && this._measurePlugin.setMeasureType(type, onMeasureFinished, style);
  }

  public focusPosition(Position: number[], distance?) {
    // this._engine.scene.focusPosition(Position,distance);
  }

  public focus(id: string, distance?) {
    // this._engine.scene.focus(id,distance);
  }

  public setBackground(color: number) {
    this._engine.scene.setBackgroundColor(color);
  }

  public setCameraZoom(onZoomFinished) {
    this._engine.scene.setCameraZoom(onZoomFinished);
  }

  public addOverlay(url: string) {
    this._engine.scene.addOverlay(url);
  }

  public removeOverlay(url: string) {
    this._engine.scene.removeOverlay(url);
  }

  public setOverlayLayer(url: string, layer: string) {
    this._engine.scene.setOverlayLayer(url, layer);
  }

  public setOverlayColor(url: string, color: number) {
    this._engine.scene.setOverlayColor(url, color);
  }

  public resetOverlay(url: string) {
    this._engine.scene.resetOverlay(url);
  }

  public translateOverlay(url: string) {
    this._engine.scene.translateOverlay(url);
  }

  public scaleOverlay(url: string, ratio: [number, number]) {
    this._engine.scene.scaleOverlay(url, ratio);
  }

  public addModel(buf) {
    this._engine.scene.addModel(buf);
  }

  public addGltf(glTF) {
    this._engine.scene.addFile(glTF);
  }

  public addglTF(glTF) {
    this.addGltf(glTF);
  }

  public addGLX(data,arrayBuffer) {
    this._engine.scene.addGLX(data,arrayBuffer);
  }

  public loadBimd(type,data,options) {
    this._engine.scene.loadBimd(data);
  }

  public setFontPath(fontPath){
    this._engine.scene.fontPath = fontPath;
  }

  public purgeModel() {
    this._engine.scene.purgeModel();
  }

  public getStats() {
    return this._engine.scene.stats;
  }

  public getLayers() {
    return this._engine.scene.getLayers();
  }

  public setLayerVisible(id, visible) {
    this._engine.scene.setLayer(id, !visible);
  }

  public setAllLayerVisibility(visible) {
    this._engine.scene.setAllLayerHidden(!visible);
  }

  public setAllLayerVisible(visible) {
    this.setAllLayerVisibility(visible);
  }

  public getLayout() {
    return this._engine.scene.getLayout();
  }

  public setLayout(id) {
    this._measurePlugin.clearAll();
    this._engine.scene.setLayout(id);
  }

  public loadFile(url){
     let glx = new GlxLoader(url,null);
     let data =  glx.loadFileBuffer(url);
     return data;
  }

  public loadfile(url){
    return this.loadFile(url);
  }

}
