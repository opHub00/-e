import { canonicalUrl } from './domain.ts';

export const DOCUMENT_HOSTS = ['www.applyhome.co.kr', 'static.applyhome.co.kr'] as const;
export function allowedDocumentUrl(value: string): string {
  const url = new URL(canonicalUrl(value));
  if (!(DOCUMENT_HOSTS as readonly string[]).includes(url.hostname)) throw new Error('UNSUPPORTED_DOCUMENT_HOST');
  return url.href;
}
export async function readBounded(response: Response, maximum: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw new Error('RESPONSE_TOO_LARGE'); }
  if (!response.body) throw new Error('EMPTY_RESPONSE');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > maximum) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** All GETs are serialized, paced and bounded. No cookies, credentials, arbitrary hosts, or redirect auth forwarding. */
export function createHttp(fetcher: typeof fetch = fetch, intervalMs = 1000) {
  let queue: Promise<unknown> = Promise.resolve(), lastStarted = 0;
  const request = async (url: string, headers: Record<string, string>, maxBytes: number, api: boolean) => {
    let next = url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (api) {
        const u = new URL(next);
        if (u.origin !== 'https://api.odcloud.kr' || !u.pathname.startsWith('/api/ApplyhomeInfoDetailSvc/v1/')) throw new Error('UNSAFE_API_URL');
      } else next = allowedDocumentUrl(next);
      for (let attempt = 0; attempt < 2; attempt++) {
        await wait(Math.max(0, intervalMs - (Date.now() - lastStarted))); lastStarted = Date.now();
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
        try {
          const response = await fetcher(next, { method: 'GET', redirect: 'manual', headers: { Accept: '*/*', ...headers }, signal: controller.signal });
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            await response.body?.cancel();
            if (api) throw new Error('API_REDIRECT_REJECTED');
            const location = response.headers.get('location'); if (!location) throw new Error('INVALID_REDIRECT');
            next = allowedDocumentUrl(new URL(location, next).href); break;
          }
          if ((response.status === 429 || response.status >= 500) && attempt === 0) {
            await response.body?.cancel();
            const retry = response.headers.get('retry-after');
            const delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 2000;
            if (!Number.isFinite(delay) || delay > 10000) throw new Error('RETRY_LATER');
            await wait(Math.max(2000, delay)); continue;
          }
          if (response.status === 304) return { status: 304, bytes: new Uint8Array(), headers: response.headers };
          if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP_${response.status}`); }
          return { status: response.status, bytes: await readBounded(response, maxBytes), headers: response.headers };
        } catch (error) {
          // Never include native fetch error messages or request URLs (API key could be in the URL).
          if (controller.signal.aborted) throw new Error('TIMEOUT');
          if (error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)) throw error;
          throw new Error('NETWORK_ERROR');
        } finally { clearTimeout(timer); }
      }
    }
    throw new Error('TOO_MANY_REDIRECTS');
  };
  return {
    get(url: string, headers: Record<string, string> = {}, maxBytes = 2_000_000, api = false) {
      const run = queue.then(() => request(url, headers, maxBytes, api));
      queue = run.catch(() => undefined); return run;
    },
  };
}
export type IngestionHttp = ReturnType<typeof createHttp>;
