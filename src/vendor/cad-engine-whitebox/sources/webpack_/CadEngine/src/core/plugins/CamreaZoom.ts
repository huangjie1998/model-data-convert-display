import * as THREE from "three";

export class CamreaZoom extends THREE.EventDispatcher{
  
  private _controls;
  private _camera;
  private _renderer;
  private _enable = false;
  public frame;

  constructor(control, camera, renderer) {

    super();

    this.frame = new THREE.LineSegments( new THREE.BufferGeometry().setFromPoints( [
      new THREE.Vector3(10,10,0),new THREE.Vector3(10,-10,0),
      new THREE.Vector3(10,-10,0),new THREE.Vector3(-10,-10,0),
      new THREE.Vector3(-10,-10,0),new THREE.Vector3(-10,10,0),
      new THREE.Vector3(-10,10,0),new THREE.Vector3(10,10,0)] ), 
    new THREE.LineBasicMaterial({
      color:0xaaaaff,
      alphaTest: 0.5, transparent: true, depthTest: false, opacity:0.5
    }));
    this.frame.name = "sign";
    this.frame.visible = false;
    this.frame.frustumCulled = false;
    this.frame.renderOrder = 1000000;

    this._renderer = renderer;
    this._controls = control;
    this._camera = camera;
    this.initEvent();
  }

  set enable(value: boolean){

    this.frame.visible = false;

    if(value == true){

      if(this._enable == false){
        this._enable = value;
        this._controls.enabled = false;
        this._renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
        this._renderer.domElement.addEventListener("pointermove", this.onPointerMove);
        this._renderer.domElement.addEventListener("pointerup", this.onPointerUp);
      }

    }else{
      this._enable = value;
      this._renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
      this._renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
      this._renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
      this._controls.enabled = true;
    }
  }

  get enable(){
    return this._enable;
  }

  private initEvent() {
    
  }

  public dispose() {
    
  }

  private onPointerDown = (event) => {
    // console.log(event);
    if(this.frame.visible == false){

      let size = this._renderer.getSize(new THREE.Vector2()); 
      let x_ = (event.clientX / size.x) * 2 - 1;
      let y_ = (1 - event.clientY / size.y) * 2 - 1;

      let v3 = new THREE.Vector3(x_,y_,0);
      v3.unproject(this._camera);
      let x = v3.x;
      let y = v3.y;

      this.frame.geometry.attributes.position.array[0] = x;
      this.frame.geometry.attributes.position.array[1] = y;
      this.frame.geometry.attributes.position.array[2] = 0;

      this.frame.geometry.attributes.position.array[3] = x;
      this.frame.geometry.attributes.position.array[4] = y;
      this.frame.geometry.attributes.position.array[5] = 0;

      this.frame.geometry.attributes.position.array[6] = x;
      this.frame.geometry.attributes.position.array[7] = y;
      this.frame.geometry.attributes.position.array[8] = 0;

      this.frame.geometry.attributes.position.array[9] = x;
      this.frame.geometry.attributes.position.array[10]= y;
      this.frame.geometry.attributes.position.array[11]= 0;

      this.frame.geometry.attributes.position.array[12]= x;
      this.frame.geometry.attributes.position.array[13]= y;
      this.frame.geometry.attributes.position.array[14]= 0;

      this.frame.geometry.attributes.position.array[15]= x;
      this.frame.geometry.attributes.position.array[16]= y;
      this.frame.geometry.attributes.position.array[17]= 0;

      this.frame.geometry.attributes.position.array[18] = x;
      this.frame.geometry.attributes.position.array[19] = y;
      this.frame.geometry.attributes.position.array[20] = 0;

      this.frame.geometry.attributes.position.array[21] = x;
      this.frame.geometry.attributes.position.array[22] = y;
      this.frame.geometry.attributes.position.array[23] = 0;

      this.frame.geometry.attributes.position.needsUpdate= true;

      this.frame.visible = true;
    }
  };

