import { BufferGeometry, EventDispatcher, Float32BufferAttribute, LineBasicMaterial, LineLoop } from "three";
import { IPoint, MathUtils } from "../../util/MathUtils";
import { Scene3D } from "../Scene3D";

export enum ObjectPaintMode {
  line,
  rect,
  circle
}

export class ObjectPaint extends EventDispatcher {
  private _paintLine: LineLoop;
  private _paintLineClickPosition: IPoint[] = [];
  private _paintLineVertex: IPoint[] = [];
  private _container: Scene3D;
  private _paintType: number;
  private _downClick: IPoint;
  private _moved = false;

  constructor(container: Scene3D, drawType: ObjectPaintMode) {
    super();
    this._container = container;
    this._paintType = drawType;
    this.initLine();
    this.initEvent();
  }

  private initLine() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([], 3));
    this._paintLine = new LineLoop(
      geometry,
      new LineBasicMaterial({
        color: 0xff0000,
        linewidth: 1,
        transparent: true,
        opacity: 0.5
      })
    );
    this._paintLine.position.z = 200;
    this._paintLine.frustumCulled = false;
    this._container.add(this._paintLine);
  }

  private initEvent() {
    this._container.domElement.addEventListener("pointerdown", this.onPointerDown);
    this._container.domElement.addEventListener("pointermove", this.onPointerMove);
    this._container.domElement.addEventListener("pointerup", this.onPointerUp);
    document.body.addEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      this.dispose();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this._downClick = this.screenToScene({ x: e.clientX, y: e.clientY });
    this._moved = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this._downClick && Math.max(Math.abs(e.clientX - this._downClick.x), Math.abs(e.clientY - this._downClick.y)) > 2) {
      this._moved = true;
    }
    this._paintLineVertex = this._paintLineClickPosition.slice();
    if (this._paintLineVertex.length > 0) {
      if (ObjectPaintMode.line === this._paintType) {
        this._paintLineVertex.push(this.screenToScene({ x: e.clientX, y: e.clientY }));
      } else if (ObjectPaintMode.rect === this._paintType) {
        const leftTop = this._paintLineVertex[0];
        const rightBottom = this.screenToScene({ x: e.clientX, y: e.clientY });
        const rightTop = { x: rightBottom.x, y: leftTop.y };
        const leftBottom = { x: leftTop.x, y: rightBottom.y };
        this._paintLineVertex.push(rightTop, rightBottom, leftBottom);
      } else if (ObjectPaintMode.circle === this._paintType) {
        const center = this._paintLineVertex[0];
        const radius = MathUtils.vectorDistance(this.screenToScene({ x: e.clientX, y: e.clientY }), center);
        this._paintLineVertex = this.getCirclePoints(center, radius);
      }
      this.updateLineMesh(this._paintLineVertex);
    }
  };

  private getCirclePoints(center: IPoint, radius: number): IPoint[] {
    const radianLen = 10; // 10mm为弧长单位
    const points: IPoint[] = [];
    const girth = 2 * Math.PI * radius;
    const counter: number = Math.min(Math.max(Math.ceil(girth / radianLen), 360), 720);
    for (let i = 0; i < counter; i++) {
      const deg: number = i === 0 ? 0 : (360 / counter) * i;
      const radian = (deg * Math.PI) / 180;
      points.push({
        x: center.x + radius * Math.cos(radian),
        y: center.y + radius * Math.sin(radian)
      });
    }
    return points;
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this._moved) return;
    this._paintLineClickPosition.push(this.screenToScene({ x: e.clientX, y: e.clientY }));
    if (ObjectPaintMode.rect === this._paintType || ObjectPaintMode.circle === this._paintType) {
      if (this._paintLineClickPosition.length >= 2) {
        this.dispose();
      }
    }
  };

  private screenToScene(point: IPoint): IPoint {
    const centerX = this._container.camera.position.x;
    const centerY = this._container.camera.position.y;
    const x = centerX + (point.x - this._container.domElement.clientWidth / 2) / this._container.camera.zoom;
    const y = centerY - (point.y - this._container.domElement.clientHeight / 2) / this._container.camera.zoom;
    return { x, y };
  }

  public reset() {
    this._paintLineClickPosition = [];
    this._paintLine.geometry.setAttribute("position", new Float32BufferAttribute([], 3));
    this._paintLine.geometry.attributes.position.needsUpdate = true;
  }

  public updateLineMesh(point: IPoint[]) {
    const points: number[] = point.map((p) => [p.x, p.y, 0]).flat();
    console.log(points);
    this._paintLine.geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
    this._paintLine.geometry.attributes.position.needsUpdate = true;
  }

  public dispose() {
    document.body.removeEventListener("keydown", this.onKeyDown);
    this._container.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this._container.domElement.removeEventListener("pointermove", this.onPointerMove);
    this._container.domElement.removeEventListener("pointerup", this.onPointerUp);
    if (this._paintLineClickPosition.length > 0) {
      this.dispatchEvent({ type: "ObjectPaint", points: this._paintLineVertex });
      console.log(this._paintLineVertex);
    }
    if (this._paintLine) {
      this._paintLine.geometry.dispose();
      this._container.remove(this._paintLine);
    }
    this._paintLine = undefined;
  }
}
