import { Vector3 } from "three/src/math/Vector3";
import { ShapeUtils, Vector2 } from "three";
import { ObjectPool } from "../../util/ObjectPool";
import { ObservablesManager } from "../event/ObservablesManager";
import { IPoint, IPoint3, MathUtils } from "../../util/MathUtils";
import polylabel from "polylabel";

interface MeasureStyle {
  lineColor?: string;
  extendColor?: string;
  lineWidth?: number;
  fontColor?: string;
  fontSize?: number;
  backgroundColor?: string;
}

export interface MeasureData {
  type: MeasureType;
  id: number;
  points?: Vector3[];
  style?: MeasureStyle;
}

export const DefaultMeasureStyle: MeasureStyle = {
  // lineColor: "#f99d0b",
  lineColor: "#b2d136",
  extendColor: "#1c86ee",
  lineWidth: 2,
  fontColor: "#ffffff",
  fontSize: 12,
  // backgroundColor: "#f99d0b",
  backgroundColor: "rgba( 100,100,100,0.8)"
};

export enum MeasureType {
  MEASURE_TYPE_DISTANCE,
  MEASURE_TYPE_ANGLE,
  MEASURE_TYPE_AREA
}

export const MeasureUnits = {
  KILOMETER: "km",
  METER: "m",
  CENTIMETER: "cm",
  MILLIMETER: "mm"
};

export interface MeasureCamera {
  sceneToScreen: (point: IPoint3 | IPoint) => Vector2;
  screenToScene: (point: IPoint) => Vector3;
  domElement: HTMLCanvasElement;
}

export class MeasurePlugin {
  private _canvas: HTMLCanvasElement;
  private _context: CanvasRenderingContext2D;
  private _measureData: MeasureData[] = [];
  private _textInputPool: ObjectPool<TextObject>;
  private _pointerMovePoint = new Vector2();
  private _currentMeasureData: MeasureData;
  private _units: string;
  private _precision: number;
  private _MaxId = 0;
  private _snapObject: { visible: boolean; position: IPoint3 };
  private _camera: MeasureCamera;
  private _callback;
  constructor(options: { units: string; precision: number }, camera: MeasureCamera) {
    this._units = options?.units || MeasureUnits.MILLIMETER;
    this._precision = options?.precision || 3;
    this._camera = camera;
    this._textInputPool = new ObjectPool(TextObject);
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

    // this.initCurrentMeasureData();
    this.initEvent();
  }

  public setMeasureType(type: MeasureType, callback?, style?: MeasureStyle) {
    this.initCurrentMeasureData(type, style);
    this._callback = callback;
  }

  public dispose() {
    this._textInputPool && this._textInputPool.dispose();
    this._canvas && document.body.removeChild(this._canvas);
    this._canvas = undefined;
    this._measureData.length = 0;
    this._snapObject = undefined;
    document.body.removeEventListener("pointermove", this.onDocumentPointerMove);
    document.body.removeEventListener("pointerup", this.onDocumentPointerUp);
    ObservablesManager.getInstance().onScenePointerUpObservable.removeCallback(this.onScenePointerUp);
    ObservablesManager.getInstance().onCameraChangedObservable.removeCallback(this.reDraw);
  }

  private initCurrentMeasureData(type: MeasureType = MeasureType.MEASURE_TYPE_AREA, style?: MeasureStyle) {
    this._currentMeasureData = {
      type: type,
      id: this._MaxId++,
      points: [],
      style: style || DefaultMeasureStyle
    };
  }

  private initEvent() {
    ObservablesManager.getInstance().onScenePointerUpObservable.add(this.onScenePointerUp);
    ObservablesManager.getInstance().onCameraChangedObservable.add(this.reDraw);
    document.body.addEventListener("pointermove", this.onDocumentPointerMove);
    document.body.addEventListener("pointerup", this.onDocumentPointerUp);
  }

