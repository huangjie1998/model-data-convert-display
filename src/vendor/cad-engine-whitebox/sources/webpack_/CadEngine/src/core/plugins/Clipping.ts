import * as THREE from "three";
import { Snapper } from "./Snapper";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";

export class Clipping extends THREE.Object3D {
	public static plane = new THREE.Plane( new THREE.Vector3( - 1,   0,   0 ), 0 );
	public static planeXP = new THREE.Plane( new THREE.Vector3( - 1,   0,   0 ), -5 );
	public static planeXN = new THREE.Plane( new THREE.Vector3(   1,   0,   0 ), 15 );
	public static planeYP = new THREE.Plane( new THREE.Vector3(   0, - 1,   0 ), 0 );
	public static planeYN = new THREE.Plane( new THREE.Vector3(   0,   1,   0 ), 0 );
	public static planeZP = new THREE.Plane( new THREE.Vector3(   0,   0, - 1 ), 0 );
	public static planeZN = new THREE.Plane( new THREE.Vector3(   0,   0,   1 ), 0 );

	public static planeEditMesh = new THREE.Mesh( new THREE.BoxGeometry( 1110.5, 1110.5, 1110.5 ), new THREE.MeshBasicMaterial({color:0xffffff}));
	public static planeXPEditMesh = new THREE.Mesh( new THREE.BoxGeometry( 1110.5, 1110.5, 1110.5 ), new THREE.MeshBasicMaterial({color:0xffffff}));
	public static planeXNEditMesh = new THREE.Mesh( new THREE.BoxGeometry( 1110.5, 1110.5, 1110.5 ), new THREE.MeshBasicMaterial({color:0xffffff}));
	public static planeYPEditMesh = new THREE.Mesh( new THREE.BoxGeometry( 1110.5, 1110.5, 1110.5 ), new THREE.MeshBasicMaterial({color:0xffffff}));
	public static planeYNEditMesh = new THREE.Mesh( new THREE.BoxGeometry( 1110.5, 1110.5, 1110.5 ), new THREE.MeshBasicMaterial({color:0xffffff}));
	public static planeZPEditMesh = new THREE.Mesh( new THREE.BoxGeometry( 1110.5, 1110.5, 1110.5 ), new THREE.MeshBasicMaterial({color:0xffffff}));
	public static planeZNEditMesh = new THREE.Mesh( new THREE.BoxGeometry( 1110.5, 1110.5, 1110.5 ), new THREE.MeshBasicMaterial({color:0xffffff}));

	public static clippingLine = new THREE.LineSegments( new THREE.BufferGeometry().setFromPoints( [new THREE.Vector3(),new THREE.Vector3()] ), new THREE.LineBasicMaterial({color:0x00ffff,depthTest:false}));

	public static planes: THREE.Plane[] = [
		Clipping.planeXP,Clipping.planeXN,
		Clipping.planeYP,Clipping.planeYN,
		Clipping.planeZP,Clipping.planeZN,
		Clipping.plane];
	public static object = new THREE.Group();
	public static planeGeom = new THREE.PlaneGeometry( 4000000, 4000000 );
	public static planeObjects = new THREE.Group();
	private static _planeObjectsStatue = Clipping.planeObjects.visible = false;
	private static clipMode = "box";
	public static enable = true;
	public static editEnable = false;
	public static editing = false;
	public static control;
	public static dragging = false;
	public static sceneBBox;
	private static count = 0;
	private static position0 = new THREE.Vector3();
	private static position1 = new THREE.Vector3();

	public static drawLine(){
		Clipping.editing = true;
		Clipping.count = 0;
		Clipping.resetPlaneMesh(Clipping.sceneBBox);
	}

