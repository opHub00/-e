import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type OpsModule = typeof import('../../features/eventKiosk/publicOps/server.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
type ApiRequest = { method?: string; headers: Record<string, string | string[] | undefined> };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };
const attempts = new Map<string, { minute: number; count: number }>();
let cache: { until: number; payload: unknown } | null = null;

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  const module = await nativeImport(pathToFileURL(join(process.cwd(), 'features/eventKiosk/publicOps/server.ts')).href) as OpsModule;
  if (!module.publicOpsEnabled(process.env)) { response.status(404).json({ error: 'NOT_FOUND' }); return; }
  if (request.method !== 'GET') { response.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return; }
  const origin = request.headers.origin, host = request.headers.host;
  let sameOrigin = true;
  if (typeof origin === 'string') {
    try { sameOrigin = typeof host === 'string' && new URL(origin).origin === `https://${host}`; }
    catch { sameOrigin = false; }
  }
  if (!sameOrigin) {
    response.status(403).json({ error: 'ORIGIN_FORBIDDEN' }); return;
  }
  const ip = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const key = /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : 'unknown';
  const minute = Math.floor(Date.now() / 60_000);
  if (attempts.size > 1_000) for (const [address, state] of attempts) if (state.minute < minute) attempts.delete(address);
  if (!attempts.has(key) && attempts.size >= 1_000) { response.status(429).json({ error: 'RATE_LIMITED' }); return; }
  const state = attempts.get(key) ?? { minute, count: 0 };
  if (state.minute !== minute) { state.minute = minute; state.count = 0; }
  state.count += 1; attempts.set(key, state);
  if (state.count > 12) { response.status(429).json({ error: 'RATE_LIMITED' }); return; }
  if (cache && cache.until > Date.now()) { response.status(200).json(cache.payload); return; }
  try {
    const payload = await module.loadPublicOps(process.env);
    cache = { until: Date.now() + 30_000, payload };
    response.status(200).json(payload);
  } catch { response.status(503).json({ error: 'PUBLIC_OPS_UNAVAILABLE' }); }
}
