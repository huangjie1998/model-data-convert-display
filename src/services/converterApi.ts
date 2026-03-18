// 后端转换服务 API

// 动态获取 API 基础 URL
const getApiBaseUrl = () => {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // 开发环境和生产环境都使用相对路径，让 Vite/服务器处理代理
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

export interface ConversionResult {
  file_id: string;
  original_name: string;
  category: '3d' | '2d';
  original_type: string;
  needs_conversion: boolean;
  converted: boolean;
  converted_type: string | null;
  download_url: string | null;
  conversion_error?: string;
  converted_size?: number;
}

export interface ConverterStatus {
  tools: {
    [key: string]: boolean;
  };
  message: string;
}

/**
 * 检查后端服务是否可用
 */
export async function isBackendAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 上传文件到后端进行转换
 */
export async function uploadAndConvert(file: File): Promise<ConversionResult> {
  const formData = new FormData();
  formData.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分钟超时

  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = '上传失败';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请稍后重试');
      }
      throw error;
    }
    throw new Error('网络错误，请检查后端服务是否运行');
  }
}

/**
 * 获取转换后的文件 URL
 */
export function getConvertedFileUrl(downloadUrl: string): string {
  if (downloadUrl.startsWith('http')) {
    return downloadUrl;
  }
  // 使用相对路径
  return `${API_BASE_URL.replace('/api', '')}${downloadUrl}`;
}

/**
 * 检查转换工具状态
 */
export async function checkConverterStatus(): Promise<ConverterStatus> {
  const response = await fetch(`${API_BASE_URL}/converters/status`);
  
  if (!response.ok) {
    throw new Error('无法获取转换工具状态');
  }

  return await response.json();
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<{ status: string; service: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error('服务不可用');
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 清理临时文件
 */
export async function cleanupFiles(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/cleanup`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('清理失败');
  }

  return await response.json();
}
