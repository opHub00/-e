// npm run test:domain
import {
  buildFutureAiContext,
  formatFutureAiContextForPrompt,
} from './futureAiContext.ts';
import {
  FUTURE_TIMELINE_MONTHS,
  compareFutureScenarios,
  createFutureScenarios,
  getDefaultFutureScenarioInput,
  getFutureScenario,
  parseFutureScenario,
  serializeFutureScenario,
  simulateFutureTimeline,
  type FutureMonthOffset,
  type FutureScenarioInput,
} from './futureSimulation.ts';
import { LIMITS, calculatePreparationScore } from './preparation.ts';
import type { UserProfile } from './types.ts';

let checks = 0;
const ok = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const eq = (actual: unknown, expected: unknown, message: string) =>
  ok(actual === expected, `${message} (${actual} !== ${expected})`);

const base: UserProfile = {
  name: '지민',
  age: 22,
  occupation: 'student',
  region: '서울특별시',
  hasSubscriptionAccount: true,
  accountMonths: 14,
  monthlyPayment: 100_000,
  isNoHomeOwner: true,
};

const baseline = getFutureScenario(base, 'baseline');
const baselineSimulation = simulateFutureTimeline(base, baseline);

// 현재/6개월/1/2/3/5년 timeline은 정확한 순서와 deterministic 값을 가진다.
eq(baselineSimulation.version, 2, 'V2 버전');
eq(baselineSimulation.metric, 'wanpan-preparation-score', '내부 준비도 metric');
eq(baselineSimulation.timeline.length, 6, 'timeline 개수');
eq(
  baselineSimulation.timeline.map((point) => point.offsetMonths).join(','),
  FUTURE_TIMELINE_MONTHS.join(','),
  'timeline 시점 순서',
);
eq(
  baselineSimulation.timeline.map((point) => point.label).join(','),
  '현재,6개월 후,1년 후,2년 후,3년 후,5년 후',
  'timeline 라벨',
);

const expectedAges = [22, 22.5, 23, 24, 25, 27];
const expectedAccountMonths = [14, 20, 26, 38, 50, 74];
const expectedPaidAmounts = [1_400_000, 2_000_000, 2_600_000, 3_800_000, 5_000_000, 7_400_000];
const expectedScores = [72, 75, 78, 84, 90, 95];

baselineSimulation.timeline.forEach((point, index) => {
  eq(point.age, expectedAges[index], `${point.label} 나이`);
  eq(point.accountMonths, expectedAccountMonths[index], `${point.label} 가입 개월`);
  eq(point.estimatedPaidAmount, expectedPaidAmounts[index], `${point.label} 예상 납입액`);
  eq(point.preparationScore, expectedScores[index], `${point.label} 준비도`);
  eq(point.basePreparationScore, calculatePreparationScore({
    ...base,
    age: point.age,
    accountMonths: point.accountMonths,
  }), `${point.label} 기존 준비도 함수와 일치`);
  eq(point.externalInsights.length, 0, `${point.label} 외부 insight는 계산에 없음`);
  eq(point.nextMilestone.externalInsights.length, 0, `${point.label} milestone insight 확장점`);
});

eq(baselineSimulation.timeline[0].changes.length, 0, '현재는 이전 시점 변화가 없음');
eq(baselineSimulation.timeline[1].deltaFromPrevious, 3, '6개월 변화량');
eq(baselineSimulation.timeline[2].deltaFromPrevious, 3, '1년 변화량');

// 통장이 없는 오염 프로필도 모든 미래 경로에서 0으로 유지한다.
const noAccount: UserProfile = {
  ...base,
  hasSubscriptionAccount: false,
  accountMonths: 48,
  monthlyPayment: 300_000,
};
const noAccountSimulation = simulateFutureTimeline(
  noAccount,
  getFutureScenario(noAccount, 'baseline'),
);
for (const point of noAccountSimulation.timeline) {
  eq(point.hasSubscriptionAccount, false, `${point.label} 통장 미보유`);
  eq(point.accountMonths, 0, `${point.label} 통장 미보유 가입 개월`);
  eq(point.monthlyPayment, 0, `${point.label} 통장 미보유 월 납입액`);
  eq(point.estimatedPaidAmount, 0, `${point.label} 통장 미보유 예상 납입액`);
}
eq(
  getFutureScenario(noAccount, 'custom', { keepSubscriptionAccount: true }).input
    .keepSubscriptionAccount,
  false,
  '통장 미보유 프로필에 유지 가정으로 새 통장을 만들지 않음',
);

// 월 납입 0은 임의의 납입액이나 누계를 만들지 않는다.
const zeroPayment = { ...base, monthlyPayment: 0 };
const zeroPaymentSimulation = simulateFutureTimeline(
  zeroPayment,
  getFutureScenario(zeroPayment, 'baseline'),
);
for (const point of zeroPaymentSimulation.timeline) {
  eq(point.monthlyPayment, 0, `${point.label} 월 납입 0 유지`);
  eq(point.estimatedPaidAmount, 0, `${point.label} 월 납입 0 예상액`);
}

