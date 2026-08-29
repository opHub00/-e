import {
  DISCLAIMER,
  calculatePreparationScore,
  getRecommendedActions,
  getStage,
  normalizeProfile,
  simulateFuture,
} from './preparation.ts';
import type { FutureSnapshot, Stage, UserProfile, Years } from './types';
import {
  getKnownApplicantSignals,
  type ApplicantProfileV2,
} from '../features/profile/domain.ts';

export const YEAR_OPTIONS: Years[] = [1, 2, 5];

export type AiContext = {
  profile: UserProfile;
  knownProfile?: ReturnType<typeof getKnownApplicantSignals>;
  score: number;
  stage: Stage;
  recommendedActions: string[];
  futures: FutureSnapshot[];
};

/** AI에 넘길 숫자는 전부 여기서 domain 함수로 계산한다. AI는 계산하지 않는다. */
export function buildAiContext(input: UserProfile, applicantProfile?: ApplicantProfileV2): AiContext {
  const profile = normalizeProfile(input);
  const score = calculatePreparationScore(profile);
  return {
    profile,
    knownProfile: applicantProfile ? getKnownApplicantSignals(applicantProfile) : undefined,
    score,
    stage: getStage(score),
    recommendedActions: getRecommendedActions(profile),
    futures: YEAR_OPTIONS.map((years) => simulateFuture(profile, years)),
  };
}

const OCCUPATION_LABEL: Record<UserProfile['occupation'], string> = {
  student: '학생',
  worker: '직장인',
  etc: '그 외',
};

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/**
 * Edge Function 프롬프트에 그대로 붙는 사용자 상태 블록.
 * 여기 없는 숫자는 AI가 만들어내면 안 된다.
 */
export function formatContextForPrompt(ctx: AiContext): string {
  const { profile, knownProfile, score, stage, recommendedActions, futures } = ctx;

  const account = profile.hasSubscriptionAccount
    ? `있음, ${profile.accountMonths}개월째, 매달 ${won(profile.monthlyPayment)} 납입 중`
    : '없음';

  const knownLines = knownProfile
    ? [
        knownProfile.name ? `이름: ${knownProfile.name}` : null,
        `나이: ${knownProfile.age}세${knownProfile.occupation ? ` (${OCCUPATION_LABEL[knownProfile.occupation]})` : ''}`,
        knownProfile.currentRegion ? `지역: ${knownProfile.currentRegion}` : null,
        knownProfile.housingStatus
          ? `주택 보유: ${knownProfile.housingStatus === 'no-home' ? '무주택' : '주택 보유'}`
          : null,
        knownProfile.hasSubscriptionAccount === undefined
          ? null
          : knownProfile.hasSubscriptionAccount
            ? `청약통장: 있음${knownProfile.accountMonths === undefined ? '' : `, ${knownProfile.accountMonths}개월째`}${knownProfile.monthlyPayment === undefined ? '' : `, 매달 ${won(knownProfile.monthlyPayment)} 납입 중`}`
            : '청약통장: 없음',
      ].filter((line): line is string => Boolean(line))
    : [
        `이름: ${profile.name}`,
        `나이: ${profile.age}세 (${OCCUPATION_LABEL[profile.occupation]})`,
        `지역: ${profile.region.trim() || '입력 안 함'}`,
        `주택 보유: ${profile.isNoHomeOwner ? '무주택' : '주택 보유'}`,
        `청약통장: ${account}`,
      ];
  const calculationsKnown =
    !knownProfile ||
    (knownProfile.hasSubscriptionAccount !== undefined && knownProfile.housingStatus !== undefined);

  const lines = [
    ...knownLines,
    ...(knownProfile ? ['미입력 프로필 항목은 false나 0으로 간주하지 않고 설명에서 제외한다.'] : []),
    ...(calculationsKnown
      ? [
    `완판e 준비도: ${score}점 (${stage.label})`,
    '',
    '추천 행동:',
    ...recommendedActions.map((a) => `- ${a}`),
    '',
    '미래 시뮬레이션 (지금 조건과 월 납입액을 그대로 유지한다고 가정한 예상값):',
    ...futures.map((f) => {
      const delta = f.preparationScore - score;
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      return `- ${f.years}년 후: ${f.age}세, 통장 ${f.accountMonths}개월, 예상 납입액 ${won(f.estimatedPaidAmount)}, 준비도 ${f.preparationScore}점 (${sign})`;
    }),
        ]
      : ['', '준비도와 미래 수치는 핵심 프로필이 미입력이라 AI 설명 맥락에서 제외한다.']),
    '',
    `※ ${DISCLAIMER}`,
  ];

  return lines.join('\n');
}

/** 지금 상태에서 물어볼 만한 질문 3개. */
export function getSuggestedQuestions(ctx: AiContext): string[] {
  const { profile, knownProfile, futures } = ctx;
  const twoYears = futures.find((f) => f.years === 2) ?? futures[0];

  const first = knownProfile?.hasSubscriptionAccount === undefined && knownProfile
    ? '청약통장 정보를 추가하면 어떤 설명이 더 정확해져요?'
    : profile.hasSubscriptionAccount
    ? `제 청약통장 ${profile.accountMonths}개월은 어떤 의미예요?`
    : '청약통장은 왜 먼저 만들어야 해요?';

  return [
    first,
    `2년 뒤 준비도가 ${twoYears.preparationScore}점이 되면 뭐가 달라져요?`,
    '제 또래는 보통 뭐부터 시작해요?',
  ];
}
