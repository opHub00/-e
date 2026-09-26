import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  MAX_GALLERY, MIN_CONFIDENCE, buildVisualRecord, classifySubject, dedupeKey, extractBlockCodes, imageDimensions,
  isExcludedImage, nameTokens, pickGallery, pickPrimary, sameOrigin, scoreCandidate, type ListingSubjectType,
  type ListingVisualRecord,
} from './resolver.ts';
import { listingVisualRecords, resolvedListingImage } from './resolvedRegistry.ts';
import { adapterFor } from '../../scripts/listing-visual-adapters.mjs';
import { classifySource, inScope, scopeOf } from '../../scripts/resolve-listing-visuals.mjs';

const HOME = 'https://www.example-sale.com/hb/2026/pravenue/';
const base = {
  listingId: 'apt-2026000404-2026000404',
  announcementNo: '2026000404',
  announcementTitle: '검암역 푸르지오 프라베뉴 (B-1BL) 공공분양주택',
  officialHomepage: HOME,
  pageUrl: HOME,
  pageTitle: '검암역 푸르지오 프라베뉴',
  alt: '단지 외관',
  title: '',
  nearbyText: '',
  sectionHint: 'section#main.visual',
  sourceType: 'official_hero' as const,
  width: 1920, height: 970, byteLength: 400_000, contentType: 'image/jpeg',
  fetchedAt: '2026-09-26T00:00:00.000Z',
};

test('공식 홈페이지의 큰 외관 이미지는 통과하고 근거가 남는다', () => {
  const record = buildVisualRecord({ ...base, imageUrl: `${HOME}assets/images/main/visual-apt.png` });
  assert.equal(record.verified, true);
  assert.equal(record.blockedReason, null);
  assert.equal(record.subjectType, 'apartment_exterior');
  assert.equal(record.primaryEligible, true);
  assert.ok(record.confidence >= MIN_CONFIDENCE);
  assert.ok(record.evidence.some(item => item.includes('공식 홈페이지')));
});

test('다른 도메인 이미지는 단지명이 비슷해도 쓰지 않는다', () => {
  const record = buildVisualRecord({
    ...base, imageUrl: 'https://blog.example.com/photo/pravenue-aerial.jpg', pageUrl: 'https://blog.example.com/1',
  });
  assert.equal(record.verified, false);
  assert.match(record.blockedReason ?? '', /공식 홈페이지 도메인이 아니에요/);
});

test('로고·SEO·공용 배너·favicon 은 후보에서 뺀다', () => {
  for (const path of [
    '/common/x/seo.png', '/img/common/og.png', '/upload/logo.png', '/img/favicon.png',
    '/resources/banner/main.jpg', '/img/popup/pop0917a.jpg', '/icons/sprite.svg', '/img/main.gif',
  ]) assert.equal(isExcludedImage(`https://example.com${path}`), true, path);
  assert.equal(isExcludedImage('https://example.com/resources/img/main/hero_bg.jpg'), false);
});

test('무엇을 찍은 그림인지 이름·alt·섹션으로 나눈다', () => {
  const subjectOf = (extra: Partial<typeof base> & { imageUrl: string }): ListingSubjectType =>
    classifySubject({ ...base, ...extra }).subject;
  assert.equal(subjectOf({ imageUrl: `${HOME}img/exterior-01.jpg` }), 'apartment_exterior');
  assert.equal(subjectOf({ imageUrl: `${HOME}img/birdview.jpg`, alt: '', sectionHint: '' }), 'complex_overview');
  assert.equal(subjectOf({ imageUrl: `${HOME}img/perspective-2.jpg`, alt: '', sectionHint: '' }), 'building_render');
  assert.equal(subjectOf({ imageUrl: `${HOME}img/garden.jpg`, alt: '', sectionHint: '' }), 'landscape');
  assert.equal(subjectOf({ imageUrl: `${HOME}img/community_img_01.jpg`, alt: '', sectionHint: '' }), 'community');
  assert.equal(subjectOf({ imageUrl: `${HOME}img/floorplan_84a.jpg`, alt: '', sectionHint: '' }), 'floor_plan');
  assert.equal(subjectOf({ imageUrl: `${HOME}img/location_map.png`, alt: '', sectionHint: '' }), 'map');
  assert.equal(subjectOf({ imageUrl: `${HOME}img/prize_bg.jpg`, alt: '', sectionHint: '' }), 'brand');
});

