import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type ContactModule = typeof import('../../features/eventKiosk/contact/server.ts');
type AuthModule = typeof import('../../features/productV3/admin/auth.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
type ApiRequest = { method?: string; headers: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') { response.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return; }
  const header = request.headers.authorization;
  const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(Array.isArray(header) ? header[0] ?? '' : header ?? '')?.[1];
  if (!token) { response.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
  try {
    const authModule = await nativeImport(pathToFileURL(join(process.cwd(), 'features/productV3/admin/auth.ts')).href) as AuthModule;
    const role = await authModule.authorizeProductV3Admin(token, process.env);
    if (role === 'UNAUTHENTICATED') { response.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
    if (role !== 'admin') { response.status(403).json({ error: 'FORBIDDEN' }); return; }
    const rawCursor = request.query?.cursor;
    const cursor = Number(Array.isArray(rawCursor) ? rawCursor[0] : rawCursor ?? '0');
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 100_000) { response.status(400).json({ error: 'INVALID_CURSOR' }); return; }
    const contactModule = await nativeImport(pathToFileURL(join(process.cwd(), 'features/eventKiosk/contact/server.ts')).href) as ContactModule;
    const page = await contactModule.loadAdminConsultationContacts(process.env, fetch, cursor);
    response.status(200).json(page);
  } catch {
    response.status(503).json({ error: 'CONTACT_ADMIN_UNAVAILABLE' });
  }
}
