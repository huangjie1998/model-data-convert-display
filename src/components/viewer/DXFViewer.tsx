import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, Maximize, Download, Layers } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface DXFViewerProps {
  fileUrl: string;
  fileName?: string;
}

// 简化的 DXF 实体类型定义
interface DXFEntity {
  type: string;
  vertices?: number[][];
  center?: number[];
  radius?: number;
  startPoint?: number[];
  endPoint?: number[];
  handle?: string;
  layer?: string;
  color?: number;
  lineType?: string;
  lineWeight?: number;
}

interface DXFLayer {
  name: string;
  color: number;
  visible: boolean;
  entities: DXFEntity[];
}

export function DXFViewer({ fileUrl, fileName }: DXFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<DXFLayer[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [bounds, setBounds] = useState({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // 颜色映射表 (AutoCAD 颜色索引)
  const colorMap: { [key: number]: string } = {
    0: '#000000', 1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
    5: '#0000FF', 6: '#FF00FF', 7: '#FFFFFF', 8: '#808080', 9: '#C0C0C0',
    250: '#333333', 251: '#444444', 252: '#555555', 253: '#666666',
    254: '#777777', 255: '#888888'
  };

  const getColor = (colorIndex?: number): string => {
    if (colorIndex === undefined || colorIndex === 256) return '#FFFFFF';
    return colorMap[colorIndex] || `hsl(${(colorIndex * 137.5) % 360}, 70%, 50%)`;
  };

  // 解析 DXF 文件
  useEffect(() => {
    const fetchAndParseDXF = async () => {
      try {
        setError(null);
        const response = await fetch(fileUrl);
        const dxfText = await response.text();
        
        // 使用简单的正则解析方法
        const parsedLayers = parseDXF(dxfText);
        setLayers(parsedLayers);
        
        // 默认显示所有图层
        const allLayerNames = new Set(parsedLayers.map(l => l.name));
        setVisibleLayers(allLayerNames);
        
        // 计算边界框
        calculateBounds(parsedLayers);
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析 DXF 文件失败');
      }
    };

    fetchAndParseDXF();
  }, [fileUrl]);

  // 简单的 DXF 解析器
  const parseDXF = (dxfText: string): DXFLayer[] => {
    const lines = dxfText.split(/\r?\n/);
    const layerMap = new Map<string, DXFLayer>();
    const entities: DXFEntity[] = [];
    
    let i = 0;
    let inEntities = false;
    let currentEntity: Partial<DXFEntity> | null = null;
    let currentLayer = '0';
    let groupCode = 0;

    // 确保默认图层存在
    layerMap.set('0', { name: '0', color: 7, visible: true, entities: [] });

    while (i < lines.length) {
      const line = lines[i].trim();
      
      // 组码行
      if (i % 2 === 0) {
        groupCode = parseInt(line, 10) || 0;
      } else {
        const value = line;
        
        // 检测 ENTITIES 段
        if (groupCode === 0) {
          if (value === 'ENTITIES') {
            inEntities = true;
          } else if (value === 'ENDSEC') {
            inEntities = false;
            currentEntity = null;
          } else if (inEntities && ['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'TEXT', 'MTEXT', 'INSERT'].includes(value)) {
            // 保存上一个实体
            if (currentEntity && currentEntity.type) {
              entities.push(currentEntity as DXFEntity);
            }
            currentEntity = { type: value, layer: currentLayer };
          } else if (inEntities && value === 'VERTEX' && currentEntity) {
            // POLYLINE 的顶点
          } else if (inEntities && value === 'SEQEND') {
            // POLYLINE 结束
          }
        }
        
        // 解析实体属性
        if (currentEntity && inEntities) {
          switch (groupCode) {
            case 8: // 图层名
              currentEntity.layer = value;
              currentLayer = value;
              break;
            case 10: // X 坐标
              if (!currentEntity.center && !currentEntity.startPoint) {
                currentEntity.center = [parseFloat(value), 0, 0];
              } else if (currentEntity.center && currentEntity.center.length === 1) {
                // 处理多边形顶点
              }
              break;
            case 20: // Y 坐标
              if (currentEntity.center) {
                currentEntity.center[1] = parseFloat(value);
              }
              break;
            case 30: // Z 坐标
              if (currentEntity.center) {
                currentEntity.center[2] = parseFloat(value);
              }
              break;
            case 11: // 终点 X
              currentEntity.endPoint = [parseFloat(value), 0, 0];
              break;
            case 21: // 终点 Y
              if (currentEntity.endPoint) {
                currentEntity.endPoint[1] = parseFloat(value);
              }
              break;
            case 40: // 半径
              currentEntity.radius = parseFloat(value);
              break;
            case 50: // 起始角度
              // 暂不处理
              break;
            case 51: // 终止角度
              // 暂不处理
              break;
            case 62: // 颜色
              currentEntity.color = parseInt(value, 10);
              break;
            case 70: // 闭合标志等
              // 暂不处理
              break;
            case 72: // 多段线顶点数
              // 暂不处理
              break;
          }
        }
      }
      
      i++;
    }

    // 保存最后一个实体
    if (currentEntity && currentEntity.type) {
      entities.push(currentEntity as DXFEntity);
    }

    // 按图层分组实体
    entities.forEach(entity => {
      const layerName = entity.layer || '0';
      if (!layerMap.has(layerName)) {
        layerMap.set(layerName, { 
          name: layerName, 
          color: 7, 
          visible: true, 
          entities: [] 
        });
      }
      layerMap.get(layerName)!.entities.push(entity);
    });

    return Array.from(layerMap.values());
  };

  // 计算边界框
  const calculateBounds = (layerData: DXFLayer[]) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasEntities = false;

    layerData.forEach(layer => {
      layer.entities.forEach(entity => {
        if (entity.center) {
          hasEntities = true;
          const x = entity.center[0];
          const y = entity.center[1];
          const r = entity.radius || 0;
          
          minX = Math.min(minX, x - r);
          maxX = Math.max(maxX, x + r);
          minY = Math.min(minY, y - r);
          maxY = Math.max(maxY, y + r);
        }
        
        if (entity.startPoint) {
          hasEntities = true;
          minX = Math.min(minX, entity.startPoint[0]);
          maxX = Math.max(maxX, entity.startPoint[0]);
          minY = Math.min(minY, entity.startPoint[1]);
          maxY = Math.max(maxY, entity.startPoint[1]);
        }
        
        if (entity.endPoint) {
          hasEntities = true;
          minX = Math.min(minX, entity.endPoint[0]);
          maxX = Math.max(maxX, entity.endPoint[0]);
          minY = Math.min(minY, entity.endPoint[1]);
          maxY = Math.max(maxY, entity.endPoint[1]);
        }
        
        if (entity.vertices) {
          hasEntities = true;
          entity.vertices.forEach(v => {
            minX = Math.min(minX, v[0]);
            maxX = Math.max(maxX, v[0]);
            minY = Math.min(minY, v[1]);
            maxY = Math.max(maxY, v[1]);
          });
        }
      });
    });

    if (hasEntities) {
      setBounds({ minX, maxX, minY, maxY });
      // 自动缩放以适应画布
      const padding = 50;
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2;
      const canvasWidth = canvasRef.current?.width || 800;
      const canvasHeight = canvasRef.current?.height || 600;
      const scaleX = canvasWidth / width;
      const scaleY = canvasHeight / height;
      setScale(Math.min(scaleX, scaleY, 1));
    } else {
      setBounds({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    }
  };

  // 渲染到 Canvas
  useEffect(() => {
    if (!canvasRef.current || layers.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布大小
    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // 清空画布
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 保存上下文
    ctx.save();

    // 应用变换
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const boundsCenterX = (bounds.minX + bounds.maxX) / 2;
    const boundsCenterY = (bounds.minY + bounds.maxY) / 2;

    ctx.translate(centerX + position.x, centerY + position.y);
    ctx.scale(scale, -scale); // Y轴翻转，因为CAD坐标系Y向上
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-boundsCenterX, -boundsCenterY);

    // 绘制网格
    drawGrid(ctx, bounds);

    // 绘制实体
    layers.forEach(layer => {
      if (!visibleLayers.has(layer.name)) return;
      
      layer.entities.forEach(entity => {
        drawEntity(ctx, entity);
      });
    });

    // 恢复上下文
    ctx.restore();

    // 绘制坐标轴指示器
    drawAxisIndicator(ctx, canvas.width, canvas.height);
  }, [layers, scale, position, rotation, visibleLayers, bounds]);

  // 绘制网格
  const drawGrid = (ctx: CanvasRenderingContext2D, bounds: { minX: number, maxX: number, minY: number, maxY: number }) => {
    const gridSize = 10;
    const minX = Math.floor(bounds.minX / gridSize) * gridSize;
    const maxX = Math.ceil(bounds.maxX / gridSize) * gridSize;
    const minY = Math.floor(bounds.minY / gridSize) * gridSize;
    const maxY = Math.ceil(bounds.maxY / gridSize) * gridSize;

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.5 / scale;

    // 垂直线
    for (let x = minX; x <= maxX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
      ctx.stroke();
    }

    // 水平线
    for (let y = minY; y <= maxY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
      ctx.stroke();
    }
  };

  // 绘制实体
  const drawEntity = (ctx: CanvasRenderingContext2D, entity: DXFEntity) => {
    const color = getColor(entity.color);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = (entity.lineWeight || 0.25) / scale;

    switch (entity.type) {
      case 'LINE':
        if (entity.startPoint && entity.endPoint) {
          ctx.beginPath();
          ctx.moveTo(entity.startPoint[0], entity.startPoint[1]);
          ctx.lineTo(entity.endPoint[0], entity.endPoint[1]);
          ctx.stroke();
        }
        break;
        
      case 'CIRCLE':
        if (entity.center && entity.radius) {
          ctx.beginPath();
          ctx.arc(entity.center[0], entity.center[1], entity.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
        
      case 'ARC':
        if (entity.center && entity.radius) {
          // 简化处理，绘制完整圆
          ctx.beginPath();
          ctx.arc(entity.center[0], entity.center[1], entity.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
        
      case 'LWPOLYLINE':
      case 'POLYLINE':
        if (entity.vertices && entity.vertices.length > 0) {
          ctx.beginPath();
          ctx.moveTo(entity.vertices[0][0], entity.vertices[0][1]);
          for (let i = 1; i < entity.vertices.length; i++) {
            ctx.lineTo(entity.vertices[i][0], entity.vertices[i][1]);
          }
          ctx.stroke();
        }
        break;
        
      case 'POINT':
        if (entity.center) {
          const size = 2 / scale;
          ctx.fillRect(entity.center[0] - size/2, entity.center[1] - size/2, size, size);
        }
        break;
    }
  };

  // 绘制坐标轴指示器
  const drawAxisIndicator = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const size = 60;
    const padding = 10;
    const x = width - size - padding;
    const y = height - size - padding;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1);
    
    // 背景
    ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
    ctx.fillRect(-size/2, -size/2, size, size);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(-size/2, -size/2, size, size);

    // 应用旋转
    ctx.rotate((-rotation * Math.PI) / 180);

    // X轴 (红色)
    ctx.strokeStyle = '#FF4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size/2 - 5, 0);
    ctx.stroke();

    // Y轴 (绿色)
    ctx.strokeStyle = '#44FF44';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size/2 - 5);
    ctx.stroke();

    // 标签
    ctx.fillStyle = '#FF4444';
    ctx.font = '10px sans-serif';
    ctx.fillText('X', size/2 - 10, -5);
    ctx.fillStyle = '#44FF44';
    ctx.fillText('Y', 5, size/2 - 5);

    ctx.restore();
  };

  // 控制函数
  const handleZoomIn = () => setScale(s => Math.min(s * 1.2, 20));
  const handleZoomOut = () => setScale(s => Math.max(s / 1.2, 0.01));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.max(0.01, Math.min(20, s * delta)));
  };

  // 切换图层可见性
  const toggleLayer = (layerName: string) => {
    setVisibleLayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layerName)) {
        newSet.delete(layerName);
      } else {
        newSet.add(layerName);
      }
      return newSet;
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">DXF 查看器</span>
          {fileName && (
            <span className="text-xs text-gray-500">({fileName})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            className={`h-8 w-8 ${showLayerPanel ? 'text-blue-400' : 'text-gray-400'}`}
            title="图层"
          >
            <Layers className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRotate}
            className="h-8 w-8 text-gray-400 hover:text-white"
            title="旋转"
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
          <div className="w-px h-6 bg-gray-600 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileUrl && window.open(fileUrl, '_blank')}
            className="h-8 w-8 text-gray-400 hover:text-white"
            title="下载原始文件"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 图层面板 */}
        {showLayerPanel && (
          <div className="w-48 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <div className="p-3">
              <h4 className="text-xs font-medium text-gray-400 mb-2">图层</h4>
              <div className="space-y-1">
                {layers.map(layer => (
                  <button
                    key={layer.name}
                    onClick={() => toggleLayer(layer.name)}
                    className="flex items-center gap-2 w-full p-2 rounded hover:bg-gray-700 text-left"
                  >
                    <div 
                      className={`w-3 h-3 rounded-sm ${visibleLayers.has(layer.name) ? 'bg-blue-500' : 'bg-gray-600'}`}
                      style={{ backgroundColor: visibleLayers.has(layer.name) ? getColor(layer.color) : undefined }}
                    />
                    <span className={`text-xs truncate ${visibleLayers.has(layer.name) ? 'text-gray-200' : 'text-gray-500'}`}>
                      {layer.name}
                    </span>
                    <span className="text-xs text-gray-600 ml-auto">
                      {layer.entities.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 画布区域 */}
        <div 
          ref={containerRef}
          className="flex-1 relative overflow-hidden bg-gray-950 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {error ? (
            <div className="flex flex-col items-center justify-center h-full">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <Alert className="max-w-md bg-red-900/20 border-red-800">
                <AlertDescription className="text-red-400">
                  {error}
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="w-full h-full"
            />
          )}

          {/* 信息显示 */}
          <div className="absolute bottom-4 left-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-400 space-y-1">
            <p>缩放: {Math.round(scale * 100)}%</p>
            <p>图层: {visibleLayers.size}/{layers.length}</p>
            <p>实体: {layers.reduce((sum, l) => sum + l.entities.length, 0)}</p>
          </div>

          {/* 操作提示 */}
          <div className="absolute bottom-4 right-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-sm text-gray-400">
            <p>🖱️ 左键拖动平移 | 滚轮缩放</p>
          </div>
        </div>
      </div>
    </div>
  );
}
