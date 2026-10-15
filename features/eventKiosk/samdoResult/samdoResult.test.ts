import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { emptyAnswers } from '../model.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { containsRawKey } from '../presentation.ts';
import { buildSamdoRecommendation, toSamdoPresentationRecommendation } from '../samdo/index.ts';
import { samdoRecommendationForAnswers, samdoRules } from './samdoEvaluate.ts';
import { samdoInputFromAnswers } from './samdoInput.ts';
import { buildSamdoResultView, failedSentence, formatSamdoDate, pickStrengths } from './samdoResultModel.ts';
import { buildSamdoQrSummary } from './samdoSummary.ts';
import { isValidResultSummary } from '../../../scripts/event-result-session-store.mjs';
import { sendChat, startSamdoChat } from '../consult.ts';
import { isRenderableSummary } from '../experience/safeSummary.ts';
import { buildEventChatContext } from '../chat/context.ts';
import { SAMDO_PERSONAS } from '../samdo/personas.test-data.ts';
import { buildOfficialCriteria } from './officialCriteria.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const personas = evaluatePhase4Personas(load.event);
const answersOf = (id: string) => personas.find(item => item.personaId === id)!.finalAnswers;

test('screen uses the Codex recommendation unchanged (same order, same recommended type)', () => {
  for (const persona of personas) {
    const direct = toSamdoPresentationRecommendation(buildSamdoRecommendation(samdoRules(), samdoInputFromAnswers(persona.finalAnswers)));
    const viaScreen = samdoRecommendationForAnswers(persona.finalAnswers);
    assert.deepEqual(viaScreen, direct, persona.personaId);
    const view = buildSamdoResultView(viaScreen);
    assert.equal(view.hero.supplyType, viaScreen.recommendedType?.supplyType ?? viaScreen.alternatives[0]?.supplyType ?? viaScreen.lowerPriorityTypes[0]?.supplyType ?? null);
    const expectedAlternatives = viaScreen.alternatives.map(item => item.supplyType).filter(type => type !== view.hero.supplyType);
    assert.deepEqual(view.alternatives.map(card => card.supplyType), expectedAlternatives, `${persona.personaId}: alternatives keep engine order`);
    const expectedLower = viaScreen.lowerPriorityTypes.map(item => item.supplyType).filter(type => type !== view.hero.supplyType);
    assert.deepEqual(view.lowerPriorityTypes.map(card => card.supplyType), expectedLower, `${persona.personaId}: lower-priority types stay separate`);
    assert.deepEqual(view.rejected.map(item => item.supplyType), viaScreen.rejectedTypes.map(item => item.supplyType));
  }
});

test('newborn family: hero recommends newborn priority with official score, 3–5 reasons, no raw keys', () => {
  const view = buildSamdoResultView(samdoRecommendationForAnswers(answersOf('NEWLYWED_ONE_CHILD')));
  assert.equal(view.hero.kind, 'recommended');
  assert.equal(view.hero.supplyType, 'NEWBORN');
  assert.match(view.hero.headline, /^신생아 특별공급 우선공급을 먼저 검토하세요$/);
  assert.deepEqual(view.hero.chips.map(chip => chip.label), ['신청 가능', '1단계 우선공급(70%)', '공식 가점 10/12점', '접수 11월 16일(월)']);
  assert.ok(view.why.length >= 3 && view.why.length <= 5, view.why.join('|'));
  assert.ok(view.why.some(line => /자녀/.test(line)) && view.why.some(line => /소득/.test(line)) && view.why.some(line => /거주/.test(line)));
  assert.ok(view.schedule.find(row => row.id === 'special')!.highlight);
  const texts = [view.title, view.subtitle, view.hero.headline, view.hero.body, ...view.why, ...view.documents, ...view.notes,
    ...[...view.alternatives, ...view.lowerPriorityTypes].flatMap(card => [card.title, card.stage, card.status.label, ...card.strengths, ...card.checks]), ...view.rejected.map(item => item.reason)];
  for (const text of texts) assert.ok(!containsRawKey(text), text);
});

