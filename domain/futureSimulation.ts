import {
  DISCLAIMER,
  LIMITS,
  MILESTONE_MONTHS,
  calculatePreparationScore,
  getStage,
  normalizeProfile,
} from './preparation.ts';
import type { Stage, UserProfile } from './types.ts';

export const FUTURE_TIMELINE_MONTHS = [0, 6, 12, 24, 36, 60] as const;

export type FutureMonthOffset = (typeof FUTURE_TIMELINE_MONTHS)[number];
export type FutureScenarioId = 'baseline' | 'active' | 'custom';
export type FuturePreparationAction = 'none' | 'consistent';

export type FutureScenarioInput = {
  futureMonthlyPayment: number;
  keepSubscriptionAccount: boolean;
  futureRegion: string;
  futureIsNoHomeOwner: boolean;
};

export type FutureScenario = {
  id: FutureScenarioId;
  label: string;
  description: string;
  preparationAction: FuturePreparationAction;
  input: FutureScenarioInput;
};

export type FutureExternalInsight = {
  id: string;
  category: 'policy' | 'news' | 'market';
  title: string;
  note: string;
  observedAt?: string;
};

export type FutureMilestone = {
  id: string;
  type: 'account-duration' | 'next-stage' | 'next-snapshot' | 'maintain';
  title: string;
  detail: string;
  targetValue?: number;
  remainingValue?: number;
  externalInsights: FutureExternalInsight[];
};

export type FutureChangeKind =
  | 'age'
  | 'account-status'
  | 'account-duration'
  | 'monthly-payment'
  | 'estimated-payment'
  | 'region'
  | 'home-ownership'
  | 'preparation-actions'
  | 'stage';

export type FutureChange = {
  id: string;
  kind: FutureChangeKind;
  title: string;
  before: string | number | boolean;
  after: string | number | boolean;
  reason: string;
  affectsPreparationScore: boolean;
  scoreDelta: number;
  scoreEffect: 'increase' | 'decrease' | 'none';
};

export type FutureTimelinePoint = {
  offsetMonths: FutureMonthOffset;
  label: string;
  age: number;
  hasSubscriptionAccount: boolean;
  accountMonths: number;
  monthlyPayment: number;
  estimatedPaidAmount: number;
  region: string;
  isNoHomeOwner: boolean;
  preparationScore: number;
  basePreparationScore: number;
  preparationActionScore: number;
  stage: Stage;
  deltaFromPrevious: number;
  changes: FutureChange[];
  nextMilestone: FutureMilestone;
  externalInsights: FutureExternalInsight[];
};

export type FutureSimulation = {
  version: 2;
  metric: 'wanpan-preparation-score';
  scenario: FutureScenario;
  timeline: FutureTimelinePoint[];
  keyChanges: FutureChange[];
  disclaimer: string;
};

export type FutureScenarioComparison = {
  offsetMonths: FutureMonthOffset;
  results: Array<{
    scenario: FutureScenario;
    point: FutureTimelinePoint;
    deltaFromCurrent: number;
  }>;
};

type TimelineDraft = Omit<
  FutureTimelinePoint,
  'changes' | 'deltaFromPrevious' | 'nextMilestone' | 'externalInsights'
> & {
  projectedProfile: UserProfile;
  preparationActionTarget: number;
};

const SCENARIO_META: Record<
  FutureScenarioId,
  Pick<FutureScenario, 'label' | 'description' | 'preparationAction'>
> = {
  baseline: {
    label: '기본',
    description: '지금 조건과 납입 습관을 그대로 유지해요.',
    preparationAction: 'none',
  },
  active: {
    label: '적극 준비',
    description: '현재 납입 습관과 학습·준비 행동을 꾸준히 이어가요.',
    preparationAction: 'consistent',
  },
  custom: {
    label: '변화 가정',
    description: '미래의 제한된 조건을 직접 바꿔 비교해요.',
    preparationAction: 'none',
  },
};

const clampScore = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const clampMoney = (value: number) => {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.min(LIMITS.monthlyPayment.max, Math.max(LIMITS.monthlyPayment.min, Math.floor(finite)));
};

