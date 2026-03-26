const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
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

export async function isBackendAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export async function isDwgDirectAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${API_BASE_URL}/dwg/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export async function uploadAndConvert(file: File): Promise<ConversionResult> {
  const formData = new FormData();
  formData.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Upload failed';
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
        throw new Error('Request timeout, please retry.');
      }
      throw error;
    }
    throw new Error('Network error, please check backend service.');
  }
}

export function getConvertedFileUrl(downloadUrl: string): string {
  if (downloadUrl.startsWith('http')) {
    return downloadUrl;
  }
  return `${API_BASE_URL.replace('/api', '')}${downloadUrl}`;
}

export async function checkConverterStatus(): Promise<ConverterStatus> {
  const response = await fetch(`${API_BASE_URL}/converters/status`);

  if (!response.ok) {
    throw new Error('Failed to fetch converter status.');
  }

  return await response.json();
}

export async function healthCheck(): Promise<{ status: string; service: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('Service unavailable.');
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function cleanupFiles(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/cleanup`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Cleanup failed');
  }

  return await response.json();
}
