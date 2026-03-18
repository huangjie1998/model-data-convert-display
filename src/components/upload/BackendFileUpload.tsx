import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, AlertCircle, CheckCircle2, Loader2, ArrowRight, Server, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  uploadAndConvert, 
  getConvertedFileUrl, 
  isBackendAvailable,
  type ConversionResult 
} from '@/services/converterApi';

interface BackendFileUploadProps {
  onFileConverted: (file: File, url: string, type: string, originalType: string) => void;
  acceptedFormats: string[];
  title: string;
  description: string;
  onSwitchToConverter?: () => void;
}

interface UploadingFile {
  file: File;
  id: string;
  status: 'uploading' | 'converting' | 'completed' | 'error' | 'needs_manual';
  progress: number;
  result?: ConversionResult;
  error?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function BackendFileUpload({ 
  onFileConverted, 
  acceptedFormats, 
  title, 
  description,
  onSwitchToConverter
}: BackendFileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [useBackend, setUseBackend] = useState(true);

  // 检查后端服务状态
  useEffect(() => {
    const checkBackend = async () => {
      const available = await isBackendAvailable();
      setBackendAvailable(available);
      if (!available) {
        setUseBackend(false);
      }
    };
    checkBackend();
  }, []);

  const getAcceptedTypes = () => {
    const types: { [key: string]: string[] } = {
      'skp': ['.skp'],
      'dwg': ['.dwg'],
      'dxf': ['.dxf'],
      'pdf': ['.pdf'],
      'gltf': ['.gltf', '.glb'],
      'obj': ['.obj'],
      'fbx': ['.fbx'],
      'png': ['.png'],
      'jpg': ['.jpg', '.jpeg'],
    };

    const accepted: { [key: string]: string[] } = {};
    acceptedFormats.forEach(format => {
      if (types[format]) {
        types[format].forEach(ext => {
          accepted[ext] = [];
        });
      }
    });
    return accepted;
  };

  const processFile = async (file: File, uploadId: string) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    
    // 检查是否需要后端转换
    const needsBackendConversion = ['skp', 'dwg'].includes(extension);
    
    if (useBackend && backendAvailable && needsBackendConversion) {
      // 使用后端转换
      try {
        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadId 
            ? { ...f, status: 'uploading', progress: 10 }
            : f
        ));

        const result = await uploadAndConvert(file);
        
        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadId 
            ? { ...f, status: 'converting', progress: 50, result }
            : f
        ));

        // 模拟转换进度
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadId 
            ? { ...f, status: 'completed', progress: 100, result }
            : f
        ));

        // 检查转换是否成功
        if (result.converted && result.download_url) {
          const convertedUrl = getConvertedFileUrl(result.download_url);
          const convertedType = result.converted_type || extension;
          
          // 获取转换后的文件
          const response = await fetch(convertedUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          
          onFileConverted(file, url, convertedType, extension);
        } else if (result.conversion_error) {
          // 转换失败，显示错误
          setUploadingFiles(prev => prev.map(f => 
            f.id === uploadId 
              ? { 
                  ...f, 
                  status: 'needs_manual', 
                  progress: 100,
                  error: result.conversion_error 
                }
              : f
          ));
          
          // 仍然传递原始文件（虽然无法查看）
          const url = URL.createObjectURL(file);
          onFileConverted(file, url, extension, extension);
        } else if (result.download_url) {
          // 未转换但可下载原始文件
          const convertedUrl = getConvertedFileUrl(result.download_url);
          const response = await fetch(convertedUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          
          onFileConverted(file, url, extension, extension);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '转换失败';
        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadId 
            ? { 
                ...f, 
                status: 'error', 
                error: errorMessage 
              }
            : f
        ));
      }
    } else if (needsBackendConversion) {
      // 需要转换但后端不可用
      setUploadingFiles(prev => prev.map(f => 
        f.id === uploadId 
          ? { 
              ...f, 
              status: 'needs_manual', 
              progress: 100,
              error: '后端转换服务未运行，请手动转换后上传'
            }
          : f
      ));
      
      // 仍然本地处理，但标记为需要手动转换
      const url = URL.createObjectURL(file);
      onFileConverted(file, url, extension, extension);
    } else {
      // 本地处理，不需要转换
      setUploadingFiles(prev => prev.map(f => 
        f.id === uploadId 
          ? { ...f, status: 'uploading', progress: 10 }
          : f
      ));

      // 模拟上传进度
      let progress = 10;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 25;
        if (progress >= 100) {
          progress = 100;
          clearInterval(progressInterval);
          
          // 更新状态为完成
          setUploadingFiles(prev => prev.map(f => 
            f.id === uploadId 
              ? { ...f, status: 'completed', progress: 100 }
              : f
          ));
          
          // 通知父组件
          const url = URL.createObjectURL(file);
          onFileConverted(file, url, extension, extension);
        } else {
          setUploadingFiles(prev => prev.map(f => 
            f.id === uploadId 
              ? { ...f, progress }
              : f
          ));
        }
      }, 150);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const id = Math.random().toString(36).substring(7);
      
      const uploadingFile: UploadingFile = {
        file,
        id,
        progress: 0,
        status: 'uploading'
      };
      
      setUploadingFiles(prev => [...prev, uploadingFile]);
      
      // 开始处理
      processFile(file, id);
    });
  }, [useBackend, backendAvailable, onFileConverted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/gltf+json': ['.gltf'],
      'model/gltf-binary': ['.glb'],
      'application/octet-stream': ['.skp', '.obj', '.fbx', '.dwg', '.dxf'],
    },
    multiple: false
  });

  const removeFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  };

  const getFormatIcon = (format: string) => {
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
    return iconMap[format] || '📎';
  };

  const getStatusBadge = (file: UploadingFile) => {
    switch (file.status) {
      case 'uploading':
        return <Badge variant="secondary" className="bg-blue-900/50 text-blue-400">上传中</Badge>;
      case 'converting':
        return <Badge variant="secondary" className="bg-amber-900/50 text-amber-400">转换中</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="bg-green-900/50 text-green-400">完成</Badge>;
      case 'needs_manual':
        return <Badge variant="secondary" className="bg-orange-900/50 text-orange-400">需手动转换</Badge>;
      case 'error':
        return <Badge variant="destructive">失败</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* 后端状态提示 */}
      {backendAvailable === false && (
        <Alert className="bg-amber-900/20 border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-400 text-sm">
            后端转换服务未运行。SKP 和 DWG 文件需要手动转换后上传。
            {onSwitchToConverter && (
              <button 
                onClick={onSwitchToConverter}
                className="underline ml-1 hover:text-amber-300"
              >
                查看转换指南
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 后端转换开关 */}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-blue-400" />
          <span className="text-sm text-gray-300">自动格式转换</span>
          {backendAvailable === false && (
            <Badge variant="secondary" className="bg-red-900/50 text-red-400 text-xs">
              离线
            </Badge>
          )}
        </div>
        <Button
          variant={useBackend && backendAvailable ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUseBackend(!useBackend)}
          disabled={!backendAvailable}
          className={useBackend && backendAvailable ? 'bg-blue-600 hover:bg-blue-700' : 'border-gray-600'}
        >
          {useBackend && backendAvailable ? '已启用' : '已禁用'}
        </Button>
      </div>

      {/* 上传区域 */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200 ease-in-out
          ${isDragActive 
            ? 'border-blue-500 bg-blue-500/10' 
            : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
          }
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-3">
          <div className={`
            p-4 rounded-full transition-all duration-200
            ${isDragActive ? 'bg-blue-500/20' : 'bg-gray-800'}
          `}>
            <Upload className={`
              h-8 w-8 transition-colors
              ${isDragActive ? 'text-blue-400' : 'text-gray-400'}
            `} />
          </div>
          
          <div>
            <p className="text-lg font-medium text-gray-200">
              {isDragActive ? '释放文件以上传' : title}
            </p>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
            {backendAvailable !== false && (
              <p className="text-xs text-blue-400 mt-2">
                SKP 和 DWG 文件将自动转换
              </p>
            )}
          </div>

          {/* 支持的格式标签 */}
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {acceptedFormats.map(format => (
              <span 
                key={format}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 rounded text-xs text-gray-400"
              >
                <span>{getFormatIcon(format)}</span>
                <span className="uppercase">{format}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 文件拒绝提示 */}
      {/* 由于接受所有文件类型，不再显示拒绝提示 */}

      {/* 上传文件列表 */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map(uploadingFile => (
            <div 
              key={uploadingFile.id}
              className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
            >
              <div className="p-2 bg-gray-700 rounded">
                {uploadingFile.status === 'converting' ? (
                  <Loader2 className="h-5 w-5 text-amber-400 animate-spin" />
                ) : uploadingFile.status === 'needs_manual' ? (
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                ) : (
                  <File className="h-5 w-5 text-gray-400" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {uploadingFile.file.name}
                  </p>
                  {getStatusBadge(uploadingFile)}
                </div>
                <p className="text-xs text-gray-500">
                  {formatFileSize(uploadingFile.file.size)}
                  {uploadingFile.result?.needs_conversion && uploadingFile.status === 'completed' && (
                    <span className="ml-2 text-amber-400">
                      {uploadingFile.result.original_type.toUpperCase()} 
                      <ArrowRight className="inline h-3 w-3 mx-1" />
                      {uploadingFile.result.converted_type?.toUpperCase()}
                    </span>
                  )}
                </p>
                
                {uploadingFile.status !== 'completed' && uploadingFile.status !== 'error' && uploadingFile.status !== 'needs_manual' && (
                  <Progress 
                    value={uploadingFile.progress} 
                    className="h-1 mt-2"
                  />
                )}
                
                {uploadingFile.error && (
                  <p className="text-xs text-red-400 mt-1">{uploadingFile.error}</p>
                )}

                {uploadingFile.status === 'needs_manual' && (
                  <p className="text-xs text-orange-400 mt-1">
                    请先将文件转换为支持的格式后再上传
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {uploadingFile.status === 'completed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-red-400"
                  onClick={() => removeFile(uploadingFile.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
