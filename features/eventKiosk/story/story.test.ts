import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { emptyListingMedia, listingMediaOf, normalizeListingMedia } from '../media/listingMedia.ts';
import { SAMDO_EVENT } from '../samdoEventScope.ts';
import { STORY_CONDITIONS, storyDataFrom, storyShortDate } from './storyData.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage.ts';
import { forgetStorySeen, hasSeenStory, markStorySeen, STORY_SEEN_KEY } from './storyPreference.ts';
import { isLastScene, nextSceneIndex, STORY_AUTOPLAY_MS, STORY_SCENES } from './storyScript.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);

test('story is five 1·2지구 scenes, about 10–12 seconds to the final picture, one message each', () => {
  assert.deepEqual(STORY_SCENES.map(scene => scene.id), ['districts', 'profile', 'check', 'compare', 'result']);
  assert.deepEqual(STORY_SCENES.map(scene => scene.message('삼도이동').replace(/\n/g, ' ')), [
    '삼도이동에는 1지구와 2지구가 있습니다',
    '내 조건은 한 번만 입력하면 됩니다',
    '완판e가 두 지구의 신청유형을 각각 확인합니다',
    '자격·순위·공급조건을 나란히 비교하고',
    '나에게 맞는 선택지와 신청 일정을 보여드립니다',
  ]);
  const lastBuild = STORY_SCENES.at(-1)!.buildMs;
  assert.ok(STORY_AUTOPLAY_MS + lastBuild >= 10_000 && STORY_AUTOPLAY_MS + lastBuild <= 12_500, `${STORY_AUTOPLAY_MS + lastBuild}ms`);
  for (const scene of STORY_SCENES.slice(0, -1)) assert.ok(scene.buildMs < scene.holdMs, `${scene.id}: picture completes before the scene moves on`);
  assert.equal(STORY_SCENES.at(-1)!.holdMs, 0, 'last scene waits for the CTA');
  assert.equal(nextSceneIndex(STORY_SCENES.length - 1), null);
  assert.ok(isLastScene(STORY_SCENES.length - 1));
  for (const scene of STORY_SCENES) {
    assert.ok(scene.message('삼도이동').length <= 40, `${scene.id}: one short sentence`);
    assert.ok(scene.description('삼도이동').length > 10, `${scene.id}: has a screen-reader description`);
  }
});

test('story numbers come from the district adapter (1지구 final 1.8 package, 2지구 brief), never hard-coded', () => {
  const data = storyDataFrom(load.event);
  assert.deepEqual(data.districts.map(item => item.id), ['D1', 'D2']);
  const [d1, d2] = data.districts;
  assert.deepEqual(d1.inventory, { total: SAMDO_DEEP_RULE_PACKAGE.inventory.total, units49: SAMDO_DEEP_RULE_PACKAGE.inventory.units49, units59: SAMDO_DEEP_RULE_PACKAGE.inventory.units59 });
  assert.deepEqual(d1.inventory, { total: 32, units49: 8, units59: 24 });
  assert.deepEqual(d2.inventory, { total: 40, units49: 8, units59: 32 });
  assert.deepEqual(d1.schedule, { special: '2026-11-16', generalFirst: '2026-11-17', generalSecond: '2026-11-18', winnerAnnouncement: '2026-11-24' });
  assert.deepEqual(d2.schedule, { special: null, generalFirst: null, generalSecond: null, winnerAnnouncement: null }, '2지구 일정은 Codex 연결 전까지 비워 둔다');
  assert.equal(storyShortDate(d1.schedule.special), '11.16');
  assert.deepEqual(data.supplies.map(item => item.short), ['청년', '신혼부부', '신생아', '생애최초', '일반공급']);
  assert.deepEqual(STORY_CONDITIONS.map(field => field.label), ['나이', '혼인', '자녀', '무주택', '소득', '자산', '청약통장']);
  assert.ok(!/\d{4}-\d{2}-\d{2}|만원|원$/.test(JSON.stringify(STORY_CONDITIONS)), 'conditions are labels only');
  const copy = STORY_SCENES.map(scene => scene.message(data.region) + scene.description(data.region)).join('');
  for (const stale of ['10월 12일', 'VER1.7', '공공분양', '기관추천', '1지구 전용']) assert.ok(!copy.includes(stale), stale);
});

test('story plays once per browser and survives storage failures', () => {
  const memory = new Map<string, string>();
  const store = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value), removeItem: (key: string) => void memory.delete(key) };
  forgetStorySeen(store);
  assert.equal(hasSeenStory(store), false);
  markStorySeen(store);
  assert.equal(memory.get(STORY_SEEN_KEY), 'seen');
  assert.equal(hasSeenStory(store), true);
  forgetStorySeen(store);
  assert.equal(hasSeenStory(store), false);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  assert.equal(hasSeenStory(broken), false);
  markStorySeen(broken);
  assert.equal(hasSeenStory(broken), true, 'remembered for this session even when storage is blocked');
  forgetStorySeen(broken);
});

test('listing media accepts only official safe images and otherwise keeps the housing fallback', () => {
  const media = normalizeListingMedia([
    { uri: 'https://example.com/a.jpg', alt: '전경', sourceLabel: 'LH', sourceUrl: 'https://example.com/project', kind: 'photo', primary: true },
    { url: 'https://example.com/b.jpg', sourceLabel: '제공처', sourceUrl: 'https://example.com/project', kind: 'render' },
    { uri: 'javascript:alert(1)' },
    { uri: 'http://evil.example/c.jpg' },
    { uri: 'data:text/html,hi' },
    'not-an-object',
    { alt: 'no uri' },
  ], '대표 이미지');
  assert.deepEqual(media.gallery.map(item => [item.uri, item.alt, item.sourceLabel, item.kind]), [
    ['https://example.com/a.jpg', '전경', 'LH', 'photo'],
    ['https://example.com/b.jpg', '대표 이미지', '제공처', 'render'],
  ]);
  assert.equal(normalizeListingMedia(Array.from({ length: 20 }, (_, i) => ({ uri: `https://x.example/${i}.jpg`, sourceLabel: '공식', sourceUrl: 'https://x.example/project' })), 'a').gallery.length, 8);
  assert.deepEqual(normalizeListingMedia(null, 'a'), emptyListingMedia('a'));
  const official = load.event.config.listings.find(listing => listing.sourceId === 'lh:pan:2015122300020804');
  assert.ok(official);
  assert.equal(listingMediaOf(official).gallery.length, 3);
  assert.equal(listingMediaOf(official).primary?.sourceLabel, 'LH청약플러스');
  for (const listing of load.event.config.listings.filter(item => item !== official)) {
    assert.deepEqual(listingMediaOf(listing), emptyListingMedia(`${listing.title} 대표 이미지`));
  }
  assert.equal(listingMediaOf({ title: '테스트', media: [{ uri: 'https://example.com/x.jpg', sourceLabel: '공식', sourceUrl: 'https://example.com/project' }] }).primary?.alt, '테스트 대표 이미지');
});

test('live/frozen portfolio titles never enter the event story', () => {
  const data = storyDataFrom(load.event);
  const serialized = JSON.stringify(data);
  for (const listing of load.event.config.listings) assert.equal(serialized.includes(listing.title), false, listing.title);
  assert.ok(data.program.includes('1·2지구'));
});
