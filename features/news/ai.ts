import type { UserProfile } from '../../domain/types.ts';
import { NEWS_TOPICS, type NewsArticle, type NewsRelevance, type NewsSourceType, type NewsTopic } from './types.ts';
import { getNewsRelevanceFromSignals } from './relevance.ts';

export type NewsImpactContext = {
  contextVersion: 'news-impact-v1';
  calculationSource: 'article-and-profile-read-only';
  article: Pick<
    NewsArticle,
    'id' | 'title' | 'summary' | 'originalUrl' | 'publishedAt' | 'sourceDomain' | 'topics' | 'sourceType'
  >;
  evidence: NewsEvidence;
  userSignals: {
    name: string;
    age: number;
    region: string;
    isNoHomeOwner: boolean;
    hasSubscriptionAccount: boolean;
    hasRegularContribution: boolean;
  };
  relevance: NewsRelevance;
  aiPolicy: {
    role: 'explain-provided-news-only';
    may: readonly ['summarize-article-metadata', 'explain-provided-relevance', 'suggest-one-verification-action'];
    mustNot: readonly [
      'infer-eligibility',
      'calculate-official-points',
      'infer-priority-status',
      'infer-winning-probability',
      'change-preparation-score',
      'invent-policy-facts',
      'infer-factual-relations',
      'scrape-or-claim-full-article',
    ];
  };
};

export type NewsEvidence = {
  title: string;
  description: string;
  isDescriptionTruncated: boolean;
};

export type NewsImpactBriefing = {
  headline: string;
  summary: string;
  relevanceExplanation: string;
  action: string;
  caution?: string;
};

export type NewsImpactGrounding = {
  factualSummary: 'source' | 'fallback';
  personalization: 'gemini' | 'fallback';
};

export type NewsImpactBriefingResult = {
  briefing: NewsImpactBriefing;
  grounding: NewsImpactGrounding;
};

export type NewsPersonalizationContext = {
  contextVersion: 'news-personalization-v1';
  profileSignals: {
    displayName: string | null;
    region: string;
    isYouth: boolean;
    isNoHomeOwner: boolean;
    hasSubscriptionAccount: boolean;
    hasRegularContribution: boolean;
  };
  articleTopics: NewsTopic[];
  relevance: NewsRelevance;
  policy: {
    role: 'explain-deterministic-relevance-only';
    may: readonly ['explain-provided-relevance', 'suggest-one-verification-action'];
    mustNot: readonly ['add-article-facts', 'infer-eligibility', 'change-preparation-or-future-score'];
  };
};

export const NEWS_IMPACT_AI_POLICY: NewsImpactContext['aiPolicy'] = {
  role: 'explain-provided-news-only',
  may: ['summarize-article-metadata', 'explain-provided-relevance', 'suggest-one-verification-action'],
  mustNot: [
    'infer-eligibility',
    'calculate-official-points',
    'infer-priority-status',
    'infer-winning-probability',
    'change-preparation-score',
    'invent-policy-facts',
    'infer-factual-relations',
    'scrape-or-claim-full-article',
  ],
};

export function buildNewsImpactContext(
  input: UserProfile,
  article: NewsArticle,
  relevance: NewsRelevance,
): NewsImpactContext {
  // Edge Function에서도 이 모듈을 공유하므로 앱 계산 모듈에 runtime 의존하지 않는다.
  // AI에는 계산값이 아니라 입력 profile의 제한된 신호만 정규화해 전달한다.
  const profile = {
    name: input.name.trim(),
    age: Math.min(99, Math.max(15, Math.floor(Number.isFinite(input.age) ? input.age : 15))),
    region: input.region.trim(),
    isNoHomeOwner: input.isNoHomeOwner,
    hasSubscriptionAccount: input.hasSubscriptionAccount,
    hasRegularContribution: input.hasSubscriptionAccount && input.monthlyPayment > 0,
  };
  return {
    contextVersion: 'news-impact-v1',
    calculationSource: 'article-and-profile-read-only',
    article: {
      id: article.id,
      title: article.title,
      summary: article.summary,
      originalUrl: article.originalUrl,
      publishedAt: article.publishedAt,
      sourceDomain: article.sourceDomain,
      topics: [...article.topics],
      sourceType: article.sourceType,
    },
    evidence: buildNewsEvidence(article),
    userSignals: {
      name: profile.name,
      age: profile.age,
      region: profile.region,
      isNoHomeOwner: profile.isNoHomeOwner,
      hasSubscriptionAccount: profile.hasSubscriptionAccount,
      hasRegularContribution: profile.hasRegularContribution,
    },
    relevance: {
      level: relevance.level,
      reasons: relevance.reasons.slice(0, 3),
      signals: relevance.signals.slice(0, 3),
    },
    aiPolicy: NEWS_IMPACT_AI_POLICY,
  };
}

