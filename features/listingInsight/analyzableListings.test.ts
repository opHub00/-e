import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateImportPackage } from '../applicationAssessment/server/importPackage.ts';
import { createMinimalApplicantProfile } from '../profile/domain.ts';
import { getVisibleListings, DEFAULT_DISCOVERY_FILTERS } from '../discovery/domain.ts';
import { toDiscoveryUserProfile } from '../profile/domain.ts';
import type { DiscoveryListing } from '../discovery/types.ts';
import { countApprovedRules, excludeAnalysisReady, readBoundListings, sourceStatusLabel, type BindingReadClient } from './analyzableListings.ts';

const godeok = validateImportPackage(JSON.parse(readFileSync(new URL('../../data/assessment-rules/lh-godeok-a65bl-2026000438.json', import.meta.url), 'utf8'))).rules;
const GODEOK_ID = 'apt-2026000438-2026000438';

const listing = (over: Partial<DiscoveryListing>): DiscoveryListing => ({
  id: 'x', sourceType: 'applyhome', complexName: '테스트', region: '서울', district: '강남구', address: '',
  latitude: null, longitude: null, announcementDate: null, recruitmentStatus: 'open',
  recruitmentStartDate: null, recruitmentEndDate: null, winnerAnnouncementDate: null,
  contractStartDate: null, contractEndDate: null, announcementUrl: null, homepageUrl: null,
  housingType: '아파트', supplyType: 'public', representativePrice: null, householdCount: null,
  imagePlaceholder: 'apartment', interestTags: [], checkpoints: [], isDemo: false,
  ...over,
} as DiscoveryListing);

const client = (rows: unknown): BindingReadClient => ({
  from: table => ({
    select: () => {
      assert.equal(table, 'announcement_listing_bindings', '바인딩 테이블만 읽는다');
      return Promise.resolve({ data: rows, error: null });
    },
  }),
});

test('바인딩 조회 한 번으로 분석 가능 listing 을 얻는다', async () => {
  const rows = await readBoundListings(client([
    { listing_id: GODEOK_ID, announcement_id: 'ann-1' },
    { listing_id: 'apt-other', announcement_id: 'ann-2' },
  ]));
  assert.deepEqual(rows, [
    { listingId: GODEOK_ID, announcementId: 'ann-1' },
    { listingId: 'apt-other', announcementId: 'ann-2' },
  ]);
});

test('조회에 실패하거나 비어 있으면 섹션이 아무것도 주장하지 않는다', async () => {
  const failing: BindingReadClient = { from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) };
  assert.deepEqual(await readBoundListings(failing), []);
  assert.deepEqual(await readBoundListings(client([])), []);
  assert.deepEqual(await readBoundListings(client([{ listing_id: '', announcement_id: 'a' }])), [], '값이 온전하지 않은 행은 버린다');
});

test('노출 기준은 binding 조회 결과 그대로다 — 현재는 고덕 1건', async () => {
  const bound = (await readBoundListings(client([{ listing_id: GODEOK_ID, announcement_id: 'ann-1' }]))).map(row => row.listingId);
  const all = [
    listing({ id: GODEOK_ID, complexName: '힐스테이트 고덕엘리스트 A65BL 공공분양주택', region: '경기', district: '평택시', recruitmentStatus: 'closed' }),
    listing({ id: 'apt-seoul-1', complexName: '서울 공고', region: '서울' }),
    listing({ id: 'apt-seoul-2', complexName: '서울 공고2', region: '서울' }),
  ];
  const matched = all.filter(item => bound.includes(item.id));
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, GODEOK_ID);
});

test('지역·추천 필터가 일반 목록에서 고덕을 빼도 섹션 노출은 영향받지 않는다', async () => {
  const bound = (await readBoundListings(client([{ listing_id: GODEOK_ID, announcement_id: 'ann-1' }]))).map(row => row.listingId);
  const godeokListing = listing({ id: GODEOK_ID, complexName: '힐스테이트 고덕엘리스트 A65BL', region: '경기', district: '평택시', recruitmentStatus: 'closed' });
  const all = [godeokListing, listing({ id: 'apt-seoul-1', region: '서울' })];
  const profile = toDiscoveryUserProfile(createMinimalApplicantProfile({ name: '검증', age: 31, currentRegion: '서울', preferredRegions: ['서울'] }));

  // 일반 목록: 기본 필터(추천 ON, 지역 서울)에서는 고덕이 빠진다.
  const general = getVisibleListings(all, profile, { ...DEFAULT_DISCOVERY_FILTERS, regions: ['서울'] });
  assert.ok(!general.some(item => item.id === GODEOK_ID), '일반 목록에서는 필터대로 빠진다');

  // 섹션: 같은 필터와 무관하게 그대로 노출된다.
  const section = all.filter(item => bound.includes(item.id));
  assert.deepEqual(section.map(item => item.id), [GODEOK_ID]);

  // 반대로 섹션이 일반 목록에 섞이지도 않는다.
  assert.equal(general.length + section.length, 2, '두 영역은 서로 합쳐지지 않는다');
});

