import * as THREE from "three";

export class Snapper extends THREE.EventDispatcher {
	constructor(){
		super();
	}

  public static Range = 5 * window.devicePixelRatio;
	public static MaxID = 128;
  public static tempID = 128;
  public static pointsMap: any = {};
  public static staticPointsMap: any = new Map();
  public static linesMap: any = [];
  public static staticLinesMap: any = new Map();
	public static entityMap: any = new Map();  // gpu ID 鏌ユ壘 entity
	public static entityIdToIndex: any = new Map();  // entity.id 鏌ユ壘 gpu ID
	public static deletedId = [];
	private static GPUData = new Float32Array(0);
  private static GPUDataPoints = new Float32Array(0);
  private static GPUDataLines = new Float32Array(0);
  private static GPUDataPosition = new Float32Array(0);
  private static Points: THREE.Points;
  private static lines: THREE.LineSegments;
  private static renderer: THREE.WebGLRenderer;
  private static camera;
  private static staticPointsScene = new THREE.Group();
  private static staticLinesScene = new THREE.Group();
  private static viewports = [];

  private static PointsScene = new THREE.Scene();
  private static LinesScene = new THREE.Scene();
  private static staticID = 128;
  private static needsUpdate = false;
  public static guideLine = new THREE.LineSegments( new THREE.BufferGeometry().setFromPoints( [new THREE.Vector3(),new THREE.Vector3()] ), new THREE.LineDashedMaterial({color:0xffffff,scale: 4,dashSize: 3,gapSize: 1,transparent:true,opacity:0.6}))
  private static lastGuideObject;
  private static lastGuideLine = -1;
  private static lastGuideActiveLine = {position:[]};
  private static lastGuideLineCount = 0; 
  private static lastGuideLineBegin = false;
  private static lastGuideLineBeginID = -1; 
  private static lastViewportId = 0;

  public static lineActive = true;
  public static pointActive = true;
  public static extendedLineActive = false;
  public static midpointActive = true;
  public static crossActive = true;
  public static DropFootActive = true;
  public static dynamic = true;

  public static startPoint: THREE.Vector3;
  public static objectUUID: object = {};

  public static lastObject = {id:-1};
  public static currentObject = {id:-1};
	public static GPURenderTarget: THREE.WebGLRenderTarget;
	public static SnapperMateral = new THREE.ShaderMaterial({
  		uniforms: {
	        getPosition:{value:0},
          viewportId:{value:0},
	      },
	      vertexShader: `
	      	precision highp float;
	        precision highp int;

          #include <common>
          #include <clipping_planes_pars_vertex>

	        // attribute vec3 position;
	        attribute float id;
          attribute float id2;
	        varying float id_;
          varying float id2_;
          varying vec3 position_;
          attribute vec4 color;
          varying vec4 color_;

	        // uniform mat4 modelViewMatrix;
	        // uniform mat4 projectionMatrix;
	        uniform float devicePixelRatio;

	        void main() {

            color_ = color;
            id2_ = id2;
	          id_ = id;
            gl_PointSize = 2.0;
	          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
            position_ = position;
	          gl_Position = projectionMatrix * mvPosition;

            #include <clipping_planes_vertex>
	        }
	        `,
	      fragmentShader: `
  	    	precision highp float;
    			precision highp int;
    			precision highp sampler2D;

          uniform float getPosition;
          uniform float viewportId;

          #include <common>
          #include <clipping_planes_pars_fragment>

	      	varying float id_;
          varying float id2_;
          varying vec3 position_;
          varying vec4 color_;

	      	void main() {

              #include <clipping_planes_fragment>

              if(getPosition == 0.0){
                // gl_FragColor = vec4(floor(id_ + 0.1),floor(id2_ + 0.1),129.0,1.0);
                gl_FragColor = vec4(floor(id_ + 0.1),floor(id2_ + 0.1),129.0 + viewportId,1.0);
              }else{
                // gl_FragColor = vec4(129.0,position_.x,position_.y,1.0);
                if(color_.a > 0.0){
                  gl_FragColor = vec4(floor(id_ + 0.1),position_.x,position_.y,1.0);
                }else{
                  gl_FragColor = vec4(0.0);
                }
              }
	      	}
		    `,
	      transparent:true,
	      depthTest:true
	  }
  	);

  public static SnapperMateralWithoutClipping = new THREE.ShaderMaterial({
      uniforms: {
          viewZone:{value:0},
        },
        vertexShader: `
          precision highp float;
          precision highp int;

          #include <common>
          #include <clipping_planes_pars_vertex>

          // attribute vec3 position;
          attribute float id;
          varying float id_;
          varying vec3 position_;

          // uniform mat4 modelViewMatrix;
          // uniform mat4 projectionMatrix;
          uniform float devicePixelRatio;

          void main() {

            id_ = id;
            gl_PointSize = 2.0;
            vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
            position_ = position;
            gl_Position = projectionMatrix * mvPosition;

            #include <clipping_planes_vertex>
          }
          `,
        fragmentShader: `
          precision highp float;
          precision highp int;
          precision highp sampler2D;

          #include <common>
          #include <clipping_planes_pars_fragment>

          varying float id_;
          varying vec3 position_;

          void main() {

              #include <clipping_planes_fragment>

              gl_FragColor = vec4(floor(id_ + 0.1),position_.x,position_.y,1.0);
          }
        `,
        transparent:true,
        depthTest:true
    }
    );