const formatOffset = (months: FutureMonthOffset) => {
  if (months === 0) return '현재';
  if (months < 12) return `${months}개월 후`;
  return `${months / 12}년 후`;
};

const scoreEffect = (scoreDelta: number): FutureChange['scoreEffect'] => {
  if (scoreDelta > 0) return 'increase';
  if (scoreDelta < 0) return 'decrease';
  return 'none';
};

const createChange = (
  offsetMonths: FutureMonthOffset,
  change: Omit<FutureChange, 'id' | 'affectsPreparationScore' | 'scoreEffect'>,
): FutureChange => ({
  ...change,
  id: `${offsetMonths}-${change.kind}`,
  affectsPreparationScore: change.scoreDelta !== 0,
  scoreEffect: scoreEffect(change.scoreDelta),
});

/** 변화 가정 시나리오의 초기값. UI 입력과 domain 기본값이 같은 출발점을 쓴다. */
export function getDefaultFutureScenarioInput(input: UserProfile): FutureScenarioInput {
  const profile = normalizeProfile(input);
  return {
    futureMonthlyPayment: profile.monthlyPayment,
    keepSubscriptionAccount: profile.hasSubscriptionAccount,
    futureRegion: profile.region,
    futureIsNoHomeOwner: profile.isNoHomeOwner,
  };
}

function normalizeFutureScenarioInput(
  profile: UserProfile,
  input: Partial<FutureScenarioInput> | undefined,
): FutureScenarioInput {
  const defaults = getDefaultFutureScenarioInput(profile);
  const futureRegion = typeof input?.futureRegion === 'string' ? input.futureRegion.trim() : '';
  return {
    futureMonthlyPayment: clampMoney(input?.futureMonthlyPayment ?? defaults.futureMonthlyPayment),
    // '유지 여부'이므로 현재 통장이 없는 프로필에 새 통장을 만들어내지 않는다.
    keepSubscriptionAccount:
      profile.hasSubscriptionAccount &&
      (input?.keepSubscriptionAccount ?? defaults.keepSubscriptionAccount),
    futureRegion: futureRegion || defaults.futureRegion,
    futureIsNoHomeOwner: input?.futureIsNoHomeOwner ?? defaults.futureIsNoHomeOwner,
  };
}

export function createFutureScenarios(
  input: UserProfile,
  customInput?: Partial<FutureScenarioInput>,
): FutureScenario[] {
  const profile = normalizeProfile(input);
  const baselineInput = getDefaultFutureScenarioInput(profile);
  const custom = normalizeFutureScenarioInput(profile, customInput);

  return (['baseline', 'active', 'custom'] as const).map((id) => ({
    id,
    ...SCENARIO_META[id],
    input: id === 'custom' ? custom : { ...baselineInput },
  }));
}

export function getFutureScenario(
  input: UserProfile,
  id: FutureScenarioId,
  customInput?: Partial<FutureScenarioInput>,
): FutureScenario {
  return createFutureScenarios(input, customInput).find((scenario) => scenario.id === id)!;
}

/**
 * 적극 준비의 학습·준비 행동 보정값.
 * 기존 calculatePreparationScore는 손대지 않고 V2 시나리오에서만 6개월당 2점, 최대 12점으로 제한한다.
 */
function getPreparationActionTarget(
  scenario: FutureScenario,
  offsetMonths: FutureMonthOffset,
): number {
  if (scenario.preparationAction !== 'consistent') return 0;
  return Math.min(12, Math.floor(offsetMonths / 6) * 2);
}

function projectProfile(
  profile: UserProfile,
  scenario: FutureScenario,
  offsetMonths: FutureMonthOffset,
): UserProfile {
  if (offsetMonths === 0) return { ...profile };

  const hasSubscriptionAccount =
    profile.hasSubscriptionAccount && scenario.input.keepSubscriptionAccount;

  return {
    ...profile,
    age: Math.round((profile.age + offsetMonths / 12) * 10) / 10,
    region: scenario.input.futureRegion,
    isNoHomeOwner: scenario.input.futureIsNoHomeOwner,
    hasSubscriptionAccount,
    accountMonths: hasSubscriptionAccount ? profile.accountMonths + offsetMonths : 0,
    monthlyPayment: hasSubscriptionAccount ? scenario.input.futureMonthlyPayment : 0,
  };
}