  private onScenePointerUp = (eventData: any) => {
    if (!this._currentMeasureData) return;
    if (eventData.snapObject) {
      if (eventData.snapObject.visible) {
        this._currentMeasureData.points.push(eventData.position.clone());
      } else {
        const scenePoint = this._camera.screenToScene(this._pointerMovePoint);
        this._currentMeasureData.points.push(scenePoint);
      }
      this._snapObject = eventData.snapObject;
    }
    this.checkCondition();
    this.reDraw();
  };

  private reDraw = (eventData?, state?,notClear?, drawInCanvas?) => {

    if(!notClear){
      this.clear();
    }
    this._measureData.forEach((data) => {
      this.draw(data,drawInCanvas);
    });
    if (this._currentMeasureData && this._currentMeasureData.points.length > 0) {
      this.draw(this._currentMeasureData,drawInCanvas);
    }
  };

  public drawInCanvas(ctx){
    let Temp = this._context;
    this._context = ctx;
    this.reDraw(null,null, true,true);
    this._context = Temp;
  }

  private checkCondition() {
    const measureType = this._currentMeasureData.type;
    const pointsLength = this._currentMeasureData.points?.length || 0;
    if (
      (measureType === MeasureType.MEASURE_TYPE_DISTANCE && pointsLength === 2) ||
      (measureType === MeasureType.MEASURE_TYPE_ANGLE && pointsLength === 3) ||
      (measureType === MeasureType.MEASURE_TYPE_AREA &&
        pointsLength > 1 &&
        MathUtils.isPointEqual(this._currentMeasureData.points[0], this._currentMeasureData.points[this._currentMeasureData.points.length - 1]))
    ) {
      this._measureData.push(this._currentMeasureData);
      this.initCurrentMeasureData(this._currentMeasureData.type);
      this._currentMeasureData = null;
      if (this._callback) {
        this._callback("done");
        this._callback = null;
      }
    }
  }

  private onDocumentPointerMove = (event) => {
    if (!this._currentMeasureData) return;
    this._pointerMovePoint.set(event.clientX, event.clientY);

    if (this._snapObject && this._snapObject.visible) {
      const snapScreen = this._camera.sceneToScreen(this._snapObject.position);
      this._pointerMovePoint.set(snapScreen.x, snapScreen.y);
    }
    if (this._currentMeasureData.points.length > 1) {
      const lastPoint = this._currentMeasureData.points[0];
      const lastScreenPoint = this._camera.sceneToScreen(lastPoint);
      if (MathUtils.vectorDistance(lastScreenPoint, this._pointerMovePoint) < 10) {
        this._pointerMovePoint.set(lastScreenPoint.x, lastScreenPoint.y);
      }
    }
    if (this._currentMeasureData.points.length > 0) {
      this.reDraw();
    }
  };

  private onDocumentPointerUp = (event) => {
    if (event.button === 2) {
      // this.initCurrentMeasureData(this._currentMeasureData.type);
      // this.reDraw();
      if (this._currentMeasureData && this._currentMeasureData.type === MeasureType.MEASURE_TYPE_AREA && this._currentMeasureData.points.length > 0) {
        this._currentMeasureData.points.push(new Vector3().copy(this._currentMeasureData.points[0]));
        this._measureData.push(this._currentMeasureData);
        this.initCurrentMeasureData(this._currentMeasureData.type);
        this.reDraw();

        this._measureData.push(this._currentMeasureData);
        this.initCurrentMeasureData(this._currentMeasureData.type);
        this._currentMeasureData = null;
        if (this._callback) {
          this._callback("done");
          this._callback = null;
        }
      }
    }
  };

  private draw(data: MeasureData, drawInCanvas?) {
    switch (data.type) {
      case MeasureType.MEASURE_TYPE_DISTANCE:
        //点距离
        this.drawDistance(data,drawInCanvas);
        break;
      case MeasureType.MEASURE_TYPE_ANGLE:
        //线角度
        this.drawArc(data,drawInCanvas);
        break;
      case MeasureType.MEASURE_TYPE_AREA:
        //多边形面积
        this.drawArea(data,drawInCanvas);
        break;
      default:
        break;
    }
  }