  public static SnapperLine2Materal = new THREE.ShaderMaterial({
      uniforms: {
        },
        vertexShader: `
          #include <common>
          #include <color_pars_vertex>
          #include <fog_pars_vertex>
          #include <logdepthbuf_pars_vertex>
          #include <clipping_planes_pars_vertex>

          uniform float linewidth;
          uniform vec2 resolution;

          attribute vec3 instanceStart;
          attribute vec3 instanceEnd;

          attribute vec3 instanceColorStart;
          attribute vec3 instanceColorEnd;
          attribute float id;

          varying vec2 vUv;
          varying vec4 worldPos;
          varying vec3 worldStart;
          varying vec3 worldEnd;
          varying float id_;

          #ifdef USE_DASH

            uniform float dashScale;
            attribute float instanceDistanceStart;
            attribute float instanceDistanceEnd;
            varying float vLineDistance;

          #endif

          void trimSegment( const in vec4 start, inout vec4 end ) {

            // trim end segment so it terminates between the camera plane and the near plane

            // conservative estimate of the near plane
            float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
            float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
            float nearEstimate = - 0.5 * b / a;

            float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

            end.xyz = mix( start.xyz, end.xyz, alpha );

          }

          void main() {

            id_ = id;
            #ifdef USE_COLOR

              vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

            #endif

            #ifdef USE_DASH

              vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;

            #endif

            float aspect = resolution.x / resolution.y;

            vUv = uv;

            // camera space
            vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
            vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

            worldStart = start.xyz;
            worldEnd = end.xyz;

            // special case for perspective projection, and segments that terminate either in, or behind, the camera plane
            // clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
            // but we need to perform ndc-space calculations in the shader, so we must address this issue directly
            // perhaps there is a more elegant solution -- WestLangley

            bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

            if ( perspective ) {

              if ( start.z < 0.0 && end.z >= 0.0 ) {

                trimSegment( start, end );

              } else if ( end.z < 0.0 && start.z >= 0.0 ) {

                trimSegment( end, start );

              }

            }

            // clip space
            vec4 clipStart = projectionMatrix * start;
            vec4 clipEnd = projectionMatrix * end;

            // ndc space
            vec3 ndcStart = clipStart.xyz / clipStart.w;
            vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

            // direction
            vec2 dir = ndcEnd.xy - ndcStart.xy;

            // account for clip-space aspect ratio
            dir.x *= aspect;
            dir = normalize( dir );

            #ifdef WORLD_UNITS

              // get the offset direction as perpendicular to the view vector
              vec3 worldDir = normalize( end.xyz - start.xyz );
              vec3 offset;
              if ( position.y < 0.5 ) {

                offset = normalize( cross( start.xyz, worldDir ) );

              } else {

                offset = normalize( cross( end.xyz, worldDir ) );

              }

              // sign flip
              if ( position.x < 0.0 ) offset *= - 1.0;

              float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

              // don't extend the line if we're rendering dashes because we
              // won't be rendering the endcaps
              #ifndef USE_DASH

                // extend the line bounds to encompass  endcaps
                start.xyz += - worldDir * linewidth * 0.5;
                end.xyz += worldDir * linewidth * 0.5;

                // shift the position of the quad so it hugs the forward edge of the line
                offset.xy -= dir * forwardOffset;
                offset.z += 0.5;

              #endif

              // endcaps
              if ( position.y > 1.0 || position.y < 0.0 ) {

                offset.xy += dir * 2.0 * forwardOffset;

              }

              // adjust for linewidth
              offset *= linewidth * 0.5;

              // set the world position
              worldPos = ( position.y < 0.5 ) ? start : end;
              worldPos.xyz += offset;

              // project the worldpos
              vec4 clip = projectionMatrix * worldPos;

              // shift the depth of the projected points so the line
              // segements overlap neatly
              vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
              clip.z = clipPose.z * clip.w;

            #else

              vec2 offset = vec2( dir.y, - dir.x );
              // undo aspect ratio adjustment
              dir.x /= aspect;
              offset.x /= aspect;

              // sign flip
              if ( position.x < 0.0 ) offset *= - 1.0;

              // endcaps
              if ( position.y < 0.0 ) {

                offset += - dir;

              } else if ( position.y > 1.0 ) {

                offset += dir;

              }

              // adjust for linewidth
              offset *= linewidth;

              // adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
              offset /= resolution.y;

              // select end
              vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

              // back to clip space
              offset *= clip.w;

              clip.xy += offset;

            #endif

            gl_Position = clip;

            vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

            #include <logdepthbuf_vertex>
            #include <clipping_planes_vertex>
            #include <fog_vertex>

          }
        `,
        fragmentShader: `
          uniform vec3 diffuse;
          uniform float opacity;
          uniform float linewidth;

          #ifdef USE_DASH

            uniform float dashSize;
            uniform float gapSize;

          #endif

          varying float vLineDistance;
          varying vec4 worldPos;
          varying vec3 worldStart;
          varying vec3 worldEnd;

          #include <common>
          #include <color_pars_fragment>
          #include <fog_pars_fragment>
          #include <logdepthbuf_pars_fragment>
          #include <clipping_planes_pars_fragment>

          varying vec2 vUv;
          varying float id_;

          vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

            float mua;
            float mub;

            vec3 p13 = p1 - p3;
            vec3 p43 = p4 - p3;

            vec3 p21 = p2 - p1;

            float d1343 = dot( p13, p43 );
            float d4321 = dot( p43, p21 );
            float d1321 = dot( p13, p21 );
            float d4343 = dot( p43, p43 );
            float d2121 = dot( p21, p21 );

            float denom = d2121 * d4343 - d4321 * d4321;

            float numer = d1343 * d4321 - d1321 * d4343;

            mua = numer / denom;
            mua = clamp( mua, 0.0, 1.0 );
            mub = ( d1343 + d4321 * ( mua ) ) / d4343;
            mub = clamp( mub, 0.0, 1.0 );

            return vec2( mua, mub );

          }

          void main() {

            #include <clipping_planes_fragment>

            #ifdef USE_DASH

              if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

              if ( mod( vLineDistance, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

            #endif

            float alpha = opacity;

            #ifdef WORLD_UNITS

              // Find the closest points on the view ray and the line segment
              vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
              vec3 lineDir = worldEnd - worldStart;
              vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

              vec3 p1 = worldStart + lineDir * params.x;
              vec3 p2 = rayEnd * params.y;
              vec3 delta = p1 - p2;
              float len = length( delta );
              float norm = len / linewidth;

              #ifndef USE_DASH

                #ifdef ALPHA_TO_COVERAGE

                  float dnorm = fwidth( norm );
                  alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

                #else

                  if ( norm > 0.5 ) {

                    discard;

                  }

                #endif

              #endif

            #else

              #ifdef ALPHA_TO_COVERAGE

                // artifacts appear on some hardware if a derivative is taken within a conditional
                float a = vUv.x;
                float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
                float len2 = a * a + b * b;
                float dlen = fwidth( len2 );

                if ( abs( vUv.y ) > 1.0 ) {

                  alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

                }

              #else

                if ( abs( vUv.y ) > 1.0 ) {

                  float a = vUv.x;
                  float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
                  float len2 = a * a + b * b;

                  if ( len2 > 1.0 ) discard;

                }

              #endif

            #endif

            vec4 diffuseColor = vec4( diffuse, alpha );

            #include <logdepthbuf_fragment>
            #include <color_fragment>

            // gl_FragColor = vec4( diffuseColor.rgb, alpha );
            gl_FragColor = vec4(floor(id_ + 0.1),0.0,0.0,1.0);

            #include <tonemapping_fragment>
            #include <encodings_fragment>
            #include <fog_fragment>
            #include <premultiplied_alpha_fragment>

          }
        `,
        transparent:true,
        depthTest:true
    }
      
    ); 

	public static setGPURenderTargetSize(width,height){
    if(Snapper.GPURenderTarget){
		  Snapper.GPURenderTarget.setSize(width ,height );
    }else{
      Snapper.GPURenderTarget = new THREE.WebGLRenderTarget(width , height , {
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        type: THREE.FloatType
      });
    }
		Snapper.GPUData = new Float32Array(width * height  * 4);
    Snapper.GPUDataPoints = new Float32Array(width * height  * 4);
    Snapper.GPUDataLines = new Float32Array(width * height  * 4);
    Snapper.GPUDataPosition = new Float32Array(width * height  * 4);
    // console.log("GPUData resize");
	}

  public geometryExpand(geometry: THREE.BufferGeometry,length?: number){
    const oldLength = geometry.attributes.position.count;
    let addLength = 2000;

    if(length){addLength = length}

    for(let type in geometry.attributes){
      const itemSize = geometry.attributes[type].itemSize;
      const size = (geometry.attributes[type].count + addLength) * itemSize
      let data = new Float32Array(size);

      for(let i = 0; i < geometry.attributes[type].array.length;i++){
        data[i] = geometry.attributes[type].array[i];
      }

      geometry.setAttribute(type,new THREE.Float32BufferAttribute( data, itemSize ))
      // geometry.attributes[type].needsUpdate = true;
    }
  }

	public static register(object,onceInit?,offset?,length?,entity?){

    // console.log(object)

    Snapper.MaxID++;

		let offset_ = 0;
		if(offset){
			offset_ = offset;
		}

		let length_=0;
		if(length){
			length_ = length;
		}else{
      length_ = object.geometry.attributes.position.count;
    }

		const id_ = object.uuid;

		if(!object.geometry.attributes.id){
      let size = offset_ + length_;
      if(object.type == "LineSegments2"){  //InstancedBufferAttribute
        size /= 6;
      }
			const ids = new Float32Array(size);
      if(object.type == "LineSegments2"){  //InstancedBufferAttribute
        object.geometry.setAttribute( 'id', new THREE.InstancedBufferAttribute( ids, 1 ) );
      }else{
  			object.geometry.setAttribute( 'id', new THREE.Float32BufferAttribute( ids, 1 ) );
      }
		}

    if(object.geometry.attributes.id.count < (offset_ + length_)){
      let size = offset_ + length_;
      if(object.type == "LineSegments2"){  //InstancedBufferAttribute
        size /= 6;
      }
      let data = new Float32Array(size);

      for(let i = 0; i < object.geometry.attributes.id.array.length;i++){
        data[i] = object.geometry.attributes.id.array[i];
      }

      if(object.type == "LineSegments2"){  //InstancedBufferAttribute
        object.geometry.setAttribute('id',new THREE.InstancedBufferAttribute( data, 1 ));
      }else{
        object.geometry.setAttribute('id',new THREE.Float32BufferAttribute( data, 1 ));
      }
    }

    if(object.type == "LineSegments2"){
      for(let i = offset_/ 6; i < object.geometry.attributes.id.count + offset_ / 6;i++){
        object.geometry.attributes.id.array[i] = Snapper.MaxID;
      }
    }else{
  		for(let i = offset_; i < object.geometry.attributes.id.count + offset_;i++){
  			object.geometry.attributes.id.array[i] = Snapper.MaxID;
  		}
    }

		Snapper.entityMap.set(Snapper.MaxID,{object:object,offset:offset_,length_,entity:entity,id:Snapper.MaxID});
		Snapper.entityIdToIndex.set(id_ + "_" + offset_,Snapper.MaxID);

    object.geometry.attributes.id.needsUpdate = true;

    object.gpuId = Snapper.MaxID * 1;

    if(onceInit){
      Snapper.dynamic = false;
      Snapper.lastObject = Snapper.entityMap.get(Snapper.MaxID);

      Snapper.insert(0,0,true);

      Snapper.lastObject = {id:-1};
    }

    return Snapper.MaxID * 1;
	}

