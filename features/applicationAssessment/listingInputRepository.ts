import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LISTING_INPUT_SCHEMA_VERSION,
  selectListingScopedAnswers,
  type ListingAssessmentInputRecord,
  type ListingInputReference,
} from './listingInputs.ts';

export type SaveListingAssessmentInput = ListingInputReference & {
  userId: string;
  expectedRevision: number;
  answers: Record<string, string>;
};

export interface ListingAssessmentInputRepository {
  read(input: ListingInputReference & { userId: string }): Promise<ListingAssessmentInputRecord | null>;
  save(input: SaveListingAssessmentInput): Promise<ListingAssessmentInputRecord>;
}

export type ListingInputRepositoryErrorCode =
  | 'LISTING_INPUT_AUTH_REQUIRED'
  | 'LISTING_INPUT_REVISION_CONFLICT'
  | 'LISTING_INPUT_RULE_SET_MISMATCH'
  | 'LISTING_INPUT_INVALID_PAYLOAD'
  | 'LISTING_INPUT_READ_FAILED'
  | 'LISTING_INPUT_WRITE_FAILED';

export class ListingInputRepositoryError extends Error {
  readonly code: ListingInputRepositoryErrorCode;
  constructor(
    code: ListingInputRepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = code;
    this.name = 'ListingInputRepositoryError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function dbCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const text = [error.message, error.details, error.hint].filter(value => typeof value === 'string').join(' ');
  return text.match(/\bLISTING_INPUT_[A-Z_]+\b/)?.[0] ?? null;
}

function decode(value: unknown): ListingAssessmentInputRecord {
  if (!isRecord(value) || !isRecord(value.answers)) throw new Error('LISTING_INPUT_RESPONSE_INVALID');
  const revision = Number(value.revision);
  if (!Number.isSafeInteger(revision) || revision < 1 || value.schemaVersion !== LISTING_INPUT_SCHEMA_VERSION) {
    throw new Error('LISTING_INPUT_RESPONSE_INVALID');
  }
  const answers = Object.fromEntries(Object.entries(value.answers).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string'));
  return {
    userId: String(value.userId),
    listingId: String(value.listingId),
    announcementId: String(value.announcementId),
    supplyType: value.supplyType as ListingAssessmentInputRecord['supplyType'],
    schemaVersion: LISTING_INPUT_SCHEMA_VERSION,
    revision,
    answers,
    ruleSetId: String(value.ruleSetId),
    ruleSetVersion: String(value.ruleSetVersion),
    sourceDocumentId: value.sourceDocumentId === null ? null : String(value.sourceDocumentId),
    sourceDocumentHash: value.sourceDocumentHash === null ? null : String(value.sourceDocumentHash),
    compatibility: value.compatibility as ListingAssessmentInputRecord['compatibility'],
    staleAt: value.staleAt === null ? null : String(value.staleAt),
    staleReason: value.staleReason === null ? null : value.staleReason as ListingAssessmentInputRecord['staleReason'],
    createdAt: String(value.createdAt),
    updatedAt: String(value.updatedAt),
  };
}

function mappedError(error: unknown, fallback: 'LISTING_INPUT_READ_FAILED' | 'LISTING_INPUT_WRITE_FAILED') {
  const code = dbCode(error);
  if (code === 'LISTING_INPUT_AUTH_REQUIRED') return new ListingInputRepositoryError(code, '로그인이 필요합니다.', { cause: error });
  if (code === 'LISTING_INPUT_REVISION_CONFLICT') return new ListingInputRepositoryError(code, '다른 기기에서 공고 답변이 먼저 변경되었습니다.', { cause: error });
  if (code === 'LISTING_INPUT_RULE_SET_MISMATCH') return new ListingInputRepositoryError(code, '공고 기준이 변경되어 답변을 다시 확인해야 합니다.', { cause: error });
  if (code === 'LISTING_INPUT_INVALID_PAYLOAD') return new ListingInputRepositoryError(code, '공고 답변 형식이 올바르지 않습니다.', { cause: error });
  return new ListingInputRepositoryError(fallback, fallback === 'LISTING_INPUT_READ_FAILED'
    ? '공고별 답변을 불러오지 못했습니다.' : '공고별 답변을 저장하지 못했습니다.', { cause: error });
}

export function createSupabaseListingAssessmentInputRepository(
  client: SupabaseClient,
): ListingAssessmentInputRepository {
  return {
    async read(input) {
      const { data, error } = await client.rpc('read_user_listing_assessment_input', {
        p_listing_id: input.listingId,
        p_supply_type: input.supplyType,
        p_rule_set_id: input.ruleSetId,
      });
      if (error) throw mappedError(error, 'LISTING_INPUT_READ_FAILED');
      if (data === null) return null;
      try {
        const record = decode(data);
        if (record.userId !== input.userId) throw new Error('LISTING_INPUT_OWNER_MISMATCH');
        return record;
      } catch (cause) {
        throw new ListingInputRepositoryError('LISTING_INPUT_READ_FAILED', '공고별 답변을 확인하지 못했습니다.', { cause });
      }
    },

    async save(input) {
      const answers = selectListingScopedAnswers(input.answers);
      const { data, error } = await client.rpc('save_user_listing_assessment_input', {
        p_listing_id: input.listingId,
        p_supply_type: input.supplyType,
        p_rule_set_id: input.ruleSetId,
        p_expected_revision: input.expectedRevision,
        p_schema_version: LISTING_INPUT_SCHEMA_VERSION,
        p_answers: answers,
      });
      if (error) throw mappedError(error, 'LISTING_INPUT_WRITE_FAILED');
      try {
        const record = decode(data);
        if (record.userId !== input.userId) throw new Error('LISTING_INPUT_OWNER_MISMATCH');
        return record;
      } catch (cause) {
        throw new ListingInputRepositoryError('LISTING_INPUT_WRITE_FAILED', '저장된 공고별 답변을 확인하지 못했습니다.', { cause });
      }
    },
  };
}

export class InMemoryListingAssessmentInputRepository implements ListingAssessmentInputRepository {
  private readonly rows = new Map<string, ListingAssessmentInputRecord>();
  private key(input: { userId: string; listingId: string; supplyType: string }) {
    return `${input.userId}\u0000${input.listingId}\u0000${input.supplyType}`;
  }
  async read(input: ListingInputReference & { userId: string }) {
    const row = this.rows.get(this.key(input));
    return row ? structuredClone(row) : null;
  }
  async save(input: SaveListingAssessmentInput) {
    const key = this.key(input);
    const current = this.rows.get(key);
    const actual = current?.revision ?? 0;
    if (actual !== input.expectedRevision) throw new ListingInputRepositoryError(
      'LISTING_INPUT_REVISION_CONFLICT', '다른 기기에서 공고 답변이 먼저 변경되었습니다.',
    );
    const now = new Date().toISOString();
    const next: ListingAssessmentInputRecord = {
      ...input,
      schemaVersion: LISTING_INPUT_SCHEMA_VERSION,
      revision: actual + 1,
      answers: selectListingScopedAnswers(input.answers),
      compatibility: 'CURRENT',
      staleAt: null,
      staleReason: null,
      sourceDocumentHash: input.sourceDocumentHash ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    this.rows.set(key, structuredClone(next));
    return structuredClone(next);
  }
}
