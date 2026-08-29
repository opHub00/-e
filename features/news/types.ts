export const NEWS_TOPICS = [
  'subscription',
  'housing_policy',
  'youth',
  'special_supply',
  'housing_market',
  'finance',
] as const;

export type NewsTopic = (typeof NEWS_TOPICS)[number];
export type NewsSourceType = 'news' | 'official' | 'unknown';

/** Naver 원문 메타데이터만 보존하는 앱 내부 뉴스 모델. 기사 본문은 포함하지 않는다. */
export type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  originalUrl: string;
  publishedAt: string;
  sourceDomain: string;
  topics: NewsTopic[];
  sourceType: NewsSourceType;
};

export type NewsRelevanceLevel = 'high' | 'medium' | 'low';
export type NewsRelevanceSignal =
  | 'youth'
  | 'no-home'
  | 'region'
  | 'subscription-account'
  | 'regular-contribution'
  | 'general';

export type NewsRelevance = {
  level: NewsRelevanceLevel;
  reasons: string[];
  signals: NewsRelevanceSignal[];
};
