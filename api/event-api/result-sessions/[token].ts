import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type SessionModule = typeof import('../../../features/eventKiosk/server/persistentResultSession.ts');
type RepositoryModule = typeof import('../../../features/eventKiosk/server/upstashResultSession.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

async function loadSessionModules(): Promise<[SessionModule, RepositoryModule]> {
  const root = process.cwd();
  return Promise.all([
    nativeImport(pathToFileURL(join(root, 'features/eventKiosk/server/persistentResultSession.ts')).href) as Promise<SessionModule>,
    nativeImport(pathToFileURL(join(root, 'features/eventKiosk/server/upstashResultSession.ts')).href) as Promise<RepositoryModule>,
  ]);
}

type ApiRequest = { method?: string; query?: Record<string, string | string[] | undefined> };
type ApiResponse = {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  const raw = request.query?.token;
  const token = Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';
  try {
    const [{ PersistentResultSessionService }, { UpstashResultSessionRepository }] = await loadSessionModules();
    const service = new PersistentResultSessionService(new UpstashResultSessionRepository());
    if (request.method === 'DELETE') {
      const deleted = await service.delete(token);
      if (deleted) response.status(204).end();
      else response.status(400).json({ error: 'INVALID_TOKEN' });
      return;
    }
    if (request.method !== 'GET') {
      response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }
    const result = await service.read(token);
    if (result.status === 'ok') response.status(200).json({ summary: result.summary, expiresAt: result.expiresAt });
    else if (result.status === 'invalid') response.status(400).json({ error: 'INVALID_TOKEN' });
    else if (result.status === 'expired') response.status(410).json({ error: 'EXPIRED' });
    else response.status(404).json({ error: 'NOT_FOUND' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'RESULT_SESSION_FAILED';
    if (code === 'RESULT_SESSION_BACKEND_UNCONFIGURED') response.status(503).json({ error: code });
    else response.status(500).json({ error: 'RESULT_SESSION_FAILED' });
  }
}