	public static initialize(scene){

		Clipping.planeEditMesh.name = "controlOBj";
		Clipping.planeXPEditMesh.name = "controlOBj";
		Clipping.planeXNEditMesh.name = "controlOBj";
		Clipping.planeYPEditMesh.name = "controlOBj";
		Clipping.planeYNEditMesh.name = "controlOBj";
		Clipping.planeZPEditMesh.name = "controlOBj";
		Clipping.planeZNEditMesh.name = "controlOBj";

		Clipping.planeEditMesh.visible = false;
		Clipping.planeXPEditMesh.visible = false;
		Clipping.planeXNEditMesh.visible = false;
		Clipping.planeYPEditMesh.visible = false;
		Clipping.planeYNEditMesh.visible = false;
		Clipping.planeZPEditMesh.visible = false;
		Clipping.planeZNEditMesh.visible = false;

		Clipping.clippingLine.renderOrder = 100001;

		scene.add(Clipping.object);
    	scene.add(Clipping.planeObjects);

    	Clipping.clippingLine.visible = false;


    	Clipping.control = new TransformControls( scene._camera, scene._renderer.domElement );
    	Clipping.control.setMode( "translate" );

    	Clipping.control.showY = ! Clipping.control.showY;
    	Clipping.control.showZ = ! Clipping.control.showZ;

    	Clipping.control.setSpace("local");
    	Clipping.control.addEventListener( 'change', Clipping.onTransformChanged );

    	Snapper.register(Clipping.planeEditMesh ,0);
    	Snapper.register(Clipping.planeXPEditMesh ,0);
    	Snapper.register(Clipping.planeXNEditMesh ,0);
    	Snapper.register(Clipping.planeYPEditMesh ,0);
    	Snapper.register(Clipping.planeYNEditMesh ,0);
    	Snapper.register(Clipping.planeZPEditMesh ,0);
    	Snapper.register(Clipping.planeZNEditMesh ,0);

    	Clipping.planeXNEditMesh.rotateY(Math.PI);

    	Clipping.planeYPEditMesh.rotateZ(Math.PI / 2);
    	Clipping.planeYNEditMesh.rotateZ(-Math.PI / 2);

    	Clipping.planeZPEditMesh.rotateY(-Math.PI / 2);
    	Clipping.planeZNEditMesh.rotateY(Math.PI / 2);

    	Snapper.SnapperMateral.clippingPlanes = Clipping.planes;
    	Snapper.SnapperMateral.clipping = true;
    	// console.log(Clipping.control);

    	// Clipping.control.attach( Clipping.planeXPEditMesh );
	}

