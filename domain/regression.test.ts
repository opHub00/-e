// npm run test:domain
// Codex 감사 지적 사항(H1/H4/H2 등)에 대한 회귀 테스트.
import { buildAiContext, formatContextForPrompt } from './aiContext.ts';
import {
  LIMITS,
  calculatePreparationScore,
  explainFutureChange,
  getRecommendedActions,
  normalizeProfile,
  simulateFuture,
  validateNumberField,
} from './preparation.ts';
import type { UserProfile } from './types';

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  checks += 1;
  if (!cond) throw new Error(`FAIL: ${msg}`);
};
const eq = (a: unknown, b: unknown, msg: string) => ok(a === b, `${msg} (${a} !== ${b})`);

const base: UserProfile = {
  name: '지민',
  age: 22,
  occupation: 'student',
  region: '서울특별시',
  hasSubscriptionAccount: true,
  accountMonths: 14,
  monthlyPayment: 100000,
  isNoHomeOwner: true,
};

// ── H1: 통장 미보유 시 accountMonths / monthlyPayment 정규화 ──────────────
// 통장이 없는데 값이 남아 있는 오염된 프로필
const dirty: UserProfile = {
  ...base,
  hasSubscriptionAccount: false,
  accountMonths: 36,
  monthlyPayment: 200000,
};

const cleaned = normalizeProfile(dirty);
eq(cleaned.accountMonths, 0, 'H1 통장 없으면 accountMonths 는 0');
eq(cleaned.monthlyPayment, 0, 'H1 통장 없으면 monthlyPayment 는 0');

// 점수도 오염값을 절대 반영하지 않는다 (domain gate)
const emptyAccount: UserProfile = { ...base, hasSubscriptionAccount: false, accountMonths: 0, monthlyPayment: 0 };
eq(
  calculatePreparationScore(dirty),
  calculatePreparationScore(emptyAccount),
  'H1 통장 없는데 가입개월/납입액이 점수에 반영됨',
);

// 미래 시뮬레이션도 마찬가지
const dirtyFuture = simulateFuture(dirty, 5);
eq(dirtyFuture.accountMonths, 0, 'H1 통장 없는데 미래 가입개월이 늘어남');
eq(dirtyFuture.estimatedPaidAmount, 0, 'H1 통장 없는데 예상 납입액이 생김');

// 추천 행동 / 변화 이유도 오염값을 노출하지 않는다
ok(
  !getRecommendedActions(dirty).some((a) => a.includes('36') || a.includes('개월 남았')),
  'H1 통장 없는데 추천 행동에 가입 개월이 노출됨',
);
ok(
  !explainFutureChange(dirty, dirtyFuture).some((r) => r.includes('36')),
  'H1 통장 없는데 변화 이유에 가입 개월이 노출됨',
);

// AI 컨텍스트에도 새지 않는다
const dirtyPrompt = formatContextForPrompt(buildAiContext(dirty));
ok(dirtyPrompt.includes('청약통장: 없음'), 'H1 프롬프트 통장 없음 표기');
ok(!dirtyPrompt.includes('36개월'), 'H1 프롬프트에 오염된 가입 개월이 노출됨');
ok(!dirtyPrompt.includes('200,000원'), 'H1 프롬프트에 오염된 납입액이 노출됨');

// ── 입력값 범위 validation ────────────────────────────────────────────────
eq(normalizeProfile({ ...base, age: 5 }).age, LIMITS.age.min, '범위: 나이 하한');
eq(normalizeProfile({ ...base, age: 999 }).age, LIMITS.age.max, '범위: 나이 상한');
eq(
  normalizeProfile({ ...base, accountMonths: 9999 }).accountMonths,
  LIMITS.accountMonths.max,
  '범위: 가입 개월 상한',
);
eq(
  normalizeProfile({ ...base, monthlyPayment: 99_999_999 }).monthlyPayment,
  LIMITS.monthlyPayment.max,
  '범위: 납입액 상한',
);
eq(normalizeProfile({ ...base, accountMonths: -5 }).accountMonths, 0, '범위: 음수 가입 개월');
eq(normalizeProfile({ ...base, monthlyPayment: -1 }).monthlyPayment, 0, '범위: 음수 납입액');
eq(normalizeProfile({ ...base, age: NaN }).age, LIMITS.age.min, '범위: NaN 방어');
eq(normalizeProfile({ ...base, accountMonths: 14.7 }).accountMonths, 14, '범위: 소수점 절삭');
eq(normalizeProfile({ ...base, name: '  지민  ' }).name, '지민', '범위: 이름 trim');

