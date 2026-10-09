import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { emptyListingMedia, listingMediaOf, normalizeListingMedia } from '../media/listingMedia.ts';
import type { ServiceListing, ServiceListingPortfolio } from '../live/types.ts';
import { storyDataFrom, STORY_PROFILE_FIELDS } from './storyData.ts';
import { forgetStorySeen, hasSeenStory, markStorySeen, STORY_SEEN_KEY } from './storyPreference.ts';
import { isLastScene, nextSceneIndex, STORY_AUTOPLAY_MS, STORY_SCENES } from './storyScript.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);

test('story is five scenes, 10–20 seconds to the final CTA, one message each', () => {
  assert.deepEqual(STORY_SCENES.map(scene => scene.id), ['complexity', 'profile', 'analysis', 'sorting', 'action']);
  const lastBuild = STORY_SCENES.at(-1)!.buildMs;
  assert.ok(STORY_AUTOPLAY_MS + lastBuild >= 10_000 && STORY_AUTOPLAY_MS + lastBuild <= 20_000, `${STORY_AUTOPLAY_MS + lastBuild}ms`);
  for (const scene of STORY_SCENES.slice(0, -1)) assert.ok(scene.buildMs < scene.holdMs, `${scene.id}: picture completes before the scene moves on`);
  assert.equal(STORY_SCENES.at(-1)!.holdMs, 0, 'last scene waits for the CTA');
  assert.equal(nextSceneIndex(STORY_SCENES.length - 1), null);
  assert.ok(isLastScene(STORY_SCENES.length - 1));
  for (const scene of STORY_SCENES) {
    assert.ok(scene.message('지역').length <= 40, `${scene.id}: one short sentence`);
    assert.ok(scene.description('지역').length > 10, `${scene.id}: has a screen-reader description`);
  }
});

test('story data comes from the event dataset and carries no personal values', () => {
  const data = storyDataFrom(load.event);
  assert.equal(data.listings.length, 5);
  assert.ok(data.listings.every(item => item.supplyCount >= 1));
  assert.ok(data.supplies.length >= 3 && data.supplies.length <= 6);
  assert.match(data.featured.schedule, /^접수 \d{2}\.\d{2} ~ \d{2}\.\d{2}$/);
  assert.equal(data.region, load.event.config.regionLabel);
  assert.deepEqual(STORY_PROFILE_FIELDS.map(field => field.label), ['나이', '혼인', '자녀', '무주택', '청약통장']);
  assert.ok(!/\d{4}-\d{2}-\d{2}|만원|원$/.test(JSON.stringify(STORY_PROFILE_FIELDS)), 'profile fields are labels only');
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

test('live listing titles and schedules feed the story without creating a real eligibility result', () => {
  const live: ServiceListing = {
    canonicalKey: 'official:1', origin: 'LIVE', source: 'APPLYHOME', sourceUrl: 'https://official.example/notice', provider: '공식기관',
    noticeId: '1', sourceId: 'official:1', title: '실제 제주 최신 공고', housingName: '실제 제주 주택', region: '제주특별자치도', address: '제주시',
    announcementDate: '2026-10-09', applicationStart: '2026-10-12', applicationEnd: '2026-10-13', resultDate: null, supplyTypes: ['일반공급'], units: [],
    eligibilitySource: 'https://official.example/notice', originalDocuments: [], lifecycle: 'RULE_PENDING', applicationStatus: 'UPCOMING',
    assessmentAvailability: 'INFORMATION_ONLY', assessmentListingId: null, rulePackageId: null, media: emptyListingMedia('실제 제주 주택'), fetchedAt: '2026-10-09T00:00:00.000Z',
  };
  const portfolio: ServiceListingPortfolio = { schemaVersion: 1, generatedAt: live.fetchedAt, listings: [live], sources: [], usedFrozenFallback: false };
  const data = storyDataFrom(load.event, portfolio);
  assert.equal(data.listings[0]?.title, live.title);
  assert.equal(data.featured.title, live.title);
  assert.equal(data.featured.schedule, '접수 10.12 ~ 10.13');
  assert.equal(data.featured.origin, 'LIVE');
});
