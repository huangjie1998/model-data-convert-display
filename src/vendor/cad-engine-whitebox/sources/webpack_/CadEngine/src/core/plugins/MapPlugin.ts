import * as THREE from "three";
import { ObservablesManager } from "../event/ObservablesManager";
import { IPoint, IPoint3, MathUtils } from "../../util/MathUtils";
import { Snapper } from "@/core/plugins/Snapper";

export interface MeasureCamera {
  sceneToScreen: (point: IPoint3 | IPoint) => THREE.Vector2;
  screenToScene: (point: IPoint) => THREE.Vector3;
  domElement: HTMLCanvasElement;
}

export class MapPlugin {
  private _canvas: HTMLCanvasElement;
  private _context: CanvasRenderingContext2D;
  private _units: string;
  private _precision: number;
  private _MaxId: number = 0;
  private _camera: MeasureCamera;
  private _type;
  private _color = "";
  private _callback: Function;
  private _updateGPU: Function;
  private _start;
  private _mapStart;
  private _end;
  private _hitPosition;
  private _count = 0;
  private _scene;

  constructor( camera: MeasureCamera, hitPosition) {
    this._hitPosition = hitPosition;
    this._camera = camera;
    this._canvas = document.createElement("canvas");
    this._canvas.style.position = "absolute";
    this._canvas.style.top = "0";
    this._canvas.style.left = "0";
    this._canvas.style.pointerEvents = "none";
    this._canvas.style.outline = "none";
    this._canvas.style.width = "100%";
    this._canvas.style.height = "100%";
    this._canvas.width = camera.domElement.offsetWidth;
    this._canvas.height = camera.domElement.offsetHeight;
    document.body.appendChild(this._canvas);
    this._context = this._canvas.getContext("2d");

    this.initEvent();
  }

  public dispose() {
    this._canvas && document.body.removeChild(this._canvas);
    this._canvas = undefined;
    document.body.removeEventListener("pointermove", this.onDocumentPointerMove);
    window.removeEventListener("resize", this.resize);
    document.body.removeEventListener("pointerup", this.onDocumentPointerUp);
    ObservablesManager.getInstance().onScenePointerUpObservable.removeCallback(this.onScenePointerUp);
  }

  private initEvent() {
    ObservablesManager.getInstance().onScenePointerUpObservable.add(this.onScenePointerUp);
    document.body.addEventListener("pointermove", this.onDocumentPointerMove);
    window.addEventListener("resize", this.resize);
    document.body.addEventListener("pointerup", this.onDocumentPointerUp);
  }

  public resize = ()=>{
  }

  private onScenePointerUp = (eventData: any) => {

  };

  private onDocumentPointerMove = (event) => {

    if(this._type == "move"){
      if(this._count == 1){

        let P = this._camera.screenToScene({ x: event.offsetX, y: event.offsetY });
        this._end = P;

        if(this._hitPosition.visible){
          this._end = new THREE.Vector3().copy(this._hitPosition.position);
        }

        let dir = new THREE.Vector3(this._end.x - this._start.x,this._end.y - this._start.y,this._end.z - this._start.z);
        let d = dir.length();
        dir.normalize();

        this._scene.offset.position.set(
          this._mapStart.position.x + dir.x * d,
          this._mapStart.position.y + dir.y * d,
          this._mapStart.position.z + dir.z * d
          );

        // this._scene.position.set(
        //   this._mapStart.position.x + dir.x * d,
        //   this._mapStart.position.y + dir.y * d,
        //   this._mapStart.position.z + dir.z * d
        //   );
      }
    }

    if(this._type == "scale"){
      if(this._count == 1){
        let P = this._camera.screenToScene({ x: event.offsetX, y: event.offsetY });
        this._end = P;

        if(this._hitPosition.visible){
          this._end = new THREE.Vector3().copy(this._hitPosition.position);
        }

        let dir = new THREE.Vector3(this._end.x - this._start.x,this._end.y - this._start.y,this._end.z - this._start.z);
        let d = dir.length();
        dir.normalize();

        this._scene.offset.scale.set(d / 10000,d / 10000,d / 10000);

        this._scene.children[1].Lines.scale.copy(this._scene.offset.scale);
        this._scene.children[1].Points.scale.copy(this._scene.offset.scale);
      }
    }
    
  };

  private onDocumentPointerUp = (event) => {
    if(this._type == "move"){

      if(this._count == 1){

        this._scene.children[1].Points.visible = true;
        this._scene.children[1].Lines.visible = true;
        this._updateGPU();

        this._type = "";
        this._callback("done");
        // this._scene.offset.position.copy(this._scene.position);
        this._scene.children[1].Lines.position.copy(this._scene.position);
        this._scene.children[1].Points.position.copy(this._scene.position);
        this._scene = null;
        this._callback = null;
        this._updateGPU = null;
      }

      if(this._count == 0){
        this._count++;

        this._mapStart = {position:new THREE.Vector3().copy(this._scene.position),scale:new THREE.Vector3().copy(this._scene.scale)}

        let P = this._camera.screenToScene({ x: event.offsetX, y: event.offsetY });
        this._start = P;

        if(this._hitPosition.visible){
          this._start = new THREE.Vector3().copy(this._hitPosition.position);
        }

        this._scene.children[1].Points.visible = false;
        this._scene.children[1].Lines.visible = false;
        this._updateGPU();
      }
    }

    if(this._type == "scale"){

      if(this._count == 1){

        this._scene.children[1].Points.visible = true;
        this._scene.children[1].Lines.visible = true;
        this._updateGPU();

        this._type = "";
        this._callback("done");
        // this._scene.offset.position.copy(this._scene.position);
        this._scene = null;
        this._callback = null;
        this._updateGPU = null;
      }

      if(this._count == 0){
        this._count++;

        this._mapStart = {position:new THREE.Vector3().copy(this._scene.position),scale:new THREE.Vector3().copy(this._scene.scale)}

        let P = this._camera.screenToScene({ x: event.offsetX, y: event.offsetY });
        this._start = P;

        if(this._hitPosition.visible){
          this._start = new THREE.Vector3().copy(this._hitPosition.position);
        }

        this._scene.offset.scale.set(0,0,0);
        this._scene.offset.position.copy(this._start);
        this._scene.position.copy(this._start);
        this._scene.children[1].Lines.position.copy(this._start);
        this._scene.children[1].Points.position.copy(this._start);

        this._scene.children[1].Points.visible = false;
        this._scene.children[1].Lines.visible = false;
        this._updateGPU();
      }
    }
  };

  public moveMap(scene,callBack,updateGPU){
    this._callback = callBack;
    this._scene = scene;
    this._type = "move";
    this._count = 0;

    this._updateGPU = updateGPU;
  }

  public scaleMap(scene,callBack,updateGPU){
    this._callback = callBack;
    this._scene = scene;
    this._type = "scale";
    this._count = 0;

    this._updateGPU = updateGPU;
  }

}
