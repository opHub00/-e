import type { UserProfile } from '../../domain/types.ts';
import type {
  NewsArticle,
  NewsRelevance,
  NewsRelevanceSignal,
} from './types.ts';

type RelevanceMatch = {
  weight: number;
  reason: string;
  signal: NewsRelevanceSignal;
};

export type NewsProfileSignals = {
  age: number;
  region: string;
  isNoHomeOwner: boolean;
  hasSubscriptionAccount: boolean;
  hasRegularContribution: boolean;
};

/** 개인화 관심도일 뿐 신청 자격·우선순위·가점·당첨 가능성을 판정하지 않는다. */
export function getNewsRelevance(input: UserProfile, article: NewsArticle): NewsRelevance {
  const hasSubscriptionAccount = Boolean(input.hasSubscriptionAccount);
  return getNewsRelevanceFromSignals({
    age: Math.min(99, Math.max(15, Math.floor(Number.isFinite(input.age) ? input.age : 15))),
    region: input.region.trim(),
    isNoHomeOwner: Boolean(input.isNoHomeOwner),
    hasSubscriptionAccount,
    hasRegularContribution: hasSubscriptionAccount && input.monthlyPayment > 0,
  }, article);
}

/** Edge에서도 client가 보낸 reason을 신뢰하지 않고 동일한 relevance를 재구성할 때 사용한다. */
export function getNewsRelevanceFromSignals(
  profile: NewsProfileSignals,
  article: NewsArticle,
): NewsRelevance {
  const text = `${article.title} ${article.summary}`;
  const matches: RelevanceMatch[] = [];

  if (profile.age >= 19 && profile.age <= 39 && article.topics.includes('youth')) {
    matches.push({ weight: 2, reason: '청년 관련 주거 정보', signal: 'youth' });
  }

  if (
    profile.isNoHomeOwner
    && (
      /무주택/.test(text)
      || article.topics.includes('subscription')
      || article.topics.includes('housing_policy')
      || article.topics.includes('special_supply')
    )
  ) {
    matches.push({ weight: 2, reason: '무주택 사용자가 참고할 내용', signal: 'no-home' });
  }

  const regionKeyword = normalizeRegionKeyword(profile.region);
  if (regionKeyword && text.includes(regionKeyword)) {
    matches.push({ weight: 2, reason: `${regionKeyword} 관심 지역과 관련된 내용`, signal: 'region' });
  }

  if (profile.hasSubscriptionAccount && article.topics.includes('subscription')) {
    matches.push({ weight: 1, reason: '청약통장을 유지 중인 사용자가 살펴볼 내용', signal: 'subscription-account' });
  }

  if (profile.hasRegularContribution && article.topics.includes('finance')) {
    matches.push({ weight: 1, reason: '정기 납입 습관과 함께 참고할 금융 정보', signal: 'regular-contribution' });
  }

  const unique = deduplicateMatches(matches);
  const weight = unique.reduce((sum, match) => sum + match.weight, 0);
  if (unique.length === 0) {
    return {
      level: 'low',
      reasons: ['청약·주거 흐름을 이해할 때 참고할 내용'],
      signals: ['general'],
    };
  }

  return {
    level: weight >= 4 ? 'high' : weight >= 2 ? 'medium' : 'low',
    reasons: unique.slice(0, 3).map((match) => match.reason),
    signals: unique.slice(0, 3).map((match) => match.signal),
  };
}

function normalizeRegionKeyword(region: string): string {
  const value = region.trim();
  if (value.includes('서울')) return '서울';
  if (value.includes('경기')) return '경기';
  if (value.includes('인천')) return '인천';
  return value.slice(0, 12);
}

function deduplicateMatches(matches: RelevanceMatch[]): RelevanceMatch[] {
  const seen = new Set<NewsRelevanceSignal>();
  return matches.filter((match) => {
    if (seen.has(match.signal)) return false;
    seen.add(match.signal);
    return true;
  });
}
