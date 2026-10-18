import type { ResultSessionRepository } from './persistentResultSession.ts';
import { StagingSupabaseResultSessionRepository } from './stagingSupabaseResultSession.ts';
import { UpstashResultSessionRepository } from './upstashResultSession.ts';

/** Explicit opt-in, and the staging target resolver rejects Production identity. */
export function createResultSessionRepository(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): ResultSessionRepository {
  if (env.EVENT_QR_BACKEND === 'STAGING_SUPABASE_STORAGE') {
    return new StagingSupabaseResultSessionRepository(env, fetcher);
  }
  if (!env.EVENT_QR_BACKEND || env.EVENT_QR_BACKEND === 'UPSTASH') return new UpstashResultSessionRepository(env);
  throw new Error('RESULT_SESSION_BACKEND_UNCONFIGURED');
}