test('supply counts are never presented as a probability', () => {
  for (const persona of personas) {
    const view = buildSamdoResultView(samdoRecommendationForAnswers(persona.finalAnswers));
    const all = JSON.stringify(view);
    assert.ok(!/확률\s*\d|경쟁률|당첨\s*가능성이\s*높/.test(all), persona.personaId);
    assert.ok(view.notes.some(line => line.includes('당첨 가능성을 뜻하지 않아요')));
    for (const card of [...view.alternatives, ...view.lowerPriorityTypes]) assert.match(card.supplyCount, /^공급 \d+세대$/);
  }
});

test('no eligible type: hero says so without inventing a recommendation', () => {
  const view = buildSamdoResultView(samdoRecommendationForAnswers(answersOf('CLEARLY_INELIGIBLE')));
  assert.equal(view.hero.kind, 'none');
  assert.equal(view.hero.supplyType, null);
  assert.equal(view.why.length, 0);
  assert.ok(view.rejected.length >= 1 && view.rejected.every(item => /요\.$/.test(item.reason)));
});

test('unknown answers stay unknown in the assessment input', () => {
  const answers = emptyAnswers();
  answers.householdType = 'withChildren';
  const input = samdoInputFromAnswers(answers);
  for (const key of ['birthDate', 'currentResidence', 'residenceStartDate', 'children', 'householdIncome', 'totalAssets', 'firstRank', 'specialSupplyHistory', 'reWinningRestriction', 'dualIncome'] as const) {
    assert.equal(input.details[key], undefined, key);
  }
  assert.equal(input.profile.housing.currentOwnership.status, 'unknown');
  const rec = samdoRecommendationForAnswers(answers);
  assert.equal(rec.recommendedType, null, 'nothing is eligible when nothing is known');
  // 당첨 이력이 '있다'는 답은 제한·특별공급 이력으로 확정하지 않는다.
  answers.applicant.winningHistory = true;
  const withWinning = samdoInputFromAnswers(answers);
  assert.equal(withWinning.details.specialSupplyHistory, undefined);
  assert.equal(withWinning.details.reWinningRestriction, undefined);
});

test('five representative supply types expose official eligibility, income, asset and subscription criteria', () => {
  const cases = [
    ['young-jeju-2y', 'YOUTH'],
    ['newlywed-no-child', 'NEWLYWED'],
    ['newborn-family', 'NEWBORN'],
    ['first-home-couple', 'FIRST_HOME'],
    ['general-no-home', 'GENERAL'],
  ] as const;
  for (const [personaId, expectedType] of cases) {
    const persona = SAMDO_PERSONAS.find(item => item.id === personaId)!;
    const rawRecommendation = buildSamdoRecommendation(samdoRules(), persona.input);
    const recommendation = toSamdoPresentationRecommendation(rawRecommendation);
    const view = buildSamdoResultView(recommendation, { rawRecommendation, input: persona.input });
    assert.equal(view.hero.supplyType, expectedType, personaId);
    assert.deepEqual(view.officialCriteria.map(item => item.id), ['eligibility', 'income', 'assets', 'subscription']);
    const text = JSON.stringify(view.officialCriteria);
    assert.match(text, /월평균소득/);
    assert.match(text, /2023\.03\.28/);
    assert.match(text, /가입 6개월/);
    assert.match(text, /월 납입 6회 이상/);
    if (expectedType === 'YOUTH') assert.match(text, /본인 276백만원 이하 \/ 부모 1,035백만원 이하/);
    else assert.match(text, /세대 총자산 362백만원 이하/);
  }
});

