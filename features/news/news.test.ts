import { calculatePreparationScore } from '../../domain/preparation.ts';
import { createFutureScenarios, simulateFutureTimeline } from '../../domain/futureSimulation.ts';
import type { UserProfile } from '../../domain/types.ts';
import {
  buildNewsImpactContext,
  buildNewsImpactBriefing,
  buildNewsPersonalizationContext,
  containsForbiddenInference,
  createNewsImpactFallback,
  getNewsImpactGroundingIssues,
  getNewsPersonalizationIssues,
  formatNewsPersonalizationContextForPrompt,
  isTruncatedNewsDescription,
  parseNewsImpactBriefing,
  parseNewsImpactContext,
} from './ai.ts';
import { CuratedNewsProvider } from './data/CuratedNewsProvider.ts';
import { NewsRepository } from './data/NewsRepository.ts';
import type { NewsProvider } from './data/NewsProvider.ts';
import {
  MAX_NEWS_SUMMARY_LENGTH,
  MAX_NEWS_TITLE_LENGTH,
  classifyNewsTopics,
  normalizeNaverNewsItem,
  normalizeNewsBatch,
  normalizeNewsUrl,
  stripNewsHtml,
} from './data/normalizeNews.ts';
import { attachNewsExternalInsights, mapNewsToFutureExternalInsight } from './futureInsightAdapter.ts';
import { evaluateNewsQuality, isOpinionNewsTitle, rankNewsForBriefing } from './quality.ts';
import { getNewsRelevance } from './relevance.ts';
import {
  DEFAULT_NEWS_QUERIES,
  NaverNewsProvider,
  type NewsFetch,
} from './server/NaverNewsProvider.ts';
import type { NewsArticle } from './types.ts';

let checks = 0;
const ok = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const eq = (actual: unknown, expected: unknown, message: string) => {
  ok(actual === expected, `${message} (${String(actual)} !== ${String(expected)})`);
};

const NOW = new Date('2026-08-25T06:00:00.000Z');
const profile: UserProfile = {
  name: '민지',
  age: 29,
  occupation: 'worker',
  region: '서울',
  hasSubscriptionAccount: true,
  accountMonths: 14,
  monthlyPayment: 100_000,
  isNoHomeOwner: true,
};

const rawFixture = [
  {
    title: '<b>서울</b> 청년 주거 &amp; 주택청약 안내',
    description: '<b>무주택</b> 청년이 공식 공고에서 확인할 내용을 안내합니다.',
    originallink: 'https://news.example.com/article/alpha?utm_source=naver',
    link: 'https://n.news.naver.com/alpha',
    pubDate: 'Tue, 25 Aug 2026 12:00:00 +0900',
  },
  {
    title: '분양 시장과 금리 동향',
    description: '주택 시장의 분양가와 대출 금리 관련 기사 요약입니다.',
    originallink: 'https://news.example.com/article/beta',
    link: 'https://n.news.naver.com/beta',
    pubDate: 'Mon, 24 Aug 2026 10:00:00 +0900',
  },
  {
    title: '서울 청년 주거 &amp; 주택청약 안내',
    description: '다른 검색어에서 다시 수집된 중복 기사입니다.',
    originallink: 'https://news.example.com/article/alpha',
    link: 'https://n.news.naver.com/alpha-copy',
    pubDate: 'Mon, 24 Aug 2026 09:00:00 +0900',
  },
  {
    title: '분양 시장과 금리 동향',
    description: 'URL은 다르지만 제목이 같은 중복 기사입니다.',
    originallink: 'https://another.example.com/beta-copy',
    link: 'https://n.news.naver.com/beta-copy',
    pubDate: 'Sun, 23 Aug 2026 09:00:00 +0900',
  },
];

