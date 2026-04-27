import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, Maximize, Download, FileText, AlertTriangle } from 'lucide-react';
import { DXFViewer } from './DXFViewer';
import { CADViewerCadEngine } from './CADViewerCadEngine';

interface Drawing2DViewerProps {
  fileUrl: string | null;
  fileType: string | null;
  fileName?: string;
  rawFile?: File | null;
}

export function Drawing2DViewer({ fileUrl, fileType, fileName, rawFile = null }: Drawing2DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showDXFViewer, setShowDXFViewer] = useState(true);

  const normalizedType = fileType?.toLowerCase() ?? null;

  const handleZoomIn = () => setScale((prev) => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setScale((prev) => Math.max(prev / 1.2, 0.2));

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.max(0.2, Math.min(5, prev * delta)));
  };

  useEffect(() => {
    if (normalizedType === 'dxf') {
      setShowDXFViewer(true);
      setError(null);
      return;
    }

    setShowDXFViewer(false);
    setError(null);
  }, [normalizedType, fileUrl]);

  const getFileTypeDisplay = () => {
    switch (normalizedType) {
      case 'dxf':
        return 'DXF (CAD)';
      case 'dwg':
        return 'DWG (CAD)';
      case 'pdf':
        return 'PDF';
      case 'png':
        return 'PNG';
      case 'jpg':
      case 'jpeg':
        return 'JPG';
      default:
        return fileType?.toUpperCase() || '';
    }
  };

  if (normalizedType === 'dwg') {
    return <CADViewerCadEngine rawFile={rawFile} />;
  }

  if (fileUrl && normalizedType === 'dxf' && showDXFViewer) {
    return <DXFViewer fileUrl={fileUrl} fileName={fileName || 'drawing.dxf'} />;
  }

  const renderDefaultDrawing = () => (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center">
      <FileText className="h-24 w-24 mb-4 opacity-30" />
      <p className="text-lg font-medium">未选择 2D 图纸</p>
      <p className="text-sm mt-2">请上传 PDF、PNG、JPG、DXF 或 DWG 文件。</p>
      <div className="mt-6 p-4 bg-gray-800 rounded-lg max-w-md w-full">
        <p className="text-xs text-gray-400 mb-2">支持格式：</p>
        <div className="flex flex-wrap justify-center gap-2">
          <span className="px-2 py-1 bg-gray-700 rounded text-xs">PDF</span>
          <span className="px-2 py-1 bg-gray-700 rounded text-xs">PNG</span>
          <span className="px-2 py-1 bg-gray-700 rounded text-xs">JPG</span>
          <span className="px-2 py-1 bg-green-700/50 text-green-300 rounded text-xs">DXF</span>
          <span className="px-2 py-1 bg-blue-700/50 text-blue-300 rounded text-xs">DWG (Direct)</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">2D 查看器</span>
          {fileUrl && normalizedType && <span className="text-xs text-gray-500">({getFileTypeDisplay()})</span>}
        </div>
        <div className="flex items-center gap-1">
          {normalizedType === 'dxf' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDXFViewer((prev) => !prev)}
              className={`h-8 text-xs ${showDXFViewer ? 'text-blue-400' : 'text-gray-400'}`}
            >
              {showDXFViewer ? '简洁模式' : 'DXF 模式'}
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
                onClick={() => window.open(fileUrl, '_blank')}
                className="h-8 w-8 text-gray-400 hover:text-white"
                title="下载"
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

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
            <p className="text-lg font-medium mb-2">文件查看失败</p>
            <p className="text-sm text-gray-400 max-w-md text-center">{error}</p>
          </div>
        ) : fileUrl ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            {normalizedType === 'pdf' ? (
              <iframe src={fileUrl} className="w-full h-full border-0" title="PDF 查看器" />
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

        <div className="absolute bottom-4 right-4 bg-gray-800/80 backdrop-blur-sm rounded-lg px-3 py-1 text-xs text-gray-300">
          {Math.round(scale * 100)}%
        </div>
      </div>
    </div>
  );
}
