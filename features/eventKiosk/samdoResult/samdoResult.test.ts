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
    const expectedAlternatives = [...viaScreen.alternatives, ...viaScreen.lowerPriorityTypes].map(item => item.supplyType).filter(type => type !== view.hero.supplyType);
    assert.deepEqual(view.alternatives.map(card => card.supplyType), expectedAlternatives, `${persona.personaId}: alternatives keep engine order`);
    assert.deepEqual(view.rejected.map(item => item.supplyType), viaScreen.rejectedTypes.map(item => item.supplyType));
  }
});

test('newborn family: hero recommends newborn priority with official score, 3–5 reasons, no raw keys', () => {
  const view = buildSamdoResultView(samdoRecommendationForAnswers(answersOf('NEWLYWED_ONE_CHILD')));
  assert.equal(view.hero.kind, 'recommended');
  assert.equal(view.hero.supplyType, 'NEWBORN');
  assert.match(view.hero.headline, /^신생아 특별공급 우선공급을 먼저 검토하세요$/);
  assert.deepEqual(view.hero.chips.map(chip => chip.label), ['신청 가능', '1단계 우선공급(70%)', '공식 가점 10/12점', '접수 10월 12일(월)']);
  assert.ok(view.why.length >= 3 && view.why.length <= 5, view.why.join('|'));
  assert.ok(view.why.some(line => /자녀/.test(line)) && view.why.some(line => /소득/.test(line)) && view.why.some(line => /거주/.test(line)));
  assert.ok(view.schedule.find(row => row.id === 'special')!.highlight);
  const texts = [view.title, view.subtitle, view.hero.headline, view.hero.body, ...view.why, ...view.documents, ...view.notes,
    ...view.alternatives.flatMap(card => [card.title, card.stage, card.status.label, ...card.strengths, ...card.checks]), ...view.rejected.map(item => item.reason)];
  for (const text of texts) assert.ok(!containsRawKey(text), text);
});

test('supply counts are never presented as a probability', () => {
  for (const persona of personas) {
    const view = buildSamdoResultView(samdoRecommendationForAnswers(persona.finalAnswers));
    const all = JSON.stringify(view);
    assert.ok(!/확률\s*\d|경쟁률|당첨\s*가능성이\s*높/.test(all), persona.personaId);
    assert.ok(view.notes.some(line => line.includes('당첨 가능성을 뜻하지 않아요')));
    for (const card of view.alternatives) assert.match(card.supplyCount, /^공급 \d+세대$/);
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

test('helpers: dates, strengths and failure sentences', () => {
  assert.equal(formatSamdoDate('2026-10-12'), '10월 12일(월)');
  assert.equal(formatSamdoDate('2026-10-14'), '10월 14일(수)');
  assert.equal(failedSentence('만 19~39세'), "'만 19~39세' 조건을 충족하지 못했어요.");
  assert.equal(failedSentence('공고일 현재 제주 거주자가 아니에요.'), '공고일 현재 제주 거주자가 아니에요.');
  const rec = samdoRecommendationForAnswers(answersOf('NEWLYWED_COUPLE'));
  for (const line of pickStrengths(rec.recommendedType!, 5)) assert.ok(!/검토 메모|확인 필요/.test(line), line);
});

test('QR payload uses the existing v1 session contract and carries no personal data', () => {
  for (const persona of personas) {
    const recommendation = samdoRecommendationForAnswers(persona.finalAnswers);
    const summary = buildSamdoQrSummary({ eventId: load.event.config.id, date: '2026-10-11', recommendation, view: buildSamdoResultView(recommendation) });
    assert.ok(isValidResultSummary(summary), persona.personaId);
    assert.equal(summary.recommended[0]?.supply ?? null, recommendation.recommendedType?.supplyLabel ?? recommendation.alternatives[0]?.supplyLabel ?? recommendation.lowerPriorityTypes[0]?.supplyLabel ?? null);
  }
});
