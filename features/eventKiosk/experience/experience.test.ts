import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildRuleFactInventory } from '../adaptiveAssessment.ts';
import { sendChat, startChat } from '../consult.ts';
import { evaluateEvent } from '../evaluate.ts';
import { kioskEvent } from '../kioskEvent.ts';
import { evaluatePhase4Personas, phase4Personas } from '../phase4Personas.ts';
import { buildSummary } from '../summary.ts';
import { CHAT_INTENTS, experienceAnswer, experienceSuggestedQuestions } from './chatAnswers.ts';
import { evidenceOnlyFacts, explainOutcome, type ListingExplanation } from './explain.ts';
import { containsRawKey, FACT_LABELS, factLabel, humanize, UNKNOWN_FACT_LABEL } from './labels.ts';
import { isRenderableSummary } from './safeSummary.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const event = load.event;
const evidenceOnly = evidenceOnlyFacts(event.dataset);
const finals = evaluatePhase4Personas(event);
const evaluations = finals.map(item => ({ id: item.personaId, evaluation: evaluateEvent(event, item.finalAnswers) }));

/** 화면에 그려지는 문자열만 모은다. status 같은 내부 분기 값은 그리지 않으므로 뺀다. */
function displayed(x: ListingExplanation): string[] {
  return [
    x.verdict.title, x.verdict.body, ...x.reasons, ...x.satisfied, ...x.unmet, ...x.toConfirm, ...x.documents,
    x.priority.label ?? '', x.priority.body, x.score.title, x.score.body,
    ...(x.score.status === 'AVAILABLE' ? x.score.items.map(item => item.label) : []),
    ...(x.score.status === 'PENDING' ? x.score.needs : []),
    ...x.notes, ...x.nextSteps, ...x.sources.flatMap(item => [item.title, item.section]),
  ];
}

test('every fact used by the frozen dataset has a user-facing label', () => {
  const missing = buildRuleFactInventory(event.dataset).map(row => row.factKey).filter(key => !FACT_LABELS[key]);
  assert.deepEqual(missing, []);
});

test('humanize removes machine keys and never echoes them', () => {
  assert.equal(humanize('score.applicantDisabled'), '신청자 등록장애인 여부');
  assert.equal(humanize('확인 필요 · score.applicantDisabled'), '확인 필요 · 신청자 등록장애인 여부');
  assert.equal(humanize('input:age'), '신청자 나이');
  assert.equal(humanize('event.somethingNew'), UNKNOWN_FACT_LABEL);
  assert.equal(humanize('1순위 · NEWLYWED_WITH_CHILD'), '1순위');
  assert.equal(humanize('혼인 상태'), '혼인 상태');
  assert.equal(factLabel('review:household.allNoHome'), '세대 전체 무주택 여부');
  assert.ok(!containsRawKey(humanize('a household.memberCount b PRIORITY_1 c')));
});

test('the raw outcome fields still contain machine keys (why this layer exists)', () => {
  const raw = evaluations.flatMap(({ evaluation }) => evaluation.outcomes.flatMap(outcome => [...outcome.missing, ...outcome.cautions]));
  assert.ok(raw.some(containsRawKey), 'expected at least one raw key in the unsanitized display fields');
});

test('explanations for all personas and supplies show no machine keys', () => {
  for (const { id, evaluation } of evaluations) {
    assert.equal(evaluation.outcomes.length, 9, id);
    for (const outcome of evaluation.outcomes) {
      const x = explainOutcome(outcome, evidenceOnly);
      for (const text of displayed(x)) assert.ok(!containsRawKey(text), `${id} ${outcome.id}: ${text}`);
    }
  }
});

test('verdict matches the engine result and official score states never read as zero', () => {
  for (const { evaluation } of evaluations) {
    for (const outcome of evaluation.outcomes) {
      const x = explainOutcome(outcome, evidenceOnly);
      const eligibility = outcome.result!.eligibility;
      if (eligibility === 'ELIGIBLE') assert.equal(x.verdict.tone, 'good');
      if (eligibility === 'INELIGIBLE') { assert.equal(x.verdict.tone, 'bad'); assert.ok(x.unmet.length > 0); }
      if (x.score.status === 'NOT_APPLICABLE') assert.equal(x.score.title, '해당 없음');
      if (x.score.status === 'PENDING') assert.match(x.score.title, /확인 필요/);
      // 점수가 없는 상태의 제목에는 숫자가 없어야 한다(0점으로 읽히지 않게).
      if (x.score.status !== 'AVAILABLE') assert.ok(!/\d/.test(x.score.title), x.score.title);
    }
  }
});

