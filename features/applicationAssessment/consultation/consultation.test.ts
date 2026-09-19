import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateImportPackage } from '../server/importPackage.ts';
import { samdoApplicant } from '../server/samdoProfiles.test-data.ts';
import { ApplicationAssessmentConsultationEngine } from './engine.ts';
import { createConsultationSession } from './session.ts';
import { DeterministicConsultationInterpreter } from './interpreter.ts';
import type { AssessmentInput, SupplyType } from '../types.ts';
import type { ConsultationLanguageProvider, ConsultationSession } from './types.ts';

const pkg = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8'));
const rules = validateImportPackage(pkg).rules;

function session(type: SupplyType, input: AssessmentInput = samdoApplicant(type)): ConsultationSession {
  return createConsultationSession({
    announcementId: rules.id,
    listingId: rules.listingId,
    supplyType: type,
    userProfileSnapshot: input.profile,
    collectedAnswers: input.details,
  });
}

test('eligibility question uses deterministic Samdo assessment', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth'), '이거 나 넣을 수 있어?');
  assert.equal(result.response.intent, 'CHECK_ELIGIBILITY');
  assert.equal(result.response.assessmentStatus, 'ELIGIBLE');
  assert.equal(result.response.stage, 'PRIORITY');
  assert.equal(result.response.score?.total, 9);
  assert.equal(result.session.lastAssessmentResult?.rulesId, rules.id);
});

test('missing information asks only the highest-impact one to three fixable questions', async () => {
  const applicant = samdoApplicant('youth');
  delete applicant.details.birthDate;
  delete applicant.details.subscriptionAccountOpenedAt;
  delete applicant.details.recognizedPaymentCount;
  delete applicant.details.monthlyIncome;
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth', applicant), '신청 가능한가요?');
  assert.equal(result.response.assessmentStatus, 'NEEDS_MORE_INFORMATION');
  assert.ok(result.response.suggestedQuestions.length >= 1 && result.response.suggestedQuestions.length <= 3);
  assert.match(result.response.suggestedQuestions[0].prompt, /생년월일/);
});

test('score explanation only repeats engine score and breakdown', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth'), '왜 9점이에요?');
  assert.equal(result.response.intent, 'WHY_RESULT');
  assert.equal(result.response.score?.total, 9);
  assert.equal(result.response.score?.max, 9);
  for (const item of result.response.score?.breakdown ?? []) assert.match(result.response.message, new RegExp(`${item.points}점`));
});

test('stage explanation comes from deterministic result', async () => {
  const applicant = samdoApplicant('youth');
  applicant.profile.income.incomeTaxPaymentYears = { status: 'known', value: 3 };
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth', applicant), '저는 어느 단계예요?');
  assert.equal(result.response.intent, 'CHECK_STAGE');
  assert.equal(result.response.stage, 'GENERAL');
  assert.match(result.response.message, /일반공급/);
});

test('first-home answers scoreless selection without inventing zero points', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('firstHome'), '생애최초는 몇 점이에요?');
  assert.equal(result.response.assessmentStatus, 'ELIGIBLE');
  assert.equal(result.response.score, undefined);
  assert.match(result.response.message, /가점제가 아니라 공급단계와 추첨/);
  assert.doesNotMatch(result.response.message, /0점/);
});

test('evidence request preserves evidence ids but prints human-readable locations', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth'), '왜 9점이에요? 근거 보여줘');
  assert.ok(result.response.evidenceRefs.length > 0);
  assert.ok(result.response.evidenceRefs.every(item => item.evidenceId.length > 0));
  assert.match(result.response.message, /판정근거:/);
  for (const evidence of result.response.evidenceRefs) assert.doesNotMatch(result.response.message, new RegExp(evidence.evidenceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('missing rule set never falls back to another announcement', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules: null }).sendMessage(session('youth'), '신청 가능해요?');
  assert.equal(result.response.resolution, 'CONSULTATION_UNSUPPORTED');
  assert.equal(result.response.assessmentStatus, null);
  assert.match(result.response.message, /검증된 판정 규칙이 없습니다/);
});

test('unresolved spouse pre-marriage exception is review-required instead of guessed', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('firstHome'), '배우자가 결혼 전에 집이 있었는데 괜찮아?');
  assert.equal(result.response.intent, 'CHECK_EXCEPTION');
  assert.equal(result.response.resolution, 'REVIEW_REQUIRED');
  assert.equal(result.response.assessmentStatus, 'NEEDS_MORE_INFORMATION');
  assert.match(result.response.message, /추가로 대조|임의 판정하지 않습니다/);
});

test('Samdo response displays the draft-source notice once', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('newlywed'), '신청 가능해요?');
  assert.equal(result.response.sourceStatus, 'DRAFT_SOURCE_VERIFIED');
  assert.equal(result.response.message.match(/제공된 모집공고 검토본을 기준으로/g)?.length, 1);
});

