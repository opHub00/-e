import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type ContactModule = typeof import('../../features/eventKiosk/contact/server.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return; }
  if (JSON.stringify(request.body ?? null).length > 2_000) { response.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return; }
  try {
    const module = await nativeImport(pathToFileURL(join(process.cwd(), 'features/eventKiosk/contact/server.ts')).href) as ContactModule;
    const result = await module.registerConsultationContact(request.body);
    response.status(result.status).json(result.body);
  } catch {
    // Never log the submitted name, phone, token, body or credentials.
    response.status(503).json({ error: 'CONTACT_STORAGE_UNAVAILABLE' });
  }
}