test('DOES_NOT_KNOW inputs stay reviewable and are never presented as PASS', () => {
  const answers = structuredClone(answersOf('YOUNG_SINGLE'));
  answers.household.parentInformationStatus = 'DOES_NOT_KNOW';
  answers.household.parentAssets = null;
  const input = samdoInputFromAnswers(answers);
  const rawRecommendation = buildSamdoRecommendation(samdoRules(), input);
  const youth = rawRecommendation.evaluations.find(item => item.supplyType === 'YOUTH')!;
  const assets = buildOfficialCriteria(youth, input).find(item => item.id === 'assets')!;
  assert.equal(assets.status, 'REVIEW');
  assert.equal(assets.statusLabel, '확인 필요');
  assert.ok(assets.current.every(line => line.includes('확인 필요')));
});

test('adapter keeps ambiguous history, scope, account and child facts separate', () => {
  const answers = emptyAnswers();
  answers.householdType = 'single';
  answers.applicant.birthDate = '1998-04-03';
  answers.applicant.residenceMonths = 24;
  answers.applicant.winningHistory = true;
  answers.applicant.neverOwnedHome = false;
  answers.household.childrenCount = 0;
  answers.household.totalAssets = 250_000_000;
  answers.household.parentAssets = 900_000_000;
  answers.adaptive.applicantTotalAssetsKrw = 120_000_000;
  answers.subscription.accountKind = 'other';
  answers.subscription.openedAt = '2024-09-14';
  answers.subscription.paymentCount = 12;
  answers.subscription.depositAmount = 6_000_000;
  answers.subscription.firstRank = false;

  const input = samdoInputFromAnswers(answers);
  assert.equal(input.details.specialSupplyHistory, undefined, 'a generic winning history is not a special-supply history');
  assert.equal(input.details.reWinningRestriction, undefined, 'a generic winning history is not a current restriction');
  assert.equal(input.profile.housing.householdDisqualifyingPreviousOwnership.status, 'unknown', 'a past-home answer does not prove a disqualifying household history');
  assert.equal(input.details.children, undefined, 'zero born children does not prove there is no unborn or adopted child');
  assert.equal(input.details.totalAssets, 120_000_000, 'youth uses applicant assets');
  assert.equal(input.details.parentAssets, 900_000_000, 'parent assets remain separate');
  assert.equal(input.profile.subscriptionAccount.hasAccount.status, 'known');
  assert.equal(input.profile.subscriptionAccount.hasAccount.value, true);
  assert.equal(input.details.accountKindEligible, undefined, 'other account is not guessed eligible');
  assert.equal(input.details.subscriptionAccountOpenedAt, '2024-09-14');
  assert.equal(input.details.recognizedPaymentCount, 12);
  assert.equal(input.details.recognizedDepositAmount, 6_000_000);
  assert.equal(input.details.firstRank, false);
  assert.equal(input.details.residenceStartDate, '2024-10-27', 'duration is mapped as a conservative lower bound at announcement date');
});

test('household scopes stay household-scoped and single-parent is mapped without inventing marriage history', () => {
  const answers = emptyAnswers();
  answers.householdType = 'singleParent';
  answers.household.singleParentQualified = true;
  answers.household.householdSize = 2;
  answers.household.householdIncome = 3_200_000;
  answers.household.totalAssets = 180_000_000;
  answers.household.childrenCount = 1;
  answers.household.childBirthDates = ['2022-10-01'];
  const input = samdoInputFromAnswers(answers);
  assert.equal(input.details.familyCategory, 'singleParent');
  assert.equal(input.profile.family.marriageStatus.status, 'known');
  assert.equal(input.profile.family.marriageStatus.value, 'single');
  assert.equal(input.details.everMarried, undefined);
  assert.equal(input.details.incomeHouseholdSize, 2);
  assert.equal(input.details.householdIncome, 3_200_000);
  assert.equal(input.details.totalAssets, 180_000_000);
  assert.deepEqual(input.details.children, [{ birthDate: '2022-10-01', unborn: false }]);
});

