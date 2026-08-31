// 자격/가점/당첨 관련 질문 판별.
// Edge handler 밖의 순수 함수로 두어 직접 테스트한다.

/** 청약 제도 용어. 이 단어가 나오면 자격 질문으로 본다. */
const KEYWORDS =
  /(\d\s*순위|일\s*순위|이\s*순위|청약\s*순위|특별\s*공급|특공|일반\s*공급|가점|추첨제|당첨|자격|무주택\s*기간)/;

/**
 * 키워드를 피해가는 대표적인 우회 표현.
 * 데모 방어 수준으로만 유지한다. 무한히 늘리지 않는다.
 */
const PARAPHRASES = [
  // '할 수' 뿐 아니라 '넣을 수' 도 잡도록 어미를 열어둔다.
  /청약.*(넣|신청).*(가능|수\s*있)/,
  // 1인칭은 '저/나' 외에 '제가/내가' 도 흔하다.
  /(저|나|제|내).*(대상|해당).*(인가|되나|될 수)/,
  /(붙|당첨).*(가능성|확률|높)/,
  /(첫 번째|첫째|제일).*순위/,
];

/**
 * 사용자가 자유 입력한 질문에만 적용한다.
 * 앱이 만들어 보내는 학습 콘텐츠(퀴즈 문항/해설)에는 적용하지 않는다.
 */
export function isEligibilityQuestion(text: string): boolean {
  const q = text.trim();
  if (!q) return false;
  if (KEYWORDS.test(q)) return true;
  return PARAPHRASES.some((p) => p.test(q));
}

export const ELIGIBILITY_REPLY =
  '정확한 자격은 해당 모집공고와 공식 기준 확인이 필요합니다.\n\n' +
  '완판e는 청약 자격이나 가점, 당첨 가능성을 판정하지 않아요. ' +
  '대신 청약통장 가입 기간이나 납입처럼 지금 쌓아갈 수 있는 것들을 준비도로 보여드려요. ' +
  '준비도가 어떻게 달라지는지 궁금하시면 그건 얼마든지 설명해드릴 수 있어요.';

type EligibilityExplanationCheck = { id: string; label: string; reason: string };

export type EligibilityExplanationContext = {
  feature: 'first_home_private_v1';
  status: 'likely_eligible' | 'needs_information' | 'needs_listing_confirmation' | 'not_eligible';
  passedChecks: EligibilityExplanationCheck[];
  missingChecks: EligibilityExplanationCheck[];
  listingChecks: EligibilityExplanationCheck[];
  failedChecks: EligibilityExplanationCheck[];
  actions: string[];
  ruleSetVersion: string;
  effectiveDate: string;
};

const CONTEXT_KEYS = [
  'feature',
  'status',
  'passedChecks',
  'missingChecks',
  'listingChecks',
  'failedChecks',
  'actions',
  'ruleSetVersion',
  'effectiveDate',
] as const;

/** 앱이 계산한 허용 목록 외 raw profile이나 임의 판정값이 섞이면 설명 모드를 열지 않는다. */
export function isEligibilityExplanationContext(value: unknown): value is EligibilityExplanationContext {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !CONTEXT_KEYS.includes(key as typeof CONTEXT_KEYS[number]))) return false;
  if (value.feature !== 'first_home_private_v1') return false;
  if (!['likely_eligible', 'needs_information', 'needs_listing_confirmation', 'not_eligible'].includes(String(value.status))) return false;
  if (!isShortString(value.ruleSetVersion, 100) || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.effectiveDate))) return false;
  if (!Array.isArray(value.actions) || value.actions.length > 6 || !value.actions.every((item) => isShortString(item, 100))) return false;
  return ['passedChecks', 'missingChecks', 'listingChecks', 'failedChecks'].every((key) => {
    const items = value[key];
    return Array.isArray(items) && items.length <= 12 && items.every(isExplanationCheck);
  });
}

export function formatEligibilityExplanationContext(context: EligibilityExplanationContext): string {
  return JSON.stringify(context);
}

function isExplanationCheck(value: unknown): value is EligibilityExplanationCheck {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !['id', 'label', 'reason'].includes(key))) return false;
  return isShortString(value.id, 80) && isShortString(value.label, 100) && isShortString(value.reason, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
