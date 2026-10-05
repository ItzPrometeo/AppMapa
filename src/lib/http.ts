import { config } from '@/config';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** fetch JSON con timeout (las redes móviles pueden colgarse indefinidamente). */
export async function fetchJson<T>(url: string, timeoutMs = config.requestTimeoutMs): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new HttpError(`HTTP ${res.status} en ${url}`, res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(e instanceof Error ? e.message : 'Error de red');
  } finally {
    clearTimeout(timer);
  }
}
