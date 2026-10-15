import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { activeEventDataset } from '../../data/events/activeEvent.ts';
import { buildRuleFactInventory, createAdaptiveQuestionPlan, inventoryCoverage } from './adaptiveAssessment.ts';
import { toUserProfile } from './engineInput.ts';
import { loadEvent } from './eventConfig.ts';
import { buildHouseholdFacts } from './frozen/engine/facts.ts';
import { readKnown } from './frozen/domain/profile.ts';
import { evaluateEvent } from './evaluate.ts';
import { doesNotKnowPersona, evaluatePhase4Personas, mergeAdaptivePlan, phase4Personas } from './phase4Personas.ts';
import { emptyAnswers, type KioskAnswers } from './model.ts';
import { COMMON_REQUIRED_QUESTION_KEYS, doesNotKnowLabel, visibleQuestionKeysForStep, type AnswerStateMap } from './questionPolicy.ts';
import { buildSamdoRecommendation, buildSamdoQuestionPlan } from './samdo/index.ts';
import { samdoRules } from './samdoResult/samdoEvaluate.ts';
import { samdoInputFromAnswers } from './samdoResult/samdoInput.ts';

const event = loadEvent(activeEventDataset);
const REF = new Date('2026-10-29T09:00:00+09:00');

test('Rule Package fact inventory covers all 46 facts and records the RC1 UI coverage', () => {
  const rows = buildRuleFactInventory(event.dataset);
  assert.equal(rows.length, 46);
  assert.deepEqual(inventoryCoverage(rows), { full: 20, partial: 6, none: 20, percent: 43.5 });
  assert.ok(rows.every(row => row.combinations.length > 0 && row.question.length > 0));
  assert.ok(rows.some(row => row.classification === 'EVIDENCE_ONLY'));
});

test('missing facts are deduplicated across listings and one question retains all consumers', () => {
  const persona = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!;
  const evaluation = evaluateEvent(event, persona.initialAnswers, REF);
  const plan = createAdaptiveQuestionPlan(evaluation.assessment.results, persona.initialAnswers);
  assert.equal(new Set(plan.questions.map(question => question.id)).size, plan.questions.length);
  const resident = plan.questions.find(question => question.id === 'eligibleResident');
  assert.ok(resident);
  assert.ok(resident.combinations.length > 1);
  assert.ok(!plan.questions.some(question => question.id === 'vehicleValueKrw'), 'vehicle is now answered in the base flow');
});

test('conditional questions are generated only for supplies still reviewable by this user', () => {
  const young = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!;
  const couple = phase4Personas.find(item => item.id === 'NEWLYWED_COUPLE')!;
  const youngInitial = evaluateEvent(event, young.initialAnswers, REF);
  const youngFirst = createAdaptiveQuestionPlan(youngInitial.assessment.results, young.initialAnswers);
  const youngAfterFirst = mergeAdaptivePlan(young, youngFirst);
  const youngPlan = createAdaptiveQuestionPlan(evaluateEvent(event, youngAfterFirst, REF).assessment.results, youngAfterFirst);
  const couplePlan = createAdaptiveQuestionPlan(evaluateEvent(event, couple.initialAnswers, REF).assessment.results, couple.initialAnswers);
  const parentIncome = youngPlan.questions.find(question => question.id === 'parentMonthlyIncomeKrw');
  assert.ok(parentIncome);
  assert.deepEqual(parentIncome.sourceFacts, ['event.applicantParentMonthlyIncomeKrw']);
  assert.ok(!couplePlan.questions.some(question => question.id === 'parentMonthlyIncomeKrw'));

  const legacyAnswers = structuredClone(young.initialAnswers) as KioskAnswers;
  delete (legacyAnswers.adaptive as Partial<KioskAnswers['adaptive']>).youthStudyStatus;
  const legacyPlan = createAdaptiveQuestionPlan(evaluateEvent(event, legacyAnswers, REF).assessment.results, legacyAnswers);
  assert.ok(!legacyPlan.questions.some(question => question.id === 'vehicleValueKrw'));
});

