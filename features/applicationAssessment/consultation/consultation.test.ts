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

test('Samdo domain response leaves the one-time draft-source notice to the session UI', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('newlywed'), '신청 가능해요?');
  assert.equal(result.response.sourceStatus, 'DRAFT_SOURCE_VERIFIED');
  assert.equal(result.response.message.includes('제공된 모집공고 검토본을 기준으로'), false);
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

test('requirement questions never become applicant numeric facts', async () => {
  const interpreter = new DeterministicConsultationInterpreter();
  const paymentQuestion = await interpreter.interpret({ message: '24회 이상이면 몇 점이야?' });
  const ageQuestion = await interpreter.interpret({ message: '35살 이하여야 하나요?' });
  const accountQuestion = await interpreter.interpret({ message: '통장 6개월 넘으면 되나요?' });
  assert.equal(paymentQuestion.updates.some(item => item.field === 'recognizedPaymentCount'), false);
  assert.equal(ageQuestion.updates.some(item => item.field === 'declaredAgeYears'), false);
  assert.equal(accountQuestion.updates.some(item => item.field === 'subscriptionDurationMonths'), false);
  assert.equal(paymentQuestion.intent, 'CHECK_SCORE');
  assert.equal(ageQuestion.intent, 'CHECK_REQUIREMENT');
});

test('explicit assertions update facts and mixed questions keep only the applicant clause', async () => {
  const interpreter = new DeterministicConsultationInterpreter();
  const payment = await interpreter.interpret({ message: '저 24회 넣었어요' });
  const age = await interpreter.interpret({ message: '저 35살이에요' });
  const mixed = await interpreter.interpret({ message: '나는 31살인데 39살까지 가능한가요?' });
  assert.deepEqual(payment.updates.filter(item => item.field === 'recognizedPaymentCount'), [{ field: 'recognizedPaymentCount', value: 24 }]);
  assert.deepEqual(age.updates.filter(item => item.field === 'declaredAgeYears'), [{ field: 'declaredAgeYears', value: 35 }]);
  assert.deepEqual(mixed.updates.filter(item => item.field === 'declaredAgeYears'), [{ field: 'declaredAgeYears', value: 31 }]);
});

test('natural child absence is accepted but hypothetical child questions are not facts', async () => {
  const interpreter = new DeterministicConsultationInterpreter();
  for (const message of ['자녀 없어', '아이 없습니다', '애 없어', '임신 아님', '태아 없음']) {
    const interpreted = await interpreter.interpret({ message });
    assert.ok(interpreted.updates.some(item => item.field === 'childbirthClear' && item.value === true), message);
  }
  for (const message of ['자녀 있으면?', '아이 있으면 유리해?']) {
    const interpreted = await interpreter.interpret({ message });
    assert.equal(interpreted.updates.some(item => item.field === 'childbirthClear'), false, message);
  }
});

test('natural why-result phrases are recognized without changing facts', async () => {
  const interpreter = new DeterministicConsultationInterpreter();
  for (const message of ['왜 안돼?', '왜 안 되나요?', '왜 신청 못 해?', '왜 탈락?', '왜 어려워?', '왜 안되는 거야?']) {
    const interpreted = await interpreter.interpret({ message });
    assert.equal(interpreted.intent, 'WHY_RESULT', message);
    assert.deepEqual(interpreted.updates, [], message);
  }
});

test('unknown answer defers the current missing field and advances to another question', async () => {
  const applicant = samdoApplicant('youth');
  delete applicant.details.birthDate;
  delete applicant.details.subscriptionAccountOpenedAt;
  delete applicant.details.recognizedPaymentCount;
  const engine = new ApplicationAssessmentConsultationEngine({ rules });
  const first = await engine.sendMessage(session('youth', applicant), '나 이거 넣을 수 있어?');
  const before = first.response.suggestedQuestions[0].key;
  const second = await engine.sendMessage(first.session, '잘 모르겠어');
  assert.ok(second.session.deferredFields.includes(before));
  assert.notEqual(second.response.suggestedQuestions[0]?.key, before);
  assert.ok(second.response.unresolvedItems?.length);
});

test('positive overseas duration is preserved as review input instead of guessed dates', async () => {
  const interpreted = await new DeterministicConsultationInterpreter().interpret({ message: '해외에 6개월 있었어' });
  assert.ok(interpreted.updates.some(item => item.field === 'specialException' && item.value.includes('6개월')));
  assert.equal(interpreted.updates.some(item => item.field === 'overseasClear'), false);
});

test('evidence is relevant, deduplicated and capped at five', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth'), '필요한 서류와 공고 근거 보여줘');
  assert.ok(result.response.evidenceRefs.length <= 5);
  const locations = result.response.evidenceRefs.map(item => `${item.section}|${item.tableLabel ?? ''}`);
  assert.equal(new Set(locations).size, locations.length);
});

test('supply type changes are announced once and use the selected deterministic result', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session('youth'), '생애최초는 몇 점이야?');
  assert.equal(result.session.supplyType, 'firstHome');
  assert.equal(result.response.supplyType, 'firstHome');
  assert.match(result.response.contextTransition ?? '', /생애최초 특별공급 기준/);
  assert.match(result.response.message, /생애최초 특별공급 기준으로 볼게요/);
  assert.equal(result.response.score, undefined);
});

test('natural negative phrasings are recognised, mixed statements stay fail-closed', async () => {
  const interpreter = new DeterministicConsultationInterpreter();
  const fields = async (message: string) => (await interpreter.interpret({ message })).updates;
  const has = (updates: Awaited<ReturnType<typeof fields>>, field: string, value?: unknown) =>
    updates.some(u => u.field === field && (value === undefined || u.value === value));

  const overseas = await fields('해외체류 이력 없습니다');
  assert.ok(has(overseas, 'overseasClear', true));
  assert.ok(!has(overseas, 'specialException'), '부정 표현을 특례로 오인하지 않는다');

  const overseasMixed = await fields('해외체류 이력 없습니다. 작년에 해외에 4개월 있었어요.');
  assert.ok(!has(overseasMixed, 'overseasClear'), '체류 기간이 섞이면 부정으로 읽지 않는다');
  assert.ok(has(overseasMixed, 'specialException'), '대신 특례 확인으로 보낸다');

  const housing = await fields('주택 소유한 적 없습니다');
  assert.ok(has(housing, 'previousHousingOwnership', false));
  assert.ok(has(housing, 'currentHousingOwnership', 'no-home'));
  assert.ok(has(await fields('집을 소유한 적이 한 번도 없어요'), 'previousHousingOwnership', false));

  const housingMixed = await fields('주택 소유한 적 없는데 지금은 집을 보유 중입니다');
  assert.ok(!has(housingMixed, 'previousHousingOwnership'));
  assert.ok(!has(housingMixed, 'currentHousingOwnership'));
  assert.ok(!has(await fields('주택 소유한 적 없지 않습니다'), 'previousHousingOwnership'), '이중부정은 읽지 않는다');

  assert.ok(has(await fields('특별공급 당첨된 적 없습니다'), 'specialSupplyHistory', false));
  assert.ok(has(await fields('특별공급에 당첨된 적이 없어요'), 'specialSupplyHistory', false));
  assert.ok(!has(await fields('특별공급 당첨된 적 없지 않습니다'), 'specialSupplyHistory'), '이중부정은 읽지 않는다');
});
