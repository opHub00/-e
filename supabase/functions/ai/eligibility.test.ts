// npm run test:edge
// isEligibilityQuestion() 을 직접 호출해서 검증한다. 소스 문자열 검사가 아니다.
import {
  ELIGIBILITY_REPLY,
  formatEligibilityExplanationContext,
  isEligibilityExplanationContext,
  isEligibilityQuestion,
} from './eligibility.ts';
import { quizzes } from '../../../data/quizzes.ts';
import { QUIZ_EXPLAIN_PROMPT } from '../../../domain/quiz.ts';

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  checks += 1;
  if (!cond) throw new Error(`FAIL: ${msg}`);
};
const eq = (a: unknown, b: unknown, msg: string) => ok(a === b, `${msg} (${a} !== ${b})`);

// ── 퀴즈 10개 CTA 전부 통과해야 한다 ──────────────────────────────────────
// CTA 는 문항 텍스트를 싣지 않고 항상 같은 canonical prompt 를 보낸다.
eq(quizzes.length, 10, '퀴즈 개수');
for (const quiz of quizzes) {
  ok(
    !isEligibilityQuestion(QUIZ_EXPLAIN_PROMPT),
    `퀴즈 ${quiz.id} CTA 가 차단됨 (canonical prompt)`,
  );
}
// canonical prompt 자체도 한 번 더 명시적으로
ok(!isEligibilityQuestion(QUIZ_EXPLAIN_PROMPT), 'canonical prompt 가 차단됨');

// 문항 텍스트를 그대로 보내면 걸리는 문항이 실제로 있다.
// (그래서 canonical prompt 로 우회하는 구조가 필요하다는 근거)
const wouldBlock = quizzes.filter((q) => isEligibilityQuestion(q.question));
ok(wouldBlock.length > 0, '문항 직접 전송이 왜 위험한지 보여주는 케이스가 없음');
ok(
  wouldBlock.some((q) => q.id === 'q9'),
  'q9(당첨 확률 문항)이 필터에 걸리지 않음 — 회귀 케이스 소실',
);

// ── 앱의 다른 CTA / 추천 질문도 통과해야 한다 ────────────────────────────
const MUST_PASS = [
  '지금 제가 뭘 하면 좋을까요?',
  '지금 조건을 유지하면 2년 뒤 준비도가 72점에서 84점이 된다고 나와요. 왜 이렇게 달라지나요?',
  '제 청약통장 14개월은 어떤 의미예요?',
  '2년 뒤 준비도가 84점이 되면 뭐가 달라져요?',
  '제 또래는 보통 뭐부터 시작해요?',
  '준비도가 어떻게 올라가요?',
  '청약통장은 왜 먼저 만들어야 해요?',
  '매달 얼마씩 넣는 게 좋아요?',
  '',
  '   ',
];
for (const q of MUST_PASS) {
  ok(!isEligibilityQuestion(q), `통과되어야 함: "${q}"`);
}

// ── 금지 질문: 키워드 직접 ────────────────────────────────────────────────
const MUST_BLOCK_KEYWORD = [
  '제가 1순위인가요?',
  '1 순위 조건이 뭐예요?',
  '특별공급 자격이 되나요?',
  '특공 넣을 수 있어요?',
  '일반공급이랑 뭐가 달라요?',
  '제 청약 가점은 몇 점이에요?',
  '가점 계산해주세요',
  '당첨 확률이 얼마나 돼요?',
  '제가 신청 자격이 있나요?',
  '자격 요건 충족했나요?',
  '무주택 기간은 어떻게 쳐요?',
  '추첨제로 넣으면 유리한가요?',
  '2순위는 뭐예요?',
];
for (const q of MUST_BLOCK_KEYWORD) {
  ok(isEligibilityQuestion(q), `차단되어야 함(키워드): "${q}"`);
}

// ── 금지 질문: 키워드를 피한 우회 표현 ────────────────────────────────────
const MUST_BLOCK_PARAPHRASE = [
  '제가 지금 청약 넣을 수 있나요?',
  '청약 신청 가능한 상태예요?',
  '저 이거 대상 되나요?',
  '나 여기 해당 될 수 있어요?',
  '제가 해당 되나요?',
  '지금 넣으면 붙을 가능성 있어요?',
  '붙을 확률 어느 정도예요?',
  '당첨 가능성 높은 편인가요?',
  '제가 첫 번째 순위에 드나요?',
  '제일 앞 순위가 되려면요?',
];
for (const q of MUST_BLOCK_PARAPHRASE) {
  ok(isEligibilityQuestion(q), `차단되어야 함(우회): "${q}"`);
}

// 고정 안내문에 요구 문장이 그대로 있어야 한다
ok(
  ELIGIBILITY_REPLY.startsWith('정확한 자격은 해당 모집공고와 공식 기준 확인이 필요합니다'),
  '고정 안내문이 요구 문구와 다름',
);

const deterministicContext = {
  feature: 'first_home_private_v1' as const,
  status: 'needs_information' as const,
  passedChecks: [{ id: 'scope', label: '지원 범위', reason: '민영주택 범위예요.' }],
  missingChecks: [{ id: 'housing', label: '주택 이력', reason: '정보가 필요해요.' }],
  listingChecks: [],
  failedChecks: [],
  actions: ['주택 이력 확인'],
  ruleSetVersion: 'KR-FIRST-HOME-PRIVATE-2026.07.08-v1',
  effectiveDate: '2026-07-08',
};
ok(isEligibilityExplanationContext(deterministicContext), '정상 structured result 허용');
eq(
  formatEligibilityExplanationContext(deterministicContext),
  JSON.stringify(deterministicContext),
  'AI eligibility context deterministic',
);
ok(
  !isEligibilityExplanationContext({ ...deterministicContext, rawProfile: { name: '민지' } }),
  'raw profile 추가 시 거부',
);
ok(
  !isEligibilityExplanationContext({ ...deterministicContext, status: 'probably_yes' }),
  '임의 status 거부',
);

console.log(`supabase/functions/ai: ${checks}개 검증 통과`);