/** Edge Function이 임의 자유 텍스트가 아니라 허용된 context 모양만 Gemini에 넘기도록 재구성한다. */
export function parseNewsImpactContext(input: unknown): NewsImpactContext | null {
  if (!isRecord(input) || !isRecord(input.article) || !isRecord(input.userSignals) || !isRecord(input.relevance)) {
    return null;
  }
  const article = parseArticle(input.article);
  const userSignals = input.userSignals;
  if (!article) return null;
  if (
    typeof userSignals.name !== 'string'
    || typeof userSignals.age !== 'number'
    || !Number.isFinite(userSignals.age)
    || typeof userSignals.region !== 'string'
    || typeof userSignals.isNoHomeOwner !== 'boolean'
    || typeof userSignals.hasSubscriptionAccount !== 'boolean'
    || typeof userSignals.hasRegularContribution !== 'boolean'
  ) return null;

  const normalizedUserSignals: NewsImpactContext['userSignals'] = {
    name: limit(userSignals.name, 60),
    age: Math.min(99, Math.max(15, Math.floor(userSignals.age))),
    region: limit(userSignals.region, 60),
    isNoHomeOwner: userSignals.isNoHomeOwner,
    hasSubscriptionAccount: userSignals.hasSubscriptionAccount,
    hasRegularContribution: userSignals.hasSubscriptionAccount && userSignals.hasRegularContribution,
  };

  return {
    contextVersion: 'news-impact-v1',
    calculationSource: 'article-and-profile-read-only',
    article,
    // client가 evidence를 바꿔 보내도 article metadata에서 다시 만든다.
    evidence: buildNewsEvidence(article),
    userSignals: normalizedUserSignals,
    relevance: getNewsRelevanceFromSignals(normalizedUserSignals, article),
    aiPolicy: NEWS_IMPACT_AI_POLICY,
  };
}

export function buildNewsPersonalizationContext(context: NewsImpactContext): NewsPersonalizationContext {
  return {
    contextVersion: 'news-personalization-v1',
    profileSignals: {
      displayName: getProfileDisplayName(context.userSignals.name),
      region: context.userSignals.region,
      isYouth: context.userSignals.age >= 19 && context.userSignals.age <= 39,
      isNoHomeOwner: context.userSignals.isNoHomeOwner,
      hasSubscriptionAccount: context.userSignals.hasSubscriptionAccount,
      hasRegularContribution: context.userSignals.hasRegularContribution,
    },
    articleTopics: [...context.article.topics],
    relevance: {
      level: context.relevance.level,
      reasons: [...context.relevance.reasons],
      signals: [...context.relevance.signals],
    },
    policy: {
      role: 'explain-deterministic-relevance-only',
      may: ['explain-provided-relevance', 'suggest-one-verification-action'],
      mustNot: ['add-article-facts', 'infer-eligibility', 'change-preparation-or-future-score'],
    },
  };
}

