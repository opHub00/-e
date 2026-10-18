import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Module = typeof import('../../features/productV3/admin/assessmentEvents.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
type ApiRequest = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.status(405).json({ result: 'METHOD_NOT_ALLOWED' }); return; }
  const declaredLength = Number(request.headers?.['content-length'] ?? 0);
  if (declaredLength > 32768 || JSON.stringify(request.body ?? null).length > 32768) { response.status(413).json({ result: 'PAYLOAD_TOO_LARGE' }); return; }
  const origin = request.headers?.origin;
  const host = request.headers?.host;
  if (typeof origin === 'string') {
    try {
      if (typeof host !== 'string' || new URL(origin).host !== host) {
        response.status(403).json({ result: 'ORIGIN_FORBIDDEN' }); return;
      }
    } catch {
      response.status(403).json({ result: 'ORIGIN_FORBIDDEN' }); return;
    }
  }
  try {
    const module = await nativeImport(pathToFileURL(join(process.cwd(), 'features/productV3/admin/assessmentEvents.ts')).href) as Module;
    const result = await module.evaluateAndRecordAssessment(request.body, process.env);
    response.status(result.status).json(result.body);
  } catch {
    response.status(503).json({ result: 'ASSESSMENT_STAGING_UNAVAILABLE' });
  }
}