	public static render(scene,renderer :THREE.WebGLRenderer,camera,viewports_?){

    // console.log("updateGPU");

		const old_material = {};
    const old_visiableObject = [];
    const MeshObject = [];
    const SpriteObject = [];
    const autoClear = renderer.autoClear;
    Snapper.renderer = renderer;
    Snapper.camera = camera;

    let viewports = [];

    if(!viewports_){
      viewports.push({scale:new THREE.Vector3(1,1,1),position:new THREE.Vector3(0,0,0),isDefault:true}) 
    }else{
       for (let i = 0; i < viewports_.length; i++) {
          let scale = new THREE.Vector3(
            viewports_[i].value.customScale,
            viewports_[i].value.customScale,
            viewports_[i].value.customScale);
          let position = new THREE.Vector3(
            viewports_[i].value.offsetVector[0] * viewports_[i].value.customScale,
            viewports_[i].value.offsetVector[1] * viewports_[i].value.customScale,
            viewports_[i].value.offsetVector[2] * viewports_[i].value.customScale
            );
          
          let constant = [];
          constant.push(
              viewports_[i].value.centerpoint[0] + viewports_[i].value.width / 2,
              -(viewports_[i].value.centerpoint[0] - viewports_[i].value.width / 2),
              viewports_[i].value.centerpoint[1] + viewports_[i].value.height / 2,
              -(viewports_[i].value.centerpoint[1] - viewports_[i].value.height / 2)
              );
          
          viewports.push({scale:scale,position:position,constant:constant});
        }
    }

    this.viewports = viewports;

		scene.traverse(
			(object) => {

				if(object.visible && object.name != "sign"){
          if(object.type == "Mesh" || object.type == "LineSegments" || object.type == "Line"){
            if(object.material.type != 'RawShaderMaterial'){
  					  old_material[object.uuid] = object.material;
              if(object.type == "LineSegments2"){
                Snapper.SnapperLine2Materal.uniforms = object.material.uniforms;
                object.material = Snapper.SnapperLine2Materal;
              }else{
                if(object.name == "controlOBj"){
                  object.material = Snapper.SnapperMateralWithoutClipping;
                }else{
                  Snapper.SnapperMateral.clippingPlanes = object.material.clippingPlanes;
      					  object.material = Snapper.SnapperMateral;
                }
              }
              MeshObject.push(object);
            }else{
              object.material.uniforms.drawId.value = 1;
              SpriteObject.push(object);
            }
          }else{

            if(object.name == "MassIcons"){
              object.material.uniforms.drawId.value = 1;
              SpriteObject.push(object);
            }

            if(object.type == "Sprite"){
              old_visiableObject.push(object);
              object.visible = false;
            }
          }
				}else{
          if(object.name == "sign" && object.visible){
            old_visiableObject.push(object);
            object.visible = false;
          }
        }
			}
		);

    Snapper.renderer.autoClear = false;
    Snapper.renderer.setRenderTarget(Snapper.GPURenderTarget);  
    Snapper.renderer.clear();

    // 鎹曟崏浣?
    for(let i = 0; i < viewports.length;i++){
      // Snapper.renderer.render(scene,Snapper.camera); 
      scene.scale.copy(viewports[i].scale);
      scene.position.copy(viewports[i].position);

      if(Snapper.SnapperMateral.clippingPlanes && viewports[i].constant){
        for(let j = 0; j < Snapper.SnapperMateral.clippingPlanes.length;j++){
          Snapper.SnapperMateral.clippingPlanes[j].constant = viewports[i].constant[j];
        }
      }
      (Snapper.SnapperMateral as any).uniforms.viewportId.value = i;
      Snapper.renderer.render(scene,Snapper.camera);
    }

    scene.scale.set(1,1,1);
    scene.position.set(0,0,0);

    while(old_visiableObject.length > 0){
      const object = old_visiableObject.pop();
      object.visible = true;
    }

		while(MeshObject.length > 0){
      const object = MeshObject.pop();
      object.material = old_material[object.uuid];
    }

    while(SpriteObject.length > 0){
      const object = SpriteObject.pop();
      object.material.uniforms.drawId.value = 0;
    }

    Snapper.renderer.readRenderTargetPixels(Snapper.GPURenderTarget, 0, 0, Snapper.GPURenderTarget.width, Snapper.GPURenderTarget.height, Snapper.GPUData);

    Snapper.SnapperMateral.uniforms.getPosition.value = 0;
    // 鎹曟崏鐐?
    
    
    Snapper.renderer.clear();
    for(let i = 0; i < viewports.length;i++){
      if(Snapper.PointsScene.children.length > 0){
        Snapper.PointsScene.children[0].scale.copy(viewports[i].scale);
        Snapper.PointsScene.children[0].position.copy(viewports[i].position);
      }

      if(Snapper.SnapperMateral.clippingPlanes && viewports[i].constant){
        for(let j = 0; j < Snapper.SnapperMateral.clippingPlanes.length;j++){
          Snapper.SnapperMateral.clippingPlanes[j].constant = viewports[i].constant[j];
        }
      }
      (Snapper.SnapperMateral as any).uniforms.viewportId.value = i;
      Snapper.renderer.render(Snapper.PointsScene,Snapper.camera);
    }

    Snapper.renderer.readRenderTargetPixels(Snapper.GPURenderTarget, 0, 0, Snapper.GPURenderTarget.width, Snapper.GPURenderTarget.height, Snapper.GPUDataPoints);

    // 鎹曟崏绾?
    Snapper.renderer.clear();

    for(let i = 0; i < viewports.length;i++){
      if(Snapper.LinesScene.children.length > 0){
        Snapper.LinesScene.children[0].scale.copy(viewports[i].scale);
        Snapper.LinesScene.children[0].position.copy(viewports[i].position);
      }

      if(Snapper.SnapperMateral.clippingPlanes && viewports[i].constant){
        for(let j = 0; j < Snapper.SnapperMateral.clippingPlanes.length;j++){
          Snapper.SnapperMateral.clippingPlanes[j].constant = viewports[i].constant[j];
        }
      }

      (Snapper.SnapperMateral as any).uniforms.viewportId.value = i;
      Snapper.renderer.render(Snapper.LinesScene,Snapper.camera);
    }

    Snapper.renderer.readRenderTargetPixels(Snapper.GPURenderTarget, 0, 0, Snapper.GPURenderTarget.width, Snapper.GPURenderTarget.height, Snapper.GPUDataLines);

    Snapper.SnapperMateral.uniforms.getPosition.value = 1;
    // 鎹曠嚎浣嶇疆
    Snapper.renderer.clear();

    for(let i = 0; i < viewports.length;i++){
      if(Snapper.LinesScene.children.length > 0){
        Snapper.LinesScene.children[0].scale.copy(viewports[i].scale);
        Snapper.LinesScene.children[0].position.copy(viewports[i].position);
      }

      if(Snapper.SnapperMateral.clippingPlanes && viewports[i].constant){
        for(let j = 0; j < Snapper.SnapperMateral.clippingPlanes.length;j++){
          Snapper.SnapperMateral.clippingPlanes[j].constant = viewports[i].constant[j];
        }
      }
      (Snapper.SnapperMateral as any).uniforms.viewportId.value = i;
      Snapper.renderer.render(Snapper.LinesScene,Snapper.camera);
    }

    Snapper.renderer.readRenderTargetPixels(Snapper.GPURenderTarget, 0, 0, Snapper.GPURenderTarget.width, Snapper.GPURenderTarget.height, Snapper.GPUDataPosition);

    /////////

    Snapper.renderer.setRenderTarget(null);
    Snapper.renderer.autoClear = autoClear;

    Snapper.needsUpdate = false;

	}

	// public static cancellation(object){

	// }

  public static cameraChanged(camera: THREE.Camera){
    Snapper.guideLine.material.scale = (camera as any).zoom * 0.4;
    Snapper.guideLine.computeLineDistances();
  }

  public static camreaChanged(camera: THREE.Camera){
    Snapper.cameraChanged(camera);
  }

