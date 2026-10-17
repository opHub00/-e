import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildProductV3AdminSeed } from '../../productV3/admin/seed.ts';
import { buildConnectedConsoleSnapshot } from '../connectedAdapter.ts';

type NoticePlatformModule = typeof import('../../eventKiosk/noticePlatform/index.ts');
// Keep Node's native ESM loader for the approved rule packages' JSON import attributes.
// Vercel's function bundler otherwise compiles that transitive graph as CommonJS.
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

async function loadNoticePlatform(): Promise<NoticePlatformModule['noticePlatform']> {
  const module = await nativeImport(pathToFileURL(join(process.cwd(), 'features/eventKiosk/noticePlatform/index.ts')).href) as NoticePlatformModule;
  return module.noticePlatform;
}

type Request = { method?: string; headers?: Record<string, string | string[] | undefined> };
type Reply = { status: number; body: unknown };
type AuthResult = 'admin' | 'reviewer' | null;
export type ConsoleApiDependencies = {
  authorize: (token: string) => Promise<AuthResult>;
  now?: () => string;
};

/** Only read operations are exposed. Authorization is checked again on the server. */
export async function handleProductV3ConsoleRequest(request: Request, dependencies: ConsoleApiDependencies): Promise<Reply> {
  if (request.method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  const header = request.headers?.authorization;
  const bearer = Array.isArray(header) ? header[0] : header;
  const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(bearer ?? '')?.[1];
  if (!token) return { status: 401, body: { error: 'AUTH_REQUIRED' } };
  let role: AuthResult;
  try { role = await dependencies.authorize(token); }
  catch { return { status: 503, body: { error: 'ADMIN_AUTH_UNAVAILABLE' } }; }
  if (!role) return { status: 403, body: { error: 'FORBIDDEN' } };
  const noticePlatform = await loadNoticePlatform();
  const seed = buildProductV3AdminSeed(noticePlatform);
  const ragChunkCounts = Object.fromEntries(seed.notices.map(notice => [notice.id, noticePlatform.ragSource(notice.id).chunks.length]));
  return {
    status: 200,
    body: buildConnectedConsoleSnapshot(seed, ragChunkCounts, (dependencies.now ?? (() => new Date().toISOString()))(), false),
  };
}

/** Existing Supabase review-access RPC is the authority, using the caller's JWT. */
export async function authorizeProductV3Admin(token: string, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<AuthResult> {
  const base = env.EXPO_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  if (!base || !anonKey || !/^https:\/\//.test(base)) throw new Error('ADMIN_AUTH_UNCONFIGURED');
  const response = await fetcher(new URL('/rest/v1/rpc/get_assessment_review_access', base), {
    method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(6000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('ADMIN_AUTH_UNAVAILABLE');
  const data: unknown = await response.json();
  const role = data && typeof data === 'object' ? (data as { role?: unknown }).role : null;
  return role === 'admin' || role === 'reviewer' ? role : null;
}
