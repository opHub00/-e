import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doesNotKnowPersona } from '../../eventKiosk/phase4Personas.ts';
import { SAMDO_PERSONAS } from '../../eventKiosk/samdo/personas.test-data.ts';
import { samdoInputFromAnswers } from '../../eventKiosk/samdoResult/samdoInput.ts';
import { noticePlatform } from '../../eventKiosk/noticePlatform/index.ts';
import { getNextBestQuestion, explainQuestionPriority } from './nextQuestion.ts';
import { authorizeCopilotPlan, planCopilotAction } from './planner.ts';
import { buildNoticeComparisonViewModel } from './presentation.ts';
import { runCopilotTurn } from './service.ts';
import { runCopilotSimulation } from './simulation.ts';
import type { CopilotMessage } from './types.ts';

function unknownProfile() {
  return { ...samdoInputFromAnswers(doesNotKnowPersona.answers), answerStates: doesNotKnowPersona.answerStates };
}

test('A-D Copilot asks only the highest-impact unresolved fact and never repeats unknown/answered aliases', () => {
  const profile = unknownProfile(), assessments = noticePlatform.assessNotices(profile, ['samdo-1', 'samdo-2']);
  assert.equal(planCopilotAction('나한테 맞는 청약 찾아줘', [], ['samdo-1', 'samdo-2']).plan, 'RUN_ASSESSMENT');
  const first = getNextBestQuestion({ profile, assessments, conversation: [] });
  assert.ok(first);
  assert.ok(first.affectedNoticeIds.length >= 1);
  assert.match(explainQuestionPriority(first), /먼저 확인해요/);
  const conversation: CopilotMessage[] = [
    { role: 'assistant', text: first.question, plan: 'ASK_FOLLOWUP', factId: first.factId },
    { role: 'user', text: '잘 모르겠어' },
  ];
  const second = getNextBestQuestion({ profile, assessments, conversation });
  assert.notEqual(second?.factId, first.factId);
  const skipped = second ? [...conversation, { role: 'assistant' as const, text: second.question, plan: 'ASK_FOLLOWUP' as const, factId: second.factId }, { role: 'user' as const, text: '그건 나중에 확인할게' }] : conversation;
  const third = getNextBestQuestion({ profile, assessments, conversation: skipped });
  assert.notEqual(third?.factId, second?.factId);
  assert.equal(assessments.flatMap(item => item.unresolvedFacts).some(item => item.state === 'DOES_NOT_KNOW'), true);
});

test('planner covers unresolved-only, why, what-if, comparison and next action conversations', () => {
  const cases = [
    ['내가 아직 안 알려준 것만 물어봐', 'ASK_FOLLOWUP'], ['왜 그걸 먼저 물어봐?', 'EXPLAIN_RESULT'],
    ['청약통장이 6회가 되면?', 'RUN_SIMULATION'], ['다른 공고도 비교해줘', 'COMPARE_NOTICES'],
    ['내가 지금 가장 먼저 해야 할 일은?', 'ASK_FOLLOWUP'], ['준비서류 근거 알려줘', 'RETRIEVE_EVIDENCE'],
  ] as const;
  for (const [question, expected] of cases) { const plan = planCopilotAction(question, [], ['samdo-1', 'samdo-2']); assert.equal(plan.plan, expected); assert.equal(authorizeCopilotPlan(plan), true); }
});