  public static hover(x_,y_,camera: THREE.Camera){
    Snapper.cameraChanged(camera)
    //----------------------------- 鏋勪欢 ----------------------------------

    let offset = (Math.floor(x_) + Math.floor(Snapper.GPURenderTarget.height - y_) * Snapper.GPURenderTarget.width) * 4;
    
    let min = Number.MAX_VALUE;
    const center = new THREE.Vector2(x_,y_);
    let PositionOfFace = [];
    let isLineSegments2  = false;

    for(let x = -Snapper.Range + x_; x <= Snapper.Range + x_;x++){
      for(let y = -Snapper.Range + y_; y <= Snapper.Range + y_;y++){
        if(x >= 0 && x < Snapper.GPURenderTarget.width && y >=0 && y < Snapper.GPURenderTarget.height){
          const offset2 = (Math.floor(x) + Math.floor(Snapper.GPURenderTarget.height - y) * Snapper.GPURenderTarget.width) * 4;
          if(Snapper.GPUData[offset2] >= 128){
            let P = new THREE.Vector2(x,y);
            const obj = Snapper.entityMap.get(Snapper.GPUData[offset2]);
            if(obj.object.type == 'LineSegments2'){
              isLineSegments2 = true;
            }

          }
        }
      }
    }

    for(let x = -Snapper.Range + x_; x <= Snapper.Range + x_;x++){
      for(let y = -Snapper.Range + y_; y <= Snapper.Range + y_;y++){
        if(x >= 0 && x < Snapper.GPURenderTarget.width && y >=0 && y < Snapper.GPURenderTarget.height){
          const offset2 = (Math.floor(x) + Math.floor(Snapper.GPURenderTarget.height - y) * Snapper.GPURenderTarget.width) * 4;
          if(Snapper.GPUData[offset2] >= 128){
            let P = new THREE.Vector2(x,y);
            const obj = Snapper.entityMap.get(Snapper.GPUData[offset2]);
            if(isLineSegments2){
              if(obj.object.type == 'LineSegments2'){
                if(P.distanceTo(center)< min){
                  min = P.distanceTo(center);
                  offset = offset2;
                }
              }
            }else{
              if(P.distanceTo(center) < min){
                min = P.distanceTo(center);
                offset = offset2;
              }
            }
          }
        }
      }
    }

    if(Snapper.GPUData[offset] >= 128){

      if(Snapper.lastObject.id != Snapper.GPUData[offset]){
        Snapper.lastObject = Snapper.entityMap.get(Snapper.GPUData[offset]);

        // Snapper.tempID = 128 + Snapper.staticID;
        if(!Snapper.objectUUID[(Snapper.lastObject as any).object.uuid] && Snapper.dynamic){
          Snapper.insert(x_,y_);
        }
      }

      if(Snapper.currentObject.id != Snapper.GPUData[offset]){
        Snapper.currentObject = Snapper.lastObject;
        const evt = new Event('hover');
        (evt as any).entity = Snapper.currentObject;
        (evt as any).mousePosition = {x:x_,y:y_};
        window.dispatchEvent(evt);
      }

    }else{
      // if(Snapper.currentObject.id >= 128){
        // Snapper.currentObject = {id:-1};
        // const evt = new Event('hover');
        // (evt as any).entity = Snapper.currentObject;
        // (evt as any).mousePosition = {x:x_,y:y_};
        // window.dispatchEvent(evt);

        // const evt2 = new Event('hit');
        // (evt2 as any).position = [];
        // (evt2 as any).hitType = "none";
        // window.dispatchEvent(evt2);

        // return;
    }

    if(Snapper.currentObject.id != -1){
      if(Snapper.GPUDataPosition[offset] >= 128)
      PositionOfFace = [Snapper.GPUDataPosition[offset + 1],Snapper.GPUDataPosition[offset + 2], (Snapper.currentObject as any).object.matrixWorld.elements[14]];
    }

    //---------------------------- 寤堕暱绾?-----------------------------------

    let DropFoot;
    Snapper.guideLine.visible = false;
    if(Snapper.lineActive && Snapper.lastGuideActiveLine && Snapper.lastGuideActiveLine.position.length == 6){

      let P0 = new THREE.Vector3(Snapper.lastGuideActiveLine.position[0],Snapper.lastGuideActiveLine.position[1],Snapper.lastGuideActiveLine.position[2]);
      let P1 = new THREE.Vector3(Snapper.lastGuideActiveLine.position[3],Snapper.lastGuideActiveLine.position[4],Snapper.lastGuideActiveLine.position[5]);

      let line = {P0:P0,P1:P1};
      let P = new THREE.Vector3(x_ / Snapper.GPURenderTarget.width * 2 - 1,((1 - y_ / Snapper.GPURenderTarget.height) * 2 - 1),0);
      P.unproject(camera);
      P.z = 0;

      let P2 = Snapper.PointToLine(P,line);

      if(P0.distanceTo(P) < P1.distanceTo(P)){
        (Snapper.guideLine.geometry.attributes.position as any).array[0] = P0.x;
        (Snapper.guideLine.geometry.attributes.position as any).array[1] = P0.y;
        (Snapper.guideLine.geometry.attributes.position as any).array[2] = P0.z;
      }else{
        (Snapper.guideLine.geometry.attributes.position as any).array[0] = P1.x;
        (Snapper.guideLine.geometry.attributes.position as any).array[1] = P1.y;
        (Snapper.guideLine.geometry.attributes.position as any).array[2] = P1.z;
      }

      (Snapper.guideLine.geometry.attributes.position as any).array[3] = P2.x;
      (Snapper.guideLine.geometry.attributes.position as any).array[4] = P2.y;
      (Snapper.guideLine.geometry.attributes.position as any).array[5] = P2.z;

      Snapper.guideLine.frustumCulled = false;
      
      Snapper.guideLine.geometry.attributes.position.needsUpdate = true;

      let P2_ = P2.clone();
      P2_.project(camera);
      P2_.x = (P2_.x + 1) * 0.5 * Snapper.GPURenderTarget.width;
      P2_.y = (1 - (P2_.y + 1) * 0.5) * Snapper.GPURenderTarget.height;
      P2_.z = 0;
      let P_ = new THREE.Vector3(x_,y_,0);

      if(P2_.distanceTo(P_) < Snapper.Range){
        // Snapper.guideLine.material.scale = window.devicePixelRatio / (camera as any).zoom;

        if(Snapper.startPoint && Snapper.DropFootActive){
          DropFoot = Snapper.PointToLine(Snapper.startPoint,line);
        }

        if(Snapper.extendedLineActive ){
          Snapper.guideLine.visible = true;
        }
      }
    }

    if(Snapper.lineActive){
      if(Snapper.guideLine.visible){
        const evt = new Event('hit');
        (evt as any).position = [
            Snapper.guideLine.geometry.attributes.position.array[3],
            Snapper.guideLine.geometry.attributes.position.array[4],
            Snapper.guideLine.geometry.attributes.position.array[5]
          ];
        (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
        (evt as any).hitType = "guideLine";
        window.dispatchEvent(evt);
      }else{
        const evt = new Event('hit');
        (evt as any).position = PositionOfFace;
        (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
        (evt as any).hitType = "face";
        window.dispatchEvent(evt);
      }
    }

    if(Snapper.GPUData[offset] < 128){
      Snapper.currentObject = {id:-1};
      const evt = new Event('hover');
      (evt as any).entity = Snapper.currentObject;
      (evt as any).mousePosition = {x:x_,y:y_};
      window.dispatchEvent(evt);

      const evt2 = new Event('hit');
      (evt2 as any).position = [];
      (evt2 as any).hitType = "none";
      window.dispatchEvent(evt2);

      return;
    }

    //---------------------------------------------------------------------------

    if(Snapper.needsUpdate == false){
      //------------------------------ 鐐?------------------------------------

      if(Snapper.pointActive){

        min = Number.MAX_VALUE;

        for(let x = -Snapper.Range * 2 + x_; x <= Snapper.Range * 2 + x_;x++){
          for(let y = -Snapper.Range * 2 + y_; y <= Snapper.Range * 2 + y_;y++){
            if(x >= 0 && x < Snapper.GPURenderTarget.width && y >=0 && y < Snapper.GPURenderTarget.height){
              const offset2 = (Math.floor(x) + Math.floor(Snapper.GPURenderTarget.height - y) * Snapper.GPURenderTarget.width) * 4;
              if(Snapper.GPUDataPoints[offset2 + 2] >= 128){
                const P = new THREE.Vector2(x,y);
                if(P.distanceTo(center) < min){
                  min = P.distanceTo(center);
                  offset = offset2;
                }
              }
            }
          }
        }

        if(Snapper.GPUDataPoints[offset + 2] >= 128){
          this.lastViewportId = Snapper.GPUDataPoints[offset + 2] - 129;
          const evt = new Event('hit');
          if(Snapper.pointsMap[Snapper.GPUDataPoints[offset] + Snapper.GPUDataPoints[offset + 1] * 10000]){

            let obj = Snapper.pointsMap[Snapper.GPUDataPoints[offset] + Snapper.GPUDataPoints[offset + 1] * 10000].position;
            let m = Snapper.pointsMap[Snapper.GPUDataPoints[offset] + Snapper.GPUDataPoints[offset + 1] * 10000].object.matrixWorld;
            let point0 = new THREE.Vector3(obj[0],obj[1],obj[2]);
            point0 = point0.applyMatrix4(m);
            if(this.viewports[0].isDefault)
            obj = [point0.x,point0.y,point0.z];

            (evt as any).position = obj;
            (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataPoints[offset + 2] - 129,(evt as any).position);
            (evt as any).hitType = "point";
            window.dispatchEvent(evt);
            return;
          }
          if(Snapper.staticPointsMap.get(Snapper.GPUDataPoints[offset] + Snapper.GPUDataPoints[offset + 1] * 10000)){
            (evt as any).position = Snapper.staticPointsMap.get(Snapper.GPUDataPoints[offset] + Snapper.GPUDataPoints[offset + 1] * 10000).position;
            (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataPoints[offset + 2] - 129,(evt as any).position);
            (evt as any).hitType = "point";
            window.dispatchEvent(evt);
            return;
          }
        }
      }

      //----------------------------- 浜ょ偣 -----------------------------------

      let ids = [];
      let offset_ = -1;

      if(Snapper.crossActive){

         for(let x = -Snapper.Range * 2 + x_; x <= Snapper.Range * 2 + x_;x++){
          for(let y = -Snapper.Range * 2 + y_; y <= Snapper.Range * 2 + y_;y++){
            if(x >= 0 && x < Snapper.GPURenderTarget.width && y >=0 && y < Snapper.GPURenderTarget.height){
              const offset2 = (Math.floor(x) + Math.floor(Snapper.GPURenderTarget.height - y) * Snapper.GPURenderTarget.width) * 4;
              if(Snapper.GPUDataLines[offset2 + 2] >= 128){
                this.lastViewportId = Snapper.GPUDataLines[offset + 2] - 129;
                let find = false;
                for(let k = 0; k < ids.length;k++){
                  if(ids[k] == Snapper.GPUDataLines[offset2] +  Snapper.GPUDataLines[offset2 + 1] * 10000){
                    find = true;
                  }
                }

                if(find == false && ids.length < 2){
                  ids.push(Snapper.GPUDataLines[offset2] +  Snapper.GPUDataLines[offset2 + 1] * 10000);
                }
              }
            }
          }
        }

        if(ids.length >= 2){

          let gpuid0 = ids[0];
          let gpuid1 = ids[1];

          let obj0 = Snapper.linesMap[gpuid0].position;
          let obj1 = Snapper.linesMap[gpuid1].position;

          let m = Snapper.linesMap[Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000].object.matrixWorld;
          let point0 = new THREE.Vector3(obj0[0],obj0[1],obj0[2]);
          let point1 = new THREE.Vector3(obj0[3],obj0[4],obj0[5]);
          let point2 = new THREE.Vector3(obj1[0],obj1[1],obj1[2]);
          let point3 = new THREE.Vector3(obj1[3],obj1[4],obj1[5]);
          point0 = point0.applyMatrix4(m);
          point1 = point1.applyMatrix4(m);
          point2 = point2.applyMatrix4(m);
          point3 = point3.applyMatrix4(m);

          if(this.viewports[0].isDefault){
            obj0 = [point0.x,point0.y,point0.z,point1.x,point1.y,point1.z];
            obj1 = [point2.x,point2.y,point2.z,point3.x,point3.y,point3.z];
          }

          if(obj0 && obj1){
            let line0 = {P0:{x:obj0[0],y:obj0[1],z:obj0[2]},P1:{x:obj0[3],y:obj0[4],z:obj0[5]}};
            let line1 = {P0:{x:obj1[0],y:obj1[1],z:obj1[2]},P1:{x:obj1[3],y:obj1[4],z:obj1[5]}};

            let result = Snapper.LineCrossLine(line0,line1);

            if(result){

              let P2_ = result.point.clone();
              P2_.project(camera);
              P2_.x = (P2_.x + 1) * 0.5 * Snapper.GPURenderTarget.width;
              P2_.y = (1 - (P2_.y + 1) * 0.5) * Snapper.GPURenderTarget.height;
              P2_.z = 0;
              let P_ = new THREE.Vector3(x_,y_,0);

              if(P2_.distanceTo(P_) < Snapper.Range){
                const evt = new Event('hit');
                (evt as any).position = [result.point.x,result.point.y,result.point.z];
                (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
                (evt as any).hitType = "cross";
                window.dispatchEvent(evt);
                return;
              }
            }

          }
        }

      }

      //----------------------------- 涓偣 -----------------------------------

      if(Snapper.midpointActive){
        min = Number.MAX_VALUE;

        for(let x = -Snapper.Range * 2 + x_; x <= Snapper.Range * 2 + x_;x++){
          for(let y = -Snapper.Range * 2 + y_; y <= Snapper.Range * 2 + y_;y++){
            if(x >= 0 && x < Snapper.GPURenderTarget.width && y >=0 && y < Snapper.GPURenderTarget.height){
              const offset2 = (Math.floor(x) + Math.floor(Snapper.GPURenderTarget.height - y) * Snapper.GPURenderTarget.width) * 4;
              if(Snapper.GPUDataLines[offset2 + 2] >= 128){
                const P = new THREE.Vector2(x,y);
                if(P.distanceTo(center) < min){
                  min = P.distanceTo(center);
                  offset = offset2;
                }
              }
            }
          }
        }

        if(Snapper.GPUDataLines[offset + 2] >= 128){
          
          this.lastViewportId = Snapper.GPUDataLines[offset + 2] - 129;
          if(Snapper.linesMap[Snapper.GPUDataLines[offset]]){
            // const z = Snapper.linesMap.get(Snapper.GPUDataLines[offset]).position[0][2];
            // const position = [Snapper.GPUDataLines[offset + 1],Snapper.GPUDataLines[offset + 2],z];

            let obj = Snapper.linesMap[Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000].position;
            let m = Snapper.linesMap[Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000].object.matrixWorld;
            let point0 = new THREE.Vector3(obj[0],obj[1],obj[2]);
            let point1 = new THREE.Vector3(obj[3],obj[4],obj[5]);
            point0 = point0.applyMatrix4(m);
            point1 = point1.applyMatrix4(m);

            if(this.viewports[0].isDefault)
            obj = [point0.x,point0.y,point0.z,point1.x,point1.y,point1.z];

            let midpoint = new THREE.Vector3(
                (obj[0] + obj[3]) / 2,
                (obj[1] + obj[4]) / 2,
                0
              );

            let P2_ = midpoint.clone();
            P2_.project(camera);
            P2_.x = (P2_.x + 1) * 0.5 * Snapper.GPURenderTarget.width;
            P2_.y = (1 - (P2_.y + 1) * 0.5) * Snapper.GPURenderTarget.height;
            P2_.z = 0;

            let P_ = new THREE.Vector3(x_,y_,0);

            if(P2_.distanceTo(P_) < Snapper.Range){
              const evt = new Event('hit');
              (evt as any).position = midpoint.toArray();
              (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
              (evt as any).hitType = "midpoint";
              window.dispatchEvent(evt);

              return;
            }

          }
        }
      }

      //------------------------------ 绾?------------------------------------

      if(Snapper.lineActive){
        min = Number.MAX_VALUE;

        for(let x = -Snapper.Range * 2 + x_; x <= Snapper.Range * 2 + x_;x++){
          for(let y = -Snapper.Range * 2 + y_; y <= Snapper.Range * 2 + y_;y++){
            if(x >= 0 && x < Snapper.GPURenderTarget.width && y >=0 && y < Snapper.GPURenderTarget.height){
              const offset2 = (Math.floor(x) + Math.floor(Snapper.GPURenderTarget.height - y) * Snapper.GPURenderTarget.width) * 4;
              if(Snapper.GPUDataLines[offset2 + 2] >= 128){
                const P = new THREE.Vector2(x,y);
                if(P.distanceTo(center) < min){
                  min = P.distanceTo(center);
                  offset = offset2;
                }
              }
            }
          }
        }

        if(Snapper.GPUDataLines[offset + 2] >= 128){
          this.lastViewportId = Snapper.GPUDataLines[offset + 2] - 129;
          // console.log(Snapper.GPUDataLines[offset + 2]);
          // console.log(Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000);
          if(Snapper.linesMap[Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000]){

            const z = Snapper.linesMap[Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000].position[2];
            let position = [Snapper.GPUDataPosition[offset + 1],Snapper.GPUDataPosition[offset + 2],z];

            let m = Snapper.linesMap[Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000].object.matrixWorld;
            let point0 = new THREE.Vector3(position[0],position[1],position[2]);
            point0 = point0.applyMatrix4(m);
            if(this.viewports[0].isDefault)
            position = [point0.x,point0.y,point0.z];

            if(Snapper.lastGuideLine != Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000){
              Snapper.lastGuideLine = Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000;
              Snapper.lastGuideLineBeginID = Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000;

              Snapper.lastGuideLineCount = 10;
              Snapper.lastGuideLineBegin = true;
            }

            if(DropFoot){
              const evt = new Event('hit');
              let P2_ = DropFoot.clone();
              P2_.project(camera);
              P2_.x = (P2_.x + 1) * 0.5 * Snapper.GPURenderTarget.width;
              P2_.y = (1 - (P2_.y + 1) * 0.5) * Snapper.GPURenderTarget.height;
              P2_.z = 0;

              let P_ = new THREE.Vector3(x_,y_,0);

              if(P2_.distanceTo(P_) < Snapper.Range){
                (evt as any).position = [
                  DropFoot.x,
                  DropFoot.y,
                  DropFoot.z
                ];
                (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
                (evt as any).hitType = "DropFoot";
                let V2 = new THREE.Vector2(Snapper.startPoint.x - DropFoot.x,Snapper.startPoint.y - DropFoot.y);
                (evt as any).angle = V2.angle();
                window.dispatchEvent(evt);
              }else{
                const evt = new Event('hit');
                (evt as any).position = position;
                (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
                (evt as any).hitType = "line";
                window.dispatchEvent(evt);
              }
            }else{
              const evt = new Event('hit');
              (evt as any).position = position;
              (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
              (evt as any).hitType = "line";
              window.dispatchEvent(evt);
            }
          }

          // if(Snapper.staticLinesMap.get(Snapper.GPUDataLines[offset])){
          //   const z = Snapper.staticLinesMap.get(Snapper.GPUDataLines[offset]).position[0][2];
          //   let position = [Snapper.GPUDataLines[offset + 1],Snapper.GPUDataLines[offset + 2],z];

          //   let m = Snapper.linesMap[Snapper.GPUDataLines[offset] + Snapper.GPUDataLines[offset + 1] * 10000].object.matrixWorld;
          //   let point0 = new THREE.Vector3(position[0],position[1],position[2]);
          //   position = [point0.x,point0.y,point0.z];

          //   if(Snapper.lastGuideLine != Snapper.GPUDataLines[offset]){
          //     Snapper.lastGuideLine = Snapper.GPUDataLines[offset];
          //   }

          //   if(DropFoot){
          //     const evt = new Event('hit');
          //     let P2_ = DropFoot.clone();
          //     P2_.project(camera);
          //     P2_.x = (P2_.x + 1) * 0.5 * Snapper.GPURenderTarget.width;
          //     P2_.y = (1 - (P2_.y + 1) * 0.5) * Snapper.GPURenderTarget.height;
          //     P2_.z = 0;

          //     let P_ = new THREE.Vector3(x_,y_,0);

          //     if(P2_.distanceTo(P_) < Snapper.Range){
          //       (evt as any).position = [
          //         DropFoot.x,
          //         DropFoot.y,
          //         DropFoot.z
          //       ];
          //       (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
          //       (evt as any).hitType = "DropFoot";
          //       let V2 = new THREE.Vector2(Snapper.startPoint.x - DropFoot.x,Snapper.startPoint.y - DropFoot.y);
          //       (evt as any).angle = V2.angle();
          //       window.dispatchEvent(evt);
          //     }else{
          //       const evt = new Event('hit');
          //       (evt as any).position = position;
          //       (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
          //       (evt as any).hitType = "line";
          //       window.dispatchEvent(evt);
          //     }
          //   }else{
          //     const evt = new Event('hit');
          //     (evt as any).position = position;
          //     (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
          //     (evt as any).hitType = "line";
          //     window.dispatchEvent(evt);
          //   }
          // }

          Snapper.guideLine.visible = false;
       
          return;
        }else{
          Snapper.lastGuideLine = -1;
        }

        //----------------------------------------------------------------------

        if(DropFoot){
          const evt = new Event('hit');
          let P2_ = DropFoot.clone();
          P2_.project(camera);
          P2_.x = (P2_.x + 1) * 0.5 * Snapper.GPURenderTarget.width;
          P2_.y = (1 - (P2_.y + 1) * 0.5) * Snapper.GPURenderTarget.height;
          P2_.z = 0;

          let P_ = new THREE.Vector3(x_,y_,0);

          if(P2_.distanceTo(P_) < Snapper.Range){
            (evt as any).position = [
              DropFoot.x,
              DropFoot.y,
              DropFoot.z
            ];
            (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
            (evt as any).hitType = "DropFoot";
            let V2 = new THREE.Vector2(Snapper.startPoint.x - DropFoot.x,Snapper.startPoint.y - DropFoot.y);
            (evt as any).angle = V2.angle();
            window.dispatchEvent(evt);
            return;
          }
        }

        // if(Snapper.guideLine.visible){
        //   const evt = new Event('hit');
        //   (evt as any).position = [
        //       Snapper.guideLine.geometry.attributes.position.array[3],
        //       Snapper.guideLine.geometry.attributes.position.array[4],
        //       Snapper.guideLine.geometry.attributes.position.array[5]
        //     ];
        //   (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
        //   (evt as any).hitType = "guideLine";
        //   window.dispatchEvent(evt);
        // }else{
        //   const evt = new Event('hit');
        //   (evt as any).position = PositionOfFace;
        //   (evt as any).position = Snapper.positionToviewport(Snapper.GPUDataLines[offset + 2] - 129,(evt as any).position);
        //   (evt as any).hitType = "face";
        //   window.dispatchEvent(evt);
        // }

        return;
      }
    }

    const evt = new Event('hit');
    (evt as any).position = [];
    (evt as any).hitType = "none";
    window.dispatchEvent(evt);
    
  }

  public static positionToviewport(id,position){
    if(this.viewports[id]){
      let m = new THREE.Matrix4();
      m.makeScale(this.viewports[id].scale.x,this.viewports[id].scale.y,this.viewports[id].scale.z);
      let position_ = new THREE.Vector3().fromArray(position);
      position_.applyMatrix4(m);

      position_.x += this.viewports[id].position.x;
      position_.y += this.viewports[id].position.y;
      position_.z += this.viewports[id].position.z;

      return position_.toArray();
    }else{
      return position;
    }
  }

  public static insert(x_,y_,onceInit?){
    Snapper.needsUpdate = true;

    Snapper.objectUUID[(Snapper.lastObject as any).object.uuid] = (Snapper.lastObject as any).object.uuid;
    
    //------------------------- 鍔犺浇鐐圭疆淇℃伅 -----------------------------
    {
      // console.log("鍔犺浇鐐圭疆淇℃伅");
      // Snapper.PointsScene.clear();
      // Snapper.pointsMap = new Map();
      const position = [];
      const id = [];
      let idBuffer;
      let id2Buffer;

      const entity = (Snapper.lastObject as any).entity?(Snapper.lastObject as any).entity.entity:null;

      if(entity){
        if(entity.geometry && entity.geometry.polygon){
          
          for(let i = 0; i < entity.geometry.polygon.length / 2; i++){
            Snapper.pointsMap[Snapper.tempID]={position:[
              entity.geometry.polygon[i * 2 + 0],
              entity.geometry.polygon[i * 2 + 1],
              (Snapper.lastObject as any).object.matrixWorld.elements[14]
              ]};

            position.push(entity.geometry.polygon[i * 2 + 0]);
            position.push(entity.geometry.polygon[i * 2 + 1]);
            position.push((Snapper.lastObject as any).object.matrixWorld.elements[14]);

            id.push(Snapper.tempID);

            Snapper.tempID++;
          }
        }

        if(entity.geometry && entity.geometry.holes){
          for(let i = 0; i < entity.geometry.holes.length; i++){
            for(let j = 0; j < entity.geometry.holes[i].length / 2; j++){
              Snapper.pointsMap[Snapper.tempID]={position:[
                entity.geometry.holes[i][j * 2 + 0],
                entity.geometry.holes[i][j * 2 + 1],
                (Snapper.lastObject as any).object.matrixWorld.elements[14]
                ]};

              position.push(entity.geometry.holes[i][j * 2 + 0]);
              position.push(entity.geometry.holes[i][j * 2 + 1]);
              position.push((Snapper.lastObject as any).object.matrixWorld.elements[14]);

              id.push(Snapper.tempID);

              Snapper.tempID++;
            }
          }
        }

        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
        pointsGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( id, 1 ) );

        const Points = new THREE.Points(pointsGeometry,Snapper.SnapperMateral);
        Points.frustumCulled = false;
        Snapper.PointsScene.add(Points);
      }else{
        let object = (Snapper.lastObject as any).object;
        if(onceInit){
          idBuffer = new Float32Array(object.geometry.attributes.position.count);
          id2Buffer = new Float32Array(object.geometry.attributes.position.count);
        }
        if(object.type == "LineSegments" || object.type == "Line"){
          for(let i = 0; i < object.geometry.attributes.position.count; i++){
            Snapper.pointsMap[Snapper.tempID]={position:[
              object.geometry.attributes.position.array[i * 3 + 0],
              object.geometry.attributes.position.array[i * 3 + 1],
              0
              ],object:object};

            if(onceInit){
              idBuffer[i] = Snapper.tempID % 10000;
              id2Buffer[i] = Math.floor(Snapper.tempID / 10000);
            }else{
              position.push(object.geometry.attributes.position.array[i * 3 + 0]);
              position.push(object.geometry.attributes.position.array[i * 3 + 1]);
              position.push(0);

              id.push(Snapper.tempID);
            }

            Snapper.tempID++;
          }
        }

        const pointsGeometry = new THREE.BufferGeometry();
        if(onceInit){
          pointsGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( object.geometry.attributes.position.array, 3 ) );
          pointsGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( idBuffer, 1 ) );
          pointsGeometry.setAttribute( 'id2', new THREE.Float32BufferAttribute( id2Buffer, 1 ) );
        }else{
          pointsGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
          pointsGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( id, 1 ) );
        }

        const Points = new THREE.Points(pointsGeometry,Snapper.SnapperMateral);
        Points.frustumCulled = false;
        Snapper.PointsScene.add(Points);
        object.Points = Points;
        
      }
    }
    //------------------------ 鍔犺浇绾挎缃俊鎭?----------------------------
    {
      // console.log("鍔犺浇绾挎缃俊鎭?);
      // Snapper.LinesScene.clear();
      // Snapper.linesMap = new Map();
      const position = [];
      const id = [];
      let idBuffer;
      let id2Buffer;

      const entity = (Snapper.lastObject as any).entity?(Snapper.lastObject as any).entity.entity:null;
      let object = (Snapper.lastObject as any).object;
      if(entity){
        if(entity.geometry && entity.geometry.polygon){
          
          for(let i = 0; i < entity.geometry.polygon.length / 2; i++){
            Snapper.linesMap[Snapper.tempID]=[
                entity.geometry.polygon[i * 2 + 0],
                entity.geometry.polygon[i * 2 + 1],
                (Snapper.lastObject as any).object.matrixWorld.elements[14],
                entity.geometry.polygon[((i + 1) % (entity.geometry.polygon.length / 2)) * 2 + 0],
                entity.geometry.polygon[((i + 1) % (entity.geometry.polygon.length / 2)) * 2 + 1],
                (Snapper.lastObject as any).object.matrixWorld.elements[14]
              ];

            position.push(entity.geometry.polygon[i * 2 + 0]);
            position.push(entity.geometry.polygon[i * 2 + 1]);
            position.push((Snapper.lastObject as any).object.matrixWorld.elements[14]);

            position.push(entity.geometry.polygon[((i + 1) % (entity.geometry.polygon.length / 2)) * 2 + 0]);
            position.push(entity.geometry.polygon[((i + 1) % (entity.geometry.polygon.length / 2)) * 2 + 1]);
            position.push((Snapper.lastObject as any).object.matrixWorld.elements[14]);


            id.push(Snapper.tempID);
            id.push(Snapper.tempID);

            Snapper.tempID++;
          }

          if(entity.geometry && entity.geometry.holes){
            for(let i = 0; i < entity.geometry.holes.length; i++){
              for(let j = 0; j < entity.geometry.holes[i].length / 2; j++){
                Snapper.linesMap[Snapper.tempID]=[
                      entity.geometry.holes[i][j * 2 + 0],
                      entity.geometry.holes[i][j * 2 + 1],
                      (Snapper.lastObject as any).object.matrixWorld.elements[14],
                      entity.geometry.holes[i][((j + 1) % (entity.geometry.holes[i].length / 2)) * 2 + 0],
                      entity.geometry.holes[i][((j + 1) % (entity.geometry.holes[i].length / 2)) * 2 + 1],
                      (Snapper.lastObject as any).object.matrixWorld.elements[14]
                  ];

                position.push(entity.geometry.holes[i][j * 2 + 0]);
                position.push(entity.geometry.holes[i][j * 2 + 1]);
                position.push((Snapper.lastObject as any).object.matrixWorld.elements[14]);

                position.push(entity.geometry.holes[i][((j + 1) % (entity.geometry.holes[i].length / 2)) * 2 + 0]);
                position.push(entity.geometry.holes[i][((j + 1) % (entity.geometry.holes[i].length / 2)) * 2 + 1]);
                position.push((Snapper.lastObject as any).object.matrixWorld.elements[14]);

                id.push(Snapper.tempID);
                id.push(Snapper.tempID);

                Snapper.tempID++;
              }
            }
          }
        }

        const linesGeometry = new THREE.BufferGeometry();
        linesGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
        linesGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( id, 1 ) );

        const Lines = new THREE.LineSegments(linesGeometry,Snapper.SnapperMateral);
        Lines.frustumCulled = false;
        Snapper.LinesScene.add(Lines);
      }else{
        if(object.type == "LineSegments"){
          if(onceInit){
            idBuffer = new Float32Array(object.geometry.attributes.position.count);
            id2Buffer = new Float32Array(object.geometry.attributes.position.count);
          }
          for(let i = 0; i < object.geometry.attributes.position.count / 2; i++){
            Snapper.linesMap[Snapper.tempID]={position:[
                  object.geometry.attributes.position.array[i * 6],
                  object.geometry.attributes.position.array[i * 6 + 1],
                  0,
                  object.geometry.attributes.position.array[i * 6 + 3],
                  object.geometry.attributes.position.array[i * 6 + 4],
                  0
              ],object:object};

            if(onceInit){
              idBuffer[i * 2] = Snapper.tempID % 10000;
              id2Buffer[i * 2] = Math.floor(Snapper.tempID / 10000);
              idBuffer[i * 2 + 1] = Snapper.tempID % 10000;
              id2Buffer[i * 2 + 1] = Math.floor(Snapper.tempID / 10000);
            }else{
              position.push(object.geometry.attributes.position.array[i * 6 + 0]);
              position.push(object.geometry.attributes.position.array[i * 6 + 1]);
              position.push(0);

              position.push(object.geometry.attributes.position.array[i * 6 + 3]);
              position.push(object.geometry.attributes.position.array[i * 6 + 4]);
              position.push(0);

              id.push(Snapper.tempID);
              id.push(Snapper.tempID);
            }

            Snapper.tempID++;
          }
        }

        if(object.type == "Line"){
          for(let i = 0; i < object.geometry.attributes.position.count - 1; i++){
            Snapper.linesMap[Snapper.tempID]={position:[
                  object.geometry.attributes.position.array[i * 3 + 0],
                  object.geometry.attributes.position.array[i * 3 + 1],
                  0,
                  object.geometry.attributes.position.array[i * 3 + 3],
                  object.geometry.attributes.position.array[i * 3 + 4],
                  0
              ],object:object};

            position.push(object.geometry.attributes.position.array[i * 3 + 0]);
            position.push(object.geometry.attributes.position.array[i * 3 + 1]);
            position.push(0);

            position.push(object.geometry.attributes.position.array[i * 3 + 3]);
            position.push(object.geometry.attributes.position.array[i * 3 + 4]);
            position.push(0);

            id.push(Snapper.tempID);
            id.push(Snapper.tempID);

            Snapper.tempID++;
          }
        }
      }

      const linesGeometry = new THREE.BufferGeometry();
      if(onceInit){
        linesGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( object.geometry.attributes.position.array, 3 ) );
        linesGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( idBuffer, 1 ) );
        linesGeometry.setAttribute( 'id2', new THREE.Float32BufferAttribute( id2Buffer, 1 ) );
      }else{
        linesGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
        linesGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( id, 1 ) );
      }

      const Lines = new THREE.LineSegments(linesGeometry,Snapper.SnapperMateral);
      Lines.frustumCulled = false;
      Snapper.LinesScene.add(Lines);
      object.Lines = Lines;
    }
    //-------------------------------------------------------------------

    Snapper.PointsScene.add(Snapper.staticPointsScene);
    Snapper.LinesScene.add(Snapper.staticLinesScene);

    const evt = new Event('hover_update');
    (evt as any).mousePosition = {x:x_,y:y_};
    window.dispatchEvent(evt);
  }