// Naver fixture normalization / HTML entity / URL safety
const normalizedOne = normalizeNaverNewsItem(rawFixture[0], {
  fetchedAt: NOW.toISOString(),
  referenceDate: NOW,
});
ok(normalizedOne.article, '정상 Naver fixture가 기사로 변환되어야 한다');
eq(normalizedOne.article?.title, '서울 청년 주거 & 주택청약 안내', '<b>와 HTML entity 제거');
ok(!normalizedOne.article?.summary.includes('<b>'), 'description의 HTML 태그 제거');
eq(normalizedOne.article?.originalUrl, 'https://news.example.com/article/alpha', '추적 query 제거');
eq(normalizedOne.article?.sourceDomain, 'news.example.com', 'source domain 추출');
eq(normalizedOne.article?.sourceType, 'news', '일반 기사 source type');
ok(normalizedOne.article?.topics.includes('subscription'), '청약 topic 분류');
ok(normalizedOne.article?.topics.includes('youth'), '청년 topic 분류');

eq(stripNewsHtml('A <b>B</b> &quot;C&quot; &#54620;'), 'A B "C" 한', 'HTML/numeric entity 제거');
eq(normalizeNewsUrl('javascript:alert(1)'), null, '비 HTTP URL 차단');
eq(normalizeNewsUrl('not a url'), null, 'malformed URL 차단');
const malformed = normalizeNaverNewsItem({
  title: '주소가 잘못된 기사',
  description: '요약',
  originallink: 'javascript:alert(1)',
  link: 'also invalid',
  pubDate: NOW.toUTCString(),
}, { fetchedAt: NOW.toISOString(), referenceDate: NOW });
eq(malformed.article, null, '원문/대체 URL 모두 잘못되면 제외');
ok(malformed.issues.some((issue) => issue.field === 'originalUrl'), 'URL validation issue 기록');

const longText = '가'.repeat(700);
const limited = normalizeNaverNewsItem({
  title: longText,
  description: longText,
  originallink: 'https://news.example.com/long',
  pubDate: NOW.toUTCString(),
}, { fetchedAt: NOW.toISOString(), referenceDate: NOW });
eq(limited.article?.title.length, MAX_NEWS_TITLE_LENGTH, '제목 길이 제한');
eq(limited.article?.summary.length, MAX_NEWS_SUMMARY_LENGTH, '요약 길이 제한');

const old = normalizeNaverNewsItem({
  title: '오래된 청약 기사',
  description: '오래된 요약',
  originallink: 'https://news.example.com/old',
  pubDate: new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1000).toUTCString(),
}, { fetchedAt: NOW.toISOString(), referenceDate: NOW });
eq(old.article, null, '90일보다 오래된 기사 제외');
ok(old.issues.some((issue) => issue.code === 'too-old'), '오래된 기사 issue 기록');

// deduplicate and newest-first sort
const batch = normalizeNewsBatch(rawFixture, {
  fetchedAt: NOW.toISOString(),
  referenceDate: NOW,
});
eq(batch.articles.length, 2, 'URL/제목 중복 제거');
ok(batch.articles[0].publishedAt > batch.articles[1].publishedAt, '날짜 내림차순 정렬');
ok(batch.issues.some((issue) => issue.code === 'duplicate-url'), '중복 URL issue');
ok(batch.issues.some((issue) => issue.code === 'duplicate-title'), '중복 제목 issue');

// deterministic topic classification
const topics = classifyNewsTopics(
  '청년 특별공급 청약 제도 개편',
  '분양가와 대출 금리, 주택 시장을 함께 다룹니다.',
);
for (const topic of ['subscription', 'housing_policy', 'youth', 'special_supply', 'housing_market', 'finance']) {
  ok(topics.includes(topic as (typeof topics)[number]), `${topic} topic 분류`);
}

