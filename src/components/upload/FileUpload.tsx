import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FileUploadProps {
  onFileUpload: (file: File, url: string, type: string) => void;
  acceptedFormats: string[];
  title: string;
  description: string;
}

interface UploadedFile {
  file: File;
  id: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function FileUpload({ onFileUpload, acceptedFormats, title, description }: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showFormatInfo, setShowFormatInfo] = useState(false);

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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const id = Math.random().toString(36).substring(7);
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      
      // 创建上传文件记录
      const uploadedFile: UploadedFile = {
        file,
        id,
        progress: 0,
        status: 'uploading'
      };
      
      setUploadedFiles(prev => [...prev, uploadedFile]);

      // 模拟上传进度
      const progressInterval = setInterval(() => {
        setUploadedFiles(prev => {
          const fileIndex = prev.findIndex(f => f.id === id);
          if (fileIndex === -1) return prev;
          
          const newFiles = [...prev];
          const currentFile = newFiles[fileIndex];
          
          if (currentFile.progress >= 100) {
            clearInterval(progressInterval);
            currentFile.progress = 100;
            currentFile.status = 'completed';
            
            // 创建文件URL并通知父组件
            const url = URL.createObjectURL(file);
            onFileUpload(file, url, extension);
          } else {
            currentFile.progress += Math.random() * 30;
            if (currentFile.progress > 100) currentFile.progress = 100;
          }
          
          return newFiles;
        });
      }, 200);
    });
  }, [onFileUpload, acceptedFormats]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: getAcceptedTypes(),
    multiple: false
  });

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
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

  return (
    <div className="space-y-4">
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
      {fileRejections.length > 0 && (
        <Alert variant="destructive" className="bg-red-900/20 border-red-800">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            不支持的文件格式。请上传 {acceptedFormats.join(', ')} 格式的文件。
          </AlertDescription>
        </Alert>
      )}

      {/* 上传文件列表 */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map(uploadedFile => (
            <div 
              key={uploadedFile.id}
              className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
            >
              <div className="p-2 bg-gray-700 rounded">
                <File className="h-5 w-5 text-gray-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">
                  {uploadedFile.file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(uploadedFile.file.size)}
                </p>
                
                {uploadedFile.status === 'uploading' && (
                  <Progress 
                    value={uploadedFile.progress} 
                    className="h-1 mt-2"
                  />
                )}
              </div>

              <div className="flex items-center gap-2">
                {uploadedFile.status === 'completed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {uploadedFile.status === 'error' && (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-red-400"
                  onClick={() => removeFile(uploadedFile.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 格式说明对话框 */}
      <Dialog open={showFormatInfo} onOpenChange={setShowFormatInfo}>
        <DialogContent className="bg-gray-900 border-gray-700 text-gray-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-400" />
              文件格式说明
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              了解不同文件格式的特点和转换方法
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="p-3 bg-gray-800 rounded-lg">
              <h4 className="font-medium text-gray-200 mb-2">3D 模型格式</h4>
              <ul className="text-sm text-gray-400 space-y-1">
                <li><span className="text-blue-400">GLTF/GLB</span> - 推荐的3D格式，支持材质和动画</li>
                <li><span className="text-blue-400">OBJ</span> - 通用的3D模型格式</li>
                <li><span className="text-blue-400">FBX</span> - 支持动画的3D格式</li>
                <li><span className="text-amber-400">SKP</span> - SketchUp原生格式，需转换为GLTF/OBJ</li>
              </ul>
            </div>
            
            <div className="p-3 bg-gray-800 rounded-lg">
              <h4 className="font-medium text-gray-200 mb-2">2D 图纸格式</h4>
              <ul className="text-sm text-gray-400 space-y-1">
                <li><span className="text-green-400">PDF</span> - 推荐的2D图纸格式</li>
                <li><span className="text-green-400">PNG/JPG</span> - 图片格式图纸</li>
                <li><span className="text-amber-400">DWG/DXF</span> - CAD原生格式，建议转换为PDF</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
