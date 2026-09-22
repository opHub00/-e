import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMinimalApplicantProfile, knownField, unknownField } from '../../profile/domain.ts';
import { validateImportPackage } from '../server/importPackage.ts';
import { ApplicationAssessmentConsultationEngine } from './engine.ts';
import { createConsultationSession } from './session.ts';
import type { ConsultationSession } from './types.ts';

// 신혼부부 판정을 판정 폼 없이 상담 채팅만으로 끝낸다. 프로필에 이미 있는 사실만 재사용한다.
const load = (name: string) => validateImportPackage(JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${name}`, import.meta.url), 'utf8'))).rules;
const samdo = load('samdo-2026-v1.7.json');
const godeok = load('lh-godeok-a65bl-2026000438.json');

function profile() {
  const p = createMinimalApplicantProfile({ name: '검증용', age: 31, currentRegion: '서울특별시', preferredRegions: [] });
  p.housing.currentOwnership = knownField('no-home');
  p.housing.previousOwnership = knownField(false);
  p.housing.householdHasHome = knownField(false);
  p.housing.householdDisqualifyingPreviousOwnership = knownField(false);
  p.housing.hasSpecialSupplyRestriction = knownField(false);
  p.subscriptionAccount.hasAccount = knownField(true);
  return p;
}
const start = (rules: typeof samdo, p = profile()) => createConsultationSession({
  announcementId: rules.id, listingId: rules.listingId, supplyType: 'newlywed', userProfileSnapshot: p,
});
async function chat(rules: typeof samdo, messages: string[], p = profile()) {
  const engine = new ApplicationAssessmentConsultationEngine({ rules });
  let session: ConsultationSession = start(rules, p);
  let response;
  for (const message of messages) ({ session, response } = await engine.sendMessage(session, message));
  return { session, response: response!, result: session.lastAssessmentResult! };
}

const SAMDO_ELIGIBLE = [
  '1994년 3월 1일생이에요.', '2025년 3월에 혼인신고했어요.', '아이는 없어요.', '저랑 배우자 둘만 살아요.',
  '제주에 거주한 지 36개월이에요. 해외체류 없어요.', '주택청약종합저축이고 통장 가입 30개월이에요. 36회 납입했어요.',
  '세대 월평균소득은 500만원이고 외벌이예요. 총자산은 1억원이에요.', '특별공급 당첨 이력 없어요. 재당첨 제한 없어요. 특례 해당 없어요.',
];
const GODEOK_ELIGIBLE = [
  '1994년 3월 1일생이에요.', '2024년 9월 11일에 혼인신고했어요.', '아이가 한 명 있고 2022년 5월생이에요.', '세 식구예요.',
  '평택시에 거주한 지 5년이에요. 해외체류 없어요.', '주택청약종합저축이고 통장 가입 3년이에요. 30회 납입했어요.',
  '세대 월평균소득은 700만원이고 외벌이예요. 부동산은 없어요. 차량가액은 2천만원이에요.',
  '특별공급 당첨 이력 없어요. 재당첨 제한 없어요. 특례 해당 없어요.',
];

test('Samdo A: chat-only newlywed reaches ELIGIBLE, priority stage and score', async () => {
  const { result, session } = await chat(samdo, SAMDO_ELIGIBLE);
  assert.equal(result.status, 'ELIGIBLE', JSON.stringify(result.missingInformation));
  assert.equal(result.stage, 'PRIORITY');
  assert.equal(result.score?.total, 9);
  assert.equal(session.collectedAnswers.familyCategory, 'married');
  assert.equal(session.collectedAnswers.marriageDate, '2025-03-01');
  assert.equal(session.collectedAnswers.marriageDateLatest, '2025-03-31');
  assert.equal(session.collectedAnswers.incomeHouseholdSize, 2);
  assert.ok(result.evidence.every(e => !e.id.startsWith('godeok.')));
});

test('Samdo B: chat-only newlywed over the asset limit is INELIGIBLE', async () => {
  const { result } = await chat(samdo, [...SAMDO_ELIGIBLE, '총자산은 5억원이에요.']);
  assert.equal(result.status, 'INELIGIBLE');
  assert.ok(result.failedConditions.some(c => c.ruleId === 'newlywed.assets'));
});

test('Samdo C: family type alone needs more information and asks marriage/children first', async () => {
  const { result, response } = await chat(samdo, ['신혼부부예요.', '신청 가능한가요?']);
  assert.equal(result.status, 'NEEDS_MORE_INFORMATION');
  const prompts = response.suggestedQuestions.map(q => q.prompt);
  assert.ok(prompts.some(p => /혼인신고일/.test(p)), prompts.join(' | '));
  assert.ok(prompts.some(p => /생년월일/.test(p)), prompts.join(' | '));
  assert.ok(!prompts.some(p => /가족 유형|신혼부부·예비신혼부부·한부모/.test(p)), 'family type already answered');
});

test('Godeok A: chat-only newlywed reaches ELIGIBLE with the announcement score table', async () => {
  const { result } = await chat(godeok, GODEOK_ELIGIBLE);
  assert.equal(result.status, 'ELIGIBLE', JSON.stringify(result.missingInformation));
  assert.equal(result.stage, 'PRIORITY');
  assert.equal(result.score?.total, 10);
  assert.equal(result.score?.max, 13);
  const items = Object.fromEntries(result.score!.breakdown.map(b => [b.ruleId, b]));
  assert.equal(items['newlywed.PRIORITY.marriageScore'].points, 3);
  assert.equal(items['newlywed.PRIORITY.childAgeScore'].points, 0);
  assert.equal(items['newlywed.PRIORITY.childAgeScore'].max, 0, 'single-parent item is not applicable for a married couple');
  assert.equal(items['newlywed.PRIORITY.childrenScore'].points, 1);
  assert.ok(result.evidence.every(e => e.id.startsWith('godeok.a65bl.')));
});

test('Godeok B: chat-only newlywed over the real-estate limit is INELIGIBLE', async () => {
  const { result } = await chat(godeok, [...GODEOK_ELIGIBLE, '부동산은 3억원이에요.']);
  assert.equal(result.status, 'INELIGIBLE');
  assert.deepEqual(result.failedConditions.map(c => c.ruleId), ['newlywed.realEstate']);
});

test('Godeok C: a marriage duration that straddles a score band asks for the exact date', async () => {
  const messages = GODEOK_ELIGIBLE.map(m => m.startsWith('2024년 9월 11일') ? '결혼한 지 3년 됐어요.' : m);
  const { result, response } = await chat(godeok, messages);
  assert.equal(result.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(result.missingInformation.includes('input:newlywedMarriageScoreMonths'));
  assert.ok(response.suggestedQuestions.some(q => /혼인신고일/.test(q.prompt)));
  // 7년 이내라는 자격은 기간만으로 확정된다.
  assert.ok(result.satisfiedConditions.some(c => c.ruleId === 'newlywed.family'));
});

test('Godeok single parent: marriage item is not applicable, child age scores by birth month', async () => {
  const p = profile();
  const messages = GODEOK_ELIGIBLE.filter(m => !/혼인신고|아이가 한 명/.test(m));
  const { result } = await chat(godeok, ['한부모 가정입니다.', '아이가 한 명 있고 2022년 5월생이에요.', '두 식구예요.', ...messages.filter(m => m !== '세 식구예요.')], p);
  assert.equal(result.status, 'ELIGIBLE', JSON.stringify(result.missingInformation));
  const items = Object.fromEntries(result.score!.breakdown.map(b => [b.ruleId, b]));
  assert.equal(items['newlywed.PRIORITY.marriageScore'].max, 0);
  assert.equal(items['newlywed.PRIORITY.childAgeScore'].points, 2, '만 4세: 2세 초과 4세 이하');
  assert.equal(result.score?.max, 13);
});

test('conflicting marriage statements leave the date unknown instead of picking one', async () => {
  const { session } = await chat(godeok, ['2024년 9월 11일에 혼인신고했어요.', '결혼한 지 5년 됐어요.']);
  assert.equal(session.collectedAnswers.marriageDate, undefined);
  assert.equal(session.collectedAnswers.marriageDateLatest, undefined);
});

test('child count and birth dates that disagree are not used', async () => {
  const { session } = await chat(godeok, ['아이가 두 명이에요.', '아이는 2022년 5월생이에요.']);
  assert.equal(session.collectedAnswers.children, undefined);
  assert.equal(session.collectedAnswers.declaredChildCount, 2);
});

test('profile facts are reused and chat facts never reach the saved profile', async () => {
  const p = profile();
  p.family.marriageStatus = knownField('married');
  p.family.childrenCount = knownField(1);
  p.family.childBirthYears = knownField([2022]);
  const saved = structuredClone(p);
  const { response, session } = await chat(godeok, ['신청 가능한가요?'], p);
  const prompts = response.suggestedQuestions.map(q => q.prompt).join(' | ');
  assert.doesNotMatch(prompts, /자녀가 있다면/, 'children come from the profile');
  const after = await chat(godeok, ['2024년 9월 11일에 혼인신고했어요.', '세 식구예요.'], p);
  assert.deepEqual(p, saved);
  assert.equal(after.session.userProfileSnapshot.family.childrenCount.status, 'known');
  assert.equal(session.collectedAnswers.children, undefined, 'profile children are read at assessment time, not copied into answers');
});

test('the saved profile children count and years are used only when they agree', async () => {
  const p = profile();
  p.family.childrenCount = knownField(2);
  p.family.childBirthYears = knownField([2022]);
  const { result } = await chat(godeok, ['신혼부부예요.'], p);
  assert.ok(result.missingInformation.some(k => /hasChildUnder7|minorChildren/.test(k)));
  p.family.childrenCount = unknownField();
});
