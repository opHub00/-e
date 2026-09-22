import { CRITICAL_BLOCKER_CODES, type CriticalBlockerCode } from '../server/types.ts';

/**
 * Announcement-specific review findings, supplied as data next to the import
 * package. The generic seed builder knows no announcement; everything it must
 * not guess (a transcription mismatch, a disputed reference date, an unmapped
 * management number) arrives through this structure.
 *
 * An annotation is pinned to one source document by hash, so findings written
 * for one announcement or document version can never attach to another.
 */
export type ReviewSeedSafetyBlocker = {
  ruleKey: string;
  codes: CriticalBlockerCode[];
  /** Why the reviewer must look at this rule. Kept for the audit trail. */
  reason: string;
};

/** An exception rule that qualifies a base rule, beyond the generic concept relations. */
export type ReviewSeedException = { ruleKey: string; exceptionRuleKey: string };

export type ReviewSeedWarning = { ruleKey: string; message: string };

export type ReviewSeedConflict = {
  conflictId: string;
  concept: string;
  candidateRuleKeys: string[];
  candidates: {
    candidateId: string;
    value: unknown;
    /** Evidence is referenced through the rules that cite it, never by raw id. */
    evidenceRuleKeys: string[];
  }[];
};

export type ReviewSeedUnresolved = {
  unresolvedId: string;
  type: string;
  description: string;
  ruleKeys: string[];
};

export type ReviewSeedAnnotation = {
  schemaVersion: 1;
  announcementId: string;
  documentSha256: string;
  ruleSetVersion: string;
  safetyBlockers: ReviewSeedSafetyBlocker[];
  exceptions: ReviewSeedException[];
  warnings: ReviewSeedWarning[];
  conflicts: ReviewSeedConflict[];
  unresolved: ReviewSeedUnresolved[];
};

/** An announcement with no extra findings still states its identity explicitly. */
export function emptyReviewSeedAnnotation(identity: Pick<ReviewSeedAnnotation, 'announcementId' | 'documentSha256' | 'ruleSetVersion'>): ReviewSeedAnnotation {
  return { schemaVersion: 1, ...identity, safetyBlockers: [], exceptions: [], warnings: [], conflicts: [], unresolved: [] };
}

const fail = (code: string): never => { throw new Error(`REVIEW_ANNOTATION_INVALID:${code}`); };
const object = (value: unknown, at: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : fail(at);
const text = (value: unknown, at: string): string => typeof value === 'string' && value.trim() && value.length <= 500 ? value : fail(at);
const list = (value: unknown, at: string): unknown[] => Array.isArray(value) && value.length <= 500 ? value : fail(at);
const texts = (value: unknown, at: string) => list(value, at).map((item, index) => text(item, `${at}[${index}]`));
function exact(value: Record<string, unknown>, keys: string[], at: string) {
  const extra = Object.keys(value).filter(key => !keys.includes(key));
  if (extra.length) fail(`${at}.${extra[0]}`);
}

/** Strict decoder for annotation files. Unknown keys and blocker codes are rejected. */
export function decodeReviewSeedAnnotation(raw: unknown): ReviewSeedAnnotation {
  const root = object(raw, 'root');
  exact(root, ['schemaVersion', 'announcementId', 'documentSha256', 'ruleSetVersion', 'safetyBlockers', 'exceptions', 'warnings', 'conflicts', 'unresolved'], 'root');
  if (root.schemaVersion !== 1) fail('schemaVersion');
  const sha = text(root.documentSha256, 'documentSha256');
  if (!/^[0-9a-f]{64}$/.test(sha)) fail('documentSha256');
  return {
    schemaVersion: 1,
    announcementId: text(root.announcementId, 'announcementId'),
    documentSha256: sha,
    ruleSetVersion: text(root.ruleSetVersion, 'ruleSetVersion'),
    safetyBlockers: list(root.safetyBlockers, 'safetyBlockers').map((item, index) => {
      const at = `safetyBlockers[${index}]`, value = object(item, at);
      exact(value, ['ruleKey', 'codes', 'reason'], at);
      const codes = texts(value.codes, `${at}.codes`);
      if (!codes.length || codes.some(code => !(CRITICAL_BLOCKER_CODES as readonly string[]).includes(code))) fail(`${at}.codes`);
      return { ruleKey: text(value.ruleKey, `${at}.ruleKey`), codes: codes as CriticalBlockerCode[], reason: text(value.reason, `${at}.reason`) };
    }),
    exceptions: list(root.exceptions, 'exceptions').map((item, index) => {
      const at = `exceptions[${index}]`, value = object(item, at);
      exact(value, ['ruleKey', 'exceptionRuleKey'], at);
      return { ruleKey: text(value.ruleKey, `${at}.ruleKey`), exceptionRuleKey: text(value.exceptionRuleKey, `${at}.exceptionRuleKey`) };
    }),
    warnings: list(root.warnings, 'warnings').map((item, index) => {
      const at = `warnings[${index}]`, value = object(item, at);
      exact(value, ['ruleKey', 'message'], at);
      return { ruleKey: text(value.ruleKey, `${at}.ruleKey`), message: text(value.message, `${at}.message`) };
    }),
    conflicts: list(root.conflicts, 'conflicts').map((item, index) => {
      const at = `conflicts[${index}]`, value = object(item, at);
      exact(value, ['conflictId', 'concept', 'candidateRuleKeys', 'candidates'], at);
      const candidates = list(value.candidates, `${at}.candidates`).map((entry, candidateIndex) => {
        const where = `${at}.candidates[${candidateIndex}]`, candidate = object(entry, where);
        exact(candidate, ['candidateId', 'value', 'evidenceRuleKeys'], where);
        if (candidate.value === undefined) fail(`${where}.value`);
        const evidenceRuleKeys = texts(candidate.evidenceRuleKeys, `${where}.evidenceRuleKeys`);
        if (!evidenceRuleKeys.length) fail(`${where}.evidenceRuleKeys`);
        return { candidateId: text(candidate.candidateId, `${where}.candidateId`), value: candidate.value, evidenceRuleKeys };
      });
      // A conflict needs at least two readings, otherwise there is nothing to resolve.
      if (candidates.length < 2) fail(`${at}.candidates`);
      return { conflictId: text(value.conflictId, `${at}.conflictId`), concept: text(value.concept, `${at}.concept`),
        candidateRuleKeys: texts(value.candidateRuleKeys, `${at}.candidateRuleKeys`), candidates };
    }),
    unresolved: list(root.unresolved, 'unresolved').map((item, index) => {
      const at = `unresolved[${index}]`, value = object(item, at);
      exact(value, ['unresolvedId', 'type', 'description', 'ruleKeys'], at);
      return { unresolvedId: text(value.unresolvedId, `${at}.unresolvedId`), type: text(value.type, `${at}.type`),
        description: text(value.description, `${at}.description`), ruleKeys: texts(value.ruleKeys, `${at}.ruleKeys`) };
    }),
  };
}