  private onPointerMove = (event) => {
    // console.log(event);
    if(this.frame.visible == true){

      let size = this._renderer.getSize(new THREE.Vector2()); 
      let x_ = (event.clientX / size.x) * 2 - 1;
      let y_ = (1 - event.clientY / size.y) * 2 - 1;

      let v3 = new THREE.Vector3(x_,y_,0);
      v3.unproject(this._camera);
      let x = v3.x;
      let y = v3.y;

      // this.frame.geometry.attributes.position.array[0] = x;
      // this.frame.geometry.attributes.position.array[1] = y;
      // this.frame.geometry.attributes.position.array[2] = 0;

      this.frame.geometry.attributes.position.array[3] = x;
      // this.frame.geometry.attributes.position.array[4] = y;
      this.frame.geometry.attributes.position.array[5] = 0;

      this.frame.geometry.attributes.position.array[6] = x;
      // this.frame.geometry.attributes.position.array[7] = y;
      this.frame.geometry.attributes.position.array[8] = 0;

      this.frame.geometry.attributes.position.array[9] = x;
      this.frame.geometry.attributes.position.array[10]= y;
      this.frame.geometry.attributes.position.array[11]= 0;

      this.frame.geometry.attributes.position.array[12]= x;
      this.frame.geometry.attributes.position.array[13]= y;
      this.frame.geometry.attributes.position.array[14]= 0;

      // this.frame.geometry.attributes.position.array[15]= x;
      this.frame.geometry.attributes.position.array[16]= y;
      this.frame.geometry.attributes.position.array[17]= 0;

      // this.frame.geometry.attributes.position.array[18] = x;
      this.frame.geometry.attributes.position.array[19] = y;
      this.frame.geometry.attributes.position.array[20] = 0;

      // this.frame.geometry.attributes.position.array[21] = x;
      // this.frame.geometry.attributes.position.array[22] = y;
      // this.frame.geometry.attributes.position.array[23] = 0;

      this.frame.geometry.attributes.position.needsUpdate= true;
    }
  };

  private onPointerUp = (event) => {
    // console.log(event);
    if(this.frame.visible == true){
      this.frame.visible = false;

      let P0 = new THREE.Vector3(
        Math.min(this.frame.geometry.attributes.position.array[0],this.frame.geometry.attributes.position.array[9]),
        Math.min(this.frame.geometry.attributes.position.array[1],this.frame.geometry.attributes.position.array[10]),0);
      let P1 = new THREE.Vector3(
        Math.max(this.frame.geometry.attributes.position.array[0],this.frame.geometry.attributes.position.array[9]),
        Math.max(this.frame.geometry.attributes.position.array[1],this.frame.geometry.attributes.position.array[10]),0);

      let center = new THREE.Vector3((P0.x + P1.x) / 2,(P0.y + P1.y) / 2);

      let size = this._renderer.getSize(new THREE.Vector2()); 

      let width = P1.x - P0.x;
      let height = P1.y - P0.y;
      let k = 1;
      let zoom = 0;

      if(width >= height * 2){
        k = this._camera.zoom * width / size.x;
      }else{
        k = this._camera.zoom * height / size.y;
      }

      zoom = this._camera.zoom / k;

      let dx = (center.x - this._camera.position.x);
      let dy = (center.y - this._camera.position.y);
      let dz = (zoom - this._camera.zoom);
      let times = 12;
      
      let dxArray = [];
      let dyArray = [];
      let dzArray = [];

      let w = [];
      let w_all = 0;

      let camera = this._camera.clone();
      let last = new THREE.Vector2();
      let vc_ = new THREE.Vector3(0,0,0);
      vc_.unproject(camera);
      let vr_ = new THREE.Vector3(1,1,0);
      vr_.unproject(camera);
      last.x = vr_.x - vc_.x;
      last.y = vr_.y - vc_.y;

      for(let i = 0; i < times;i++){
        camera.zoom += dz / times;
        camera.updateProjectionMatrix();
        let vc = new THREE.Vector3(0,0,0);
        vc.unproject(camera);

        let vr = new THREE.Vector3(1,1,0);
        vr.unproject(camera);

        w.push(last.x - (vr.x - vc.x))
        w_all += last.x - (vr.x - vc.x);

        last.x = vr.x - vc.x;
        last.y = vr.y - vc.y;
      }

      for(let i = 0; i < times;i++){
        dxArray.push(dx * w[i] / w_all);
        dyArray.push(dy * w[i] / w_all);
      }

      let count = 0;
      

      let timer = setInterval(()=>{
        if(count < times){

          // this._camera.zoom += dzArray[count];
          this._camera.position.x += dxArray[count];
          this._camera.position.y += dyArray[count];
          this._camera.zoom += dz / times;
          // this._camera.position.x += dx / times;
          // this._camera.position.y += dy / times;

          
          count++;
        }else{
          clearInterval(timer);
          this._camera.zoom = zoom;
          this._camera.position.x = center.x;
          this._camera.position.y = center.y;
          this.enable = false;
          this.dispatchEvent( { type: 'finish', message: '' } );
        }
      },10);

      
    }
  };

}
