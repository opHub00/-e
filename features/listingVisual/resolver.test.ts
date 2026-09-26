import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  MIN_CONFIDENCE, buildVisualRecord, imageDimensions, isExcludedImage, nameTokens, pickBest, sameOrigin,
  scoreCandidate, type ListingVisualRecord,
} from './resolver.ts';
import { listingVisualRecords, resolvedListingImage } from './resolvedRegistry.ts';
import { classifySource, collectImageCandidates } from '../../scripts/resolve-listing-visuals.mjs';

const HOME = 'https://www.prugio.com/hb/2026/pravenue';
const base = {
  listingId: 'apt-2026000404-2026000404',
  announcementNo: '2026000404',
  announcementTitle: '검암역 푸르지오 프라베뉴 (B-1BL) 공공분양주택',
  officialHomepage: HOME,
  pageUrl: HOME,
  pageTitle: '검암역 푸르지오 프라베뉴',
  alt: '단지 조감도',
  sourceType: 'official_hero' as const,
  width: 1920, height: 970, byteLength: 400_000, contentType: 'image/jpeg',
  fetchedAt: '2026-09-26T00:00:00.000Z',
};

test('공식 홈페이지의 큰 단지 이미지는 통과하고 근거가 남는다', () => {
  const record = buildVisualRecord({ ...base, imageUrl: `${HOME}/assets/images/main/complex-img-01.jpg` });
  assert.equal(record.verified, true);
  assert.equal(record.blockedReason, null);
  assert.ok(record.confidence >= MIN_CONFIDENCE);
  assert.ok(record.evidence.some(item => item.includes('공식 홈페이지')));
  assert.ok(record.evidence.some(item => item.includes('1920×970')));
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
    '/common/hillstate/hlst_seo.png', '/img/common/og.png', '/assets/images/common/og.png',
    '/upload/logo.png', '/img/favicon.png', '/resources/banner/main.jpg', '/img/popup/pop0917a.jpg',
    '/icons/sprite.svg', '/img/main.gif',
  ]) assert.equal(isExcludedImage(`https://example.com${path}`), true, path);
  assert.equal(isExcludedImage('https://example.com/resources/img/main/community_img_01.jpg'), false);
});

test('해상도가 작으면 대표 이미지로 쓰지 않는다', () => {
  const small = buildVisualRecord({ ...base, imageUrl: `${HOME}/assets/images/main/complex-img-02.jpg`, width: 435, height: 235 });
  assert.equal(small.verified, false);
  assert.match(small.blockedReason ?? '', /해상도가 작아요\(435×235/);
});

test('이미지가 아니거나 너무 작은 파일은 막는다', () => {
  const html = buildVisualRecord({ ...base, imageUrl: `${HOME}/a.jpg`, contentType: 'text/html', byteLength: 900 });
  assert.equal(html.verified, false);
  assert.match(html.blockedReason ?? '', /이미지 형식이 아니에요/);
  assert.match(html.blockedReason ?? '', /너무 작아/);
});

test('근거가 약하면 통과시키지 않는다', () => {
  const weak = scoreCandidate({
    ...base, imageUrl: 'https://other.com/x/y.jpg', alt: '', pageTitle: '', width: 100, height: 100,
  });
  assert.ok(weak.confidence < MIN_CONFIDENCE || weak.blocked.length > 0);
});

test('단지명 조각을 뽑을 때 일반 낱말은 버린다', () => {
  const tokens = nameTokens('검암역 푸르지오 프라베뉴 (B-1BL) 공공분양주택');
  assert.ok(tokens.includes('푸르지오'));
  assert.ok(tokens.includes('프라베뉴'));
  assert.ok(!tokens.includes('공공분양주택'));
});

test('페이지에서 img·srcset·배경·og 를 모두 모은다', () => {
  const html = `<title>x</title>
    <img src="/a.jpg" alt="조감도">
    <img srcset="/b-1x.jpg 1x, /b-2x.jpg 2x" alt="전경">
    <div style="background-image:url('/c.jpg')"></div>
    <meta property="og:image" content="/d.png">`;
  const urls = collectImageCandidates(html, 'https://e.com/p').map(item => item.url);
  for (const suffix of ['/a.jpg', '/b-1x.jpg', '/b-2x.jpg', '/c.jpg', '/d.png']) {
    assert.ok(urls.some(url => url.endsWith(suffix)), suffix);
  }
});

test('경로 모양으로 출처 종류를 나눈다', () => {
  assert.equal(classifySource('https://e.com/img/gallery/aerial-1.jpg', 'img'), 'official_gallery');
  assert.equal(classifySource('https://e.com/img/siteplan.jpg', 'img'), 'official_sitemap');
  assert.equal(classifySource('https://e.com/assets/images/main/visual.jpg', 'img'), 'official_hero');
  assert.equal(classifySource('https://e.com/etc/x.jpg', 'img'), 'official_press');
});

test('후보가 여럿이면 출처 우선순위 → confidence 순으로 고른다', () => {
  const make = (sourceType: ListingVisualRecord['sourceType'], confidence: number, verified = true): ListingVisualRecord => ({
    listingId: 'x', imageUrl: `https://e.com/${sourceType}.jpg`, sourceUrl: 'https://e.com', sourceType, verified,
    fetchedAt: '2026-09-26T00:00:00.000Z', confidence, evidence: [], announcementNo: '1', announcementTitle: 't',
    width: 1920, height: 1080, byteLength: 300_000, contentType: 'image/jpeg', reusePermission: null, blockedReason: null,
  });
  assert.equal(pickBest([make('official_press', 1), make('official_hero', 0.7)])?.sourceType, 'official_hero');
  assert.equal(pickBest([make('official_hero', 0.7), make('official_hero', 0.9)])?.confidence, 0.9);
  assert.equal(pickBest([make('official_hero', 1, false)]), null);
});

test('PNG·JPEG 머리에서 가로·세로를 읽는다', () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  const view = new DataView(png.buffer);
  view.setUint32(16, 1920);
  view.setUint32(20, 1080);
  assert.deepEqual(imageDimensions(png), { width: 1920, height: 1080 });

  // SOF0: ff d8 | ff c0 len len precision | height height width width
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0, 0]);
  assert.deepEqual(imageDimensions(jpeg), { width: 1920, height: 1080 });

  assert.equal(imageDimensions(new Uint8Array([1, 2, 3])), null);
  assert.equal(sameOrigin('https://a.com/x', 'https://a.com/y'), true);
  assert.equal(sameOrigin('https://a.com/x', 'https://b.com/x'), false);
});

