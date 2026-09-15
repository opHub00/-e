import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createMinimalApplicantProfile, knownField } from '../profile/domain.ts';
import { assessApplication } from './engine.ts';
import { completedMonths } from './facts.ts';
import { parseForm } from './form.ts';
import { samdoReferenceRules, rulesForListing } from './referenceRules.ts';
import type { AnnouncementRules, AssessmentInput, SupplyType } from './types.ts';

/** Synthetic engineering fixtures. These numbers are NOT Samdo announcement rules. */
function testRules(): AnnouncementRules {
  const rules = structuredClone(samdoReferenceRules);
  rules.verification = 'VERIFIED';
  rules.announcementDate = '2026-09-15';
  rules.version = 'SYNTHETIC-TEST-ONLY';
  for (const key of Object.keys(rules.parameters)) {
    rules.parameters[key] = key.endsWith('accountMonths') ? 6 : key.endsWith('payments') ? 6
      : key.endsWith('ageMin') ? 19 : key.endsWith('ageMax') ? 39
      : key.endsWith('marriageMonths') ? 84 : key.endsWith('childMonths') ? 72
      : key.endsWith('deposit') ? 600 : key.endsWith('taxYears') ? 5
      : key.includes('priority.') ? 300 : key.includes('general.') ? 400 : 500;
  }
  rules.parameters['youth.workPeriodBasis'] = 'work';
  for (const supply of rules.supplies) for (const stage of supply.stages) for (const score of stage.scores ?? []) {
    score.bands = score.fact.includes('Income')
      ? [{ max: 200, points: 3 }, { min: 200.01, points: 1 }]
      : score.fact === 'minorChildren'
        ? [{ max: 0, points: 0 }, { min: 1, max: 1, points: 1 }, { min: 2, points: 3 }]
        : [{ max: 35, points: 1 }, { min: 36, points: 3 }];
  }
  return rules;
}
function applicant(type: SupplyType = 'youth'): AssessmentInput {
  const profile = createMinimalApplicantProfile({ name: '테스트', age: 30, currentRegion: '제주특별자치도', preferredRegions: [] });
  profile.family.marriageStatus = knownField(type === 'youth' ? 'single' : 'married');
  profile.housing = { currentOwnership: knownField('no-home'), previousOwnership: knownField(false), householdHasHome: knownField(false), householdDisqualifyingPreviousOwnership: knownField(false), hasSpecialSupplyRestriction: knownField(false) };
  profile.subscriptionAccount.hasAccount = knownField(true);
  profile.income.workOrBusinessIncomeEligible = knownField(true);
  profile.income.incomeTaxPaymentYears = knownField(6);
  return { profile, details: {
    birthDate: '1996-09-15', marriageDate: '2023-09-15', children: [],
    currentResidence: '제주특별자치도', residenceStartDate: '2020-09-15', overseasStayHistory: [],
    noHomeSince: '2020-09-15', subscriptionAccountOpenedAt: '2020-09-15', recognizedPaymentCount: 60,
    recognizedDepositAmount: 1000, monthlyIncome: 100, householdIncome: 200, dualIncome: false,
    totalAssets: 100, parentAssets: 100, workStartedAt: '2020-09-15', youthPriorityTarget: true, newlywedPriorityTarget: true,
    specialSupplyHistory: false, reWinningRestriction: false, specialExceptions: [],
  } };
}
const run = (type: SupplyType, input = applicant(type), rules = testRules()) => assessApplication(rules, input).find(r => r.supplyType === type)!;