  public clear() {
    this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._textInputPool.clear();
  }

  public clearAll(){
    this._measureData = [];
    this.clear();
  }

  private deleteData(id){
   
    // console.log(id);

    const MeasureDataArray = [];

    for (let i = 0; i < this._measureData.length; i++) {
      if (this._measureData[i].id != id) {
        MeasureDataArray.push(this._measureData[i]);
      }
    }

    this._measureData = MeasureDataArray;

    this.reDraw();
  }

  private transformUnitsAndPrecision(value: number): string {
    let result = "";
    if (this._units === MeasureUnits.KILOMETER) {
      result = (value / 1000000).toFixed(this._precision);
    } else if (this._units === MeasureUnits.METER) {
      result = (value / 1000).toFixed(this._precision);
    } else if (this._units === MeasureUnits.CENTIMETER) {
      result = (value / 10).toFixed(this._precision);
    } else if (this._units === MeasureUnits.MILLIMETER) {
      result = value.toFixed(this._precision);
    }
    return result + this._units;
  }

  private drawDistance(data: MeasureData, drawInCanvas?) {
    const source = data.points;
    const screenPoint = this._camera.sceneToScreen(source[0]);
    const screenPoint2 = source.length > 1 ? this._camera.sceneToScreen(source[1]) : this._pointerMovePoint;
    const style = data.style || DefaultMeasureStyle;
    this._context.strokeStyle = style.lineColor;
    this._context.lineWidth = style.lineWidth;
    this._context.beginPath();
    this._context.moveTo(screenPoint.x, screenPoint.y);
    this._context.lineTo(screenPoint2.x, screenPoint2.y);
    this._context.stroke();
    this._context.closePath();

    if (source.length > 1) {
      const textInput = this._textInputPool.get((e) => {
        this.deleteData(e);
      });
      textInput.id = data.id;
      const distance = source[0].distanceTo(source[1]);
      const center = new Vector2((screenPoint.x + screenPoint2.x) / 2, (screenPoint.y + screenPoint2.y) / 2);
      textInput.setText(this.transformUnitsAndPrecision(distance), style);
      textInput.setPosition(center, this._canvas.width, this._canvas.height);

      if(drawInCanvas){
        this.drawTextInCanvas(textInput,this.transformUnitsAndPrecision(distance),style);
      }
    }
  }

  private drawTextInCanvas(textInput,text,style){
    this._context.fillStyle = textInput._text.style.backgroundColor;

    this._context.fillRect(
      textInput._text.offsetLeft + 10,
      textInput._text.offsetTop + 10,
      textInput._text.offsetWidth - 20,
      textInput._text.offsetHeight - 20
      );

    this._context.strokeStyle = textInput._text.style.backgroundColor;

    this._context.beginPath()
    this._context.lineJoin="round";
    this._context.lineCap="round";
    this._context.lineWidth = 10;

    this._context.moveTo(textInput._text.offsetLeft + 5,textInput._text.offsetTop + 5);
    this._context.lineTo(textInput._text.offsetLeft + textInput._text.offsetWidth - 5,textInput._text.offsetTop + 5);
    this._context.lineTo(textInput._text.offsetLeft + textInput._text.offsetWidth - 5,textInput._text.offsetTop + textInput._text.offsetHeight - 5);
    this._context.lineTo(textInput._text.offsetLeft + 5,textInput._text.offsetTop + textInput._text.offsetHeight - 5);
    this._context.closePath();

    this._context.stroke();

    this._context.font = style.fontSize + "px " + "PingFang-SC-Regular,BlinkMacSystemFont,Segoe UI,PingFang SC,Hiragino Sans GB,Microsoft YaHei,Helvetica Neue,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,serif";
    this._context.textAlign="center";

    this._context.fillStyle = style.fontColor;

    this._context.fillText(
      text,
      textInput._text.offsetLeft + textInput._text.offsetWidth / 2,
      textInput._text.offsetTop + 16);
  }

