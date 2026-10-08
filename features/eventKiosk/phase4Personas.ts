import type { AdaptiveQuestionPlan } from './adaptiveAssessment.ts';
import { createAdaptiveQuestionPlan } from './adaptiveAssessment.ts';
import type { LoadedEvent } from './eventConfig.ts';
import { evaluateEvent, type KioskStatus } from './evaluate.ts';
import { emptyAnswers, resizeChildDates, resizeChildren, type AdaptiveInfo, type HouseholdType, type KioskAnswers } from './model.ts';

export type Phase4PersonaId = 'YOUNG_SINGLE' | 'ENGAGED_COUPLE' | 'NEWLYWED_COUPLE' | 'NEWLYWED_ONE_CHILD' | 'FIRST_HOME_COUPLE' | 'MULTI_CHILD' | 'GENERAL_NO_HOME' | 'CLEARLY_INELIGIBLE';

export type Phase4Persona = {
  id: Phase4PersonaId;
  label: string;
  initialAnswers: KioskAnswers;
  adaptiveAnswers: Partial<AdaptiveInfo>;
};

type Seed = {
  id: Phase4PersonaId;
  label: string;
  householdType: HouseholdType;
  birthDate: string;
  monthlyIncome: number;
  householdIncome?: number;
  totalAssets: number;
  parentAssets?: number;
  householdSize?: number;
  engaged?: boolean;
  marriageDate?: string;
  childBirthDates?: string[];
  ownsHome?: boolean;
  winningHistory?: boolean;
  account?: boolean;
};

function fromSeed(seed: Seed): KioskAnswers {
  const answers = emptyAnswers();
  answers.householdType = seed.householdType;
  answers.applicant = {
    ...answers.applicant,
    birthDate: seed.birthDate,
    livesInEventRegion: true,
    residenceMonths: 60,
    isHouseholdHead: true,
    householdNoHome: !seed.ownsHome,
    neverOwnedHome: !seed.ownsHome,
    winningHistory: seed.winningHistory ?? false,
    monthlyIncome: seed.monthlyIncome,
    taxPaymentYears: 5,
    longOverseasStay: false,
    specialException: false,
  };
  const childDates = seed.childBirthDates ?? [];
  answers.household = {
    ...answers.household,
    marriageRegistered: seed.householdType === 'couple' || seed.householdType === 'withChildren' ? !seed.engaged : null,
    marriageDate: seed.engaged ? '' : seed.marriageDate ?? (seed.householdType === 'couple' || seed.householdType === 'withChildren' ? '2024-05-01' : ''),
    plannedMarriageWithinDeadline: seed.engaged ? true : null,
    dualIncome: seed.householdType === 'couple' || seed.householdType === 'withChildren' ? true : false,
    householdIncome: seed.householdIncome ?? null,
    householdSize: seed.householdSize ?? (seed.householdType === 'single' ? null : 2 + childDates.length),
    childrenCount: childDates.length,
    childBirthDates: resizeChildDates([], childDates.length).map((_, index) => childDates[index] ?? ''),
    childBirthYears: resizeChildren([], childDates.length).map((_, index) => Number(childDates[index]?.slice(0, 4)) || null),
    totalAssets: seed.totalAssets,
    parentAssets: seed.parentAssets ?? 60_000_000,
  };
  answers.subscription = seed.account === false
    ? { accountKind: 'none', openedAt: '', paymentCount: null, depositAmount: null, firstRank: false }
    : { accountKind: 'housing', openedAt: '2018-01-01', paymentCount: 36, depositAmount: 6_000_000, firstRank: true };
  return answers;
}

const DEFAULT_ADAPTIVE: Partial<AdaptiveInfo> = {
  eligibleResident: true,
  currentProgramTenant: false,
  collegeStudent: false,
  jobSeekerWithinTwoYears: false,
  youthStudyStatus: 'NEITHER',
  benefitCategory: 'NONE',
  vehicleValueKrw: 15_000_000,
  applicantTotalAssetsKrw: 60_000_000,
  parentMonthlyIncomeKrw: 2_000_000,
  parentVehicleValueKrw: 8_000_000,
  workHistoryMonths: 36,
};