test('evidence-only facts are shown as documents, not as questions', () => {
  const persona = evaluations.find(item => item.id === 'NEWLYWED_ONE_CHILD')!;
  const withDocs = persona.evaluation.outcomes.map(outcome => explainOutcome(outcome, evidenceOnly)).filter(x => x.documents.length);
  assert.ok(withDocs.length > 0);
  for (const x of withDocs) for (const doc of x.documents) assert.ok(!x.toConfirm.includes(doc));
});

test('chat answers the four suggested intents with this visitor’s result', async () => {
  const persona = phase4Personas.find(item => item.id === 'NEWLYWED_ONE_CHILD')!;
  const final = finals.find(item => item.personaId === persona.id)!;
  const evaluation = evaluateEvent(event, final.finalAnswers);
  const outcome = evaluation.outcomes[0];
  const questions = experienceSuggestedQuestions(outcome);
  for (const question of ['왜 이 공고에 신청할 수 있나요?', '가장 중요한 조건은 무엇인가요?', '제가 확인해야 할 서류는 무엇인가요?', '다른 공급유형과 비교하면 어떤가요?']) {
    assert.ok(questions.includes(question), question);
  }
  let chat = startChat(event, evaluation, outcome);
  for (const question of questions.slice(0, 4)) {
    assert.ok(Object.values(CHAT_INTENTS).some(pattern => pattern.test(question)), question);
    const direct = experienceAnswer(chat, question, evidenceOnly);
    assert.ok(direct, question);
    chat = await sendChat(event, chat, question);
    const reply = chat.messages.at(-1)!;
    for (const text of [reply.text, ...(reply.detail ?? [])]) assert.ok(!containsRawKey(text), `${question}: ${text}`);
  }
  const why = chat.messages[2];
  assert.ok(why.text.includes(outcome.supplyLabel), 'answer names the current supply');
  const compare = chat.messages.at(-1)!;
  assert.ok(compare.text.includes('9개 공급'));
  assert.ok(compare.detail!.some(line => line.startsWith('지금 보는 공급')));
});

test('fallback chat answers are sanitized too', async () => {
  const evaluation = evaluations.find(item => item.id === 'NEWLYWED_ONE_CHILD')!.evaluation;
  const pendingScore = evaluation.outcomes.find(outcome => outcome.result?.officialScore.status === 'PENDING' && outcome.result.officialScore.missingInformation.length)!;
  let chat = startChat(event, evaluation, pendingScore);
  chat = await sendChat(event, chat, '공식 배점은 어떻게 되나요?');
  const reply = chat.messages.at(-1)!;
  for (const text of [reply.text, ...(reply.detail ?? [])]) assert.ok(!containsRawKey(text), text);
});

test('the QR summary carries readable text only and passes the phone-side shape check', () => {
  for (const { evaluation } of evaluations) {
    const summary = buildSummary({ eventId: event.config.id, householdType: 'withChildren', evaluation, favoriteIds: evaluation.outcomes.slice(0, 3).map(item => item.id), evidenceOnly });
    const legacy = buildSummary({ eventId: event.config.id, householdType: 'withChildren', evaluation, favoriteIds: [] });
    for (const text of [...legacy.cautions, ...legacy.recommended.map(item => item.note ?? '')]) assert.ok(!containsRawKey(text), text);
    const texts = [...summary.cautions, ...[...summary.recommended, ...summary.favorites].flatMap(item => [item.note ?? '', item.stage ?? ''])];
    for (const text of texts) assert.ok(!containsRawKey(text), text);
    assert.ok(isRenderableSummary(summary));
  }
  assert.equal(isRenderableSummary(null), false);
  assert.equal(isRenderableSummary({ v: 1, date: '2026-10-29', counts: { eligible: 1 }, recommended: [], favorites: [], cautions: [] }), false);
  assert.equal(isRenderableSummary({ v: 1, date: '2026-10-29', counts: { eligible: 1, review: 0, difficult: 0 }, recommended: [{ title: 1 }], favorites: [], cautions: [] }), false);
});

test('QA persona injection replaces the whole session', async () => {
  const { useKioskStore } = await import('../useKioskStore.ts');
  const store = useKioskStore.getState();
  store.toggleFavorite('something');
  const before = useKioskStore.getState().sessionKey;
  store.qaLoadAnswers(phase4Personas[0].initialAnswers, ['adaptive.eligibleResident']);
  const after = useKioskStore.getState();
  assert.equal(after.sessionKey, before + 1);
  assert.deepEqual(after.favorites, []);
  assert.equal(after.evaluation, null);
  assert.deepEqual(after.answered, ['adaptive.eligibleResident']);
  assert.equal(after.answers.householdType, phase4Personas[0].initialAnswers.householdType);
  after.reset();
});