// 범위를 벗어난 값이 들어와도 점수는 항상 0~100
for (const p of [
  { ...base, age: -100 },
  { ...base, accountMonths: 99_999 },
  { ...base, monthlyPayment: 9_999_999_999 },
]) {
  const s = calculatePreparationScore(p);
  ok(s >= 0 && s <= 100, `범위 밖 입력에도 점수 범위 유지: ${s}`);
}

// 정규화는 멱등이다
const once = normalizeProfile(dirty);
eq(JSON.stringify(normalizeProfile(once)), JSON.stringify(once), '정규화 멱등성');

// ── 빈 값 / NaN / 범위 위반을 명시적으로 구분한다 ─────────────────────────
// 빈 나이는 invalid 여야 한다. Number('') === 0 으로 흘러가면 안 된다.
eq(validateNumberField('', LIMITS.age), 'empty', '빈 나이는 empty');
eq(validateNumberField('   ', LIMITS.age), 'empty', '공백만 있는 나이는 empty');
eq(Number(''), 0, '전제: Number("") 는 0 이라 clamp 에 맡기면 통과해버린다');
ok(
  validateNumberField('', LIMITS.age) !== null,
  '빈 나이가 clamp 로 흘러가 유효 처리됨',
);

eq(validateNumberField('abc', LIMITS.age), 'nan', 'NaN 구분');
eq(validateNumberField('1e999', LIMITS.age), 'nan', 'Infinity 는 유한수가 아니므로 nan');
eq(validateNumberField('5', LIMITS.age), 'range', '하한 미만은 range');
eq(validateNumberField('200', LIMITS.age), 'range', '상한 초과는 range');
eq(validateNumberField('22', LIMITS.age), null, '정상 나이는 통과');

eq(validateNumberField('', LIMITS.accountMonths), 'empty', '빈 가입 개월은 empty');
eq(validateNumberField('0', LIMITS.accountMonths), null, '가입 개월 0 은 유효');
eq(validateNumberField('9999', LIMITS.accountMonths), 'range', '가입 개월 상한');

eq(validateNumberField('', LIMITS.monthlyPayment), 'empty', '빈 납입액은 empty');
eq(validateNumberField('0', LIMITS.monthlyPayment), null, '납입액 0 은 유효');
eq(validateNumberField('9999999', LIMITS.monthlyPayment), 'range', '납입액 상한');

// ── H4: 누적 납입액을 실제값처럼 말하지 않는다 ────────────────────────────
const reasons = explainFutureChange(base, simulateFuture(base, 2));
const payLine = reasons.find((r) => r.includes('납입'));
ok(payLine, 'H4 납입 관련 문구가 없음');
ok(payLine!.includes('가정'), 'H4 납입 문구에 가정 표현이 없음');
ok(payLine!.includes('예상 납입액'), 'H4 "예상 납입액" 표현이 없음');
ok(!payLine!.includes('납입 누계가'), 'H4 "납입 누계" 가 실제값처럼 남아 있음');

const prompt = formatContextForPrompt(buildAiContext(base));
ok(prompt.includes('예상 납입액'), 'H4 프롬프트에 예상 납입액 표현이 없음');
ok(!prompt.includes('납입 누계'), 'H4 프롬프트에 납입 누계가 남아 있음');
ok(prompt.includes('가정한 예상값'), 'H4 프롬프트에 가정 명시가 없음');

console.log(`domain/regression: ${checks}개 검증 통과`);
