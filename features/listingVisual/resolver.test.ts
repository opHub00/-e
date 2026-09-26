import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildVisualRecord, looksSiteWideBrandImage, pickBest, representativeImageUrl, sameOrigin, type ListingVisualRecord } from './resolver.ts';
import { listingVisualRecords, resolvedListingImage } from './resolvedRegistry.ts';

const base = {
  listingId: 'apt-2026000404-2026000404',
  announcementNo: '2026000404',
  announcementTitle: '검암역 푸르지오 프라베뉴 (B-1BL) 공공분양주택',
  officialHomepage: 'https://www.prugio.com/hb/2026/pravenue',
  sourceType: 'official_project_page' as const,
  fetchedAt: '2026-09-26T00:00:00.000Z',
  fetch: { ok: true, contentType: 'image/jpeg', byteLength: 300_000 },
};

test('공식 홈페이지가 내건 단지 이미지는 허가가 기록되면 통과한다', () => {
  const record = buildVisualRecord({
    ...base,
    imageUrl: 'https://www.prugio.com/hb/2026/pravenue/assets/images/main/complex-img-01.jpg',
    sourceUrl: base.officialHomepage,
    reusePermission: { basis: 'written-permission', referenceUrl: 'https://example.com/permission' },
  });
  assert.equal(record.verified, true);
  assert.equal(record.blockedReason, null);
  assert.equal(record.checks.officialHomepageMatch, true);
  assert.equal(record.sourceType, 'official_project_page');
});

test('허가가 없으면 화면에 내보내지 않고 이유를 남긴다', () => {
  const record = buildVisualRecord({
    ...base,
    imageUrl: 'https://www.prugio.com/hb/2026/pravenue/assets/images/main/complex-img-01.jpg',
    sourceUrl: base.officialHomepage,
  });
  assert.equal(record.verified, false);
  assert.match(record.blockedReason ?? '', /재사용 허가/);
});

test('다른 사이트 이미지는 단지명이 비슷해도 쓰지 않는다', () => {
  const record = buildVisualRecord({
    ...base,
    imageUrl: 'https://blog.example.com/photos/prugio-pravenue.jpg',
    sourceUrl: 'https://blog.example.com/post/1',
    reusePermission: { basis: 'open-license', referenceUrl: 'https://example.com/license' },
  });
  assert.equal(record.verified, false);
  assert.match(record.blockedReason ?? '', /공식 홈페이지에서 온 이미지가 아니에요/);
});

test('사이트 공통 브랜드·SEO 이미지는 단지 사진으로 쓰지 않는다', () => {
  for (const url of [
    'https://hillstate.co.kr/common/hillstate/hlst_seo.png',
    'https://example.com/img/common/og.png',
    'https://example.com/assets/images/common/og.png',
    'https://example.com/upload/logo.png',
  ]) assert.equal(looksSiteWideBrandImage(url), true, url);
  assert.equal(looksSiteWideBrandImage('https://example.com/upload/2026/09/complex-view.jpg'), false);
});

test('받아지지 않거나 이미지가 아닌 응답은 통과하지 못한다', () => {
  const notImage = buildVisualRecord({
    ...base, imageUrl: 'https://www.prugio.com/hb/2026/pravenue/assets/images/main/complex-img-01.jpg',
    sourceUrl: base.officialHomepage, fetch: { ok: true, contentType: 'text/html', byteLength: 900 },
    reusePermission: { basis: 'open-license', referenceUrl: 'https://example.com/license' },
  });
  assert.equal(notImage.verified, false);
  assert.match(notImage.blockedReason ?? '', /실제로 받아 확인하지 못했어요/);
});

test('og:image 를 절대 주소로 바꾼다', () => {
  const html = '<meta property="og:image" content="/img/view.jpg">';
  assert.equal(representativeImageUrl(html, 'https://example.com/hb/2026/x'), 'https://example.com/img/view.jpg');
  assert.equal(representativeImageUrl('<html></html>', 'https://example.com'), null);
  assert.equal(sameOrigin('https://a.com/x', 'https://a.com/y'), true);
  assert.equal(sameOrigin('https://a.com/x', 'https://b.com/x'), false);
});

test('후보가 여럿이면 공고 페이지 → 분양 페이지 → 등록 사진 순으로 고른다', () => {
  const make = (sourceType: ListingVisualRecord['sourceType']): ListingVisualRecord => ({
    listingId: 'x', imageUrl: 'https://e.com/a.jpg', sourceUrl: 'https://e.com', sourceType, verified: true,
    fetchedAt: '2026-09-26T00:00:00.000Z', announcementNo: '1', announcementTitle: 't',
    checks: { officialHomepageMatch: true, imageFetched: true, contentType: 'image/jpeg', byteLength: 3000 },
    reusePermission: { basis: 'open-license', referenceUrl: 'https://e.com/l' }, blockedReason: null,
  });
  assert.equal(pickBest([make('verified_registry'), make('official_project_page'), make('official_announcement')])?.sourceType, 'official_announcement');
  assert.equal(pickBest([{ ...make('official_announcement'), verified: false }]), null, '검증되지 않은 후보는 고르지 않는다');
});

test('지금 기록된 4건은 메타데이터를 모두 갖추고, 허가가 없어 화면에 나가지 않는다', () => {
  const records = listingVisualRecords();
  assert.equal(records.length, 4);
  for (const record of records) {
    for (const key of ['listingId', 'imageUrl', 'sourceUrl', 'sourceType', 'verified', 'fetchedAt']) {
      assert.ok(key in record, `${record.listingId}: ${key} 가 없다`);
    }
    assert.match(record.listingId, /^apt-\d+-\d+$/);
    assert.match(record.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(record.verified, false, '허가 없이 verified 가 되면 안 된다');
    assert.ok(record.blockedReason, '막힌 이유가 적혀 있어야 한다');
    assert.equal(resolvedListingImage({ id: record.listingId }), undefined, '화면에 나가면 안 된다');
  }
});

test('기록 파일이 실제 공고와 묶여 있다', () => {
  const raw = JSON.parse(readFileSync(new URL('../../data/listing-visuals/resolved.json', import.meta.url), 'utf8'));
  const numbers = raw.visuals.map((item: ListingVisualRecord) => item.announcementNo).sort();
  assert.deepEqual(numbers, ['2026000404', '2026000438', '2026000446', '2026000453']);
  for (const item of raw.visuals as ListingVisualRecord[]) {
    assert.ok(item.listingId.includes(item.announcementNo), `${item.listingId}: 공고번호와 listing id 가 어긋난다`);
  }
});
