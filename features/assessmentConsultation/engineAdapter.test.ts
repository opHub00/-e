import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessApplication } from '../applicationAssessment/engine.ts';
import { validateImportPackage } from '../applicationAssessment/server/importPackage.ts';
import { samdoApplicant } from '../applicationAssessment/server/samdoProfiles.test-data.ts';
import { createMinimalApplicantProfile } from '../profile/domain.ts';
import { createAssessmentConsultationUiEngine, formatProfileFact, mapAssessmentToUi } from './engineAdapter.ts';
import { clearAssessmentConsultationSeedsForTest, readAssessmentConsultationSeed, registerAssessmentConsultationSeed } from './seedStore.ts';

const pkg = JSON.parse(readFileSync(new URL('../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8'));
const rules = validateImportPackage(pkg).rules;

function resultFor(type: 'youth' | 'newlywed' | 'firstHome') {
  const input = samdoApplicant(type);
  return { input, result: assessApplication(rules, input, rules.listingId).find(item => item.supplyType === type)! };
}

test('presentation mapper preserves deterministic status, stage and score', () => {
  const { result } = resultFor('youth');
  const mapped = mapAssessmentToUi(result);
  assert.deepEqual(mapped.score, { total: 9, max: 9 });
  assert.equal(mapped.status, 'ELIGIBLE');
  assert.equal(mapped.stage, 'PRIORITY');
  assert.equal(mapped.scoring, result.scoring);
});

test('first-home remains scoreless instead of becoming zero points', () => {
  const { result } = resultFor('firstHome');
  const mapped = mapAssessmentToUi(result);
  assert.equal(mapped.scoring, 'NOT_APPLICABLE');
  assert.equal(mapped.score, null);
});

test('seed store is bounded, memory-only and returns defensive copies', () => {
  clearAssessmentConsultationSeedsForTest();
  const { input, result } = resultFor('youth');
  const id = registerAssessmentConsultationSeed({ listingId: rules.listingId, supplyType: 'youth', profile: input.profile, answers: input.details, result });
  const first = readAssessmentConsultationSeed(id)!;
  first.result.status = 'INELIGIBLE';
  assert.equal(readAssessmentConsultationSeed(id)?.result.status, 'ELIGIBLE');
  clearAssessmentConsultationSeedsForTest();
  assert.equal(readAssessmentConsultationSeed(id), null);
});

test('seeded session reuses the exact engine result and draft source status', async () => {
  const { input, result } = resultFor('youth');
  const engine = createAssessmentConsultationUiEngine({
    rules, listingId: rules.listingId, profile: input.profile,
    seed: { listingId: rules.listingId, supplyType: 'youth', profile: input.profile, answers: input.details, result },
  });
  const session = await engine.start({ listingId: rules.listingId, seededFrom: 'ASSESSMENT_RESULT' });
  assert.equal(session.sourceStatus, 'DRAFT_SOURCE_VERIFIED');
  assert.equal(session.seededFrom, 'ASSESSMENT_RESULT');
  assert.deepEqual(session.turns[0].assessment?.score, { total: 9, max: 9 });
  assert.ok(session.turns[0].reusedProfileFacts?.length);
});

test('actual engine response maps readable pending labels, actions and evidence', async () => {
  const applicant = samdoApplicant('youth');
  delete applicant.details.birthDate;
  const engine = createAssessmentConsultationUiEngine({ rules, listingId: rules.listingId, profile: applicant.profile });
  const session = await engine.start({ listingId: rules.listingId });
  const turn = await engine.ask({ session, message: '내가 신청 가능해?' });
  assert.equal(turn.assessment?.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(turn.assessment?.pending.length && turn.assessment.pending.length <= 3);
  assert.match(turn.suggestedQuestions?.[0].prompt ?? '', /생년월일/);
  assert.ok(turn.suggestedQuestions && turn.suggestedQuestions.length <= 3);
  assert.ok(turn.actions?.some(action => action.kind === 'OPEN_ASSESSMENT'));
  assert.ok(turn.evidenceRefs?.every(item => item.label && !turn.message.includes(item.id)));
});

test('reused profile labels exclude facts first supplied during the conversation', async () => {
  const profile = createMinimalApplicantProfile({ name: '상담자', age: 31, currentRegion: '제주특별자치도', preferredRegions: [] });
  const engine = createAssessmentConsultationUiEngine({ rules, listingId: rules.listingId, profile });
  const session = await engine.start({ listingId: rules.listingId });
  const turn = await engine.ask({ session, message: '미혼이고 신청 가능한지 궁금해요.' });
  assert.equal(turn.reusedProfileFacts?.some(item => item.startsWith('혼인정보')), false);
});

test('multi-turn UI engine reaches the same eligible score as assessApplication', async () => {
  const applicant = samdoApplicant('youth');
  const engine = createAssessmentConsultationUiEngine({ rules, listingId: rules.listingId, profile: applicant.profile });
  const session = await engine.start({ listingId: rules.listingId });
  let turn = await engine.ask({ session, message: '내가 신청 가능해?' });
  assert.equal(turn.assessment?.status, 'NEEDS_MORE_INFORMATION');
  turn = await engine.ask({ session, message: '1995년 9월 14일생이고 미혼, 제주 산 지 2년, 통장 24개월에 25회 넣었어요.' });
  turn = await engine.ask({ session, message: '월소득 2,669,354원, 총자산 100,000,000원, 부모 자산 200,000,000원이에요.' });
  turn = await engine.ask({ session, message: '주택청약종합저축이고 특별공급 당첨 이력 없고 재당첨 제한 없고 해외체류 없고 특례 없고 자녀 없고 태아나 입양도 없어요.' });
  assert.equal(turn.assessment?.status, 'ELIGIBLE', JSON.stringify(turn.assessment));
  assert.equal(turn.assessment?.stage, 'PRIORITY');
  assert.deepEqual(turn.assessment?.score, { total: 9, max: 9 });
  assert.ok(turn.actions?.some(action => action.kind === 'OPEN_PREPARATION'));
});

test('unresolved exception is presented as review-required without a guessed verdict', async () => {
  const applicant = samdoApplicant('firstHome');
  const reordered = { ...rules, supplies: [rules.supplies.find(item => item.type === 'firstHome')!, ...rules.supplies.filter(item => item.type !== 'firstHome')] };
  const engine = createAssessmentConsultationUiEngine({ rules: reordered, listingId: rules.listingId, profile: applicant.profile });
  const session = await engine.start({ listingId: rules.listingId });
  const turn = await engine.ask({ session, message: '배우자가 결혼 전에 집이 있었는데 괜찮아?' });
  assert.equal(turn.assessment?.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(turn.unresolved?.length);
  assert.match(turn.message, /임의 판정하지 않습니다|추가로 대조/);
});

test('inverse profile facts preserve their real meaning in presentation', () => {
  assert.deepEqual(formatProfileFact('noHome', true), { label: '현재 주택 상태', valueText: '무주택' });
  assert.deepEqual(formatProfileFact('neverOwned', true), { label: '과거 주택소유 이력', valueText: '없음' });
  assert.deepEqual(formatProfileFact('noSpecialRestriction', true), { label: '특별공급 제한', valueText: '없음' });
  assert.deepEqual(formatProfileFact('householdNoHome', true), { label: '세대 주택 상태', valueText: '무주택' });
});

test('missing questions are answer prompts while starter suggestions remain ask actions', async () => {
  const applicant = samdoApplicant('youth');
  delete applicant.details.birthDate;
  const engine = createAssessmentConsultationUiEngine({ rules, listingId: rules.listingId, profile: applicant.profile });
  const session = await engine.start({ listingId: rules.listingId });
  assert.equal(session.turns[0].suggestedQuestions?.[0].interaction, 'ASK');
  const turn = await engine.ask({ session, message: '나 이거 넣을 수 있어?' });
  assert.equal(turn.suggestedQuestions?.[0].interaction, 'ANSWER');
});
