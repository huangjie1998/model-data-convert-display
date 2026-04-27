import { IPoint } from "@/util/MathUtils";
import { Vector2, Vector3 } from "three";

import { ObjectPool } from "../../util/ObjectPool";
import { Camera2D } from "../camera/Camera2D";
import { Camera2DControls } from "../camera/Camera2DControls";
import { ViewPoint } from "./ViewPoint";

enum DrawType {
  RECT,
  CIRCLE,
  POLYGON,
  ARROW,
  BRUSH,
  TEXT
}

interface DrawData {
  type: DrawType;
  points: Vector2[];
  text: string;
  mouse: Vector2;
}

export interface PointOfViewOptions {
  borderWidth?: number;
  borderColor?: string;
  fillColor?: string;
  fontColor?: string;
  fontSize?: number;
  fontBackgroundColor?: string;
  data?: any;
}

export class PointOfView {
  private _camera: Camera2D;
  private _canvas: HTMLCanvasElement;
  private _context: CanvasRenderingContext2D;
  private _currentDownPoint: Vector2;
  private _currentType = DrawType.RECT;
  private _currentDrawData: DrawData;
  private _drawDataArray: DrawData[] = [];
  private _textInputPool: ObjectPool<TextAreaObject>;
  private _options: PointOfViewOptions;
  private _initRaycasterPlane: () => void;
  private _screenToScene: (point: IPoint) => Vector3;
  private _viewPoint: ViewPoint;

  constructor(camera: Camera2D, options?: PointOfViewOptions) {
    this._camera = camera;
    this._viewPoint = new ViewPoint(this._camera);
    this._options = options || {};
    this.initPlugin();
    this.initEvent();
    this.initCurrentDrawData();
    this._textInputPool = new ObjectPool<TextAreaObject>(TextAreaObject);
    if (options?.data) {
      this.load(options.data);
    }
  }

  get textInputPool(): ObjectPool<TextAreaObject> {
    return this._textInputPool;
  }

  get options(): PointOfViewOptions {
    return this._options;
  }

  private initPlugin() {
    this._canvas = document.createElement("canvas");
    this._canvas.style.position = "absolute";
    this._canvas.style.top = "0";
    this._canvas.style.left = "0";
    this._canvas.width = this._camera.domElement.offsetWidth;
    this._canvas.height = this._camera.domElement.offsetHeight;
    document.body.appendChild(this._canvas);

    this._context = this._canvas.getContext("2d");
  }

