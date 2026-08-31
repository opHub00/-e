// npm run test:domain
import {
  YEAR_OPTIONS,
  buildAiContext,
  formatContextForPrompt,
  getSuggestedQuestions,
} from './aiContext.ts';
import { calculatePreparationScore, getStage } from './preparation.ts';
import type { UserProfile } from './types';
import { createMinimalApplicantProfile, toLegacyUserProfile } from '../features/profile/domain.ts';

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
const blankRegion: UserProfile = { ...base, region: '   ' };

// context 는 domain 계산 결과와 항상 일치한다 (AI가 새로 계산하지 않는 근거)
const ctx = buildAiContext(base);
eq(ctx.score, calculatePreparationScore(base), '준비도 불일치');
eq(ctx.stage.label, getStage(ctx.score).label, '단계 라벨');
eq(ctx.recommendedActions.length, 3, '추천 행동 개수');
eq(ctx.futures.length, YEAR_OPTIONS.length, '미래 시뮬레이션 개수');
eq(
  ctx.futures.map((f) => f.years).join(','),
  YEAR_OPTIONS.join(','),
  '미래 시뮬레이션 연차',
);

// 프롬프트 블록: 상태 값이 전부 문자열에 들어간다
const prompt = formatContextForPrompt(ctx);
for (const needle of [
  base.name,
  `${base.age}세`,
  base.region,
  '무주택',
  `${base.accountMonths}개월째`,
  `${ctx.score}점`,
  ctx.stage.label,
  '추천 행동:',
  '미래 시뮬레이션',
]) {
  ok(prompt.includes(needle), `프롬프트에 '${needle}' 없음`);
}
for (const a of ctx.recommendedActions) ok(prompt.includes(a), `프롬프트에 추천 행동 누락: ${a}`);
for (const f of ctx.futures) {
  ok(prompt.includes(`${f.years}년 후`), `프롬프트에 ${f.years}년 후 누락`);
  ok(prompt.includes(`준비도 ${f.preparationScore}점`), `프롬프트에 ${f.years}년 준비도 누락`);
}

// 준비도가 내부 지표라는 고지는 항상 붙는다
ok(prompt.includes('실제 당첨 확률'), '프롬프트에 준비도 고지 누락');

// 통장 없는 프로필도 깨지지 않고, '없음'으로 표현된다
const noAccountPrompt = formatContextForPrompt(buildAiContext(noAccount));
ok(noAccountPrompt.includes('청약통장: 없음'), '통장 없음 표기');
ok(!noAccountPrompt.includes('개월째'), '통장 없는데 가입 개월이 노출됨');

// 지역이 비어 있어도 빈칸을 남기지 않는다
ok(
  formatContextForPrompt(buildAiContext(blankRegion)).includes('지역: 입력 안 함'),
  '빈 지역 처리',
);

// 추천 질문 3개, 상태에 따라 달라진다
for (const p of [base, noAccount, blankRegion]) {
  const qs = getSuggestedQuestions(buildAiContext(p));
  eq(qs.length, 3, '추천 질문 개수');
  eq(new Set(qs).size, 3, '추천 질문 중복');
  for (const q of qs) ok(q.trim().length > 0, '빈 추천 질문');
}
ok(
  getSuggestedQuestions(buildAiContext(base))[0] !==
    getSuggestedQuestions(buildAiContext(noAccount))[0],
  '통장 유무에 따라 추천 질문이 같음',
);
ok(
  getSuggestedQuestions(ctx)[0].includes(`${base.accountMonths}개월`),
  '추천 질문에 실제 가입 개월 없음',
);

// Progressive Profile의 unknown은 false/0으로 AI context에 흘리지 않는다.
const minimalApplicant = createMinimalApplicantProfile({
  name: '민지',
  age: 27,
  currentRegion: '서울특별시',
  preferredRegions: ['서울특별시'],
});
const minimalContext = buildAiContext(toLegacyUserProfile(minimalApplicant), minimalApplicant);
const minimalPrompt = formatContextForPrompt(minimalContext);
ok(minimalPrompt.includes('이름: 민지'), 'known 이름 유지');
ok(minimalPrompt.includes('지역: 서울특별시'), 'known 지역 유지');
ok(!minimalPrompt.includes('청약통장: 없음'), 'unknown 통장을 없음으로 변환하면 안 됨');
ok(!minimalPrompt.includes('주택 보유:'), 'unknown 주택 상태를 false로 변환하면 안 됨');
ok(!minimalPrompt.includes('완판e 준비도:'), 'unknown 기반 계산값은 AI context에서 제외');
ok(!minimalPrompt.includes('미래 시뮬레이션 ('), 'unknown 기반 Future 숫자는 AI context에서 제외');
ok(
  getSuggestedQuestions(minimalContext)[0].includes('정보를 추가하면'),
  'unknown 통장에는 보유/미보유를 단정하지 않는 질문',
);

console.log(`domain/aiContext: ${checks}개 검증 통과`);