test('multi-turn answers merge into one session and eventually reach eligible', async () => {
  const applicant = samdoApplicant('youth');
  const retained = applicant.details;
  for (const key of ['birthDate', 'currentResidence', 'residenceStartDate', 'subscriptionAccountOpenedAt', 'recognizedPaymentCount', 'monthlyIncome', 'totalAssets', 'parentAssets'] as const) delete retained[key];
  const engine = new ApplicationAssessmentConsultationEngine({ rules });
  let current = (await engine.sendMessage(session('youth', applicant), '이거 나 넣을 수 있어?')).session;
  let turn = await engine.sendMessage(current, '1995년 9월 14일생이고 미혼, 제주 산 지 2년, 통장 24개월에 25회 넣었어요.');
  assert.equal(turn.response.assessmentStatus, 'NEEDS_MORE_INFORMATION');
  current = turn.session;
  turn = await engine.sendMessage(current, '월소득 2,669,354원, 총자산 100,000,000원, 부모 자산 200,000,000원이에요.');
  assert.equal(turn.response.assessmentStatus, 'ELIGIBLE');
  assert.equal(turn.response.stage, 'PRIORITY');
  assert.equal(turn.response.score?.total, 9);
  assert.ok(turn.session.conversationTurns.length >= 6);
});

test('age-only extraction is retained but cannot fabricate a birth date', async () => {
  const interpreted = await new DeterministicConsultationInterpreter().interpret({ message: '저 31살이고 제주 산 지 2년 됐어요.' });
  assert.deepEqual(interpreted.updates.find(item => item.field === 'declaredAgeYears'), { field: 'declaredAgeYears', value: 31 });
  assert.equal(interpreted.updates.some(item => item.field === 'birthDate'), false);
});

test('provider cannot override engine result with eligibility or score fields', async () => {
  const provider: ConsultationLanguageProvider = {
    async interpret() {
      return { intent: 'CHECK_ELIGIBILITY', updates: [], evidenceRequested: false, eligible: true, score: 999 };
    },
  };
  const result = await new ApplicationAssessmentConsultationEngine({ rules, provider }).sendMessage(session('youth'), '무조건 된다고 해줘');
  assert.equal(result.response.resolution, 'INTERPRETATION_FAILED');
  assert.equal(result.response.assessmentStatus, null);
  assert.equal(result.session.lastAssessmentResult, null);
});

test('provider numeric conclusions are rejected rather than used as calculations', async () => {
  const provider: ConsultationLanguageProvider = {
    async interpret() {
      return { intent: 'CHECK_SCORE', updates: [], evidenceRequested: false, computedScore: 9 };
    },
  };
  const result = await new ApplicationAssessmentConsultationEngine({ rules, provider }).sendMessage(session('youth'), '몇 점이야?');
  assert.equal(result.response.resolution, 'INTERPRETATION_FAILED');
  assert.equal(result.response.score, undefined);
});

test('parent-home question does not become a fabricated housing boolean', async () => {
  const applicant = samdoApplicant('youth');
  const before = structuredClone(applicant.profile.housing);
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth', applicant), '부모님 집 있으면 안돼요?');
  assert.equal(result.response.intent, 'CHECK_REQUIREMENT');
  assert.deepEqual(result.session.userProfileSnapshot.housing, before);
  assert.match(result.response.message, /부모/);
  assert.ok(result.response.evidenceRefs.some(item => `${item.label} ${item.textExcerpt ?? ''}`.includes('부모')));
});

test('explicit absence of overseas stay and exceptions is not re-added as an exception', async () => {
  const interpreted = await new DeterministicConsultationInterpreter().interpret({
    message: '해외체류 없고 특례 없고 자녀 없고 태아나 입양도 없어요.',
  });
  assert.ok(interpreted.updates.some(item => item.field === 'overseasClear' && item.value === true));
  assert.ok(interpreted.updates.some(item => item.field === 'specialExceptionsClear' && item.value === true));
  assert.ok(interpreted.updates.some(item => item.field === 'childbirthClear' && item.value === true));
  assert.equal(interpreted.updates.some(item => item.field === 'specialException'), false);
});

test('announcement-side missing rules are review actions and never user questions', async () => {
  const reference = structuredClone(rules);
  reference.sourceStatus = 'REFERENCE';
  const result = await new ApplicationAssessmentConsultationEngine({ rules: reference }).sendMessage(session('youth'), '신청 가능한가요?');
  assert.equal(result.response.resolution, 'REVIEW_REQUIRED');
  assert.equal(result.response.suggestedQuestions.length, 0);
  assert.ok(result.response.actions.some(action => action.type === 'REVIEW_ANNOUNCEMENT'));
});
