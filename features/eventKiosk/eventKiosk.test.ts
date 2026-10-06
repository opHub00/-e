import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { activeEventConfig, activeEventRulePackages } from '../../data/events/activeEvent.ts';
import { defaultChatOutcome, sendChat, startChat, suggestedQuestions } from './consult.ts';
import { ageOn, monthsBefore, toAssessmentInput } from './engineInput.ts';
import { decodeEventConfig, loadEvent } from './eventConfig.ts';
import { evaluateEvent, rankOutcomes, wanpanIndicator, type KioskOutcome } from './evaluate.ts';
import { emptyAnswers, inputSteps, resizeChildren, stepBlocker, type HouseholdType, type KioskAnswers } from './model.ts';
import { buildSummary, decodeSummary, encodeSummary, fromBase64Url, toBase64Url } from './summary.ts';

const REF = new Date(2026, 8, 14); // 2026-09-14 local, the reviewed announcement date
const event = loadEvent(activeEventConfig, activeEventRulePackages);
const ruledListing = event.config.listings.find(listing => listing.rulePackage)!;
const unruledListing = event.config.listings.find(listing => !listing.rulePackage)!;

/** 검토본 회귀 테스트(samdoProfiles.test-data.ts)의 신청자와 같은 사람을 행사 화면 답으로 옮긴 것. */
function provenAnswers(type: HouseholdType): KioskAnswers {
  const answers = emptyAnswers();
  answers.householdType = type;
  answers.applicant = {
    ...answers.applicant,
    birthDate: '1995-09-14', livesInEventRegion: true, residenceMonths: 24, isHouseholdHead: true,
    householdNoHome: true, neverOwnedHome: true, winningHistory: false, monthlyIncome: 2_669_354,
    taxPaymentYears: 5, longOverseasStay: false, specialException: false,
  };
  answers.household = {
    ...answers.household,
    marriageRegistered: type === 'couple' ? true : null,
    marriageDate: type === 'couple' ? '2025-09-14' : '',
    dualIncome: false, householdIncome: 5_000_000, householdSize: 2, childrenCount: 0,
    totalAssets: 100_000_000, parentAssets: 200_000_000,
  };
  answers.subscription = { accountKind: 'housing', openedAt: '2024-01-01', paymentCount: 24, depositAmount: 6_000_000, firstRank: true };
  return answers;
}

const bySupply = (outcomes: KioskOutcome[]): Record<string, KioskOutcome> => Object.fromEntries(
  outcomes.filter(outcome => outcome.listing.listingId === ruledListing.listingId).map(outcome => [outcome.supplyType, outcome] as const),
);

test('event config loads and binds rules only to the listing they were written for', () => {
  assert.ok(event.config.listings.length >= 2);
  assert.ok(event.rulesByListing.has(ruledListing.listingId));
  assert.ok(!event.rulesByListing.has(unruledListing.listingId));
  const swapped = structuredClone(activeEventConfig) as { listings: { listingId: string }[] };
  swapped.listings[0].listingId = 'some-other-listing';
  assert.throws(() => loadEvent(swapped, activeEventRulePackages), /EVENT_RULE_LISTING_MISMATCH/);
  assert.throws(() => loadEvent(activeEventConfig, {}), /EVENT_RULE_PACKAGE_MISSING/);
  assert.throws(() => decodeEventConfig({}), /EVENT_CONFIG_INVALID/);
  const duplicated = structuredClone(activeEventConfig) as { listings: unknown[] };
  duplicated.listings.push(duplicated.listings[0]);
  assert.throws(() => decodeEventConfig(duplicated), /duplicate/);
});

test('input steps add the family step only for households that have one', () => {
  assert.deepEqual(inputSteps('single'), ['household', 'applicant', 'finance', 'subscription']);
  assert.deepEqual(inputSteps('other'), ['household', 'applicant', 'finance', 'subscription']);
  for (const type of ['couple', 'withChildren', 'singleParent'] as const) assert.ok(inputSteps(type).includes('family'));
  const answers = emptyAnswers();
  assert.ok(stepBlocker(answers, 'household'));
  answers.householdType = 'single';
  assert.equal(stepBlocker(answers, 'household'), null);
  assert.ok(stepBlocker(answers, 'applicant'));
  answers.applicant.birthDate = '1995-02-30x';
  assert.ok(stepBlocker(answers, 'applicant'));
  answers.applicant.birthDate = '1995-02-03';
  assert.equal(stepBlocker(answers, 'applicant'), null);
  assert.deepEqual(resizeChildren([2020, null, 2018], 2), [2020, null]);
  assert.deepEqual(resizeChildren([2020], 3), [2020, null, null]);
});

