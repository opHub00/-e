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

type ApiRequest = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type ApiResponse = {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

function host(headers: ApiRequest['headers']): string | undefined {
  const forwarded = headers['x-forwarded-host'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const direct = headers.host;
  return value ?? (Array.isArray(direct) ? direct[0] : direct);
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const serialized = JSON.stringify(request.body ?? null);
  if (serialized.length > 50_000) {
    response.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  try {
    const [{ PersistentResultSessionService, resultSessionPublicBaseUrl }, { UpstashResultSessionRepository }] = await loadSessionModules();
    const service = new PersistentResultSessionService(new UpstashResultSessionRepository());
    const created = await service.create((request.body as { summary?: unknown } | null)?.summary);
    const baseUrl = resultSessionPublicBaseUrl(process.env, host(request.headers));
    response.status(201).json({ ...created, url: `${baseUrl}/event/take?token=${created.token}` });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'RESULT_SESSION_FAILED';
    if (code === 'INVALID_SUMMARY') response.status(400).json({ error: code });
    else if (code === 'RESULT_SESSION_BACKEND_UNCONFIGURED' || code === 'PUBLIC_BASE_URL_UNCONFIGURED') response.status(503).json({ error: code });
    else response.status(500).json({ error: 'RESULT_SESSION_FAILED' });
  }
}