  public static PointToLine(P, line, ) {
    const R = new THREE.Vector3(P.x, P.y, P.z);

    const V0 = new THREE.Vector3(P.x - line.P0.x,P.y - line.P0.y,P.z - line.P0.z);
    const V1 = new THREE.Vector3(line.P1.x - line.P0.x,line.P1.y - line.P0.y,line.P1.z - line.P0.z);
    const angle = V0.angleTo(V1);
    const length =  P.distanceTo(line.P0);
    const dist = Math.sin(angle) * length;
    const dist2 = Math.cos(angle) * length;

    V1.normalize();
    const result = new THREE.Vector3(line.P0.x + V1.x * dist2,line.P0.y + V1.y * dist2,line.P0.z + V1.z * dist2);

    return result;
  }

  static LineToLine(line0, line1) {
    let dir0 = new THREE.Vector3(line0.P1.x - line0.P0.x,line0.P1.y - line0.P0.y,line0.P1.z - line0.P0.z);
    let dir1 = new THREE.Vector3(-dir0.x,-dir0.y,-dir0.z);
    dir0.normalize();
    dir1.normalize();

    const ray0 = { dir: dir0, point: line0.P0};
    const ray1 = { dir: dir1, point: line0.P0};

    let V = new THREE.Vector3(line1.P1.x - line1.P0.x, line1.P1.y - line1.P0.y,line1.P1.z - line1.P0.z);
    V.cross(new THREE.Vector3(0,0,1));
    V.normalize();
    const face = { dir: V, point:line1.P0}

    let t = this.LineToFace(ray0, face);
    if(t !== null) {
      return new THREE.Vector3(
        ray0.point.x + ray0.dir.x * t,
        ray0.point.y + ray0.dir.y * t,
        ray0.point.z + ray0.dir.z * t
        );
    }

    t = this.LineToFace(ray1, face);

    if(t !== null) {
      return new THREE.Vector3(
        ray1.point.x + ray1.dir.x * t,
        ray1.point.y + ray1.dir.y * t,
        ray1.point.z + ray1.dir.z * t
        );
    } else {
      return null;
    }

  }