  private initEvent() {
    this._canvas.addEventListener("pointerdown", this.onPointerDown);
    this._canvas.addEventListener("pointermove", this.onPointerMove);
    this._canvas.addEventListener("pointerup", this.onPointerUp);
    this._canvas.addEventListener("dblclick", this.onDoubleClick);
    document.body.addEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Backquote") {
      this._currentType = (this._currentType + 1) % 6;
      console.log("currentType " + this._currentType);
      this.initCurrentDrawData();
    }
    if (event.ctrlKey && event.code === "KeyZ") {
      this.undo();
    }
    if (event.ctrlKey && event.code === "KeyS") {
      this.save();
    }
  };

  private undo() {
    this._drawDataArray.pop();
    this.flush();
  }

  public load(config: any) {
    this._drawDataArray.length = 0;
    this._viewPoint.load(config.pointOfView);
    setTimeout(() => {
      const marks = config.marks;
      for (let i = 0; i < marks.length; i++) {
        const mark = marks[i];
        const drawData: DrawData = {
          type: mark.type,
          points: [],
          text: mark.text,
          mouse: undefined
        };
        for (let j = 0; j < mark.points.length; j += 3) {
          const screen = this._camera.sceneToScreen(new Vector2(mark.points[j], mark.points[j + 1]));
          drawData.points.push(screen);
        }
        this._drawDataArray.push(drawData);
      }
      this.flush();
    }, 100);
  }

  public save() {
    const result: any = {};
    result.marks = [];
    this._drawDataArray.forEach((data) => {
      const obj: any = {};
      obj.type = data.type;
      obj.points = data.points
        .map((p) => {
          const scenePoint = this._camera.screenToScene(p);
          if (scenePoint) {
            return [scenePoint.x, scenePoint.y, 0];
          } else {
            console.warn("PointOfView save error because scenePoint is null");
          }
        })
        .flat();
      obj.text = data.text;
      result.marks.push(obj);
    });
    result.pointOfView = this._viewPoint.save();
    console.log(JSON.stringify(result));
    return result;
  }

  private initCurrentDrawData() {
    this._currentDrawData = {
      type: this._currentType,
      points: [],
      text: "",
      mouse: undefined
    };
  }

  private onPointerDown = (event: PointerEvent) => {
    this._currentDownPoint = new Vector2(event.offsetX, event.offsetY);
    if (this._currentType === DrawType.RECT || this._currentType === DrawType.CIRCLE || this._currentType === DrawType.ARROW || this._currentType === DrawType.BRUSH) {
      this._currentDrawData.points.push(this._currentDownPoint.clone());
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this._currentType === DrawType.RECT || this._currentType === DrawType.CIRCLE || this._currentType === DrawType.ARROW) {
      if (this._currentDownPoint) {
        this.onDraw(event);
      }
    } else if (this._currentType === DrawType.POLYGON) {
      this.onDraw(event);
    } else if (this._currentType === DrawType.BRUSH) {
      if (this._currentDownPoint) {
        const movePoint = new Vector2(event.offsetX, event.offsetY);
        const pointLength = this._currentDrawData.points.length;
        if (this._currentDrawData.points[pointLength - 1].distanceTo(movePoint) > 5) {
          this._currentDrawData.points.push(movePoint);
        }
        this.onDraw(event);
      }
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    const downUpPoint = new Vector2(event.offsetX, event.offsetY);
    if (this._currentType === DrawType.RECT || this._currentType === DrawType.CIRCLE || this._currentType === DrawType.ARROW) {
      if (this._currentDownPoint.distanceTo(downUpPoint) > 5) {
        this._currentDrawData.points.push(downUpPoint);
        this._currentDrawData.mouse = undefined;
        this._drawDataArray.push(this._currentDrawData);
      }
      this.initCurrentDrawData();
    } else if (this._currentType === DrawType.POLYGON) {
      this._currentDrawData.points.push(downUpPoint);
    } else if (this._currentType === DrawType.BRUSH) {
      this._currentDrawData.mouse = undefined;
      this._drawDataArray.push(this._currentDrawData);
      this.initCurrentDrawData();
    } else if (this._currentType === DrawType.TEXT) {
      if (this._currentDownPoint) {
        this._currentDrawData.points.push(this._currentDownPoint.clone());
        this._currentDrawData.mouse = undefined;
        this.onDraw(event);
        this._drawDataArray.push(this._currentDrawData);
        this.initCurrentDrawData();
      }
    }
    this._currentDownPoint = null;
  };

  private onDoubleClick = (event: PointerEvent) => {
    if (this._currentType === DrawType.POLYGON) {
      this._currentDrawData.mouse = undefined;
      this._drawDataArray.push(this._currentDrawData);
      this.initCurrentDrawData();
    }
  };

  private onDraw(event: PointerEvent) {
    this.flush();
    this._currentDrawData.mouse = new Vector2(event.offsetX, event.offsetY);
    this.draw(this._currentDrawData);
  }

  private flush() {
    this._textInputPool.clear();
    this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const newDrawDataArray = [];
    for (let index = 0; index < this._drawDataArray.length; index++) {
      const drawData = this._drawDataArray[index];
      if (drawData.type === DrawType.TEXT) {
        if (drawData.text) {
          this.draw(drawData);
          newDrawDataArray.push(drawData);
        }
      } else {
        this.draw(drawData);
        newDrawDataArray.push(drawData);
      }
    }
    if (newDrawDataArray.length !== this._drawDataArray.length) {
      this._drawDataArray = newDrawDataArray;
    }
  }

  private draw(drawData: DrawData) {
    switch (drawData.type) {
      case DrawType.RECT:
        this.drawRect(drawData);
        break;
      case DrawType.CIRCLE:
        this.drawCircle(drawData);
        break;
      case DrawType.POLYGON:
        this.drawPolygon(drawData);
        break;
      case DrawType.ARROW:
        this.drawArrow(drawData);
        break;
      case DrawType.BRUSH:
        this.drawBrush(drawData);
        break;
      case DrawType.TEXT:
        this.drawText(drawData);
        break;
    }
  }

  private drawRect(drawData: DrawData) {
    const startPoint = drawData.points[0];
    const endPoint = drawData.points.length > 1 ? drawData.points[1] : drawData.mouse;
    this._context.beginPath();
    this._context.lineWidth = this._options.borderWidth || 1;
    this._context.strokeStyle = this._options.borderColor || "red";
    this._context.rect(startPoint.x, startPoint.y, endPoint.x - startPoint.x, endPoint.y - startPoint.y);
    this._context.stroke();
    this._context.closePath();
  }

  private drawCircle(drawData: DrawData) {
    const startPoint = drawData.points[0];
    const endPoint = drawData.points.length > 1 ? drawData.points[1] : drawData.mouse;
    const center = new Vector2((startPoint.x + endPoint.x) / 2, (startPoint.y + endPoint.y) / 2);
    const a = (startPoint.x - endPoint.x) / 2;
    const b = (startPoint.y - endPoint.y) / 2;
    const step = Math.PI / 18;
    this._context.beginPath();
    this._context.lineWidth = this._options.borderWidth || 1;
    this._context.strokeStyle = this._options.borderColor || "red";
    this._context.moveTo(center.x + a, center.y);
    for (let i = 0; i < 2 * Math.PI; i += step) {
      this._context.lineTo(center.x + a * Math.cos(i), center.y + b * Math.sin(i));
    }
    this._context.stroke();
    this._context.closePath();
  }

  private drawPolygon(drawData: DrawData) {
    this._context.beginPath();
    this._context.lineWidth = this._options.borderWidth || 1;
    this._context.strokeStyle = this._options.borderColor || "red";
    for (let index = 0; index < drawData.points.length; index++) {
      const point = drawData.points[index];
      if (index === 0) {
        this._context.moveTo(point.x, point.y);
      } else {
        this._context.lineTo(point.x, point.y);
      }
    }
    if (drawData.points.length > 0) {
      if (drawData.mouse) {
        this._context.lineTo(drawData.mouse.x, drawData.mouse.y);
      }
      this._context.lineTo(drawData.points[0].x, drawData.points[0].y);
    }
    this._context.stroke();
    this._context.closePath();
  }

  private drawArrow(drawData: DrawData) {
    const startPoint = drawData.points[0];
    const endPoint = drawData.points.length > 1 ? drawData.points[1] : drawData.mouse;
    this._context.beginPath();
    this._context.fillStyle = this._options.fillColor || "red";
    this.canvasArrow(startPoint.x, startPoint.y, endPoint.x, endPoint.y, [-15, 5, -20, 16]);
    this._context.fill();
    this._context.closePath();
  }

  private canvasArrow(startX, startY, endX, endY, controlPoints) {
    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const sin = dy / len;
    const cos = dx / len;
    const a = [];
    a.push(0, 0);
    for (let i = 0; i < controlPoints.length; i += 2) {
      const x = controlPoints[i];
      const y = controlPoints[i + 1];
      a.push(x < 0 ? len + x : x, y);
    }
    a.push(len, 0);
    for (let i = controlPoints.length; i > 0; i -= 2) {
      const x = controlPoints[i - 2];
      const y = controlPoints[i - 1];
      a.push(x < 0 ? len + x : x, -y);
    }
    a.push(0, 0);
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i] * cos - a[i + 1] * sin + startX;
      const y = a[i] * sin + a[i + 1] * cos + startY;
      if (i === 0) this._context.moveTo(x, y);
      else this._context.lineTo(x, y);
    }
  }

  private drawBrush(drawData: DrawData) {
    this._context.beginPath();
    this._context.lineWidth = this._options.borderWidth || 1;
    this._context.strokeStyle = this._options.borderColor || "red";
    for (let index = 0; index < drawData.points.length; index++) {
      const point = drawData.points[index];
      if (index === 0) {
        this._context.moveTo(point.x, point.y);
      } else {
        this._context.lineTo(point.x, point.y);
      }
    }
    this._context.stroke();
    this._context.closePath();
  }

  private drawText(drawData: DrawData) {
    const textAreaObject = this._textInputPool.get(this);
    textAreaObject.setDrawData(drawData);
  }

  public dispose() {
    this._textInputPool.clear();
    this._canvas.removeEventListener("pointerdown", this.onPointerDown);
    this._canvas.removeEventListener("pointermove", this.onPointerMove);
    this._canvas.removeEventListener("pointerup", this.onPointerUp);
    this._canvas.parentElement && this._canvas.parentElement.removeChild(this._canvas);
    document.body.removeEventListener("keydown", this.onKeyDown);
  }
}

