import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMDO_REVIEW_SEED } from '../fixtures/samdoReviewSeed.generated.ts';
import { clearReviewDraft, readReviewDraft, reviewDraftStorageKey, writeReviewDraft } from './reviewDraftStore.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('drafts are isolated by authenticated actor and rule set session key', () => {
  const previous = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  try {
    const edited = SAMDO_REVIEW_SEED.rules[0]!.originalCandidate;
    writeReviewDraft({ ruleId: 'rule-a', edited }, 'user-a:rule-set-1');
    assert.equal(readReviewDraft('user-a:rule-set-1')?.ruleId, 'rule-a');
    assert.equal(readReviewDraft('user-b:rule-set-1'), null);
    assert.notEqual(reviewDraftStorageKey('user-a:rule-set-1'), reviewDraftStorageKey('user-b:rule-set-1'));
    clearReviewDraft('user-a:rule-set-1');
    assert.equal(readReviewDraft('user-a:rule-set-1'), null);
  } finally {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: previous });
  }
});