test('date helpers', () => {
  assert.equal(ageOn('1995-09-14', REF), 31);
  assert.equal(ageOn('1995-09-15', REF), 30);
  assert.equal(ageOn('', REF), null);
  assert.equal(monthsBefore(24, REF), '2024-09-14');
});

test('unanswered questions stay unknown instead of becoming "no"', () => {
  const answers = emptyAnswers();
  answers.householdType = 'other';
  answers.applicant.birthDate = '1990-01-01';
  const { profile, details } = toAssessmentInput(answers, event.config.residenceRegion, REF);
  assert.equal(profile.family.marriageStatus.status, 'unknown');
  assert.equal(profile.housing.currentOwnership.status, 'unknown');
  assert.equal(profile.subscriptionAccount.hasAccount.status, 'unknown');
  for (const key of ['currentResidence', 'overseasStayHistory', 'specialExceptions', 'children', 'accountKindEligible', 'householdNoWinningFiveYears', 'totalAssets', 'dualIncome'] as const) {
    assert.equal(details[key], undefined, key);
  }
  // 오래 나가 있었다고 답하면 기간을 모르므로 여전히 확인 필요로 남는다.
  answers.applicant.longOverseasStay = true;
  assert.equal(toAssessmentInput(answers, event.config.residenceRegion, REF).details.overseasStayHistory, undefined);
});

test('kiosk answers reproduce the reviewed single applicant: youth priority supply with the announcement score', () => {
  const evaluation = evaluateEvent(event, provenAnswers('single'), REF);
  const outcomes = bySupply(evaluation.outcomes);
  assert.equal(outcomes.youth.status, 'COMPLETE');
  assert.equal(outcomes.youth.bucket, 'eligible');
  assert.equal(outcomes.youth.stage, 'PRIORITY');
  assert.ok(outcomes.youth.officialScore);
  assert.equal(outcomes.youth.officialScore!.total, outcomes.youth.officialScore!.items.reduce((sum, item) => sum + item.points, 0));
  assert.equal(outcomes.firstHome.status, 'INELIGIBLE');
  assert.equal(outcomes.firstHome.bucket, 'difficult');
  assert.ok(outcomes.firstHome.failed.length > 0);
  // 혼자 준비하는 사람에게 예비신혼 여부는 묻지 않았다. 엔진이 모른다고 하고, 행사 화면도 그대로 '확인 필요'로 둔다.
  assert.equal(outcomes.newlywed.status, 'NEEDS_USER_INPUT');
  assert.equal(evaluation.outcomes[0].id, outcomes.youth.id, 'the eligible priority supply ranks first');
});

test('kiosk answers reproduce the reviewed married applicant: newlywed and first-home eligible, youth not', () => {
  const evaluation = evaluateEvent(event, provenAnswers('couple'), REF);
  const outcomes = bySupply(evaluation.outcomes);
  assert.equal(outcomes.newlywed.status, 'COMPLETE');
  assert.equal(outcomes.newlywed.stage, 'PRIORITY');
  assert.equal(outcomes.firstHome.status, 'COMPLETE');
  assert.equal(outcomes.firstHome.officialScore, null, 'first-home supply has no announcement score table');
  assert.equal(outcomes.youth.status, 'INELIGIBLE');
  assert.equal(evaluation.counts.eligible, 2);
  assert.equal(evaluation.counts.difficult, 1);
});

test('engaged couples are assessed as pre-newlyweds, not as married', () => {
  const answers = provenAnswers('couple');
  answers.household.marriageRegistered = false;
  answers.household.marriageDate = '';
  answers.household.plannedMarriageWithinDeadline = true;
  const input = toAssessmentInput(answers, event.config.residenceRegion, REF);
  assert.equal(input.details.familyCategory, 'engaged');
  assert.equal(input.profile.family.marriageStatus.status === 'known' && input.profile.family.marriageStatus.value, 'single');
  const outcomes = bySupply(evaluateEvent(event, answers, REF).outcomes);
  assert.notEqual(outcomes.newlywed.status, 'INELIGIBLE');
});

test('a listing without verified rules is shown as needing review, never as eligible', () => {
  const evaluation = evaluateEvent(event, provenAnswers('single'), REF);
  const outcome = evaluation.outcomes.find(item => item.listing.listingId === unruledListing.listingId)!;
  assert.equal(outcome.status, 'UNAVAILABLE');
  assert.equal(outcome.unavailableReason, 'NO_ACTIVE_RULE_SET');
  assert.equal(outcome.bucket, 'review');
  assert.equal(outcome.officialScore, null);
  assert.equal(outcome.result, null);
  const total = evaluation.counts.eligible + evaluation.counts.review + evaluation.counts.difficult;
  assert.equal(total, evaluation.outcomes.length);
});

