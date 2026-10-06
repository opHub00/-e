import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { activeEventDataset } from '../../data/events/activeEvent.ts';
import { defaultChatOutcome, sendChat, startChat } from './consult.ts';
import { ageOn, monthsBefore, toUserProfile } from './engineInput.ts';
import { loadEvent } from './eventConfig.ts';
import { evaluateEvent, WANPAN_LEVEL_LABELS } from './evaluate.ts';
import { eventPersonas, evaluatePersonaMatrix } from './frozen/data/eventPersonas.ts';
import { readKnown } from './frozen/domain/profile.ts';
import { assessFrozenDataset } from './frozen/engine/batch.ts';
import { emptyAnswers, inputSteps, resizeChildren, stepBlocker, type KioskAnswers } from './model.ts';
import { assertOpaqueResultUrl, createResultSession, isOpaqueResultToken, readResultSession } from './resultSessionClient.ts';
import { buildSummary } from './summary.ts';

const event = loadEvent(activeEventDataset);
const REF = new Date('2026-10-29T09:00:00+09:00');

function answers(type: KioskAnswers['householdType'] = 'single'): KioskAnswers {
  const value = emptyAnswers();
  value.householdType = type;
  value.applicant = {
    ...value.applicant,
    displayName: '테스트 방문자', birthDate: '1995-04-10', livesInEventRegion: true, residenceMonths: 36,
    isHouseholdHead: true, householdNoHome: true, neverOwnedHome: true, winningHistory: false,
    monthlyIncome: 2_500_000, taxPaymentYears: 5, longOverseasStay: false, specialException: false,
  };
  value.household = {
    ...value.household,
    marriageRegistered: type === 'couple' || type === 'withChildren' ? true : null,
    marriageDate: type === 'couple' || type === 'withChildren' ? '2024-05-01' : '',
    plannedMarriageWithinDeadline: null,
    dualIncome: type === 'couple' || type === 'withChildren' ? true : false,
    householdIncome: type === 'single' ? null : 4_600_000,
    householdSize: type === 'single' ? null : type === 'withChildren' ? 3 : 2,
    childrenCount: type === 'withChildren' ? 1 : 0,
    childBirthYears: type === 'withChildren' ? [2025] : [],
    totalAssets: 120_000_000,
    parentAssets: 200_000_000,
  };
  value.subscription = { accountKind: 'housing', openedAt: '2020-01-01', paymentCount: 48, depositAmount: 6_000_000, firstRank: true };
  return value;
}

test('loads only the frozen 2026-10 Jeju dataset with five listings and nine listing/supply results', () => {
  assert.equal(event.dataset.eventId, 'wanpan-jeju-event-2026-10');
  assert.equal(event.dataset.datasetVersion, '2026.10.0-rc1');
  assert.equal(event.dataset.fingerprint, 'sha256:51aeeb22999594de30b2d032e2c885f3395cf18fb9dea2f43dacbb156fa0f5c8');
  assert.equal(event.dataset.listings.length, 5);
  assert.equal(event.dataset.rulePackages.flatMap(item => item.supplies).length, 9);
  assert.ok(event.dataset.listings.every(item => item.reviewStatus === 'APPROVED_FOR_EVENT'));
  assert.ok(event.dataset.rulePackages.every(item => item.reviewStatus === 'APPROVED_FOR_EVENT'));
  assert.equal(event.config.listings.length, 5);
});

test('input flow and date helpers remain stable', () => {
  assert.deepEqual(inputSteps('single'), ['household', 'applicant', 'finance', 'subscription']);
  assert.ok(inputSteps('couple').includes('family'));
  const value = emptyAnswers();
  assert.ok(stepBlocker(value, 'household'));
  value.householdType = 'single';
  value.applicant.birthDate = '1995-02-03';
  assert.equal(stepBlocker(value, 'applicant'), null);
  assert.deepEqual(resizeChildren([2020], 3), [2020, null, null]);
  assert.equal(ageOn('1995-10-30', REF), 30);
  assert.equal(monthsBefore(24, REF), '2024-10-29');
});

