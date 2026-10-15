import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { emptyListingMedia, listingMediaOf, normalizeListingMedia } from '../media/listingMedia.ts';
import { SAMDO_EVENT } from '../samdoEventScope.ts';
import { STORY_CONDITIONS, STORY_CRITERIA, storyDataFrom } from './storyData.ts';
import { forgetStorySeen, hasSeenStory, markStorySeen, STORY_SEEN_KEY } from './storyPreference.ts';
import { isLastScene, nextSceneIndex, STORY_AUTOPLAY_MS, STORY_SCENES } from './storyScript.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);

test('story is five Samdo scenes, about 10–12 seconds to the final picture, one message each', () => {
  assert.deepEqual(STORY_SCENES.map(scene => scene.id), ['supplies', 'conditions', 'check', 'compare', 'result']);
  assert.deepEqual(STORY_SCENES.map(scene => scene.message('삼도이동 1지구').replace(/\n/g, ' ')), [
    '같은 공고라도 신청할 수 있는 유형은 다릅니다',
    '내 조건에 따라 자격과 순위가 달라집니다',
    '완판e가 삼도이동 1지구 공고 기준으로 하나씩 확인합니다',
    '신청 가능한 유형을 비교하고',
    '가장 유리한 신청유형과 이유를 보여드립니다',
  ]);
  const lastBuild = STORY_SCENES.at(-1)!.buildMs;
  assert.ok(STORY_AUTOPLAY_MS + lastBuild >= 10_000 && STORY_AUTOPLAY_MS + lastBuild <= 12_500, `${STORY_AUTOPLAY_MS + lastBuild}ms`);
  for (const scene of STORY_SCENES.slice(0, -1)) assert.ok(scene.buildMs < scene.holdMs, `${scene.id}: picture completes before the scene moves on`);
  assert.equal(STORY_SCENES.at(-1)!.holdMs, 0, 'last scene waits for the CTA');
  assert.equal(nextSceneIndex(STORY_SCENES.length - 1), null);
  assert.ok(isLastScene(STORY_SCENES.length - 1));
  for (const scene of STORY_SCENES) {
    assert.ok(scene.message('지역').length <= 40, `${scene.id}: one short sentence`);
    assert.ok(scene.description('지역').length > 10, `${scene.id}: has a screen-reader description`);
  }
});

test('story data is scoped to Samdo only and carries no personal values', () => {
  const data = storyDataFrom(load.event);
  assert.equal(data.title, SAMDO_EVENT.title);
  assert.equal(data.region, SAMDO_EVENT.shortTitle);
  assert.deepEqual(data.supplies.map(item => item.short), ['청년', '신혼부부', '신생아', '생애최초', '일반공급']);
  // 공급 세대수는 규칙 패키지 값 그대로.
  for (const item of data.supplies) assert.equal(item.count, SAMDO_EVENT.recommendationSupplies.find(supply => supply.type === item.type)?.count);
  assert.deepEqual(data.informationOnly, ['기관추천 특별공급']);
  assert.deepEqual(data.schedule, { special: '10월 12일(월)', generalFirst: '10월 13일(화)', generalSecond: '10월 14일(수)' });
  assert.equal(data.example.date, data.schedule.special);
  assert.deepEqual(STORY_CONDITIONS.map(field => field.label), ['나이', '혼인', '자녀', '무주택', '소득', '자산', '청약통장']);
  assert.equal(STORY_CRITERIA.length, 4);
  assert.ok(!/\d{4}-\d{2}-\d{2}|만원|원$/.test(JSON.stringify(STORY_CONDITIONS)), 'conditions are labels only');
  assert.deepEqual(data.compare.map(row => row.short), data.supplies.map(item => item.short), 'every compared type is one of the five');
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
  assert.equal(data.title, SAMDO_EVENT.title);
});