function estimatePaidAmount(
  profile: UserProfile,
  projected: UserProfile,
  offsetMonths: FutureMonthOffset,
): number {
  if (!projected.hasSubscriptionAccount) return 0;
  const estimatedCurrentAmount = profile.monthlyPayment * profile.accountMonths;
  return estimatedCurrentAmount + projected.monthlyPayment * offsetMonths;
}

function scoreProjected(profile: UserProfile, actionTarget: number): number {
  return clampScore(calculatePreparationScore(profile) + actionTarget);
}

function scoreDeltaForFields(
  previous: TimelineDraft,
  current: TimelineDraft,
  fields: Array<keyof UserProfile>,
): number {
  const candidate = { ...previous.projectedProfile };
  for (const field of fields) {
    (candidate[field] as UserProfile[typeof field]) = current.projectedProfile[field];
  }
  return (
    scoreProjected(candidate, current.preparationActionTarget) -
    scoreProjected(previous.projectedProfile, current.preparationActionTarget)
  );
}

function buildChanges(previous: TimelineDraft, current: TimelineDraft): FutureChange[] {
  const changes: FutureChange[] = [];
  const before = previous.projectedProfile;
  const after = current.projectedProfile;
  const offset = current.offsetMonths;

  if (before.hasSubscriptionAccount !== after.hasSubscriptionAccount) {
    changes.push(
      createChange(offset, {
        kind: 'account-status',
        title: '청약통장 유지 상태',
        before: before.hasSubscriptionAccount,
        after: after.hasSubscriptionAccount,
        reason: after.hasSubscriptionAccount
          ? '청약통장을 유지하는 가정이 준비도 계산에 반영됐어요.'
          : '청약통장을 유지하지 않는 가정으로 가입 기간과 납입 습관 점수가 함께 빠졌어요.',
        scoreDelta: scoreDeltaForFields(previous, current, [
          'hasSubscriptionAccount',
          'accountMonths',
          'monthlyPayment',
        ]),
      }),
    );
  } else if (after.hasSubscriptionAccount) {
    if (before.accountMonths !== after.accountMonths) {
      changes.push(
        createChange(offset, {
          kind: 'account-duration',
          title: '청약통장 가입 기간',
          before: before.accountMonths,
          after: after.accountMonths,
          reason: '통장을 유지한 시간이 늘어 기존 완판e 준비도 계산의 가입 기간 요소가 변했어요.',
          scoreDelta: scoreDeltaForFields(previous, current, ['accountMonths']),
        }),
      );
    }
    if (before.monthlyPayment !== after.monthlyPayment) {
      changes.push(
        createChange(offset, {
          kind: 'monthly-payment',
          title: '미래 월 납입액 가정',
          before: before.monthlyPayment,
          after: after.monthlyPayment,
          reason: '월 납입 여부가 바뀌어 기존 완판e 준비도의 납입 습관 요소가 달라졌어요.',
          scoreDelta: scoreDeltaForFields(previous, current, ['monthlyPayment']),
        }),
      );
    }
  }

  if (before.region !== after.region) {
    changes.push(
      createChange(offset, {
        kind: 'region',
        title: '거주지역 가정',
        before: before.region,
        after: after.region,
        reason: '거주지역 가정이 바뀌었어요. 지역명 자체로 자격이나 가점을 판정하지 않아요.',
        scoreDelta: scoreDeltaForFields(previous, current, ['region']),
      }),
    );
  }

  if (before.isNoHomeOwner !== after.isNoHomeOwner) {
    changes.push(
      createChange(offset, {
        kind: 'home-ownership',
        title: '주택 보유 상태 가정',
        before: before.isNoHomeOwner,
        after: after.isNoHomeOwner,
        reason: '입력한 주택 보유 상태 가정이 완판e 내부 준비도에만 반영됐어요.',
        scoreDelta: scoreDeltaForFields(previous, current, ['isNoHomeOwner']),
      }),
    );
  }

  if (current.preparationActionTarget !== previous.preparationActionTarget) {
    const scoreWithPreviousAction = scoreProjected(
      current.projectedProfile,
      previous.preparationActionTarget,
    );
    const actionDelta = current.preparationScore - scoreWithPreviousAction;
    changes.push(
      createChange(offset, {
        kind: 'preparation-actions',
        title: '학습·준비 행동',
        before: previous.preparationActionTarget,
        after: current.preparationActionTarget,
        reason:
          actionDelta === 0
            ? '학습·준비 행동 가정은 이어지지만 준비도 상한에 도달해 추가 점수 변화는 없어요.'
            : '학습·준비 행동을 꾸준히 이어간다는 적극 준비 시나리오 보정값이 반영됐어요.',
        scoreDelta: actionDelta,
      }),
    );
  }

  if (before.age !== after.age) {
    changes.push(
      createChange(offset, {
        kind: 'age',
        title: '예상 나이',
        before: before.age,
        after: after.age,
        reason: '생년월일 없이 현재 나이에 경과 개월을 더한 참고 정보예요. 준비도에는 반영하지 않아요.',
        scoreDelta: 0,
      }),
    );
  }

  if (previous.estimatedPaidAmount !== current.estimatedPaidAmount) {
    changes.push(
      createChange(offset, {
        kind: 'estimated-payment',
        title: '예상 납입액',
        before: previous.estimatedPaidAmount,
        after: current.estimatedPaidAmount,
        reason:
          '현재까지도 월 납입액이 같았다고 보고 미래 월 납입 가정을 더한 예상값이며 실제 납입 누계가 아니에요.',
        scoreDelta: 0,
      }),
    );
  }

  if (previous.stage.label !== current.stage.label) {
    changes.push(
      createChange(offset, {
        kind: 'stage',
        title: '준비 단계',
        before: previous.stage.label,
        after: current.stage.label,
        reason: '준비도 계산 결과가 단계 기준을 넘어서 표시 단계가 바뀌었어요. 단계 자체는 점수를 만들지 않아요.',
        scoreDelta: 0,
      }),
    );
  }

  return changes;
}