test('spouse and household answers map without inventing spouse-level values', () => {
  const profile = toUserProfile(answers('withChildren'), REF);
  assert.equal(profile.household.composition, 'COUPLE_WITH_CHILDREN');
  assert.equal(profile.household.spouse?.role, 'SPOUSE');
  assert.equal(profile.household.spouse?.birthDate.status, 'UNKNOWN');
  assert.equal(readKnown(profile.household.declaredTotals!.memberCount), 3);
  assert.equal(readKnown(profile.household.declaredTotals!.monthlyIncomeKrw), 4_600_000);
  assert.equal(readKnown(profile.household.declaredTotals!.totalAssetsKrw), 120_000_000);
  assert.equal(profile.household.members.filter(item => item.relationship === 'CHILD').length, 1);
  assert.equal(profile.household.members[0]?.birthDate.status, 'UNKNOWN', 'a year-only answer must not become a fabricated birthday');
});

test('one UserProfile produces all nine results and preserves all four UI status names', () => {
  const evaluation = evaluateEvent(event, answers('withChildren'), REF);
  assert.equal(evaluation.outcomes.length, 9);
  assert.equal(new Set(evaluation.outcomes.map(item => item.listing.listingId)).size, 5);
  assert.equal(evaluation.counts.eligible + evaluation.counts.review + evaluation.counts.difficult, 9);
  assert.ok(evaluation.outcomes.every(item => ['COMPLETE', 'NEEDS_USER_INPUT', 'INELIGIBLE', 'UNAVAILABLE'].includes(item.status)));
  assert.ok(evaluation.outcomes.some(item => item.status === 'NEEDS_USER_INPUT'));
  assert.deepEqual(evaluation.assessment.results.map(item => item.evaluationId).sort(), evaluation.outcomes.map(item => item.id).sort());
});

test('NOT_APPLICABLE official scores stay explicit and are never rendered as zero', () => {
  const evaluation = evaluateEvent(event, answers('single'), REF);
  const notApplicable = evaluation.outcomes.filter(item => item.officialScoreState.status === 'NOT_APPLICABLE');
  assert.ok(notApplicable.length > 0);
  assert.ok(notApplicable.every(item => item.officialScore === null));
  for (const outcome of evaluation.outcomes) {
    if (outcome.officialScore) assert.equal(outcome.officialScore.total, outcome.result?.officialScore.status === 'AVAILABLE' ? outcome.result.officialScore.total : NaN);
  }
  assert.deepEqual(WANPAN_LEVEL_LABELS, { high: '적극 검토', medium: '검토 가능', low: '조건 확인 필요', none: '신청 어려움' });
});

test('source lineage and evidence remain reachable from every assessed result', () => {
  const evaluation = evaluateEvent(event, answers('single'), REF);
  for (const outcome of evaluation.outcomes) {
    assert.equal(outcome.listing.reviewStatus, 'APPROVED_FOR_EVENT');
    assert.ok(outcome.listing.sourceId);
    assert.ok(outcome.listing.sourceUrl.startsWith('https://'));
    assert.ok(outcome.result);
    assert.ok(outcome.evidence.length > 0);
    assert.ok(outcome.evidence.every(item => outcome.result!.evidenceIds.includes(item.id)));
  }
});

