import { randomBytes } from 'node:crypto';

export const RESULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
export const RESULT_SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const TOP_LEVEL_KEYS = ['cautions', 'counts', 'date', 'event', 'favorites', 'household', 'recommended', 'v'];
const FOCUSED_TOP_LEVEL_KEYS = ['cautions', 'date', 'event', 'focus', 'title', 'v'];
const FOCUSED_ITEM_KEYS = ['applicationDate', 'checks', 'eligibility', 'kind', 'officialScore', 'reasons', 'stage', 'supply'];
const FOCUSED_SCORE_KEYS = ['label', 'status'];
const ITEM_KEYS = ['bucket', 'note', 'stage', 'supply', 'title'];
const PORTFOLIO_ITEM_KEYS = ['applicationEnd', 'applicationStart', 'bucket', 'cautions', 'location', 'nearbyHighlights', 'note', 'officialScoreStatus', 'rank', 'sourceLabel', 'sourceUrl', 'stage', 'status', 'supply', 'title', 'wanpanRecommendation', 'whyMatched'];
const BUCKETS = new Set(['eligible', 'review', 'difficult']);
const ASSESSMENT_STATUSES = new Set(['COMPLETE', 'NEEDS_USER_INPUT', 'INELIGIBLE', 'UNAVAILABLE', 'INFORMATION_ONLY']);
const SCORE_STATUSES = new Set(['AVAILABLE', 'PENDING', 'NOT_APPLICABLE']);
const FOCUSED_ELIGIBILITY = new Set(['ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE', 'EVIDENCE_REQUIRED']);
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

function validTextArray(value, maxItems, maxLength = 500) {
  return Array.isArray(value) && value.length <= maxItems && value.every(item => validText(item, maxLength));
}

function validPortfolioItem(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && hasExactKeys(value, PORTFOLIO_ITEM_KEYS)
    && validText(value.title, 300)
    && validText(value.supply, 120)
    && BUCKETS.has(value.bucket)
    && validText(value.stage, 120, true)
    && validText(value.note, 500, true)
    && ASSESSMENT_STATUSES.has(value.status)
    && Number.isInteger(value.rank) && value.rank > 0 && value.rank <= 1000
    && SCORE_STATUSES.has(value.officialScoreStatus)
    && validText(value.wanpanRecommendation, 120)
    && validTextArray(value.whyMatched, 5)
    && validTextArray(value.cautions, 5)
    && validText(value.applicationStart, 10, true)
    && validText(value.applicationEnd, 10, true)
    && validText(value.location, 300, true)
    && validTextArray(value.nearbyHighlights, 5)
    && validText(value.sourceLabel, 120)
    && validText(value.sourceUrl, 1000)
    && /^https:\/\//.test(value.sourceUrl);
}

function validFocusedItem(value) {
  if (value === null) return true;
  return value && typeof value === 'object' && !Array.isArray(value)
    && hasExactKeys(value, FOCUSED_ITEM_KEYS)
    && (value.kind === 'RECOMMENDED' || value.kind === 'REVIEW')
    && validText(value.supply, 120)
    && FOCUSED_ELIGIBILITY.has(value.eligibility)
    && validText(value.stage, 160)
    && value.officialScore && typeof value.officialScore === 'object' && !Array.isArray(value.officialScore)
    && hasExactKeys(value.officialScore, FOCUSED_SCORE_KEYS)
    && SCORE_STATUSES.has(value.officialScore.status)
    && validText(value.officialScore.label, 160)
    && validTextArray(value.reasons, 6)
    && validTextArray(value.checks, 8)
    && /^\d{4}-\d{2}-\d{2}$/.test(value.applicationDate);
}

export function isValidResultSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.v === 3) {
    if (!hasExactKeys(value, FOCUSED_TOP_LEVEL_KEYS) || !validText(value.event, 120) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
    if (!validText(value.title, 300) || !validFocusedItem(value.focus) || !validTextArray(value.cautions, 20)) return false;
    const raw = JSON.stringify(value);
    return raw.length <= 48_000 && !PRIVATE_KEY.test(raw);
  }
  if (!hasExactKeys(value, TOP_LEVEL_KEYS)) return false;
  if ((value.v !== 1 && value.v !== 2) || !validText(value.event, 120) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
  if (!validText(value.household, 120, true)) return false;
  if (!value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts)) return false;
  if (!hasExactKeys(value.counts, ['difficult', 'eligible', 'review'])) return false;
  if (!Object.values(value.counts).every(count => Number.isInteger(count) && count >= 0 && count <= 1000)) return false;
  const validVersionItem = value.v === 1 ? validItem : validPortfolioItem;
  if (!Array.isArray(value.recommended) || value.recommended.length > 20 || !value.recommended.every(validVersionItem)) return false;
  if (!Array.isArray(value.favorites) || value.favorites.length > 20 || !value.favorites.every(validVersionItem)) return false;
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
