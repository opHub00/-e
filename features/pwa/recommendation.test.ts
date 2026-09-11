import assert from 'node:assert/strict';
import {
  PWA_RECOMMENDATION_DISMISS_COOLDOWN_MS,
  PWA_RECOMMENDATION_DISMISSED_AT_KEY,
  PWA_RECOMMENDATION_INSTALLED_KEY,
  PWA_RECOMMENDATION_SESSION_KEY,
  readStoredFlag,
  readStoredTimestamp,
  shouldRecommendPwaInstall,
  writeStoredValue,
} from './recommendation.ts';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const now = Date.UTC(2026, 8, 11);
const eligible = {
  platform: 'native' as const,
  installed: false,
  shownThisSession: false,
  dismissedAt: null,
  now,
};

assert.equal(shouldRecommendPwaInstall(eligible), true, 'native installable browser is eligible');
assert.equal(shouldRecommendPwaInstall({ ...eligible, platform: 'ios-safari' }), true, 'iOS Safari is eligible for user-triggered help');
assert.equal(shouldRecommendPwaInstall({ ...eligible, platform: 'unavailable' }), false, 'non-installable browser is hidden');
assert.equal(shouldRecommendPwaInstall({ ...eligible, platform: 'standalone' }), false, 'standalone app is hidden');
assert.equal(shouldRecommendPwaInstall({ ...eligible, installed: true }), false, 'known installed app is hidden');
assert.equal(shouldRecommendPwaInstall({ ...eligible, shownThisSession: true }), false, 'same session never repeats');
assert.equal(
  shouldRecommendPwaInstall({ ...eligible, dismissedAt: now - PWA_RECOMMENDATION_DISMISS_COOLDOWN_MS + 1 }),
  false,
  'recent dismissal starts cooldown',
);
assert.equal(
  shouldRecommendPwaInstall({ ...eligible, dismissedAt: now - PWA_RECOMMENDATION_DISMISS_COOLDOWN_MS }),
  true,
  'recommendation is eligible after seven-day cooldown',
);

const storage = new MemoryStorage();
writeStoredValue(storage, PWA_RECOMMENDATION_SESSION_KEY, '1');
writeStoredValue(storage, PWA_RECOMMENDATION_DISMISSED_AT_KEY, String(now));
writeStoredValue(storage, PWA_RECOMMENDATION_INSTALLED_KEY, '1');
assert.equal(readStoredFlag(storage, PWA_RECOMMENDATION_SESSION_KEY), true);
assert.equal(readStoredFlag(storage, PWA_RECOMMENDATION_INSTALLED_KEY), true);
assert.equal(readStoredTimestamp(storage, PWA_RECOMMENDATION_DISMISSED_AT_KEY), now);
assert.equal(readStoredTimestamp(storage, 'missing'), null);

console.log('PWA install recommendation policy tests passed.');