test('already-ineligible listing/supply combinations never generate adaptive questions', () => {
  const persona = phase4Personas.find(item => item.id === 'CLEARLY_INELIGIBLE')!;
  const evaluation = evaluateEvent(event, persona.initialAnswers, REF);
  const plan = createAdaptiveQuestionPlan(evaluation.assessment.results, persona.initialAnswers);
  assert.equal(plan.questions.length, 0);
  assert.equal(plan.excludedIneligible.length, 9);
});

test('adaptive answers map to Applicant and Household without fabricating Spouse values', () => {
  const young = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!;
  const youngMatrix = evaluatePhase4Personas(event, REF).find(item => item.personaId === 'YOUNG_SINGLE')!;
  const youngProfile = toUserProfile(youngMatrix.finalAnswers, REF);
  assert.equal(readKnown(youngProfile.applicant.financial.totalAssetsKrw), 60_000_000);
  assert.equal(readKnown(youngProfile.applicant.financial.vehicleValueKrw!), 15_000_000);
  assert.equal(youngProfile.eventQualifications!.collegeStudent!.status, 'UNKNOWN');
  assert.equal(youngProfile.eventQualifications!.jobSeekerWithinTwoYears!.status, 'UNKNOWN');

  const couple = phase4Personas.find(item => item.id === 'NEWLYWED_COUPLE')!;
  const coupleInitial = evaluateEvent(event, couple.initialAnswers, REF);
  const profile = toUserProfile(mergeAdaptivePlan(couple, createAdaptiveQuestionPlan(coupleInitial.assessment.results, couple.initialAnswers)), REF);
  assert.equal(profile.applicant.financial.totalAssetsKrw.status, 'UNKNOWN');
  assert.equal(profile.household.spouse?.financial.totalAssetsKrw.status, 'UNKNOWN');
  assert.equal(profile.household.spouse?.financial.vehicleValueKrw?.status, undefined);
  assert.equal(readKnown(profile.household.declaredTotals!.maxVehicleValueKrw!), 15_000_000);
  assert.equal(readKnown(profile.household.declaredTotals!.dualIncome!), true);
});

test('adaptive merge is immutable and reassessment increases COMPLETE for every valid persona', () => {
  const persona = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!;
  const beforeJson = JSON.stringify(persona.initialAnswers);
  const initial = evaluateEvent(event, persona.initialAnswers, REF);
  const merged = mergeAdaptivePlan(persona, createAdaptiveQuestionPlan(initial.assessment.results, persona.initialAnswers));
  assert.equal(JSON.stringify(persona.initialAnswers), beforeJson);
  assert.notDeepEqual(merged.adaptive, persona.initialAnswers.adaptive);

  const matrix = evaluatePhase4Personas(event, REF);
  for (const row of matrix.filter(item => item.personaId !== 'CLEARLY_INELIGIBLE')) {
    assert.ok(row.after.COMPLETE > 0, row.label);
    assert.ok(row.after.COMPLETE >= row.before.COMPLETE, row.label);
    assert.equal(row.remainingAskableQuestions.length, 0, row.label);
  }
  const ineligible = matrix.find(item => item.personaId === 'CLEARLY_INELIGIBLE')!;
  assert.equal(ineligible.after.COMPLETE, 0);
  assert.equal(ineligible.after.INELIGIBLE, 9);
});

test('exact child birth date preserves the under-seven day boundary', () => {
  const persona = phase4Personas.find(item => item.id === 'NEWLYWED_ONE_CHILD')!;
  const under = structuredClone(persona.initialAnswers);
  under.household.childBirthDates = ['2019-10-30'];
  under.household.childBirthYears = [2019];
  const boundary = structuredClone(under);
  boundary.household.childBirthDates = ['2019-10-29'];
  assert.equal(buildHouseholdFacts(toUserProfile(under, REF), '2026-10-29')['household.childUnder7Count'], 1);
  assert.equal(buildHouseholdFacts(toUserProfile(boundary, REF), '2026-10-29')['household.childUnder7Count'], 0);
});

