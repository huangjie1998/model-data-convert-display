import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, Maximize, Download, FileText, AlertTriangle } from 'lucide-react';
import { DXFViewer } from './DXFViewer';

interface Drawing2DViewerProps {
  fileUrl: string | null;
  fileType: string | null;
  fileName?: string;
}

export function Drawing2DViewer({ fileUrl, fileType, fileName }: Drawing2DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showDXFViewer, setShowDXFViewer] = useState(false);

  // 处理缩放
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.2));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // 处理鼠标拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 处理滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.2, Math.min(5, prev * delta)));
  };

  // 加载DXF文件
  useEffect(() => {
    if (fileUrl && fileType?.toLowerCase() === 'dxf') {
      // 默认使用内置 DXF 查看器
      setShowDXFViewer(true);
      setError(null);
    } else if (fileUrl && fileType?.toLowerCase() === 'dwg') {
      setError('DWG 文件需要转换为 DXF 或 PDF 格式才能查看。请使用转换服务或手动转换。');
      setShowDXFViewer(false);
    } else {
      setError(null);
      setShowDXFViewer(false);
    }
  }, [fileUrl, fileType]);

  // 渲染默认图纸
  const renderDefaultDrawing = () => {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileText className="h-24 w-24 mb-4 opacity-30" />
        <p className="text-lg font-medium">暂无图纸</p>
        <p className="text-sm mt-2">请上传 PDF、PNG、JPG 或 DXF 格式的图纸文件</p>
        <div className="mt-6 p-4 bg-gray-800 rounded-lg max-w-md">
          <p className="text-xs text-gray-400 mb-2">支持的格式：</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-gray-700 rounded text-xs">PDF</span>
            <span className="px-2 py-1 bg-gray-700 rounded text-xs">PNG</span>
            <span className="px-2 py-1 bg-gray-700 rounded text-xs">JPG</span>
            <span className="px-2 py-1 bg-green-700/50 text-green-400 rounded text-xs">DXF (内置支持)</span>
          </div>
          <div className="mt-4 p-3 bg-amber-900/20 border border-amber-800 rounded">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-400">
                <p className="font-medium mb-1">关于 DWG 文件</p>
                <p>DWG 是专有格式，建议：</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>使用 AutoCAD 转换为 DXF</li>
                  <li>使用 AutoCAD 导出为 PDF</li>
                  <li>启用后端转换服务自动处理</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 获取文件类型显示名称
  const getFileTypeDisplay = () => {
    const type = fileType?.toLowerCase();
    switch (type) {
      case 'dxf': return 'DXF (CAD)';
      case 'dwg': return 'DWG (AutoCAD)';
      case 'pdf': return 'PDF';
      case 'png': return 'PNG';
      case 'jpg':
      case 'jpeg': return 'JPG';
      default: return fileType?.toUpperCase() || '';
    }
  };

  // 如果是 DXF 文件且使用内置查看器
  if (fileUrl && fileType?.toLowerCase() === 'dxf' && showDXFViewer) {
    return (
      <DXFViewer 
        fileUrl={fileUrl} 
        fileName={fileName || 'drawing.dxf'}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">2D 图纸查看器</span>
          {fileUrl && fileType && (
            <span className="text-xs text-gray-500">({getFileTypeDisplay()})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {fileType?.toLowerCase() === 'dxf' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDXFViewer(!showDXFViewer)}
              className={`h-8 text-xs ${showDXFViewer ? 'text-blue-400' : 'text-gray-400'}`}
            >
              {showDXFViewer ? '使用简单模式' : '使用 DXF 模式'}
            </Button>
          )}
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
          {fileUrl && (
            <>
              <div className="w-px h-6 bg-gray-600 mx-1" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileUrl && window.open(fileUrl, '_blank')}
                className="h-8 w-8 text-gray-400 hover:text-white"
                title="下载"
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 查看区域 */}
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
          <div className="flex flex-col items-center justify-center h-full text-amber-500 px-4">
            <AlertTriangle className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">无法直接查看</p>
            <p className="text-sm text-gray-400 max-w-md text-center">{error}</p>
            {fileType?.toLowerCase() === 'dwg' && (
              <div className="mt-4 p-3 bg-gray-800 rounded-lg max-w-sm">
                <p className="text-xs text-gray-400 mb-2">建议操作：</p>
                <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                  <li>在 AutoCAD 中打开 DWG 文件</li>
                  <li>选择 文件 → 另存为，选择 DXF 格式</li>
                  <li>或使用文件 → 导出为 PDF</li>
                  <li>然后重新上传转换后的文件</li>
                </ul>
              </div>
            )}
          </div>
        ) : fileUrl ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out'
            }}
          >
            {fileType?.toLowerCase() === 'pdf' ? (
              <iframe
                src={fileUrl}
                className="w-full h-full border-0"
                title="PDF Viewer"
              />
            ) : (
              <img
                ref={imageRef}
                src={fileUrl}
                alt="2D Drawing"
                className="max-w-full max-h-full object-contain shadow-2xl"
                draggable={false}
              />
            )}
          </div>
        ) : (
          renderDefaultDrawing()
        )}

        {/* 缩放比例显示 */}
        <div className="absolute bottom-4 right-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-3 py-1 text-xs text-gray-400">
          {Math.round(scale * 100)}%
        </div>

        {/* 操作提示 */}
        {!fileUrl && !error && (
          <div className="absolute bottom-4 left-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-sm text-gray-400">
            <p>🖱️ 左键拖动平移 | 滚轮缩放</p>
          </div>
        )}
      </div>
    </div>
  );
}