const article = batch.articles[0];
const highRelevance = getNewsRelevance(profile, article);
eq(highRelevance.level, 'high', '청년+무주택+서울+청약 profile relevance');
ok(highRelevance.reasons.includes('청년 관련 주거 정보'), '청년 relevance reason');
ok(highRelevance.reasons.includes('무주택 사용자가 참고할 내용'), '무주택 relevance reason');
ok(highRelevance.reasons.some((reason) => reason.includes('서울')), '관심 지역 relevance reason');
const lowRelevance = getNewsRelevance(
  { ...profile, age: 55, region: '부산', isNoHomeOwner: false, hasSubscriptionAccount: false, monthlyPayment: 0 },
  { ...article, title: '일반 주거 소식', summary: '참고 정보', topics: [] },
);
eq(lowRelevance.level, 'low', '관련 신호가 없으면 low');
eq(lowRelevance.signals[0], 'general', '일반 관심 신호');

// Quality gate는 기사 자체의 주거 핵심성과 의견성 여부를 profile relevance보다 먼저 본다.
const opinionArticle: NewsArticle = {
  ...article,
  id: 'opinion-column',
  title: '[시론] 물과 소금, 그리고 용산공원',
  summary: '서울 청년 주거 정책과 공공주택을 다루는 필자 의견입니다.',
};
const columnArticle: NewsArticle = {
  ...opinionArticle,
  id: 'opinion-column-2',
  title: '[칼럼] 청약 제도를 생각한다',
};
ok(isOpinionNewsTitle(opinionArticle.title), '[시론] 의견성 marker 감지');
ok(!evaluateNewsQuality(opinionArticle).eligible, '[시론] briefing 후보 제외');
ok(!evaluateNewsQuality(columnArticle).eligible, '[칼럼] briefing 후보 제외');
for (const title of ['사설 청약 정책을 다시 본다', '기고: 주택공급의 방향', '오피니언 - 분양 시장']) {
  ok(isOpinionNewsTitle(title), `의견성 marker 감지: ${title}`);
}

const youthRegionOnlyArticle: NewsArticle = {
  ...article,
  id: 'youth-region-only',
  title: '서울 청년을 위한 건강 코칭 서비스',
  summary: '서울 지역 청년의 건강과 생활 습관을 지원합니다.',
  topics: ['youth'],
};
ok(!evaluateNewsQuality(youthRegionOnlyArticle).eligible, '청년+서울만 있고 housing signal이 없으면 제외');

const incidentalHousingArticle: NewsArticle = {
  ...article,
  id: 'incidental-iot',
  title: 'IoT 건강코칭- AI로 위험감지… 건설사 24시간 시니어 서비스',
  summary: '시니어 주택의 건강 서비스를 소개하며 과거 청약 접수를 짧게 언급합니다.',
  topics: ['subscription', 'housing_market'],
};
ok(!evaluateNewsQuality(incidentalHousingArticle).eligible, '요약의 단일 청약 언급만 있는 비주거 중심 기사 제외');

