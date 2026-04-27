import * as THREE from "three";
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

export class GlxLoader {

  private binaryFileLoader;
  private parsedFont;
  public fontPath;

  constructor(url, manager) {
    this.binaryFileLoader = new THREE.FileLoader(manager);
    // const loader = new FontLoader();
    // loader.load( 'fonts/helvetiker_regular.typeface.json', ( font )=> {
    //   this.font = font;
    // })
  }

  public parseWithCompanionBin(data, fileName, onParsed){

    if ( typeof data !== 'string' ) {
      // const magic = THREE.LoaderUtils.decodeText( new Uint8Array( data, 0, 4 ) );
      
      let companionBinName = fileName.split(".")[0] + ".bin";
      this.binaryFileLoader.setResponseType( 'arraybuffer' );

      this.binaryFileLoader.load(companionBinName, (arrayBuffer)=>{

        onParsed(this.parseBuffers(data, arrayBuffer));

      });

      
    }
  }

  public parse(data, fileName, callBack) {
    this.parseWithCompanionBin(data, fileName, callBack);
  }

  public loadFontAsset = ()=>{
    return new Promise((resolve,reject) => {
      const loader = new FontLoader();
      loader.load( this.fontPath?this.fontPath:'./assets/FangSong_GB2312_Regular.json',(font)=>{
        resolve(font);
      });
    })
  }

  public async loadSceneBundle(data){
    let files = {}
    let fileName = "";
    let glxData;
    let glxArrayBuffer;

    // for(let i = 0; i < data.length;i++){
    //   files[i] = await this.loadfile(data[i].url);
    //   if(data[i].model3DName. split('.')[1].toLowerCase() == 'glx'){
    //     glxData = files[i];
    //     fileName = data[i].model3DName.split('.')[0];
    //   }
    // }

    // for(let id in files){
    //   if(data[id].model3DName.split('.')[0] == fileName && data[id].model3DName.split('.')[0].toLowerCase() == 'bin'){
    //     glxArryBuffer = files[id]
    //   }
    // }

    for(let i = 0; i < data.length;i++){
      if(data[i].model3DName. split('.')[1].toLowerCase() == 'glx'){
        glxData = await this.loadFileBuffer(data[i].url);
        fileName = data[i].model3DName.split('.')[0];
      }
    }

    for(let i = 0; i < data.length;i++){
      if(data[i].model3DName.split('.')[0] == fileName && data[i].model3DName.split('.')[1].toLowerCase() == 'bin'){
        glxArrayBuffer = await this.loadFileBuffer(data[i].url);
      }
    }

    return this.parseBuffers(glxData, glxArrayBuffer);

  }

  public async load(data) {
    return this.loadSceneBundle(data);
  }

  public loadFileBuffer(url){

    return new Promise((resolve,reject) => {

      var xmlHttp = new XMLHttpRequest();
      xmlHttp.open( "GET", url, true ); // false for synchronous request
      xmlHttp.responseType = 'arraybuffer'

      xmlHttp.onload = (e)=>{
        resolve(xmlHttp.response);
      }

      xmlHttp.send();

    })

  }

  public loadfile(url){
    return this.loadFileBuffer(url);
  }