export function formatNewsPersonalizationContextForPrompt(context: NewsImpactContext): string {
  return [
    '[NEWS_PERSONALIZATION_V1_CONTEXT]',
    '기사의 title, description, 본문은 제공되지 않았다. 기사 사실을 언급하거나 추정하지 않는다.',
    'relevanceExplanation은 제공된 profileSignals, relevance, articleTopics만 자연스럽게 연결한다.',
    'displayName이 있으면 정확히 "displayName님"으로 부르고, 없으면 호칭 없이 쓴다. "회원님"은 사용하지 않는다.',
    'action은 허용된 확인·저장 행동 중 하나만 선택한다.',
    JSON.stringify(buildNewsPersonalizationContext(context), null, 2),
    '[/NEWS_PERSONALIZATION_V1_CONTEXT]',
  ].join('\n');
}

export function createNewsImpactFallback(context: NewsImpactContext): NewsImpactBriefing {
  const factual = createDeterministicFactualBriefing(context);
  const personalization = createPersonalizationFallback(context);
  return {
    ...factual,
    ...personalization,
    caution: '완판e 준비도나 청약 자격을 직접 변경하는 정보로 반영하지 않습니다.',
  };
}

/** 기사 사실은 deterministic하게 고정하고, 안전한 개인화 필드만 Gemini 결과에서 합성한다. */
export function buildNewsImpactBriefing(
  input: unknown,
  context: NewsImpactContext,
): NewsImpactBriefingResult {
  const factual = createDeterministicFactualBriefing(context);
  const fallback = createPersonalizationFallback(context);
  const value = parseJsonObject(input);
  const candidate = value ? {
    relevanceExplanation: readRequired(value.relevanceExplanation, 300),
    action: readRequired(value.action, 240),
  } : null;
  const useGemini = Boolean(
    candidate
    && candidate.relevanceExplanation
    && candidate.action
    && getNewsPersonalizationIssues(candidate, context).length === 0,
  );
  const personalization = useGemini && candidate ? candidate : fallback;

  return {
    briefing: {
      ...factual,
      ...personalization,
      caution: '완판e 준비도나 청약 자격을 직접 변경하는 정보로 반영하지 않습니다.',
    },
    grounding: {
      factualSummary: context.evidence.isDescriptionTruncated ? 'fallback' : 'source',
      personalization: useGemini ? 'gemini' : 'fallback',
    },
  };
}

/** 기존 호출부에는 최종 briefing 모양을 유지한다. */
export function parseNewsImpactBriefing(
  input: unknown,
  context: NewsImpactContext,
): NewsImpactBriefing {
  return buildNewsImpactBriefing(input, context).briefing;
}

export type NewsPersonalizationIssue =
  | 'missing-field'
  | 'number'
  | 'forbidden-inference'
  | 'article-fact-claim'
  | 'unsupported-profile-signal'
  | 'invalid-address'
  | 'unsafe-action';

/** Gemini 개인화가 deterministic relevance 경계를 벗어나면 해당 두 필드만 fallback한다. */
export function getNewsPersonalizationIssues(
  personalization: Pick<NewsImpactBriefing, 'relevanceExplanation' | 'action'>,
  context: NewsImpactContext,
): NewsPersonalizationIssue[] {
  const issues = new Set<NewsPersonalizationIssue>();
  const explanation = personalization.relevanceExplanation.trim();
  const action = personalization.action.trim();
  const combined = `${explanation} ${action}`;

  if (!explanation || !action) issues.add('missing-field');
  if (/\d/.test(combined)) issues.add('number');
  if (containsForbiddenInference(combined) || PERSONALIZATION_FORBIDDEN_PATTERN.test(combined)) {
    issues.add('forbidden-inference');
  }
  if (PERSONALIZATION_FACT_CLAIM_PATTERN.test(explanation) || CAUSAL_PATTERN.test(explanation)) {
    issues.add('article-fact-claim');
  }
  const displayName = getProfileDisplayName(context.userSignals.name);
  if (
    /회원님/.test(combined)
    || (displayName ? !explanation.includes(`${displayName}님`) : /(?:회원|고객|사용자|당신)님/.test(combined))
  ) {
    issues.add('invalid-address');
  }
  if (!isPersonalizationAligned(explanation, context)) issues.add('unsupported-profile-signal');
  if (!SAFE_ACTIONS.has(normalizeAction(action))) issues.add('unsafe-action');
  return [...issues];
}