test('reset removes adaptive answers and back-like edits preserve them in memory', async () => {
  const { useKioskStore } = await import('./useKioskStore.ts');
  useKioskStore.getState().reset();
  useKioskStore.getState().setHouseholdType('single');
  useKioskStore.getState().patchAdaptive({ eligibleResident: true, vehicleValueKrw: 15_000_000 });
  useKioskStore.getState().markAnswered('adaptive.eligibleResident');
  useKioskStore.getState().patchSubscription({ paymentCount: 24 });
  assert.equal(useKioskStore.getState().answers.adaptive.eligibleResident, true, 'back navigation must not discard adaptive values');
  assert.equal(useKioskStore.getState().answers.adaptive.vehicleValueKrw, 15_000_000);
  useKioskStore.getState().reset();
  assert.deepEqual(useKioskStore.getState().answers.adaptive, emptyAnswers().adaptive);
  assert.equal(useKioskStore.getState().adaptivePlan, null);
  assert.ok(!useKioskStore.getState().answered.some(key => key.startsWith('adaptive.')));
});

test('common required questions are in the base flow instead of appearing late', () => {
  const answers = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!.initialAnswers;
  const base = new Set([
    ...visibleQuestionKeysForStep(answers, 'household'),
    ...visibleQuestionKeysForStep(answers, 'applicant'),
    ...visibleQuestionKeysForStep(answers, 'finance'),
    ...visibleQuestionKeysForStep(answers, 'subscription'),
  ]);
  for (const key of COMMON_REQUIRED_QUESTION_KEYS) assert.ok(base.has(key), `${key} must be asked before analysis`);
  assert.ok(!base.has('adaptive.vehicleValueKrw'), 'Samdo final 1.8 uses total assets and does not ask a separate vehicle question');
});

test('explicit DOES_NOT_KNOW and skipped base questions are not asked again in one session', async () => {
  const persona = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!;
  const answers = structuredClone(persona.initialAnswers);
  answers.adaptive.vehicleValueKrw = null;
  const evaluation = evaluateEvent(event, answers, REF);
  const states = { 'adaptive.vehicleValueKrw': 'DOES_NOT_KNOW' as const };
  const plan = createAdaptiveQuestionPlan(evaluation.assessment.results, answers, [], states);
  assert.ok(!plan.questions.some(question => question.id === 'vehicleValueKrw'));
  assert.ok(evaluation.outcomes.every(outcome => outcome.status !== 'COMPLETE'), 'unknown stays unresolved, never optimistic COMPLETE');

  const { useKioskStore } = await import('./useKioskStore.ts');
  useKioskStore.getState().reset();
  useKioskStore.getState().setHouseholdType('single');
  useKioskStore.getState().finalizeStep('applicant');
  useKioskStore.getState().finalizeStep('finance');
  const state = useKioskStore.getState();
  assert.equal(state.answers.household.childExpectationStatus, 'DOES_NOT_KNOW');
  assert.equal(state.answerStates['applicant.monthlyIncome'], 'DOES_NOT_KNOW');
  assert.equal(state.answerStates['household.totalAssets'], 'DOES_NOT_KNOW');
  assert.equal(state.answerStates['adaptive.vehicleValueKrw'], undefined);
});

test('parent information reasons stay distinct without inventing a parent asset amount', () => {
  const answers = structuredClone(phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!.initialAnswers);
  for (const status of ['NO_PARENTS', 'CANNOT_CONTACT', 'DOES_NOT_KNOW'] as const) {
    answers.household.parentInformationStatus = status;
    answers.household.parentAssets = 60_000_000;
    const profile = toUserProfile(answers, REF);
    assert.equal(profile.eventQualifications!.parentTotalAssetsKrw!.status, 'UNKNOWN', status);
    assert.equal(samdoInputFromAnswers(answers).details.parentAssets, undefined, status);
  }
  answers.household.parentInformationStatus = 'KNOWN';
  assert.equal(readKnown(toUserProfile(answers, REF).eventQualifications!.parentTotalAssetsKrw!), 60_000_000);
  assert.equal(samdoInputFromAnswers(answers).details.parentAssets, 60_000_000);
});

test('unknown child expectation does not fabricate a household member', () => {
  const answers = structuredClone(phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!.initialAnswers);
  answers.household.childExpectationStatus = 'DOES_NOT_KNOW';
  const profile = toUserProfile(answers, REF);
  assert.equal(profile.household.members.filter(member => member.relationship === 'CHILD').length, 0);
  assert.equal(samdoInputFromAnswers(answers).details.children, undefined);
});