// 통장 중단 scenario는 현재를 바꾸지 않고 첫 미래 시점부터 중단 가정을 적용한다.
const stoppedScenario = getFutureScenario(base, 'custom', {
  keepSubscriptionAccount: false,
});
const stoppedSimulation = simulateFutureTimeline(base, stoppedScenario);
eq(stoppedSimulation.timeline[0].hasSubscriptionAccount, true, '현재 통장 상태 보존');
for (const point of stoppedSimulation.timeline.slice(1)) {
  eq(point.hasSubscriptionAccount, false, `${point.label} 통장 중단`);
  eq(point.accountMonths, 0, `${point.label} 중단 후 가입 개월`);
  eq(point.monthlyPayment, 0, `${point.label} 중단 후 월 납입`);
  eq(point.estimatedPaidAmount, 0, `${point.label} 중단 후 예상 납입액`);
}
const stopChange = stoppedSimulation.timeline[1].changes.find(
  (change) => change.kind === 'account-status',
);
ok(stopChange, '통장 중단 change 누락');
eq(stopChange!.affectsPreparationScore, true, '통장 중단은 준비도 영향 변화');
ok(stopChange!.scoreDelta < 0, '통장 중단 scoreDelta가 감소가 아님');

// 세 시나리오는 같은 시점에서 비교되고 적극 준비/변화 가정 결과가 구분된다.
const customInput: FutureScenarioInput = {
  futureMonthlyPayment: 0,
  keepSubscriptionAccount: true,
  futureRegion: '경기도',
  futureIsNoHomeOwner: false,
};
const scenarios = createFutureScenarios(base, customInput);
eq(scenarios.map((scenario) => scenario.id).join(','), 'baseline,active,custom', '시나리오 3종');
const comparison = compareFutureScenarios(base, customInput, 60);
eq(comparison.results.length, 3, '시나리오 비교 결과 개수');
eq(comparison.results[0].point.preparationScore, 95, '기본 5년 준비도');
eq(comparison.results[1].point.preparationScore, 100, '적극 준비 5년 준비도');
eq(comparison.results[2].point.preparationScore, 65, '변화 가정 5년 준비도');
ok(
  comparison.results[1].point.preparationScore > comparison.results[0].point.preparationScore,
  '적극 준비가 기본과 구분되지 않음',
);
ok(
  comparison.results[2].point.preparationScore !== comparison.results[0].point.preparationScore,
  '변화 가정이 기본과 구분되지 않음',
);

const activeSimulation = simulateFutureTimeline(base, getFutureScenario(base, 'active'));
const expectedActionScores = [0, 2, 4, 8, 10, 5];
activeSimulation.timeline.forEach((point, index) => {
  eq(point.preparationActionScore, expectedActionScores[index], `${point.label} 실제 행동 보정값`);
  ok(point.preparationScore <= 100, `${point.label} 적극 준비 상한`);
});

// milestone: 가입 2년 → 다음 단계 → 다음 snapshot 순으로 deterministic하게 전환한다.
eq(
  baselineSimulation.timeline[0].nextMilestone.title,
  '가입 2년까지 10개월',
  '현재 가입 2년 milestone',
);
eq(
  baselineSimulation.timeline[1].nextMilestone.title,
  '가입 2년까지 4개월',
  '6개월 후 가입 2년 milestone',
);
eq(
  baselineSimulation.timeline[2].nextMilestone.title,
  '다음 준비 단계까지 2점',
  '1년 후 단계 milestone',
);
eq(
  baselineSimulation.timeline[3].nextMilestone.title,
  '3년 후 예상 준비도 90',
  '2년 후 다음 snapshot milestone',
);

// 실제 점수 요인과 단순 정보 변화를 명시적으로 분리한다.
const oneYearChanges = baselineSimulation.timeline[2].changes;
const durationChange = oneYearChanges.find((change) => change.kind === 'account-duration');
const ageChange = oneYearChanges.find((change) => change.kind === 'age');
const estimateChange = oneYearChanges.find((change) => change.kind === 'estimated-payment');
ok(durationChange, '가입 기간 change 누락');
eq(durationChange!.affectsPreparationScore, true, '가입 기간 점수 영향');
ok(durationChange!.scoreDelta > 0, '가입 기간 scoreDelta');
ok(ageChange, '나이 change 누락');
eq(ageChange!.affectsPreparationScore, false, '나이가 준비도에 영향을 줌');
eq(ageChange!.scoreDelta, 0, '나이 scoreDelta');
ok(estimateChange, '예상 납입액 change 누락');
eq(estimateChange!.affectsPreparationScore, false, '예상 납입액 자체가 준비도에 영향을 줌');
ok(estimateChange!.reason.includes('실제 납입 누계가 아니에요'), '예상 납입액 가정 고지');