test('an empty visitor gets no eligible result and nothing crashes', () => {
  const answers = emptyAnswers();
  answers.householdType = 'single';
  answers.applicant.birthDate = '1995-09-14';
  const evaluation = evaluateEvent(event, answers, REF);
  assert.equal(evaluation.counts.eligible, 0);
  assert.ok(evaluation.outcomes.every(outcome => outcome.officialScore === null || outcome.status === 'COMPLETE'));
});

test('wanpan indicator is separate from the announcement score and orders within a bucket', () => {
  const none = wanpanIndicator({ status: 'INELIGIBLE', stage: null, officialScore: null, missingCount: 0, recruitment: 'open' });
  assert.equal(none.value, 0);
  assert.equal(none.level, 'none');
  const priority = wanpanIndicator({ status: 'COMPLETE', stage: 'PRIORITY', officialScore: { total: 9, max: 9, items: [] }, missingCount: 0, recruitment: 'unknown' });
  const general = wanpanIndicator({ status: 'COMPLETE', stage: 'GENERAL', officialScore: null, missingCount: 0, recruitment: 'unknown' });
  assert.ok(priority.value > general.value);
  assert.equal(priority.level, 'high');
  // 공고 점수 9/9 와 추천도 값은 같은 숫자가 아니다.
  assert.notEqual(priority.value, 9);
  const evaluation = evaluateEvent(event, provenAnswers('couple'), REF);
  const ranks = evaluation.outcomes.map(outcome => outcome.rank);
  assert.deepEqual(ranks, ranks.map((_, index) => index + 1));
  const reRanked = rankOutcomes([...evaluation.outcomes].reverse());
  assert.deepEqual(reRanked.map(outcome => outcome.id), evaluation.outcomes.map(outcome => outcome.id), 'ranking is deterministic');
});

test('summary round-trips through the QR payload and carries no personal values', () => {
  const answers = provenAnswers('couple');
  answers.applicant.displayName = '홍길동';
  const evaluation = evaluateEvent(event, answers, REF);
  const favorite = evaluation.outcomes.find(outcome => outcome.status === 'UNAVAILABLE')!;
  const summary = buildSummary({ eventId: event.config.id, householdType: 'couple', evaluation, favoriteIds: [favorite.id] });
  assert.equal(summary.favorites.length, 1);
  assert.equal(summary.recommended.length, 2);
  const encoded = encodeSummary(summary);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSummary(encoded), summary);
  const raw = fromBase64Url(encoded);
  for (const secret of ['홍길동', '1995', '2669354', '100000000', '2025-09-14', '2024-01-01']) assert.ok(!raw.includes(secret), secret);
  assert.equal(decodeSummary('!!not-base64!!'), null);
  assert.equal(decodeSummary(toBase64Url('{"x":1}')), null);
  assert.equal(fromBase64Url(toBase64Url('완판e 🏠 a')), '완판e 🏠 a');
  assert.ok(encoded.length < 1500, `QR payload stays scannable (${encoded.length})`);
});

test('chat answers from the visitor context with the deterministic engine and keeps answers in the chat only', async () => {
  const answers = provenAnswers('single');
  answers.household.parentAssets = null;
  const evaluation = evaluateEvent(event, answers, REF);
  const outcome = defaultChatOutcome(evaluation.outcomes)!;
  assert.equal(outcome.supplyType, 'youth');
  assert.equal(outcome.status, 'NEEDS_USER_INPUT');
  assert.ok(suggestedQuestions(outcome).includes('제가 준비해야 하는 조건이 무엇인가요?'));
  let chat = startChat(event, answers, outcome, REF);
  assert.equal(chat.session?.supplyType, 'youth');
  chat = await sendChat(event, chat, '제가 준비해야 하는 조건이 무엇인가요?');
  assert.match(chat.messages.at(-1)!.detail!.join(' '), /부모/);
  chat = await sendChat(event, chat, '부모님 자산은 2억이에요');
  assert.equal(chat.session?.lastAssessmentResult?.status, 'ELIGIBLE');
  assert.equal(answers.household.parentAssets, null, 'chat never edits the kiosk answers');
  chat = await sendChat(event, chat, '배우자 기준으로 신청하면 달라지나요?');
  assert.match(chat.messages.at(-1)!.text, /배우자/);
  assert.equal(chat.messages.filter(message => message.role === 'user').length, 3);
});