test('커뮤니티·조경 그림은 건물 신호가 없으면 대표로 세우지 않는다', () => {
  const community = buildVisualRecord({
    ...base, imageUrl: `${HOME}img/community_img_01.jpg`, alt: '', sectionHint: '', width: 1920, height: 1080,
  });
  assert.equal(community.verified, true, '갤러리에는 들어갈 수 있다');
  assert.equal(community.subjectType, 'community');
  assert.equal(community.primaryEligible, false, '대표로는 올리지 않는다');

  const landscapeWithBuilding = buildVisualRecord({
    ...base, imageUrl: `${HOME}img/landscape-01.jpg`, alt: '단지 전경 조경', sectionHint: '', width: 1920, height: 1080,
  });
  assert.equal(landscapeWithBuilding.subjectType, 'landscape');
  assert.equal(landscapeWithBuilding.primaryEligible, true, '건물이 함께 보이면 대표가 될 수 있다');
});

test('평면도·약도·브랜드 이미지는 아예 내보내지 않는다', () => {
  for (const path of ['img/floorplan_84a.jpg', 'img/location_map.jpg', 'img/award_trophy.jpg']) {
    const record = buildVisualRecord({ ...base, imageUrl: `${HOME}${path}`, alt: '', sectionHint: '' });
    assert.equal(record.verified, false, path);
    assert.match(record.blockedReason ?? '', /단지 사진이 아니에요/);
  }
});

test('글 뒤에 까는 섹션 배경은 걸러 내고 메인 배경은 남긴다', () => {
  const decoration = buildVisualRecord({ ...base, imageUrl: `${HOME}img/premium-bg-01.jpg`, alt: '', sectionHint: '' });
  assert.equal(decoration.subjectType, 'brand');
  assert.equal(decoration.verified, false);

  const mainVisual = buildVisualRecord({ ...base, imageUrl: `${HOME}img/hero_bg.jpg`, alt: '', sectionHint: '', width: 3840, height: 2160 });
  assert.notEqual(mainVisual.subjectType, 'brand');
  assert.equal(mainVisual.verified, true);
});

