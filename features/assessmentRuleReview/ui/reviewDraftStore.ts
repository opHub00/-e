import type { ReviewableRuleSnapshot } from '../server/types.ts';

/**
 * Keeps an unsaved edit alive across a re-authentication round trip.
 *
 * A session can expire while a reviewer is halfway through correcting a rule. Losing
 * that work would push them to re-type values they already checked against the source,
 * which is exactly when transcription mistakes happen. The draft is per-browser and
 * per-rule, holds no credentials, and is cleared once the edit is saved or discarded.
 */
const KEY = 'wanpane:admin-rule-review:draft:v2';
const DEFAULT_SCOPE = 'local:reviewer@wanpane.local';

export const reviewDraftStorageKey = (scope = DEFAULT_SCOPE) => `${KEY}:${encodeURIComponent(scope)}`;

export type ReviewDraft = { ruleId: string; edited: ReviewableRuleSnapshot; savedAt: string };

const storage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
};

export function writeReviewDraft(draft: Omit<ReviewDraft, 'savedAt'>, scope = DEFAULT_SCOPE): void {
  try { storage()?.setItem(reviewDraftStorageKey(scope), JSON.stringify({ ...draft, savedAt: new Date().toISOString() })); } catch { /* storage unavailable */ }
}

export function readReviewDraft(scope = DEFAULT_SCOPE): ReviewDraft | null {
  try {
    const raw = storage()?.getItem(reviewDraftStorageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewDraft;
    return parsed?.ruleId && parsed?.edited ? parsed : null;
  } catch { return null; }
}

export function clearReviewDraft(scope = DEFAULT_SCOPE): void {
  try { storage()?.removeItem(reviewDraftStorageKey(scope)); } catch { /* storage unavailable */ }
}