  static LineToFace(ray,face) {
    ray.dir.normalize();
    face.dir.normalize();
    const nu = ray.dir.dot(face.dir);

    if(nu === 0) {
      return null;
    }

    const t = face.dir.dot(new THREE.Vector3(face.point.x - ray.point.x,face.point.y - ray.point.y,face.point.z - ray.point.z)) / nu;

    if (t >= 0) {
      return t;
    } else {
      return null;
    }
  }

  static LineCrossLine(line0, line1) {
    
    let point = this.LineToLine(line0, line1);

    if( point != null ) {
      let point2 = this.LineToLine(line1, line0);
      return {point:point2, type: 'cross'};
    }

    return null;
  }

  public static setStaticScene(entity){

    Snapper.PointsScene.add(Snapper.staticPointsScene);
    Snapper.LinesScene.add(Snapper.staticLinesScene);

    //------------------------- 鍔犺浇鐐圭疆淇℃伅 -----------------------------
    {
      // console.log("鍔犺浇鐐圭疆淇℃伅");
      // Snapper.staticPointsScene.clear();
      const position = [];
      const id = [];

      if(entity.geometry && entity.geometry.attributes.position){
        
        for(let i = 0; i < entity.geometry.attributes.position.array.length / 3; i++){
          Snapper.staticPointsMap.set(Snapper.staticID,{position:[
            entity.geometry.attributes.position.array[i * 3 + 0],
            entity.geometry.attributes.position.array[i * 3 + 1],
            entity.geometry.attributes.position.array[i * 3 + 2]
            ]});

          position.push(entity.geometry.attributes.position.array[i * 3 + 0]);
          position.push(entity.geometry.attributes.position.array[i * 3 + 1]);
          position.push(entity.geometry.attributes.position.array[i * 3 + 2]);

          id.push(Snapper.staticID);

          Snapper.staticID++;
        }
      }

      const pointsGeometry = new THREE.BufferGeometry();
      pointsGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
      pointsGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( id, 1 ) );

      const Points = new THREE.Points(pointsGeometry,Snapper.SnapperMateral);
      Points.frustumCulled = false;
      Snapper.staticPointsScene.add(Points);
    }
    //------------------------ 鍔犺浇绾挎缃俊鎭?----------------------------
    {
      // console.log("鍔犺浇绾挎缃俊鎭?);
      Snapper.LinesScene.clear();
      const position = [];
      const id = [];
      
      if(entity.geometry && entity.geometry.attributes.position.array){
        
        for(let i = 0; i < entity.geometry.attributes.position.array.length / 6; i++){
          Snapper.staticLinesMap.set(Snapper.staticID,{position:[
            [
              entity.geometry.attributes.position.array[i * 6 + 0],
              entity.geometry.attributes.position.array[i * 6 + 1],
              entity.geometry.attributes.position.array[i * 6 + 2]
            ],[
              entity.geometry.attributes.position.array[i * 6 + 3],
              entity.geometry.attributes.position.array[i * 6 + 4],
              entity.geometry.attributes.position.array[i * 6 + 5]
            ]
            ]});

          position.push(entity.geometry.attributes.position.array[i * 6 + 0]);
          position.push(entity.geometry.attributes.position.array[i * 6 + 1]);
          position.push(entity.geometry.attributes.position.array[i * 6 + 2]);

          position.push(entity.geometry.attributes.position.array[i * 6 + 3]);
          position.push(entity.geometry.attributes.position.array[i * 6 + 4]);
          position.push(entity.geometry.attributes.position.array[i * 6 + 5]);

          

          id.push(Snapper.staticID);
          id.push(Snapper.staticID);

          Snapper.staticID++;
        }
      }

      const linesGeometry = new THREE.BufferGeometry();
      linesGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
      linesGeometry.setAttribute( 'id', new THREE.Float32BufferAttribute( id, 1 ) );

      const Lines = new THREE.LineSegments(linesGeometry,Snapper.SnapperMateral);
      Lines.frustumCulled = false;
      Snapper.staticLinesScene.add(Lines);
    }
    //-------------------------------------------------------------------