function getNextStageThreshold(score: number): number | null {
  if (score < 40) return 40;
  if (score < 60) return 60;
  if (score < 80) return 80;
  return null;
}

function buildMilestone(
  point: TimelineDraft,
  index: number,
  timeline: TimelineDraft[],
): FutureMilestone {
  if (point.hasSubscriptionAccount && point.accountMonths < MILESTONE_MONTHS) {
    const remaining = MILESTONE_MONTHS - point.accountMonths;
    return {
      id: `${point.offsetMonths}-account-${MILESTONE_MONTHS}`,
      type: 'account-duration',
      title: `가입 2년까지 ${remaining}개월`,
      detail: '통장을 유지하면 시간 경과로 도달하는 다음 기준점이에요.',
      targetValue: MILESTONE_MONTHS,
      remainingValue: remaining,
      externalInsights: [],
    };
  }

  const nextStage = getNextStageThreshold(point.preparationScore);
  if (nextStage !== null) {
    const remaining = nextStage - point.preparationScore;
    return {
      id: `${point.offsetMonths}-stage-${nextStage}`,
      type: 'next-stage',
      title: `다음 준비 단계까지 ${remaining}점`,
      detail: '공식 청약 가점이 아닌 완판e 내부 준비 단계까지의 차이예요.',
      targetValue: nextStage,
      remainingValue: remaining,
      externalInsights: [],
    };
  }

  const next = timeline[index + 1];
  if (next) {
    return {
      id: `${point.offsetMonths}-snapshot-${next.offsetMonths}`,
      type: 'next-snapshot',
      title: `${next.label} 예상 준비도 ${next.preparationScore}`,
      detail: '선택한 시나리오를 그대로 유지했을 때의 다음 계산값이에요.',
      targetValue: next.preparationScore,
      externalInsights: [],
    };
  }

  return {
    id: `${point.offsetMonths}-maintain`,
    type: 'maintain',
    title: '현재 준비 단계 유지',
    detail: '이후 변화도 입력한 시나리오를 유지하는 범위에서만 설명해요.',
    targetValue: point.preparationScore,
    externalInsights: [],
  };
}