class TextAreaObject {
  private _textarea: HTMLTextAreaElement;
  private _inputDOM: any;
  private _drawData: DrawData;
  private _screenDownPoint: Vector2;
  private _originPosition: Vector2;
  private _plugin: PointOfView;
  private _moveable = true;
  constructor(plugin: PointOfView) {
    this._plugin = plugin;
    this._inputDOM = document.createElement("div");
    this._inputDOM.style.position = "absolute";
    this._inputDOM.tabIndex = 1000;

    this._textarea = document.createElement("textarea");
    this._textarea.tabIndex = 1000;
    this._textarea.style.position = "absolute";
    this._textarea.style.left = `0px`;
    this._textarea.style.top = `0px`;
    this._textarea.placeholder = "请输入";
    this._textarea.style.textAlign = "left";
    this._textarea.style.resize = "none";
    this._inputDOM.appendChild(this._textarea);
  }

  public setDrawData(drawData: DrawData) {
    this._drawData = drawData;
    this._textarea.addEventListener("input", this.onInput);
    this._textarea.addEventListener("focusout", this.onFocusOut);
    this._inputDOM.addEventListener("pointerdown", this.onPointerDown);
    this._inputDOM.addEventListener("dblclick", this.onDblClick);
    this.draw();
  }

  public release() {
    this._textarea.value = "";
    this._drawData = undefined;
    this._moveable = true;
    this._textarea.removeEventListener("input", this.onInput);
    this._textarea.removeEventListener("focusout", this.onFocusOut);
    this._inputDOM.removeEventListener("pointerdown", this.onPointerDown);
    this._inputDOM.removeEventListener("dblclick", this.onDblClick);
    document.removeEventListener("pointermove", this.onDocumentPointerMove);
    document.removeEventListener("pointerup", this.onDocumentPointerUp);
    this._inputDOM.parentElement && document.body.removeChild(this._inputDOM);
  }