const publicRentalArticle: NewsArticle = {
  ...article,
  id: 'public-rental',
  title: '금천구 청년 맞춤형 공공임대주택 모집',
  summary: '서울 금천구가 청년 대상 공공임대주택 입주자 모집공고를 안내합니다.',
  topics: classifyNewsTopics('금천구 청년 맞춤형 공공임대주택 모집', '서울 공공임대주택 입주자 모집공고'),
};
const subscriptionArticle: NewsArticle = {
  ...article,
  id: 'subscription-special-supply',
  title: '청약 특별공급 모집공고 안내',
  summary: '무주택 사용자가 공식 공고에서 확인할 청약 정보입니다.',
  topics: ['subscription', 'special_supply'],
};
ok(evaluateNewsQuality(publicRentalArticle).eligible, '공공임대주택 모집 기사 통과');
ok(evaluateNewsQuality(subscriptionArticle).eligible, '청약/특별공급 기사 통과');
const oneGoodArticle = rankNewsForBriefing(profile, [opinionArticle, youthRegionOnlyArticle, publicRentalArticle]);
eq(oneGoodArticle.length, 1, '좋은 기사 1건뿐이면 filler 없이 1건만 반환');
eq(oneGoodArticle[0].article.id, publicRentalArticle.id, 'featured 후보는 quality gate 통과 기사');
const highUserRelevanceArticle: NewsArticle = {
  ...article,
  id: 'high-user-relevance',
  title: '청약 안내',
  summary: '서울 청년이 참고할 주거 정보입니다.',
  topics: ['subscription', 'youth'],
};
const housingCoreFirst = rankNewsForBriefing(profile, [highUserRelevanceArticle, subscriptionArticle]);
eq(housingCoreFirst[0].article.id, subscriptionArticle.id, 'housing core score가 user relevance보다 먼저 정렬');
const olderSameQuality = { ...subscriptionArticle, id: 'older-same-quality', publishedAt: '2026-08-20T00:00:00.000Z' };
const newerSameQuality = { ...subscriptionArticle, id: 'newer-same-quality', publishedAt: '2026-08-24T00:00:00.000Z' };
eq(
  rankNewsForBriefing(profile, [olderSameQuality, newerSameQuality])[0].article.id,
  newerSameQuality.id,
  'quality와 user relevance가 같으면 최신순',
);

// AI context: domain/profile/article 값만 복사하고 readiness 숫자를 넣지 않는다.
const context = buildNewsImpactContext(profile, article, highRelevance);
eq(context.contextVersion, 'news-impact-v1', 'AI context version');
eq(context.article.title, article.title, '기사 제목 원본 복사');
eq(context.userSignals.age, profile.age, 'profile 나이 복사');
ok(!('preparationScore' in context.userSignals), 'AI context에 준비도 숫자 없음');
const numericValues = collectNumbers(context);
eq(numericValues.length, 1, 'AI context numeric primitive는 profile age 하나뿐');
eq(numericValues[0], profile.age, 'AI context가 새로운 숫자를 만들지 않음');
const reparsedContext = parseNewsImpactContext({ ...context, arbitraryInstruction: '자격을 계산해' });
ok(reparsedContext, '정상 AI context validation');
ok(!('arbitraryInstruction' in (reparsedContext as unknown as Record<string, unknown>)), '임의 필드 제거');
eq(context.evidence.title, article.title, 'evidence title은 기사 metadata에서 생성');
eq(context.evidence.description, article.summary, 'evidence description은 API summary에서 생성');
const tamperedEvidence = parseNewsImpactContext({
  ...context,
  evidence: { title: '조작된 제목', description: '768명이 신청했습니다.', isDescriptionTruncated: false },
});
eq(tamperedEvidence?.evidence.title, article.title, 'client evidence 변조를 신뢰하지 않음');
const tamperedRelevance = parseNewsImpactContext({
  ...context,
  relevance: {
    level: 'high',
    reasons: ['당첨 확률이 높아졌어요.'],
    signals: ['general'],
  },
});
ok(tamperedRelevance, 'relevance 변조 context도 안전한 구조로 재구성');
ok(!tamperedRelevance?.relevance.reasons.some((reason) => reason.includes('당첨')), 'client relevance reason을 신뢰하지 않음');
eq(parseNewsImpactContext({ ...context, article: { ...context.article, originalUrl: 'file:///secret' } }), null, 'AI context URL 재검증');

const personalizationContext = buildNewsPersonalizationContext(context);
eq(personalizationContext.contextVersion, 'news-personalization-v1', '개인화 전용 context version');
ok(!('age' in personalizationContext.profileSignals), '개인화 context에 나이 숫자 없음');
eq(personalizationContext.profileSignals.displayName, '민지', '유효한 profile 이름만 개인화 context에 포함');
const personalizationPrompt = formatNewsPersonalizationContextForPrompt(context);
ok(!personalizationPrompt.includes(article.title), 'Gemini 개인화 입력에 기사 제목 없음');
ok(!personalizationPrompt.includes(article.summary), 'Gemini 개인화 입력에 기사 description 없음');