  public async parseBuffers(data, arrayBuffer){

    const startTime = new Date().getTime();

    if(this.parsedFont == undefined){
      this.parsedFont = await this.loadFontAsset();
    }

    // console.log(this.parsedFont);

    const magic = THREE.LoaderUtils.decodeText( new Uint8Array( data) );
    let sceneJSON = JSON.parse(magic);

    let file:any = {};
    file.scene = new THREE.Group();
    file.scenes = [];

    let meshes = [];

    let array_ = new Uint8Array(arrayBuffer);
    // console.log(array_);

    if(sceneJSON.meshes){
      for(let i = 0; i < sceneJSON.meshes.length;i++){
        
        let array_2 = new Uint8Array(sceneJSON.meshes[i].length - 1);
        let type = array_[sceneJSON.meshes[i].offset];

        for(let j = sceneJSON.meshes[i].offset + 1,k=0; j < (sceneJSON.meshes[i].offset + 1) + array_2.length;j++,k++ ){
          array_2[k] = array_[j];
        }

        let positions = new Float64Array( array_2.buffer);
        let positions_;

        if(type == 1){
          positions_ = new Float32Array( ((positions.length / 2) - 1) * 2 * 3);
          for(let j = 1; j < positions.length / 2; j++){
            positions_[(j - 1) * 6]     = positions[(j - 1) * 2];
            positions_[(j - 1) * 6 + 1] = positions[(j - 1) * 2 + 1]
            positions_[(j - 1) * 6 + 2] = 0

            positions_[(j - 1) * 6 + 3] = positions[j * 2];
            positions_[(j - 1) * 6 + 4] = positions[j * 2 + 1]
            positions_[(j - 1) * 6 + 5] = 0
          }

        }else{
          positions_ = new Float32Array( positions.length / 2 * 3);
          for(let j = 0; j < positions.length / 2; j++){
            positions_[j * 3] = positions[j * 2];
            positions_[j * 3 + 1] = positions[j * 2 + 1]
            positions_[j * 3 + 2] = 0
          }
        }

        

        let geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions_,3));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        let color = new THREE.Color(Number.parseInt(sceneJSON.materials[sceneJSON.meshes[i].material].color));
        let mesh;

        if(type == 0){
          mesh = new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:color}));
        }

        if(type == 1){
          mesh = new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:color}));
        }

        // console.log(type);

        if(type == 2){
          mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:color}));
        }

        meshes.push(mesh);
      }
    }

    for(let i = 0; i < sceneJSON.layers.length;i++){
      let layer = new THREE.Object3D();
      file.scene.add(layer);
      layer.name = sceneJSON.layers[i].name;
      layer.userData = {name:sceneJSON.layers[i].name,color:sceneJSON.layers[i].color,isHide:sceneJSON.layers[i].isHide}

      if(sceneJSON.layers[i].children){
        for(let j = 0; j < sceneJSON.layers[i].children.length;j++){

          let entity = sceneJSON.entities[sceneJSON.layers[i].children[j]];

          if(entity.type == 1){
            if(entity.meshIds){
              for(let k = 0; k < entity.meshIds.length;k++){
              
                layer.add(meshes[entity.meshIds[k]]);
              }
            }
          }

          if(entity.type == 2){
            const shapes = this.parsedFont.generateShapes( entity.extras.text, entity.extras.h );
            let geometry = new THREE.ShapeGeometry( shapes,1 );

            if(entity.extras.ro != 0){
              geometry.rotateZ(entity.extras.ro);
            }

            geometry.translate(entity.extras.px,entity.extras.py,0)
            geometry = geometry.toNonIndexed();

            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            const text = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial({color:new THREE.Color(parseInt(entity.extras.color))}) );
            layer.add(text);
          }
        }
      }

    }

    for(let i = 0; i < sceneJSON.scenes.length;i++){
      let layout = new THREE.Group();
      file.scenes.push(layout);

      layout.name = sceneJSON.scenes[i].name;
      let hasViewport = false;

      if(sceneJSON.scenes[i].children){
        for(let j = 0; j < sceneJSON.scenes[i].children.length;j++){
          let entity = sceneJSON.entities[sceneJSON.scenes[i].children[j]];
          if(entity.type == 3){
            layout.userData["viewpoints" + j] = {
              height:entity.extras.h,
              width:entity.extras.w,
              centerpoint:[entity.extras.cx,entity.extras.cy,entity.extras.cz],
              viewHeight:entity.extras.vh,
              viewDirection:[0.000000,0.000000,1.000000],
              viewTarget:[0.000000,0.000000,0.000000],
              twistAngle:entity.extras.ta,
              lensLength:entity.extras.ll,
              frontClipDistance:entity.extras.fcd,
              backClipDistance:entity.extras.bcd,
              snapAngle:entity.extras.sa,
              snapBasePoint:[0.000000,0.000000],
              snapIncrement:[10.000000,10.000000],
              gridIncrement:[10.000000,10.000000],
              customScale:entity.extras.cs,
              elevation:0.000000,
              circleSides:1000,
              offsetVector:[entity.extras.ofx,entity.extras.ofy,entity.extras.ofz],
              viewCenter:[entity.extras.vcx,entity.extras.vcy,entity.extras.vcz]
            };

            hasViewport = true;
          }


        }

        if(hasViewport){
          for(let j = 0; j < sceneJSON.scenes[i].children.length;j++){
            let entity = sceneJSON.entities[sceneJSON.scenes[i].children[j]];

            let item = new THREE.Object3D();
            layout.add(item);
            if(entity.type == 1){
              
              for(let k = 0; k < entity.meshIds.length;k++){
                item.add(meshes[entity.meshIds[k]]);
              }
              continue;
            }

          }
        }

        
      }
    }

    // console.log(meshes);

    console.log("转换：" + ((new Date().getTime() - startTime) / 1000).toFixed(2) + "秒");

    array_ = null
    return file;
  }

  public async parse2(data, arrayBuffer){
    return this.parseBuffers(data, arrayBuffer);
  }

}