  private draw() {
    document.body.appendChild(this._inputDOM);
    this._inputDOM.style.left = `${this._drawData.points[0].x}px`;
    this._inputDOM.style.top = `${this._drawData.points[0].y}px`;

    this._textarea.style.background = this._plugin.options.fontBackgroundColor || "#FFFFFF";
    this._textarea.style.fontSize = this._plugin.options.fontSize ? this._plugin.options.fontSize + "px" : "12px";
    this._textarea.style.color = this._plugin.options.fontColor || "#000000";
    this._textarea.style.borderColor = this._plugin.options.borderColor || "#FF0000";
    this._textarea.style.borderWidth = this._plugin.options.borderWidth ? this._plugin.options.borderWidth + "px" : "1px";
    this._textarea.style.outlineColor = this._plugin.options.borderColor || "#FF0000";

    this._textarea.value = this._drawData.text;
    if (!this._drawData.text) {
      this._textarea.focus();
      this._moveable = false;
    } else {
      this._textarea.style.cursor = "move";
    }
  }

  private onInput = () => {
    console.log(this._textarea.value);
    this._drawData.text = this._textarea.value;
  };

  private onPointerDown = (event) => {
    this._screenDownPoint = new Vector2(event.clientX, event.clientY);
    this._originPosition = new Vector2(this._drawData.points[0].x, this._drawData.points[0].y);
    document.addEventListener("pointermove", this.onDocumentPointerMove);
    document.addEventListener("pointerup", this.onDocumentPointerUp);
  };

  private onDblClick = (event) => {
    this._textarea.style.cursor = "text";
    this._textarea.focus();
    this._moveable = false;
  };

  private onFocusOut = () => {
    if (this._drawData.text) {
      this._textarea.style.cursor = "move";
      this._moveable = true;
    } else {
      this._plugin.textInputPool.release(this);
    }
  };

  private onDocumentPointerMove = (event) => {
    if (this._moveable && this._screenDownPoint) {
      const current = new Vector2(event.clientX, event.clientY);
      if (current.distanceTo(this._screenDownPoint) > 5) {
        const offset = current.sub(this._screenDownPoint);
        const target = this._originPosition.clone().add(offset);
        this._drawData.points[0].x = target.x;
        this._drawData.points[0].y = target.y;

        this._inputDOM.style.left = `${target.x}px`;
        this._inputDOM.style.top = `${target.y}px`;
      }
    }
  };

  private onDocumentPointerUp = () => {
    this._screenDownPoint = undefined;
    this._originPosition = undefined;
    document.removeEventListener("pointermove", this.onDocumentPointerMove);
    document.removeEventListener("pointerup", this.onDocumentPointerUp);
  };
}