const regionScenario = getFutureScenario(base, 'custom', { futureRegion: '인천광역시' });
const regionSimulation = simulateFutureTimeline(base, regionScenario);
const regionChange = regionSimulation.timeline[1].changes.find((change) => change.kind === 'region');
ok(regionChange, '지역 변화 change 누락');
eq(regionChange!.affectsPreparationScore, false, '유효한 지역명 사이 이동이 점수를 바꿈');
eq(regionChange!.scoreDelta, 0, '지역 이동 scoreDelta');

const homeScenario = getFutureScenario(base, 'custom', { futureIsNoHomeOwner: false });
const homeSimulation = simulateFutureTimeline(base, homeScenario);
const homeChange = homeSimulation.timeline[1].changes.find(
  (change) => change.kind === 'home-ownership',
);
ok(homeChange, '주택 보유 변화 change 누락');
eq(homeChange!.affectsPreparationScore, true, '주택 보유 상태 점수 영향 누락');
eq(homeChange!.scoreDelta, -15, '주택 보유 상태 기존 준비도 의미와 불일치');

// Scenario transport 경계는 손상된 입력을 거절하고 수치 범위를 정규화한다.
const serialized = serializeFutureScenario(getFutureScenario(base, 'custom', customInput));
const parsed = parseFutureScenario(base, serialized);
eq(parsed?.id, 'custom', 'scenario 직렬화/역직렬화 id');
eq(parsed?.input.futureRegion, customInput.futureRegion, 'scenario 직렬화/역직렬화 지역');
eq(parseFutureScenario(base, '{broken'), null, '깨진 scenario JSON');
eq(parseFutureScenario(base, JSON.stringify({ version: 1, id: 'baseline' })), null, '구버전 scenario');
const clamped = parseFutureScenario(
  base,
  JSON.stringify({
    version: 2,
    id: 'custom',
    input: { futureMonthlyPayment: 99_999_999 },
  }),
);
eq(clamped?.input.futureMonthlyPayment, LIMITS.monthlyPayment.max, '미래 월 납입액 상한');
eq(
  getDefaultFutureScenarioInput(noAccount).futureMonthlyPayment,
  0,
  '통장 미보유 기본 scenario 납입액 정규화',
);

// AI context는 domain 결과를 복사하고 계산/자격 추론 권한을 명시적으로 갖지 않는다.
const activeScenario = getFutureScenario(base, 'active');
const activeDomain = simulateFutureTimeline(base, activeScenario);
const aiContext = buildFutureAiContext(base, activeScenario);
eq(aiContext.calculationSource, 'domain-calculated-read-only', 'AI 계산 source');
eq(aiContext.aiPolicy.role, 'explain-provided-results-only', 'AI 설명 전용 role');
for (const forbidden of [
  'calculate-new-preparation-score',
  'infer-eligibility',
  'infer-official-points',
  'infer-priority-status',
  'infer-winning-probability',
]) {
  ok(aiContext.aiPolicy.mustNot.includes(forbidden as never), `AI 금지 정책 누락: ${forbidden}`);
}
eq(aiContext.timeline.length, activeDomain.timeline.length, 'AI timeline 길이');
aiContext.timeline.forEach((point, index) => {
  const domainPoint = activeDomain.timeline[index];
  eq(point.offsetMonths, domainPoint.offsetMonths, `${point.label} AI offset`);
  eq(point.age, domainPoint.age, `${point.label} AI 나이`);
  eq(point.accountMonths, domainPoint.accountMonths, `${point.label} AI 가입 개월`);
  eq(point.estimatedPaidAmount, domainPoint.estimatedPaidAmount, `${point.label} AI 예상 납입액`);
  eq(point.preparationScore, domainPoint.preparationScore, `${point.label} AI 준비도`);
  eq(point.deltaFromPrevious, domainPoint.deltaFromPrevious, `${point.label} AI 변화량`);
  eq(point.nextMilestone.id, domainPoint.nextMilestone.id, `${point.label} AI milestone`);
});
eq(aiContext.externalInsights.length, 0, 'AI context 외부 insight 미구현');
const aiPrompt = formatFutureAiContextForPrompt(aiContext);
ok(aiPrompt.includes('[FUTURE_SIMULATION_V2_DOMAIN_CONTEXT]'), 'Future AI 구조화 블록 시작');
ok(aiPrompt.includes('읽기 전용 결과'), 'Future AI 읽기 전용 지시');
ok(aiPrompt.includes('새 점수·자격·가점·1순위·당첨 가능성을 계산하거나 추론하지 말고'), 'Future AI 추론 금지 지시');
for (const point of activeDomain.timeline) {
  ok(
    aiPrompt.includes(`"preparationScore": ${point.preparationScore}`),
    `${point.label} domain 준비도가 AI prompt에 없음`,
  );
}

// 지원하지 않는 시점은 타입 경계 밖이며 비교는 명시된 시점만 받는다.
for (const offset of FUTURE_TIMELINE_MONTHS) {
  const typedOffset: FutureMonthOffset = offset;
  ok(
    baselineSimulation.timeline.some((point) => point.offsetMonths === typedOffset),
    `${offset}개월 시점 누락`,
  );
}

console.log(`domain/futureSimulation: ${checks}개 검증 통과`);

