import type { UserProfile } from '../../domain/types.ts';
import { getNewsRelevance } from './relevance.ts';
import type { NewsArticle, NewsRelevance } from './types.ts';

export type NewsQuality = {
  eligible: boolean;
  score: number;
  reasons: string[];
};

export type RankedNews = {
  article: NewsArticle;
  relevance: NewsRelevance;
};

const OPINION_TITLE_PATTERNS = [
  /^\s*[\[［【](?:시론|칼럼|사설|기고|오피니언)[\]］】]/,
  /^\s*(?:시론|칼럼|사설|기고|오피니언)(?:\s|[:：|·-])/,
] as const;

const HOUSING_CORE_SIGNALS = [
  ['청약', /청약/],
  ['분양', /분양/],
  ['모집공고', /모집\s*공고|입주자\s*모집/],
  ['공공주택', /공공\s*주택/],
  ['공공임대', /공공\s*임대/],
  ['임대주택', /임대\s*주택/],
  ['주택공급', /주택\s*공급|주거\s*공급/],
  ['특별공급', /특별\s*공급|특공/],
  ['무주택', /무주택/],
  ['청년주택', /청년.{0,12}주택/],
  ['신혼희망타운', /신혼\s*희망\s*타운/],
  ['주거정책', /주거\s*정책|주택\s*정책/],
] as const;

const RELEVANCE_ORDER: Record<NewsRelevance['level'], number> = { high: 0, medium: 1, low: 2 };

export function isOpinionNewsTitle(title: string): boolean {
  return OPINION_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/** AI가 아니라 제목·Naver description의 명시적인 주거 신호만 평가한다. */
export function evaluateNewsQuality(article: NewsArticle): NewsQuality {
  if (isOpinionNewsTitle(article.title)) {
    return { eligible: false, score: 0, reasons: ['의견·사설 형식'] };
  }

  const titleSignals = getHousingCoreSignals(article.title);
  const summarySignals = getHousingCoreSignals(article.summary);
  const summaryOnly = summarySignals.filter((signal) => !titleSignals.includes(signal));
  const score = titleSignals.length * 3 + summaryOnly.length;
  const eligible = titleSignals.length > 0 || summarySignals.length >= 2;

  if (!eligible) {
    return {
      eligible: false,
      score,
      reasons: summarySignals.length === 0
        ? ['주거·청약 핵심 신호 없음']
        : ['주거·청약 신호가 요약에만 단일 언급'],
    };
  }

  return {
    eligible: true,
    score,
    reasons: [
      ...(titleSignals.length ? [`제목 핵심 신호: ${titleSignals.join('·')}`] : []),
      ...(summaryOnly.length ? [`요약 핵심 신호: ${summaryOnly.join('·')}`] : []),
    ],
  };
}

/** quality gate → housing core score → 사용자 관련성 → 최신순. */
export function rankNewsForBriefing(profile: UserProfile, articles: NewsArticle[]): RankedNews[] {
  return articles
    .map((article) => ({ article, quality: evaluateNewsQuality(article) }))
    .filter(({ quality }) => quality.eligible)
    .map(({ article, quality }) => ({ article, quality, relevance: getNewsRelevance(profile, article) }))
    .filter(({ relevance }) => relevance.level !== 'low')
    .sort((a, b) => (
      b.quality.score - a.quality.score
      || RELEVANCE_ORDER[a.relevance.level] - RELEVANCE_ORDER[b.relevance.level]
      || b.article.publishedAt.localeCompare(a.article.publishedAt)
    ))
    .map(({ article, relevance }) => ({ article, relevance }));
}

function getHousingCoreSignals(text: string): string[] {
  const signals: string[] = HOUSING_CORE_SIGNALS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
  if (/(?:재건축|재개발)/.test(text) && /(?:주택\s*공급|분양|공공\s*주택|정비\s*사업)/.test(text)) {
    signals.push('정비사업 주택공급');
  }
  return signals;
}
