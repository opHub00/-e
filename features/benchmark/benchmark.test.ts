import assert from 'node:assert/strict';
import {
  buildPeerBenchmark,
  OFFICIAL_BENCHMARK_METADATA,
  type BenchmarkDimensionStatus,
} from './domain.ts';
import {
  createMinimalApplicantProfile,
  knownField,
  notApplicableField,
  type ApplicantProfileV2,
} from '../profile/domain.ts';

const completeProfile = (): ApplicantProfileV2 => ({
  ...createMinimalApplicantProfile({
    name: '테스트',
    age: 31,
    currentRegion: '서울특별시',
    preferredRegions: ['서울특별시'],
  }),
  basic: { name: '테스트', age: 31, occupation: knownField('worker') },
  subscriptionAccount: {
    hasAccount: knownField(true),
    accountMonths: knownField(48),
    monthlyPayment: knownField(100_000),
  },
  housing: {
    currentOwnership: knownField('no-home'),
    previousOwnership: knownField(false),
    householdHasHome: knownField(false),
    householdDisqualifyingPreviousOwnership: knownField(false),
    hasSpecialSupplyRestriction: knownField(false),
  },
  household: { memberCount: knownField(2) },
  family: {
    marriageStatus: knownField('married'),
    marriageYears: knownField(2),
    childrenCount: knownField(0),
    childBirthYears: notApplicableField(),
  },
  income: {
    annualRange: knownField('30m-50m'),
    workOrBusinessIncomeEligible: knownField(true),
    incomeTaxPaymentYears: knownField(6),
  },
  assets: {
    financial: knownField('10m-30m'),
    realEstate: notApplicableField(),
    vehicle: knownField('under-10m'),
    debt: notApplicableField(),
  },
});

const full = buildPeerBenchmark(completeProfile());
assert.equal(full.official.source, 'official');
assert.equal(full.reference.source, 'wanpane-reference');
assert.equal(full.comparison.source, 'profile');
assert.equal(full.comparison.dimensions.length, 8);
assert.equal(full.isSparse, false);
assert.equal(full.primaryAction, null);
assert.ok(full.comparison.dimensions.some((item) => item.status === 'well-prepared'));
assert.ok(full.comparison.dimensions.some((item) => item.status === 'listing-confirmation'));

const sparse = buildPeerBenchmark(createMinimalApplicantProfile({
  name: '게스트',
  age: 22,
  currentRegion: '',
  preferredRegions: [],
}));
assert.equal(sparse.isSparse, true);
assert.equal(sparse.summary, '비교할 정보가 아직 부족해요.');
assert.equal(sparse.primaryAction?.bundleId, 'SUBSCRIPTION_ACCOUNT');
assert.ok(sparse.comparison.missingData.includes('청약통장'));
assert.equal(sparse.comparison.dimensions.find((item) => item.id === 'housing')?.detail, '주택 이력 항목이 아직 입력되지 않았어요.');
assert.ok(sparse.comparison.dimensions.every((item) => item.status !== ('not-ready' as BenchmarkDimensionStatus)));

const partialProfile = completeProfile();
partialProfile.subscriptionAccount = {
  hasAccount: knownField(true),
  accountMonths: knownField(12),
  monthlyPayment: { status: 'unknown' },
};
partialProfile.assets = {
  financial: knownField('under-10m'),
  realEstate: { status: 'unknown' },
  vehicle: { status: 'unknown' },
  debt: { status: 'unknown' },
};
const partial = buildPeerBenchmark(partialProfile);
assert.equal(partial.comparison.dimensions.find((item) => item.id === 'account')?.status, 'checking');
assert.equal(partial.comparison.dimensions.find((item) => item.id === 'assets')?.status, 'checking');
assert.equal(partial.comparison.dimensions.find((item) => item.id === 'assets')?.detail, '일부 정보만 확인됐어요.');
assert.notEqual(partial.comparison.dimensions.find((item) => item.id === 'account')?.status, 'information-needed', 'partial은 낮은 점수나 missing으로 취급하지 않는다');

assert.equal(OFFICIAL_BENCHMARK_METADATA.institution, '한국부동산원 청약Home');
assert.match(full.official.dimensions[0].detail, /연령·지역·당첨자를 결합한 또래 평균은 만들 수 없어요/);
assert.doesNotMatch(JSON.stringify(full), /당첨 확률은 높|합격 확률은 \d|\d+\s*%/);
assert.ok(full.disclaimer.includes('미입력 정보는 부족한 준비로 계산하지 않고'));

console.log('features/benchmark/domain: 24개 검증 통과');
