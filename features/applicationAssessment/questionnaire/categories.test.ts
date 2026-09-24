import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createMinimalApplicantProfile, knownField, type ApplicantProfileV2 } from '../../profile/domain.ts';
import { validateImportPackage } from '../server/importPackage.ts';
import { assessApplication } from '../engine.ts';
import { parseForm } from '../form.ts';
import { buildFacts } from '../facts.ts';
import { assessmentDetails, profileUpdatesFromAnswers } from './adapter.ts';
import { applyPrefill, buildQuestionnaire, type Answers } from './questions.ts';
import { buildSteps, categoryOf, firstIncompleteStep, CATEGORIES } from './categories.ts';
import { createMemoryDraftStorage, readDraft, writeDraft } from './draft.ts';

const load = (name: string) => validateImportPackage(JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${name}`, import.meta.url), 'utf8'))).rules;
const godeok = load('lh-godeok-a65bl-2026000438.json');
const ASOF = godeok.announcementDate ?? '2026-09-11';
const LISTING = 'apt-2026000438-2026000438';

const profile = (): ApplicantProfileV2 => createMinimalApplicantProfile({ name: '검증용', age: 31, currentRegion: '경기도 평택시', preferredRegions: [] });
const ask = (input: { profile?: ApplicantProfileV2; answers?: Answers; supply?: 'youth' | 'newlywed' | 'firstHome' }) =>
  buildQuestionnaire({ rules: godeok, supply: input.supply ?? 'newlywed', profile: input.profile ?? profile(), answers: input.answers ?? {}, announcementDate: ASOF });
const steps = (input: Parameters<typeof ask>[0]) => buildSteps(ask(input), input.answers ?? {});
const stepNames = (input: Parameters<typeof ask>[0]) => steps(input).map(step => step.category);
const inStep = (input: Parameters<typeof ask>[0], category: string) =>
  (steps(input).find(step => step.category === category)?.questions ?? []).map(question => question.id);

/** 프로필이 어느 정도 채워진 재사용자. */
function savedProfile(): ApplicantProfileV2 {
  const saved = profile();
  saved.basic.birthDate = knownField('1994-07-05');
  saved.family.marriageStatus = knownField('married');
  saved.subscriptionAccount.hasAccount = knownField(true);
  saved.subscriptionAccount.accountMonths = knownField(24);
  saved.household.memberCount = knownField(3);
  saved.housing.currentOwnership = knownField('no-home');
  saved.housing.householdHasHome = knownField(false);
  saved.housing.hasSpecialSupplyRestriction = knownField(false);
  return saved;
}

test('모든 질문은 다섯 카테고리 중 하나에 들어간다', () => {
  const everything = [
    ...ask({}), ...ask({ answers: { familyCategory: 'married', hasAccount: 'yes' } }),
    ...ask({ answers: { familyCategory: 'engaged' } }), ...ask({ answers: { familyCategory: 'singleParent' } }),
    ...ask({ supply: 'firstHome', answers: { hasAccount: 'yes' } }), ...ask({ supply: 'youth' }),
  ];
  assert.ok(everything.length > 0);
  for (const question of everything) assert.ok(CATEGORIES.includes(categoryOf(question)), `${question.id}(${question.section})에 카테고리가 없다`);
});

test('신규 신혼부부 사용자: 단계 순서와 단계별 문항 수', () => {
  const list = steps({});
  assert.deepEqual(list.map(step => step.category), ['기본정보', '주거·주택이력', '청약', '소득·자산', '확인']);
  for (const step of list) assert.ok(step.total <= 5, `${step.category} 단계가 ${step.total}개로 너무 많다`);
  assert.ok(inStep({}, '기본정보').includes('birthDate'));
  assert.ok(inStep({}, '기본정보').includes('familyCategory'));
  assert.ok(inStep({}, '청약').includes('hasAccount'));
  assert.ok(inStep({}, '확인').includes('exceptions'));
});

test('프로필이 채워진 사용자는 같은 단계에서 질문이 줄어든다', () => {
  const saved = savedProfile();
  // 통장 보유 상태를 같게 두고(프로필 vs 답변) 프로필 유무만 비교한다.
  const before = steps({ answers: { familyCategory: 'married', hasAccount: 'yes' } }).reduce((sum, step) => sum + step.total, 0);
  const after = steps({ profile: saved, answers: { familyCategory: 'married' } }).reduce((sum, step) => sum + step.total, 0);
  assert.ok(after < before, `프로필이 있으면 질문이 줄어야 한다 (${before} → ${after})`);
  // 통장 보유는 프로필에 있으므로 다시 묻지 않는다.
  assert.ok(!inStep({ profile: saved, answers: { familyCategory: 'married' } }, '청약').includes('hasAccount'));
  // 프로필에서 채운 값은 기본값으로 들어간다.
  const questions = ask({ profile: saved, answers: { familyCategory: 'married' } });
  const filled = applyPrefill(questions, {});
  assert.equal(filled.birthDate, '1994-07-05');
});

test('통장 없음: 청약 단계에 추가 문항이 숨는다', () => {
  const hidden = inStep({ answers: { hasAccount: 'no' } }, '청약');
  assert.deepEqual(hidden, ['hasAccount'], '보유 여부만 남는다');
  for (const id of ['accountKindEligible', 'subscriptionAccountOpenedAt', 'recognizedPaymentCount']) {
    assert.ok(!hidden.includes(id), `${id}는 숨어야 한다`);
  }
});

test('통장 있음: 같은 청약 단계 안에서 추가 문항이 펼쳐진다', () => {
  const before = inStep({ answers: {} }, '청약');
  const after = inStep({ answers: { hasAccount: 'yes' } }, '청약');
  assert.deepEqual(before, ['hasAccount']);
  assert.ok(after.length > before.length, '같은 단계에서 질문이 늘어난다');
  for (const id of ['accountKindEligible', 'subscriptionAccountOpenedAt', 'recognizedPaymentCount']) assert.ok(after.includes(id));
  // 단계가 늘어나지는 않는다.
  assert.deepEqual(stepNames({ answers: { hasAccount: 'yes' } }), stepNames({ answers: {} }));
});

test('해외체류 있음: 같은 단계에서 거주시작일이 숨는다', () => {
  assert.ok(inStep({ answers: { overseas: 'no' } }, '주거·주택이력').includes('residenceStartDate'));
  assert.ok(!inStep({ answers: { overseas: 'yes' } }, '주거·주택이력').includes('residenceStartDate'));
  assert.deepEqual(stepNames({ answers: { overseas: 'yes' } }), stepNames({ answers: { overseas: 'no' } }));
});

test('프로필에만 있던 사실이 비면 보완 질문이 나온다', () => {
  const asked = inStep({}, '주거·주택이력');
  assert.ok(asked.includes('householdHomeOwnership'), '무주택 여부를 묻는다');
  assert.ok(inStep({}, '확인').includes('specialSupplyRestriction'), '특별공급 제한은 확인 단계에서 묻는다');
  // 혼인 상태는 가족 유형 질문이 대신하므로 중복해서 묻지 않는다.
  assert.ok(!inStep({}, '기본정보').includes('maritalStatus'));
  const noFamilyQuestion = ask({ supply: 'firstHome' }).map(question => question.id);
  assert.ok(noFamilyQuestion.includes('maritalStatus') || !noFamilyQuestion.includes('familyCategory'));
});

test('프로필에 그 사실이 있으면 보완 질문을 묻지 않는다', () => {
  const asked = inStep({ profile: savedProfile(), answers: { familyCategory: 'married' } }, '주거·주택이력');
  assert.ok(!asked.includes('householdHomeOwnership'));
  assert.ok(!inStep({ profile: savedProfile(), answers: { familyCategory: 'married' } }, '확인').includes('specialSupplyRestriction'));
  // 본인이 주택을 가지고 있으면 세대 보유 여부를 더 묻지 않아도 판정할 수 있다.
  const owner = profile();
  owner.housing.currentOwnership = knownField('owns-home');
  assert.ok(!ask({ profile: owner }).map(q => q.id).includes('householdHomeOwnership'));
});

test('보완 질문의 답은 프로필에 저장돼 엔진까지 간다', () => {
  const answers: Answers = { householdHomeOwnership: 'none', specialSupplyRestriction: 'no', maritalStatus: 'married' };
  const { profile: updated, changed } = profileUpdatesFromAnswers(profile(), answers, ASOF);
  assert.deepEqual(updated.housing.currentOwnership, knownField('no-home'));
  assert.deepEqual(updated.housing.householdHasHome, knownField(false));
  assert.deepEqual(updated.housing.hasSpecialSupplyRestriction, knownField(false));
  assert.deepEqual(updated.family.marriageStatus, knownField('married'));
  assert.ok(changed.includes('주택 보유 여부') && changed.includes('특별공급 제한 여부'));
  const facts = buildFacts({ profile: updated, details: {} }, ASOF);
  assert.equal(facts.householdNoHome, true);
  assert.equal(facts.noSpecialRestriction, true);
  assert.equal(facts.maritalStatus, 'married');
  // 세대원이 가진 경우도 의미대로 옮긴다.
  const other = profileUpdatesFromAnswers(profile(), { householdHomeOwnership: 'household' }, ASOF).profile;
  assert.equal(buildFacts({ profile: other, details: {} }, ASOF).householdNoHome, false);
  // 이미 프로필에 있으면 덮어쓰지 않는다.
  const saved = savedProfile();
  assert.deepEqual(profileUpdatesFromAnswers(saved, { householdHomeOwnership: 'self' }, ASOF).changed, []);
});

test('기존 draft 의 답변은 그대로 복원하고, 단계는 다시 계산한다', () => {
  const storage = createMemoryDraftStorage();
  // 옛 형식: index 가 질문 번호(7)였다.
  writeDraft(LISTING, 'newlywed', { answers: { birthDate: '1994-07-05', familyCategory: 'married', overseas: 'no' }, index: 7 }, storage);
  const draft = readDraft(LISTING, 'newlywed', storage);
  assert.ok(draft);
  assert.equal(draft!.answers.birthDate, '1994-07-05', '답변은 그대로 남는다');
  assert.equal(draft!.answers.familyCategory, 'married');
  const restoredSteps = buildSteps(ask({ answers: draft!.answers }), draft!.answers);
  const entry = firstIncompleteStep(restoredSteps);
  assert.equal(restoredSteps[entry].category, '기본정보', '아직 덜 채운 첫 단계로 들어간다');
  assert.ok(entry < restoredSteps.length - 1, '옛 index(7)를 그대로 쓰지 않는다');
});

test('첫 미완료 카테고리로 들어간다', () => {
  const full: Answers = {
    birthDate: '1994-07-05', familyCategory: 'married', marriageDate: '2024-09-11', children: '없음', incomeHouseholdSize: '3',
    householdHomeOwnership: 'none', specialSupplyRestriction: 'no', overseas: 'no', residenceStartDate: '2021-09-11',
    specialSupplyHistory: 'no', reWinningRestriction: 'no',
  };
  const afterBasics = buildSteps(ask({ answers: full }), full);
  assert.equal(afterBasics[firstIncompleteStep(afterBasics)].category, '청약', '기본정보·주거를 채우면 청약으로 간다');
  const done: Answers = { ...full, hasAccount: 'no', householdIncome: '7000000', dualIncome: 'no', realEstateAssets: '0', vehicleValue: '0', exceptions: 'no' };
  const all = buildSteps(ask({ answers: done }), done);
  assert.equal(all[firstIncompleteStep(all)].category, '확인', '다 채우면 확인 단계로 간다');
});

test('같은 입력이면 판정 결과가 카테고리 개편 전과 같다', () => {
  const answers: Answers = {
    birthDate: '1994-07-05', familyCategory: 'married', marriageDate: '2024-09-11', children: '없음', incomeHouseholdSize: '3',
    overseas: 'no', residenceStartDate: '2021-09-11', specialSupplyHistory: 'no', reWinningRestriction: 'no',
    hasAccount: 'yes', accountKindEligible: 'yes', subscriptionAccountOpenedAt: '2020-03-15', recognizedPaymentCount: '30',
    householdIncome: '7000000', dualIncome: 'no', realEstateAssets: '0', vehicleValue: '0', exceptions: 'no',
  };
  const saved = savedProfile();
  const questions = ask({ profile: saved, answers });
  const { details, errors } = assessmentDetails(questions, answers, 'newlywed', { notAfter: ASOF });
  assert.deepEqual(errors, {});
  const result = assessApplication(godeok, { profile: saved, details }, LISTING);
  // 기준선: 질문지 이전의 한 화면 form 이 만들던 입력(parseForm 직접 호출).
  const baseline = assessApplication(godeok, { profile: saved, details: parseForm(answers, 'newlywed').details }, LISTING);
  assert.deepEqual(result, baseline, '카테고리로 묶어도 엔진 입력과 결과가 같다');
  const newlywed = result.find(item => item.supplyType === 'newlywed');
  assert.ok(newlywed, '신혼부부 판정 결과가 있다');
  assert.ok(['ELIGIBLE', 'INELIGIBLE', 'NEEDS_MORE_INFORMATION'].includes(newlywed!.status));
  assert.ok(['AVAILABLE', 'NOT_APPLICABLE', 'PENDING'].includes(newlywed!.scoring));
  // 답한 순서가 달라도 결과는 같다(단계 순서를 바꿔도 안전하다).
  const shuffled = Object.fromEntries(Object.entries(answers).reverse());
  const second = assessApplication(godeok, { profile: saved, details: assessmentDetails(questions, shuffled, 'newlywed', { notAfter: ASOF }).details }, LISTING);
  assert.deepEqual(second, result);
});
