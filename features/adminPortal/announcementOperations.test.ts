import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYSIS_BADGE, announcementNoOf, filterByView, imageBlockSummary, joinAnnouncements, needsImage, needsReview,
  scheduleLine, searchAnnouncements, selectAnnouncements, supplyLabel,
} from './announcementOperations.ts';
import { ruleScopePath } from '../assessmentRuleReview/ui/reviewLabels.ts';
import type { LearningRow } from '../adminLearningStatus/domain.ts';
import type { DiscoveryListing } from '../discovery/types.ts';
import type { ListingVisualRecord } from '../listingVisual/resolver.ts';

const row = (over: Partial<LearningRow> = {}): LearningRow => ({
  announcementId: 'a1', title: '가나 아파트', source: 'applyhome', publisher: 'LH', regionName: '경기',
  announcementDate: '2026-09-01', updatedAt: '2026-09-10T00:00:00Z', officialLabel: '공식 공고 기준',
  ruleSetId: 'rs1', version: 'v1', ruleCount: 10, approvedCount: 10, reviewObservable: true,
  lifecycleStatus: 'APPROVED', listingIds: ['apt-2026000404-2026000404'], stages: [], notes: [],
  ...over,
} as LearningRow);

const listing = (over: Partial<DiscoveryListing> = {}): DiscoveryListing => ({
  id: 'apt-2026000404-2026000404', complexName: '가나 아파트', region: '인천', district: '서구',
  address: '인천 서구', recruitmentStatus: 'open', announcementDate: '2026-09-01',
  recruitmentStartDate: '2026-09-20', recruitmentEndDate: '2026-09-25', winnerAnnouncementDate: null,
  contractStartDate: null, contractEndDate: null, supplyType: '국민', housingType: '아파트',
  representativePrice: null, householdCount: 441, latitude: null, longitude: null,
  ...over,
} as DiscoveryListing);

const visual = (over: Partial<ListingVisualRecord> = {}): ListingVisualRecord => ({
  listingId: 'apt-2026000404-2026000404', imageUrl: 'https://e.com/a.jpg', sourceUrl: 'https://e.com',
  sourceType: 'official_hero', subjectType: 'apartment_exterior', subjectEvidence: [], primaryScore: 1,
  primaryEligible: true, dedupeKey: 'a', verified: true, fetchedAt: '2026-09-27', confidence: 1, evidence: [],
  announcementNo: '2026000404', announcementTitle: 't', width: 1920, height: 1080, byteLength: 300_000,
  contentType: 'image/jpeg', reusePermission: null, blockedReason: null,
  ...over,
});

test('분석 쪽 공고와 사용자 앱 공고를 listing id 로 잇는다', () => {
  const [joined] = joinAnnouncements({ rows: [row()], listings: [listing()], visuals: [visual()] });
  assert.equal(joined.listing?.id, 'apt-2026000404-2026000404');
  assert.equal(joined.announcementNo, '2026000404', '공고번호는 listing id 에서 읽는다');
  assert.equal(joined.primaryImageUrl, 'https://e.com/a.jpg');
  assert.equal(joined.imageState, 'AUTO_VERIFIED');
  assert.equal(joined.analyzable, true);
  assert.equal(joined.lifecycle.length, 4);
});

test('못 이어진 공고는 없는 값을 지어내지 않는다', () => {
  const [joined] = joinAnnouncements({ rows: [row({ listingIds: [] })], listings: [listing()], visuals: [visual()] });
  assert.equal(joined.listing, null);
  assert.equal(joined.announcementNo, null);
  assert.equal(supplyLabel(joined), '확인 불가');
  assert.equal(scheduleLine(joined), '확인 불가');
  assert.equal(joined.imageState, 'NONE');
  assert.equal(joined.primaryImageUrl, null);
});

test('공고번호는 listing id 모양에서만 읽는다', () => {
  assert.equal(announcementNoOf(['apt-2026000404-2026000404']), '2026000404');
  assert.equal(announcementNoOf(['announcement:uuid']), null);
  assert.equal(announcementNoOf([]), null);
});