test('검수 완료 규칙 수는 활성 rule set 에서 센다', () => {
  assert.equal(countApprovedRules(godeok), 46);
});

test('공식 검증 여부는 source_status 로만 말한다', () => {
  assert.equal(sourceStatusLabel('OFFICIAL_VERIFIED'), '공식 공고 기준');
  assert.equal(sourceStatusLabel('DRAFT_SOURCE_VERIFIED'), '검토본 기준');
  assert.equal(sourceStatusLabel('REFERENCE'), '원문 확인 전');
  assert.equal(sourceStatusLabel(undefined), '확인 불가', '모르면 단정하지 않는다');
  assert.equal(godeok.sourceStatus, 'OFFICIAL_VERIFIED');
});

// ── 중복 노출 제거: 섹션이 보여준 공고만 일반 목록에서 뺀다.
const GODEOK = listing({ id: GODEOK_ID, complexName: '힐스테이트 고덕엘리스트 A65BL', region: '경기', district: '평택시', recruitmentStatus: 'closed' });
const SEOUL_A = listing({ id: 'apt-seoul-a', complexName: '서울 공고 A', region: '서울' });
const SEOUL_B = listing({ id: 'apt-seoul-b', complexName: '서울 공고 B', region: '서울' });
const ALL = [GODEOK, SEOUL_A, SEOUL_B];
const profileSeoul = toDiscoveryUserProfile(createMinimalApplicantProfile({ name: '검증', age: 31, currentRegion: '서울', preferredRegions: ['서울'] }));

/** 화면 전체에서 고덕이 몇 번 보이는지 = 섹션 + 일반 목록. */
const godeokAppearances = (filters: Parameters<typeof getVisibleListings>[2], sectionIds: string[]) => {
  const section = ALL.filter(item => sectionIds.includes(item.id));
  const general = excludeAnalysisReady(getVisibleListings(ALL, profileSeoul, filters), sectionIds);
  return {
    total: section.filter(i => i.id === GODEOK_ID).length + general.filter(i => i.id === GODEOK_ID).length,
    section: section.length,
    general: general.map(i => i.id),
  };
};

test('기본 필터에서 고덕은 화면에 1회만 나온다', () => {
  const result = godeokAppearances({ ...DEFAULT_DISCOVERY_FILTERS, regions: ['서울'] }, [GODEOK_ID]);
  assert.equal(result.total, 1);
  assert.equal(result.section, 1);
  assert.ok(!result.general.includes(GODEOK_ID), '기본 필터에서는 원래 일반 목록에 없다');
});

test('지역 전국으로 넓혀도 고덕은 1회만 나온다', () => {
  const result = godeokAppearances({ ...DEFAULT_DISCOVERY_FILTERS, regions: [], personalizedOnly: false }, [GODEOK_ID]);
  assert.equal(result.total, 1, '전국에서는 일반 목록에도 들어오지만 섹션 것만 남긴다');
  assert.ok(!result.general.includes(GODEOK_ID));
});

test('추천 필터를 꺼도 고덕은 1회만 나온다', () => {
  const result = godeokAppearances({ ...DEFAULT_DISCOVERY_FILTERS, regions: ['서울'], personalizedOnly: false }, [GODEOK_ID]);
  assert.equal(result.total, 1);
});

test('섹션 조회가 실패하면 일반 목록의 고덕을 숨기지 않는다', () => {
  const result = godeokAppearances({ ...DEFAULT_DISCOVERY_FILTERS, regions: [], personalizedOnly: false }, []);
  assert.equal(result.section, 0, '섹션은 아무것도 못 보여준다');
  assert.equal(result.total, 1, '대신 일반 목록에서 보인다');
  assert.ok(result.general.includes(GODEOK_ID), '어디에서도 사라지면 안 된다');
});

test('다른 공고의 목록 결과는 그대로다', () => {
  const filters = { ...DEFAULT_DISCOVERY_FILTERS, regions: [], personalizedOnly: false };
  const before = getVisibleListings(ALL, profileSeoul, filters).map(item => item.id);
  const after = excludeAnalysisReady(getVisibleListings(ALL, profileSeoul, filters), [GODEOK_ID]).map(item => item.id);
  assert.deepEqual(after, before.filter(id => id !== GODEOK_ID), '고덕만 빠지고 순서도 그대로다');
  assert.deepEqual(excludeAnalysisReady(ALL, []), ALL, '뺄 것이 없으면 배열을 그대로 돌려준다');
});