export type NewsGroundingIssue =
  | 'headline-not-evidence'
  | 'new-number'
  | 'changed-number-unit'
  | 'new-number-relation'
  | 'truncated-number'
  | 'truncated-completion'
  | 'new-sensitive-relation'
  | 'new-causal-relation';

/** prompt 방어를 통과한 응답도 evidence에 근거하지 않으면 폐기한다. */
export function getNewsImpactGroundingIssues(
  briefing: NewsImpactBriefing,
  context: NewsImpactContext,
): NewsGroundingIssue[] {
  const issues = new Set<NewsGroundingIssue>();
  const evidenceText = `${context.evidence.title} ${context.evidence.description}`;
  // 개인화는 별도 allowlist validator가 검사한다. 이 단계는 source 사실 요약만 비교한다.
  const outputBody = briefing.summary;

  if (briefing.headline !== context.evidence.title) issues.add('headline-not-evidence');

  const evidenceNumbers = getNumericMentions(evidenceText);
  const outputNumbers = getNumericMentions(outputBody);
  if (context.evidence.isDescriptionTruncated && outputNumbers.length > 0) {
    issues.add('truncated-number');
  }
  for (const mention of outputNumbers) {
    const sameValue = evidenceNumbers.filter((source) => source.value === mention.value);
    if (sameValue.length === 0) {
      issues.add('new-number');
      continue;
    }
    const sameMeaning = sameValue.filter((source) => source.unit === mention.unit);
    if (sameMeaning.length === 0) {
      issues.add('changed-number-unit');
      continue;
    }
    const outputRelations = relationsAfterNumber(outputBody, mention);
    if (
      outputRelations.length > 0
      && !outputRelations.every((relation) => sameMeaning.some(
        (source) => relationsAfterNumber(evidenceText, source).includes(relation),
      ))
    ) {
      issues.add('new-number-relation');
    }
  }

  for (const term of SENSITIVE_FACT_TERMS) {
    if (outputBody.includes(term) && !evidenceText.includes(term)) {
      issues.add('new-sensitive-relation');
    }
  }
  if (
    context.evidence.isDescriptionTruncated
    && TRUNCATED_COMPLETION_PATTERN.test(briefing.summary)
  ) {
    issues.add('truncated-completion');
  }
  if (
    CAUSAL_PATTERN.test(briefing.summary)
    && !CAUSAL_PATTERN.test(context.evidence.description)
  ) {
    issues.add('new-causal-relation');
  }
  return [...issues];
}

export function isTruncatedNewsDescription(value: string): boolean {
  return /…|\.{3}/.test(value);
}

export function containsForbiddenInference(text: string): boolean {
  return [
    /(?:신청|청약)?\s*(?:자격|대상).{0,16}(?:충족|가능|생겼|획득|해당|돼|된다)/,
    /(?:당첨|붙을).{0,16}(?:가능성|확률|높|낮|될|돼)/,
    /(?:청약\s*)?가점.{0,12}(?:\d+\s*점|높|낮|오르|내리)/,
    /(?:1|일|첫\s*번째)\s*순위/,
    /준비도.{0,16}(?:[+-]\s*\d+|\d+\s*점\s*(?:상승|하락|증가|감소)|변화|오르|내리)/,
  ].some((pattern) => pattern.test(text));
}

function createDeterministicFactualBriefing(
  context: NewsImpactContext,
): Pick<NewsImpactBriefing, 'headline' | 'summary'> {
  return {
    headline: context.evidence.title,
    summary: context.evidence.isDescriptionTruncated
      ? '제공된 기사 요약만으로 세부 내용을 확인하기 어려워요. 기사 원문을 확인해 주세요.'
      : context.evidence.description,
  };
}

