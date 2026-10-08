import { randomBytes } from 'node:crypto';

export const RESULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
export const RESULT_SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const TOP_LEVEL_KEYS = ['cautions', 'counts', 'date', 'event', 'favorites', 'household', 'recommended', 'v'];
const ITEM_KEYS = ['bucket', 'note', 'stage', 'supply', 'title'];
const BUCKETS = new Set(['eligible', 'review', 'difficult']);
const PRIVATE_KEY = /(?:displayName|birthDate|monthlyIncome|totalAssets|profileId|personId|applicant|spouse)/i;

export function isOpaqueResultToken(value) {
  return typeof value === 'string' && RESULT_SESSION_TOKEN_PATTERN.test(value);
}

function hasExactKeys(value, keys) {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

function validText(value, maxLength, nullable = false) {
  return (nullable && value === null) || (typeof value === 'string' && value.length <= maxLength);
}

function validItem(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && hasExactKeys(value, ITEM_KEYS)
    && validText(value.title, 300)
    && validText(value.supply, 120)
    && BUCKETS.has(value.bucket)
    && validText(value.stage, 120, true)
    && validText(value.note, 500, true);
}

export function isValidResultSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasExactKeys(value, TOP_LEVEL_KEYS)) return false;
  if (value.v !== 1 || !validText(value.event, 120) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
  if (!validText(value.household, 120, true)) return false;
  if (!value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts)) return false;
  if (!hasExactKeys(value.counts, ['difficult', 'eligible', 'review'])) return false;
  if (!Object.values(value.counts).every(count => Number.isInteger(count) && count >= 0 && count <= 1000)) return false;
  if (!Array.isArray(value.recommended) || value.recommended.length > 20 || !value.recommended.every(validItem)) return false;
  if (!Array.isArray(value.favorites) || value.favorites.length > 20 || !value.favorites.every(validItem)) return false;
  if (!Array.isArray(value.cautions) || value.cautions.length > 20 || !value.cautions.every(item => validText(item, 500))) return false;
  const raw = JSON.stringify(value);
  return raw.length <= 48_000 && !PRIVATE_KEY.test(raw);
}

export class InMemoryResultSessionStore {
  #records = new Map();
  #now;
  #ttlMs;
  #generateToken;

  constructor({ now = () => Date.now(), ttlMs = RESULT_SESSION_TTL_MS, generateToken = () => randomBytes(32).toString('hex') } = {}) {
    if (!Number.isInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 24 * 60 * 60 * 1000) throw new Error('INVALID_SESSION_TTL');
    this.#now = now;
    this.#ttlMs = ttlMs;
    this.#generateToken = generateToken;
  }

  create(summary) {
    if (!isValidResultSummary(summary)) throw new Error('INVALID_SUMMARY');
    let token = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = this.#generateToken();
      if (!isOpaqueResultToken(candidate)) throw new Error('INVALID_SESSION_TOKEN');
      if (!this.#records.has(candidate)) { token = candidate; break; }
    }
    if (!token) throw new Error('SESSION_TOKEN_COLLISION');
    const expiresAt = this.#now() + this.#ttlMs;
    this.#records.set(token, { summary: structuredClone(summary), expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  read(token) {
    if (!isOpaqueResultToken(token)) return { status: 'invalid' };
    const record = this.#records.get(token);
    if (!record) return { status: 'missing' };
    if (record.expiresAt <= this.#now()) {
      this.#records.delete(token);
      return { status: 'expired' };
    }
    return { status: 'ok', summary: structuredClone(record.summary), expiresAt: new Date(record.expiresAt).toISOString() };
  }

  delete(token) { this.#records.delete(token); }

  purgeExpired() {
    const now = this.#now();
    let removed = 0;
    for (const [token, record] of this.#records) {
      if (record.expiresAt <= now) { this.#records.delete(token); removed += 1; }
    }
    return removed;
  }
}