const safePersonalization = {
  relevanceExplanation: '민지님은 현재 청년·무주택 상태와 서울 관심 지역에 관련해 확인해볼 가치가 있는 소식이에요.',
  action: '기사 원문을 확인해 보세요.',
};
const validResult = buildNewsImpactBriefing(JSON.stringify(safePersonalization), context);
eq(validResult.briefing.headline, article.title, 'headline은 source title 고정');
eq(validResult.briefing.summary, article.summary, '완전한 description은 source 그대로 사용');
eq(validResult.grounding.factualSummary, 'source', '완전한 factual summary source 표시');
eq(validResult.grounding.personalization, 'gemini', '안전한 Gemini 개인화 사용');
eq(
  parseNewsImpactBriefing(safePersonalization, context).relevanceExplanation,
  safePersonalization.relevanceExplanation,
  '기존 briefing parser도 합성 결과 유지',
);

const malformedResult = buildNewsImpactBriefing('not json', context);
eq(malformedResult.briefing.summary, article.summary, 'malformed Gemini여도 factual summary 유지');
eq(malformedResult.grounding.personalization, 'fallback', 'malformed Gemini 개인화만 fallback');
eq(
  buildNewsImpactBriefing({
    relevanceExplanation: '현재 상태라 청약 자격을 충족했어요.',
    action: '기사 원문을 확인해 보세요.',
  }, context).grounding.personalization,
  'fallback',
  'eligibility 금지 표현이 포함된 개인화 fallback',
);
ok(containsForbiddenInference('당첨 확률이 높아졌어요.'), '당첨 가능성 추론 감지');
ok(containsForbiddenInference('완판e 준비도 +5점이에요.'), '뉴스로 준비도 숫자 변경 감지');

// factual grounding과 personalization은 분리한다.
const truncatedArticle: NewsArticle = {
  ...article,
  id: 'truncated-768',
  title: '시니어 주택 관련 소식',
  summary: '올해 청약 접수에서 768채 모집에…',
  originalUrl: 'https://news.example.com/truncated-768',
};
const truncatedContext = buildNewsImpactContext(
  profile,
  truncatedArticle,
  getNewsRelevance(profile, truncatedArticle),
);
ok(isTruncatedNewsDescription(truncatedArticle.summary), '말줄임표 description 감지');
ok(truncatedContext.evidence.isDescriptionTruncated, 'context에 truncated evidence 표시');
const truncatedFallback = createNewsImpactFallback(truncatedContext);
const truncatedPersonalized = buildNewsImpactBriefing({
  relevanceExplanation: '민지님은 현재 무주택 상태와 관련해 확인해볼 가치가 있는 소식이에요.',
  action: '기사 원문을 확인해 보세요.',
}, truncatedContext);
eq(truncatedPersonalized.grounding.factualSummary, 'fallback', '잘린 factual summary만 fallback');
eq(truncatedPersonalized.grounding.personalization, 'gemini', '잘린 기사도 안전한 Gemini 개인화 사용');
eq(truncatedPersonalized.briefing.summary, truncatedFallback.summary, '잘린 description은 보수적 안내');
eq(
  getNewsImpactGroundingIssues(truncatedPersonalized.briefing, truncatedContext).length,
  0,
  '합성된 결과에 source 밖 사실 없음',
);

for (const unsupportedFact of [
  '768채가 접수됐습니다.',
  '768명이 신청했습니다.',
  '경쟁률이 높았습니다.',
]) {
  const parsed = buildNewsImpactBriefing({
    relevanceExplanation: unsupportedFact,
    action: '기사 원문을 확인해 보세요.',
  }, truncatedContext);
  eq(parsed.grounding.personalization, 'fallback', `잘린 source 추론 reject: ${unsupportedFact}`);
  ok(!parsed.briefing.summary.includes('768'), `잘린 factual summary에 숫자 미사용: ${unsupportedFact}`);
}
ok(
  getNewsImpactGroundingIssues({
    headline: truncatedArticle.title,
    summary: '768채가 접수됐습니다.',
    relevanceExplanation: '참고할 내용입니다.',
    action: '원문을 확인해 보세요.',
  }, truncatedContext).includes('truncated-number'),
  'truncated description의 숫자 설명 차단',
);

