import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BackendFileUpload } from '@/components/upload/BackendFileUpload';
import { Model3DViewer } from '@/components/viewer/Model3DViewer';
import { Drawing2DViewer } from '@/components/viewer/Drawing2DViewer';
import { FormatConverter } from '@/components/FormatConverter';
import { healthCheck, checkConverterStatus } from '@/services/converterApi';
import {
  Box,
  FileText,
  Upload,
  Settings,
  Layers,
  Building2,
  Menu,
  X,
  Server,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import './App.css';

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  originalType: string;
  rawFile: File;
  category: '3d' | '2d';
  uploadTime: Date;
  converted: boolean;
}

interface BackendStatus {
  connected: boolean;
  tools: Record<string, boolean>;
}

type MainPage = 'upload' | 'viewer' | 'convert';

const MODEL_FORMATS = new Set(['gltf', 'glb', 'obj', 'fbx', 'skp']);
const DRAWING_FORMATS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'dxf', 'dwg']);
const ALL_UPLOAD_FORMATS = ['gltf', 'glb', 'obj', 'fbx', 'skp', 'pdf', 'png', 'jpg', 'jpeg', 'dxf', 'dwg'];

function normalizeType(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function resolveCategory(type: string, originalType: string): '3d' | '2d' {
  const normalizedType = normalizeType(type);
  const normalizedOriginal = normalizeType(originalType);

  if (MODEL_FORMATS.has(normalizedType) || MODEL_FORMATS.has(normalizedOriginal)) {
    return '3d';
  }
  if (DRAWING_FORMATS.has(normalizedType) || DRAWING_FORMATS.has(normalizedOriginal)) {
    return '2d';
  }

  return '2d';
}

function isModelType(type: string | null | undefined, originalType: string | null | undefined): boolean {
  const normalizedType = normalizeType(type);
  const normalizedOriginal = normalizeType(originalType);
  return MODEL_FORMATS.has(normalizedType) || MODEL_FORMATS.has(normalizedOriginal);
}

function createFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function App() {
  const [mainPage, setMainPage] = useState<MainPage>('viewer');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [showBackendStatus, setShowBackendStatus] = useState(false);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        await healthCheck();
        const status = await checkConverterStatus();
        setBackendStatus({
          connected: true,
          tools: status.tools,
        });
      } catch {
        setBackendStatus({
          connected: false,
          tools: {},
        });
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  const selectedFile = useMemo(
    () => uploadedFiles.find((file) => file.id === selectedFileId) ?? null,
    [selectedFileId, uploadedFiles]
  );

  const selectedFileIsModel = useMemo(
    () => (selectedFile ? isModelType(selectedFile.type, selectedFile.originalType) : false),
    [selectedFile]
  );

  const handleFileUpload = useCallback((file: File, url: string, type: string, originalType: string) => {
    const newFile: UploadedFile = {
      id: createFileId(),
      name: file.name,
      url,
      type,
      originalType,
      rawFile: file,
      category: resolveCategory(type, originalType),
      uploadTime: new Date(),
      converted: normalizeType(type) !== normalizeType(originalType),
    };
    setUploadedFiles((prev) => [...prev, newFile]);
  }, []);

  const selectFile = useCallback((file: UploadedFile) => {
    setSelectedFileId(file.id);
    setMainPage('viewer');
  }, []);

  const deleteFile = useCallback(
    (id: string) => {
      setUploadedFiles((prev) => prev.filter((file) => file.id !== id));
      if (selectedFileId === id) {
        setSelectedFileId(null);
      }
    },
    [selectedFileId]
  );

  const getFileIcon = (file: UploadedFile) => {
    return file.category === '3d' ? '3D' : '2D';
  };

  const renderUploadPage = () => {
    return (
      <div className="h-full w-full">
        <Card className="bg-gray-900 border-gray-800 h-full min-h-0 flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
              <Upload className="h-5 w-5 text-cyan-400" />
              上传文件
            </CardTitle>
            <CardDescription className="text-gray-400">
              3D 模型和 2D 图纸统一上传，系统会根据文件格式自动选择查看方式。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <BackendFileUpload
              onFileConverted={handleFileUpload}
              acceptedFormats={ALL_UPLOAD_FORMATS}
              title="拖拽文件到此处"
              description="或点击选择文件（支持多选）"
              onSwitchToConverter={() => setMainPage('convert')}
            />
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderViewerPage = () => {
    return (
      <Card className="bg-gray-900 border-gray-800 h-full min-h-0 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
            <Eye className="h-5 w-5 text-emerald-300" />
            文件查看器
          </CardTitle>
          <CardDescription className="text-gray-400">
            {selectedFile ? (
              <span className="inline-flex items-center gap-2">
                {selectedFile.name}
                {selectedFile.converted && (
                  <Badge variant="secondary" className="bg-amber-900/50 text-amber-400 text-xs">
                    {selectedFile.originalType.toUpperCase()} -&gt; {selectedFile.type.toUpperCase()}
                  </Badge>
                )}
              </span>
            ) : (
              '未选择文件'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0">
          <div className="h-full min-h-[620px]">
            <ErrorBoundary>
              {!selectedFile && (
                <div className="h-full flex items-center justify-center text-center px-6 text-gray-500">
                  <div>
                    <Eye className="h-16 w-16 mx-auto mb-4 opacity-40" />
                    <p className="text-lg font-medium text-gray-300">未选择文件</p>
                    <p className="text-sm mt-2">请先上传文件，或从左侧列表中选择一个文件进行查看。</p>
                  </div>
                </div>
              )}
              {selectedFile && selectedFileIsModel && (
                <Model3DViewer
                  fileUrl={selectedFile.url || null}
                  fileType={selectedFile.type || null}
                  fileName={selectedFile.name}
                />
              )}
              {selectedFile && !selectedFileIsModel && (
                <Drawing2DViewer
                  fileUrl={selectedFile.url || null}
                  fileType={selectedFile.type || null}
                  fileName={selectedFile.name}
                  rawFile={selectedFile.rawFile || null}
                />
              )}
            </ErrorBoundary>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderConvertPage = () => {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
            <Settings className="h-5 w-5 text-amber-400" />
            格式转换
          </CardTitle>
          <CardDescription className="text-gray-400">
            用于手动转换 SKP / DWG 等格式。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormatConverter />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      <aside
        className={`
          fixed left-0 top-0 h-full bg-gray-900 border-r border-gray-800
          transition-all duration-300 ease-in-out z-50
          ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}
        `}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 p-4 border-b border-gray-800">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-100">模型数据转换显示</h1>
              <p className="text-xs text-gray-500">3D 模型 / 2D 图纸</p>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-gray-800">
            <button
              onClick={() => setShowBackendStatus(true)}
              className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Server className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">转换服务</span>
              {backendStatus?.connected ? (
                <Badge variant="secondary" className="bg-green-900/50 text-green-400 text-xs">
                  在线
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-700 text-gray-400 text-xs">
                  离线
                </Badge>
              )}
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                已上传文件
              </h3>

              {uploadedFiles.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-4">暂无文件</p>
              ) : (
                <div className="space-y-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => selectFile(file)}
                      className={`
                        group flex items-center gap-2 p-2 rounded-lg cursor-pointer
                        transition-colors
                        ${selectedFileId === file.id ? 'bg-blue-600/20 border border-blue-600/50' : 'hover:bg-gray-800 border border-transparent'}
                      `}
                    >
                      <span className="inline-flex items-center justify-center text-xs font-semibold w-8 h-6 rounded bg-gray-800 text-gray-300">
                        {getFileIcon(file)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="text-sm text-gray-200 truncate">{file.name}</p>
                          {file.converted && <span className="text-xs text-amber-400">-&gt;</span>}
                        </div>
                        <p className="text-xs text-gray-500">
                          {file.category === '3d' ? '3D 模型' : '2D 图纸'}
                          {file.converted && ` (${file.originalType.toUpperCase()} -> ${file.type.toUpperCase()})`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteFile(file.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      <main
        className={`
          flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden
          ${sidebarOpen ? 'ml-64' : 'ml-0'}
        `}
      >
        <header className="sticky top-0 z-40 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-gray-400 hover:text-gray-200"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>

              <nav className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  className={`gap-2 ${mainPage === 'upload' ? 'text-cyan-300 bg-cyan-400/10' : 'text-gray-400'}`}
                  onClick={() => setMainPage('upload')}
                >
                  <Upload className="h-4 w-4" />
                  上传页面
                </Button>
                <Button
                  variant="ghost"
                  className={`gap-2 ${mainPage === 'viewer' ? 'text-emerald-300 bg-emerald-400/10' : 'text-gray-400'}`}
                  onClick={() => setMainPage('viewer')}
                >
                  <Eye className="h-4 w-4" />
                  查看页面
                </Button>
                <Button
                  variant="ghost"
                  className={`gap-2 ${mainPage === 'convert' ? 'text-amber-400 bg-amber-400/10' : 'text-gray-400'}`}
                  onClick={() => setMainPage('convert')}
                >
                  <Settings className="h-4 w-4" />
                  格式转换
                </Button>
              </nav>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Box className="h-4 w-4 text-blue-400" />
              <FileText className="h-4 w-4 text-green-400" />
              <span>{uploadedFiles.length} 个文件</span>
            </div>
          </div>
        </header>

        <div className={`p-4 ${mainPage === 'convert' ? 'flex-1 overflow-auto' : 'flex-1 min-h-0 overflow-hidden'}`}>
          {mainPage === 'upload' && renderUploadPage()}
          {mainPage === 'viewer' && renderViewerPage()}
          {mainPage === 'convert' && renderConvertPage()}
        </div>
      </main>

      <Dialog open={showBackendStatus} onOpenChange={setShowBackendStatus}>
        <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-400" />
              转换服务状态
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              后端服务可用性与转换工具状态信息。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
              {backendStatus?.connected ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-200">服务在线</p>
                    <p className="text-sm text-gray-400">SKP 与 DWG 自动处理可用。</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="font-medium text-gray-200">服务离线</p>
                    <p className="text-sm text-gray-400">请检查后端进程与端口设置。</p>
                  </div>
                </>
              )}
            </div>

            {backendStatus?.connected && Object.keys(backendStatus.tools).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">可用转换工具</h4>
                <div className="space-y-2">
                  {Object.entries(backendStatus.tools).map(([tool, available]) => (
                    <div key={tool} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                      <span className="text-sm text-gray-400">{tool}</span>
                      {available ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <span className="text-xs text-gray-500">未安装</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
