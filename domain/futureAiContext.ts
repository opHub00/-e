import { normalizeProfile } from './preparation.ts';
import {
  simulateFutureTimeline,
  type FutureChange,
  type FutureExternalInsight,
  type FutureMilestone,
  type FutureScenario,
} from './futureSimulation.ts';
import type { UserProfile } from './types.ts';

type FutureAiChange = Pick<
  FutureChange,
  'kind' | 'title' | 'before' | 'after' | 'reason' | 'affectsPreparationScore' | 'scoreDelta'
>;

export type FutureAiContext = {
  contextVersion: 'future-simulation-v2';
  calculationSource: 'domain-calculated-read-only';
  currentState: {
    name: string;
    age: number;
    region: string;
    hasSubscriptionAccount: boolean;
    accountMonths: number;
    monthlyPayment: number;
    isNoHomeOwner: boolean;
    preparationScore: number;
    preparationStage: string;
  };
  selectedScenario: {
    id: FutureScenario['id'];
    label: string;
    description: string;
    preparationAction: FutureScenario['preparationAction'];
    assumptions: FutureScenario['input'];
  };
  timeline: Array<{
    offsetMonths: number;
    label: string;
    age: number;
    accountMonths: number;
    estimatedPaidAmount: number;
    preparationScore: number;
    preparationStage: string;
    deltaFromPrevious: number;
    changes: FutureAiChange[];
    nextMilestone: FutureMilestone;
    externalInsights: FutureExternalInsight[];
  }>;
  keyChanges: Array<FutureAiChange & { at: string }>;
  milestones: FutureMilestone[];
  externalInsights: FutureExternalInsight[];
  aiPolicy: {
    role: 'explain-provided-results-only';
    may: readonly ['explain-changes', 'summarize-milestones', 'compare-provided-scenarios'];
    mustNot: readonly [
      'calculate-new-preparation-score',
      'infer-eligibility',
      'infer-official-points',
      'infer-priority-status',
      'infer-winning-probability',
      'treat-estimated-payment-as-actual-total',
    ];
  };
  disclaimer: string;
};

export const FUTURE_AI_POLICY: FutureAiContext['aiPolicy'] = {
  role: 'explain-provided-results-only',
  may: ['explain-changes', 'summarize-milestones', 'compare-provided-scenarios'],
  mustNot: [
    'calculate-new-preparation-score',
    'infer-eligibility',
    'infer-official-points',
    'infer-priority-status',
    'infer-winning-probability',
    'treat-estimated-payment-as-actual-total',
  ],
};

/** 모든 숫자는 Future domain 계산 결과를 복사한다. Gemini는 이 구조를 설명만 한다. */
export function buildFutureAiContext(
  input: UserProfile,
  scenario: FutureScenario,
): FutureAiContext {
  const profile = normalizeProfile(input);
  const simulation = simulateFutureTimeline(profile, scenario);
  const current = simulation.timeline[0];
  const timeline = simulation.timeline.map((point) => ({
    offsetMonths: point.offsetMonths,
    label: point.label,
    age: point.age,
    accountMonths: point.accountMonths,
    estimatedPaidAmount: point.estimatedPaidAmount,
    preparationScore: point.preparationScore,
    preparationStage: point.stage.label,
    deltaFromPrevious: point.deltaFromPrevious,
    changes: point.changes.map(toAiChange),
    nextMilestone: point.nextMilestone,
    externalInsights: point.externalInsights,
  }));

  return {
    contextVersion: 'future-simulation-v2',
    calculationSource: 'domain-calculated-read-only',
    currentState: {
      name: profile.name,
      age: profile.age,
      region: profile.region,
      hasSubscriptionAccount: profile.hasSubscriptionAccount,
      accountMonths: profile.accountMonths,
      monthlyPayment: profile.monthlyPayment,
      isNoHomeOwner: profile.isNoHomeOwner,
      preparationScore: current.preparationScore,
      preparationStage: current.stage.label,
    },
    selectedScenario: {
      id: simulation.scenario.id,
      label: simulation.scenario.label,
      description: simulation.scenario.description,
      preparationAction: simulation.scenario.preparationAction,
      assumptions: simulation.scenario.input,
    },
    timeline,
    keyChanges: simulation.timeline.flatMap((point) =>
      point.changes
        .filter((change) => change.affectsPreparationScore)
        .map((change) => ({ at: point.label, ...toAiChange(change) })),
    ),
    milestones: simulation.timeline.map((point) => point.nextMilestone),
    externalInsights: simulation.timeline.flatMap((point) => point.externalInsights),
    aiPolicy: FUTURE_AI_POLICY,
    disclaimer: simulation.disclaimer,
  };
}

function toAiChange(change: FutureChange): FutureAiChange {
  return {
    kind: change.kind,
    title: change.title,
    before: change.before,
    after: change.after,
    reason: change.reason,
    affectsPreparationScore: change.affectsPreparationScore,
    scoreDelta: change.scoreDelta,
  };
}

/** Edge Function의 기존 string context 계약 안에서 구조를 잃지 않도록 JSON 블록으로 전달한다. */
export function formatFutureAiContextForPrompt(context: FutureAiContext): string {
  return [
    '[FUTURE_SIMULATION_V2_DOMAIN_CONTEXT]',
    '아래 값은 앱 domain에서 계산 완료된 읽기 전용 결과다.',
    '새 점수·자격·가점·1순위·당첨 가능성을 계산하거나 추론하지 말고, 제공된 변화 이유만 설명한다.',
    JSON.stringify(context, null, 2),
    '[/FUTURE_SIMULATION_V2_DOMAIN_CONTEXT]',
  ].join('\n');
}

