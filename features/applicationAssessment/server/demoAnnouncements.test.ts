import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateImportPackage } from './importPackage.ts';
import { assessApplication } from '../engine.ts';
import { createMinimalApplicantProfile, knownField, type ApplicantProfileV2 } from '../../profile/domain.ts';
import type { AnnouncementRules } from '../types.ts';

/**
 * 시연용으로 옮겨 적은 신규 공고 3건.
 *
 * 고덕(46개 승인 규칙)은 이 파일에서 건드리지 않는다. 여기서 확인하는 것은 세 가지다:
 * 패키지가 스키마를 통과하는가, 규칙이 공고 원문 근거를 달고 있는가, 엔진이 실제로 판정을 내는가.
 */
const load = (name: string): AnnouncementRules =>
  validateImportPackage(JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${name}`, import.meta.url), 'utf8'))).rules;

const PACKAGES = [
  { file: 'ico-geomam-b1bl-2026000404.json', title: '검암역 푸르지오 프라베뉴 (B-1BL) 공공분양주택', sha: '30352bc614788225bab9d2d892ee9f5f7bcfce00bd73ac310e98279aac79f815', region: '인천광역시', stages: { newlywed: ['PRIORITY', 'GENERAL', 'LOTTERY'], firstHome: ['PRIORITY', 'GENERAL'] } },
  { file: 'gm-cityprodium-2026000453.json', title: '광명 시티프라디움 에듀하임', sha: 'e4b9cd987e63bc4e2d4e33f74b616492a051aaafb90ca59053329edf05d0c693', region: '경기도', stages: { newlywed: ['PRIORITY', 'GENERAL', 'LOTTERY'], firstHome: ['PRIORITY'] } },
  { file: 'jj-panmun-2026000446.json', title: '진주 판문지구 레이크써밋 웰가', sha: 'b64f953ca25634202eebefc042836f6713323132511cb9da51ae1a5780ef66cb', region: '경상남도', stages: { newlywed: ['PRIORITY', 'GENERAL', 'LOTTERY'], firstHome: ['PRIORITY'] } },
] as const;

test('세 공고 패키지가 모두 스키마 검증을 통과한다', () => {
  for (const item of PACKAGES) {
    const rules = load(item.file);
    assert.equal(rules.title, item.title);
    assert.equal(rules.sourceStatus, 'OFFICIAL_VERIFIED');
    assert.equal(rules.verification, 'VERIFIED');
    assert.match(rules.version, /^OFFICIAL-\d{4}-\d{2}-\d{2}-transcription-1$/);
    assert.ok(rules.announcementDate, '공고일이 있어야 판정이 열린다');
  }
});

test('공급유형은 신혼부부·생애최초만 두고 신생아는 범위 밖으로 둔다', () => {
  for (const item of PACKAGES) {
    const rules = load(item.file);
    assert.deepEqual(rules.supplies.map(s => s.type).sort(), ['firstHome', 'newlywed']);
    for (const supply of rules.supplies) {
      assert.deepEqual(supply.stages.map(s => s.stage), item.stages[supply.type as 'newlywed' | 'firstHome']);
      assert.ok(supply.eligibility.length > 0, `${item.file} ${supply.type} 자격 규칙이 비어 있다`);
      // 생애최초는 배점을 쓰지 않는다(코덱 계약).
      if (supply.type === 'firstHome') for (const stage of supply.stages) assert.equal(stage.scores, null);
    }
  }
});

test('모든 규칙이 공고 원문 근거(문서 해시·페이지·발췌)를 달고 있다', () => {
  for (const item of PACKAGES) {
    const raw = JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${item.file}`, import.meta.url), 'utf8'));
    assert.equal(raw.document.sha256, item.sha, '패키지가 실제로 내려받은 공고문을 가리킨다');
    assert.equal(raw.document.isOfficial, true);
    for (const rule of raw.rules) {
      assert.ok(rule.evidence.textExcerpt.length > 10, `${rule.ruleKey}: 근거 발췌가 없다`);
      assert.equal(rule.evidence.locator.sha256, item.sha, `${rule.ruleKey}: 근거가 다른 문서를 가리킨다`);
      assert.ok(rule.evidence.locator.blocks.length > 0, `${rule.ruleKey}: 인용 블록이 없다`);
      assert.ok(Number.isInteger(rule.evidence.pageNumber), `${rule.ruleKey}: 페이지 번호가 없다`);
      assert.ok(rule.evidence.sourceUrl.startsWith('https://'), `${rule.ruleKey}: 원문 URL 이 없다`);
    }
  }
});

