import * as THREE from "three";
import { ObservablesManager } from "../event/ObservablesManager";
import { Camera2D } from "./Camera2D";

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

const _changeEvent = { type: "change" };
const _startEvent = { type: "start" };
const _endEvent = { type: "end" };
const CONTROL_STATE = {
  NONE: -1,
  ROTATE: 0,
  DOLLY: 1,
  PAN: 2,
  TOUCH_ROTATE: 3,
  TOUCH_PAN: 4,
  TOUCH_DOLLY_PAN: 5,
  TOUCH_DOLLY_ROTATE: 6
};

export class Camera2DControls extends THREE.EventDispatcher {
  object: Camera2D;
  public domElement: HTMLCanvasElement;
  public enabled: boolean;
  public minZoom: number;
  public maxZoom: number;
  private pointerBindings: {
    LEFT: THREE.MOUSE;
    MIDDLE: THREE.MOUSE;
    RIGHT: THREE.MOUSE;
  };

  private touchBindings: {
    ONE: THREE.TOUCH;
    TWO: THREE.TOUCH;
  };

  private interactionState: number;

  constructor(object: Camera2D, domElement: HTMLCanvasElement) {
    super();

    if (domElement === undefined) console.warn('Camera2DControls: The second parameter "domElement" is now mandatory.');

    this.object = object;
    this.domElement = domElement;
    this.domElement.style.touchAction = "none"; // disable touch scroll

    // Set to false to disable this control
    this.enabled = true;

    // How far you can zoom in and out ( OrthographicCamera only )
    this.minZoom = 0;
    this.maxZoom = Infinity;

    // Mouse buttons
    this.pointerBindings = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    // Touch fingers
    this.touchBindings = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

    this.interactionState = CONTROL_STATE.NONE;

    this.bindEvents();
  }

  private bindEvents() {
    this.domElement.addEventListener("pointerdown", this.onPointerDown, false);
    this.domElement.addEventListener("pointermove", this.onPointerMove, false);
    this.domElement.addEventListener("pointerup", this.onPointerUp, false);
    this.domElement.addEventListener("wheel", this.onMouseWheel, false);
    this.domElement.addEventListener("contextmenu", this.onContextMenu, false);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.enabled === false) return;

    // event.preventDefault();
    // event.stopPropagation();

    switch (event.pointerType) {
      case "mouse":
        switch (event.button) {
          case THREE.MOUSE.LEFT:
            this.interactionState = CONTROL_STATE.PAN;
            break;
          default:
            return;
        }
        break;
    }

    // console.log(this.screenToScene(new THREE.Vector2(event.clientX, event.clientY)));
    if (this.interactionState !== CONTROL_STATE.NONE) this.dispatchEvent(_startEvent);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.enabled === false) return;

    // event.preventDefault();
    // event.stopPropagation();

    switch (event.pointerType) {
      case "mouse":
        switch (this.interactionState) {
          case CONTROL_STATE.PAN:
            this.panByPointer(event);
            break;
        }
        break;
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    // event.preventDefault();
    // event.stopPropagation();

    this.interactionState = CONTROL_STATE.NONE;

    if (this.enabled === false) return;
    this.dispatchEvent(_endEvent);
  };

  private onMouseWheel = (event: WheelEvent) => {
    if (this.enabled === false) return;

    // event.preventDefault();
    // event.stopPropagation();

    this.zoomByWheel(event);
    this.dispatchEvent(_endEvent);
  };

  private onContextMenu = (event: PointerEvent) => {
    if (this.enabled === false) return;
    event.preventDefault();
  };

  private zoomByWheel(event: WheelEvent) {
    if (event instanceof WheelEvent) {
      const point = new THREE.Vector2(event.offsetX, event.offsetY);
      const pointScene = this.object.screenToScene(point);
      const delta = event.deltaY > 0 ? 1 / 1.3 : 1.3;
      this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom * delta));
      const newDestScene = this.object.screenToScene(point);
      this.object.position.x += pointScene.x - newDestScene.x;
      this.object.position.y += pointScene.y - newDestScene.y;
      this.update();
      this.dispatchEvent(_changeEvent);
      ObservablesManager.getInstance().onCameraChangedObservable.notifyObservers(this.object);
    }
  }

  private panByPointer(event: PointerEvent) {
    this.object.position.x -= event.movementX / this.object.zoom;
    this.object.position.y += event.movementY / this.object.zoom;
    this.update();
    this.dispatchEvent(_changeEvent);
    ObservablesManager.getInstance().onCameraChangedObservable.notifyObservers(this.object);
  }

  public update() {
    this.object.updateProjectionMatrix();
  }

  public dispose() {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown, false);
    this.domElement.removeEventListener("pointermove", this.onPointerMove, false);
    this.domElement.removeEventListener("pointerup", this.onPointerUp, false);
    this.domElement.removeEventListener("wheel", this.onMouseWheel, false);
    this.domElement.removeEventListener("contextmenu", this.onContextMenu, false);
  }
}
