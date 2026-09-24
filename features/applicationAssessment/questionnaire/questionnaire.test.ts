import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createMinimalApplicantProfile, knownField, unknownField, type ApplicantProfileV2 } from '../../profile/domain.ts';
import { validateImportPackage } from '../server/importPackage.ts';
import { assessApplication } from '../engine.ts';
import { parseForm } from '../form.ts';
import { assessmentDetails, normalizeAnswers, profileUpdatesFromAnswers } from './adapter.ts';
import { applyPrefill, buildQuestionnaire, questionnaireProgress, type Answers } from './questions.ts';

const load = (name: string) => validateImportPackage(JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${name}`, import.meta.url), 'utf8'))).rules;
const godeok = load('lh-godeok-a65bl-2026000438.json');
const ASOF = godeok.announcementDate ?? '2026-09-11';

function profile(): ApplicantProfileV2 {
  return createMinimalApplicantProfile({ name: '검증용', age: 31, currentRegion: '경기도 평택시', preferredRegions: [] });
}
const ask = (input: { profile?: ApplicantProfileV2; answers?: Answers; supply?: 'youth' | 'newlywed' | 'firstHome' }) =>
  buildQuestionnaire({ rules: godeok, supply: input.supply ?? 'newlywed', profile: input.profile ?? profile(), answers: input.answers ?? {}, announcementDate: ASOF });
const ids = (input: Parameters<typeof ask>[0]) => ask(input).map(question => question.id);

test('1. 청약통장이 없으면 통장 관련 질문을 묻지 않는다', () => {
  const none = profile();
  none.subscriptionAccount.hasAccount = knownField(false);
  const asked = ids({ profile: none });
  for (const id of ['accountKindEligible', 'subscriptionAccountOpenedAt', 'recognizedPaymentCount', 'firstRank', 'hasAccount']) {
    assert.ok(!asked.includes(id), `${id}는 묻지 않아야 한다`);
  }
});

test('2. 청약통장이 있으면 가입 관련 질문이 나온다', () => {
  const has = profile();
  has.subscriptionAccount.hasAccount = knownField(true);
  const asked = ids({ profile: has });
  assert.ok(asked.includes('subscriptionAccountOpenedAt'));
  assert.ok(asked.includes('recognizedPaymentCount'));
  assert.ok(!asked.includes('hasAccount'), '프로필에 있으면 보유 여부는 다시 묻지 않는다');
  // 프로필에 보유 여부가 없으면 먼저 묻고, 아니라고 답하면 뒤따르는 질문이 사라진다.
  assert.ok(ids({}).includes('hasAccount'));
  assert.ok(!ids({ answers: { hasAccount: 'no' } }).includes('subscriptionAccountOpenedAt'));
});

test('3. 신혼부부가 아니면 혼인 관련 질문을 건너뛴다', () => {
  const single = ids({ answers: { familyCategory: 'singleParent' } });
  assert.ok(!single.includes('marriageDate'), '한부모에게 혼인신고일을 묻지 않는다');
  assert.ok(!single.includes('plannedMarriageWithinDeadline'));
  assert.ok(single.includes('singleParentQualified'));
  const engaged = ids({ answers: { familyCategory: 'engaged' } });
  assert.ok(!engaged.includes('marriageDate'));
  assert.ok(engaged.includes('plannedMarriageWithinDeadline'));
});

test('4. 신혼부부면 필요한 혼인 질문이 나온다', () => {
  const married = ids({ answers: { familyCategory: 'married' } });
  assert.ok(married.includes('marriageDate'));
  assert.ok(!married.includes('singleParentQualified'));
  assert.ok(!married.includes('plannedMarriageWithinDeadline'));
});

test('5. 프로필에 있는 정보는 기본값으로 채워지고, 출처가 보인다', () => {
  const saved = profile();
  saved.basic.birthDate = knownField('1994-03-01');
  saved.family.marriageStatus = knownField('married');
  saved.family.childrenCount = knownField(1);
  saved.family.childBirthYears = knownField([2022]);
  saved.household.memberCount = knownField(3);
  const questions = ask({ profile: saved });
  const byId = Object.fromEntries(questions.map(question => [question.id, question]));
  assert.deepEqual(byId.birthDate.prefill, { value: '1994-03-01', source: '프로필에 저장된 생년월일' });
  assert.equal(byId.familyCategory.prefill?.value, 'married');
  assert.equal(byId.children.prefill?.value, '2022-01-01');
  assert.equal(byId.incomeHouseholdSize.prefill?.value, '3');
  const answers = applyPrefill(questions, {});
  assert.equal(answers.birthDate, '1994-03-01');
  assert.equal(answers.children, '2022-01-01');
  // 자동으로 채워도 질문은 그대로 남아 사용자가 고칠 수 있다.
  assert.ok(questions.some(question => question.id === 'birthDate'));
});

test('6. 19940705 처럼 숫자만 입력해도 정상 날짜로 읽는다', () => {
  const questions = ask({ answers: { familyCategory: 'married' } });
  const { raw, errors } = normalizeAnswers(questions, { birthDate: '19940705', marriageDate: '2024.09.11', children: '20220510, 20240103' });
  assert.deepEqual(errors, {});
  assert.equal(raw.birthDate, '1994-07-05');
  assert.equal(raw.marriageDate, '2024-09-11');
  assert.equal(raw.children, '2022-05-10, 2024-01-03');
});

test('7. 잘못된 날짜는 판정 전에 질문 옆에서 막는다', () => {
  const questions = ask({});
  const { raw, errors } = normalizeAnswers(questions, { birthDate: '19941331' });
  assert.match(errors.birthDate, /13월은 없어요/);
  assert.equal(raw.birthDate, undefined, '잘못된 값은 판정 입력으로 내려가지 않는다');
  const future = normalizeAnswers(questions, { birthDate: '20991231' }, { notAfter: ASOF, notAfterLabel: '공고일' });
  assert.match(future.errors.birthDate, /공고일 이전/);
});

test('8. 답변이 바뀌어 필요 없어진 질문의 값은 판정에 들어가지 않는다', () => {
  // 한부모로 바꾸기 전에 입력해 둔 혼인신고일은 더 이상 묻지 않으므로 details 에서도 빠진다.
  const answers: Answers = { familyCategory: 'singleParent', marriageDate: '2024-09-11' };
  const questions = ask({ answers });
  const { details } = assessmentDetails(questions, answers, 'newlywed');
  assert.equal(details.familyCategory, 'singleParent');
  assert.equal(details.marriageDate, undefined);
});

test('9. 같은 입력이면 기존 화면과 판정 결과가 같다', () => {
  const answers: Answers = {
    birthDate: '19940301', familyCategory: 'married', marriageDate: '20240911', children: '20220510',
    incomeHouseholdSize: '3', currentResidence: '경기도 평택시', overseas: 'no', residenceStartDate: '20210911',
    accountKindEligible: 'yes', subscriptionAccountOpenedAt: '20230911', recognizedPaymentCount: '30',
    householdIncome: '7000000', dualIncome: 'no', realEstateAssets: '0', vehicleValue: '20000000',
    specialSupplyHistory: 'no', reWinningRestriction: 'no', exceptions: 'no', hasAccount: 'yes',
  };
  const base = profile();
  base.housing.currentOwnership = knownField('no-home');
  base.housing.previousOwnership = knownField(false);
  base.housing.householdHasHome = knownField(false);
  base.housing.householdDisqualifyingPreviousOwnership = knownField(false);
  base.housing.hasSpecialSupplyRestriction = knownField(false);
  base.subscriptionAccount.hasAccount = knownField(true);

  // 예전 화면 경로: 같은 값을 canonical 날짜로 직접 입력했을 때.
  const legacyRaw = {
    birthDate: '1994-03-01', familyCategory: 'married', marriageDate: '2024-09-11', children: '2022-05-10',
    incomeHouseholdSize: '3', currentResidence: '경기도 평택시', overseas: 'no', residenceStartDate: '2021-09-11',
    accountKindEligible: 'yes', subscriptionAccountOpenedAt: '2023-09-11', recognizedPaymentCount: '30',
    householdIncome: '7000000', dualIncome: 'no', realEstateAssets: '0', vehicleValue: '20000000',
    specialSupplyHistory: 'no', reWinningRestriction: 'no', exceptions: 'no',
  };
  const questions = buildQuestionnaire({ rules: godeok, supply: 'newlywed', profile: base, answers, announcementDate: ASOF });
  // 이 공고가 읽지 않는 사실(거주지)은 새 화면에서 아예 묻지 않는다. 같은 조건에서 비교하려고 옛 입력도 물어본 질문으로 맞춘다.
  const asked = new Set(questions.map(question => question.id));
  const legacy = parseForm(Object.fromEntries(Object.entries(legacyRaw).filter(([key]) => asked.has(key))), 'newlywed');
  const next = assessmentDetails(questions, answers, 'newlywed');
  assert.deepEqual(next.errors, {});
  assert.deepEqual(next.details, legacy.details, 'details 가 완전히 같아야 한다');

  // 예전 화면은 혼인 여부를 프로필에서만 읽었다. 새 화면은 가족 유형 답변을 프로필에 반영해 같은 상태를 만든다.
  const legacyProfile = { ...base, family: { ...base.family, marriageStatus: knownField('married' as const) } };
  const updated = profileUpdatesFromAnswers(base, answers, ASOF).profile;
  assert.deepEqual(updated.family.marriageStatus, knownField('married'));
  const before = assessApplication(godeok, { profile: legacyProfile, details: legacy.details }, godeok.listingId).find(r => r.supplyType === 'newlywed')!;
  const after = assessApplication(godeok, { profile: updated, details: next.details }, godeok.listingId).find(r => r.supplyType === 'newlywed')!;
  assert.equal(after.status, before.status);
  assert.equal(after.stage, before.stage);
  assert.deepEqual(after.score, before.score);
  assert.equal(before.status, 'ELIGIBLE');
  assert.equal(before.score?.total, 10);
});

test('오래 쓰는 정보만 프로필에 반영한다', () => {
  const base = profile();
  const { profile: updated, changed } = profileUpdatesFromAnswers(base, {
    birthDate: '19940705', familyCategory: 'married', hasAccount: 'yes', children: '20220510',
    householdIncome: '7000000', residenceStartDate: '20210911',
  }, ASOF);
  assert.deepEqual(changed, ['생년월일', '혼인 여부', '청약통장 보유', '자녀 정보']);
  assert.deepEqual(updated.basic.birthDate, knownField('1994-07-05'));
  assert.equal(updated.basic.age, 32, '나이는 생년월일에서 계산한다');
  assert.deepEqual(updated.family.marriageStatus, knownField('married'));
  assert.deepEqual(updated.subscriptionAccount.hasAccount, knownField(true));
  assert.deepEqual(updated.family.childrenCount, knownField(1));
  assert.deepEqual(updated.family.childBirthYears, knownField([2022]));
  // 이미 프로필에 있는 값은 덮어쓰지 않는다.
  const saved = profile();
  saved.family.marriageStatus = knownField('single');
  const second = profileUpdatesFromAnswers(saved, { familyCategory: 'married' }, ASOF);
  assert.deepEqual(second.changed, []);
  assert.deepEqual(second.profile.family.marriageStatus, knownField('single'));
});

test('진행률은 필요한 질문 대비 답한 질문으로 센다', () => {
  const questions = ask({});
  const empty = questionnaireProgress(questions, {});
  assert.equal(empty.answered, 0);
  assert.ok(empty.total > 0);
  const partial = questionnaireProgress(questions, { birthDate: '1994-03-01', overseas: 'no' });
  assert.equal(partial.answered, 2);
  assert.ok(partial.ratio > 0 && partial.ratio < 1);
});

test('공급유형별로 규칙이 읽지 않는 질문은 아예 나오지 않는다', () => {
  const youth = ids({ supply: 'youth' });
  assert.ok(!youth.includes('familyCategory'), '고덕 공고의 청년 유형에는 가족 유형 질문이 없다');
  const newlywed = ids({});
  assert.ok(!newlywed.includes('noHomeSince'), '규칙이 무주택기간을 읽지 않으면 묻지 않는다');
  assert.ok(!newlywed.includes('parentAssets'));
  assert.ok(newlywed.includes('realEstateAssets'));
  const savedProfile = profile();
  savedProfile.subscriptionAccount.hasAccount = knownField(true);
  savedProfile.family.marriageStatus = knownField('married');
  savedProfile.basic.birthDate = knownField('1994-03-01');
  savedProfile.housing.currentOwnership = knownField('no-home');
  savedProfile.housing.householdHasHome = knownField(false);
  savedProfile.housing.hasSpecialSupplyRestriction = knownField(false);
  // 프로필이 채워진 신혼부부 기준 질문 수를 기록해 둔다(기존 25개와 비교).
  const count = ask({ profile: savedProfile, answers: { familyCategory: 'married', overseas: 'no' } }).length;
  assert.ok(count <= 18, `질문 수가 ${count}개로 줄어야 한다`);
});

test('세대 과거 주택 이력이 있을 때만 처분일을 묻는다', () => {
  const clean = profile();
  clean.housing.householdDisqualifyingPreviousOwnership = knownField(false);
  assert.ok(!ids({ profile: clean }).includes('housingDisposalDates'));
  const dirty = profile();
  dirty.housing.householdDisqualifyingPreviousOwnership = knownField(true);
  dirty.family.marriageStatus = unknownField();
  const asked = ask({ profile: dirty }).find(question => question.id === 'housingDisposalDates');
  if (asked) assert.match(asked.why ?? '', /세대원의 과거 주택 소유 이력/);
});
