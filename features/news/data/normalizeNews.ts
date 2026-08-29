import { NEWS_TOPICS, type NewsArticle, type NewsSourceType, type NewsTopic } from '../types.ts';
import type { NewsValidationIssue, RawNewsRecord } from './NewsProvider.ts';

export const MAX_NEWS_AGE_DAYS = 90;
export const MAX_NEWS_TITLE_LENGTH = 180;
export const MAX_NEWS_SUMMARY_LENGTH = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = DAY_MS;

const OFFICIAL_DOMAINS = [
  'applyhome.co.kr',
  'gov.kr',
  'korea.kr',
  'lh.or.kr',
  'molit.go.kr',
  'myhome.go.kr',
  'seoul.go.kr',
  'gg.go.kr',
  'incheon.go.kr',
] as const;

const TOPIC_KEYWORDS: Readonly<Record<NewsTopic, readonly RegExp[]>> = {
  subscription: [/청약/, /분양\s*공고/, /입주자\s*모집/],
  housing_policy: [/주거\s*정책/, /주택\s*정책/, /청약\s*제도/, /제도\s*개편/, /국토교통부/, /공급\s*대책/],
  youth: [/청년/, /신혼/, /대학생/, /사회\s*초년생/],
  special_supply: [/특별\s*공급/, /특공/],
  housing_market: [/분양/, /주택\s*시장/, /아파트/, /공급\s*물량/, /입주\s*물량/, /미분양/],
  finance: [/대출/, /금리/, /주택도시기금/, /자금/, /납입/, /분양가/, /전세/],
};

type NormalizeNewsContext = {
  fetchedAt: string;
  referenceDate?: Date;
  maxAgeDays?: number;
  recordIndex?: number;
};

export type NormalizedNewsRecord = {
  article: NewsArticle | null;
  issues: NewsValidationIssue[];
};

export type NormalizedNewsBatch = {
  articles: NewsArticle[];
  issues: NewsValidationIssue[];
};

export function stripNewsHtml(value: unknown): string {
  const input = value === null || value === undefined ? '' : String(value);
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function classifyNewsTopics(title: string, summary = ''): NewsTopic[] {
  const text = `${stripNewsHtml(title)} ${stripNewsHtml(summary)}`;
  return NEWS_TOPICS.filter((topic) => TOPIC_KEYWORDS[topic].some((pattern) => pattern.test(text)));
}

export function normalizeNewsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|n_media|n_query|n_rank|n_ad_group|n_ad)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeNaverNewsItem(
  input: unknown,
  context: NormalizeNewsContext,
): NormalizedNewsRecord {
  const recordIndex = context.recordIndex ?? 0;
  const issues: NewsValidationIssue[] = [];
  const addIssue = (
    field: string,
    code: NewsValidationIssue['code'],
    severity: NewsValidationIssue['severity'],
    message: string,
  ) => issues.push({ recordIndex, field, code, severity, message });

  if (!isRecord(input)) {
    addIssue('record', 'invalid-record', 'error', '기사 원본이 객체 형식이 아니어서 제외했습니다.');
    return { article: null, issues };
  }

  const title = limitText(stripNewsHtml(input.title), MAX_NEWS_TITLE_LENGTH);
  if (!title) {
    addIssue('title', 'missing-value', 'error', '기사 제목이 없어 제외했습니다.');
    return { article: null, issues };
  }

  const originalUrl = normalizeNewsUrl(input.originallink) ?? normalizeNewsUrl(input.link);
  if (!originalUrl) {
    addIssue('originalUrl', 'invalid-value', 'error', '안전한 원문 URL이 없어 제외했습니다.');
    return { article: null, issues };
  }

  const publishedDate = parseDate(input.pubDate);
  if (!publishedDate) {
    addIssue('publishedAt', 'invalid-value', 'error', '기사 발행일을 확인할 수 없어 제외했습니다.');
    return { article: null, issues };
  }

  const fetchedAt = parseDate(context.fetchedAt) ?? new Date();
  const referenceDate = isValidDate(context.referenceDate) ? context.referenceDate : fetchedAt;
  const maxAgeDays = normalizeMaxAge(context.maxAgeDays);
  if (publishedDate.getTime() < referenceDate.getTime() - maxAgeDays * DAY_MS) {
    addIssue('publishedAt', 'too-old', 'warning', `${maxAgeDays}일보다 오래된 기사라 제외했습니다.`);
    return { article: null, issues };
  }
  if (publishedDate.getTime() > referenceDate.getTime() + FUTURE_TOLERANCE_MS) {
    addIssue('publishedAt', 'future-date', 'error', '현재보다 미래의 발행일이라 제외했습니다.');
    return { article: null, issues };
  }

  let summary = limitText(stripNewsHtml(input.description), MAX_NEWS_SUMMARY_LENGTH);
  if (!summary) {
    summary = 'API 요약 정보가 없어 원문 확인이 필요해요.';
    addIssue('summary', 'missing-value', 'warning', '요약이 없어 안전한 대체 문구를 사용했습니다.');
  }

  const sourceDomain = new URL(originalUrl).hostname.replace(/^www\./, '');
  const sourceType = getNewsSourceType(sourceDomain);
  return {
    article: {
      id: `news-${stableHash(originalUrl)}`,
      title,
      summary,
      originalUrl,
      publishedAt: publishedDate.toISOString(),
      sourceDomain,
      topics: classifyNewsTopics(title, summary),
      sourceType,
    },
    issues,
  };
}

