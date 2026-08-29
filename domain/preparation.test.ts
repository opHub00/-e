// npm run test:domain
import {
  MILESTONE_MONTHS,
  calculatePreparationScore,
  explainFutureChange,
  getRecommendedActions,
  getStage,
  simulateFuture,
} from './preparation.ts';
import type { UserProfile } from './types';

// ponytail: node:assert 는 expo tsconfig 의 react-native condition 에서 타입 해석이 안 된다.
// 검증이 늘어나면 그때 vitest 로 올린다.
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

const noAccount: UserProfile = { ...base, hasSubscriptionAccount: false, accountMonths: 0 };

// 점수는 항상 0~100
for (const p of [base, noAccount, { ...base, accountMonths: 600 }, { ...base, region: '  ' }]) {
  const s = calculatePreparationScore(p);
  ok(s >= 0 && s <= 100, `점수 범위를 벗어남: ${s}`);
}

// 통장이 있으면 준비도가 더 높다
ok(
  calculatePreparationScore(base) > calculatePreparationScore(noAccount),
  '통장 보유가 점수에 반영되지 않음',
);

// accountMonths 가산은 30점에서 멈춘다
eq(
  calculatePreparationScore({ ...base, accountMonths: 60 }),
  calculatePreparationScore({ ...base, accountMonths: 600 }),
  '가입 개월 가산 상한이 없음',
);

// 미래는 나이/개월이 늘고 준비도가 줄지 않는다
for (const years of [1, 2, 5] as const) {
  const f = simulateFuture(base, years);
  eq(f.age, base.age + years, `${years}년 후 나이`);
  eq(f.accountMonths, base.accountMonths + years * 12, `${years}년 후 가입 개월`);
  eq(f.estimatedPaidAmount, base.monthlyPayment * f.accountMonths, `${years}년 후 납입 누계`);
  ok(
    f.preparationScore >= calculatePreparationScore(base),
    `${years}년 후 준비도가 오히려 낮아짐`,
  );
}

// 통장이 없으면 시간이 지나도 개월수/납입액은 그대로
const f5 = simulateFuture(noAccount, 5);
eq(f5.accountMonths, 0, '통장 없는데 개월수가 늘어남');
eq(f5.estimatedPaidAmount, 0, '통장 없는데 납입액이 생김');

// 단계는 점수와 함께 올라간다
eq(getStage(0).label, '시작하는 단계', '최저 단계');
eq(getStage(100).label, '준비가 잘 된 단계', '최고 단계');

// 추천 행동은 항상 3개, 상태에 맞게 달라진다
for (const p of [base, noAccount, { ...base, monthlyPayment: 0 }, { ...base, isNoHomeOwner: false }]) {
  eq(getRecommendedActions(p).length, 3, '추천 행동 개수');
}
ok(
  getRecommendedActions(base)[0].includes(`${MILESTONE_MONTHS - base.accountMonths}개월`),
  '2년 마일스톤까지 남은 개월이 안내되지 않음',
);
ok(getRecommendedActions(noAccount)[0].includes('개설'), '통장 없을 때 개설 안내가 없음');

// 변화 이유: 있는 사실만 말하고 없는 변화는 말하지 않는다
for (const years of [1, 2, 5] as const) {
  const f = simulateFuture(base, years);
  const reasons = explainFutureChange(base, f);
  ok(reasons.length >= 2, `${years}년 변화 이유가 너무 적음`);
  ok(
    reasons.some((r) => r.includes(`${base.accountMonths}개월 → ${f.accountMonths}개월`)),
    `${years}년 통장 기간 변화 누락`,
  );
  ok(
    reasons.some((r) => r.includes(`${base.age}세 → ${f.age}세`)),
    `${years}년 나이 변화 누락`,
  );
}

// 단계가 그대로면 단계가 올라간다고 말하지 않는다 (과장 금지)
const flat = { ...base, accountMonths: 60 };
const flatFuture = simulateFuture(flat, 1);
eq(
  getStage(calculatePreparationScore(flat)).label,
  getStage(flatFuture.preparationScore).label,
  '테스트 전제: 단계가 그대로여야 함',
);
ok(
  !explainFutureChange(flat, flatFuture).some((r) => r.includes('단계가')),
  '단계가 안 바뀌었는데 바뀐다고 말함',
);

// 2년 마일스톤을 넘길 때만 그 사실을 말한다
ok(
  explainFutureChange(base, simulateFuture(base, 1)).some((r) => r.includes('가입 2년을 넘겨요')),
  '2년 돌파를 안내하지 않음',
);
ok(
  !explainFutureChange(flat, flatFuture).some((r) => r.includes('가입 2년을 넘겨요')),
  '이미 2년을 넘겼는데 또 넘긴다고 말함',
);

// 통장이 없으면 쌓이는 게 없다고만 말하고 납입 얘기를 하지 않는다
const noAccountReasons = explainFutureChange(noAccount, simulateFuture(noAccount, 5));
ok(noAccountReasons.some((r) => r.includes('쌓이는 게 없어요')), '통장 없음 안내 누락');
ok(!noAccountReasons.some((r) => r.includes('납입 누계')), '통장 없는데 납입 누계를 말함');

console.log(`domain/preparation: ${checks}개 검증 통과`);