test('해상도가 작거나 띠 비율이면 쓰지 않는다', () => {
  const small = buildVisualRecord({ ...base, imageUrl: `${HOME}img/visual-apt-2.jpg`, width: 435, height: 235 });
  assert.match(small.blockedReason ?? '', /해상도가 작아요\(435×235/);

  const band = buildVisualRecord({ ...base, imageUrl: `${HOME}img/sub_overview_top.jpg`, width: 1920, height: 464 });
  assert.equal(band.verified, false);
  assert.match(band.blockedReason ?? '', /띠 비율이에요\(1920×464\)/);
});

test('이미지가 아니거나 너무 작은 파일은 막는다', () => {
  const html = buildVisualRecord({ ...base, imageUrl: `${HOME}a.jpg`, contentType: 'text/html', byteLength: 900 });
  assert.match(html.blockedReason ?? '', /이미지 형식이 아니에요/);
  assert.match(html.blockedReason ?? '', /너무 작아/);
});

test('한 사업지에 블록이 여럿이면 우리 블록이라고 말할 수 있는 그림만 쓴다', () => {
  assert.deepEqual(extractBlockCodes('힐스테이트 OO 12BL, A65BL 공공분양'), ['12BL', '65BL']);
  assert.deepEqual(extractBlockCodes('검암역 푸르지오 프라베뉴 (B-1BL)'), ['1BL']);

  const shared = { ...base, announcementTitle: '무지개 아파트 A65BL 공공분양주택', siteBlockCodes: ['65BL', '12BL'] };
  const ambiguous = buildVisualRecord({ ...shared, imageUrl: `${HOME}upload/20260911121838011376.jpg`, alt: '', sectionHint: '' });
  assert.equal(ambiguous.verified, false);
  assert.match(ambiguous.blockedReason ?? '', /어느 블록 사진인지 확인할 수 없어요/);

  const other = buildVisualRecord({ ...shared, imageUrl: `${HOME}upload/a12bl-view.jpg`, alt: '', sectionHint: '' });
  assert.match(other.blockedReason ?? '', /다른 블록\(12BL\) 이미지예요/);

  const ours = buildVisualRecord({ ...shared, imageUrl: `${HOME}upload/a65bl-view.jpg`, alt: '', sectionHint: '' });
  assert.equal(ours.verified, true);

  // 블록이 하나뿐인 전용 홈페이지는 이 규칙에 걸리지 않는다.
  const dedicated = buildVisualRecord({ ...base, imageUrl: `${HOME}img/visual-apt.png`, siteBlockCodes: ['1BL'] });
  assert.equal(dedicated.verified, true);
});

test('단지명 조각을 뽑을 때 일반 낱말은 버린다', () => {
  const tokens = nameTokens('검암역 푸르지오 프라베뉴 (B-1BL) 공공분양주택');
  assert.ok(tokens.includes('푸르지오'));
  assert.ok(!tokens.includes('공공분양주택'));
});

test('같은 그림의 다른 크기는 한 장으로 묶는다', () => {
  assert.equal(dedupeKey('https://e.com/a/visual-apt.png'), dedupeKey('https://e.com/m/m_visual-apt.png'));
  assert.equal(dedupeKey('https://e.com/a/hero_1920x1080.jpg'), dedupeKey('https://e.com/thumb/hero.jpg'));
  assert.equal(dedupeKey('https://e.com/a/view@2x.jpg'), dedupeKey('https://e.com/a/view.jpg'));
  assert.notEqual(dedupeKey('https://e.com/a/complex-01.jpg'), dedupeKey('https://e.com/a/complex-02.jpg'));
});

test('대표는 주제 우선순위대로 고르고, 갤러리도 같은 순서로 채운다', () => {
  let serial = 0;
  const make = (subjectType: ListingSubjectType, primaryScore: number, eligible = true): ListingVisualRecord => {
    serial += 1;
    const url = `https://e.com/${subjectType}-${serial}.jpg`;
    return {
      listingId: 'x', imageUrl: url, sourceUrl: 'https://e.com', sourceType: 'official_hero', subjectType,
      subjectEvidence: [], primaryScore, primaryEligible: eligible, dedupeKey: `${subjectType}-${serial}`,
      verified: true, fetchedAt: base.fetchedAt, confidence: 1, evidence: [], announcementNo: '1',
      announcementTitle: 't', width: 1920, height: 1080, byteLength: 300_000, contentType: 'image/jpeg',
      reusePermission: null, blockedReason: null,
    };
  };
  const records = [
    make('community', 0.4, false), make('complex_overview', 0.9), make('apartment_exterior', 0.8),
    make('landscape', 0.5, false), make('building_render', 0.8), make('floor_plan', 0.9, false),
  ];
  assert.equal(pickPrimary(records)?.subjectType, 'apartment_exterior');

  const gallery = pickGallery(records);
  assert.deepEqual(gallery.map(record => record.subjectType),
    ['apartment_exterior', 'complex_overview', 'building_render', 'landscape', 'community']);
  assert.ok(gallery.length <= MAX_GALLERY);
  assert.ok(!gallery.some(record => record.subjectType === 'floor_plan'), '평면도는 갤러리에도 넣지 않는다');

  assert.equal(pickPrimary([make('community', 0.4, false)]), null, '대표가 없으면 fallback 으로 남는다');
});

test('크롤 범위는 공고 폴더 안으로 묶는다', () => {
  // 건설사 통합 사이트: 위로 올라가면 다른 단지가 나온다.
  assert.equal(scopeOf('https://e.co.kr/SALE/1052/main/index'), 'https://e.co.kr/SALE/1052/');
  assert.equal(scopeOf('https://e.com/hb/2026/pravenue/'), 'https://e.com/hb/2026/pravenue/');
  assert.equal(scopeOf('https://e.com/'), 'https://e.com/');
  assert.equal(inScope('https://e.co.kr/SALE/1052/sale/info', 'https://e.co.kr/SALE/1052/'), true);
  assert.equal(inScope('https://e.co.kr/SALE/2000/main', 'https://e.co.kr/SALE/1052/'), false);
  assert.equal(inScope('https://other.com/SALE/1052/x', 'https://e.co.kr/SALE/1052/'), false);
});

test('경로와 맥락으로 출처 종류를 나눈다', () => {
  assert.equal(classifySource('https://e.com/img/gallery/aerial-1.jpg', 'img'), 'official_gallery');
  assert.equal(classifySource('https://e.com/img/siteplan.jpg', 'img'), 'official_sitemap');
  assert.equal(classifySource('https://e.com/assets/images/main/visual.jpg', 'img'), 'official_hero');
  assert.equal(classifySource('https://e.com/etc/x.jpg', 'img'), 'official_press');
});

test('사이트 어댑터는 없을 때 generic 경로로 돈다', () => {
  assert.equal(adapterFor('https://any-site.example.com/'), null);
  const injected = [{ host: /(^|\.)any-site\.example\.com$/, extraPaths: ['gallery.html'], note: '예시' }];
  assert.equal(adapterFor('https://any-site.example.com/x', injected)?.extraPaths?.[0], 'gallery.html');
  assert.equal(adapterFor('https://elsewhere.com/', injected), null);
});

test('PNG·JPEG 머리에서 가로·세로를 읽는다', () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  const view = new DataView(png.buffer);
  view.setUint32(16, 1920);
  view.setUint32(20, 1080);
  assert.deepEqual(imageDimensions(png), { width: 1920, height: 1080 });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0, 0]);
  assert.deepEqual(imageDimensions(jpeg), { width: 1920, height: 1080 });
  assert.equal(imageDimensions(new Uint8Array([1, 2, 3])), null);
  assert.equal(sameOrigin('https://a.com/x', 'https://a.com/y'), true);
  assert.equal(sameOrigin('https://a.com/x', 'https://b.com/x'), false);
});