test('changing household type clears hidden values and their answer states', async () => {
  const { useKioskStore } = await import('./useKioskStore.ts');
  const store = useKioskStore.getState();
  store.reset();
  store.setHouseholdType('couple');
  store.patchHousehold({ marriageRegistered: true, marriageDate: '2024-05-01', dualIncome: true, householdIncome: 4_500_000 });
  for (const key of ['household.marriageRegistered', 'household.marriageDate', 'household.dualIncome', 'household.householdIncome']) store.markAnswered(key);
  useKioskStore.getState().setHouseholdType('single');
  const next = useKioskStore.getState();
  assert.equal(next.answers.household.marriageRegistered, null);
  assert.equal(next.answers.household.householdIncome, null);
  for (const key of ['household.marriageRegistered', 'household.marriageDate', 'household.dualIncome', 'household.householdIncome']) {
    assert.equal(next.answerStates[key], undefined, key);
    assert.ok(!next.answered.includes(key), key);
  }
});

test('does-not-know persona stays unresolved and never repeats the same base facts', () => {
  const evaluation = evaluateEvent(event, doesNotKnowPersona.answers, REF);
  assert.equal(evaluation.outcomes.filter(outcome => outcome.status === 'COMPLETE').length, 0);
  const plan = createAdaptiveQuestionPlan(
    evaluation.assessment.results,
    doesNotKnowPersona.answers,
    [],
    doesNotKnowPersona.answerStates,
  );
  const repeated = plan.questions.map(question => question.id).filter(id => ['vehicleValueKrw', 'applicantTotalAssetsKrw'].includes(id));
  assert.deepEqual(repeated, []);
  const samdo = samdoInputFromAnswers(doesNotKnowPersona.answers);
  assert.equal(samdo.details.children, undefined);
  assert.equal(samdo.details.totalAssets, undefined);
  assert.equal(samdo.details.parentAssets, undefined);
  assert.equal(samdo.details.specialSupplyHistory, undefined);
  assert.equal(samdo.details.reWinningRestriction, undefined);
});

test('unknown UI copy matches the meaning of amount, date, history and verification questions', () => {
  assert.equal(doesNotKnowLabel('applicant.monthlyIncome'), '정확히 몰라요');
  assert.equal(doesNotKnowLabel('household.totalAssets'), '정확히 몰라요');
  assert.equal(doesNotKnowLabel('subscription.openedAt'), '정확한 날짜를 몰라요');
  assert.equal(doesNotKnowLabel('household.childBirthDates.0'), '정확한 날짜를 몰라요');
  assert.equal(doesNotKnowLabel('applicant.specialSupplyHistory'), '기억나지 않아요');
  assert.equal(doesNotKnowLabel('applicant.longOverseasStay'), '기억나지 않아요');
  assert.equal(doesNotKnowLabel('applicant.reWinningRestriction'), '확인해 봐야 해요');
});