const completeNumericArticle: NewsArticle = {
  ...article,
  id: 'complete-120',
  title: '서울 주택 공급 안내',
  summary: '서울시는 120가구를 공급한다고 발표했습니다.',
  originalUrl: 'https://news.example.com/complete-120',
};
const completeNumericContext = buildNewsImpactContext(
  profile,
  completeNumericArticle,
  getNewsRelevance(profile, completeNumericArticle),
);
const completeNumericPersonalization = {
  relevanceExplanation: '민지님은 서울 관심 지역과 관련해 확인해볼 가치가 있어요.',
  action: '기사 원문을 확인해 보세요.',
};
const completeNumericResult = buildNewsImpactBriefing(
  { ...completeNumericPersonalization, summary: '서울시에 120명이 신청했습니다.' },
  completeNumericContext,
);
eq(
  completeNumericResult.briefing.summary,
  completeNumericArticle.summary,
  'Gemini가 보낸 사실 필드는 무시하고 완전한 source 문장 사용',
);
eq(completeNumericResult.grounding.factualSummary, 'source', '완전한 숫자 문장 source grounding');
eq(completeNumericResult.grounding.personalization, 'gemini', '사실 필드와 무관하게 안전한 개인화 사용');
eq(getNewsImpactGroundingIssues(completeNumericResult.briefing, completeNumericContext).length, 0, 'source 숫자 의미 유지');

const numberlessArticle: NewsArticle = {
  ...article,
  id: 'numberless',
  title: '청년 주거 상담 안내',
  summary: '서울시는 청년 주거 상담 창구를 운영한다고 안내했습니다.',
  originalUrl: 'https://news.example.com/numberless',
};
const numberlessContext = buildNewsImpactContext(
  profile,
  numberlessArticle,
  getNewsRelevance(profile, numberlessArticle),
);
const numberlessPersonalization = {
  relevanceExplanation: '민지님은 청년과 서울 관심 지역에 관련해 확인해볼 가치가 있어요.',
  action: '기사 원문을 확인해 보세요.',
};
eq(
  buildNewsImpactBriefing(numberlessPersonalization, numberlessContext).briefing.summary,
  numberlessArticle.summary,
  '숫자 없는 정상 완전 문장 source 사용',
);

eq(
  buildNewsImpactBriefing({
    relevanceExplanation: '이번 정책으로 청년 공급 물량이 증가합니다.',
    action: '기사 원문을 확인해 보세요.',
  }, context).grounding.personalization,
  'fallback',
  'deterministic relevance 밖 정책 효과 reject',
);
ok(
  getNewsPersonalizationIssues({
    relevanceExplanation: safePersonalization.relevanceExplanation,
    action: '지금 바로 신청하세요.',
  }, context).includes('unsafe-action'),
  '허용 범위 밖 action reject',
);

const namedContext = buildNewsImpactContext(
  { ...profile, name: '지민' },
  article,
  highRelevance,
);
const namedResult = buildNewsImpactBriefing({
  relevanceExplanation: '지민님은 청년·무주택 상태와 서울 관심 지역에 관련해 확인해볼 가치가 있어요.',
  action: '기사 원문을 확인해 보세요.',
}, namedContext);
eq(namedResult.grounding.personalization, 'gemini', 'profile.name=지민 개인화 통과');
ok(namedResult.briefing.relevanceExplanation.includes('지민님'), '유효한 이름은 지민님으로 호칭');
eq(
  buildNewsImpactBriefing({
    relevanceExplanation: '회원님은 청년 주거 정보와 관련이 있어요.',
    action: '기사 원문을 확인해 보세요.',
  }, namedContext).grounding.personalization,
  'fallback',
  '회원님 기본 호칭 reject',
);

