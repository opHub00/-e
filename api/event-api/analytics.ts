import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type AnalyticsModule = typeof import('../../features/productV3/analytics/server.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
type ApiRequest = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return; }
  if (JSON.stringify(request.body ?? null).length > 2048) { response.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return; }
  const origin = request.headers?.origin, host = request.headers?.host;
  if (typeof origin === 'string') {
    try { if (typeof host !== 'string' || new URL(origin).host !== host) throw new Error('ORIGIN_FORBIDDEN'); }
    catch { response.status(403).json({ error: 'ORIGIN_FORBIDDEN' }); return; }
  }
  try {
    const module = await nativeImport(pathToFileURL(join(process.cwd(), 'features/productV3/analytics/server.ts')).href) as AnalyticsModule;
    const accepted = await module.recordBrowserAnalytics(request.body, process.env);
    response.status(202).json({ accepted });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      && /^[A-Z_]{3,40}$/.test(error.code) ? error.code : 'NO_CODE';
    const area = message.includes('features/productV3/analytics') ? 'ANALYTICS_MODULE'
      : message.includes('noticePlatform') ? 'NOTICE_MODULE'
        : message.includes('node_modules') ? 'DEPENDENCY_MODULE' : 'OTHER';
    const target = /^PRODUCT_V3_[A-Z_]+$/.test(message) ? message : 'NO_TARGET_CODE';
    console.warn('EVENT_ANALYTICS_HANDLER_ERROR', error instanceof Error ? error.name : 'UNKNOWN', code, area, target);
    response.status(202).json({ accepted: false });
  }
}