  private drawArc(data: MeasureData, drawInCanvas?) {
    if (data.points.length > 0) {
      const ctx = this._context;
      const style = data.style || DefaultMeasureStyle;
      ctx.lineWidth = style.lineWidth;
      ctx.strokeStyle = style.lineColor;
      ctx.beginPath();

      data.points.forEach((point, index) => {
        const screenPoint = this._camera.sceneToScreen(point);
        if (index === 0) {
          ctx.moveTo(screenPoint.x, screenPoint.y);
        } else {
          ctx.lineTo(screenPoint.x, screenPoint.y);
        }
      });
      if (data.points.length < 3) {
        ctx.lineTo(this._pointerMovePoint.x, this._pointerMovePoint.y);
        ctx.stroke();
      } else {
        const startPoint = data.points[0];
        const center = data.points[1];
        const endPoint = data.points[2];

        const startDir = startPoint.clone().sub(center);
        const endDir = endPoint.clone().sub(center);
        const radians = startDir.angleTo(endDir);

        const screenStart = this._camera.sceneToScreen(startPoint);
        const screenCenter = this._camera.sceneToScreen(center);
        const screenEnd = this._camera.sceneToScreen(endPoint);
        const screenStartDir = screenStart.sub(screenCenter);
        const screenEndDir = screenEnd.sub(screenCenter);
        let startRadians = screenStartDir.angle();
        let endRadians = screenEndDir.angle();
        if (startRadians > endRadians) {
          const temp = startRadians;
          startRadians = endRadians;
          endRadians = temp;
        }
        ctx.moveTo(screenCenter.x, screenCenter.y);
        ctx.arc(screenCenter.x, screenCenter.y, 20, startRadians, endRadians, endRadians - startRadians > Math.PI);

        const textInput = this._textInputPool.get((e) => {
          this.deleteData(e);
        });
        textInput.id = data.id;
        textInput.setText(((radians * 180) / Math.PI).toFixed(this._precision) + " °", style);
        textInput.setPosition(screenCenter, this._canvas.width, this._canvas.height);
        ctx.stroke();

        if(drawInCanvas){
          this.drawTextInCanvas(textInput,((radians * 180) / Math.PI).toFixed(this._precision) + " °",style);
        }
      }
      
    }
  }

  private drawArea(data: MeasureData, drawInCanvas?) {
    if (data.points.length > 0) {
      const ctx = this._context;
      const style = data.style || DefaultMeasureStyle;
      ctx.lineWidth = style.lineWidth;
      ctx.strokeStyle = style.lineColor;
      ctx.beginPath();
      data.points.forEach((point, index) => {
        const screenPoint = this._camera.sceneToScreen(point);
        if (index === 0) {
          ctx.moveTo(screenPoint.x, screenPoint.y);
        } else {
          ctx.lineTo(screenPoint.x, screenPoint.y);
        }
      });
      if (data.points.length > 1 && MathUtils.isPointEqual(data.points[0], data.points[data.points.length - 1])) {
        const polygon = data.points.map((po: any) => new Vector2(po.x, po.y));
        const paths: number[][][] = [polygon.map((po) => [po.x, po.y])];
        const pp = polylabel(paths, 10);
        const textPosition = this._camera.sceneToScreen({ x: pp[0], y: pp[1] });
        const area = Math.abs(ShapeUtils.area(polygon));
        const textInput = this._textInputPool.get((e) => {
          this.deleteData(e);
        });
        textInput.setText(area.toFixed(this._precision) + " mm²", style);
        textInput.id = data.id;
        textInput.setPosition(textPosition, this._canvas.width, this._canvas.height);
        ctx.stroke();

        if(drawInCanvas){
          this.drawTextInCanvas(textInput,area.toFixed(this._precision) + " mm²",style);
        }
      } else {
        ctx.lineTo(this._pointerMovePoint.x, this._pointerMovePoint.y);
        ctx.stroke();

        if (data.points.length > 1) {
          ctx.beginPath();
          ctx.lineWidth = style.lineWidth;
          ctx.strokeStyle = style.extendColor || "#1c86ee";
          ctx.moveTo(this._pointerMovePoint.x, this._pointerMovePoint.y);
          const screenPoint = this._camera.sceneToScreen(data.points[0]);
          ctx.lineTo(screenPoint.x, screenPoint.y);
          ctx.stroke();
        }
      }
    }
  }