	public static onPointerUp = (position) => {
		if(position){
			if(Clipping.count == 1){
				Clipping.count = 0;
				Clipping.editing = false;
				Clipping.position1.copy(position);
				Clipping.clippingLine.visible = false;


				if(Clipping.editEnable){
					Clipping.planeEditMesh.visible = true;

					Clipping.planeEditMesh.position.x = (Clipping.position0.x + Clipping.position1.x) / 2;
					Clipping.planeEditMesh.position.y = (Clipping.position0.y + Clipping.position1.y) / 2;

					Clipping.planeEditMesh.position.z = (Clipping.planeYPEditMesh.position.z + Clipping.planeYNEditMesh.position.z) / 2;
					// Clipping.planeEditMesh.position.y = (Clipping.planeYPEditMesh.position.y + Clipping.planeYNEditMesh.position.y) / 2;

					//-------------------------- 计算角度 ------------------------------

					let dir = new THREE.Vector3(Clipping.position1.x - Clipping.position0.x,Clipping.position1.y - Clipping.position0.y,0);
					dir.normalize();

					let normal = dir.clone()
					normal.cross(new THREE.Vector3(0,0,1));
					normal.normalize();
					Clipping.plane.normal.copy(normal);

					let dir2D = new THREE.Vector2(normal.x,normal.y);

					let angle = dir2D.angle();
					// console.log(angle * 180 / Math.PI);

					Clipping.planeEditMesh.rotation.z = Math.PI + angle;

					// t = (n * (P1 - P0)) / (n*u)    n:平面法相 u:射线法相 	P0:射线起点  P1:平面上某一点

					let t = (normal.clone().dot( (new THREE.Vector3()).sub(Clipping.planeEditMesh.position) ) ) / (normal.clone().dot(normal.clone()));
					// t = Math.abs(t);
					// console.log(t)

					Clipping.plane.constant = t;

					//-----------------------------------------------------------------

					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length == 6){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
			}

			if(Clipping.count == 0){
				Clipping.position0.copy(position);
				Clipping.count = 1;
			}
		}
	}

	public static onPointerMove = (position) => {
		if(position){
			if(Clipping.count == 1){
				Clipping.clippingLine.visible = true;
				Clipping.position1.copy(position);

				(Clipping.clippingLine.geometry.attributes.position as any).array[0] = Clipping.position0.x;
				(Clipping.clippingLine.geometry.attributes.position as any).array[1] = Clipping.position0.y;
				(Clipping.clippingLine.geometry.attributes.position as any).array[2] = Clipping.position0.z;

				(Clipping.clippingLine.geometry.attributes.position as any).array[3] = Clipping.position1.x;
				(Clipping.clippingLine.geometry.attributes.position as any).array[4] = Clipping.position1.y;
				(Clipping.clippingLine.geometry.attributes.position as any).array[5] = Clipping.position1.z;

				Clipping.clippingLine.geometry.attributes.position.needsUpdate = true;
			}
		}
	}

	public static attach(Mesh){
		if(Clipping.dragging == false)
		if(Mesh)
		// if(Clipping.type == "box"){
		{	
			if(Mesh.uuid == Clipping.planeEditMesh.uuid){Clipping.control.attach( Clipping.planeEditMesh );return;}

			if(Mesh.uuid == Clipping.planeXPEditMesh.uuid){Clipping.control.attach( Clipping.planeXPEditMesh );return;}
			if(Mesh.uuid == Clipping.planeXNEditMesh.uuid){Clipping.control.attach( Clipping.planeXNEditMesh );return;}

			if(Mesh.uuid == Clipping.planeYPEditMesh.uuid){Clipping.control.attach( Clipping.planeYPEditMesh );return;}
			if(Mesh.uuid == Clipping.planeYNEditMesh.uuid){Clipping.control.attach( Clipping.planeYNEditMesh );return;}

			if(Mesh.uuid == Clipping.planeZPEditMesh.uuid){Clipping.control.attach( Clipping.planeZPEditMesh );return;}
			if(Mesh.uuid == Clipping.planeZNEditMesh.uuid){Clipping.control.attach( Clipping.planeZNEditMesh );return;}
		}
		// Clipping.control.detach();return;
	}

	public static onTransformChanged(){

		if(Clipping.planeXPEditMesh.position.x > Clipping.sceneBBox.max.x + (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001) {Clipping.planeXPEditMesh.position.x = Clipping.sceneBBox.max.x + (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001;}
		if(Clipping.planeXPEditMesh.position.x < Clipping.sceneBBox.min.x - (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001) {Clipping.planeXPEditMesh.position.x = Clipping.sceneBBox.min.x - (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001;}
		if(Clipping.planeXNEditMesh.position.x > Clipping.sceneBBox.max.x + (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001) {Clipping.planeXNEditMesh.position.x = Clipping.sceneBBox.max.x + (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001;}
		if(Clipping.planeXNEditMesh.position.x < Clipping.sceneBBox.min.x - (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001) {Clipping.planeXNEditMesh.position.x = Clipping.sceneBBox.min.x - (Clipping.sceneBBox.max.x - Clipping.sceneBBox.min.x) * 0.001;}

		if(Clipping.planeYPEditMesh.position.y > Clipping.sceneBBox.max.y + (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001) {Clipping.planeYPEditMesh.position.y = Clipping.sceneBBox.max.y + (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001;}
		if(Clipping.planeYPEditMesh.position.y < Clipping.sceneBBox.min.y - (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001) {Clipping.planeYPEditMesh.position.y = Clipping.sceneBBox.min.y - (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001;}
		if(Clipping.planeYNEditMesh.position.y > Clipping.sceneBBox.max.y + (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001) {Clipping.planeYNEditMesh.position.y = Clipping.sceneBBox.max.y + (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001;}
		if(Clipping.planeYNEditMesh.position.y < Clipping.sceneBBox.min.y - (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001) {Clipping.planeYNEditMesh.position.y = Clipping.sceneBBox.min.y - (Clipping.sceneBBox.max.y - Clipping.sceneBBox.min.y) * 0.001;}

		if(Clipping.planeZPEditMesh.position.z > Clipping.sceneBBox.max.z + (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001) {Clipping.planeZPEditMesh.position.z = Clipping.sceneBBox.max.z + (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001;}
		if(Clipping.planeZPEditMesh.position.z < Clipping.sceneBBox.min.z - (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001) {Clipping.planeZPEditMesh.position.z = Clipping.sceneBBox.min.z - (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001;}
		if(Clipping.planeZNEditMesh.position.z > Clipping.sceneBBox.max.z + (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001) {Clipping.planeZNEditMesh.position.z = Clipping.sceneBBox.max.z + (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001;}
		if(Clipping.planeZNEditMesh.position.z < Clipping.sceneBBox.min.z - (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001) {Clipping.planeZNEditMesh.position.z = Clipping.sceneBBox.min.z - (Clipping.sceneBBox.max.z - Clipping.sceneBBox.min.z) * 0.001;}


		Clipping.planeXP.constant = Clipping.planeXPEditMesh.position.x;
		Clipping.planeXN.constant = -Clipping.planeXNEditMesh.position.x;

		Clipping.planeYP.constant = Clipping.planeYPEditMesh.position.y;
		Clipping.planeYN.constant = -Clipping.planeYNEditMesh.position.y;

		Clipping.planeZP.constant = Clipping.planeZPEditMesh.position.z;
		Clipping.planeZN.constant = -Clipping.planeZNEditMesh.position.z;

		Clipping.planeEditMesh.position.z = (Clipping.planeYPEditMesh.position.z + Clipping.planeYNEditMesh.position.z) / 2;
		// Clipping.planeEditMesh.position.y = (Clipping.planeYPEditMesh.position.y + Clipping.planeYNEditMesh.position.y) / 2;


		Clipping.planeYPEditMesh.position.x = (Clipping.planeXPEditMesh.position.x + Clipping.planeXNEditMesh.position.x) / 2;
		Clipping.planeYNEditMesh.position.x = (Clipping.planeXPEditMesh.position.x + Clipping.planeXNEditMesh.position.x) / 2;
		Clipping.planeZPEditMesh.position.x = (Clipping.planeXPEditMesh.position.x + Clipping.planeXNEditMesh.position.x) / 2;
		Clipping.planeZNEditMesh.position.x = (Clipping.planeXPEditMesh.position.x + Clipping.planeXNEditMesh.position.x) / 2;

		Clipping.planeXPEditMesh.position.y = (Clipping.planeYPEditMesh.position.y + Clipping.planeYNEditMesh.position.y) / 2;
		Clipping.planeXNEditMesh.position.y = (Clipping.planeYPEditMesh.position.y + Clipping.planeYNEditMesh.position.y) / 2;
		Clipping.planeZPEditMesh.position.y = (Clipping.planeYPEditMesh.position.y + Clipping.planeYNEditMesh.position.y) / 2;
		Clipping.planeZNEditMesh.position.y = (Clipping.planeYPEditMesh.position.y + Clipping.planeYNEditMesh.position.y) / 2;

		Clipping.planeXPEditMesh.position.z = (Clipping.planeZPEditMesh.position.z + Clipping.planeZNEditMesh.position.z) / 2;
		Clipping.planeXNEditMesh.position.z = (Clipping.planeZPEditMesh.position.z + Clipping.planeZNEditMesh.position.z) / 2;
		Clipping.planeYPEditMesh.position.z = (Clipping.planeZPEditMesh.position.z + Clipping.planeZNEditMesh.position.z) / 2;
		Clipping.planeYNEditMesh.position.z = (Clipping.planeZPEditMesh.position.z + Clipping.planeZNEditMesh.position.z) / 2;

		let normal = Clipping.plane.normal.clone();
		let t = (normal.clone().dot( (new THREE.Vector3()).sub(Clipping.planeEditMesh.position) ) ) / (normal.clone().dot(normal.clone()));
		Clipping.plane.constant = t;


		for ( let i = 0; i < Clipping.planeObjects.children.length; i ++ ) {

			const plane = Clipping.planes[ i %  Clipping.planes.length];
			const po = Clipping.planeObjects.children[ i ];

			plane.coplanarPoint( po.position );
			po.lookAt(
				po.position.x - plane.normal.x,
				po.position.y - plane.normal.y,
				po.position.z - plane.normal.z,
			);

		}

		const evt = new Event('hover_update');
        window.dispatchEvent(evt);
	}

	public static setClipMode(mode,position0?,position1?){
		console.log(mode);

		Clipping.resetPlaneMesh(Clipping.sceneBBox);

		Clipping.clipMode = mode;
		Clipping.planeEditMesh.visible = false;
		Clipping.planeXPEditMesh.visible = false;
		Clipping.planeXNEditMesh.visible = false;
		Clipping.planeYPEditMesh.visible = false;
		Clipping.planeYNEditMesh.visible = false;
		Clipping.planeZPEditMesh.visible = false;
		Clipping.planeZNEditMesh.visible = false;

		for(let i = 0;i < Clipping.planeObjects.children.length;i++){
			Clipping.planeObjects.children[i].visible = false;
		}

		switch (mode) {
			case "box":
				if(Clipping.editEnable){
					Clipping.planeXPEditMesh.visible = true;
					Clipping.planeXNEditMesh.visible = true;
					Clipping.planeYPEditMesh.visible = true;
					Clipping.planeYNEditMesh.visible = true;
					Clipping.planeZPEditMesh.visible = true;
					Clipping.planeZNEditMesh.visible = true;

					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length != 6){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
				break;

			case "XP":
				if(Clipping.editEnable){
					Clipping.planeXPEditMesh.visible = true;
					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length == 0){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
				break;
			case "XN":
				if(Clipping.editEnable){
					Clipping.planeXNEditMesh.visible = true;
					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length == 1){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
				break;
			case "YP":
				if(Clipping.editEnable){
					Clipping.planeYPEditMesh.visible = true;
					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length == 2){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
				break;
			case "YN":
				if(Clipping.editEnable){
					Clipping.planeYNEditMesh.visible = true;
					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length == 3){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
				break;
			case "ZP":
				if(Clipping.editEnable){
					Clipping.planeZPEditMesh.visible = true;
					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length == 4){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
				break;
			case "ZN":
				if(Clipping.editEnable){
					Clipping.planeZNEditMesh.visible = true;
					for(let i = 0;i < Clipping.planeObjects.children.length;i++){
						if(i % Clipping.planes.length == 5){
							Clipping.planeObjects.children[i].visible = true;
						}
					}
				}
				break;
			
			case "line":
				// if(Clipping.editEnable){
				// 	Clipping.planeEditMesh.visible = true;
				// 	for(let i = 0;i < Clipping.planeObjects.children.length;i++){
				// 		if(i % Clipping.planes.length == 6){
				// 			Clipping.planeObjects.children[i].visible = true;
				// 		}
				// 	}
				// }
				if(Clipping.editEnable){
					Clipping.drawLine();
				}
				break;

			default:
				
				break;
		}

		Clipping.control.detach();

		const evt = new Event('hover_update');
        window.dispatchEvent(evt);
	}

	public static setClipEditEnabled(value){
		if(Clipping.enable){
			Clipping.editEnable = value;
			if(value){
				Clipping.setClipMode(Clipping.clipMode);
			}else{

				Clipping.planeEditMesh.visible = false;
				Clipping.planeXPEditMesh.visible = false;
				Clipping.planeXNEditMesh.visible = false;
				Clipping.planeYPEditMesh.visible = false;
				Clipping.planeYNEditMesh.visible = false;
				Clipping.planeZPEditMesh.visible = false;
				Clipping.planeZNEditMesh.visible = false;

				Clipping.control.detach();

				for(let i = 0;i < Clipping.planeObjects.children.length;i++){
					Clipping.planeObjects.children[i].visible = false;
				}
			}
		}
	}

	public static createPlaneStencilGroup( geometry, plane, renderOrder ){
		const group = new THREE.Group();
		const baseMat = new THREE.MeshBasicMaterial();
		baseMat.depthWrite = false;
		baseMat.depthTest = false;
		baseMat.colorWrite = false;
		baseMat.stencilWrite = true;
		baseMat.stencilFunc = THREE.AlwaysStencilFunc;

		// back faces
		const mat0 = baseMat.clone();
		mat0.side = THREE.BackSide;
		mat0.clippingPlanes = [ plane ];
		mat0.stencilFail = THREE.IncrementWrapStencilOp;
		mat0.stencilZFail = THREE.IncrementWrapStencilOp;
		mat0.stencilZPass = THREE.IncrementWrapStencilOp;

		const mesh0 = new THREE.Mesh( geometry, mat0 );
		mesh0.renderOrder = renderOrder;
		group.add( mesh0 );

		// front faces
		const mat1 = baseMat.clone();
		mat1.side = THREE.FrontSide;
		mat1.clippingPlanes = [ plane ];
		mat1.stencilFail = THREE.DecrementWrapStencilOp;
		mat1.stencilZFail = THREE.DecrementWrapStencilOp;
		mat1.stencilZPass = THREE.DecrementWrapStencilOp;

		const mesh1 = new THREE.Mesh( geometry, mat1 );
		mesh1.renderOrder = renderOrder;

		group.add( mesh1 );

		return group;
	}

	public static createPlaneMesh(node){
		((node as THREE.Mesh).material as THREE.Material).clippingPlanes = Clipping.planes;
      	// ((node as THREE.Mesh).material as THREE.Material).clipShadows = true;
      	((node as THREE.Mesh).material as THREE.Material).shadowSide = THREE.DoubleSide;
      	(node as THREE.Mesh).renderOrder = 6;

	      for(let i = 0; i < Clipping.planes.length;i++){
	        const plane = Clipping.planes[ i ];
	        // const stencilGroup = Clipping.addPlaneStencilGroup( (node as THREE.Mesh).geometry, plane, i + 1 );

	        // plane is clipped by the other clipping planes
	        const planeMat =
	          // new THREE.ShaderMaterial({
	          // vertexShader: `
	          // void main() {
	          //   gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	          // }
	          // `,
	          // fragmentShader: `
	          // void main() {
	          //   // if(mod(abs(gl_FragCoord.y -  gl_FragCoord.x),10.0) < 1.0){
	          //   //   gl_FragColor = vec4(0., 0., 0.,1.0); // 填充线
	          //   // }else{
	          //   //   if(gl_FragColor.a != 2.0)
	          //   //   gl_FragColor = vec4(0.9,0.9,0.9,1.0); // 填充色
	          //   // }
	          //   gl_FragColor = vec4(0.9,0.9,0.9,0.05);
	          // }
	          // `,
	          new THREE.MeshStandardMaterial( {

	            color: 0xffffff,
	            opacity: 0.01,
	            metalness: 0.1,
	            roughness: 0.75,
	            // side:THREE.DoubleSide,
	            clippingPlanes: Clipping.planes.filter( p => p !== plane ),

	            transparent:true,
	            stencilWrite: true,
	            stencilRef: 0,
	            // stencilFunc: THREE.NotEqualStencilFunc,
	            stencilFail: THREE.ReplaceStencilOp,
	            stencilZFail: THREE.ReplaceStencilOp,
	            stencilZPass: THREE.ReplaceStencilOp,

	          } );
	        const po = new THREE.Mesh( Clipping.planeGeom, planeMat );
	        po.visible = false;
	        po.name = "sign";

	        po.onAfterRender = ( renderer )=> {

	          renderer.clearStencil();

	        };

	        po.renderOrder = i + 1.1;

	        // Clipping.object.add(stencilGroup);
	        Clipping.planeObjects.add( po );
	        // this.add( poGroup );
	      }
	}

	public static resetPlaneMesh(sceneBBox){

		Clipping.plane.constant = sceneBBox.max.x + (sceneBBox.max.x - sceneBBox.min.x) * 0.201;
		Clipping.plane.normal.fromArray([-1,0,0]);

		Clipping.planeXP.constant = sceneBBox.max.x + (sceneBBox.max.x - sceneBBox.min.x) * 0.001;
		Clipping.planeXN.constant = - sceneBBox.min.x + (sceneBBox.max.x - sceneBBox.min.x) * 0.001;

		Clipping.planeYP.constant = sceneBBox.max.y + (sceneBBox.max.y - sceneBBox.min.y) * 0.001;
		Clipping.planeYN.constant = - sceneBBox.min.y + (sceneBBox.max.y - sceneBBox.min.y) * 0.001;

		Clipping.planeZP.constant = sceneBBox.max.z + (sceneBBox.max.z - sceneBBox.min.z) * 0.001;
		Clipping.planeZN.constant = - sceneBBox.min.z + (sceneBBox.max.z - sceneBBox.min.z) * 0.001;

		let center = new THREE.Vector3(
			(sceneBBox.max.x + sceneBBox.min.x) / 2,
			(sceneBBox.max.y + sceneBBox.min.y) / 2,
			(sceneBBox.max.z + sceneBBox.min.z) / 2,
			);

		Clipping.planeEditMesh.position.copy(center);
		Clipping.planeEditMesh.position.x = Clipping.planeXP.constant;

		Clipping.planeXPEditMesh.position.copy(center);
		Clipping.planeXPEditMesh.position.x = Clipping.planeXP.constant;

		Clipping.planeXNEditMesh.position.copy(center);
		Clipping.planeXNEditMesh.position.x = -Clipping.planeXN.constant;

		Clipping.planeYPEditMesh.position.copy(center);
		Clipping.planeYPEditMesh.position.y = Clipping.planeYP.constant;

		Clipping.planeYNEditMesh.position.copy(center);
		Clipping.planeYNEditMesh.position.y = -Clipping.planeYN.constant;

		Clipping.planeZPEditMesh.position.copy(center);
		Clipping.planeZPEditMesh.position.z = Clipping.planeZP.constant;

		Clipping.planeZNEditMesh.position.copy(center);
		Clipping.planeZNEditMesh.position.z = -Clipping.planeZN.constant;

		for ( let i = 0; i < Clipping.planeObjects.children.length; i ++ ) {

			const plane = Clipping.planes[ i %  Clipping.planes.length];
			const po = Clipping.planeObjects.children[ i ];

			plane.coplanarPoint( po.position );
			po.lookAt(
				po.position.x - plane.normal.x,
				po.position.y - plane.normal.y,
				po.position.z - plane.normal.z,
			);

		}
	}

	public static resetForScene(sceneBBox,scene){

		Clipping.sceneBBox = sceneBBox;

		scene.add(Clipping.planeEditMesh);
		scene.add(Clipping.planeXPEditMesh);
		scene.add(Clipping.planeXNEditMesh);
		scene.add(Clipping.planeYPEditMesh);
		scene.add(Clipping.planeYNEditMesh);
		scene.add(Clipping.planeZPEditMesh);
		scene.add(Clipping.planeZNEditMesh);

		// console.log(Clipping.clippingLine);
		scene.add(Clipping.clippingLine);

		Clipping.setClipMode(Clipping.clipMode);
	}

	public static getClippingParams(){
		let object: any = {};
		object.type = Clipping.clipMode;
		object.plane = {normal:Clipping.plane.normal.toArray(),constant:Clipping.plane.constant};

		object.planeXP = {normal:Clipping.planeXP.normal.toArray(),constant:Clipping.planeXP.constant};
		object.planeXN = {normal:Clipping.planeXN.normal.toArray(),constant:Clipping.planeXN.constant};

		object.planeYP = {normal:Clipping.planeYP.normal.toArray(),constant:Clipping.planeYP.constant};
		object.planeYN = {normal:Clipping.planeYN.normal.toArray(),constant:Clipping.planeYN.constant};

		object.planeZP = {normal:Clipping.planeZP.normal.toArray(),constant:Clipping.planeZP.constant};
		object.planeZN = {normal:Clipping.planeZN.normal.toArray(),constant:Clipping.planeZN.constant};

		object.planeEditMesh = Clipping.planeEditMesh.position.toArray();

		object.planeXPEditMesh = Clipping.planeXPEditMesh.position.toArray();
		object.planeXNEditMesh = Clipping.planeXNEditMesh.position.toArray();

		object.planeYPEditMesh = Clipping.planeYPEditMesh.position.toArray();
		object.planeYNEditMesh = Clipping.planeYNEditMesh.position.toArray();

		object.planeZPEditMesh = Clipping.planeZPEditMesh.position.toArray();
		object.planeZNEditMesh = Clipping.planeZNEditMesh.position.toArray();

		return object;
	}

	public static applyClippingParams(para){

		Clipping.clipMode = para.type;
		Clipping.control.detach();

		if(para.type != "line"){
			Clipping.setClipMode(Clipping.clipMode);
		}else{

			Clipping.resetPlaneMesh(Clipping.sceneBBox);

			Clipping.editing = false;
			Clipping.clippingLine.visible = false;

			Clipping.planeEditMesh.visible = false;
			Clipping.planeXPEditMesh.visible = false;
			Clipping.planeXNEditMesh.visible = false;
			Clipping.planeYPEditMesh.visible = false;
			Clipping.planeYNEditMesh.visible = false;
			Clipping.planeZPEditMesh.visible = false;
			Clipping.planeZNEditMesh.visible = false;

			for(let i = 0;i < Clipping.planeObjects.children.length;i++){
				Clipping.planeObjects.children[i].visible = false;
			}

			Clipping.planeEditMesh.visible = true;
			for(let i = 0;i < Clipping.planeObjects.children.length;i++){
				if(i % Clipping.planes.length == 6){
					Clipping.planeObjects.children[i].visible = true;
				}
			}

			let dir2D = new THREE.Vector2(para.plane.normal[0],para.plane.normal[2]);

			let angle = dir2D.angle();
			// console.log(angle * 180 / Math.PI);

			Clipping.planeEditMesh.rotation.y = Math.PI - angle;
		}
		
		Clipping.plane.normal.fromArray(para.plane.normal)
		Clipping.plane.constant = para.plane.constant;

		Clipping.planeXP.normal.fromArray(para.planeXP.normal);
		Clipping.planeXN.normal.fromArray(para.planeXN.normal);
		Clipping.planeYP.normal.fromArray(para.planeYP.normal);
		Clipping.planeYN.normal.fromArray(para.planeYN.normal);
		Clipping.planeZP.normal.fromArray(para.planeZP.normal);
		Clipping.planeZN.normal.fromArray(para.planeZN.normal);

		Clipping.planeXP.constant = para.planeXP.constant;
		Clipping.planeXN.constant = para.planeXN.constant;
		Clipping.planeYP.constant = para.planeYP.constant;
		Clipping.planeYN.constant = para.planeYN.constant;
		Clipping.planeZP.constant = para.planeZP.constant;
		Clipping.planeZN.constant = para.planeZN.constant;

		

		Clipping.planeEditMesh.position.fromArray(para.planeEditMesh);

		Clipping.planeXPEditMesh.position.fromArray(para.planeXPEditMesh);
		Clipping.planeXNEditMesh.position.fromArray(para.planeXNEditMesh);

		Clipping.planeYPEditMesh.position.fromArray(para.planeYPEditMesh);
		Clipping.planeYNEditMesh.position.fromArray(para.planeYNEditMesh);

		Clipping.planeZPEditMesh.position.fromArray(para.planeZPEditMesh);
		Clipping.planeZNEditMesh.position.fromArray(para.planeZNEditMesh);

		Clipping.onTransformChanged();

		const evt = new Event('hover_update');
        window.dispatchEvent(evt);

	}

	// Legacy aliases kept for compatibility with existing runtime callers.
	public static init(scene){
		return Clipping.initialize(scene);
	}

	public static change(){
		return Clipping.onTransformChanged();
	}

	public static ClippingType(type,position0?,position1?){
		return Clipping.setClipMode(type, position0, position1);
	}

	public static ClippingEdit(value){
		return Clipping.setClipEditEnabled(value);
	}

	public static addPlaneStencilGroup(geometry, plane, renderOrder){
		return Clipping.createPlaneStencilGroup(geometry, plane, renderOrder);
	}

	public static reset(sceneBBox,scene){
		return Clipping.resetForScene(sceneBBox, scene);
	}

	public static getClippingPara(){
		return Clipping.getClippingParams();
	}

	public static setClippingPara(para){
		return Clipping.applyClippingParams(para);
	}

	constructor(){
		super();
	}
}