export function normalizeNewsBatch(
  records: unknown,
  context: Omit<NormalizeNewsContext, 'recordIndex'>,
): NormalizedNewsBatch {
  if (!Array.isArray(records)) {
    return {
      articles: [],
      issues: [{
        recordIndex: -1,
        field: 'records',
        code: 'invalid-record',
        severity: 'error',
        message: '기사 목록이 배열 형식이 아니어서 사용할 수 없습니다.',
      }],
    };
  }

  const normalized: Array<{ article: NewsArticle; recordIndex: number }> = [];
  const issues: NewsValidationIssue[] = [];
  records.forEach((record, recordIndex) => {
    const result = normalizeNaverNewsItem(record, { ...context, recordIndex });
    issues.push(...result.issues);
    if (result.article) normalized.push({ article: result.article, recordIndex });
  });

  normalized.sort((a, b) => b.article.publishedAt.localeCompare(a.article.publishedAt));
  const articles: NewsArticle[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  for (const item of normalized) {
    const titleKey = item.article.title.toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
    if (seenUrls.has(item.article.originalUrl)) {
      issues.push({
        recordIndex: item.recordIndex,
        field: 'originalUrl',
        code: 'duplicate-url',
        severity: 'warning',
        message: '같은 원문 URL의 중복 기사를 제외했습니다.',
      });
      continue;
    }
    if (seenTitles.has(titleKey)) {
      issues.push({
        recordIndex: item.recordIndex,
        field: 'title',
        code: 'duplicate-title',
        severity: 'warning',
        message: '제목이 같은 중복 기사를 제외했습니다.',
      });
      continue;
    }
    seenUrls.add(item.article.originalUrl);
    seenTitles.add(titleKey);
    articles.push(item.article);
  }

  return { articles, issues };
}

export function getNewsSourceType(domain: string): NewsSourceType {
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  if (OFFICIAL_DOMAINS.some((official) => normalized === official || normalized.endsWith(`.${official}`))) {
    return 'official';
  }
  return normalized ? 'news' : 'unknown';
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"', '#39': "'",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in named) return named[lower];
    const radix = lower.startsWith('#x') ? 16 : 10;
    const digits = lower.startsWith('#x') ? lower.slice(2) : lower.startsWith('#') ? lower.slice(1) : '';
    if (!digits) return match;
    const codePoint = Number.parseInt(digits, radix);
    try {
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    } catch {
      return match;
    }
  });
}

function limitText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return isValidDate(date) ? date : null;
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizeMaxAge(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.min(365, Math.floor(Number(value))) : MAX_NEWS_AGE_DAYS;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isRecord(value: unknown): value is RawNewsRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