  // 计算射线与矩形的交点
  private getRayOnSegment(linePoints: Vector2[], width: number, height: number): Vector2[] {
    const pointOnScreen: Vector2[] = [];
    const segments = [
      [new Vector2(0, 0), new Vector2(width, 0)],
      [new Vector2(0, 0), new Vector2(0, height)],
      [new Vector2(0, height), new Vector2(width, height)],
      [new Vector2(width, 0), new Vector2(width, height)]
    ];
    segments.forEach((points) => {
      const point = MathUtils.calculateIntersectPointOnSegment(points[0], points[1], linePoints[0], linePoints[1]);
      if (point) {
        pointOnScreen.push(point);
      }
    });
    return pointOnScreen;
  }
}

class TextObject {
  public _text: HTMLDivElement;
  public _textInput: HTMLDivElement;
  private _close: HTMLSpanElement;
  public id: number;
  constructor(callback) {
    this._text = document.createElement("div");
    this._text.style.position = "absolute";
    this._text.style.left = `0px`;
    this._text.style.top = `0px`;
    this._text.style.textAlign = "center";
    this._text.style.resize = "none";
    // this._text.style.pointerEvents = "none";
    // this._text.style.borderRadius = "2px";
    this._text.style.borderColor = "#ffffff";
    this._text.style.borderRadius = "5px";

    this._textInput = document.createElement("div");
    this._textInput.style.height = "24px";
    this._textInput.style.lineHeight = "24px";
    this._textInput.style.pointerEvents = "none";

    this._text.appendChild(this._textInput);

    this._close = document.createElement("span");
    // this._close.style.background = "rgb(204, 255, 0)";
    this._close.style.color = "rgb(204, 255, 0)";
    this._close.style.width = "8px";
    this._close.style.height = "8px";
    this._close.style.lineHeight = "8px";
    this._close.style.fontSize = "8px";
    this._close.style.borderRadius = "3px";
    this._close.style.position = "absolute";
    this._close.style.right = "3px";
    this._close.style.top = "1px";
    this._close.style.userSelect = "none";
    this._close.style.fontFamily =
      "PingFang-SC-Regular,BlinkMacSystemFont,Segoe UI,PingFang SC,Hiragino Sans GB,Microsoft YaHei,Helvetica Neue,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,serif";
    this._close.innerHTML = "x";

    this._close.onclick = (e) => {
      callback(this.id);
    };

    this._text.appendChild(this._close);
  }

  get text(): HTMLDivElement {
    return this._text;
  }

  public setText(data: string, style: MeasureStyle) {
    this._textInput.innerHTML = data;
    this._textInput.style.fontSize = `${style.fontSize}px`;
    this._textInput.style.color = style.fontColor;
    this._text.style.backgroundColor = style.backgroundColor;
    const length = this._textInput.innerHTML.length;
    this._text.style.width = (length + 1) * 10 + "px";
    document.body.appendChild(this._text);
  }

  public setPosition(position: Vector2, containerWidth: number, containerHeight: number) {
    const textWidth = this._text.offsetWidth;
    const textHeight = this._text.offsetHeight;
    if (position.x + textWidth / 2 > containerWidth || position.x - textWidth / 2 < 0 || position.y + textHeight / 2 > containerHeight || position.y - textHeight / 2 < 0) {
      //do nothing
      this.release();
    } else {
      this._text.style.left = `${position.x - textWidth / 2}px`;
      this._text.style.top = `${position.y - textHeight / 2}px`;
      document.body.appendChild(this._text);
    }
  }

  public release() {
    this._text.parentElement && this._text.parentElement.removeChild(this._text);
  }
}