test('planner carries six recent turns and routes qualification, district comparison and recommendation paraphrases', () => {
  const cases = [
    ['내가 어떤걸 더 준비하면 좋을까?', 'ASK_FOLLOWUP'],
    ['내가 대비하거나, 더 채워야하는 조건은 없어?', 'ASK_FOLLOWUP'],
    ['내 조건에서 뭐가 부족해?', 'ASK_FOLLOWUP'],
    ['내가 뭘 더 갖춰야 해?', 'ASK_FOLLOWUP'],
    ['내가 지금 어떤 지구를 신청하는게 유리할까?', 'COMPARE_NOTICES'],
    ['어디 넣는 게 나아?', 'COMPARE_NOTICES'],
    ['둘 중 뭐가 더 좋아?', 'COMPARE_NOTICES'],
    ['지금 지원하면 어디가 제일 맞아?', 'COMPARE_NOTICES'],
    ['내가 지금 신청하면 좋은 공고는 어떤거야?', 'RUN_ASSESSMENT'],
    ['나한테 제일 맞는 공고 알려줘', 'RUN_ASSESSMENT'],
  ] as const;
  for (const [question, expected] of cases) assert.equal(planCopilotAction(question).plan, expected, question);
  const history: CopilotMessage[] = [
    { role: 'user', text: cases[1][0] },
    { role: 'assistant', text: '신청 준비사항인가요, 자격조건인가요?', plan: 'ASK_FOLLOWUP' },
  ];
  assert.equal(planCopilotAction('그니까 자격 조건?', history).plan, 'ASK_FOLLOWUP');
  assert.equal(planCopilotAction('그니까 그 조건?', history).plan, 'ASK_FOLLOWUP');
  history.push({ role: 'user', text: '그니까 자격 조건?' }, { role: 'assistant', text: '확인할 조건을 알려드릴게요.', plan: 'ASK_FOLLOWUP' });
  assert.equal(planCopilotAction('내가 지금 어떤 지구를 신청하는게 유리할까?', history).plan, 'COMPARE_NOTICES');
  history.push({ role: 'user', text: '내가 지금 신청하면 좋은 공고는 어떤거야?' }, { role: 'assistant', text: '현재 입력 기준 추천을 설명할게요.', plan: 'RUN_ASSESSMENT' });
  assert.equal(planCopilotAction('왜 그게 나한테 더 나아?', history).plan, 'EXPLAIN_RESULT');
});

test('what-if evaluates a clone and leaves baseline input unchanged', () => {
  const profile = structuredClone(SAMDO_PERSONAS.find(item => item.id === 'young-single-20s')!.input);
  profile.details.recognizedPaymentCount = undefined;
  const before = structuredClone(profile);
  const result = runCopilotSimulation(noticePlatform, profile, ['samdo-1', 'samdo-2'], [{ path: 'details.recognizedPaymentCount', value: 6 }]);
  assert.deepEqual(profile, before);
  assert.equal(result.baseline.length, 2);
  assert.equal(result.simulatedResult.length, 2);
  assert.ok(result.diffs.every(item => item.noticeId === 'samdo-1' || item.noticeId === 'samdo-2'));
  assert.throws(() => runCopilotSimulation(noticePlatform, profile, ['samdo-1'], [{ path: 'profile.birthDate', value: '2000-01-01' }]), /SIMULATION_OVERRIDE_NOT_ALLOWED/);
});

test('generic comparison view exposes recommendation semantics without probability claims', () => {
  const assessments = noticePlatform.assessNotices(SAMDO_PERSONAS[0].input, ['samdo-1', 'samdo-2']);
  const view = buildNoticeComparisonViewModel(noticePlatform, assessments);
  assert.equal(view.notices.length, 2);
  assert.deepEqual(view.orderedNoticeIds.slice().sort(), ['samdo-1', 'samdo-2']);
  assert.match(view.disclaimer, /경쟁률이나 당첨확률을 추정하지 않아요/);
  assert.doesNotMatch(JSON.stringify(view), /factKey|birthDate|monthlyIncome|totalAssets/);
});

test('A-H orchestration produces a safe proactive question, comparison and grounded context', () => {
  const profile = unknownProfile(), noticeIds = ['samdo-1', 'samdo-2'];
  const discover = runCopilotTurn(noticePlatform, { profile, noticeIds, conversation: [], question: '나한테 맞는 청약 찾아줘' });
  assert.equal(discover.plan.plan, 'RUN_ASSESSMENT');
  assert.ok(discover.nextQuestion);
  const onlyUnknown = runCopilotTurn(noticePlatform, { profile, noticeIds, conversation: [], question: '내가 아직 안 알려준 것만 물어봐' });
  assert.equal(onlyUnknown.plan.plan, 'ASK_FOLLOWUP');
  const compare = runCopilotTurn(noticePlatform, { profile, noticeIds, conversation: [], question: '다른 공고도 비교해줘' });
  assert.equal(compare.comparison?.notices.length, 2);
  const evidence = runCopilotTurn(noticePlatform, { profile, noticeIds, conversation: [], question: '준비서류 근거 알려줘' });
  assert.equal(evidence.plan.plan, 'RETRIEVE_EVIDENCE');
  assert.ok(evidence.promptContext.evidence.length > 0);
  const serialized = JSON.stringify(evidence.promptContext);
  for (const key of ['birthDate', 'monthlyIncome', 'totalAssets', 'parentAssets', 'factId', 'qrToken']) assert.doesNotMatch(serialized, new RegExp(key));
});