test('the eight approved personas still produce the frozen 72-cell matrix', () => {
  const matrix = evaluatePersonaMatrix(event.dataset);
  assert.equal(matrix.length, 8);
  assert.ok(matrix.every(row => row.cells.length === 9));
  assert.equal(matrix.flatMap(row => row.cells).length, 72);
  assert.deepEqual(matrix.find(row => row.personaId === 'YOUNG_SINGLE')?.distribution, { COMPLETE: 2, NEEDS_USER_INPUT: 0, INELIGIBLE: 7, UNAVAILABLE: 0 });
  assert.deepEqual(matrix.find(row => row.personaId === 'MULTI_CHILD')?.distribution, { COMPLETE: 3, NEEDS_USER_INPUT: 0, INELIGIBLE: 6, UNAVAILABLE: 0 });
  assert.deepEqual(matrix.find(row => row.personaId === 'CLEARLY_INELIGIBLE')?.distribution, { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 9, UNAVAILABLE: 0 });
  for (const persona of eventPersonas) assert.equal(assessFrozenDataset(persona.profile, event.dataset).results.length, 9);
});

test('AI consultation carries the current profile, listing, result and privacy-reduced AssessmentContext', async () => {
  const evaluation = evaluateEvent(event, answers('single'), REF);
  const outcome = defaultChatOutcome(evaluation.outcomes)!;
  let chat = startChat(event, evaluation, outcome);
  assert.equal(chat.userProfile, evaluation.profile);
  assert.equal(chat.listing?.id, outcome.listing.listingId);
  assert.equal(chat.result?.evaluationId, outcome.id);
  assert.equal(chat.assessmentContext?.dataset.fingerprint, event.dataset.fingerprint);
  assert.equal(chat.assessmentContext?.assessments.length, 9);
  assert.equal(chat.assessmentContext?.privacy.directIdentifiersIncluded, false);
  chat = await sendChat(event, chat, '근거가 된 공고문 항목은 무엇인가요?');
  assert.match(chat.messages.at(-1)!.text, /근거/);
});

test('QR session URL contains only an opaque token and the stored summary has no personal fields', async () => {
  const value = answers('couple');
  const evaluation = evaluateEvent(event, value, REF);
  const summary = buildSummary({ eventId: event.config.id, householdType: value.householdType, evaluation, favoriteIds: [evaluation.outcomes[0]!.id] });
  let posted = '';
  const token = 'a'.repeat(64);
  const fakeFetch = async (_input: URL | RequestInfo, init?: RequestInit) => {
    posted = String(init?.body ?? '');
    return new Response(JSON.stringify({ token, expiresAt: '2026-10-29T15:00:00.000Z', url: `http://localhost:4173/event/take?token=${token}` }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const session = await createResultSession('http://localhost:4173', summary, fakeFetch as typeof fetch);
  assertOpaqueResultUrl(session.url);
  assert.equal(isOpaqueResultToken(session.token), true);
  assert.equal(new URL(session.url).searchParams.size, 1);
  for (const privateValue of ['테스트 방문자', '1995-04-10', '2500000', '120000000', '2024-05-01']) assert.ok(!posted.includes(privateValue));
  assert.equal(await readResultSession('http://localhost:4173', 'bad-token', fakeFetch as typeof fetch), null);
});

test('reset removes answers, results, favorites and AI context from memory', async () => {
  const { useKioskStore } = await import('./useKioskStore.ts');
  useKioskStore.getState().reset();
  const value = answers('single');
  useKioskStore.getState().setHouseholdType('single');
  useKioskStore.getState().patchApplicant(value.applicant);
  useKioskStore.getState().patchHousehold(value.household);
  useKioskStore.getState().patchSubscription(value.subscription);
  await useKioskStore.getState().runAnalysis(event);
  const first = useKioskStore.getState().evaluation!.outcomes[0]!;
  useKioskStore.getState().toggleFavorite(first.id);
  useKioskStore.getState().openChat(event, first.id);
  const before = useKioskStore.getState().sessionKey;
  useKioskStore.getState().reset();
  const after = useKioskStore.getState();
  assert.equal(after.sessionKey, before + 1);
  assert.deepEqual(after.answers, emptyAnswers());
  assert.equal(after.evaluation, null);
  assert.deepEqual(after.favorites, []);
  assert.equal(after.chat, null);
  assert.ok(!JSON.stringify(after).includes('테스트 방문자'));
});