test('보기 필터가 운영자 말 그대로 걸린다', () => {
  const rows = joinAnnouncements({
    rows: [
      row({ announcementId: 'open' }),
      row({ announcementId: 'upcoming', listingIds: ['l2'] }),
      row({ announcementId: 'norules', ruleSetId: null, listingIds: [] }),
      row({ announcementId: 'review', approvedCount: 3, listingIds: ['l3'] }),
    ],
    listings: [listing(), listing({ id: 'l2', recruitmentStatus: 'upcoming' }), listing({ id: 'l3' })],
    visuals: [visual()],
  });
  assert.deepEqual(filterByView(rows, 'OPEN').map(item => item.announcementId), ['open', 'review']);
  assert.deepEqual(filterByView(rows, 'UPCOMING').map(item => item.announcementId), ['upcoming']);
  assert.deepEqual(filterByView(rows, 'NEEDS_REVIEW').map(item => item.announcementId), ['review']);
  assert.equal(filterByView(rows, 'ALL').length, 4);
  // 이미지가 확인된 것은 open 하나뿐이다.
  assert.equal(filterByView(rows, 'NEEDS_IMAGE').length, 3);
});

test('검수가 남았거나 상태를 못 읽으면 확인 필요로 본다', () => {
  const build = (over: Partial<LearningRow>) =>
    joinAnnouncements({ rows: [row(over)], listings: [], visuals: [] })[0];
  assert.equal(needsReview(build({})), false);
  assert.equal(needsReview(build({ approvedCount: 5 })), true);
  assert.equal(needsReview(build({ reviewObservable: false, approvedCount: null, ruleCount: null })), true);
  assert.equal(needsReview(build({ ruleSetId: null })), false, '규칙이 없으면 검수 단계가 아니다');
  assert.equal(needsImage(build({})), true, '이미지가 없으면 확인 대상이다');
});

test('손봐야 하는 공고가 목록 맨 위로 온다', () => {
  const rows = joinAnnouncements({
    rows: [
      row({ announcementId: 'fine' }),
      row({ announcementId: 'review', approvedCount: 1 }),
      row({ announcementId: 'norules', ruleSetId: null, listingIds: [] }),
    ],
    listings: [listing()],
    visuals: [visual()],
  });
  const sorted = selectAnnouncements(rows, { query: '', view: 'ALL' });
  assert.equal(sorted[0].announcementId, 'review');
  assert.equal(sorted[1].announcementId, 'norules');
});

test('검색은 공고번호와 공급기관까지 본다', () => {
  const rows = joinAnnouncements({ rows: [row()], listings: [listing()], visuals: [visual()] });
  assert.equal(searchAnnouncements(rows, '2026000404').length, 1);
  assert.equal(searchAnnouncements(rows, 'LH').length, 1);
  assert.equal(searchAnnouncements(rows, '가나아파트').length, 1, '띄어쓰기를 무시한다');
  assert.equal(searchAnnouncements(rows, '없는것').length, 0);
});

test('분석 배지는 상태에 따라 달라진다', () => {
  const build = (over: Partial<LearningRow>) => joinAnnouncements({ rows: [row(over)], listings: [], visuals: [] })[0];
  assert.equal(ANALYSIS_BADGE(build({})), 'ANALYZABLE');
  assert.equal(ANALYSIS_BADGE(build({ approvedCount: 2 })), 'NEEDS_CHECK');
  assert.equal(ANALYSIS_BADGE(build({ ruleSetId: null })), 'NOT_ANALYZABLE');
});

test('이미지를 못 쓴 이유를 한 문장으로 줄인다', () => {
  assert.equal(imageBlockSummary([visual()]), null, '막힌 게 없으면 이유도 없다');
  const blocked = [
    visual({ verified: false, blockedReason: '해상도가 작아요(360×480, 최소 640×360).' }),
    visual({ verified: false, blockedReason: '해상도가 작아요(120×90, 최소 640×360).' }),
    visual({ verified: false, blockedReason: '이 홈페이지가 블록을 함께 다루고 있어, 어느 블록 사진인지 확인할 수 없어요.' }),
  ];
  // 숫자만 다른 같은 이유는 한 줄로 묶이고, 가장 많은 것이 대표가 된다.
  assert.equal(imageBlockSummary(blocked), '해상도가 작아요.');
});

test('규칙이 누구에게 적용되는지 사람 말로 적는다', () => {
  assert.equal(ruleScopePath({ supplyType: 'newlywed', stage: 'PRIORITY' }), '신혼부부 → 우선공급');
  assert.equal(ruleScopePath({ supplyType: 'firstHome', stage: 'GENERAL' }), '생애최초 → 일반공급');
  assert.equal(ruleScopePath({ supplyType: 'common', stage: null }), '공통조건', '없는 단계를 지어내지 않는다');
  assert.equal(ruleScopePath({ supplyType: 'newlywed', stage: 'PRIORITY', category: 'EXCEPTION' }), '예외 규칙 → 우선공급');
  assert.equal(ruleScopePath({ supplyType: null, stage: null }), '');
});
