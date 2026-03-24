import { useRef, useState, useEffect, Suspense, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Box, Text } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, Maximize, AlertTriangle, FileQuestion, Ruler, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

function AxesHelper({ size = 5 }: { size?: number }) {
  return (
    <>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, size, 0, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ff0000" linewidth={3} />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, 0, size, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#00ff00" linewidth={3} />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, 0, 0, size]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#0000ff" linewidth={3} />
      </line>

      <Text position={[size + 0.5, 0, 0]} fontSize={0.5} color="#ff0000" anchorX="left" anchorY="middle">
        X
      </Text>
      <Text position={[0, size + 0.5, 0]} fontSize={0.5} color="#00ff00" anchorX="center" anchorY="bottom">
        Y
      </Text>
      <Text position={[0, 0, size + 0.5]} fontSize={0.5} color="#0000ff" anchorX="center" anchorY="bottom">
        Z
      </Text>

      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </>
  );
}

interface Model3DViewerProps {
  fileUrl: string | null;
  fileType: string | null;
  fileName?: string;
}

interface ModelProps {
  url: string;
  fileType: string;
  onModelReady?: (model: THREE.Group | null) => void;
  measureEnabled?: boolean;
  onPickPoint?: (point: THREE.Vector3) => void;
}

interface FitBoundsResult {
  box: THREE.Box3;
  source: 'full' | 'core';
  sampleCount: number;
  fullDiag: number;
  coreDiag: number;
}

function Loader(): React.ReactElement {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4F46E5" wireframe />
    </mesh>
  );
}

function ControlsHelper({
  setControls,
  autoRotate,
}: {
  setControls: Dispatch<SetStateAction<any>>;
  autoRotate?: boolean;
}) {
  const orbitRef = useRef<any>(null);

  useEffect(() => {
    if (orbitRef.current) setControls(orbitRef.current);
  }, [setControls]);

  return (
    <OrbitControls
      ref={orbitRef}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      autoRotate={autoRotate}
      autoRotateSpeed={2}
    />
  );
}

function Model({ url, fileType, onModelReady, measureEnabled, onPickPoint }: ModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadModel = async () => {
      try {
        let loadedModel: THREE.Group;

        switch (fileType.toLowerCase()) {
          case 'gltf':
          case 'glb':
            loadedModel = await new Promise<THREE.Group>((resolve, reject) => {
              const loader = new GLTFLoader();
              loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
            });
            break;
          case 'obj':
            loadedModel = await new Promise<THREE.Group>((resolve, reject) => {
              const loader = new OBJLoader();
              loader.load(url, resolve, undefined, reject);
            });
            break;
          case 'fbx':
            loadedModel = await new Promise<THREE.Group>((resolve, reject) => {
              const loader = new FBXLoader();
              loader.load(url, resolve, undefined, reject);
            });
            break;
          default:
            throw new Error(`不支持的文件格式: ${fileType}`);
        }

        if (cancelled) return;

        const lowerType = fileType.toLowerCase();
        const forceDoubleSide = lowerType !== 'gltf' && lowerType !== 'glb';

        loadedModel.traverse((child) => {
          if (!(child as THREE.Mesh).isMesh) return;
          const mesh = child as THREE.Mesh;
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => {
              if (!m) return;
              if (forceDoubleSide) m.side = THREE.DoubleSide;
            });
          } else if (mesh.material && forceDoubleSide) {
            mesh.material.side = THREE.DoubleSide;
          }
        });

        const box = new THREE.Box3().setFromObject(loadedModel as THREE.Object3D);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        if (import.meta.env.DEV) {
          console.log(
            `[viewer] loaded size=(${size.x.toFixed(3)}, ${size.y.toFixed(3)}, ${size.z.toFixed(3)}) ` +
              `center=(${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`
          );
        }

        setModel(loadedModel);
        onModelReady?.(loadedModel);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载模型失败');
          onModelReady?.(null);
        }
      }
    };

    loadModel();
    return () => {
      cancelled = true;
      onModelReady?.(null);
    };
  }, [url, fileType, onModelReady]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  if (!model) return <Loader />;

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!measureEnabled || !onPickPoint) return;
    if (typeof e.delta === 'number' && e.delta > 3) return;
    e.stopPropagation();
    onPickPoint(e.point.clone());
  };

  return (
    <group ref={groupRef}>
      <primitive object={model} onPointerUp={handlePointerUp} />
    </group>
  );
}

