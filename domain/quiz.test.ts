// npm run test:domain
import { quizzes } from '../data/quizzes.ts';
import { XP_PER_LEVEL, getLevel, getPersonalMessage, getTodayQuiz } from './quiz.ts';
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

const noAccount: UserProfile = { ...base, hasSubscriptionAccount: false, accountMonths: 0 };

// 데이터: 10개, id 중복 없음, 필수 문구가 비어있지 않음
eq(quizzes.length, 10, '퀴즈 개수');
eq(new Set(quizzes.map((q) => q.id)).size, 10, 'id 중복');
for (const q of quizzes) {
  ok(q.question.length > 0 && q.explanation.length > 0, `${q.id} 문구 누락`);
  ok(q.personalTip.length > 0, `${q.id} personalTip 누락`);
}

// 레벨: 0 XP 는 Lv.1, 경계에서 정확히 올라간다
eq(getLevel(0).level, 1, '0 XP 레벨');
eq(getLevel(XP_PER_LEVEL - 1).level, 1, '레벨업 직전');
eq(getLevel(XP_PER_LEVEL).level, 2, '레벨업 경계');
eq(getLevel(-50).level, 1, '음수 XP 방어');
// 레벨 이름은 XP가 아무리 커도 항상 붙는다 (배열 끝에서 멈춤)
for (const xp of [0, 30, 99, 100, 640, 99999]) {
  ok(getLevel(xp).title.length > 0, `레벨 이름: ${xp}`);
}

// 오늘의 퀴즈: 같은 날은 같은 문제, 다음 날은 다른 문제
const day = new Date(2026, 7, 24, 9, 0);
eq(getTodayQuiz(quizzes, day).id, getTodayQuiz(quizzes, new Date(2026, 7, 24, 23, 0)).id, '같은 날 동일 문제');
ok(getTodayQuiz(quizzes, day).id !== getTodayQuiz(quizzes, new Date(2026, 7, 25, 9, 0)).id, '다음 날 다른 문제');
// 10일 돌면 10개 전부 나온다
const cycle = new Set(
  Array.from({ length: 10 }, (_, i) => getTodayQuiz(quizzes, new Date(2026, 7, 24 + i)).id),
);
eq(cycle.size, 10, '10일 주기로 전 문항 노출');

// 개인화: 프로필 값이 실제로 들어가고, 프로필이 다르면 문구도 달라진다
for (const q of quizzes) {
  const msg = getPersonalMessage(q, base);
  ok(msg.length > 0, `${q.id} 개인화 문구 없음`);
  if (q.topic) ok(msg.includes(base.name), `${q.id} 개인화 문구에 이름이 없음`);
  else eq(msg, q.personalTip, `${q.id} topic 없으면 고정 문구`);
}
const accountQuiz = quizzes.find((q) => q.topic === 'account')!;
ok(
  getPersonalMessage(accountQuiz, base) !== getPersonalMessage(accountQuiz, noAccount),
  '통장 유무에 따라 개인화 문구가 같음',
);
ok(getPersonalMessage(accountQuiz, base).includes('10개월'), '2년까지 남은 개월 계산');
const scoreQuiz = quizzes.find((q) => q.topic === 'score')!;
ok(/\d+점/.test(getPersonalMessage(scoreQuiz, base)), '준비도 점수가 문구에 없음');

console.log(`domain/quiz: ${checks}개 검증 통과`);