test('helpers: dates, strengths and failure sentences', () => {
  assert.equal(formatSamdoDate('2026-11-16'), '11월 16일(월)');
  assert.equal(formatSamdoDate('2026-11-18'), '11월 18일(수)');
  assert.equal(failedSentence('만 19~39세'), "'만 19~39세' 조건을 충족하지 못했어요.");
  assert.equal(failedSentence('공고일 현재 제주 거주자가 아니에요.'), '공고일 현재 제주 거주자가 아니에요.');
  const rec = samdoRecommendationForAnswers(answersOf('NEWLYWED_COUPLE'));
  for (const line of pickStrengths(rec.recommendedType!, 5)) assert.ok(!/검토 메모|확인 필요/.test(line), line);
});

test('QR payload uses the Samdo-only v3 session contract and carries no personal data', () => {
  for (const persona of personas) {
    const recommendation = samdoRecommendationForAnswers(persona.finalAnswers);
    const summary = buildSamdoQrSummary({ eventId: load.event.config.id, date: '2026-10-11', recommendation, view: buildSamdoResultView(recommendation) });
    assert.ok(isValidResultSummary(summary), persona.personaId);
    assert.ok(isRenderableSummary(summary), persona.personaId);
    assert.equal(summary.v, 3);
    assert.equal(summary.focus?.supply ?? null, recommendation.recommendedType?.supplyLabel ?? recommendation.alternatives[0]?.supplyLabel ?? recommendation.lowerPriorityTypes[0]?.supplyLabel ?? null);
    assert.equal(summary.focus?.kind ?? null, recommendation.recommendedType ? 'RECOMMENDED' : summary.focus ? 'REVIEW' : null);
    const serialized = JSON.stringify(summary);
    assert.equal(serialized.includes('JPDC'), false);
    for (const privateKey of ['displayName', 'birthDate', 'monthlyIncome', 'totalAssets', 'profileId', 'personId']) assert.equal(serialized.includes(privateKey), false, privateKey);
  }
});

test('Samdo AI chat receives the recommendation contract without re-assessing or leaking keys', async () => {
  const recommendation = samdoRecommendationForAnswers(answersOf('NEWLYWED_ONE_CHILD'));
  let chat = startSamdoChat(load.event, recommendation);
  assert.equal(chat.samdoRecommendation, recommendation);
  assert.equal(chat.context.supplyLabel, recommendation.recommendedType?.supplyLabel);
  const context = buildEventChatContext(chat);
  assert.equal(context?.scope, 'SAMDO');
  const contextJson = JSON.stringify(context);
  for (const listing of load.event.config.listings) assert.equal(contextJson.includes(listing.title), false, listing.title);
  chat = await sendChat(load.event, chat, '왜 이 신청유형을 먼저 추천하나요?');
  chat = await sendChat(load.event, chat, '제가 확인해야 할 서류는 무엇인가요?');
  chat = await sendChat(load.event, chat, '다른 공급유형과 비교하면 어떤가요?');
  chat = await sendChat(load.event, chat, '근거가 된 공고문 항목은 무엇인가요?');
  const scheduleQuestions = [
    ['신청은 언제부터 할 수 있어?', '2026.11.16'],
    ['해당 공고 신청은 언제부터할 수있어?', '2026.11.16'],
    ['일반공급 1순위는 언제야?', '2026.11.17'],
    ['특별공급 접수일 알려줘', '2026.11.16'],
    ['당첨자 발표 언제야?', '2026.11.24'],
  ] as const;
  for (const [question, expected] of scheduleQuestions) {
    chat = await sendChat(load.event, chat, question);
    assert.match(chat.messages.at(-1)?.text ?? '', new RegExp(expected.replaceAll('.', '\\.')));
    assert.doesNotMatch(chat.messages.at(-1)?.text ?? '', /가장 앞선 신청유형/);
  }
  for (const message of chat.messages) {
    assert.ok(!containsRawKey(message.text), message.text);
    for (const detail of message.detail ?? []) assert.ok(!containsRawKey(detail), detail);
  }
  assert.equal(context?.schedule?.winnerAnnouncement, '2026-11-24');
});
