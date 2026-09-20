/**
 * Error codes raised by 20260920143000_assessment_rule_review_staging.sql.
 *
 * PostgreSQL is the canonical source. A drift test extracts every RAISE EXCEPTION
 * token from that migration and requires this inventory to match exactly.
 */
export const REVIEW_DB_ERROR_CODES = [
  'ACTIVATION_BLOCKED',
  'AUTH_REQUIRED',
  'BULK_APPROVAL_UNSAFE',
  'BULK_RULES_REQUIRED',
  'CONFLICT_NOT_FOUND',
  'CRITICAL_RULE_REQUIRES_VALID_EVIDENCE',
  'CUSTOM_RESOLUTION_REQUIRES_VALID_EVIDENCE',
  'DOCUMENT_HASH_NOT_REGISTERED',
  'EDIT_IDENTITY_OR_DOCUMENT_MISMATCH',
  'EDIT_REQUIRED',
  'EVIDENCE_NOT_FOUND',
  'EXCEPTION_NOT_FOUND',
  'FORBIDDEN',
  'INVALID_EVIDENCE_STATUS',
  'INVALID_EXCEPTION_DECISION',
  'MATERIALIZED_RULE_NOT_FOUND',
  'NEW_DOCUMENT_HASH_REQUIRED',
  'REASON_REQUIRED',
  'RESOLUTION_REQUIRED',
  'REVIEW_ALREADY_STARTED',
  'REVIEW_NOT_IN_PROGRESS',
  'REVIEW_SEED_ALREADY_EXISTS',
  'RULE_HAS_SAFETY_BLOCKERS',
  'RULE_NOT_FOUND',
  'RULE_REVIEW_WORKSPACE_NOT_FOUND',
  'RULE_SET_DOCUMENT_REQUIRED',
  'STALE_REVIEW_REVISION',
  'UNKNOWN_REVIEW_ACTION',
  'UNRESOLVED_NOT_FOUND',
  'UNRESOLVED_SAFETY_BLOCKERS',
  'VALID_EXCEPTION_RELATION_REQUIRED',
  'VALID_REPLACEMENT_EVIDENCE_REQUIRED',
] as const;

export type ReviewDbErrorCode = typeof REVIEW_DB_ERROR_CODES[number];
export const REVIEW_DB_ERROR_CODE_SET: ReadonlySet<string> = new Set(REVIEW_DB_ERROR_CODES);

/** Known deterministic guards are user/domain rejections, except transport states. */
export const REVIEW_DOMAIN_REJECTION_CODES: ReadonlySet<string> = new Set(
  REVIEW_DB_ERROR_CODES.filter(code => !['AUTH_REQUIRED', 'FORBIDDEN', 'STALE_REVIEW_REVISION'].includes(code)),
);

export type SupabaseErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

const textParts = (error: SupabaseErrorLike | string): string[] => {
  if (typeof error === 'string') return [error];
  return [error.message, error.details, error.hint, error.code]
    .filter((part): part is string => typeof part === 'string')
    .map(part => part.trim())
    .filter(Boolean);
};

/**
 * Extracts only canonical SQL tokens. Human-readable paraphrases are deliberately not
 * accepted, so client tests cannot silently drift away from PostgreSQL behavior.
 */
export function normalizeReviewDbError(error: SupabaseErrorLike | string): string {
  const parts = textParts(error);
  for (const code of REVIEW_DB_ERROR_CODES) {
    const token = new RegExp(`(^|[^A-Z0-9_])${code}($|[^A-Z0-9_])`);
    if (parts.some(part => token.test(part.toUpperCase()))) return code;
  }

  const joined = parts.join(' ');
  if (/failed to fetch|network(?:error)?|load failed|fetch failed/i.test(joined)) return 'RULE_REVIEW_OFFLINE';
  // PostgREST may surface PostgreSQL/RLS errors without invoking our RPC guard.
  if (parts.includes('42501') || /permission denied/i.test(joined)) return 'FORBIDDEN';
  // Authentication infrastructure failures do not always carry the RPC's AUTH_REQUIRED token.
  if (/jwt expired|invalid jwt|no session/i.test(joined)) return 'AUTH_REQUIRED';
  return 'RULE_REVIEW_DB_ERROR';
}