function DefaultModel() {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.1;
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.15;
    }
  });

  return (
    <group>
      <Box ref={meshRef} args={[2, 2, 2]} position={[0, 0, 1]}>
        <meshStandardMaterial color="#4F46E5" wireframe={false} />
      </Box>
      <Box args={[2, 2, 2]} position={[0, 0, 1]}>
        <meshBasicMaterial color="#6366F1" wireframe={true} />
      </Box>
    </group>
  );
}

function formatDistance(distance: number): string {
  if (!Number.isFinite(distance)) return '--';
  if (distance >= 1) return `${distance.toFixed(4)} m`;
  if (distance >= 0.01) return `${(distance * 100).toFixed(2)} cm`;
  return `${(distance * 1000).toFixed(1)} mm`;
}

function MeasurementOverlay({ points, markerRadius }: { points: THREE.Vector3[]; markerRadius: number }) {
  const linePositions = useMemo(() => {
    if (points.length !== 2) return null;
    const [a, b] = points;
    return new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]);
  }, [points]);

  return (
    <group>
      {points.map((point, idx) => (
        <mesh key={`measure-point-${idx}`} position={[point.x, point.y, point.z]}>
          <sphereGeometry args={[markerRadius, 20, 20]} />
          <meshBasicMaterial color={idx === 0 ? '#22d3ee' : '#f59e0b'} depthTest={false} />
        </mesh>
      ))}
      {linePositions && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#f59e0b" linewidth={2} />
        </line>
      )}
    </group>
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const t = index - lower;
  return sorted[lower] * (1 - t) + sorted[upper] * t;
}

function getFitBounds(model: THREE.Object3D): FitBoundsResult {
  const fullBox = new THREE.Box3().setFromObject(model);
  if (fullBox.isEmpty()) {
    return { box: fullBox, source: 'full', sampleCount: 0, fullDiag: 0, coreDiag: 0 };
  }

  const fullSize = fullBox.getSize(new THREE.Vector3());
  const fullDiag = fullSize.length();
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const temp = new THREE.Vector3();
  const SAMPLE_LIMIT_PER_MESH = 3000;

  model.updateWorldMatrix(true, true);
  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    const position = geometry.getAttribute('position');
    if (!position || position.count === 0) return;

    const step = Math.max(1, Math.ceil(position.count / SAMPLE_LIMIT_PER_MESH));
    for (let i = 0; i < position.count; i += step) {
      temp.set(position.getX(i), position.getY(i), position.getZ(i));
      temp.applyMatrix4(mesh.matrixWorld);
      xs.push(temp.x);
      ys.push(temp.y);
      zs.push(temp.z);
    }
  });

  if (xs.length < 16) {
    return { box: fullBox, source: 'full', sampleCount: xs.length, fullDiag, coreDiag: fullDiag };
  }

  const minX = percentile(xs, 0.02);
  const maxX = percentile(xs, 0.98);
  const minY = percentile(ys, 0.02);
  const maxY = percentile(ys, 0.98);
  const minZ = percentile(zs, 0.02);
  const maxZ = percentile(zs, 0.98);
  if (![minX, maxX, minY, maxY, minZ, maxZ].every(Number.isFinite)) {
    return { box: fullBox, source: 'full', sampleCount: xs.length, fullDiag, coreDiag: fullDiag };
  }

  const coreBox = new THREE.Box3(
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ)
  );
  const coreSize = coreBox.getSize(new THREE.Vector3());
  const coreDiag = coreSize.length();
  if (!Number.isFinite(coreDiag) || coreDiag <= 1e-6) {
    return { box: fullBox, source: 'full', sampleCount: xs.length, fullDiag, coreDiag: fullDiag };
  }

  const outlierRatio = fullDiag / coreDiag;
  const useCore = Number.isFinite(outlierRatio) && outlierRatio > 1.4;
  return {
    box: useCore ? coreBox : fullBox,
    source: useCore ? 'core' : 'full',
    sampleCount: xs.length,
    fullDiag,
    coreDiag,
  };
}