test('seven explicit-unknown QA personas remain reviewable without repeat questions or fabricated verdicts', () => {
  const matrix = evaluatePhase4Personas(event, REF);
  const young = matrix.find(item => item.personaId === 'YOUNG_SINGLE')!.finalAnswers;
  const family = matrix.find(item => item.personaId === 'NEWLYWED_ONE_CHILD')!.finalAnswers;
  const cases: Array<{
    id: string;
    source: KioskAnswers;
    mutate: (answers: KioskAnswers) => void;
    states: AnswerStateMap;
    targetSupply: 'YOUTH' | 'GENERAL' | 'NEWBORN';
    repeatedQuestionIds: string[];
  }> = [
    {
      id: 'PARENT_ASSETS_UNKNOWN', source: young,
      mutate: answers => { answers.household.parentInformationStatus = 'DOES_NOT_KNOW'; answers.household.parentAssets = null; },
      states: { 'household.totalAssets': 'ANSWERED', 'household.parentInformationStatus': 'DOES_NOT_KNOW' }, targetSupply: 'YOUTH', repeatedQuestionIds: ['parentAssets'],
    },
    {
      id: 'NO_PARENTS', source: young,
      mutate: answers => { answers.household.parentInformationStatus = 'NO_PARENTS'; answers.household.parentAssets = null; },
      states: { 'household.totalAssets': 'ANSWERED', 'household.parentInformationStatus': 'ANSWERED' }, targetSupply: 'YOUTH', repeatedQuestionIds: ['parentAssets'],
    },
    {
      id: 'PARENT_CONTACT_DIFFICULT', source: young,
      mutate: answers => { answers.household.parentInformationStatus = 'CANNOT_CONTACT'; answers.household.parentAssets = null; },
      states: { 'household.totalAssets': 'ANSWERED', 'household.parentInformationStatus': 'ANSWERED' }, targetSupply: 'YOUTH', repeatedQuestionIds: ['parentAssets'],
    },
    {
      id: 'PAYMENT_COUNT_UNKNOWN', source: young,
      mutate: answers => { answers.subscription.paymentCount = null; },
      states: { 'subscription.paymentCount': 'DOES_NOT_KNOW' }, targetSupply: 'YOUTH', repeatedQuestionIds: ['recognizedPaymentCount'],
    },
    {
      id: 'WINNING_HISTORY_UNKNOWN', source: young,
      mutate: answers => {
        answers.applicant.winningHistory = null;
        answers.applicant.specialSupplyHistory = null;
        answers.applicant.reWinningRestriction = null;
        answers.applicant.householdNoWinningFiveYears = null;
      },
      states: {
        'applicant.specialSupplyHistory': 'DOES_NOT_KNOW',
        'applicant.reWinningRestriction': 'DOES_NOT_KNOW',
        'applicant.householdNoWinningFiveYears': 'DOES_NOT_KNOW',
      },
      targetSupply: 'GENERAL', repeatedQuestionIds: ['specialSupplyHistory', 'reWinningRestriction', 'householdNoWinningFiveYears'],
    },
    {
      id: 'OVERSEAS_HISTORY_UNKNOWN', source: young,
      mutate: answers => { answers.applicant.longOverseasStay = null; },
      states: { 'applicant.longOverseasStay': 'DOES_NOT_KNOW' }, targetSupply: 'YOUTH', repeatedQuestionIds: ['overseasStayHistory'],
    },
    {
      id: 'CHILD_DOB_PARTIAL_UNKNOWN', source: family,
      mutate: answers => { answers.household.childBirthDates[0] = ''; answers.household.childBirthYears[0] = null; },
      states: {
        'household.childExpectationStatus': 'ANSWERED',
        'household.childrenCount': 'ANSWERED',
        'household.childBirthDates.0': 'DOES_NOT_KNOW',
      },
      targetSupply: 'NEWBORN', repeatedQuestionIds: ['children'],
    },
  ];

  for (const item of cases) {
    const answers = structuredClone(item.source);
    item.mutate(answers);
    const input = samdoInputFromAnswers(answers);
    const recommendation = buildSamdoRecommendation(samdoRules(), input);
    const target = recommendation.evaluations.find(evaluation => evaluation.supplyType === item.targetSupply)!;
    assert.ok(['CONDITIONAL', 'EVIDENCE_REQUIRED'].includes(target.eligibility), `${item.id}: ${target.eligibility}`);
    const plan = buildSamdoQuestionPlan(recommendation, item.states);
    const questionIds = [...plan.questions, ...plan.evidenceOnly].map(question => question.id);
    for (const id of item.repeatedQuestionIds) assert.ok(!questionIds.includes(id), `${item.id}: repeated ${id}`);

    const frozen = evaluateEvent(event, answers, REF);
    const adaptive = createAdaptiveQuestionPlan(frozen.assessment.results, answers, [], item.states);
    const repeatedBaseAliases = adaptive.questions.filter(question =>
      question.sourceFacts.some(fact => ['household.maxVehicleValueKrw', 'event.applicantParentTotalAssetsKrw'].includes(fact)));
    if (item.id.startsWith('PARENT_') || item.id === 'NO_PARENTS') assert.equal(repeatedBaseAliases.length, 0, item.id);
  }
});