export function simulateFutureTimeline(
  input: UserProfile,
  scenario: FutureScenario,
): FutureSimulation {
  const profile = normalizeProfile(input);
  const drafts: TimelineDraft[] = FUTURE_TIMELINE_MONTHS.map((offsetMonths) => {
    const projectedProfile = projectProfile(profile, scenario, offsetMonths);
    const basePreparationScore = calculatePreparationScore(projectedProfile);
    const preparationActionTarget = getPreparationActionTarget(scenario, offsetMonths);
    const preparationScore = scoreProjected(projectedProfile, preparationActionTarget);

    return {
      offsetMonths,
      label: formatOffset(offsetMonths),
      age: projectedProfile.age,
      hasSubscriptionAccount: projectedProfile.hasSubscriptionAccount,
      accountMonths: projectedProfile.accountMonths,
      monthlyPayment: projectedProfile.monthlyPayment,
      estimatedPaidAmount: estimatePaidAmount(profile, projectedProfile, offsetMonths),
      region: projectedProfile.region,
      isNoHomeOwner: projectedProfile.isNoHomeOwner,
      preparationScore,
      basePreparationScore,
      preparationActionScore: preparationScore - basePreparationScore,
      stage: getStage(preparationScore),
      projectedProfile,
      preparationActionTarget,
    };
  });

  const timeline: FutureTimelinePoint[] = drafts.map((draft, index) => {
    const previous = drafts[index - 1];
    return {
      offsetMonths: draft.offsetMonths,
      label: draft.label,
      age: draft.age,
      hasSubscriptionAccount: draft.hasSubscriptionAccount,
      accountMonths: draft.accountMonths,
      monthlyPayment: draft.monthlyPayment,
      estimatedPaidAmount: draft.estimatedPaidAmount,
      region: draft.region,
      isNoHomeOwner: draft.isNoHomeOwner,
      preparationScore: draft.preparationScore,
      basePreparationScore: draft.basePreparationScore,
      preparationActionScore: draft.preparationActionScore,
      stage: draft.stage,
      deltaFromPrevious: previous ? draft.preparationScore - previous.preparationScore : 0,
      changes: previous ? buildChanges(previous, draft) : [],
      nextMilestone: buildMilestone(draft, index, drafts),
      // 향후 정책·뉴스·시장 정보는 설명 레이어로만 이 배열에 연결한다.
      externalInsights: [],
    };
  });

  return {
    version: 2,
    metric: 'wanpan-preparation-score',
    scenario,
    timeline,
    keyChanges: timeline.flatMap((point) => point.changes).filter((change) => change.affectsPreparationScore),
    disclaimer: DISCLAIMER,
  };
}

export function compareFutureScenarios(
  input: UserProfile,
  customInput: Partial<FutureScenarioInput> | undefined,
  offsetMonths: FutureMonthOffset,
): FutureScenarioComparison {
  const scenarios = createFutureScenarios(input, customInput);
  return {
    offsetMonths,
    results: scenarios.map((scenario) => {
      const simulation = simulateFutureTimeline(input, scenario);
      const current = simulation.timeline[0];
      const point = simulation.timeline.find((item) => item.offsetMonths === offsetMonths)!;
      return {
        scenario,
        point,
        deltaFromCurrent: point.preparationScore - current.preparationScore,
      };
    }),
  };
}

type SerializedFutureScenario = {
  version: 2;
  id: FutureScenarioId;
  input?: Partial<FutureScenarioInput>;
};

export function serializeFutureScenario(scenario: FutureScenario): string {
  const payload: SerializedFutureScenario = {
    version: 2,
    id: scenario.id,
    input: scenario.id === 'custom' ? scenario.input : undefined,
  };
  return JSON.stringify(payload);
}

export function parseFutureScenario(
  input: UserProfile,
  serialized: string | undefined,
): FutureScenario | null {
  if (!serialized) return null;
  try {
    const payload = JSON.parse(serialized) as Partial<SerializedFutureScenario>;
    if (
      payload.version !== 2 ||
      (payload.id !== 'baseline' && payload.id !== 'active' && payload.id !== 'custom')
    ) {
      return null;
    }
    return getFutureScenario(input, payload.id, payload.id === 'custom' ? payload.input : undefined);
  } catch {
    return null;
  }
}