const anonymousContext = buildNewsImpactContext(
  { ...profile, name: '  ' },
  article,
  highRelevance,
);
const anonymousResult = buildNewsImpactBriefing({
  relevanceExplanation: '청년·무주택 상태와 서울 관심 지역에 관련해 확인해볼 가치가 있어요.',
  action: '기사 원문을 확인해 보세요.',
}, anonymousContext);
eq(anonymousResult.grounding.personalization, 'gemini', '이름 없는 무호칭 개인화 통과');
ok(!anonymousResult.briefing.relevanceExplanation.includes('회원님'), '이름이 없으면 회원님 강제 생성 없음');

const unsafeArticleContext = buildNewsImpactContext(profile, {
  ...article,
  title: '청약 1순위 관련 기사',
  summary: '당첨 확률이 높아졌다는 표현이 포함된 API 요약입니다.',
}, highRelevance);
ok(
  !containsForbiddenInference([
    createNewsImpactFallback(unsafeArticleContext).relevanceExplanation,
    createNewsImpactFallback(unsafeArticleContext).action,
  ].join(' ')),
  '원문 metadata의 금지 표현이 개인화 fallback으로 전파되지 않음',
);

// Future externalInsights는 설명 레이어이며 score 계산 결과는 불변이다.
const simulation = simulateFutureTimeline(profile, createFutureScenarios(profile)[0]);
const beforeScores = simulation.timeline.map((point) => point.preparationScore);
const enriched = attachNewsExternalInsights(simulation, [{ article, relevance: highRelevance }]);
const afterScores = enriched.timeline.map((point) => point.preparationScore);
eq(JSON.stringify(afterScores), JSON.stringify(beforeScores), '뉴스가 Future/preparation score를 바꾸지 않음');
eq(calculatePreparationScore(profile), simulation.timeline[0].preparationScore, '기존 preparation score 의미 유지');
eq(enriched.timeline[0].externalInsights.length, 1, '현재 시점 external insight 연결');
ok(enriched.timeline.slice(1).every((point) => point.externalInsights.length === 0), '미래 숫자에 뉴스 영향 주입 없음');
ok(mapNewsToFutureExternalInsight(article, highRelevance).note.includes('계산에는 반영되지 않아요'), 'score 독립 안내');

// Naver server adapter: canonical query, sort=date, credentials only in headers.
let capturedUrl = '';
let capturedInit: RequestInit | undefined;
const successFetch: NewsFetch = async (url, init) => {
  capturedUrl = url;
  capturedInit = init;
  return { ok: true, status: 200, json: async () => ({ items: [rawFixture[0]] }) };
};
const naver = new NaverNewsProvider({
  clientId: 'server-id',
  clientSecret: 'server-secret',
  queries: ['주택청약'],
  fetcher: successFetch,
  now: () => NOW,
});
const payload = await naver.fetchNews();
eq(payload.records.length, 1, 'Naver provider items 추출');
const requested = new URL(capturedUrl);
eq(requested.searchParams.get('query'), '주택청약', 'Naver 검색어');
eq(requested.searchParams.get('sort'), 'date', 'Naver 최신순 sort=date');
eq(requested.searchParams.get('display'), '10', 'Naver display 기본값');
eq(requested.searchParams.get('format'), 'json', 'NAVER API HUB JSON format');
eq(
  `${requested.origin}${requested.pathname}`,
  'https://naverapihub.apigw.ntruss.com/search/v1/news',
  'NAVER API HUB endpoint',
);
ok(!capturedUrl.includes('server-secret'), 'secret이 URL에 포함되지 않음');
const capturedHeaders = new Headers(capturedInit?.headers);
eq(capturedHeaders.get('X-NCP-APIGW-API-KEY-ID'), 'server-id', 'API HUB client id header');
eq(capturedHeaders.get('X-NCP-APIGW-API-KEY'), 'server-secret', 'API HUB client secret header');
eq(capturedHeaders.get('X-Naver-Client-Id'), null, '구형 client id header 제거');
eq(capturedHeaders.get('X-Naver-Client-Secret'), null, '구형 client secret header 제거');
eq(DEFAULT_NEWS_QUERIES.length, 6, 'MVP 검색어 수');