const seeds: Seed[] = [
  { id: 'YOUNG_SINGLE', label: '20대 미혼 청년', householdType: 'single', birthDate: '2001-04-10', monthlyIncome: 2_500_000, totalAssets: 60_000_000 },
  { id: 'ENGAGED_COUPLE', label: '30대 예비신혼부부', householdType: 'couple', birthDate: '1992-04-10', monthlyIncome: 2_800_000, householdIncome: 4_900_000, totalAssets: 130_000_000, householdSize: 2, engaged: true },
  { id: 'NEWLYWED_COUPLE', label: '30대 신혼부부', householdType: 'couple', birthDate: '1991-04-10', monthlyIncome: 2_800_000, householdIncome: 4_900_000, totalAssets: 130_000_000, householdSize: 2 },
  { id: 'NEWLYWED_ONE_CHILD', label: '신혼 + 자녀 1명', householdType: 'withChildren', birthDate: '1991-04-10', monthlyIncome: 2_600_000, householdIncome: 4_700_000, totalAssets: 130_000_000, householdSize: 3, childBirthDates: ['2025-01-15'] },
  { id: 'FIRST_HOME_COUPLE', label: '생애최초 조건의 부부', householdType: 'couple', birthDate: '1990-04-10', monthlyIncome: 2_700_000, householdIncome: 4_800_000, totalAssets: 120_000_000, householdSize: 2 },
  { id: 'MULTI_CHILD', label: '다자녀 가구', householdType: 'withChildren', birthDate: '1988-04-10', monthlyIncome: 2_200_000, householdIncome: 4_300_000, totalAssets: 120_000_000, householdSize: 5, childBirthDates: ['2018-01-01', '2021-01-01', '2025-01-01'] },
  { id: 'GENERAL_NO_HOME', label: '일반 무주택 가구', householdType: 'couple', birthDate: '1980-04-10', monthlyIncome: 2_000_000, householdIncome: 3_900_000, totalAssets: 120_000_000, householdSize: 2, marriageDate: '2010-05-01' },
  { id: 'CLEARLY_INELIGIBLE', label: '명확한 자격 미달 가구', householdType: 'single', birthDate: '1975-04-10', monthlyIncome: 15_000_000, totalAssets: 900_000_000, parentAssets: 900_000_000, ownsHome: true, winningHistory: true, account: false },
];

export const phase4Personas: Phase4Persona[] = seeds.map(seed => ({
  id: seed.id,
  label: seed.label,
  initialAnswers: fromSeed(seed),
  adaptiveAnswers: seed.id === 'CLEARLY_INELIGIBLE'
    ? { eligibleResident: false, currentProgramTenant: true, vehicleValueKrw: 90_000_000 }
    : { ...DEFAULT_ADAPTIVE, applicantTotalAssetsKrw: seed.householdType === 'single' ? seed.totalAssets : 80_000_000 },
}));

function distribution(outcomes: Array<{ status: KioskStatus }>): Record<KioskStatus, number> {
  const counts: Record<KioskStatus, number> = { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 };
  for (const outcome of outcomes) counts[outcome.status] += 1;
  return counts;
}

export function mergeAdaptivePlan(persona: Phase4Persona, plan: AdaptiveQuestionPlan): KioskAnswers {
  const merged = structuredClone(persona.initialAnswers);
  for (const question of plan.questions) {
    const value = persona.adaptiveAnswers[question.id];
    if (value !== undefined) (merged.adaptive as Record<string, unknown>)[question.id] = value;
  }
  return merged;
}

export function evaluatePhase4Personas(event: LoadedEvent, referenceDate = new Date('2026-10-29T09:00:00+09:00')) {
  return phase4Personas.map(persona => {
    const before = evaluateEvent(event, persona.initialAnswers, referenceDate);
    let finalAnswers = structuredClone(persona.initialAnswers);
    let after = before;
    const questionIds = new Set<keyof AdaptiveInfo>();
    for (let round = 0; round < 4; round += 1) {
      const plan = createAdaptiveQuestionPlan(after.assessment.results, finalAnswers);
      if (!plan.questions.length) break;
      let merged = false;
      for (const question of plan.questions) {
        questionIds.add(question.id);
        const value = persona.adaptiveAnswers[question.id];
        if (value === undefined) continue;
        (finalAnswers.adaptive as Record<string, unknown>)[question.id] = value;
        merged = true;
      }
      if (!merged) break;
      after = evaluateEvent(event, finalAnswers, referenceDate);
    }
    const remaining = createAdaptiveQuestionPlan(after.assessment.results, finalAnswers);
    return {
      personaId: persona.id,
      label: persona.label,
      adaptiveQuestionCount: questionIds.size,
      questionIds: [...questionIds],
      before: distribution(before.outcomes),
      after: distribution(after.outcomes),
      remainingEvidenceOnlyFacts: remaining.evidenceOnlyFacts,
      remainingAskableQuestions: remaining.questions.map(question => question.id),
      finalAnswers,
    };
  });
}
