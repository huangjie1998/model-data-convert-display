import { useState, useCallback, useEffect } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BackendFileUpload } from '@/components/upload/BackendFileUpload';
import { Model3DViewer } from '@/components/viewer/Model3DViewer';
import { Drawing2DViewer } from '@/components/viewer/Drawing2DViewer';
import { FormatConverter } from '@/components/FormatConverter';
import { 
  healthCheck,
  checkConverterStatus 
} from '@/services/converterApi';
import { 
  Box, 
  FileText, 
  Upload, 
  Settings, 
  HelpCircle,
  Layers,
  Building2,
  Menu,
  X,
  Server,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import './App.css';

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  originalType: string;
  category: '3d' | '2d';
  uploadTime: Date;
  converted: boolean;
}

interface BackendStatus {
  connected: boolean;
  tools: { [key: string]: boolean };
}

function App() {
  const [activeTab, setActiveTab] = useState('3d');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [current3DFile, setCurrent3DFile] = useState<UploadedFile | null>(null);
  const [current2DFile, setCurrent2DFile] = useState<UploadedFile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [showBackendStatus, setShowBackendStatus] = useState(false);

  // 检查后端服务状态
  useEffect(() => {
    const checkBackend = async () => {
      try {
        await healthCheck();
        const status = await checkConverterStatus();
        setBackendStatus({
          connected: true,
          tools: status.tools
        });
      } catch (error) {
        setBackendStatus({
          connected: false,
          tools: {}
        });
      }
    };

    checkBackend();
    // 每30秒检查一次
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  // 处理3D文件上传（支持后端转换）
  const handle3DFileUpload = useCallback((file: File, url: string, type: string, originalType: string) => {
    const newFile: UploadedFile = {
      id: Math.random().toString(36).substring(7),
      name: file.name,
      url,
      type,
      originalType,
      category: '3d',
      uploadTime: new Date(),
      converted: originalType !== type
    };
    setUploadedFiles(prev => [...prev, newFile]);
    setCurrent3DFile(newFile);
  }, []);

  // 处理2D文件上传（支持后端转换）
  const handle2DFileUpload = useCallback((file: File, url: string, type: string, originalType: string) => {
    const newFile: UploadedFile = {
      id: Math.random().toString(36).substring(7),
      name: file.name,
      url,
      type,
      originalType,
      category: '2d',
      uploadTime: new Date(),
      converted: originalType !== type
    };
    setUploadedFiles(prev => [...prev, newFile]);
    setCurrent2DFile(newFile);
  }, []);

  // 选择文件
  const selectFile = (file: UploadedFile) => {
    if (file.category === '3d') {
      setCurrent3DFile(file);
      setActiveTab('3d');
    } else {
      setCurrent2DFile(file);
      setActiveTab('2d');
    }
  };

  // 删除文件
  const deleteFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
    if (current3DFile?.id === id) setCurrent3DFile(null);
    if (current2DFile?.id === id) setCurrent2DFile(null);
  };

  // 获取文件图标
  const getFileIcon = (type: string) => {
    const iconMap: { [key: string]: string } = {
      'skp': '📐',
      'dwg': '📏',
      'dxf': '📋',
      'pdf': '📄',
      'gltf': '🎨',
      'glb': '🎨',
      'obj': '🔷',
      'fbx': '📦',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
    };
    return iconMap[type] || '📎';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* 侧边栏 */}
      <aside 
        className={`
          fixed left-0 top-0 h-full bg-gray-900 border-r border-gray-800
          transition-all duration-300 ease-in-out z-50
          ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-800">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-100">建筑图纸浏览器</h1>
              <p className="text-xs text-gray-500">3D模型 & 2D图纸</p>
            </div>
          </div>

          {/* 后端状态 */}
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

          {/* 文件列表 */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                已上传文件
              </h3>
              
              {uploadedFiles.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-4">
                  暂无文件
                </p>
              ) : (
                <div className="space-y-2">
                  {uploadedFiles.map(file => (
                    <div
                      key={file.id}
                      onClick={() => selectFile(file)}
                      className={`
                        group flex items-center gap-2 p-2 rounded-lg cursor-pointer
                        transition-colors
                        ${(current3DFile?.id === file.id || current2DFile?.id === file.id)
                          ? 'bg-blue-600/20 border border-blue-600/50'
                          : 'hover:bg-gray-800 border border-transparent'
                        }
                      `}
                    >
                      <span className="text-lg">{getFileIcon(file.originalType)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="text-sm text-gray-200 truncate">{file.name}</p>
                          {file.converted && (
                            <span className="text-xs text-amber-400" title="已自动转换">
                              ↻
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {file.category === '3d' ? '3D 模型' : '2D 图纸'}
                          {file.converted && ` (${file.originalType.toUpperCase()} → ${file.type.toUpperCase()})`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
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

          {/* 底部信息 */}
          <div className="p-4 border-t border-gray-800">
            <Dialog>
              <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-blue-400" />
                    使用帮助
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">
                    了解如何使用建筑图纸浏览器
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-200">支持的文件格式</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-gray-800 rounded-lg">
                        <p className="text-sm font-medium text-blue-400 mb-1">3D 模型</p>
                        <p className="text-xs text-gray-400">GLTF, GLB, OBJ, FBX</p>
                        <p className="text-xs text-amber-400 mt-1">SKP (自动转换)</p>
                      </div>
                      <div className="p-3 bg-gray-800 rounded-lg">
                        <p className="text-sm font-medium text-green-400 mb-1">2D 图纸</p>
                        <p className="text-xs text-gray-400">PDF, PNG, JPG, DXF</p>
                        <p className="text-xs text-amber-400 mt-1">DWG (自动转换)</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-200">操作说明</h4>
                    <ul className="text-sm text-gray-400 space-y-1">
                      <li>• 拖拽文件到上传区域或点击选择文件</li>
                      <li>• SKP 和 DWG 文件将自动转换为可查看格式</li>
                      <li>• 3D 模型：左键旋转，右键平移，滚轮缩放</li>
                      <li>• 2D 图纸：左键拖拽平移，滚轮缩放</li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main 
        className={`
          flex-1 transition-all duration-300
          ${sidebarOpen ? 'ml-64' : 'ml-0'}
        `}
      >
        {/* 顶部导航 */}
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
                  className={`gap-2 ${activeTab === '3d' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400'}`}
                  onClick={() => setActiveTab('3d')}
                >
                  <Box className="h-4 w-4" />
                  3D 模型
                </Button>
                <Button 
                  variant="ghost"
                  className={`gap-2 ${activeTab === '2d' ? 'text-green-400 bg-green-400/10' : 'text-gray-400'}`}
                  onClick={() => setActiveTab('2d')}
                >
                  <FileText className="h-4 w-4" />
                  2D 图纸
                </Button>
                <Button 
                  variant="ghost"
                  className={`gap-2 ${activeTab === 'convert' ? 'text-amber-400 bg-amber-400/10' : 'text-gray-400'}`}
                  onClick={() => setActiveTab('convert')}
                >
                  <Settings className="h-4 w-4" />
                  格式转换
                </Button>
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {uploadedFiles.length} 个文件
              </span>
            </div>
          </div>
        </header>

        {/* 内容区域 */}
        <div className="p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            {/* 3D 模型标签 */}
            <TabsContent value="3d" className="m-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 上传区域 */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-blue-400" />
                      上传 3D 模型
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      支持 GLTF, GLB, OBJ, FBX, SKP 格式
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BackendFileUpload
                      onFileConverted={handle3DFileUpload}
                      acceptedFormats={['gltf', 'glb', 'obj', 'fbx', 'skp']}
                      title="拖拽 3D 模型到此处"
                      description="或点击选择文件"
                      onSwitchToConverter={() => setActiveTab('convert')}
                    />
                  </CardContent>
                </Card>

                {/* 3D 查看器 */}
                <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
                      <Box className="h-5 w-5 text-blue-400" />
                      3D 模型查看器
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      {current3DFile ? (
                        <span className="flex items-center gap-2">
                          {current3DFile.name}
                          {current3DFile.converted && (
                            <Badge variant="secondary" className="bg-amber-900/50 text-amber-400 text-xs">
                              {current3DFile.originalType.toUpperCase()} → {current3DFile.type.toUpperCase()}
                            </Badge>
                          )}
                        </span>
                      ) : '未选择文件'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="h-[500px]">
                      <ErrorBoundary>
                        <Model3DViewer 
                          fileUrl={current3DFile?.url || null}
                          fileType={current3DFile?.type || null}
                          fileName={current3DFile?.name}
                        />
                      </ErrorBoundary>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 2D 图纸标签 */}
            <TabsContent value="2d" className="m-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 上传区域 */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-green-400" />
                      上传 2D 图纸
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      支持 PDF, PNG, JPG, DXF, DWG 格式
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BackendFileUpload
                      onFileConverted={handle2DFileUpload}
                      acceptedFormats={['pdf', 'png', 'jpg', 'jpeg', 'dxf', 'dwg']}
                      title="拖拽 2D 图纸到此处"
                      description="或点击选择文件"
                      onSwitchToConverter={() => setActiveTab('convert')}
                    />
                  </CardContent>
                </Card>

                {/* 2D 查看器 */}
                <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-green-400" />
                      2D 图纸查看器
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      {current2DFile ? (
                        <span className="flex items-center gap-2">
                          {current2DFile.name}
                          {current2DFile.converted && (
                            <Badge variant="secondary" className="bg-amber-900/50 text-amber-400 text-xs">
                              {current2DFile.originalType.toUpperCase()} → {current2DFile.type.toUpperCase()}
                            </Badge>
                          )}
                        </span>
                      ) : '未选择文件'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="h-[500px]">
                      <ErrorBoundary>
                        <Drawing2DViewer 
                          fileUrl={current2DFile?.url || null}
                          fileType={current2DFile?.type || null}
                          fileName={current2DFile?.name}
                        />
                      </ErrorBoundary>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 格式转换标签 */}
            <TabsContent value="convert" className="m-0">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-100 flex items-center gap-2">
                    <Settings className="h-5 w-5 text-amber-400" />
                    文件格式转换
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    了解如何转换文件格式，或直接上传由后端自动转换
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormatConverter />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* 后端状态对话框 */}
      <Dialog open={showBackendStatus} onOpenChange={setShowBackendStatus}>
        <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-400" />
              转换服务状态
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              后端自动转换服务的状态信息
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
              {backendStatus?.connected ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-200">服务在线</p>
                    <p className="text-sm text-gray-400">SKP 和 DWG 文件将自动转换</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="font-medium text-gray-200">服务离线</p>
                    <p className="text-sm text-gray-400">请手动转换 SKP 和 DWG 文件</p>
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
