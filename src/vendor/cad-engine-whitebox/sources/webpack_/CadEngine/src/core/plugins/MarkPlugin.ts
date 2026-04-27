import * as THREE from "three";
import { ObservablesManager } from "../event/ObservablesManager";
import { IPoint, IPoint3, MathUtils } from "../../util/MathUtils";

export interface MeasureCamera {
  sceneToScreen: (point: IPoint3 | IPoint) => THREE.Vector2;
  screenToScene: (point: IPoint) => THREE.Vector3;
  domElement: HTMLCanvasElement;
}

export class MarkPlugin {
  private _canvas: HTMLCanvasElement;
  private _context: CanvasRenderingContext2D;
  private _units: string;
  private _precision: number;
  private _MaxId: number = 0;
  private _camera: MeasureCamera;
  private _begin = false;
  private _color = "";
  private _callback;
  private _item;
  private _items = {};
  private _position = new THREE.Vector3();

  constructor( camera: MeasureCamera) {
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

    // this._item = document.createElement('canvas');
    // this._item.style.position = "absolute";
    // this._item.width = "20";
    // this._item.height = "28";
    // this._item.style.width = "20px";
    // this._item.style.height = "28px";
    // this._item.style.top = "100px";
    // this._item.style.left = "100px";
    // this._item.style.display = "none";
    // this._item.style.transform = "translateX(-50%) translateY(-125%)";

    // this.draw("#ffffff");

    // document.body.appendChild(this._item);


    this.initEvent();
  }

  draw(color){
    var ctx=this._item.getContext("2d");
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(10,10,8,0,2*Math.PI);
    ctx.stroke();
    
    ctx.lineWidth = 0.1;
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.moveTo(1.69,15.56);
    ctx.lineTo(10,28);
    ctx.lineTo(18.38,15.56);
    ctx.lineTo(10,18);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }


  public Mark(color,_callback?) {

    this._callback = null;
    this._color = color;
    this._callback = _callback;
    this._begin = true;
  }

  public dispose() {
    this._canvas && document.body.removeChild(this._canvas);
    this._canvas = undefined;
    document.body.removeEventListener("pointermove", this.onDocumentPointerMove);
    window.removeEventListener("resize", this.resize);
    document.body.removeEventListener("pointerup", this.onDocumentPointerUp);
    ObservablesManager.getInstance().onScenePointerUpObservable.removeCallback(this.onScenePointerUp);
    ObservablesManager.getInstance().onCameraChangedObservable.removeCallback(this.updatePosition);
  }

  private initEvent() {
    ObservablesManager.getInstance().onScenePointerUpObservable.add(this.onScenePointerUp);
    ObservablesManager.getInstance().onCameraChangedObservable.add(this.updatePosition);
    document.body.addEventListener("pointermove", this.onDocumentPointerMove);
    window.addEventListener("resize", this.resize);
    document.body.addEventListener("pointerup", this.onDocumentPointerUp);
  }

  public clearMark(){
    // this._item.style.display = "none";
    for(let id in this._items){
      let item = this._items[id];
      document.body.removeChild(item.canvas);
    }

    this._items = {};
  }

  public resize = ()=>{
    this.updatePosition();
  }

  public setMark(color,data){
    // this._position.fromArray(position);
    // this.draw(color);

    this._position.x = data.point.x;
    this._position.y = data.point.y;
    this._position.z = data.point.z;

    let color_ = new THREE.Color(color);

    let item = document.createElement('canvas');
    item.style.position = "absolute";
    (item as any).width = "20";
    (item as any).height = "28";
    item.style.width = "20px";
    item.style.height = "28px";
    item.style.transform = "translateX(-50%) translateY(-125%)";

    let screenPoint = this._position.clone().project(this._camera as any);

    screenPoint.x += 1;
    screenPoint.y += 1;

    screenPoint.x /= 2;
    screenPoint.y /= 2;

    screenPoint.y = 1 - screenPoint.y;

    screenPoint.x *= window.innerWidth;
    screenPoint.y *= window.innerHeight;

    item.style.left = Math.floor(screenPoint.x) + "px";
    item.style.top = Math.floor(screenPoint.y) + "px";

    var ctx = item.getContext("2d");
    ctx.strokeStyle = '#' + color_.getHexString();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(10,10,8,0,2*Math.PI);
    ctx.stroke();
    
    ctx.lineWidth = 0.1;
    ctx.fillStyle='#' + color_.getHexString();;
    ctx.beginPath();
    ctx.moveTo(1.69,15.56);
    ctx.lineTo(10,28);
    ctx.lineTo(18.38,15.56);
    ctx.lineTo(10,18);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();

    this._MaxId++;
    this._items[this._MaxId] = {id:this._MaxId*1,canvas:item,position:this._position.clone(),color:color};

    document.body.appendChild(item);
    this.updatePosition();
    return this._items[this._MaxId];
  }

  public drawInCanvas(ctx){
    for(let id in this._items){
      let color_ = new THREE.Color(this._items[id].color);
      let screenPoint = this._items[id].position.clone().project(this._camera as any);
      
      screenPoint.x += 1;
      screenPoint.y += 1;

      screenPoint.x /= 2;
      screenPoint.y /= 2;

      screenPoint.y = 1 - screenPoint.y;

      screenPoint.x *= window.innerWidth;
      screenPoint.y *= window.innerHeight;

      let offsetX = screenPoint.x - 10;
      let offsetY = screenPoint.y - 35;

      ctx.strokeStyle = '#' + color_.getHexString();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(10 + offsetX,10 + offsetY,8,0,2*Math.PI);
      ctx.stroke();
      
      ctx.lineWidth = 0.1;
      ctx.fillStyle='#' + color_.getHexString();;
      ctx.beginPath();
      ctx.moveTo(1.69 + offsetX,15.56 + offsetY);
      ctx.lineTo(10 + offsetX,28 + offsetY);
      ctx.lineTo(18.38 + offsetX,15.56 + offsetY);
      ctx.lineTo(10 + offsetX,18 + offsetY);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();

    }
  }

  private updatePosition = ()=>{

    for(let id in this._items){
      let item = this._items[id];
      let screenPoint = item.position.clone().project(this._camera as any);

      screenPoint.x += 1;
      screenPoint.y += 1;

      screenPoint.x /= 2;
      screenPoint.y /= 2;

      screenPoint.y = 1 - screenPoint.y;

      screenPoint.x *= window.innerWidth;
      screenPoint.y *= window.innerHeight;

      item.canvas.style.left = Math.floor(screenPoint.x) + "px";
      item.canvas.style.top = Math.floor(screenPoint.y) + "px";
    }

  }

  private onScenePointerUp = (eventData: any) => {
    if(this._begin){
      this._begin = false;

      let item = this.setMark(this._color,{point:eventData.position.clone()});

      if(this._callback){
        this._callback({point:{x:eventData.position.x,y:eventData.position.y,z:eventData.position.z},id:item.id,color:item.color});
        this._callback = null;
      }

      // this.updatePosition();
      // this._item.style.display = "block";
    }
  };

  private onDocumentPointerMove = (event) => {
    
  };

  private onDocumentPointerUp = (event) => {
    
  };

  public removeMark(id){
    let item = this._items[id];
    document.body.removeChild(item.canvas);
    delete this._items[id];
  }

}
