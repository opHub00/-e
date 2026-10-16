import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { buildSamdoDualAssessment } from '../samdoDual/evaluate.ts';
import { getUnresolvedAssessmentFacts } from '../samdoDual/unresolved.ts';
import { samdoInputFromAnswers } from '../samdoResult/samdoInput.ts';
import {
  buildCopilotSummary, copilotIntent, copilotOpenItems, copilotProgress, copilotRecommendationGroups, copilotRecommendationText, copilotWhatIf, nextCopilotQuestion, unknownLabelFor, WHAT_IF_FACTS,
} from './copilotModel.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const answersOf = (id: string) => evaluatePhase4Personas(load.event).find(item => item.personaId === id)!.finalAnswers;

test('summary counts come from the dual engine result for both districts', () => {
  const answers = answersOf('NEWLYWED_ONE_CHILD');
  const dual = buildSamdoDualAssessment(samdoInputFromAnswers(answers));
  const summary = buildCopilotSummary(dual, {});
  const auto = dual.districts.flatMap(d => d.recommendation.evaluations.filter(item => item.autoRecommend));
  assert.equal(summary.eligible, auto.filter(item => item.eligibility === 'ELIGIBLE').length);
  assert.equal(summary.difficult, auto.filter(item => item.eligibility === 'INELIGIBLE').length);
  assert.equal(summary.districts.length, 2);
  assert.ok(!/%|확률|가능성|점수 \d/.test(JSON.stringify(summary)), 'no probability-like wording');
});

test('next question follows the engine order and never re-asks an unknown or deferred fact', () => {
  const answers = answersOf('NEWLYWED_ONE_CHILD');
  const dual = buildSamdoDualAssessment(samdoInputFromAnswers(answers));
  const first = nextCopilotQuestion(dual, {});
  const engineFirst = getUnresolvedAssessmentFacts(dual, {}).find(fact => fact.state !== 'DOES_NOT_KNOW');
  assert.equal(first?.factId, engineFirst?.factKey);
  assert.ok(first!.why.length > 10 && first!.help.length > 5);
  const dnk = Object.fromEntries(first!.answerKeys.map(key => [key, 'DOES_NOT_KNOW' as const]));
  assert.notEqual(nextCopilotQuestion(dual, dnk)?.factId, first!.factId, 'DOES_NOT_KNOW is not asked again');
  assert.notEqual(nextCopilotQuestion(dual, {}, [first!.factId])?.factId, first!.factId, 'deferred is not asked again');
  const progress = copilotProgress(dual, dnk);
  assert.equal(progress.unknown, getUnresolvedAssessmentFacts(dual, dnk).filter(fact => fact.state === 'DOES_NOT_KNOW').length);
});

test('DOES_NOT_KNOW wording matches the questionnaire policy', () => {
  assert.equal(unknownLabelFor('paymentCount', 'NUMBER'), '정확히 몰라요');
  assert.equal(unknownLabelFor('marriageDate', 'DATE'), '정확한 날짜를 몰라요');
  assert.equal(unknownLabelFor('residenceMonths', 'NUMBER'), '정확한 기간을 몰라요');
  assert.equal(unknownLabelFor('specialSupplyHistory', 'BOOLEAN'), '기억나지 않아요');
  assert.equal(unknownLabelFor('reWinningRestriction', 'BOOLEAN'), '확인해 봐야 해요');
});

test('what-if runs on a copy: original answers stay untouched', () => {
  const answers = answersOf('YOUNG_SINGLE');
  const snapshot = JSON.stringify(answers);
  const result = copilotWhatIf(answers, WHAT_IF_FACTS[0], 6);
  assert.equal(JSON.stringify(answers), snapshot);
  assert.equal(result.assumption, '청약통장 인정 납입횟수 6회');
  assert.equal(result.rows.length, 2);
  const lowered = copilotWhatIf(answers, WHAT_IF_FACTS[0], 0);
  assert.ok(lowered.rows.some(row => row.changed || row.noLongerEligible.length), 'a real change shows up as a diff');
});

test('recommendation groups separate 추천 / 확인 필요 / 신청 어려움 per district', () => {
  const dual = buildSamdoDualAssessment(samdoInputFromAnswers(answersOf('YOUNG_SINGLE')));
  const groups = copilotRecommendationGroups(dual);
  assert.deepEqual(groups.map(group => group.label), ['1지구', '2지구']);
  for (const group of groups) for (const label of group.recommended) assert.ok(!group.difficult.includes(label));
  const summary = buildCopilotSummary(dual, {});
  assert.equal(groups.reduce((sum, group) => sum + group.recommended.length, 0), summary.eligible, 'groups agree with the summary counts');
  assert.equal(groups.reduce((sum, group) => sum + group.review.length, 0), summary.review);
  assert.equal(groups.reduce((sum, group) => sum + group.difficult.length, 0), summary.difficult);
  const text = copilotRecommendationText(groups);
  assert.match(text, /^1지구: /m);
  assert.match(text, /^2지구: /m);
  assert.ok(!/%|확률|가능성/.test(text));
});

test('open items list facts left as unknown or deferred so "first task" never claims everything is done', () => {
  const answers = answersOf('NEWLYWED_ONE_CHILD');
  const dual = buildSamdoDualAssessment(samdoInputFromAnswers(answers));
  const first = nextCopilotQuestion(dual, {})!;
  const dnk = Object.fromEntries(first.answerKeys.map(key => [key, 'DOES_NOT_KNOW' as const]));
  assert.deepEqual(copilotOpenItems(dual, dnk).unknown, [first.title]);
  assert.deepEqual(copilotOpenItems(dual, {}, [first.factId]).deferred, [first.title]);
});

test('conversation commands map to Copilot actions; content questions go to the server', () => {
  const cases: Array<[string, string]> = [
    ['나한테 맞는 청약 찾아줘', 'RECOMMEND'],
    ['내가 아직 안 알려준 것만 물어봐', 'ASK_PENDING'],
    ['왜 이걸 먼저 물어봐?', 'WHY'],
    ['잘 모르겠어', 'DOES_NOT_KNOW'],
    ['나중에 답할게', 'LATER'],
    ['청약통장이 6회가 되면?', 'WHAT_IF'],
    ['내가 지금 가장 먼저 해야 할 일은?', 'FIRST_TASK'],
    ['신청은 언제부터 할 수 있어?', 'SERVER'],
  ];
  for (const [text, kind] of cases) assert.equal(copilotIntent(text).kind, kind, text);
  const whatIf = copilotIntent('청약통장이 6회가 되면?');
  assert.ok(whatIf.kind === 'WHAT_IF' && whatIf.value === 6);
});

test('Copilot UI never shows probability-like recommendation wording', () => {
  const source = readFileSync(new URL('CopilotPanel.tsx', import.meta.url), 'utf8') + readFileSync(new URL('copilotModel.ts', import.meta.url), 'utf8');
  assert.ok(!/추천 점수|가능성 높|당첨 가능성이 (높|낮)|\d+%/.test(source));
  const panel = readFileSync(new URL('CopilotPanel.tsx', import.meta.url), 'utf8');
  assert.ok(!/label="[^"]*적용[^"]*"/.test(panel), 'no apply-to-my-profile button for what-if');
});