test('지금 기록에는 공고 4건과 후보들이 메타데이터를 갖춰 들어 있다', () => {
  const records = listingVisualRecords();
  const byAnnouncement = new Map<string, ListingVisualRecord[]>();
  for (const record of records) {
    for (const key of ['listingId', 'imageUrl', 'sourceUrl', 'sourceType', 'verified', 'fetchedAt', 'confidence', 'evidence', 'blockedReason']) {
      assert.ok(key in record, `${record.listingId}: ${key} 가 없다`);
    }
    assert.ok(record.listingId.includes(record.announcementNo), `${record.listingId}: 공고번호와 어긋난다`);
    if (!byAnnouncement.has(record.announcementNo)) byAnnouncement.set(record.announcementNo, []);
    byAnnouncement.get(record.announcementNo)!.push(record);
    if (record.verified) assert.equal(record.blockedReason, null);
    else assert.ok(record.blockedReason, `${record.imageUrl}: 막힌 이유가 없다`);
  }
  assert.deepEqual([...byAnnouncement.keys()].sort(), ['2026000404', '2026000438', '2026000446', '2026000453']);
  for (const [no, list] of byAnnouncement) assert.ok(list.length <= 3, `${no}: 후보가 3개를 넘는다`);
});

test('검증을 통과한 공고만 이미지를 내보낸다', () => {
  const shown = ['apt-2026000404-2026000404', 'apt-2026000453-2026000453']
    .map(id => resolvedListingImage({ id }));
  for (const image of shown) {
    assert.ok(image, '검증을 통과한 공고는 이미지를 돌려줘야 한다');
    assert.match(image!.url, /^https:\/\//);
    assert.ok(image!.attribution.includes('공식 분양 홈페이지'), '출처를 함께 들고 다녀야 한다');
    assert.ok(image!.confidence >= MIN_CONFIDENCE);
  }
  for (const id of ['apt-2026000438-2026000438', 'apt-2026000446-2026000446']) {
    assert.equal(resolvedListingImage({ id }), undefined, `${id}: 검증을 통과하지 못하면 내보내지 않는다`);
  }
});

test('기록 파일이 실제 공고와 묶여 있다', () => {
  const raw = JSON.parse(readFileSync(new URL('../../data/listing-visuals/resolved.json', import.meta.url), 'utf8'));
  assert.equal(raw.schemaVersion, 2);
  assert.ok(raw.visuals.length >= 4);
});