function createPersonalizationFallback(
  context: NewsImpactContext,
): Pick<NewsImpactBriefing, 'relevanceExplanation' | 'action'> {
  const displayName = getProfileDisplayName(context.userSignals.name);
  return {
    relevanceExplanation: limit(
      `${displayName ? `${displayName}님은 ` : ''}${context.relevance.reasons.join(' · ')}과 관련해 확인해볼 가치가 있는 소식이에요.`,
      300,
    ),
    action: '기사 원문과 관련 공식 공고를 확인해 보세요.',
  };
}

function isPersonalizationAligned(explanation: string, context: NewsImpactContext): boolean {
  const personalization = buildNewsPersonalizationContext(context);
  const { profileSignals, articleTopics, relevance } = personalization;

  if (
    !profileSignals.isYouth
    && /(?:현재|사용자|당신|내|나의).{0,12}청년|청년.{0,12}(?:상태|사용자|당신|내|나의)/.test(explanation)
  ) return false;
  if (
    !profileSignals.isNoHomeOwner
    && /(?:현재|사용자|당신|내|나의).{0,12}무주택|무주택.{0,12}(?:상태|사용자|당신|내|나의)/.test(explanation)
  ) return false;
  if (
    !profileSignals.hasSubscriptionAccount
    && /(?:현재|사용자|당신|내|나의).{0,12}청약통장|청약통장.{0,12}(?:보유|유지|사용자|당신|내|나의)/.test(explanation)
  ) return false;
  if (!profileSignals.hasRegularContribution && /(?:현재|나의|내).{0,12}(?:정기 납입|납입 습관)/.test(explanation)) {
    return false;
  }

  const mentionedMetro = ['서울', '경기', '인천'].find((region) => explanation.includes(region));
  if (mentionedMetro && !profileSignals.region.includes(mentionedMetro)) return false;
  if (/관련성(?:이|은)?\s*(?:높|큰)/.test(explanation) && relevance.level !== 'high') return false;

  const alignedPatterns: RegExp[] = [];
  if (relevance.signals.includes('youth')) alignedPatterns.push(/청년/);
  if (relevance.signals.includes('no-home')) alignedPatterns.push(/무주택/);
  if (relevance.signals.includes('region')) alignedPatterns.push(/관심 지역|서울|경기|인천/);
  if (relevance.signals.includes('subscription-account')) alignedPatterns.push(/청약통장/);
  if (relevance.signals.includes('regular-contribution')) alignedPatterns.push(/정기 납입|납입 습관|금융 정보/);
  if (relevance.signals.includes('general')) alignedPatterns.push(/청약|주거|정보|소식|흐름/);

  const topicPatterns: Record<NewsTopic, RegExp> = {
    subscription: /청약/,
    housing_policy: /주거 정책|주택 정책|정책/,
    youth: /청년/,
    special_supply: /특별공급/,
    housing_market: /주택 시장|주거 시장|시장 정보/,
    finance: /금융|납입|대출|금리/,
  };
  for (const topic of articleTopics) alignedPatterns.push(topicPatterns[topic]);
  return alignedPatterns.some((pattern) => pattern.test(explanation));
}

function getProfileDisplayName(value: string): string | null {
  const name = value.trim();
  if (!/^[\p{L}]{1,20}$/u.test(name)) return null;
  if (/^(?:회원|고객|사용자|당신|관리자)$/.test(name) || name.endsWith('님')) return null;
  return name;
}

