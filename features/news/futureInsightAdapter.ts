import type {
  FutureExternalInsight,
  FutureSimulation,
} from '../../domain/futureSimulation.ts';
import type { NewsArticle, NewsRelevance } from './types.ts';

export type RelevantNewsInsight = {
  article: NewsArticle;
  relevance: NewsRelevance;
};

export function mapNewsToFutureExternalInsight(
  article: NewsArticle,
  relevance: NewsRelevance,
): FutureExternalInsight {
  const category: FutureExternalInsight['category'] = article.topics.some(
    (topic) => topic === 'housing_policy' || topic === 'special_supply',
  )
    ? 'policy'
    : article.topics.includes('housing_market')
      ? 'market'
      : 'news';
  return {
    id: `news-insight-${article.id}`,
    category,
    title: article.title,
    note: `${relevance.reasons.slice(0, 2).join(' · ')} · 준비도 계산에는 반영되지 않아요.`,
    observedAt: article.publishedAt,
  };
}

/**
 * 계산 완료된 simulation의 현재 시점에 설명 레이어만 붙인다.
 * score/profile/change/milestone 수치는 복사하며 다시 계산하거나 수정하지 않는다.
 */
export function attachNewsExternalInsights(
  simulation: FutureSimulation,
  news: readonly RelevantNewsInsight[],
): FutureSimulation {
  const insights = news
    .filter(({ relevance }) => relevance.level !== 'low')
    .map(({ article, relevance }) => mapNewsToFutureExternalInsight(article, relevance))
    .slice(0, 3);
  if (insights.length === 0) return simulation;

  return {
    ...simulation,
    timeline: simulation.timeline.map((point, index) => index === 0
      ? {
          ...point,
          externalInsights: insights,
          nextMilestone: { ...point.nextMilestone, externalInsights: insights },
        }
      : point),
  };
}