// missing credentials and provider failures both use curated fallback.
let missingKeyFetchCalls = 0;
const missingKeyRepository = new NewsRepository({
  primaryProvider: new NaverNewsProvider({
    clientId: '',
    clientSecret: '',
    fetcher: async () => {
      missingKeyFetchCalls += 1;
      throw new Error('should not call');
    },
    now: () => NOW,
  }),
  fallbackProvider: new CuratedNewsProvider({ now: () => NOW }),
  now: () => NOW,
});
const missingKeyDataset = await missingKeyRepository.loadNews();
eq(missingKeyFetchCalls, 0, '키가 없으면 네트워크 호출 안 함');
ok(missingKeyDataset.isFallback, 'API key 없음 fixture fallback');
eq(missingKeyDataset.fallbackReason, 'missing-credentials', 'missing key fallback reason');
eq(missingKeyDataset.source.kind, 'fixture', 'fallback source 표시');
ok(missingKeyDataset.articles.length >= 5, 'curated fixture usable');
ok(missingKeyDataset.articles.every((item) => item.sourceType === 'official'), 'fixture는 공식 확인 경로');

let errorCalls = 0;
const errorFetch: NewsFetch = async () => {
  errorCalls += 1;
  return {
    ok: false,
    status: 401,
    json: async () => ({ error: { errorCode: '210', message: 'Permission Denied' } }),
  };
};
const providerDiagnostics: import('./data/NewsProvider.ts').NewsProviderDiagnostic[] = [];
const errorRepository = new NewsRepository({
  primaryProvider: new NaverNewsProvider({
    clientId: 'id',
    clientSecret: 'secret',
    fetcher: errorFetch,
    now: () => NOW,
  }),
  fallbackProvider: new CuratedNewsProvider({ now: () => NOW }),
  now: () => NOW,
  onPrimaryError: (diagnostic) => { providerDiagnostics.push(diagnostic); },
});
const errorDataset = await errorRepository.loadNews();
ok(errorCalls > 0, 'API 오류 요청 수행');
ok(errorDataset.isFallback, 'API 오류 fixture fallback');
eq(errorDataset.fallbackReason, 'provider-error', 'API 오류 fallback reason');
eq(providerDiagnostics[0]?.httpStatus, 401, 'fallback 진단 HTTP status');
eq(providerDiagnostics[0]?.providerCode, '210', 'fallback 진단 NAVER error code');
ok(!JSON.stringify(providerDiagnostics[0]).includes('server-secret'), 'fallback 진단에 secret 없음');

// Repository cache is memory-only and prevents duplicate primary calls within TTL.
let providerCalls = 0;
const primaryProvider: NewsProvider = {
  source: { id: 'test-primary', kind: 'naver', label: 'test' },
  async fetchNews() {
    providerCalls += 1;
    return { records: rawFixture, fetchedAt: NOW.toISOString() };
  },
};
const cachedRepository = new NewsRepository({ primaryProvider, now: () => NOW });
eq((await cachedRepository.loadNews()).cacheStatus, 'miss', '첫 조회 cache miss');
eq((await cachedRepository.loadNews()).cacheStatus, 'hit', '두 번째 조회 memory cache hit');
eq(providerCalls, 1, 'cache hit에서 provider 중복 호출 없음');

console.log(`features/news: ${checks}개 검증 통과`);

function collectNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(collectNumbers);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(collectNumbers);
  return [];
}