function parseArticle(value: Record<string, unknown>): NewsImpactContext['article'] | null {
  const required = ['id', 'title', 'summary', 'originalUrl', 'publishedAt', 'sourceDomain'] as const;
  if (required.some((key) => typeof value[key] !== 'string' || !String(value[key]).trim())) return null;
  try {
    const url = new URL(String(value.originalUrl));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  const date = new Date(String(value.publishedAt));
  if (!Number.isFinite(date.getTime())) return null;
  if (!Array.isArray(value.topics) || !value.topics.every(isNewsTopic)) return null;
  if (!isSourceType(value.sourceType)) return null;
  return {
    id: limit(String(value.id), 120),
    title: limit(String(value.title), 180),
    summary: limit(String(value.summary), 500),
    originalUrl: limit(String(value.originalUrl), 2_000),
    publishedAt: date.toISOString(),
    sourceDomain: limit(String(value.sourceDomain), 255),
    topics: [...new Set(value.topics as NewsTopic[])],
    sourceType: value.sourceType,
  };
}

function buildNewsEvidence(article: NewsImpactContext['article']): NewsEvidence {
  return {
    title: article.title,
    description: article.summary,
    isDescriptionTruncated: isTruncatedNewsDescription(article.summary),
  };
}

type NumericMention = {
  value: string;
  unit: string;
  raw: string;
  index: number;
};

const NUMBER_PATTERN = /(\d+(?:[.,]\d+)*)(?:\s*(퍼센트|개월|만원|억원|가구|세대|시간|%|배|년|월|일|명|채|원|층|건))?/g;
const NUMBER_RELATIONS = [
  '신청', '접수', '공급', '모집', '경쟁률', '당첨', '증가', '감소', '상승', '하락',
  '초과', '미달', '동일', '같은', '늘', '줄',
] as const;
const SENSITIVE_FACT_TERMS = [
  '신청', '접수', '공급', '모집', '경쟁률', '당첨', '시행', '확정', '증가', '감소',
  '상승', '하락', '초과', '미달', '동일',
] as const;
const TRUNCATED_COMPLETION_PATTERN = /(?:접수됐|접수되|신청했|신청됐|경쟁률|확정됐|시행됐|완료됐|증가했|감소했|상승했|하락했|몰렸|달성)/;
const CAUSAL_PATTERN = /(?:때문에|따라서|그 결과|로 인해|덕분에|영향으로|이번 정책으로)/;
const PERSONALIZATION_FORBIDDEN_PATTERN = /(?:자격|대상|가점|(?:1|일)\s*순위|당첨|확률|준비도|점수|경쟁률|신청자|접수|공급\s*물량|물량|혜택|유리|불리)/;
const PERSONALIZATION_FACT_CLAIM_PATTERN = /(?:증가|감소|상승|하락|확대|축소|시행|확정|도입|폐지|신설|완화|강화|바뀌|변경|변화|늘어|줄어|오르|내리|적용(?:해|합|됩|되)|지원(?:해|합|됩|되)|제공(?:해|합|됩|되)|모집(?:해|합|됩|되)|신청(?:했|됐|되)|접수(?:했|됐|되)|발표(?:했|됐|되))/;
const SAFE_ACTIONS = new Set([
  '기사원문을확인해보세요',
  '공식공고를확인해보세요',
  '관심지역을확인해보세요',
  '관심지역의공식공고를확인해보세요',
  '관련제도를저장해두세요',
  '향후모집공고를확인해보세요',
  '기사원문과공식공고를확인해보세요',
  '기사원문과관련공식공고를확인해보세요',
  '관련제도를저장해두고공식공고를확인해보세요',
]);

function normalizeAction(value: string): string {
  return value.replace(/\s+/g, '').replace(/[.!。]+$/g, '');
}

function getNumericMentions(value: string): NumericMention[] {
  const mentions: NumericMention[] = [];
  for (const match of value.matchAll(NUMBER_PATTERN)) {
    mentions.push({
      value: match[1].replace(/,/g, ''),
      unit: match[2] ?? '',
      raw: match[0],
      index: match.index ?? 0,
    });
  }
  return mentions;
}

function relationsAfterNumber(value: string, mention: NumericMention): string[] {
  const after = value.slice(mention.index + mention.raw.length, mention.index + mention.raw.length + 18);
  return NUMBER_RELATIONS.filter((relation) => after.includes(relation));
}

function parseJsonObject(input: unknown): Record<string, unknown> | null {
  if (isRecord(input)) return input;
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readRequired(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? limit(value, maxLength) : '';
}

function limit(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isNewsTopic(value: unknown): value is NewsTopic {
  return typeof value === 'string' && (NEWS_TOPICS as readonly string[]).includes(value);
}

function isSourceType(value: unknown): value is NewsSourceType {
  return value === 'news' || value === 'official' || value === 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