export function Model3DViewer({ fileUrl, fileType }: Model3DViewerProps) {
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState<any>(null);
  const [loadedModel, setLoadedModel] = useState<THREE.Group | null>(null);

  const markerRadius = useMemo(() => {
    if (!loadedModel) return 0.05;
    const box = new THREE.Box3().setFromObject(loadedModel);
    if (box.isEmpty()) return 0.05;
    const diag = box.getSize(new THREE.Vector3()).length();
    if (!Number.isFinite(diag) || diag <= 0) return 0.05;
    return THREE.MathUtils.clamp(diag * 0.003, 0.001, 2);
  }, [loadedModel]);

  const measuredDistance = useMemo(() => {
    if (measurePoints.length !== 2) return null;
    return measurePoints[0].distanceTo(measurePoints[1]);
  }, [measurePoints]);

  const handlePickPoint = useCallback((point: THREE.Vector3) => {
    setMeasurePoints((prev) => {
      if (prev.length === 0) return [point];
      if (prev.length === 1) return [prev[0], point];
      return [point];
    });
  }, []);

  const clearMeasurement = useCallback(() => {
    setMeasurePoints([]);
  }, []);

  const toggleMeasurement = useCallback(() => {
    setMeasureEnabled((prev) => !prev);
    setMeasurePoints([]);
  }, []);

  const fitToModel = useCallback(() => {
    if (!controls || !loadedModel) return;

    const camera = controls.object as THREE.PerspectiveCamera;
    if (!camera || !camera.isPerspectiveCamera) return;

    const fullBox = new THREE.Box3().setFromObject(loadedModel);
    if (fullBox.isEmpty()) {
      console.warn('[viewer] fit skipped: empty bbox');
      return;
    }

    const fitBounds = getFitBounds(loadedModel);
    const box = fitBounds.box;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fullSize = fullBox.getSize(new THREE.Vector3());
    const fullRadius = fullSize.length() * 0.5;
    const radius = size.length() * 0.5;
    if (!Number.isFinite(radius) || radius <= 0) {
      console.warn('[viewer] fit skipped: invalid radius', radius);
      return;
    }

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const fitHeightDistance = radius / Math.sin(vFov / 2);
    const fitWidthDistance = radius / Math.sin(hFov / 2);
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.2;

    const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(1, 1, 1);
    direction.normalize();

    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = Math.max(distance + fullRadius * 8, 1000);
    camera.updateProjectionMatrix();
    controls.update();

    if (import.meta.env.DEV) {
      console.log(
        `[viewer] fit distance=${distance.toFixed(3)} ` +
          `source=${fitBounds.source} samples=${fitBounds.sampleCount} diag(full/core)=${fitBounds.fullDiag.toFixed(3)}/${fitBounds.coreDiag.toFixed(3)} ` +
          `bbox=(${size.x.toFixed(3)}, ${size.y.toFixed(3)}, ${size.z.toFixed(3)}) ` +
          `target=(${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`
      );
    }
  }, [controls, loadedModel]);

  const handleReset = useCallback(() => {
    if (controls) controls.reset();
  }, [controls]);

  const handleFitView = useCallback(() => {
    fitToModel();
  }, [fitToModel]);

  const handleZoomIn = useCallback(() => {
    if (controls) controls.dollyIn(1.2);
  }, [controls]);

  const handleZoomOut = useCallback(() => {
    if (controls) controls.dollyOut(1.2);
  }, [controls]);

  useEffect(() => {
    if (loadedModel && controls) fitToModel();
  }, [loadedModel, controls, fitToModel]);

  useEffect(() => {
    setMeasurePoints([]);
  }, [fileUrl]);

  useEffect(() => {
    if (fileType?.toLowerCase() === 'skp') {
      setError('SKP 是 SketchUp 的专有格式，浏览器无法直接解析。需要转换为 GLTF、GLB、OBJ 或 FBX 格式。');
    } else if (fileType && !['gltf', 'glb', 'obj', 'fbx'].includes(fileType.toLowerCase())) {
      setError(`不支持的格式: ${fileType.toUpperCase()}。请使用 GLTF、GLB、OBJ 或 FBX 格式。`);
    } else {
      setError(null);
    }
  }, [fileType]);

  const getFileTypeDisplay = () => {
    const type = fileType?.toLowerCase();
    switch (type) {
      case 'skp':
        return 'SKP (SketchUp)';
      case 'gltf':
        return 'GLTF';
      case 'glb':
        return 'GLB (推荐)';
      case 'obj':
        return 'OBJ';
      case 'fbx':
        return 'FBX';
      default:
        return fileType?.toUpperCase() || '';
    }
  };

  if (error) {
    return (
      <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300">3D 模型查看器</span>
            {fileType && <span className="text-xs text-gray-500">({getFileTypeDisplay()})</span>}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center max-w-lg">
            {fileType?.toLowerCase() === 'skp' ? (
              <>
                <FileQuestion className="h-20 w-20 text-amber-500 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-gray-200 mb-4">无法直接查看 SKP 文件</h3>
                <Alert className="bg-amber-900/20 border-amber-800 mb-6 text-left">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-amber-400">
                    SKP 是 SketchUp 的专有二进制格式，浏览器无法直接解析。
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <>
                <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <p className="text-lg text-red-400">{error}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">3D 模型查看器</span>
          {fileUrl && fileType && <span className="text-xs text-gray-500">({getFileTypeDisplay()})</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowGrid(!showGrid)}
            className={`h-8 w-8 ${showGrid ? 'text-blue-400' : 'text-gray-400'}`}
            title="显示/隐藏网格"
          >
            <span className="text-xs font-mono">#</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`h-8 w-8 ${autoRotate ? 'text-blue-400' : 'text-gray-400'}`}
            title="自动旋转"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-gray-600 mx-1" />
          <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8 text-gray-400 hover:text-white" title="放大">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8 text-gray-400 hover:text-white" title="缩小">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleReset} className="h-8 w-8 text-gray-400 hover:text-white" title="重置视图">
            <Maximize className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleFitView} className="h-8 w-8 text-gray-400 hover:text-white" title="适配视图">
            <span className="text-[10px] font-semibold">FIT</span>
          </Button>
          <div className="w-px h-6 bg-gray-600 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMeasurement}
            className={`h-8 w-8 ${measureEnabled ? 'text-emerald-400' : 'text-gray-400 hover:text-white'}`}
            title="测量模式"
          >
            <Ruler className="h-4 w-4" />
          </Button>
          {measureEnabled && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMeasurement}
              className="h-8 w-8 text-gray-400 hover:text-white"
              title="清除测量"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <Canvas camera={{ position: [8, 8, 6], up: [0, 0, 1], fov: 50 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 10, 10]} intensity={1.5} />
          <directionalLight position={[-5, -5, 5]} intensity={0.5} />

          {showGrid && (
            <Grid
              args={[20, 20]}
              rotation-x={Math.PI / 2}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#444444"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#666666"
              fadeDistance={25}
            />
          )}

          <AxesHelper size={10} />

          <Suspense fallback={<Loader />}>
            {fileUrl && fileType ? (
              <Model
                url={fileUrl}
                fileType={fileType}
                onModelReady={setLoadedModel}
                measureEnabled={measureEnabled}
                onPickPoint={handlePickPoint}
              />
            ) : (
              <DefaultModel />
            )}
          </Suspense>

          {measureEnabled && measurePoints.length > 0 && <MeasurementOverlay points={measurePoints} markerRadius={markerRadius} />}

          <ControlsHelper setControls={setControls} autoRotate={autoRotate} />
        </Canvas>

        {measureEnabled && (
          <div className="absolute top-4 left-4 bg-gray-900/85 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200">
            <p className="text-emerald-300 font-medium">测量模式：点击模型选择两点</p>
            <p className="mt-1">
              {measuredDistance !== null ? `当前距离: ${formatDistance(measuredDistance)}` : `已选点数: ${measurePoints.length}/2`}
            </p>
          </div>
        )}

        {!fileUrl && (
          <div className="absolute bottom-4 left-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-sm text-gray-400">
            <p>左键拖动旋转 | 右键拖动平移 | 滚轮缩放</p>
          </div>
        )}

        {!fileUrl && (
          <div className="absolute top-4 right-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-1">支持的格式：</p>
            <div className="flex gap-2">
              <span className="text-green-400">GLTF/GLB (推荐)</span>
              <span className="text-gray-500">|</span>
              <span className="text-blue-400">OBJ</span>
              <span className="text-gray-500">|</span>
              <span className="text-purple-400">FBX</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
