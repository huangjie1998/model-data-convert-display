import { useRef, useState, useEffect, Suspense, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Box, Text } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, Maximize, AlertTriangle, FileQuestion } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

// 坐标轴组件 - SketchUp 坐标系，Z轴朝上
// X轴向右(红)，Y轴向前(绿，朝向观察者)，Z轴向上(蓝)
function AxesHelper({ size = 5 }: { size?: number }) {
  return (
    <>
      {/* X轴 - 红色 (水平向右) */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, size, 0, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ff0000" linewidth={3} />
      </line>
      {/* Y轴 - 绿色 (水平向前，朝向观察者) */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, 0, size, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#00ff00" linewidth={3} />
      </line>
      {/* Z轴 - 蓝色 (竖直向上) */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, 0, 0, size]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#0000ff" linewidth={3} />
      </line>
      {/* X标签 - 右侧 */}
      <Text position={[size + 0.5, 0, 0]} fontSize={0.5} color="#ff0000" anchorX="left" anchorY="middle">X</Text>
      {/* Y标签 - 前方 */}
      <Text position={[0, size + 0.5, 0]} fontSize={0.5} color="#00ff00" anchorX="center" anchorY="bottom">Y</Text>
      {/* Z标签 - 顶部 */}
      <Text position={[0, 0, size + 0.5]} fontSize={0.5} color="#0000ff" anchorX="center" anchorY="bottom">Z</Text>
      {/* 原点 */}
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

// 加载指示器组件
function Loader(): React.ReactElement {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4F46E5" wireframe />
    </mesh>
  );
}

// Controls helper component - must be inside Canvas
function ControlsHelper({ 
  setControls, 
  autoRotate 
}: { 
  setControls: Dispatch<SetStateAction<any>>;
  autoRotate?: boolean;
}) {
  const orbitRef = useRef<any>(null);
  useEffect(() => {
    if (orbitRef.current) {
      setControls(orbitRef.current);
    }
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

// 3D模型组件
function Model({ url, fileType }: { url: string; fileType: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadModel = async () => {
      try {
        let loadedModel;

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

        if (loadedModel) {
          // 遍历所有网格，启用双面渲染
          loadedModel.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => {
                  if (m) {
                    m.side = THREE.DoubleSide;
                    // 确保颜色空间正确
                    if ((m as THREE.MeshStandardMaterial).color) {
                      (m as THREE.MeshStandardMaterial).color.setRGB(
                        (m as THREE.MeshStandardMaterial).color.r,
                        (m as THREE.MeshStandardMaterial).color.g,
                        (m as THREE.MeshStandardMaterial).color.b
                      );
                    }
                  }
                });
              } else if (mesh.material) {
                mesh.material.side = THREE.DoubleSide;
              }
            }
          });
          
          // 计算边界框并居中模型
          const box = new THREE.Box3().setFromObject(loadedModel as THREE.Object3D);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          console.log('Model size:', size.x, size.y, size.z);
          console.log('Model center:', center.x, center.y, center.z);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 10 / maxDim;
          
          loadedModel.position.sub(center);
          loadedModel.scale.multiplyScalar(scale);
          
          setModel(loadedModel);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载模型失败');
      }
    };

    loadModel();
  }, [url, fileType]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  if (!model) {
    return <Loader />;
  }

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}

// 默认展示模型（立方体）
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

export function Model3DViewer({ fileUrl, fileType }: Model3DViewerProps) {
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState<any>(null);

  const handleReset = useCallback(() => {
    if (controls) {
      controls.reset();
    }
  }, [controls]);

  const handleZoomIn = useCallback(() => {
    if (controls) {
      controls.dollyIn(1.2);
    }
  }, [controls]);

  const handleZoomOut = useCallback(() => {
    if (controls) {
      controls.dollyOut(1.2);
    }
  }, [controls]);

  // 检测不支持的格式
  useEffect(() => {
    if (fileType?.toLowerCase() === 'skp') {
      setError('SKP 是 SketchUp 的专有格式，浏览器无法直接解析。需要转换为 GLTF、GLB、OBJ 或 FBX 格式。');
    } else if (fileType && !['gltf', 'glb', 'obj', 'fbx'].includes(fileType.toLowerCase())) {
      setError(`不支持的格式: ${fileType.toUpperCase()}。请使用 GLTF、GLB、OBJ 或 FBX 格式。`);
    } else {
      setError(null);
    }
  }, [fileType]);

  // 获取文件类型显示
  const getFileTypeDisplay = () => {
    const type = fileType?.toLowerCase();
    switch (type) {
      case 'skp': return 'SKP (SketchUp)';
      case 'gltf': return 'GLTF';
      case 'glb': return 'GLB (推荐)';
      case 'obj': return 'OBJ';
      case 'fbx': return 'FBX';
      default: return fileType?.toUpperCase() || '';
    }
  };

  // 如果是不支持的格式，显示错误信息
  if (error) {
    return (
      <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300">3D 模型查看器</span>
            {fileType && (
              <span className="text-xs text-gray-500">({getFileTypeDisplay()})</span>
            )}
          </div>
        </div>

        {/* 错误内容 */}
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
                
                <div className="space-y-4 text-left">
                  <div className="p-4 bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-400 mb-3">方案一：启用后端转换服务</h4>
                    <p className="text-xs text-gray-400 mb-2">如果有配置好的后端服务，SKP 文件将自动转换为 GLB 格式。</p>
                    <code className="text-xs bg-gray-900 p-2 rounded block">
                      docker-compose up -d
                    </code>
                  </div>
                  
                  <div className="p-4 bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-medium text-green-400 mb-3">方案二：手动转换</h4>
                    <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                      <li>在 SketchUp 中打开您的模型</li>
                      <li>安装 glTF 导出插件（如 Khronos Group 插件）</li>
                      <li>选择 文件 → 导出 → 3D模型，选择 GLTF/GLB 格式</li>
                      <li>将导出的文件重新上传</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-medium text-purple-400 mb-3">方案三：使用在线转换工具</h4>
                    <p className="text-xs text-gray-400">使用在线转换服务将 SKP 转换为 GLB/GLTF 后上传</p>
                  </div>
                </div>
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
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">3D 模型查看器</span>
          {fileUrl && fileType && (
            <span className="text-xs text-gray-500">({getFileTypeDisplay()})</span>
          )}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            className="h-8 w-8 text-gray-400 hover:text-white"
            title="放大"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            className="h-8 w-8 text-gray-400 hover:text-white"
            title="缩小"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            className="h-8 w-8 text-gray-400 hover:text-white"
            title="重置视图"
          >
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 relative">
        <Canvas camera={{ position: [8, 8, 6], up: [0, 0, 1], fov: 50 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 10, 10]} intensity={1.5} />
          <directionalLight position={[-5, -5, 5]} intensity={0.5} />
          
          {showGrid && (
            <Grid
              args={[20, 20]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#444444"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#666666"
              fadeDistance={25}
            />
          )}

          {/* 坐标轴 */}
          <AxesHelper size={10} />

          <Suspense fallback={<Loader />}>
            {fileUrl && fileType ? (
              <Model url={fileUrl} fileType={fileType} />
            ) : (
              <DefaultModel />
            )}
          </Suspense>

          <ControlsHelper setControls={setControls} autoRotate={autoRotate} />
          
          {/* Environment 组件可能导致加载问题，暂时禁用 */}
          {/* <Environment preset="city" /> */}
        </Canvas>

        {/* 操作提示 */}
        {!fileUrl && (
          <div className="absolute bottom-4 left-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-sm text-gray-400">
            <p>🖱️ 左键拖动旋转 | 右键拖动平移 | 滚轮缩放</p>
          </div>
        )}

        {/* 格式支持提示 */}
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
