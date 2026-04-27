import * as THREE from "three";
import { Group, Matrix4, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { Box3 } from "./extension/Box3";
import { MathUtils } from "../util/MathUtils";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import Stats from "three/examples/jsm/libs/stats.module";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";
import { ObservablesManager } from "./event/ObservablesManager";
import { Camera2D } from "./camera/Camera2D";
import { Camera2DControls } from "./camera/Camera2DControls";
import { Snapper } from "./plugins/Snapper";
import { CamreaZoom as CameraZoomController } from "./plugins/CamreaZoom";
import { onDragOver, onDrop } from "@/util/DragDrop";
import { GlxLoader } from "@/core/plugins/GlxLoader";
// import * as SnappyJS from "snappyjs";

export class Scene3D extends Scene {
  public _renderer: WebGLRenderer;
  private _camera: Camera2D;
  private _sceneBBox: Box3 = new Box3();
  private _raycaster: Raycaster;
  private _cameraChanged = true;
  private _controls: Camera2DControls;
  private _loader: GLTFLoader;
  private _stats: Stats;
  private _readyToRenderSnapper = false;
  public needsUpdateGPUData = false;
  private pointerMoveCount = 0;
  private previousCanvasSize = new THREE.Vector2();
  private modelFiles = [];
  private scenes: THREE.Group;
  private overlayUrlglTFMap = new Map();
  private transformingOverlay = null;
  private transformDownPoint = new Vector2();
  private transformUpPoint = new Vector2();
  private transformStartPoint = new Vector3();
  private transformMovePoint = new Vector3();
  public hitPosition;
  private toolObject;
  private cameraZoomController: CameraZoomController;
  private layerStates: any = [];
  private layoutStates: any = [];
  private currentLayout: any;
  private Mesh: THREE.Mesh;
  private Line: THREE.LineSegments;
  private planes: THREE.Plane[] = [];
  private MainScene: THREE.Group = new THREE.Group();
  private _onCameraZoomFinished;
  public hitEnable = false;
  public fontPath;

  constructor(options) {
    super();
    (window as any).webgl = this;
    this.init(options);
  }

  get controls(): Camera2DControls {
    return this._controls;
  }

  get domElement(): HTMLCanvasElement {
    return this._renderer.domElement;
  }

  get camera(): Camera2D {
    return this._camera;
  }

  get stats() {
    let lines = 0;
    let points = 0;
    let triangles = 0;
    let meshes = 0;
    this.modelFiles.forEach((glTF) => {
      glTF.scene.traverse((node) => {
        if ((node as any).isMesh) {
          meshes++;
          const indexedTri = (node as any).geometry?.index?.count / 3;
          const rawTri = (node as any).geometry.attributes.position.count / 3;
          triangles += indexedTri || rawTri;
        } else if ((node as any).isLine) {
          lines++;
        } else if ((node as any).isPoints) {
          points++;
        }
      });
    });
    return {
      lines,
      points,
      triangles,
      meshes
    };
  }

  protected init(options) {
    this.initThree(options);
    this.initData(options);
    this.initLight();
    this.initSign();
    this.bindEvents();
  }

  public initSign() {
    this.toolObject = new THREE.Group();
    this.toolObject.renderOrder = 100000;
    this.toolObject.name = "sign";
    this.add(this.toolObject);

    //----------------------- 浣嶇疆 -----------------------

    const PointMaterial = new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, alphaTest: 0.5, transparent: true, depthTest: false });
    PointMaterial.color.setRGB(1.0, 0.3, 0.7);
    const PointGeometry = new THREE.BufferGeometry();
    PointGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));

    this.hitPosition = new THREE.Group(); //new THREE.Points(PointGeometry, PointMaterial);
    this.hitPosition.renderOrder = 100000;
    this.hitPosition.name = "sign";

    const point = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(10, 10, 0),
        new THREE.Vector3(10, -10, 0),
        new THREE.Vector3(10, -10, 0),
        new THREE.Vector3(-10, -10, 0),
        new THREE.Vector3(-10, -10, 0),
        new THREE.Vector3(-10, 10, 0),
        new THREE.Vector3(-10, 10, 0),
        new THREE.Vector3(10, 10, 0)
      ]),
      new THREE.LineBasicMaterial({
        color: 0xaaaaff,
        alphaTest: 0.5,
        transparent: true,
        depthTest: false
      })
    );
    point.name = "sign";
    this.hitPosition.add(point);
    this.hitPosition.point = point;

    const line = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(10, 10, 0),
        new THREE.Vector3(-10, 10, 0),
        new THREE.Vector3(-10, 10, 0),
        new THREE.Vector3(10, -10, 0),
        new THREE.Vector3(10, -10, 0),
        new THREE.Vector3(-10, -10, 0),
        new THREE.Vector3(-10, -10, 0),
        new THREE.Vector3(10, 10, 0)
      ]),
      new THREE.LineBasicMaterial({
        color: 0xaaaaff,
        alphaTest: 0.5,
        transparent: true,
        depthTest: false
      })
    );
    line.name = "sign";
    this.hitPosition.add(line);
    this.hitPosition.line = line;

    const cross = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(10, 10, 0), new THREE.Vector3(-10, -10, 0), new THREE.Vector3(-10, 10, 0), new THREE.Vector3(10, -10, 0)]),
      new THREE.LineBasicMaterial({
        color: 0xaaaaff,
        alphaTest: 0.5,
        transparent: true,
        depthTest: false
      })
    );
    cross.name = "sign";
    this.hitPosition.add(cross);
    this.hitPosition.cross = cross;

    const DropFoot = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 20, 0),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(20, 0, 0),
        new THREE.Vector3(0, 10, 0),
        new THREE.Vector3(10, 10, 0),
        new THREE.Vector3(10, 0, 0),
        new THREE.Vector3(10, 10, 0)
      ]),
      new THREE.LineBasicMaterial({
        color: 0xaaaaff,
        alphaTest: 0.5,
        transparent: true,
        depthTest: false
      })
    );
    DropFoot.name = "sign";
    this.hitPosition.add(DropFoot);
    this.hitPosition.DropFoot = DropFoot;

    const midpoint = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-10, -10, 0),
        new THREE.Vector3(10, -10, 0),
        new THREE.Vector3(-10, -10, 0),
        new THREE.Vector3(0, 10, 0),
        new THREE.Vector3(10, -10, 0),
        new THREE.Vector3(0, 10, 0)
      ]),
      new THREE.LineBasicMaterial({
        color: 0xaaaaff,
        alphaTest: 0.5,
        transparent: true,
        depthTest: false
      })
    );
    midpoint.name = "sign";
    this.hitPosition.add(midpoint);
    this.hitPosition.midpoint = midpoint;

    this.toolObject.add(Snapper.guideLine);
    this.toolObject.add(this.cameraZoomController.frame);
    //----------------------------------------------------
  }

  public initThree(options) {
    this.background = new THREE.Color(0x33334c);
    // THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

    // init three renderer
    this._renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      stencil: true,
      logarithmicDepthBuffer: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance"
    });

    this._renderer.setClearColor(this.background);
    // this._renderer.setClearAlpha(0.01);
    this._renderer.autoClear = false;
    this._renderer.autoClearColor = false;
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.shadowMap.enabled = true;
    this._renderer.toneMapping = THREE.LinearToneMapping;
    this._renderer.domElement.className = "biz-canvas3d";
    this._renderer.domElement.style.outline = "none";
    this._renderer.domElement.style.position = "absolute";
    this._renderer.domElement.style.top = "0";
    this._renderer.domElement.style.left = "0";
    this._renderer.domElement.style.width = "100%";
    this._renderer.domElement.style.height = "100%";
    this._renderer.localClippingEnabled = true;
    Snapper.SnapperMateral.clipping = true;

    if (options.container) {
      options.container.appendChild(this._renderer.domElement);
    } else {
      document.body.appendChild(this._renderer.domElement);
    }

    // init three controls
    const width = this._renderer.domElement.clientWidth;
    const height = this._renderer.domElement.clientHeight;
    this._camera = new Camera2D(-width / 2, width / 2, height / 2, -height / 2, -10000, 100000);
    this._camera.domElement = this._renderer.domElement;
    this._controls = new Camera2DControls(this._camera, this._renderer.domElement);

    this._stats = Stats();
    // document.body.appendChild(this._stats.dom);

    this._raycaster = new Raycaster();
    this.cameraZoomController = new CameraZoomController(this._controls, this._camera, this._renderer);
    this.cameraZoomController.addEventListener("finish", this.onCameraZoomFinished);

    this.scenes = new Group();
    this.add(this.scenes);
  }

  public onCameraZoomFinished = () => {
    this.needsUpdateGPUData = true;
    if(this._onCameraZoomFinished){
      this._onCameraZoomFinished("zoomD");
      this._onCameraZoomFinished = null;
    }
  };

  public initData(options) {
    this._loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/examples/js/libs/draco/");
    this._loader.setDRACOLoader(dracoLoader);

    if (options.data) {
      this.addModel(options.data);
    }
  }

  public initLight() {
    // this.add(new THREE.AmbientLight(0xffffff, 1.0));
  }

  public bindEvents() {
    this.controls.addEventListener("change", this.onCameraChanged);
    this._renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this._renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this._renderer.domElement.addEventListener("wheel", this.onWheel);
    this._renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("hover", this.hover);
    window.addEventListener("hover_update", this.hover_update);
    window.addEventListener("hit", this.hit);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", async (event) => {
      const startTime = new Date().getTime();
      const glTFs = await onDrop(event);

      // if (glTFs.length) {
      //   this.purgeModel();
      // }

      console.log("璇昏В锛? + ((new Date().getTime() - startTime) / 1000).toFixed(2) + "绉?);
      for (const glTF of glTFs) {
        if(this.MainScene.children.length == 0){
          this.addFile(glTF);
        }else{
          this.addMap(123,glTF,0xffff00);
        }
      }
    });
  }

  public initEvent() {
    this.bindEvents();
  }

  private onCameraChanged = () => {
    this._cameraChanged = true;
    Snapper.cameraChanged(this._camera);
  };

  private hover = (event) => {
    // console.log(event);
    // if(event.entity.id != -1){
    //   this.add(this.hitPosition);
    // }else{
    //   this.remove(this.hitPosition);
    // }
    // Snapper.hover(event.mousePosition.x, event.mousePosition.y);
  };

  private hover_update = (event) => {
    this.needsUpdateGPUData = true;
  };

  private onPointerDown = (event: MouseEvent) => {
    this.pointerMoveCount = 0;
  };

  private onPointerMove = (event: MouseEvent) => {
    if (this._readyToRenderSnapper) {
      this.needsUpdateGPUData = true;
      this._readyToRenderSnapper = false;
    }
    this.pointerMoveCount++;
    if ((this._controls as any).state != 2) {
      Snapper.hover(event.offsetX * window.devicePixelRatio, event.offsetY * window.devicePixelRatio, this._camera);
    }
  };

  private onWheel = (event: MouseEvent) => {
    this._readyToRenderSnapper = true;
  };

  public hit = (event) => {
    this.hitPosition.rotation.set(0, 0, 0);

    this.hitPosition.point.visible = false;
    this.hitPosition.line.visible = false;
    this.hitPosition.cross.visible = false;
    this.hitPosition.DropFoot.visible = false;
    this.hitPosition.midpoint.visible = false;

      if (event.position.length == 0) {
        this.hitPosition.visible = false;
      } else {
         if(this.hitEnable){

           switch (event.hitType) {
            case "face":
              this.hitPosition.line.visible = true;
              break;
            case "point":
              this.hitPosition.point.visible = true;
              break;
            case "cross":
              this.hitPosition.cross.visible = true;
              break;
            case "line":
              this.hitPosition.line.visible = true;
              break;
            case "guideLine":
              this.hitPosition.line.visible = true;
              break;
            case "DropFoot":
              this.hitPosition.rotation.z = event.angle;
              this.hitPosition.DropFoot.visible = true;
              break;
            case "midpoint":
              this.hitPosition.midpoint.visible = true;
              break;
          }

        }
        
        this.toolObject.add(this.hitPosition);
        this.hitPosition.visible = true;
        this.hitPosition.position.set(event.position[0], event.position[1], event.position[2]);
      }
  };

  public closeHit(){
    this.hitPosition.point.visible = false;
    this.hitPosition.line.visible = false;
    this.hitPosition.cross.visible = false;
    this.hitPosition.DropFoot.visible = false;
    this.hitPosition.midpoint.visible = false;
  }

  private onPointerUp = (event: MouseEvent) => {
    if (event.button === 0) {
      this._readyToRenderSnapper = true;
      Snapper.setStartPoint(event.offsetX, event.offsetY, this._camera);
      ObservablesManager.getInstance().onScenePointerUpObservable.notifyObservers({
        position: this.hitPosition.visible ? this.hitPosition.position.clone() : this.camera.screenToScene({ x: event.offsetX, y: event.offsetY }),
        snapObject: this.hitPosition
      });
    }
  };

  public resizeView() {
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._camera.left = -this._renderer.domElement.clientWidth / 2;
    this._camera.right = this._renderer.domElement.clientWidth / 2;
    this._camera.top = this._renderer.domElement.clientHeight / 2;
    this._camera.bottom = -this._renderer.domElement.clientHeight / 2;
    this._camera.updateProjectionMatrix();
  }

  public getMap(mapId){
    for(let i = 0; i < this.MainScene.children.length;i++){
      if((this.MainScene.children[i] as any).mapId == mapId){
        return this.MainScene.children[i];
      }
    }
  }

  public render() {
    this._stats.begin();

    this.hitPosition.scale.set(0.6 / (this._camera as any).zoom, 0.6 / (this._camera as any).zoom, 0.6 / (this._camera as any).zoom);

    this._renderer.autoClearColor = true;

    if (this.previousCanvasSize.x != this._renderer.domElement.width * window.devicePixelRatio || this.previousCanvasSize.y != this._renderer.domElement.height * window.devicePixelRatio) {
      this.previousCanvasSize.x = this._renderer.domElement.width * window.devicePixelRatio;
      this.previousCanvasSize.y = this._renderer.domElement.height * window.devicePixelRatio;

      Snapper.setGPURenderTargetSize(this._renderer.domElement.width, this._renderer.domElement.height);
      setTimeout(() => {
        this.needsUpdateGPUData = true;
      }, 200);
    }

    this._renderer.autoClearColor = false;
    this._renderer.clear();
    this.renderLayout();
    this.controls.update();

    if (this._cameraChanged) {
      ObservablesManager.getInstance().onCameraChangedObservable.notifyObservers(this);
    }
    this._cameraChanged = false;
    this._stats.end();
  }

  private renderLayout() {
    for(let i = 0; i< this.MainScene.children.length;i++) {
      // console.log((this.MainScene.children[i] as any).offset.scale);
      this.MainScene.children[i].scale.copy((this.MainScene.children[i] as any).offset.scale);
      this.MainScene.children[i].position.copy((this.MainScene.children[i] as any).offset.position);

      const box3 = new THREE.Box3();
      box3.union((this.MainScene.children[0].children[0] as any).geometry.boundingBox);
      box3.union((this.MainScene.children[0].children[1] as any).geometry.boundingBox);

      const width = box3.max.x - box3.min.x;
      const height = box3.max.y - box3.min.y;
      const centerX = (box3.max.x + box3.min.x) / 2;
      const centerY = (box3.max.y + box3.min.y) / 2;

      if((this.MainScene.children[i].children[0] as any).material.clippingPlanes && (this.MainScene.children[i].children[0] as any).material.clippingPlanes.length == 4){
        (this.MainScene.children[i].children[0] as any).material.clippingPlanes[0].constant = centerX + width / 2 + 0.1;
        (this.MainScene.children[i].children[0] as any).material.clippingPlanes[1].constant = -(centerX - width / 2 - 0.1);
        (this.MainScene.children[i].children[0] as any).material.clippingPlanes[2].constant = centerY + height / 2 + 0.1;
        (this.MainScene.children[i].children[0] as any).material.clippingPlanes[3].constant = -(centerY - height / 2 - 0.1);
      }
    }
    if (!this.currentLayout) {

      if (this.needsUpdateGPUData) {
        // 鏇存柊鏍囩鍦℅PU鐨勬槧灏?

        this.needsUpdateGPUData = false;
        Snapper.render(this, this._renderer, this.camera);
        this._renderer.clear();
        // console.log("take");
      }

      // 榛樿娌℃湁甯冨眬
      this._renderer.render(this, this._camera);
    } else {
      if (!this.currentLayout.viewports || this.currentLayout.viewports.length == 0) {

        if (this.needsUpdateGPUData) {
          // 鏇存柊鏍囩鍦℅PU鐨勬槧灏?

          this.needsUpdateGPUData = false;
          Snapper.render(this, this._renderer, this.camera);
          this._renderer.clear();
          // console.log("take");
        }

        // 濡傛灉娌℃湁瑙嗗彛
        this._renderer.render(this, this._camera);
      } else {

        if (this.needsUpdateGPUData) {
          // 鏇存柊鏍囩鍦℅PU鐨勬槧灏?

          this.needsUpdateGPUData = false;
          Snapper.render(this, this._renderer, this.camera,this.currentLayout.viewports);
          this._renderer.clear();
          // console.log("take");
        }

        for (let i = 0; i < this.currentLayout.viewports.length; i++) {

          for(let index = 0; index < this.MainScene.children.length;index++){

            this.MainScene.children[index].scale.set(
              this.currentLayout.viewports[i].value.customScale,
              this.currentLayout.viewports[i].value.customScale,
              this.currentLayout.viewports[i].value.customScale
            );

            this.MainScene.children[index].position.fromArray([
              this.currentLayout.viewports[i].value.offsetVector[0] * this.currentLayout.viewports[i].value.customScale,
              this.currentLayout.viewports[i].value.offsetVector[1] * this.currentLayout.viewports[i].value.customScale,
              this.currentLayout.viewports[i].value.offsetVector[2] * this.currentLayout.viewports[i].value.customScale
            ]);

            if ((this.MainScene.children[index].children[0] as any).material.clippingPlanes && (this.MainScene.children[index].children[0] as any).material.clippingPlanes.length > 0) {

              (this.MainScene.children[index].children[0] as any).material.clippingPlanes[0].constant = this.currentLayout.viewports[i].value.centerpoint[0] + this.currentLayout.viewports[i].value.width / 2;
              (this.MainScene.children[index].children[0] as any).material.clippingPlanes[1].constant = -(this.currentLayout.viewports[i].value.centerpoint[0] -this.currentLayout.viewports[i].value.width / 2);
              (this.MainScene.children[index].children[0] as any).material.clippingPlanes[2].constant = this.currentLayout.viewports[i].value.centerpoint[1] + this.currentLayout.viewports[i].value.height / 2;
              (this.MainScene.children[index].children[0] as any).material.clippingPlanes[3].constant = -(this.currentLayout.viewports[i].value.centerpoint[1] - this.currentLayout.viewports[i].value.height / 2 );

            }

            // console.log((this.Mesh.material as THREE.MeshBasicMaterial).clippingPlanes[3].constant)

            this._renderer.render(this, this._camera);
          }
        }
      }
    }
  }

  public fitToView(boundingBox: THREE.Box3) {
    // TODO: should consider huge z difference between scenes
    MathUtils.zoomFitScene2D(this._camera, boundingBox, 0.8, this._sceneBBox.max.z + 1000);
    this._camera.updateProjectionMatrix();
  }

  public addOverlay(url: string) {
    if (this.overlayUrlglTFMap.has(url)) {
      this.removeOverlay(url, false);
    }
    this._loader.load(url, (glTF) => {
      this.modelFiles.push(glTF);
      this.scenes.add(glTF.scene);
      this.overlayUrlglTFMap.set(url, glTF);

      const types = ["Mesh", "Line", "LineSegments"];
      glTF.scene.traverse((node) => {
        const nodeType = (node as any).type;
        if (types.includes(nodeType)) {
          // FIXME: id collision, should be fixed from outside, aka banned from page ux
          Snapper.register(node);
        }
      });

      this.needsUpdateGPUData = true;

      this.sortOverlay();

      this._sceneBBox.setFromObject(this.scenes);
      this.fitToView(this._sceneBBox);

      ObservablesManager.getInstance().onSceneOverlayObservable.notifyObservers(this);
    });
  }

  public addModel(buf) {
    this._loader.parse(buf, "", (data) => {
      this.addFile(data);
    });
  }

  public loadMap(mapId,data,arrayBuffer, cb, color){
    
    if(!arrayBuffer){
      this._loader.parse(data, "", (file) => {
        this.addMap(mapId,file,color);
        cb("done");
      });
    }else{
      let glx = new GlxLoader("",null);
      this.addMap(mapId,glx.parseBuffers(data,arrayBuffer),color);
      cb("done");
    }
  }

  public addMap(mapId,file,color){
    let color_ = new THREE.Color(color);

    for (let i = 0; i < file.scene.children.length; i++) {
      const layer = {
        id: i + 1,
        name: file.scene.children[i].userData.name,
        isHide: file.scene.children[i].userData.isHide,
        color: file.scene.children[i].userData.color,
        mesh: [],
        line: []
      };

      for (let j = 0; j < file.scene.children[i].children.length; j++) {
        file.scene.children[i].children[j].userData = { layerId: i, isHide: layer.isHide };
      }
    }

    this.MainScene.add(this.parse(file.scene,this.layoutStates,mapId,color_));
  }

  public unloadMap(mapId){
    let scene = null;
    for(let i = 0;i < this.MainScene.children.length;i++){
      if((this.MainScene.children[i] as any).mapId == mapId){
        scene = this.MainScene.children[i];
      }
    }

    if(scene){
      this.MainScene.remove(scene);
      this.needsUpdateGPUData = true;
    }
  }

  public addGLX(data,arrayBuffer){
    const glx = new GlxLoader("",null);
    this.addFile(glx.parseBuffers(data,arrayBuffer));
  }

  public async loadBimd(data){
    const glx = new GlxLoader("",null);
    glx.fontPath = this.fontPath;
    const file = await glx.loadSceneBundle(data);
    this.addFile(file);
  }

  public addFile(glTF) {
    this.modelFiles.push(glTF);
    console.log(glTF);

    for (let i = 0; i < glTF.scene.children.length; i++) {
      const layer = {
        id: i + 1,
        name: glTF.scene.children[i].userData.name,
        isHide: glTF.scene.children[i].userData.isHide,
        color: glTF.scene.children[i].userData.color,
        mesh: [],
        line: []
      };
      this.layerStates.push(layer);

      for (let j = 0; j < glTF.scene.children[i].children.length; j++) {
        glTF.scene.children[i].children[j].userData = { layerId: i, isHide: layer.isHide };
      }
    }

    for (let i = 0; i < glTF.scenes.length; i++) {
      const viewports = [];
      for (const key in glTF.scenes[i].userData) {
        if(typeof glTF.scenes[i].userData[key] == "string"){
          viewports.push({ name: key, value: this.parseLayout(glTF.scenes[i].userData[key]) });
        }else{
          viewports.push({ name: key, value: glTF.scenes[i].userData[key] });
        }
      }

      this.layoutStates.push({ id: i, name: glTF.scenes[i].name, viewports: viewports });
    }

    console.log(this.layoutStates);
    this.MainScene.add(this.parse(glTF.scene,this.layoutStates));
    this.scenes.add(this.MainScene);

    for (let i = 0; i < glTF.scenes.length; i++) {
      glTF.scenes[i].visible = false;
      let keyCount = 0;
      for (const key in glTF.scenes[i].userData) {
        keyCount++;
      }
      if (keyCount > 0) {
        this.scenes.add(glTF.scenes[i]);
      }
    }

    const startTime = new Date().getTime();
    const modelBox = new Box3().setFromObject(glTF.scene);
    this._sceneBBox.union(modelBox);

    console.log("鍦烘櫙锛? + ((new Date().getTime() - startTime) / 1000).toFixed(2) + "绉?);

    this.needsUpdateGPUData = true;

    this.fitToView(this._sceneBBox);

    ObservablesManager.getInstance().onSceneInitObservable.notifyObservers(this);
  }

  public parseLayout(str) {
    const obj = {};
    const value = [];
    let start = false;
    let v = "";

    for (let i = 0; i < str.length; i++) {
      if (str[i] == "(") {
        start = true;
      }

      if (start) {
        v += str[i];
      }

      if (str[i] == ")") {
        start = false;
        value.push(v);
        v = "";
      }
    }

    for (let i = 0; i < value.length; i++) {
      str = str.replace(value[i], "__value" + i);
    }

    const items = str.split(",");

    for (let i = 0; i < items.length; i++) {
      const keyValue = items[i].split(":");

      let find = false;
      for (let j = 0; j < value.length; j++) {
        if (keyValue[1] == "__value" + j) {
          let v = value[j].replace("(", "[");
          v = v.replace(")", "]");
          keyValue[1] = JSON.parse(v);
          find = true;
        }
      }

      if (find == true) {
        obj[keyValue[0]] = keyValue[1];
      } else {
        obj[keyValue[0]] = parseFloat(keyValue[1]);
      }
    }

    // console.log(str,value);

    return obj;
  }

  public parse(scene,layout,mapId?,color_?) {
    let startTime = new Date().getTime();
    const group = new THREE.Group();
    const meshBuffer = new THREE.BufferGeometry();
    const lineBuffer = new THREE.BufferGeometry();

    let meshBufferCount = 0;
    let lineBufferCount = 0;
    scene.traverse((node) => {
      if ((node as any).type == "Mesh") {
        // node.geometry = node.geometry.toNonIndexed();
        meshBufferCount += node.geometry.attributes.position.count;
      }

      if ((node as any).type == "LineSegments") {
        node.visible = false;
        lineBufferCount += node.geometry.attributes.position.count;
      }

      if ((node as any).type == "Line") {
        node.visible = false;
        lineBufferCount += (node.geometry.attributes.position.count - 1) * 2;
      }
    });

    console.log(meshBufferCount, lineBufferCount, (lineBufferCount + meshBufferCount) * 3 * 4);

    meshBuffer.setAttribute("position", new THREE.BufferAttribute(new Float32Array(meshBufferCount * 3), 3));
    meshBuffer.setAttribute("color", new THREE.BufferAttribute(new Float32Array(meshBufferCount * 4), 4));

    lineBuffer.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lineBufferCount * 3), 3));
    lineBuffer.setAttribute("color", new THREE.BufferAttribute(new Float32Array(lineBufferCount * 4), 4));

    let meshBufferOffset = 0;
    let lineBufferOffset = 0;

    scene.traverse((node) => {
      
      if ((node as any).type == "Mesh") {
        // node.geometry = node.geometry.toNonIndexed();
        // meshBufferCount += node.geometry.attributes.position.count;
        if(this.MainScene.children.length == 0)
        this.layerStates[node.userData.layerId].mesh.push({ offset: meshBufferOffset, length: node.geometry.attributes.position.count });

        for (let i = 0; i < node.geometry.attributes.position.count; i++) {
          (meshBuffer.attributes.position as any).array[meshBufferOffset * 3 + 0] = node.geometry.attributes.position.array[i * 3 + 0];
          (meshBuffer.attributes.position as any).array[meshBufferOffset * 3 + 1] = node.geometry.attributes.position.array[i * 3 + 1];
          (meshBuffer.attributes.position as any).array[meshBufferOffset * 3 + 2] = node.geometry.attributes.position.array[i * 3 + 2];

          if(color_){
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 0] = color_.r;
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 1] = color_.g;
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 2] = color_.b;
          }else{
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 0] = node.material.color.r;
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 1] = node.material.color.g;
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 2] = node.material.color.b;
          }
          if (node.userData.isHide == false) {
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 3] = 1;
          } else {
            (meshBuffer.attributes.color as any).array[meshBufferOffset * 4 + 3] = 0;
          }

          meshBufferOffset++;
        }
      }

      if ((node as any).type == "LineSegments") {
        if(this.MainScene.children.length == 0)
        this.layerStates[node.userData.layerId].line.push({ offset: lineBufferOffset, length: node.geometry.attributes.position.count });
        for (let i = 0; i < node.geometry.attributes.position.count; i++) {
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 0] = node.geometry.attributes.position.array[i * 3 + 0];
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 1] = node.geometry.attributes.position.array[i * 3 + 1];
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 2] = node.geometry.attributes.position.array[i * 3 + 2];

          if(color_){
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 0] = color_.r;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 1] = color_.g;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 2] = color_.b;
          }else{
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 0] = node.material.color.r;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 1] = node.material.color.g;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 2] = node.material.color.b;
          }
          if (node.userData.isHide == false) {
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 3] = 1;
          } else {
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 3] = 0;
          }

          lineBufferOffset++;
        }
      }

      if ((node as any).type == "Line") {
        if(this.MainScene.children.length == 0)
        this.layerStates[node.userData.layerId].line.push({ offset: lineBufferOffset, length: (node.geometry.attributes.position.count - 1) * 2 });
        for (let i = 1; i < node.geometry.attributes.position.count; i++) {
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 0] = node.geometry.attributes.position.array[(i - 1) * 3 + 0];
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 1] = node.geometry.attributes.position.array[(i - 1) * 3 + 1];
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 2] = node.geometry.attributes.position.array[(i - 1) * 3 + 2];

          if(color_){
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 0] = color_.r;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 1] = color_.g;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 2] = color_.b;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 3] = 1;
          }else{
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 0] = node.material.color.r;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 1] = node.material.color.g;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 2] = node.material.color.b;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 3] = 1;
          }

          lineBufferOffset++;

          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 0] = node.geometry.attributes.position.array[i * 3 + 0];
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 1] = node.geometry.attributes.position.array[i * 3 + 1];
          (lineBuffer.attributes.position as any).array[lineBufferOffset * 3 + 2] = node.geometry.attributes.position.array[i * 3 + 2];

          if(color_){
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 0] = color_.r;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 1] = color_.g;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 2] = color_.b;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 3] = 1;
          }else{
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 0] = node.material.color.r;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 1] = node.material.color.g;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 2] = node.material.color.b;
            (lineBuffer.attributes.color as any).array[lineBufferOffset * 4 + 3] = 1;
          }

          lineBufferOffset++;
        }
      }
    });

    // let dataMesh = SnappyJS.compress((meshBuffer.attributes.position.array as Float32Array).buffer);
    // let dataLine = SnappyJS.compress((lineBuffer.attributes.position.array as Float32Array).buffer);
    // console.log("SnappyJS.compress:",dataMesh.byteLength + dataLine.byteLength,((dataMesh.byteLength + dataLine.byteLength) / ((lineBufferCount + meshBufferCount) * 3 * 4) * 100).toFixed(2) + "%");

    meshBuffer.attributes.position.needsUpdate = true;
    meshBuffer.attributes.color.needsUpdate = true;

    // console.log(meshBuffer.attributes,meshBufferCount,lineBufferCount);

    let materal = new THREE.ShaderMaterial({
        uniforms: {
            background:{value:this.background},
          },
          vertexShader: `
            precision highp float;
            precision highp int;

            #include <common>
            #include <clipping_planes_pars_vertex>
            attribute vec4 color;
            varying vec4 color_;

            void main() {

              color_ = color;
              gl_PointSize = 2.0;
              vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
              gl_Position = projectionMatrix * mvPosition;

              #include <clipping_planes_vertex>
            }
            `,
          fragmentShader: `
            precision highp float;
            precision highp int;
            precision highp sampler2D;
            uniform vec3 background;

            #include <common>
            #include <clipping_planes_pars_fragment>

            varying vec4 color_;

            void main() {

                #include <clipping_planes_fragment>

                vec3 colorT = color_.rgb;
                if(distance(colorT,background) < 0.1){
                  colorT.r = 1.0 - color_.r;
                  colorT.g = 1.0 - color_.g;
                  colorT.b = 1.0 - color_.b;
                }

                gl_FragColor = vec4(colorT, color_.a);
            }
          `,
          side: THREE.DoubleSide,
          transparent:true,
          depthTest:true
      }
    );

    let Mesh = new THREE.Mesh(meshBuffer, materal);
    let Line = new THREE.LineSegments(lineBuffer, materal);

    Mesh.geometry.computeBoundingBox();
    Line.geometry.computeBoundingBox();
    const box3 = new THREE.Box3();
    box3.union(Mesh.geometry.boundingBox);
    box3.union(Line.geometry.boundingBox);

    // console.log(box3);

    const planeXP = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    const planeXN = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const planeYP = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const planeYN = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    let planes = [];
    planes.push(planeXP);
    planes.push(planeXN);
    planes.push(planeYP);
    planes.push(planeYN);

    planes[0].constant = Math.abs(box3.max.x + 0.1);
    planes[1].constant = Math.abs(box3.min.x - 0.1);
    planes[2].constant = Math.abs(box3.max.y + 0.1);
    planes[3].constant = Math.abs(box3.min.y - 0.1);

    if(!color_){
      (Mesh.material as any).clippingPlanes = planes;
      (Line.material as any).clippingPlanes = planes;

      (Mesh.material as any).clipping = true;
      (Line.material as any).clipping = true;
    }

    group.add(Mesh);
    group.add(Line);

    (group as any).layout = layout;
    (group as any).mapId = mapId;
    (group as any).offset = {position:new THREE.Vector3(0,0,0),scale:new THREE.Vector3(1,1,1)}

    console.log("鍚堝苟锛? + ((new Date().getTime() - startTime) / 1000).toFixed(2) + "绉?);
    startTime = new Date().getTime();
    Snapper.register(Line, true);
    console.log("娉ㄥ唽锛? + ((new Date().getTime() - startTime) / 1000).toFixed(2) + "绉?);

    return group;
  }

  public purgeModel() {
    const overlayScenes = new Set(Array.from(this.overlayUrlglTFMap.values()).map((i) => i.scene));
    for (const scene of this.scenes.children) {
      if (overlayScenes.has(scene)) {
        continue;
      }

      for (let i = 0; i < this.modelFiles.length; i++) {
        if (this.modelFiles[i].scene === scene) {
          this.modelFiles.splice(i, 1);
          break;
        }
      }

      this.scenes.remove(scene);
    }

    this._sceneBBox.makeEmpty();
    this.needsUpdateGPUData = true;

    this.layerStates = [];
    this.layoutStates = [];
  }

  public getLayers() {
    const layer = [];
    // console.log(this.layerStates);
    for (let i = 0; i < this.layerStates.length; i++) {
      layer.push({ id: this.layerStates[i].id, name: this.layerStates[i].name, checked: !this.layerStates[i].isHide, color: this.layerStates[i].color });
    }

    return layer;
  }

  public setLayer(_id, isHide) {
    let id = _id - 1;
    this.layerStates[id].isHide = isHide;
    for (let i = 0; i < this.layerStates[id].mesh.length; i++) {
      const offset = this.layerStates[id].mesh[i].offset;
      for (let j = 0; j < this.layerStates[id].mesh[i].length; j++) {
        if (isHide == true) {
          ((this.MainScene.children[0].children[0] as any).geometry.attributes.color as any).array[(offset + j) * 4 + 3] = 0;
        } else {
          ((this.MainScene.children[0].children[0] as any).geometry.attributes.color as any).array[(offset + j) * 4 + 3] = 1;
        }
      }

      (this.MainScene.children[0].children[0] as any).geometry.attributes.color.needsUpdate = true;
    }

    for (let i = 0; i < this.layerStates[id].line.length; i++) {
      const offset = this.layerStates[id].line[i].offset;
      for (let j = 0; j < this.layerStates[id].line[i].length; j++) {
        if (isHide == true) {
          ((this.MainScene.children[0].children[1] as any).geometry.attributes.color as any).array[(offset + j) * 4 + 3] = 0;
        } else {
          ((this.MainScene.children[0].children[1] as any).geometry.attributes.color as any).array[(offset + j) * 4 + 3] = 1;
        }
      }

      (this.MainScene.children[0].children[1] as any).geometry.attributes.color.needsUpdate = true;
    }

    this.needsUpdateGPUData = true;
  }

  public setAllLayerHidden(isHidden){
    for(let i = 0; i < this.layerStates.length;i++){
      this.setLayer(i+1,isHidden);
    }
  }

  public setAllLayerVisible(isHidden){
    this.setAllLayerHidden(isHidden);
  }

  public getLayout() {
    const layout = [];

    for (let i = 0; i < this.layoutStates.length; i++) {
      layout.push({ id: this.layoutStates[i].id, name: this.layoutStates[i].name });
    }

    return layout;
  }

  public setLayout(id) {
    this._sceneBBox.makeEmpty();

    for (let i = 0; i < this.modelFiles[0].scene.children.length; i++) {
      this.layerStates[i].isHide = this.modelFiles[0].scene.children[i].userData.isHide;
      this.setLayer(this.layerStates[i].id,this.layerStates[i].isHide);
    }

    let modelBox;
    if(id == 0){
      modelBox = new Box3().setFromObject(this.modelFiles[0].scene);
    }else{
        modelBox = new Box3().setFromObject(this.modelFiles[0].scenes[id]);
        
        if(modelBox.max.x < modelBox.min.x){

          for(let key in this.modelFiles[0].scenes[id].userData){
            modelBox.max.z = 0;
            modelBox.min.z = 0;
            modelBox.max.x = Math.max(modelBox.max.x ,this.modelFiles[0].scenes[id].userData[key].centerpoint[0] + this.modelFiles[0].scenes[id].userData[key].width / 2);
            modelBox.min.x = Math.min(modelBox.min.x ,this.modelFiles[0].scenes[id].userData[key].centerpoint[0] - this.modelFiles[0].scenes[id].userData[key].width / 2);
            modelBox.max.y = Math.max(modelBox.max.y,this.modelFiles[0].scenes[id].userData[key].centerpoint[1] + this.modelFiles[0].scenes[id].userData[key].height / 2);
            modelBox.min.y = Math.min(modelBox.min.y ,this.modelFiles[0].scenes[id].userData[key].centerpoint[1] - this.modelFiles[0].scenes[id].userData[key].height / 2);
          }
        }
    }

    for (let i = 0; i < this.modelFiles[0].scenes.length; i++) {
      let keyCount = 0;
      for (const key in this.modelFiles[0].scenes[i].userData) {
        keyCount++;
      }

      if (keyCount > 0) {
        this.modelFiles[0].scenes[i].visible = false;
      } else {
        this.modelFiles[0].scenes[i].matrix.identity();
        this.modelFiles[0].scenes[i].matrixWorldNeedsUpdate = true;
      }
    }

    this.modelFiles[0].scenes[id].visible = true;
    this._sceneBBox.union(modelBox);
    this.fitToView(this._sceneBBox);
    this.currentLayout = this.layoutStates[id];
    this.needsUpdateGPUData = true;
  }

  public removeOverlay(url: string, emit = true) {
    if (!this.overlayUrlglTFMap.has(url)) {
      return;
    }

    const glTF = this.overlayUrlglTFMap.get(url);
    this.scenes.remove(glTF.scene);
    for (let i = 0; i < this.modelFiles.length; i++) {
      if (this.modelFiles[i] === glTF) {
        this.modelFiles.splice(i, 1);
        break;
      }
    }

    this.overlayUrlglTFMap.delete(url);

    // TODO: undo register

    this.needsUpdateGPUData = true;

    this.sortOverlay();

    if (emit) {
      ObservablesManager.getInstance().onSceneOverlayObservable.notifyObservers(this);
    }
  }

  // 鎸夌収鍙犲浘鐨勫厛鍚庨『搴忓悜涓婂彔鍔狅紝Z鍚戯紝鏈夌壒娈婃爣璁扮殑鍐嶆鎺掑簭
  public setOverlayLayer(url: string, layer: string) {
    if (!this.overlayUrlglTFMap.has(url)) {
      return;
    }

    this.overlayUrlglTFMap.get(url).scene.userData.layer = layer;

    this.sortOverlay();
  }

  private sortOverlay() {
    const overlays = new Set(this.overlayUrlglTFMap.values());
    const noneOverlayBoxes = this.modelFiles.filter((glTF) => !overlays.has(glTF)).map((glTF) => new Box3().setFromObject(glTF.scene));
    const noneOverLayBox = new Box3();
    for (const box of noneOverlayBoxes) {
      noneOverLayBox.union(box);
    }
    let currentElevation = noneOverLayBox.max.z;
    const tops = [];
    const bottoms = [];
    for (const glTF of this.modelFiles) {
      if (!overlays.has(glTF)) {
        continue;
      }

      if (glTF.scene.userData.layer === "TOP") {
        tops.push(glTF);
      } else if (glTF.scene.userData.layer === "BOTTOM") {
        bottoms.push(glTF);
      } else {
        const currentBox = new Box3().setFromObject(glTF.scene);
        const thickness = currentBox.max.z - currentBox.min.z;
        glTF.scene.position.z = currentElevation + thickness * 0.5;
        currentElevation += thickness * 0.5;
      }
    }

    for (const topglTF of tops) {
      const currentBox = new Box3().setFromObject(topglTF.scene);
      const thickness = currentBox.max.z - currentBox.min.z;
      topglTF.scene.position.z = currentElevation + thickness * 0.5;
      currentElevation += thickness * 0.5;
    }

    let currentBottomElevation = -noneOverLayBox.min.z;
    for (const bottomglTF of bottoms) {
      const currentBox = new Box3().setFromObject(bottomglTF.scene);
      const thickness = currentBox.max.z - currentBox.min.z;
      bottomglTF.scene.position.z = currentBottomElevation - thickness * 0.5;
      currentBottomElevation -= thickness * 0.5;
    }
  }

  public setOverlayColor(url: string, color: number) {
    if (!this.overlayUrlglTFMap.has(url)) {
      return;
    }

    this.overlayUrlglTFMap.get(url).scene.traverse((node) => {
      if (node.material && node.material.color) {
        node.material.color.set(color);
      }
    });
  }

  public resetOverlay(url: string) {
    if (!this.overlayUrlglTFMap.has(url)) {
      return;
    }

    this.overlayUrlglTFMap.get(url).scene.position.set(0, 0, 0);
    this.overlayUrlglTFMap.get(url).scene.scale.set(1, 1, 1);

    this.sortOverlay();
  }

  public translateOverlay(url: string) {
    if (!this.overlayUrlglTFMap.has(url)) {
      return;
    }

    if (this.transformingOverlay !== null) {
      this.stopTranslatingOverlay();
    }

    this.transformingOverlay = url;

    this._renderer.domElement.addEventListener("pointerdown", this.acquireTranslateDownPoint);
  }

  private acquireTranslateDownPoint = (e: PointerEvent) => {
    this.transformDownPoint.set(e.clientX, e.clientY);
    this._renderer.domElement.addEventListener("pointerup", this.acquireTranslateUpPoint);
    this._renderer.domElement.removeEventListener("pointerdown", this.acquireTranslateDownPoint);
  };

  private acquireTranslateUpPoint = (e: PointerEvent) => {
    this.transformUpPoint.set(e.clientX, e.clientY);
    if (this.transformDownPoint.distanceTo(this.transformUpPoint) < 3) {
      // down up as click to get start point for translation
      const plane = new Plane();
      plane.setFromNormalAndCoplanarPoint(this._camera.getWorldDirection(new Vector3()), this._sceneBBox.getCenter(new Vector3()));
      const rect = this._renderer.domElement.getBoundingClientRect();
      const mouse = new Vector2((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      mouse.set(mouse.x * 2 - 1, -mouse.y * 2 + 1);
      this._raycaster.setFromCamera(mouse, this._camera);
      if (this._raycaster.ray.intersectPlane(plane, this.transformStartPoint)) {
        const scene = this.overlayUrlglTFMap.get(this.transformingOverlay).scene;
        if (!scene.userData.originalPosition) {
          scene.userData.originalPosition = scene.position.clone();
        } else {
          scene.userData.originalPosition.copy(scene.position);
        }
        this._renderer.domElement.addEventListener("pointermove", this.doTranslateOverlay);
        this._renderer.domElement.addEventListener("pointerdown", this.finishTranslateDown);
      }
    }
    this._renderer.domElement.removeEventListener("pointerup", this.acquireTranslateUpPoint);
  };

  private doTranslateOverlay = (e: PointerEvent) => {
    const plane = new Plane();
    plane.setFromNormalAndCoplanarPoint(this._camera.getWorldDirection(new Vector3()), this._sceneBBox.getCenter(new Vector3()));
    const rect = this._renderer.domElement.getBoundingClientRect();
    const mouse = new Vector2((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    mouse.set(mouse.x * 2 - 1, -mouse.y * 2 + 1);
    this._raycaster.setFromCamera(mouse, this._camera);
    if (this._raycaster.ray.intersectPlane(plane, this.transformMovePoint)) {
      const scene = this.overlayUrlglTFMap.get(this.transformingOverlay).scene;
      scene.position.copy(scene.userData.originalPosition).add(this.transformMovePoint).sub(this.transformStartPoint);
    }
  };

  private finishTranslateDown = (e: PointerEvent) => {
    this.transformDownPoint.set(e.clientX, e.clientY);
    this._renderer.domElement.addEventListener("pointerup", this.finishTranslateUp);
    this._renderer.domElement.removeEventListener("pointerdown", this.finishTranslateDown);
  };

  private finishTranslateUp = (e: PointerEvent) => {
    this.transformUpPoint.set(e.clientX, e.clientY);
    if (this.transformUpPoint.distanceTo(this.transformDownPoint) < 3) {
      this.stopTranslatingOverlay();
    }
  };

  private stopTranslatingOverlay = () => {
    this.transformingOverlay = null;
    this._renderer.domElement.removeEventListener("pointerdown", this.acquireTranslateDownPoint);
    this._renderer.domElement.removeEventListener("pointerup", this.acquireTranslateUpPoint);
    this._renderer.domElement.removeEventListener("pointermove", this.doTranslateOverlay);
    this._renderer.domElement.removeEventListener("pointerdown", this.finishTranslateDown);
    this._renderer.domElement.removeEventListener("pointerup", this.finishTranslateUp);
  };

  private stopTranlatingOverlay = () => {
    this.stopTranslatingOverlay();
  };

  // TODO: translate scale interference
  public scaleOverlay(url: string, ratio: [number, number]) {
    if (!this.overlayUrlglTFMap.has(url)) {
      return;
    }

    if (Array.isArray(ratio)) {
      const scene = this.overlayUrlglTFMap.get(url).scene;
      const center = new Box3().setFromObject(scene).getCenter(new Vector3());
      const translateToOrigin = new Matrix4().makeTranslation(-center.x, -center.y, 0);
      const translateBack = new Matrix4().makeTranslation(center.x, center.y, 0);
      const resetScale = new Matrix4().makeScale(1 / scene.scale.x, 1 / scene.scale.y, 1);
      const scale = new Matrix4().makeScale(ratio[0], ratio[1], 1);
      scene.applyMatrix4(translateToOrigin);
      scene.applyMatrix4(resetScale);
      scene.applyMatrix4(scale);
      scene.applyMatrix4(translateBack);
      scene.updateMatrixWorld();
    } else {
      // scale by click point distance to move point, second click to finish
      if (this.transformingOverlay !== null) {
        this.stopScalingOverlay();
      }

      this.transformingOverlay = url;

      this._renderer.domElement.addEventListener("pointerdown", this.acquireScaleDownPoint);
    }
  }

  private acquireScaleDownPoint = (e: PointerEvent) => {
    this.transformDownPoint.set(e.clientX, e.clientY);
    this._renderer.domElement.addEventListener("pointerup", this.acquireScaleUpPoint);
    this._renderer.domElement.removeEventListener("pointerdown", this.acquireScaleDownPoint);
  };

  private acquireScaleUpPoint = (e: PointerEvent) => {
    this.transformUpPoint.set(e.clientX, e.clientY);
    if (this.transformDownPoint.distanceTo(this.transformUpPoint) < 3) {
      // down up as click to get start point for translation
      const plane = new Plane();
      plane.setFromNormalAndCoplanarPoint(this._camera.getWorldDirection(new Vector3()), this._sceneBBox.getCenter(new Vector3()));
      const rect = this._renderer.domElement.getBoundingClientRect();
      const mouse = new Vector2((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      mouse.set(mouse.x * 2 - 1, -mouse.y * 2 + 1);
      this._raycaster.setFromCamera(mouse, this._camera);
      if (this._raycaster.ray.intersectPlane(plane, this.transformStartPoint)) {
        const scene = this.overlayUrlglTFMap.get(this.transformingOverlay).scene;
        const box = new Box3().setFromObject(scene);
        if (!scene.userData.originalBox) {
          scene.userData.originalBox = box;
        } else {
          scene.userData.originalBox.copy(box);
        }
        this._renderer.domElement.addEventListener("pointermove", this.doScaleOverlay);
        this._renderer.domElement.addEventListener("pointerdown", this.finishScaleDown);
      }
    }
    this._renderer.domElement.removeEventListener("pointerup", this.acquireScaleUpPoint);
  };

  private doScaleOverlay = (e: PointerEvent) => {
    const plane = new Plane();
    plane.setFromNormalAndCoplanarPoint(this._camera.getWorldDirection(new Vector3()), this._sceneBBox.getCenter(new Vector3()));
    const rect = this._renderer.domElement.getBoundingClientRect();
    const mouse = new Vector2((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    mouse.set(mouse.x * 2 - 1, -mouse.y * 2 + 1);
    this._raycaster.setFromCamera(mouse, this._camera);
    if (this._raycaster.ray.intersectPlane(plane, this.transformMovePoint)) {
      //  retain local translation by transformStartPoint
      const distance = this.transformMovePoint.sub(this.transformStartPoint).length();
      const scene = this.overlayUrlglTFMap.get(this.transformingOverlay).scene;
      const box = scene.userData.originalBox;
      const size = box.getSize(new Vector3()).length();
      const scale = distance / size;
      const translateToOrigin = new Matrix4().makeTranslation(-this.transformStartPoint.x, -this.transformStartPoint.y, 0);
      const translateBack = new Matrix4().makeTranslation(this.transformStartPoint.x, this.transformStartPoint.y, 0);
      const resetScale = new Matrix4().makeScale(1 / scene.scale.x, 1 / scene.scale.y, 1);
      const scaleMat = new Matrix4().makeScale(scale, scale, 1);
      scene.applyMatrix4(translateToOrigin);
      scene.applyMatrix4(resetScale);
      scene.applyMatrix4(scaleMat);
      scene.applyMatrix4(translateBack);
    }
  };

  private finishScaleDown = (e: PointerEvent) => {
    this.transformDownPoint.set(e.clientX, e.clientY);
    this._renderer.domElement.addEventListener("pointerup", this.finishScaleUp);
    this._renderer.domElement.removeEventListener("pointerdown", this.finishScaleDown);
  };

  private finishScaleUp = (e: PointerEvent) => {
    this.transformUpPoint.set(e.clientX, e.clientY);
    if (this.transformUpPoint.distanceTo(this.transformDownPoint) < 3) {
      this.stopScalingOverlay();
    }
  };

  private stopScalingOverlay = () => {
    this.transformingOverlay = null;
    this._renderer.domElement.removeEventListener("pointerdown", this.acquireScaleDownPoint);
    this._renderer.domElement.removeEventListener("pointerup", this.acquireScaleUpPoint);
    this._renderer.domElement.removeEventListener("pointermove", this.doScaleOverlay);
    this._renderer.domElement.removeEventListener("pointerdown", this.finishScaleDown);
    this._renderer.domElement.removeEventListener("pointerup", this.finishScaleUp);
  };

  public setBackgroundColor(color: number) {
    this.background = new THREE.Color(color);
    this._renderer.setClearColor(this.background);
    const color_ = new THREE.Color(color);

    for(let index = 0; index < this.MainScene.children.length;index++){
      ((this.MainScene.children[index].children[0] as any).material as any).uniforms.background.value = this.background;
    }

    // for (let i = 0; i < this.modelFiles.length; i++) {
    //   this.modelFiles[i].scene.traverse((node) => {
    //     if (node.material && node.material.color) {
    //       if (node.material.originColor) {
    //         // 鍏堣繕鍘熻儗鏅壊
    //         node.material.color = node.material.originColor;
    //       }

    //       if (Math.abs(color_.r - node.material.color.r) < 0.01 && Math.abs(color_.g - node.material.color.g) < 0.01 && Math.abs(color_.b - node.material.color.b) < 0.01) {
    //         node.material.originColor = node.material.color;
    //         node.material.color = new THREE.Color(1 - node.material.color.r, 1 - node.material.color.b, 1 - node.material.color.b);
    //       }
    //     }
    //   });
    // }

    this.toolObject.traverse((node) => {
      if (node.material && node.material.color) {
        if (node.material.originColor) {
          // 鍏堣繕鍘熻儗鏅壊
          node.material.color = node.material.originColor;
        }

        if (Math.abs(color_.r - node.material.color.r) < 0.01 && Math.abs(color_.g - node.material.color.g) < 0.01 && Math.abs(color_.b - node.material.color.b) < 0.01) {
          node.material.originColor = node.material.color;
          node.material.color = new THREE.Color(1 - node.material.color.r, 1 - node.material.color.b, 1 - node.material.color.b);
        }
      }
    });
  }

  public setCameraZoom(onZoomFinished) {
    this.cameraZoomController.enable = true;
    this._onCameraZoomFinished = onZoomFinished;
  }

  public dispose() {
    if (this._renderer?.domElement) {
      this._renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
      this._renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
      this._renderer.domElement.removeEventListener("wheel", this.onWheel);
      this._renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("hover", this.hover);
      window.removeEventListener("hover_update", this.hover_update);
      window.removeEventListener("hit", this.hit);
    }
    this.controls?.removeEventListener("change", this.onCameraChanged);
  }
}