    const evt = new Event('hover_update');
    window.dispatchEvent(evt);
  }

  public static setStartPoint(x?,y?,camera?){
    if(x){

      let V = new THREE.Vector3(x / Snapper.GPURenderTarget.width * 2 - 1,((1 - y / Snapper.GPURenderTarget.height) * 2 - 1),0);
      V.unproject(camera);
      V.z = 0;

      Snapper.startPoint = V.clone();
    }else{
      Snapper.startPoint = null;
    }
  }

  private static timer = setInterval(()=>{
    if(Snapper.lastGuideLineBegin){
      Snapper.lastGuideLineCount--;

      if(Snapper.lastGuideLineCount <= 0){

        if(Snapper.lastGuideLineBeginID == Snapper.lastGuideLine){

          let obj = Snapper.linesMap[Snapper.lastGuideLine].position;

          let m = Snapper.linesMap[Snapper.lastGuideLine].object.matrixWorld;
          let point0 = new THREE.Vector3(obj[0],obj[1],obj[2]);
          let point1 = new THREE.Vector3(obj[3],obj[4],obj[5]);
          point0 = point0.applyMatrix4(m);
          point1 = point1.applyMatrix4(m);

          if(this.viewports[0].isDefault)
          obj = [point0.x,point0.y,point0.z,point1.x,point1.y,point1.z];

          if(obj){
            Snapper.lastGuideActiveLine.position = obj;
            let P0 = Snapper.lastGuideActiveLine.position = Snapper.positionToviewport(this.lastViewportId,[obj[0],obj[1],obj[2]]);
            let P1 = Snapper.lastGuideActiveLine.position = Snapper.positionToviewport(this.lastViewportId,[obj[3],obj[4],obj[5]]);
            Snapper.lastGuideActiveLine.position = [P0[0],P0[1],P0[2],P1[0],P1[1],P1[2]];
            // console.log(obj);
            // Snapper.lastGuideActiveLine.position = Snapper.positionToviewport(this.lastViewportId,obj);
          }
          // console.log(Snapper.lastGuideActiveLine);

        }else{
          Snapper.lastGuideLine = -1;
        }

        Snapper.lastGuideLineBegin = false;
        Snapper.lastGuideLineCount = 0;
      }
    }
  },50);

}
