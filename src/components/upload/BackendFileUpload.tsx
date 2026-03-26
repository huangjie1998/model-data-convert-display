import { useState, useCallback, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle2, Loader2, ArrowRight, Server, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  uploadAndConvert,
  getConvertedFileUrl,
  isBackendAvailable,
  isDwgDirectAvailable,
  type ConversionResult,
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
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatLabelMap: Record<string, string> = {
  skp: 'SKP',
  dwg: 'DWG',
  dxf: 'DXF',
  pdf: 'PDF',
  gltf: 'GLTF',
  glb: 'GLB',
  obj: 'OBJ',
  fbx: 'FBX',
  png: 'PNG',
  jpg: 'JPG',
  jpeg: 'JPEG',
};

function buildDropzoneAccept(formats: string[]): Record<string, string[]> {
  const accept: Record<string, string[]> = {};
  const add = (mime: string, ext: string) => {
    if (!accept[mime]) accept[mime] = [];
    if (!accept[mime].includes(ext)) accept[mime].push(ext);
  };

  for (const rawFormat of formats) {
    const format = rawFormat.toLowerCase();
    switch (format) {
      case 'gltf':
        add('model/gltf+json', '.gltf');
        break;
      case 'glb':
        add('model/gltf-binary', '.glb');
        break;
      case 'pdf':
        add('application/pdf', '.pdf');
        break;
      case 'png':
        add('image/png', '.png');
        break;
      case 'jpg':
      case 'jpeg':
        add('image/jpeg', '.jpg');
        add('image/jpeg', '.jpeg');
        break;
      default:
        add('application/octet-stream', `.${format}`);
        break;
    }
  }

  return accept;
}

export function BackendFileUpload({
  onFileConverted,
  acceptedFormats,
  title,
  description,
  onSwitchToConverter,
}: BackendFileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [dwgServiceAvailable, setDwgServiceAvailable] = useState<boolean | null>(null);
  const [useBackend, setUseBackend] = useState(true);

  const supportsSkp = acceptedFormats.includes('skp');
  const supportsDwg = acceptedFormats.includes('dwg');

  useEffect(() => {
    let mounted = true;
    const checkServices = async () => {
      const [converterAvailable, dwgAvailable] = await Promise.all([
        isBackendAvailable(),
        isDwgDirectAvailable(),
      ]);
      if (!mounted) return;
      setBackendAvailable(converterAvailable);
      setDwgServiceAvailable(dwgAvailable);
      if (!converterAvailable) {
        setUseBackend(false);
      }
    };

    checkServices();
    return () => {
      mounted = false;
    };
  }, []);

  const updateUploadingFile = (uploadId: string, updater: (f: UploadingFile) => UploadingFile) => {
    setUploadingFiles((prev) => prev.map((f) => (f.id === uploadId ? updater(f) : f)));
  };

  const processFile = async (file: File, uploadId: string) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isDwgDirect = extension === 'dwg';
    const needsBackendConversion = extension === 'skp';

    let converterAvailable = backendAvailable;
    if (needsBackendConversion && converterAvailable === null) {
      converterAvailable = await isBackendAvailable();
      setBackendAvailable(converterAvailable);
      if (!converterAvailable) {
        setUseBackend(false);
      }
    }

    if (isDwgDirect) {
      let dwgAvailable = dwgServiceAvailable;
      if (dwgAvailable === null) {
        dwgAvailable = await isDwgDirectAvailable();
        setDwgServiceAvailable(dwgAvailable);
      }

      if (!dwgAvailable) {
        updateUploadingFile(uploadId, (f) => ({
          ...f,
          status: 'error',
          progress: 100,
          error: 'DWG direct service is offline. Start backend and ensure /api/dwg/health is reachable.',
        }));
        return;
      }
    }

    if (useBackend && converterAvailable && needsBackendConversion) {
      try {
        updateUploadingFile(uploadId, (f) => ({ ...f, status: 'uploading', progress: 10 }));

        const result = await uploadAndConvert(file);

        updateUploadingFile(uploadId, (f) => ({ ...f, status: 'converting', progress: 50, result }));

        await new Promise((resolve) => setTimeout(resolve, 1000));

        updateUploadingFile(uploadId, (f) => ({ ...f, status: 'completed', progress: 100, result }));

        if (result.converted && result.download_url) {
          const convertedUrl = getConvertedFileUrl(result.download_url);
          const convertedType = result.converted_type || extension;
          const response = await fetch(convertedUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          onFileConverted(file, url, convertedType, extension);
          return;
        }

        if (result.conversion_error) {
          updateUploadingFile(uploadId, (f) => ({
            ...f,
            status: 'needs_manual',
            progress: 100,
            error: result.conversion_error,
          }));
          const url = URL.createObjectURL(file);
          onFileConverted(file, url, extension, extension);
          return;
        }

        if (result.download_url) {
          const convertedUrl = getConvertedFileUrl(result.download_url);
          const response = await fetch(convertedUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          onFileConverted(file, url, extension, extension);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Conversion failed.';
        updateUploadingFile(uploadId, (f) => ({ ...f, status: 'error', error: errorMessage }));
      }
      return;
    }

    if (needsBackendConversion) {
      updateUploadingFile(uploadId, (f) => ({
        ...f,
        status: 'needs_manual',
        progress: 100,
        error: 'SKP auto-conversion service is offline. Convert to GLB manually first.',
      }));
      const url = URL.createObjectURL(file);
      onFileConverted(file, url, extension, extension);
      return;
    }

    updateUploadingFile(uploadId, (f) => ({ ...f, status: 'uploading', progress: 10 }));

    let progress = 10;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 25;
      if (progress >= 100) {
        progress = 100;
        clearInterval(progressInterval);

        updateUploadingFile(uploadId, (f) => ({ ...f, status: 'completed', progress: 100 }));

        const url = URL.createObjectURL(file);
        onFileConverted(file, url, extension, extension);
      } else {
        updateUploadingFile(uploadId, (f) => ({ ...f, progress }));
      }
    }, 150);
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => {
        const id = Math.random().toString(36).substring(7);

        const uploadingFile: UploadingFile = {
          file,
          id,
          progress: 0,
          status: 'uploading',
        };

        setUploadingFiles((prev) => [...prev, uploadingFile]);
        processFile(file, id);
      });
    },
    [useBackend, backendAvailable, dwgServiceAvailable, onFileConverted]
  );

  const dropzoneAccept = useMemo(() => buildDropzoneAccept(acceptedFormats), [acceptedFormats]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: dropzoneAccept,
    multiple: false,
  });

  const removeFile = (id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const getStatusBadge = (file: UploadingFile) => {
    switch (file.status) {
      case 'uploading':
        return <Badge variant="secondary" className="bg-blue-900/50 text-blue-400">Uploading</Badge>;
      case 'converting':
        return <Badge variant="secondary" className="bg-amber-900/50 text-amber-400">Converting</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="bg-green-900/50 text-green-400">Completed</Badge>;
      case 'needs_manual':
        return <Badge variant="secondary" className="bg-orange-900/50 text-orange-400">Manual Step</Badge>;
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {supportsSkp && backendAvailable === false && (
        <Alert className="bg-amber-900/20 border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-400 text-sm">
            SKP auto-conversion service is offline. Upload GLB directly or convert SKP manually.
            {onSwitchToConverter && (
              <button onClick={onSwitchToConverter} className="underline ml-1 hover:text-amber-300">
                View guide
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {supportsDwg && dwgServiceAvailable === false && (
        <Alert className="bg-red-900/20 border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-300 text-sm">
            DWG direct-view service is offline. Start backend and ensure /api/dwg/health is reachable.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-blue-400" />
          <span className="text-sm text-gray-300">Upload Service</span>
          {supportsSkp && backendAvailable === false && (
            <Badge variant="secondary" className="bg-red-900/50 text-red-400 text-xs">
              SKP convert offline
            </Badge>
          )}
          {supportsDwg && dwgServiceAvailable === false && (
            <Badge variant="secondary" className="bg-red-900/50 text-red-400 text-xs">
              DWG direct offline
            </Badge>
          )}
        </div>
        <Button
          variant={supportsSkp && useBackend && backendAvailable ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUseBackend(!useBackend)}
          disabled={!supportsSkp || !backendAvailable}
          className={supportsSkp && useBackend && backendAvailable ? 'bg-blue-600 hover:bg-blue-700' : 'border-gray-600'}
        >
          {supportsSkp
            ? (useBackend && backendAvailable ? 'SKP Auto-Convert ON' : 'SKP Auto-Convert OFF')
            : 'SKP Only'}
        </Button>
      </div>

      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200 ease-in-out
          ${isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'}
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-3">
          <div className={`p-4 rounded-full transition-all duration-200 ${isDragActive ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
            <Upload className={`h-8 w-8 transition-colors ${isDragActive ? 'text-blue-400' : 'text-gray-400'}`} />
          </div>

          <div>
            <p className="text-lg font-medium text-gray-200">{isDragActive ? 'Drop file to upload' : title}</p>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
            {supportsSkp && backendAvailable !== false && (
              <p className="text-xs text-blue-400 mt-2">SKP files will be auto-converted to GLB.</p>
            )}
            {supportsDwg && dwgServiceAvailable !== false && (
              <p className="text-xs text-cyan-400 mt-2">DWG files are opened by direct CAD parsing (no DXF/PDF conversion).</p>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {acceptedFormats.map((format) => (
              <span
                key={format}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 rounded text-xs text-gray-400"
              >
                <span>{formatLabelMap[format] || format.toUpperCase()}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((uploadingFile) => (
            <div key={uploadingFile.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
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
                  <p className="text-sm font-medium text-gray-200 truncate">{uploadingFile.file.name}</p>
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
                  <Progress value={uploadingFile.progress} className="h-1 mt-2" />
                )}

                {uploadingFile.error && <p className="text-xs text-red-400 mt-1">{uploadingFile.error}</p>}

                {uploadingFile.status === 'needs_manual' && (
                  <p className="text-xs text-orange-400 mt-1">Please convert the file to a supported target format, then upload again.</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {uploadingFile.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
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