test('청년 우선공급 고득점과 항목별 근거', () => {
  const r = run('youth');
  assert.equal(r.status, 'ELIGIBLE'); assert.equal(r.stage, 'PRIORITY');
  assert.equal(r.score?.total, 9); assert.equal(r.score?.max, 9);
  assert.equal(r.score?.breakdown.length, 3);
  assert.ok(r.score?.breakdown.every(b => r.evidence.some(e => e.id === b.evidenceId)));
});
test('청년 일반공급 전환', () => {
  const input = applicant(); input.details.youthPriorityTarget = false; input.details.newlywedPriorityTarget = false;
  const r = run('youth', input); assert.equal(r.stage, 'GENERAL');
  assert.ok(r.score?.breakdown.some(b => b.ruleId.includes('work')));
});
test('청년 자격 미달', () => {
  const input = applicant(); input.details.birthDate = '1980-01-01';
  const r = run('youth', input); assert.equal(r.status, 'INELIGIBLE'); assert.equal(r.stage, null); assert.equal(r.score, undefined);
});
test('청년 정보 부족과 우선단계 누락은 일반으로 추정하지 않음', () => {
  const input = applicant(); delete input.details.youthPriorityTarget;
  const r = run('youth', input); assert.equal(r.status, 'NEEDS_MORE_INFORMATION'); assert.equal(r.stage, null);
  delete input.details.birthDate; assert.equal(run('youth', input).eligible, null);
});
test('신혼 우선·일반 단계 및 가점항목 분리', () => {
  const input = applicant('newlywed'); assert.equal(run('newlywed', input).stage, 'PRIORITY');
  input.details.youthPriorityTarget = false; input.details.newlywedPriorityTarget = false;
  const r = run('newlywed', input); assert.equal(r.stage, 'GENERAL'); assert.equal(r.score?.breakdown.length, 4);
});
test('신혼 무주택기간 날짜 경계 및 유효하지 않은 날짜', () => {
  assert.equal(completedMonths('2023-09-15', '2026-09-15'), 36);
  assert.equal(completedMonths('2023-09-16', '2026-09-15'), 35);
  assert.equal(completedMonths('2026-02-30', '2026-09-15'), undefined);
  assert.equal(completedMonths('2027-01-01', '2026-09-15'), undefined);
  const input = applicant('newlywed'); input.details.youthPriorityTarget = false; input.details.newlywedPriorityTarget = false;
  input.details.noHomeSince = '2023-09-15'; const a = run('newlywed', input).score!.total;
  input.details.noHomeSince = '2023-09-16'; assert.equal(run('newlywed', input).score!.total, a - 2);
});
test('신혼 자녀수·만18세 경계·태아 분리', () => {
  const input = applicant('newlywed'); input.details.youthPriorityTarget = false; input.details.newlywedPriorityTarget = false;
  input.details.children = [{ birthDate: '2008-09-15', unborn: false }, { birthDate: '2008-09-16', unborn: false }, { unborn: true }];
  const r = run('newlywed', input); assert.equal(r.score!.breakdown.find(b => b.ruleId.endsWith('children'))!.input, 1);
  input.details.children.push({ birthDate: '2020-01-01', unborn: false });
  assert.equal(run('newlywed', input).score!.breakdown.find(b => b.ruleId.endsWith('children'))!.points, 3);
});
test('신혼 소득 경계·맞벌이·혼인기간 경계', () => {
  const input = applicant('newlywed'); input.details.householdIncome = 500;
  assert.equal(run('newlywed', input).status, 'ELIGIBLE');
  input.details.householdIncome = 500.01; assert.equal(run('newlywed', input).status, 'INELIGIBLE');
  input.details.householdIncome = 500; delete input.details.dualIncome;
  assert.equal(run('newlywed', input).status, 'NEEDS_MORE_INFORMATION');
  input.details.dualIncome = true; input.details.marriageDate = '2019-08-15';
  assert.equal(run('newlywed', input).status, 'INELIGIBLE');
});
test('생애최초 1·2·3단계 및 점수 없음', () => {
  for (const [income, stage] of [[300, 'PRIORITY'], [300.01, 'GENERAL'], [400, 'GENERAL'], [400.01, 'LOTTERY']] as const) {
    const input = applicant('firstHome'); input.details.householdIncome = income;
    const r = run('firstHome', input); assert.equal(r.stage, stage); assert.equal(r.score, undefined); assert.equal(r.scoring, 'NOT_APPLICABLE');
  }
});
test('생애최초 미달·미상', () => {
  const input = applicant('firstHome'); input.profile.income.incomeTaxPaymentYears = knownField(4);
  assert.equal(run('firstHome', input).status, 'INELIGIBLE');
  input.profile.income.incomeTaxPaymentYears = knownField(5); delete input.details.householdIncome;
  assert.equal(run('firstHome', input).stage, null);
});
test('미확인 공고는 완전한 입력이어도 결과·점수를 확정하지 않음', () => {
  const r = run('youth', applicant(), samdoReferenceRules);
  assert.equal(r.status, 'NEEDS_MORE_INFORMATION'); assert.equal(r.stage, null); assert.equal(r.score, undefined);
  assert.ok(r.missingInformation.includes('rule:verifiedAnnouncement'));
});
test('다른 공고·미등록 ID에 참조 규칙을 적용하지 않음', () => {
  assert.equal(rulesForListing('real-listing'), undefined);
  const r = assessApplication(testRules(), applicant(), 'different')[0];
  assert.equal(r.eligible, null); assert.equal(r.score, undefined); assert.equal(r.stage, null);
});
test('소득구간·기본 나이·통장개월로 정확한 값 추정 금지', () => {
  const input = applicant(); delete input.details.birthDate; delete input.details.subscriptionAccountOpenedAt;
  delete input.details.monthlyIncome;
  const r = run('youth', input); assert.equal(r.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(r.missingInformation.includes('input:age')); assert.ok(r.missingInformation.includes('input:monthlyIncome'));
});
test('비정상 수치·해외체류·특례·날짜 불일치', () => {
  for (const value of [-1, NaN, Infinity, 1.5]) {
    const input = applicant(); input.details.recognizedPaymentCount = value;
    assert.equal(run('youth', input).status, 'NEEDS_MORE_INFORMATION');
  }
  const input = applicant(); input.details.overseasStayHistory = [{ startDate: '2022-01-01' }];
  assert.equal(run('youth', input).score, undefined);
  input.details.specialExceptions = ['특례']; assert.notEqual(run('youth', input).eligible, true);
});
test('같은 입력의 반복·JSON 왕복·입력 불변성', () => {
  const input = applicant(); const before = structuredClone(input); const rules = testRules();
  assert.deepEqual(run('youth', input, rules), run('youth', input, JSON.parse(JSON.stringify(rules))));
  assert.deepEqual(input, before);
});

test('추가 입력 검증: 빈칸·0·금액 구분자·날짜·자녀·오류 응답', () => {
  assert.deepEqual(parseForm({}, 'youth'), { details: {}, errors: [] });
  const valid = parseForm({ monthlyIncome: '0', parentAssets: '1,000,000', specialSupplyHistory: 'no' }, 'youth');
  assert.equal(valid.details.monthlyIncome, 0); assert.equal(valid.details.parentAssets, 1000000); assert.equal(valid.details.specialSupplyHistory, false);
  for (const value of ['-1', 'Infinity', 'NaN', '1e6', '12,34']) assert.equal(parseForm({ monthlyIncome: value }, 'youth').errors.length, 1);
  assert.equal(parseForm({ birthDate: '2026-02-30' }, 'youth').errors.length, 1);
  assert.equal(parseForm({ specialSupplyHistory: 'unknown-input' }, 'youth').details.specialSupplyHistory, undefined);
  assert.deepEqual(parseForm({ children: '없음' }, 'newlywed').details.children, []);
});
test('배점표 누락·중복구간·잘못된 점수는 총점 없음', () => {
  for (const bands of [null, [], [{ points: 1 }, { points: 2 }], [{ points: -1 }]]) {
    const rules = testRules(); rules.supplies[0].stages[0].scores![0].bands = bands;
    const r = run('youth', applicant(), rules); assert.equal(r.score, undefined); assert.equal(r.status, 'NEEDS_MORE_INFORMATION');
  }
});
test('특례가 있으면 실패항목이 있어도 추가 확인', () => {
  const input = applicant(); input.details.specialExceptions = ['특례']; input.details.birthDate = '1980-01-01';
  assert.equal(run('youth', input).status, 'NEEDS_MORE_INFORMATION');
});
test('신혼 예비신혼·한부모 분기 및 모순 입력', () => {
  const input = applicant('newlywed'); input.profile.family.marriageStatus = knownField('single');
  input.details.familyCategory = 'engaged'; delete input.details.marriageDate;
  assert.equal(run('newlywed', input).status, 'ELIGIBLE');
  input.profile.family.marriageStatus = knownField('married'); assert.equal(run('newlywed', input).status, 'INELIGIBLE');
  input.profile.family.marriageStatus = knownField('single'); input.details.familyCategory = 'singleParent';
  input.details.children = [{ unborn: false, birthDate: '2020-09-15' }]; assert.equal(run('newlywed', input).status, 'ELIGIBLE');
  input.details.children = [{ unborn: false, birthDate: '2020-08-15' }]; assert.equal(run('newlywed', input).status, 'INELIGIBLE');
});
test('주택 처분일 이후 무주택기간 불일치와 미래 자녀 날짜', () => {
  const input = applicant('newlywed'); input.details.newlywedPriorityTarget = false;
  input.details.housingDisposalDates = ['2025-01-01'];
  assert.equal(run('newlywed', input).score, undefined);
  input.details.housingDisposalDates = []; input.details.children = [{ unborn: false, birthDate: '2027-01-01' }];
  assert.equal(run('newlywed', input).status, 'NEEDS_MORE_INFORMATION');
});
test('우선공급 조건은 공급유형 간 재사용하지 않음', () => {
  const input = applicant('newlywed'); delete input.details.newlywedPriorityTarget;
  assert.equal(run('newlywed', input).stage, null);
});