test('chat about a listing without rules refuses to judge it', async () => {
  const evaluation = evaluateEvent(event, provenAnswers('single'), REF);
  const outcome = evaluation.outcomes.find(item => item.status === 'UNAVAILABLE' && !item.result)!;
  let chat = startChat(event, provenAnswers('single'), outcome, REF);
  assert.equal(chat.session, null);
  chat = await sendChat(event, chat, '저 신청할 수 있나요?');
  assert.match(chat.messages.at(-1)!.text, /말씀드릴 수 없어요/);
});

test('session store keeps everything in memory and reset leaves nothing from the previous visitor', async () => {
  const { useKioskStore } = await import('./useKioskStore.ts');
  const store = useKioskStore.getState();
  const before = useKioskStore.getState().sessionKey;
  store.setHouseholdType('couple');
  const proven = provenAnswers('couple');
  store.patchApplicant({ ...proven.applicant, displayName: '방문자A' });
  store.patchHousehold(proven.household);
  store.patchSubscription(proven.subscription);
  await useKioskStore.getState().runAnalysis(event);
  const state = useKioskStore.getState();
  assert.equal(state.analysis, 'done');
  assert.ok(state.evaluation!.counts.eligible >= 1);
  state.toggleFavorite(state.evaluation!.outcomes[0].id);
  state.openChat(event, null);
  await useKioskStore.getState().ask(event, '제가 준비해야 하는 조건이 무엇인가요?');
  assert.equal(useKioskStore.getState().chat!.messages.length, 3);
  // 결과 뒤에 답을 고치면 결과가 낡았다고 표시한다.
  useKioskStore.getState().patchApplicant({ monthlyIncome: 1 });
  assert.equal(useKioskStore.getState().stale, true);
  // 가구 형태를 바꾸면 숨겨진 배우자 답이 남지 않는다.
  useKioskStore.getState().setHouseholdType('single');
  assert.equal(useKioskStore.getState().answers.household.marriageDate, '');

  useKioskStore.getState().reset();
  const after = useKioskStore.getState();
  assert.equal(after.sessionKey, before + 1);
  assert.deepEqual(after.answers, emptyAnswers());
  assert.equal(after.evaluation, null);
  assert.equal(after.analysis, 'idle');
  assert.deepEqual(after.favorites, []);
  assert.equal(after.chat, null);
  assert.equal(after.stale, false);
  assert.ok(!JSON.stringify(after).includes('방문자A'));
});

test('an analysis that finishes after reset does not leak into the next session', async () => {
  const { useKioskStore } = await import('./useKioskStore.ts');
  useKioskStore.getState().reset();
  useKioskStore.getState().setHouseholdType('single');
  useKioskStore.getState().patchApplicant(provenAnswers('single').applicant);
  const pending = useKioskStore.getState().runAnalysis(event);
  useKioskStore.getState().reset();
  await pending;
  assert.equal(useKioskStore.getState().evaluation, null);
  assert.equal(useKioskStore.getState().analysis, 'idle');
});

test('rules the announcement marks for document review are shown as "to confirm", not as failed', () => {
  const answers = provenAnswers('single');
  answers.household.householdSize = null; // 혼자 사는 1인 세대
  answers.household.householdIncome = null;
  const outcomes = bySupply(evaluateEvent(event, answers, REF).outcomes);
  assert.equal(outcomes.firstHome.result?.status, 'NEEDS_MORE_INFORMATION');
  assert.equal(outcomes.firstHome.status, 'UNAVAILABLE');
  assert.equal(outcomes.firstHome.unavailableReason, 'MISSING_ANNOUNCEMENT_FACTS');
  assert.equal(outcomes.firstHome.bucket, 'review');
  // 엔진이 FAIL 로 낸 조건은 그대로 '부족', REVIEW 로 낸 조건은 '증빙으로 확인'. 둘이 섞이지 않는다.
  const result = outcomes.firstHome.result!;
  const reviewIds = result.missingInformation.filter(key => key.startsWith('review:')).map(key => key.slice(7));
  assert.ok(reviewIds.length > 0);
  assert.deepEqual(outcomes.firstHome.failed, result.failedConditions.filter(c => !reviewIds.includes(c.ruleId)).map(c => c.label));
  assert.ok(outcomes.firstHome.missing.some(label => label.endsWith('(증빙으로 확인)')));
  assert.ok(!outcomes.firstHome.missing.some(label => label.includes('특례 관련')), 'review keys are labelled by their own rule, not a generic exception label');
});