test('근거가 약하면 통과시키지 않는다', () => {
  const weak = scoreCandidate({
    ...base, imageUrl: 'https://other.com/x/y.jpg', alt: '', pageTitle: '', sectionHint: '', width: 100, height: 100,
  });
  assert.ok(weak.confidence < MIN_CONFIDENCE || weak.blocked.length > 0);
});

test('지금 기록에는 공고 4건이 후보와 근거를 갖춰 들어 있다', () => {
  const records = listingVisualRecords();
  const byAnnouncement = new Map<string, ListingVisualRecord[]>();
  for (const record of records) {
    for (const key of [
      'listingId', 'imageUrl', 'sourceUrl', 'sourceType', 'subjectType', 'subjectEvidence', 'primaryScore',
      'primaryEligible', 'dedupeKey', 'verified', 'fetchedAt', 'confidence', 'evidence', 'blockedReason',
    ]) assert.ok(key in record, `${record.listingId}: ${key} 가 없다`);
    assert.ok(record.listingId.includes(record.announcementNo), `${record.listingId}: 공고번호와 어긋난다`);
    if (record.verified) assert.equal(record.blockedReason, null);
    else assert.ok(record.blockedReason, `${record.imageUrl}: 막힌 이유가 없다`);
    if (record.primaryEligible) assert.equal(record.verified, true);
    if (!byAnnouncement.has(record.announcementNo)) byAnnouncement.set(record.announcementNo, []);
    byAnnouncement.get(record.announcementNo)!.push(record);
  }
  assert.deepEqual([...byAnnouncement.keys()].sort(), ['2026000404', '2026000438', '2026000446', '2026000453']);
  for (const [no, list] of byAnnouncement) assert.ok(list.length <= 20, `${no}: 후보가 20장을 넘는다`);
});

test('대표가 있는 공고만 이미지를 내보내고, 갤러리는 대표로 시작한다', () => {
  for (const id of ['apt-2026000404-2026000404', 'apt-2026000453-2026000453', 'apt-2026000446-2026000446']) {
    const image = resolvedListingImage({ id });
    assert.ok(image, `${id}: 대표 이미지가 있어야 한다`);
    assert.match(image!.url, /^https:\/\//);
    assert.ok(image!.attribution.includes('공식 분양 홈페이지'));
    assert.equal(image!.gallery[0]?.url, image!.url, '갤러리 첫 장은 대표 이미지다');
    assert.ok(image!.gallery.length <= MAX_GALLERY);
    assert.equal(new Set(image!.gallery.map(item => item.url)).size, image!.gallery.length, '같은 장이 두 번 나오면 안 된다');
    for (const item of image!.gallery) assert.ok(item.label, '갤러리 각 장에 이름이 있어야 한다');
  }
  assert.equal(resolvedListingImage({ id: 'apt-2026000438-2026000438' }), undefined, '블록을 가릴 수 없으면 내보내지 않는다');
});

test('기록 파일이 실제 공고와 묶여 있다', () => {
  const raw = JSON.parse(readFileSync(new URL('../../data/listing-visuals/resolved.json', import.meta.url), 'utf8'));
  assert.equal(raw.schemaVersion, 3);
  assert.ok(raw.visuals.length >= 4);
});
