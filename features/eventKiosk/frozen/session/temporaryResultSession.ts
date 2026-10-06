import type { AssessmentContext } from '../consultation/context.ts';

export type TemporaryResultSession = {
  token: string;
  createdAt: string;
  expiresAt: string;
  selectedListingIds: string[];
  context: AssessmentContext;
};

export type CreateTemporaryResultSessionInput = {
  context: AssessmentContext;
  selectedListingIds: string[];
  ttlSeconds?: number;
};

export interface TemporaryResultSessionStore {
  create(input: CreateTemporaryResultSessionInput): Promise<TemporaryResultSession>;
  get(token: string): Promise<TemporaryResultSession | null>;
  delete(token: string): Promise<void>;
  purgeExpired(): Promise<number>;
}

type StoredSession = Omit<TemporaryResultSession, 'token'>;

export class InMemoryTemporaryResultSessionStore implements TemporaryResultSessionStore {
  readonly #records = new Map<string, StoredSession>();
  readonly #now: () => Date;
  readonly #generateToken: () => string;
  readonly #defaultTtlSeconds: number;

  constructor(options: {
    now?: () => Date;
    generateToken?: () => string;
    defaultTtlSeconds?: number;
  } = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#generateToken = options.generateToken ?? generateOpaqueToken;
    this.#defaultTtlSeconds = options.defaultTtlSeconds ?? 60 * 60 * 6;
  }

  async create(input: CreateTemporaryResultSessionInput): Promise<TemporaryResultSession> {
    const ttlSeconds = input.ttlSeconds ?? this.#defaultTtlSeconds;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 60 * 60 * 24) {
      throw new Error('Session TTL must be between 60 seconds and 24 hours');
    }
    const availableListings = new Set(input.context.assessments.map(item => item.listingId));
    const selectedListingIds = [...new Set(input.selectedListingIds)];
    if (selectedListingIds.length === 0 || selectedListingIds.some(id => !availableListings.has(id))) {
      throw new Error('Selected listings must exist in AssessmentContext');
    }
    let token = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      token = this.#generateToken();
      assertOpaqueToken(token);
      if (!this.#records.has(token)) break;
      token = '';
    }
    if (!token) throw new Error('Unable to allocate a unique result token');
    const now = this.#now();
    const record: StoredSession = {
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      selectedListingIds,
      context: structuredClone(input.context),
    };
    this.#records.set(token, record);
    return cloneSession(token, record);
  }

  async get(token: string): Promise<TemporaryResultSession | null> {
    if (!isOpaqueToken(token)) return null;
    const record = this.#records.get(token);
    if (!record) return null;
    if (Date.parse(record.expiresAt) <= this.#now().getTime()) {
      this.#records.delete(token);
      return null;
    }
    return cloneSession(token, record);
  }

  async delete(token: string): Promise<void> {
    this.#records.delete(token);
  }

  async purgeExpired(): Promise<number> {
    const now = this.#now().getTime();
    let removed = 0;
    for (const [token, record] of this.#records) {
      if (Date.parse(record.expiresAt) <= now) {
        this.#records.delete(token);
        removed += 1;
      }
    }
    return removed;
  }
}

export function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function createQrResultUrl(baseUrl: string, token: string): string {
  assertOpaqueToken(token);
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash) throw new Error('Result base URL must not contain credentials, query, or fragment');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
    throw new Error('Result URLs require HTTPS except on localhost');
  }
  return new URL(`/results/${token}`, base).toString();
}

function cloneSession(token: string, record: StoredSession): TemporaryResultSession {
  return { token, ...structuredClone(record) };
}

function isOpaqueToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

function assertOpaqueToken(token: string): void {
  if (!isOpaqueToken(token)) throw new Error('Invalid opaque result token');
}
