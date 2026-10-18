import { createHash, randomBytes } from 'node:crypto';
import { resolveProductV3StagingTarget } from '../../productV3/admin/stagingTarget.ts';
import type { ResultSessionRepository, StoredResultSession } from './persistentResultSession.ts';

export const STAGING_QR_BUCKET = 'event-qr-sessions-staging';
const PREFIX = 'v1/';

/** The object name is a hash, never the bearer token that appears in the QR URL. */
export const stagingQrObjectPath = (token: string): string =>
  `${PREFIX}${createHash('sha256').update(token).digest('hex')}.json`;

/** Private Storage bucket; only the staging server's service role can access it. */
export class StagingSupabaseResultSessionRepository implements ResultSessionRepository {
  readonly #baseUrl: string;
  readonly #key: string;
  readonly #fetch: typeof fetch;

  constructor(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
    const target = resolveProductV3StagingTarget(env);
    this.#baseUrl = `${target.url}/storage/v1/object/${STAGING_QR_BUCKET}`;
    this.#key = target.serviceRoleKey;
    this.#fetch = fetcher;
  }

  #headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: this.#key, authorization: `Bearer ${this.#key}`, ...extra };
  }

  async putIfAbsent(token: string, value: StoredResultSession, ttlSeconds: number): Promise<boolean> {
    if (ttlSeconds < 60 || ttlSeconds > 86_400) throw new Error('INVALID_SESSION_TTL');
    const response = await this.#fetch(`${this.#baseUrl}/${stagingQrObjectPath(token)}`, {
      method: 'POST', headers: this.#headers({ 'content-type': 'application/json', 'x-upsert': 'false' }),
      body: JSON.stringify(value), cache: 'no-store', signal: AbortSignal.timeout(6_000),
    });
    if (response.status === 200 || response.status === 201) return true;
    if (response.status === 409) return false;
    if (response.status === 400) {
      const error = await response.json().catch(() => null) as { statusCode?: string; error?: string } | null;
      if (error?.statusCode === '409' && error.error === 'Duplicate') return false;
    }
    throw new Error(`RESULT_SESSION_STORAGE_FAILED:${response.status}`);
  }

  async read(token: string): Promise<StoredResultSession | null> {
    // Private Storage downloads can be CDN-cached even after deletion. Each read must bypass that cache.
    const url = new URL(`${this.#baseUrl}/${stagingQrObjectPath(token)}`);
    url.searchParams.set('read', randomBytes(8).toString('hex'));
    const response = await this.#fetch(url, {
      method: 'GET', headers: this.#headers({ 'cache-control': 'no-store' }), cache: 'no-store', signal: AbortSignal.timeout(6_000),
    });
    if (response.status === 404) return null;
    if (response.status === 400) {
      const error = await response.json().catch(() => null) as { statusCode?: string; error?: string } | null;
      if (error?.statusCode === '404' && error.error === 'not_found') return null;
    }
    if (!response.ok) throw new Error(`RESULT_SESSION_STORAGE_FAILED:${response.status}`);
    const serialized = await response.text();
    if (serialized.length > 50_000) return { summary: null as never, expiresAt: '' };
    try {
      const value = JSON.parse(serialized) as Partial<StoredResultSession>;
      return { summary: value.summary as StoredResultSession['summary'], expiresAt: value.expiresAt ?? '' };
    } catch {
      return { summary: null as never, expiresAt: '' };
    }
  }

  async delete(token: string): Promise<void> {
    const response = await this.#fetch(this.#baseUrl, {
      method: 'DELETE', headers: this.#headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: [stagingQrObjectPath(token)] }),
      cache: 'no-store', signal: AbortSignal.timeout(6_000),
    });
    if (response.ok || response.status === 404) return;
    throw new Error(`RESULT_SESSION_STORAGE_FAILED:${response.status}`);
  }
}
