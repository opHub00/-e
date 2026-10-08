import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { activeEventDataset } from '../../data/events/activeEvent.ts';
import { buildRuleFactInventory, createAdaptiveQuestionPlan, inventoryCoverage } from './adaptiveAssessment.ts';
import { toUserProfile } from './engineInput.ts';
import { loadEvent } from './eventConfig.ts';
import { buildHouseholdFacts } from './frozen/engine/facts.ts';
import { readKnown } from './frozen/domain/profile.ts';
import { evaluateEvent } from './evaluate.ts';
import { evaluatePhase4Personas, mergeAdaptivePlan, phase4Personas } from './phase4Personas.ts';
import { emptyAnswers, type KioskAnswers } from './model.ts';

const event = loadEvent(activeEventDataset);
const REF = new Date('2026-10-29T09:00:00+09:00');

test('Rule Package fact inventory covers all 46 facts and records the RC1 UI coverage', () => {
  const rows = buildRuleFactInventory(event.dataset);
  assert.equal(rows.length, 46);
  assert.deepEqual(inventoryCoverage(rows), { full: 16, partial: 7, none: 23, percent: 34.8 });
  assert.ok(rows.every(row => row.combinations.length > 0 && row.question.length > 0));
  assert.ok(rows.some(row => row.classification === 'EVIDENCE_ONLY'));
});

test('missing facts are deduplicated across listings and one question retains all consumers', () => {
  const persona = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!;
  const evaluation = evaluateEvent(event, persona.initialAnswers, REF);
  const plan = createAdaptiveQuestionPlan(evaluation.assessment.results, persona.initialAnswers);
  assert.equal(new Set(plan.questions.map(question => question.id)).size, plan.questions.length);
  const vehicle = plan.questions.find(question => question.id === 'vehicleValueKrw');
  assert.ok(vehicle);
  assert.ok(vehicle.combinations.length > 1);
});

test('conditional questions are generated only for supplies still reviewable by this user', () => {
  const young = phase4Personas.find(item => item.id === 'YOUNG_SINGLE')!;
  const couple = phase4Personas.find(item => item.id === 'NEWLYWED_COUPLE')!;
  const youngPlan = createAdaptiveQuestionPlan(evaluateEvent(event, young.initialAnswers, REF).assessment.results, young.initialAnswers);
  const couplePlan = createAdaptiveQuestionPlan(evaluateEvent(event, couple.initialAnswers, REF).assessment.results, couple.initialAnswers);
  const youthStatus = youngPlan.questions.find(question => question.id === 'youthStudyStatus');
  assert.ok(youthStatus);
  assert.deepEqual(youthStatus.sourceFacts, ['event.collegeStudent', 'event.jobSeekerWithinTwoYears']);
  assert.ok(!couplePlan.questions.some(question => question.id === 'youthStudyStatus'));

  const legacyAnswers = structuredClone(young.initialAnswers) as KioskAnswers;
  delete (legacyAnswers.adaptive as Partial<KioskAnswers['adaptive']>).youthStudyStatus;
  const legacyPlan = createAdaptiveQuestionPlan(evaluateEvent(event, legacyAnswers, REF).assessment.results, legacyAnswers);
  assert.ok(legacyPlan.questions.some(question => question.id === 'youthStudyStatus'));
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
  const youngInitial = evaluateEvent(event, young.initialAnswers, REF);
  const youngProfile = toUserProfile(mergeAdaptivePlan(young, createAdaptiveQuestionPlan(youngInitial.assessment.results, young.initialAnswers)), REF);
  assert.equal(readKnown(youngProfile.applicant.financial.totalAssetsKrw), 60_000_000);
  assert.equal(readKnown(youngProfile.applicant.financial.vehicleValueKrw!), 15_000_000);
  assert.equal(readKnown(youngProfile.eventQualifications!.collegeStudent!), false);
  assert.equal(readKnown(youngProfile.eventQualifications!.jobSeekerWithinTwoYears!), false);

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
    assert.equal(row.before.COMPLETE, 0);
    assert.ok(row.after.COMPLETE > 0, row.label);
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
