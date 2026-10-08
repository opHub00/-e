import { randomBytes } from 'node:crypto';
import type { ResultSummary } from '../summary.ts';
import {
  isOpaqueResultToken,
  isValidResultSummary,
  RESULT_SESSION_TTL_MS,
} from '../../../scripts/event-result-session-store.mjs';

export type StoredResultSession = {
  summary: ResultSummary;
  expiresAt: string;
};

export interface ResultSessionRepository {
  putIfAbsent(token: string, value: StoredResultSession, ttlSeconds: number): Promise<boolean>;
  read(token: string): Promise<StoredResultSession | null>;
  delete(token: string): Promise<void>;
}

export type PersistentSessionResult =
  | { status: 'ok'; summary: ResultSummary; expiresAt: string }
  | { status: 'invalid' | 'missing' | 'expired' };

export class PersistentResultSessionService {
  readonly #repository: ResultSessionRepository;
  readonly #now: () => number;
  readonly #ttlMs: number;
  readonly #generateToken: () => string;

  constructor(repository: ResultSessionRepository, options: {
    now?: () => number;
    ttlMs?: number;
    generateToken?: () => string;
  } = {}) {
    this.#repository = repository;
    this.#now = options.now ?? (() => Date.now());
    this.#ttlMs = options.ttlMs ?? RESULT_SESSION_TTL_MS;
    this.#generateToken = options.generateToken ?? (() => randomBytes(32).toString('hex'));
    if (!Number.isInteger(this.#ttlMs) || this.#ttlMs < 60_000 || this.#ttlMs > 24 * 60 * 60 * 1000) {
      throw new Error('INVALID_SESSION_TTL');
    }
  }

  async create(summary: unknown) {
    if (!isValidResultSummary(summary)) throw new Error('INVALID_SUMMARY');
    const expiresAt = new Date(this.#now() + this.#ttlMs).toISOString();
    const ttlSeconds = Math.ceil(this.#ttlMs / 1000);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = this.#generateToken();
      if (!isOpaqueResultToken(token)) throw new Error('INVALID_SESSION_TOKEN');
      const created = await this.#repository.putIfAbsent(token, { summary: structuredClone(summary), expiresAt }, ttlSeconds);
      if (created) return { token, expiresAt };
    }
    throw new Error('SESSION_TOKEN_COLLISION');
  }

  async read(token: string): Promise<PersistentSessionResult> {
    if (!isOpaqueResultToken(token)) return { status: 'invalid' };
    const record = await this.#repository.read(token);
    if (!record) return { status: 'missing' };
    if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= this.#now()) {
      await this.#repository.delete(token);
      return { status: 'expired' };
    }
    if (!isValidResultSummary(record.summary)) {
      await this.#repository.delete(token);
      return { status: 'invalid' };
    }
    return { status: 'ok', summary: structuredClone(record.summary), expiresAt: record.expiresAt };
  }

  async delete(token: string): Promise<boolean> {
    if (!isOpaqueResultToken(token)) return false;
    await this.#repository.delete(token);
    return true;
  }
}

export function resultSessionPublicBaseUrl(
  env: Readonly<Record<string, string | undefined>>,
  hostHeader?: string,
): string {
  const explicit = env.EVENT_RESULT_PUBLIC_BASE_URL?.trim();
  if (explicit) {
    const url = new URL(explicit);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new Error('INVALID_PUBLIC_BASE_URL');
    return url.origin;
  }
  const vercelHost = env.VERCEL_URL?.trim();
  if (vercelHost && /^[a-z0-9.-]+\.vercel\.app$/i.test(vercelHost)) return `https://${vercelHost}`;
  if (hostHeader && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostHeader)) return `http://${hostHeader}`;
  throw new Error('PUBLIC_BASE_URL_UNCONFIGURED');
}
