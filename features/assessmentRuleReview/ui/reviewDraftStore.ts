import type { ReviewableRuleSnapshot } from '../server/types.ts';

/**
 * Keeps an unsaved edit alive across a re-authentication round trip.
 *
 * A session can expire while a reviewer is halfway through correcting a rule. Losing
 * that work would push them to re-type values they already checked against the source,
 * which is exactly when transcription mistakes happen. The draft is per-browser and
 * per-rule, holds no credentials, and is cleared once the edit is saved or discarded.
 */
const KEY = 'wanpane:admin-rule-review:draft:v1';

export type ReviewDraft = { ruleId: string; edited: ReviewableRuleSnapshot; savedAt: string };

const storage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
};

export function writeReviewDraft(draft: Omit<ReviewDraft, 'savedAt'>): void {
  try { storage()?.setItem(KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() })); } catch { /* storage unavailable */ }
}

export function readReviewDraft(): ReviewDraft | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewDraft;
    return parsed?.ruleId && parsed?.edited ? parsed : null;
  } catch { return null; }
}

export function clearReviewDraft(): void {
  try { storage()?.removeItem(KEY); } catch { /* storage unavailable */ }
}
