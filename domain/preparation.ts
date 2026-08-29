import type { FutureSnapshot, Stage, UserProfile, Years } from './types';

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Math.round(value)));

/** 청약통장 가입 2년 시점을 준비도의 핵심 마일스톤으로 본다. */
export const MILESTONE_MONTHS = 24;

/** 입력 허용 범위. 온보딩과 domain 이 같은 값을 쓴다. */
export const LIMITS = {
  age: { min: 15, max: 99 },
  accountMonths: { min: 0, max: 600 },
  monthlyPayment: { min: 0, max: 5_000_000 },
} as const;

const inRange = (value: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));

export type FieldIssue = 'empty' | 'nan' | 'range';

/**
 * 온보딩 숫자 입력 검증. 세 가지 실패를 구분한다.
 * 빈 문자열을 0 으로 흘려보내지 않기 위해 clamp 이전 단계에서 막는다.
 */
export function validateNumberField(
  raw: string,
  limit: { min: number; max: number },
): FieldIssue | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 'empty';

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return 'nan';
  if (value < limit.min || value > limit.max) return 'range';
  return null;
}

/**
 * 프로필을 계산 가능한 상태로 맞춘다.
 * 통장이 없으면 가입 개월/납입액은 0이어야 한다. 이 불변식을 여기서 한 번만 보장한다.
 */
export function normalizeProfile(profile: UserProfile): UserProfile {
  const hasAccount = profile.hasSubscriptionAccount;
  return {
    ...profile,
    name: profile.name.trim(),
    region: profile.region.trim(),
    age: inRange(profile.age, LIMITS.age),
    accountMonths: hasAccount ? inRange(profile.accountMonths, LIMITS.accountMonths) : 0,
    monthlyPayment: hasAccount ? inRange(profile.monthlyPayment, LIMITS.monthlyPayment) : 0,
  };
}

/**
 * 완판e 내부 준비도 지표.
 * 실제 청약 가점/당첨 확률이 아니다.
 */
export function calculatePreparationScore(profile: UserProfile): number {
  // 통장 없이 들어온 가입 개월/납입액이 점수에 새지 않도록 여기서도 막는다.
  const p = normalizeProfile(profile);
  let score = 10;

  if (p.hasSubscriptionAccount) {
    score += 20;
    score += Math.min(p.accountMonths / 2, 30);
    if (p.monthlyPayment > 0) score += 15;
  }

  if (p.isNoHomeOwner) score += 15;
  if (p.region.length > 0) score += 5;

  return clamp(score);
}

export function getStage(score: number): Stage {
  if (score >= 80) return { emoji: '🚀', label: '준비가 잘 된 단계' };
  if (score >= 60) return { emoji: '🌳', label: '탄탄해지는 단계' };
  if (score >= 40) return { emoji: '🌿', label: '자라는 단계' };
  return { emoji: '🌱', label: '시작하는 단계' };
}

export function simulateFuture(input: UserProfile, years: Years): FutureSnapshot {
  const profile = normalizeProfile(input);
  const addedMonths = years * 12;
  const nextProfile: UserProfile = {
    ...profile,
    age: profile.age + years,
    accountMonths: profile.hasSubscriptionAccount
      ? profile.accountMonths + addedMonths
      : 0,
  };

  // 지금 월 납입액을 그대로 유지한다고 가정한 예상값. 실제 납입 이력이 아니다.
  const estimatedPaidAmount = profile.hasSubscriptionAccount
    ? profile.monthlyPayment * nextProfile.accountMonths
    : 0;

  return {
    years,
    age: nextProfile.age,
    accountMonths: nextProfile.accountMonths,
    estimatedPaidAmount,
    preparationScore: calculatePreparationScore(nextProfile),
  };
}

export function getRecommendedActions(input: UserProfile): string[] {
  const profile = normalizeProfile(input);
  const actions: string[] = [];

  if (!profile.hasSubscriptionAccount) {
    actions.push('청약통장 개설 여부부터 확인해보세요.');
  } else if (profile.accountMonths < MILESTONE_MONTHS) {
    const left = MILESTONE_MONTHS - profile.accountMonths;
    actions.push(`가입 2년까지 ${left}개월 남았어요. 통장을 그대로 유지해보세요.`);
  } else {
    actions.push('가입 2년을 넘겼어요. 지금 조건을 그대로 지켜보세요.');
  }

  if (profile.monthlyPayment <= 0) {
    actions.push('부담 가능한 범위에서 정기 납입 계획을 세워보세요.');
  } else {
    actions.push('현재 정기 납입 습관을 유지해보세요.');
  }

  if (!profile.isNoHomeOwner) {
    actions.push('무주택 조건이 언제 바뀌는지 확인해보세요.');
  } else {
    actions.push('오늘의 30초 청약 콘텐츠 하나를 확인해보세요.');
  }

  return actions.slice(0, 3);
}

const won = (value: number) =>
  value >= 10000
    ? `${Math.round(value / 10000).toLocaleString('ko-KR')}만원`
    : `${value.toLocaleString('ko-KR')}원`;

/**
 * 준비도가 왜 달라지는지 사실만 나열한다.
 * 이미 계산된 값의 before → after 만 쓰고, 없는 변화는 말하지 않는다.
 */
export function explainFutureChange(input: UserProfile, future: FutureSnapshot): string[] {
  const profile = normalizeProfile(input);
  const reasons: string[] = [];

  if (profile.hasSubscriptionAccount) {
    reasons.push(
      `청약통장 가입 기간이 ${profile.accountMonths}개월 → ${future.accountMonths}개월이 돼요.`,
    );
    if (profile.accountMonths < MILESTONE_MONTHS && future.accountMonths >= MILESTONE_MONTHS) {
      reasons.push('가입 2년을 넘겨요. 시간이 쌓여야만 생기는 조건이에요.');
    }
    if (profile.monthlyPayment > 0) {
      const now = profile.monthlyPayment * profile.accountMonths;
      reasons.push(
        `지금 월 납입액(${won(profile.monthlyPayment)})을 계속 유지한다고 가정하면 ` +
          `예상 납입액이 ${won(now)} → ${won(future.estimatedPaidAmount)}가 돼요.`,
      );
    }
  } else {
    reasons.push('청약통장이 없어서 시간이 지나도 쌓이는 게 없어요.');
  }

  reasons.push(`나이가 ${profile.age}세 → ${future.age}세가 돼요.`);

  const nowStage = getStage(calculatePreparationScore(profile));
  const nextStage = getStage(future.preparationScore);
  if (nowStage.label !== nextStage.label) {
    reasons.push(`준비 단계가 ${nowStage.label} → ${nextStage.label}로 바뀌어요.`);
  }

  return reasons;
}

export const DISCLAIMER =
  '완판e 준비도는 청약 준비 행동을 이해하기 위한 서비스 내부 지표이며, 실제 당첨 확률이나 공식 청약 가점을 의미하지 않아요.';
