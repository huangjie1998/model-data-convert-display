export interface AssetCheckResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

export async function ensureAssetReachable(url: string, timeoutMs: number): Promise<AssetCheckResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    }
    const text = await response.text();
    if (!text.trim().startsWith('{')) {
      return {
        ok: false,
        status: response.status,
        error: 'Asset is not a valid typeface JSON payload',
      };
    }
    return {
      ok: true,
      status: response.status,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown asset fetch error';
    return {
      ok: false,
      status: null,
      error: message,
    };
  } finally {
    window.clearTimeout(timer);
  }
}
