import assert from 'node:assert/strict';
import type { Listing } from '../discovery/types.ts';
import { knownField, unknownField, type ApplicantProfileV2 } from '../profile/domain.ts';
import { buildNewlywedDashboard, getNewlywedRelatedListings, hasOfficialSpecialSupplySchedule } from './domain.ts';

const completeProfile = (): ApplicantProfileV2 => ({
  version: 2,
  basic: { name: '테스터', age: 32, occupation: knownField('worker') },
  residence: { currentRegion: '서울' }, preferences: { regions: ['서울'] },
  subscriptionAccount: { hasAccount: knownField(true), accountMonths: knownField(36), monthlyPayment: knownField(250000) },
  housing: {
    currentOwnership: knownField('no-home'), previousOwnership: knownField(false), householdHasHome: knownField(false),
    householdDisqualifyingPreviousOwnership: knownField(false), hasSpecialSupplyRestriction: knownField(false),
  },
  household: { memberCount: knownField(2) },
  family: { marriageStatus: knownField('married'), marriageYears: knownField(2), childrenCount: knownField(0), childBirthYears: knownField([]) },
  income: { annualRange: knownField('50m-70m'), workOrBusinessIncomeEligible: knownField(true), incomeTaxPaymentYears: knownField(5) },
  assets: { financial: knownField('10m-30m'), realEstate: knownField('under-10m'), vehicle: knownField('10m-30m'), debt: knownField('under-10m') },
});

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: 'apt-1', sourceType: 'applyhome-apt', complexName: '공식 특별공급 단지', region: '서울', district: '강남구', address: '서울 강남구',
  latitude: null, longitude: null, announcementDate: '2026-09-01', recruitmentStatus: 'upcoming',
  recruitmentStartDate: '2026-09-15', recruitmentEndDate: '2026-09-17', winnerAnnouncementDate: null,
  contractStartDate: null, contractEndDate: null, announcementUrl: null, homepageUrl: null, housingType: '아파트', supplyType: '민간분양',
  representativePrice: null, householdCount: null, imagePlaceholder: { from: '#6558C8', to: '#393091', icon: 'apartment' },
  interestTags: [], checkpoints: [], isDemo: false,
  officialSchedule: { specialSupply: { startDate: '2026-09-15', endDate: '2026-09-15' }, priorityApplications: [] },
  ...overrides,
});

const complete = buildNewlywedDashboard(completeProfile(), [listing()], '2026-09-09');
assert.equal(complete.confirmedCount, complete.informationItemCount, '충분한 profile은 모든 정보 항목 확인');
assert.equal(complete.checklist.at(-1)?.status, 'notice-check', '정보가 충분해도 공고 확인은 남김');
assert.equal(complete.relatedListings.length, 1, '공식 특별공급 일정 공고 분류');
assert.equal(complete.relatedListings[0]?.preferenceMatch, true, '관심지역 연결');
assert.equal(complete.upcomingEvents[0]?.date, '2026-09-15', 'calendar domain의 특별공급 일정 연결');

const missingProfile = completeProfile();
missingProfile.family = { marriageStatus: unknownField(), marriageYears: unknownField(), childrenCount: unknownField(), childBirthYears: unknownField() };
missingProfile.income = { annualRange: unknownField(), workOrBusinessIncomeEligible: unknownField(), incomeTaxPaymentYears: unknownField() };
missingProfile.preferences = { regions: [] };
const missing = buildNewlywedDashboard(missingProfile, [], '2026-09-09');
assert.equal(missing.checklist.find((item) => item.id === 'family')?.status, 'information-needed', 'profile 부족');
assert.equal(missing.checklist.find((item) => item.id === 'income')?.status, 'information-needed', '소득 부족');
assert.equal(missing.relatedListings.length, 0, '공고 데이터 없음');
assert.equal(missing.upcomingEvents.length, 0, '일정 데이터 없음');

const unsafeWords = ['신청 가능합니다', '당첨 자격', '자격 충족'];
unsafeWords.forEach((word) => assert.equal(JSON.stringify(complete).includes(word), false, `확정 판정 문구 금지: ${word}`));

assert.equal(hasOfficialSpecialSupplySchedule(listing({ sourceType: 'mock' })), false, 'mock 구조 데이터는 관련 공고 근거로 사용하지 않음');
assert.equal(hasOfficialSpecialSupplySchedule(listing({ complexName: '신혼 희망타운', officialSchedule: undefined })), false, '제목의 신혼 문구로 분류하지 않음');
assert.equal(hasOfficialSpecialSupplySchedule(listing({ officialSchedule: { specialSupply: { startDate: 'bad', endDate: null }, priorityApplications: [] } })), false, '잘못된 날짜 제외');

const partialListing = listing({
  id: 'apt-partial',
  officialSchedule: { specialSupply: { startDate: null, endDate: '2026-09-18' }, priorityApplications: [] },
});
assert.equal(hasOfficialSpecialSupplySchedule(partialListing), true, 'partial 공식 일정의 유효한 날짜 사용');
assert.equal(buildNewlywedDashboard(completeProfile(), [partialListing], '2026-09-09').upcomingEvents[0]?.label, '특별공급 접수 마감', 'partial 일정 calendar 연결');

const ordered = getNewlywedRelatedListings([
  listing({ id: 'other', region: '경기', complexName: '제목에 신혼 없음' }),
  listing({ id: 'preferred', region: '서울', complexName: '일반 이름' }),
], ['서울']);
assert.equal(ordered[0]?.listing.id, 'preferred', '관심지역 공고 우선 정렬');

console.log('newlywed tests passed');
