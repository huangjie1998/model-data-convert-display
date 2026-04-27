import * as THREE from "three";
import { OrthographicCamera, Vector2 } from "three";
import {CombinedCamera} from "../core/camera/CombinedCamera";

export interface IPoint {
  x: number;
  y: number;
}

export interface IPoint3 {
  x: number;
  y: number;
  z: number;
}

export class MathUtils {
  static readonly TOLERANCE: number = 0.00001;

  static getCameraLookDir(camera: CombinedCamera) {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(camera.quaternion);
    return dir;
  }

  static zoomBBox(camera: CombinedCamera, cameraTarget: THREE.Vector3, bbox: THREE.Box3, width: number, height: number, scale: number) {
    const bboxSphere = new THREE.Sphere();
    bbox.getBoundingSphere(bboxSphere);
    const { center, radius } = bboxSphere;
    const viewDirection = this.getCameraLookDir(camera);

    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distToCenter = radius / Math.sin(halfFov);
    const sphereBasedPosition = new THREE.Vector3().subVectors(center, viewDirection.clone().setLength(distToCenter));

    const dest = {
      position: sphereBasedPosition.clone(),
      target: cameraTarget.clone(),
      zoom: camera.zoom
    };

    if (camera.isPerspectiveCamera) {
      // ortho planes
      const right = new THREE.Vector3().crossVectors(viewDirection, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, viewDirection).normalize();
      const verticalPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(right, sphereBasedPosition);
      const horizontalPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(up, sphereBasedPosition);

      const vertices = [
        new THREE.Vector3().copy(bbox.min),
        new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
        new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
        new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
        new THREE.Vector3().copy(bbox.max),
        new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
        new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
        new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z)
      ];

      let maxHeight = 0;
      let maxDistPerHeight = 0;
      let maxWidth = 0;
      let maxDistPerWidth = 0;
      const _vert = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        const vertex = vertices[i];
        const dist = Math.abs(_vert.subVectors(vertex, sphereBasedPosition).dot(viewDirection));
        const horizontalHeight = Math.abs(horizontalPlane.distanceToPoint(vertex));
        const horizontalWidth = horizontalHeight * camera.aspect;
        const verticalWidth = Math.abs(verticalPlane.distanceToPoint(vertex));
        const verticalHeight = verticalWidth / camera.aspect;

        const height = Math.max(horizontalHeight, verticalHeight);
        const width = Math.max(horizontalWidth, verticalWidth);

        if (!maxHeight || !maxDistPerHeight || height > (maxHeight * dist) / maxDistPerHeight) {
          maxHeight = height;
          maxDistPerHeight = dist;
        }

        if (!maxWidth || !maxDistPerWidth || width > (maxWidth * dist) / maxDistPerWidth) {
          maxWidth = width;
          maxDistPerWidth = dist;
        }
      }
      let boxBasedDist = maxHeight / Math.tan(halfFov) + (distToCenter - maxDistPerHeight);
      if (camera.aspect < 1) {
        boxBasedDist = maxWidth / Math.tan(halfFov) + (distToCenter - maxDistPerWidth);
      }
      dest.position.subVectors(center, viewDirection.clone().setLength(boxBasedDist * scale));
    } else {
      dest.position.z = camera.position.z; // z轴不变，以防止z坐标太低导致部分几何不可见
      camera.position.copy(sphereBasedPosition);
      camera.updateMatrixWorld();
      camera.zoom = 1;
      camera.updateProjectionMatrix();

      const projectedVertices = [
        new THREE.Vector3().copy(bbox.min),
        new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
        new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
        new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
        new THREE.Vector3().copy(bbox.max),
        new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
        new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
        new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z)
      ].map((v) => v.project(camera));

      projectedVertices.sort((a, b) => a.y - b.y);
      const pDiameterAcrossY = projectedVertices[projectedVertices.length - 1].y - projectedVertices[0].y;

      projectedVertices.sort((a, b) => a.x - b.x);
      const pDiameterAcrossX = projectedVertices[projectedVertices.length - 1].x - projectedVertices[0].x;

      const pDiameterAcross = Math.max(pDiameterAcrossX, pDiameterAcrossY);
      console.assert(!(isNaN(pDiameterAcross) || pDiameterAcross < MathUtils.TOLERANCE), "bad pDiameterAcross");
      dest.zoom = 1 / Math.abs(pDiameterAcross) / scale;
    }

    dest.target.copy(center);
    return dest;
  }

  static zoomFitScene(camera: CombinedCamera, target: THREE.Vector3, sceneBoundingBox: THREE.Box3, width: number, height: number, scale: number) {
    if (sceneBoundingBox !== null) {
      const dest = this.zoomBBox(camera, target, sceneBoundingBox, width, height, scale);
      camera.position.copy(dest.position);
      target.copy(dest.target);
      if (camera.zoom !== dest.zoom) {
        camera.setZoom(dest.zoom);
      }
    }
  }

  static zoomFitScene2D(camera: OrthographicCamera, sceneBoundingBox: THREE.Box3, scale: number, z?: number) {
    if (z !== undefined) camera.position.z = z;
    const center = new THREE.Vector3();
    sceneBoundingBox.getCenter(center);
    camera.position.x = center.x;
    camera.position.y = center.y;
    camera.zoom =
      Math.min((camera.right - camera.left) / (sceneBoundingBox.max.x - sceneBoundingBox.min.x), (camera.top - camera.bottom) / (sceneBoundingBox.max.y - sceneBoundingBox.min.y)) *
      scale;
  }

  static v2Rotate(origin: THREE.Vector3, center: THREE.Vector3, angle: number) {
    const v2Origin = new THREE.Vector2(origin.x, origin.y);
    const v2Center = new THREE.Vector2(center.x, center.y);
    const v2Rotate = v2Origin.rotateAround(v2Center, angle);
    const rotateP = new THREE.Vector3(v2Rotate.x, v2Rotate.y, origin.z);
    return rotateP;
  }

  static intersectsBox(box1, box2) {
    // using 4 splitting planes to rule out intersections
    return box1.max.x < box2.min.x || box1.min.x > box2.max.x || box1.max.y < box2.min.y || box1.min.y > box2.max.y ? false : true;
  }

  static isNumberEqual(a: number, b: number, tolerance = this.TOLERANCE): boolean {
    return Math.abs(a - b) < tolerance;
  }

  static lessEqual(a: number, b: number, tolerance: number = this.TOLERANCE): boolean {
    return a < b || this.isNumberEqual(a, b, tolerance);
  }

  static isPointEqual(p1: IPoint, p2: IPoint, tolerance: number = this.TOLERANCE): boolean {
    return this.isNumberEqual(p1.x, p2.x, tolerance) && this.isNumberEqual(p1.y, p2.y, tolerance);
  }

  /**
   * 判断点是否在直线上
   */
  static isPointOnLine(startPoint: IPoint, stopPoint: IPoint, p: IPoint): boolean {
    return this.isNumberEqual((startPoint.x - p.x) * (stopPoint.y - p.y) - (stopPoint.x - p.x) * (startPoint.y - p.y), 0);
  }

  // 点是否在线段内， 不包括在端点上
  static isPointInSegment(p0: IPoint, p1: IPoint, p: IPoint): boolean {
    if (this.isPointEqual(p0, p) || this.isPointEqual(p1, p)) return false;
    return this.isPointOnSegment(p0, p1, p);
  }

  /**
   * 点是否在线段上，包括在端点上
   * p0 p1 segment的两个端点
   * @param p0
   * @param p1
   * @param p
   * @return
   *
   */
  static isPointOnSegment(p0: IPoint, p1: IPoint, p: IPoint): boolean {
    if (!this.isPointOnLine(p0, p1, p)) return false;
    if (!this.isNumberEqual(p.x, Math.max(p0.x, p1.x)) && p.x > Math.max(p0.x, p1.x)) return false;
    if (!this.isNumberEqual(p.x, Math.min(p0.x, p1.x)) && p.x < Math.min(p0.x, p1.x)) return false;
    if (!this.isNumberEqual(p.y, Math.max(p0.y, p1.y)) && p.y > Math.max(p0.y, p1.y)) return false;
    if (!this.isNumberEqual(p.y, Math.min(p0.y, p1.y)) && p.y < Math.min(p0.y, p1.y)) return false;
    return true;
  }

  static isPointOnPolygon(point: IPoint, points: IPoint[], pointLength = -1) {
    let status = false;
    let i: number;
    let j: number;

    if (pointLength < 0) {
      pointLength = points.length;
    }

    for (i = 0; i < pointLength; i++) {
      if (this.isPointOnSegment(points[i], points[(i + 1) % pointLength], point)) return true;
    }

    for (i = 0, j = pointLength - 1; i < pointLength; j = i++) {
      if (
        ((points[i].y <= point.y && point.y < points[j].y) || (points[j].y <= point.y && point.y < points[i].y)) &&
        point.x < ((points[j].x - points[i].x) * (point.y - points[i].y)) / (points[j].y - points[i].y) + points[i].x
      )
        status = !status;
    }
    return status;
  }

  /**
   * 判断点是否在多边形内
   * @param point
   * @param points
   * @param pointLength 若pointLength<0, 则多边形实际点数为 points.length, 否则为pointLength
   * @return
   *
   */
  static isPointInPolygon(point: IPoint, points: IPoint[], pointLength = -1): boolean {
    let status = false;
    let i: number;
    let j: number;

    if (pointLength < 0) {
      pointLength = points.length;
    }

    for (i = 0; i < pointLength; i++) {
      if (this.isPointOnSegment(points[i], points[(i + 1) % pointLength], point)) return false;
    }

    for (i = 0, j = pointLength - 1; i < pointLength; j = i++) {
      if (
        ((points[i].y <= point.y && point.y < points[j].y) || (points[j].y <= point.y && point.y < points[i].y)) &&
        point.x < ((points[j].x - points[i].x) * (point.y - points[i].y)) / (points[j].y - points[i].y) + points[i].x
      )
        status = !status;
    }
    return status;
  }

  /**
   *
   * @param p0 直线的任意一点
   * @param p1 直线的不等于p0的任意一点
   * @param p 被检测的点，计算p在到直线的距离
   * @return
   *
   */
  static calculateFootPoint(sp, ep, p): Vector2 {
    const vx: number = ep.x - sp.x;
    const vy: number = ep.y - sp.y;
    const x: number = ((p.y - sp.y) * vx * vy + vx * vx * p.x + vy * vy * sp.x) / (vx * vx + vy * vy);
    const y: number = ((p.x - sp.x) * vx * vy + vy * vy * p.y + vx * vx * sp.y) / (vx * vx + vy * vy);

    return new Vector2(x, y);
  }

  /**
   * 计算p在线段p0p1上的垂足，而非直线上。有可能为空。
   * @param p0
   * @param p1
   * @param p
   * @return
   *
   */
  static calculateFootPointOnSegment(p0: IPoint, p1: IPoint, p: IPoint) {
    const p0p1: Vector2 = this.subtract(p1, p0);
    const length: number = this.getLength(p0p1);
    if (length === 0) return null;
    const p0p2: Vector2 = this.subtract(p, p0);
    let dot = this.dotProduct(p0p2, p0p1);
    dot /= length;
    if (dot < 0 || dot > length) {
      return null; // 垂足不在线段上，在直线上
    }
    const ret: Vector2 = p0p1.clone();
    const normalize = this.normalize(dot, ret);
    return new Vector2(normalize.x + p0.x, normalize.y + p0.y);
  }

  /**
   * 从 (0,0) 到此点的线段长度。
   */
  static getLength(point: IPoint): number {
    return Math.sqrt(point.x * point.x + point.y * point.y);
  }

  static subtract(p0: IPoint, p1: IPoint) {
    return new Vector2(p0.x - p1.x, p0.y - p1.y);
  }

  static add(p0: IPoint, p1: IPoint) {
    return new Vector2(p0.x + p1.x, p0.y + p1.y);
  }

  static multiplyByScalar(p1: IPoint, scalar) {
    return new Vector2(p1.x * scalar, p1.y * scalar);
  }

  static dotProduct(p1: IPoint, p2: IPoint) {
    return p1.x * p2.x + p1.y * p2.y;
  }

  static crossProduct(p1: IPoint, p2: IPoint) {
    return p1.x * p2.y - p2.x * p1.y;
  }

  static acos(value: number): number {
    if (value > 1) value = 1;
    if (value < -1) value = -1;
    return Math.acos(value);
  }

  static asin(value: number): number {
    if (value > 1) value = 1;
    if (value < -1) value = -1;
    return Math.asin(value);
  }

  static normalize(thickness: number, point: IPoint) {
    const ll: number = this.getLength(point);
    if (ll === 0) return point;
    point.x *= thickness / ll;
    point.y *= thickness / ll;
    return point;
  }

  static rotateVector(p1: IPoint, radian: number) {
    const point = this.normalize(1, p1);
    const sin: number = Math.sin(radian);
    const cos: number = Math.cos(radian);
    const ret: Vector2 = new Vector2(point.x * cos - point.y * sin, point.y * cos + point.x * sin);
    return ret;
  }

  static vectorDistance(v1: IPoint, v2: IPoint) {
    return Math.sqrt(Math.pow(v1.x - v2.x, 2) + Math.pow(v1.y - v2.y, 2));
  }

  /**
   * 判断两个向量v1, v2是否平行
   */
  static vectorParallel(v1: Vector2, v2: Vector2): boolean {
    return this.isNumberEqual(Math.abs(this.dotProduct(v1, v2)), this.getLength(v1) * this.getLength(v2));
  }

  static getRadian(start: IPoint, end: IPoint) {
    return Math.atan2(end.y - start.y, end.x - start.x);
  }

  static getPointOnCircle(center: IPoint, radian: number, radius: number) {
    const x = center.x + radius * Math.cos(radian);
    const y = center.y + radius * Math.sin(radian);
    return new Vector2(x, y);
  }

  /**
   * 计算圆上一点point的角度。
   * @param point
   * @param center
   * @param keepPositive
   * @return
   *
   */
  static calculateAngleOfPoint(point: IPoint, center: IPoint, keepPositive: boolean): number {
    let angle: number = Math.atan2(point.y - center.y, point.x - center.x);
    if (angle < 0 && keepPositive) angle += Math.PI * 2;
    return angle;
  }

  /**
   * 基于线段上两点，在方向确定的情况下，根据长度计算终点
   * @param {Point} start - 线段起点
   * @param {Point} end - 线段终点
   * @param {number} length - 线段长度
   * @return Point
   */
  static getPointBySegmentLength(start: IPoint, end: IPoint, length: number): Vector2 {
    const angle = this.getRadian(start, end);
    const point = this.getPointOnCircle(start, angle, length);
    return point;
  }

  /**
   * 对旋转的角度进行吸附
   * @param originRotationAngle
   * @param attachAngle
   * @param attach
   */
  static rotateAttach(originRotationAngle: number, attachAngle = 10, attach = true): number {
    originRotationAngle = this.formatAngle(originRotationAngle);
    if (attach) {
      if (Math.abs(originRotationAngle - 0) * 2 < attachAngle) return 0;
      if (Math.abs(originRotationAngle - 45) * 2 < attachAngle) return 45;
      if (Math.abs(originRotationAngle - 90) * 2 < attachAngle) return 90;
      if (Math.abs(originRotationAngle - 135) * 2 < attachAngle) return 135;
      if (Math.abs(originRotationAngle - 180) * 2 < attachAngle) return 180;
      if (Math.abs(originRotationAngle + 180) * 2 < attachAngle) return -180;
      if (Math.abs(originRotationAngle + 135) * 2 < attachAngle) return -135;
      if (Math.abs(originRotationAngle + 90) * 2 < attachAngle) return -90;
      if (Math.abs(originRotationAngle + 45) * 2 < attachAngle) return -45;
    }
    return originRotationAngle;
  }

  /**
   * 格式化角度，将angle转换为-180到180度范围内的角
   * @param angle
   */
  static formatAngle(angle: number): number {
    if (!MathUtils.isNumberEqual(angle, 180) && angle > 180) {
      angle = angle % 360.0;
      if (!MathUtils.isNumberEqual(angle, 180) && angle > 180) {
        angle = angle - 180.0;
      }
    } else if (!MathUtils.isNumberEqual(angle, -180) && angle < -180) {
      angle = angle % 360.0;
      if (!MathUtils.isNumberEqual(angle, -180) && angle < -180) {
        angle = 360.0 + angle;
      }
    }
    return angle;
  }

  /**
   * 计算直线sp0,ep0与直线sp1,ep1的交点
   * @param sp0
   * @param ep0
   * @param sp1
   * @param ep1
   * @return 若两条直线平行时，返回null， 否则返回交点
   *
   */
  static calculateRayLineIntersectPoint(sp0: IPoint, ep0: IPoint, sp1: IPoint, ep1: IPoint): Vector2 {
    const a0: number = sp0.y - ep0.y;
    const b0: number = ep0.x - sp0.x;
    const c0: number = sp0.x * ep0.y - ep0.x * sp0.y;
    const a1: number = sp1.y - ep1.y;
    const b1: number = ep1.x - sp1.x;
    const c1: number = sp1.x * ep1.y - ep1.x * sp1.y;
    const d: number = a0 * b1 - a1 * b0;

    // 平行
    if (this.isNumberEqual(d, 0)) return null;

    return new Vector2((b0 * c1 - b1 * c0) / d, (a1 * c0 - a0 * c1) / d);
  }

  /**
   *计算两条线段的交点
   * @param sp0
   * @param ep0
   * @param sp1
   * @param ep1
   * @param onEndPoint 是否包含在端点上默认true
   * @return
   * 若没有交点或者交点不在线段上，则返回null，否则返回交点
   */
  static calculateIntersectPointOnSegment(sp0: Vector2, ep0: Vector2, sp1: Vector2, ep1: Vector2, onEndPoint = true): Vector2 {
    const a0: number = sp0.y - ep0.y;
    const b0: number = ep0.x - sp0.x;
    const c0: number = sp0.x * ep0.y - ep0.x * sp0.y;
    const a1: number = sp1.y - ep1.y;
    const b1: number = ep1.x - sp1.x;
    const c1: number = sp1.x * ep1.y - ep1.x * sp1.y;
    const d: number = a0 * b1 - a1 * b0;

    // 平行
    if (this.isNumberEqual(d, 0)) return null;
    const x: number = (b0 * c1 - b1 * c0) / d;
    const y: number = (a1 * c0 - a0 * c1) / d;

    if (
      this.lessEqual(Math.min(sp0.x, ep0.x), x) &&
      this.lessEqual(x, Math.max(sp0.x, ep0.x)) &&
      this.lessEqual(Math.min(sp1.x, ep1.x), x) &&
      this.lessEqual(x, Math.max(sp1.x, ep1.x)) &&
      this.lessEqual(Math.min(sp0.y, ep0.y), y) &&
      this.lessEqual(y, Math.max(sp0.y, ep0.y)) &&
      this.lessEqual(Math.min(sp1.y, ep1.y), y) &&
      this.lessEqual(y, Math.max(sp1.y, ep1.y))
    ) {
      //在线段上
      const p: Vector2 = new Vector2(x, y);
      if (onEndPoint) {
        return p;
      } else if (!this.isPointEqual(p, sp0) && !this.isPointEqual(p, ep0) && !this.isPointEqual(p, sp1) && !this.isPointEqual(p, ep1)) {
        //不在端点上
        return p;
      }
    }
    return null;
  }

  /**
   * 计算点p沿着向量v移动length距离得到的新坐标
   * @param p
   * @param v
   * @param moveLength
   * @return
   *
   */
  static vectorMovement(p: Vector2, v: Vector2, moveLength: number): Vector2 {
    const newPoint: Vector2 = p.clone();

    if (this.isNumberEqual(this.getLength(v), 0)) return newPoint;

    newPoint.x += (v.x * moveLength) / this.getLength(v);
    newPoint.y += (v.y * moveLength) / this.getLength(v);

    return newPoint;
  }

  /**
   * 根据两条线段在垂直方向的偏移向量，计算其转角交点的偏移向量
   *
   * @param v1: 线段1在垂直方向的偏移向量
   * @param v2: 线段2在垂直方向的偏移向量
   *
   * @return: 两条线段转角交点的偏移向量，如果返回null，则说明两条线段平行，无法求得转角交点
   */
  static cornerOffset(v1: Vector2, v2: Vector2): Vector2 {
    if (this.isPointEqual(v1, v2)) return v1;

    const cross: number = v1.x * v2.y - v2.x * v1.y;

    if (this.isNumberEqual(cross, 0)) return null;

    const l1: number = v1.x * v1.x + v1.y * v1.y;
    const l2: number = v2.x * v2.x + v2.y * v2.y;

    const x: number = (l1 * v2.y - l2 * v1.y) / cross;
    const y: number = (l2 * v1.x - l1 * v2.x) / cross;

    return new Vector2(x, y);
  }

  /*
   * 计算两个向量的夹角，返回弧度radian
   */
  static vectorIncludedAngle(v1: IPoint, v2: IPoint, keepPositive: boolean): number {
    let angle: number = Math.atan2(v2.y, v2.x) - Math.atan2(v1.y, v1.x);
    if (keepPositive) {
      if (angle < 0) angle += Math.PI * 2;
    } else {
      if (angle < -Math.PI) angle += Math.PI * 2;
    }
    return angle;
  }

  //计算两个向量的夹角
  static computeTwoVectorAngle(dir1: Vector2, dir2: Vector2): number {
    const startV: Vector2 = new Vector2().copy(dir1);
    const stopV: Vector2 = new Vector2().copy(dir2);
    const noraml1 = this.normalize(1, startV);
    const noraml2 = this.normalize(1, stopV);
    let dot: number = this.dotProduct(noraml1, noraml2);
    if (dot >= 1) dot = 1;
    if (dot <= -1) dot = -1;
    const angle: number = Math.acos(dot);
    if (isNaN(angle)) console.log("dot cal Error");
    return angle;
  }

  /**
   * 计算向量v1相对v2逆时针旋转的角度
   * @param v1
   * @param v2
   * @return -180 ~ 180
   */
  static vectorsAngle(v1: IPoint, v2: IPoint): number {
    const length1 = this.getLength(v1);
    const length2 = this.getLength(v2);
    if (this.isNumberEqual(length1, 0) || this.isNumberEqual(length2, 0)) return 180;
    const n1 = this.normalize(1, v1);
    const n2 = this.normalize(1, v2);
    const c: number = this.dotProduct(n1, n2);
    const s: number = this.crossProduct(n1, n2);
    let cAngle: number = this.acos(c);
    const sAngle: number = this.asin(s);
    if (sAngle < 0) cAngle *= -1;
    const deg = (cAngle / Math.PI) * 180;
    return deg;
  }

  /**
   * 判断点在线段的哪侧
   * @param start 线段起点
   * @param end 线段终点
   * @param point 计算点
   * @return number 大于0在左侧，小于0在右侧，等于0在直线上
   */
  static pointSideofSegment(start: IPoint, end: IPoint, point: IPoint): number {
    const s: number = (start.x - point.x) * (end.y - point.y) - (start.y - point.y) * (end.x - point.x);
    return s;
  }

  /**
     判断3个点是否共线
     */
  public static isThreePointsOnOneLine(p1: IPoint, p2: IPoint, p3: IPoint): boolean {
    const DIFF = 0.00000001;
    const a: number = Math.pow(1 / this.vectorDistance(p1, p2), 0.5);
    if (Math.abs(a * (p2.x - p1.x) * p3.y - a * (p2.y - p1.y) * p3.x - a * p1.y * p2.x + a * p1.x * p2.y) < DIFF) {
      return true;
    }
    return false;
  }

  /**
   * 获取过三点的圆的圆心
   * 若三点工线，则返回null
   */
  static triangleCircleCenterPoint(p1: IPoint, p2: IPoint, p3: IPoint): Vector2 {
    // 检查三点是否共线
    if (this.isThreePointsOnOneLine(p1, p2, p3)) return null;

    const x1: number = p1.x;
    const x2: number = p2.x;
    const x3: number = p3.x;
    const y1: number = p1.y;
    const y2: number = p2.y;
    const y3: number = p3.y;

    //求外接圆圆心
    const t1: number = x1 * x1 + y1 * y1;
    const t2: number = x2 * x2 + y2 * y2;
    const t3: number = x3 * x3 + y3 * y3;
    const temp: number = x1 * y2 + x2 * y3 + x3 * y1 - x1 * y3 - x2 * y1 - x3 * y2;
    const x: number = (t2 * y3 + t1 * y2 + t3 * y1 - t2 * y1 - t3 * y2 - t1 * y3) / temp / 2;
    const y: number = (t3 * x2 + t2 * x1 + t1 * x3 - t1 * x2 - t2 * x3 - t3 * x1) / temp / 2;

    const center: Vector2 = new Vector2();
    center.x = x;
    center.y = y;

    return center;
  }

  /**
   * 获取圆弧上的点  始终都收逆时针的点   是有顺序的
   * @param startArcPoint 弧的起点
   * @param stopArcPoint 弧的终点
   * @param abitraryArcPoint 弧上任意一点
   * @param centerOfCircle 圆心，默认为null
   */
  static getDrawArcPoints(startArcPoint: Vector2, stopArcPoint: Vector2, abitraryArcPoint: Vector2, segmentLength = 100, centerOfCircle: Vector2 = null, startToStop = false) {
    if (!centerOfCircle) centerOfCircle = this.triangleCircleCenterPoint(startArcPoint, stopArcPoint, abitraryArcPoint);
    if (!centerOfCircle) return null;

    const radius = MathUtils.vectorDistance(startArcPoint, centerOfCircle);
    const points: Vector2[] = [
      MathUtils.subtract(startArcPoint, centerOfCircle),
      MathUtils.subtract(stopArcPoint, centerOfCircle),
      MathUtils.subtract(abitraryArcPoint, centerOfCircle)
    ];
    const angles: number[] = [];
    let p = new Vector2();
    let angle: number;
    for (p of points) {
      angle = Math.atan2(p.y, p.x);
      if (angle < 0) angle += Math.PI * 2;
      angles.push(angle);
    }

    let minAngle = Math.min(angles[0], angles[1]);
    let maxAngle = Math.max(angles[0], angles[1]);
    const anticlockwise: boolean = angles[2] < maxAngle && angles[2] > minAngle; //逆时针
    if (!anticlockwise) {
      const tmp: number = maxAngle;
      maxAngle = minAngle + Math.PI * 2;
      minAngle = tmp;
    }

    let arcPoints: Vector2[] = [];
    //从minAngle到maxAngle绘制
    let i: number;
    const n: number = Math.max(Math.round(((maxAngle - minAngle) * radius) / segmentLength), 2);
    const step: number = (maxAngle - minAngle) / n;
    for (i = 0; i <= n; i++) {
      angle = minAngle + step * i;
      p = new Vector2(Math.cos(angle) * radius + centerOfCircle.x, Math.sin(angle) * radius + centerOfCircle.y);
      if (isNaN(p.x) || isNaN(p.y)) continue;
      arcPoints.push(p);
    }

    if (startToStop && this.vectorDistance(startArcPoint, arcPoints[0]) > this.vectorDistance(startArcPoint, arcPoints[arcPoints.length - 1])) {
      arcPoints = arcPoints.reverse();
    }
    return { arcPoints, minAngle, maxAngle, radius, centerOfCircle };
  }
}
