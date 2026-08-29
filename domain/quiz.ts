import type { Quiz } from '../data/quizzes';
import { MILESTONE_MONTHS, calculatePreparationScore, simulateFuture } from './preparation.ts';
import type { UserProfile } from './types';

export const XP_PER_QUIZ = 10;

/**
 * Quiz 결과 CTA 가 AI 에 보내는 고정 문구.
 * 문항 텍스트를 그대로 넣으면 자격 필터에 걸리므로(예: '당첨 확률', '자격 조건'),
 * 질문은 항상 이 문구로 보내고 문항/해설은 별도 채널로 전달한다.
 */
export const QUIZ_EXPLAIN_PROMPT = '이 문제의 정답과 이유를 제 상황에 맞춰 더 쉽게 설명해줘.';
export const XP_PER_LEVEL = 100;

const LEVEL_TITLES = ['청약 새싹', '청약 입문', '청약 준비생', '청약 지킴이', '청약 고수'] as const;

export type LevelInfo = { level: number; title: string };

export function getLevel(xp: number): LevelInfo {
  const level = Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
  return { level, title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] };
}

/** 같은 날에는 항상 같은 문제가 나오도록 로컬 날짜로 고른다. */
export function getTodayQuiz(pool: Quiz[], date = new Date()): Quiz {
  const localDay = Math.floor(
    (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000,
  );
  return pool[((localDay % pool.length) + pool.length) % pool.length];
}

const OCCUPATION_LABEL: Record<UserProfile['occupation'], string> = {
  student: '학생',
  worker: '직장인',
  etc: '지금',
};

/**
 * "그래서 나에게는?" 문구.
 * quiz.topic 이 없으면 데이터의 고정 문구로 떨어진다.
 */
export function getPersonalMessage(quiz: Quiz, profile: UserProfile): string {
  const name = profile.name;

  switch (quiz.topic) {
    case 'account':
      if (!profile.hasSubscriptionAccount) {
        return `${name}님은 아직 청약통장이 없어요. 통장을 여는 게 지금 가장 빠른 한 걸음이에요.`;
      }
      if (profile.accountMonths < MILESTONE_MONTHS) {
        const left = MILESTONE_MONTHS - profile.accountMonths;
        return `${name}님 통장은 ${profile.accountMonths}개월째예요. 가입 2년까지 ${left}개월 남았어요.`;
      }
      return `${name}님 통장은 이미 ${profile.accountMonths}개월째예요. 이 기간은 되돌릴 수 없는 자산이에요.`;

    case 'timing': {
      const after5 = simulateFuture(profile, 5);
      return `${OCCUPATION_LABEL[profile.occupation]}인 ${name}님은 5년 뒤 ${after5.age}세, 통장 ${after5.accountMonths}개월이 돼요. 시간이 쌓여야 생기는 조건이라 지금 시작하는 게 의미가 있어요.`;
    }

    case 'future': {
      const after2 = simulateFuture(profile, 2);
      const delta = after2.preparationScore - calculatePreparationScore(profile);
      return delta > 0
        ? `${name}님이 지금 조건을 유지하면 2년 뒤 준비도가 ${delta}점 올라가요.`
        : `${name}님 조건은 시간만으로는 크게 달라지지 않아요. 통장이나 납입부터 바꿔야 해요.`;
    }

    case 'score':
      return `${name}님의 지금 준비도는 ${calculatePreparationScore(profile)}점이에요. 당첨 확률이 아니라 준비 상태를 보는 완판e 내부 지표예요.`;

    case 'profile': {
      const bits = [
        profile.region.trim() ? `${profile.region} 거주` : '지역 미입력',
        profile.isNoHomeOwner ? '무주택' : '주택 보유',
      ];
      return `${name}님은 지금 ${bits.join(' · ')}으로 저장돼 있어요. 이 조건이 바뀌면 준비도도 같이 달라져요.`;
    }

    default:
      return quiz.personalTip;
  }
}