/** 수도권 공공분양(검암역) 기준으로 자격을 모두 채운 신청자. */
function eligibleProfile(region: string): ApplicantProfileV2 {
  // 검암역은 출산가구 완화·과거 주택소유 사실을 프로필에서 읽는다.
  const profile = createMinimalApplicantProfile({ name: '시연', age: 33, currentRegion: region, preferredRegions: [] });
  profile.basic.birthDate = knownField('1993-05-05');
  profile.family.marriageStatus = knownField('married');
  profile.housing.currentOwnership = knownField('no-home');
  profile.housing.householdHasHome = knownField(false);
  profile.housing.hasSpecialSupplyRestriction = knownField(false);
  profile.subscriptionAccount.hasAccount = knownField(true);
  profile.household.memberCount = knownField(3);
  profile.housing.previousOwnership = knownField(false);
  profile.housing.householdDisqualifyingPreviousOwnership = knownField(false);
  profile.income.workOrBusinessIncomeEligible = knownField(true);
  profile.income.incomeTaxPaymentYears = knownField(7);
  return profile;
}
const details = (region: string) => ({
  familyCategory: 'married', specialExceptions: [], overseasStayHistory: [], children: [],
  marriageDate: '2023-06-01', accountKindEligible: true, subscriptionAccountOpenedAt: '2019-01-10',
  recognizedPaymentCount: 40, recognizedDepositAmount: 12000000, householdIncome: 7000000, dualIncome: false,
  incomeHouseholdSize: 3, realEstateAssets: 0, vehicleValue: 0, currentResidence: region,
  specialSupplyHistory: false, reWinningRestriction: false, neverOwned: true, isHouseholdHead: true,
});

test('세 공고 모두 엔진이 실제 판정을 내린다 — 신혼부부는 자격 충족 시 단계까지 정해진다', () => {
  for (const item of PACKAGES) {
    const rules = load(item.file);
    const results = assessApplication(rules, { profile: eligibleProfile(item.region), details: details(item.region) as never }, rules.listingId);
    const newlywed = results.find(r => r.supplyType === 'newlywed');
    assert.ok(newlywed, `${item.file}: 신혼부부 결과가 없다`);
    assert.equal(newlywed!.status, 'ELIGIBLE', `${item.file}: ${newlywed!.failedConditions.map(c => c.ruleId).join(',')} / ${newlywed!.unknownConditions.map(c => c.ruleId).join(',')}`);
    assert.equal(newlywed!.stage, 'PRIORITY');
    assert.equal(newlywed!.failedConditions.length, 0);
    assert.deepEqual(newlywed!.missingInformation, []);
  }
});

test('소득이 기준을 넘으면 공고가 정한 대로 막힌다', () => {
  const rules = load('ico-geomam-b1bl-2026000404.json');
  const rich = { ...details('인천광역시'), householdIncome: 30_000_000 };
  const result = assessApplication(rules, { profile: eligibleProfile('인천광역시'), details: rich as never }, rules.listingId)
    .find(r => r.supplyType === 'newlywed')!;
  assert.equal(result.status, 'INELIGIBLE');
  assert.ok(result.failedConditions.some(c => c.ruleId === 'newlywed.income'));
});

test('민영 공고는 단계 구조가 공공분양과 다르다 — 3단계와 추첨 자산 기준', () => {
  const rules = load('gm-cityprodium-2026000453.json');
  const newlywed = rules.supplies.find(s => s.type === 'newlywed')!;
  assert.deepEqual(newlywed.stages.map(s => s.stage), ['PRIORITY', 'GENERAL', 'LOTTERY']);
  const lottery = newlywed.stages.find(s => s.stage === 'LOTTERY')!;
  assert.equal(lottery.conditions[0].label, '추첨공급: 부동산가액 3억 3,100만원 이하');
  // 소득이 우선공급 기준을 넘으면 다음 단계로 내려간다.
  const overPriority = { ...details('경기도'), householdIncome: 9_500_000 };
  const result = assessApplication(rules, { profile: eligibleProfile('경기도'), details: overPriority as never }, rules.listingId)
    .find(r => r.supplyType === 'newlywed')!;
  assert.equal(result.status, 'ELIGIBLE');
  assert.equal(result.stage, 'GENERAL', '우선공급에서 떨어지면 일반공급 단계로 간다');
});

test('고덕 공고는 이번 작업에서 건드리지 않았다', () => {
  const godeok = load('lh-godeok-a65bl-2026000438.json');
  assert.equal(godeok.version, 'OFFICIAL-2026-09-11-transcription-1');
  const total = godeok.supplies.reduce((sum, supply) =>
    sum + supply.eligibility.length + supply.stages.reduce((n, stage) => n + stage.conditions.length + (stage.scores?.length ?? 0), 0), 0);
  assert.equal(total, 46, '고덕 규칙 수가 46개 그대로여야 한다');
  for (const item of PACKAGES) {
    const rules = load(item.file);
    assert.notEqual(rules.id, godeok.id, '신규 공고가 고덕 rule set id 를 쓰지 않는다');
  }
});
