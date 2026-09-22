import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateImportPackage } from '../server/importPackage.ts';
import { samdoApplicant } from '../server/samdoProfiles.test-data.ts';
import { ApplicationAssessmentConsultationEngine } from './engine.ts';
import { classifyConsultationUtterance, DeterministicConsultationInterpreter, normalizeConsultationNumbers } from './interpreter.ts';
import { createConsultationSession } from './session.ts';
import { CONSULTATION_UTTERANCES } from './utterances.fixture.ts';
import { knownField, unknownField } from '../../profile/domain.ts';

const pkg = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8'));
const rules = validateImportPackage(pkg).rules;
const interpreter = new DeterministicConsultationInterpreter();

test('regression dataset covers 50–100 utterances across every category', () => {
  assert.ok(CONSULTATION_UTTERANCES.length >= 50 && CONSULTATION_UTTERANCES.length <= 100, `${CONSULTATION_UTTERANCES.length}`);
  const categories = new Set(CONSULTATION_UTTERANCES.map(item => item.category));
  for (const category of ['POSITIVE', 'NEGATIVE', 'MIXED', 'QUESTION', 'CONDITIONAL', 'AMBIGUOUS', 'DOUBLE_NEGATIVE', 'NUMERIC', 'UNIT', 'COLLOQUIAL']) {
    assert.ok(categories.has(category as never), category);
  }
  assert.equal(new Set(CONSULTATION_UTTERANCES.map(item => item.text)).size, CONSULTATION_UTTERANCES.length, 'duplicate utterance');
});

for (const item of CONSULTATION_UTTERANCES) {
  test(`[${item.category}] ${item.text}`, async () => {
    assert.equal(classifyConsultationUtterance(normalizeConsultationNumbers(item.text)), item.kind, 'classification');
    const { updates } = await interpreter.interpret({ message: item.text });
    for (const [field, value] of Object.entries(item.extract)) {
      const found = updates.filter(update => update.field === field);
      assert.ok(found.some(update => update.value === value), `${field}=${JSON.stringify(value)} expected, got ${JSON.stringify(found)} in ${JSON.stringify(updates)}`);
    }
    for (const field of item.forbid) {
      assert.equal(updates.some(update => update.field === field), false, `${field} must not be extracted: ${JSON.stringify(updates)}`);
    }
  });
}

test('hedged, future and hypothetical sentences never produce facts', async () => {
  for (const message of ['아마 미혼일 거예요', '대충 36회 넣은 것 같아요', '내년에 제주로 이사할 계획이에요', '만약 집이 있으면요', '그런 것 같아']) {
    const { updates } = await interpreter.interpret({ message });
    assert.deepEqual(updates, [], message);
  }
});

function session(input = samdoApplicant('youth')) {
  return createConsultationSession({
    announcementId: rules.id, listingId: rules.listingId, supplyType: 'youth',
    userProfileSnapshot: input.profile, collectedAnswers: input.details,
  });
}

test('facts already in the profile are not asked again', async () => {
  const applicant = samdoApplicant('youth');
  delete applicant.details.birthDate;
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session(applicant), '신청 가능한가요?');
  const asked = result.response.suggestedQuestions.map(question => question.key);
  for (const fact of ['maritalStatus', 'noHome', 'neverOwned', 'hasAccount', 'incomeTaxPaymentYears', 'workOrBusinessIncome']) {
    assert.equal(asked.includes(`input:${fact}`), false, `${fact} is known in the profile`);
  }
  assert.ok(asked.includes('input:age'));
});

test('show-profile request lists facts in use without reassessing or saving', async () => {
  const applicant = samdoApplicant('youth');
  applicant.profile.family.marriageStatus = unknownField();
  const saved = structuredClone(applicant.profile);
  const engine = new ApplicationAssessmentConsultationEngine({ rules });
  const first = await engine.sendMessage(session(applicant), '미혼이고 통장 반년 됐어요');
  assert.equal(first.session.userProfileSnapshot.family.marriageStatus.status, 'known');
  const shown = await engine.sendMessage(first.session, '내가 지금 저장한 정보 보여줘');
  assert.equal(shown.response.intent, 'SHOW_PROFILE');
  assert.equal(shown.response.assessmentStatus, null);
  assert.equal(shown.response.score, undefined);
  assert.deepEqual(shown.response.suggestedQuestions, []);
  assert.match(shown.response.message, /프로필에서 가져온 정보/);
  assert.match(shown.response.message, /현재 주택: 무주택/);
  assert.match(shown.response.message, /프로필에는 저장되지 않아요/);
  assert.match(shown.response.message, /혼인 상태: 미혼/);
  assert.match(shown.response.message, /청약통장 가입기간: 6개월/);
  // 판정 결과는 이전 턴 그대로이고, 원래 프로필 객체는 바뀌지 않는다.
  assert.deepEqual(shown.session.lastAssessmentResult, first.session.lastAssessmentResult);
  assert.deepEqual(applicant.profile, saved);
});

test('conversation facts override the session snapshot only', async () => {
  const applicant = samdoApplicant('youth');
  applicant.profile.family.marriageStatus = knownField('married');
  const saved = structuredClone(applicant.profile);
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(session(applicant), '결혼 안 했어요');
  assert.equal(result.session.userProfileSnapshot.family.marriageStatus.status === 'known' && result.session.userProfileSnapshot.family.marriageStatus.value, 'single');
  assert.deepEqual(applicant.profile, saved);
  assert.ok(result.session.conversationFactKeys?.includes('marriageStatus'));
});

test('first-home stays scoreless after natural-language facts', async () => {
  const result = await new ApplicationAssessmentConsultationEngine({ rules }).sendMessage(
    createConsultationSession({ announcementId: rules.id, listingId: rules.listingId, supplyType: 'firstHome', userProfileSnapshot: samdoApplicant('firstHome').profile, collectedAnswers: samdoApplicant('firstHome').details }),
    '집 가져본 적 없고 소득세 5년 냈어요. 몇 점이에요?',
  );
  assert.equal(result.response.score, undefined);
  assert.doesNotMatch(result.response.message, /(^|\s)0\s*(\/\s*\d+\s*)?점/);
});
