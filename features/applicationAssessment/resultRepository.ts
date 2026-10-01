import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersistedUserAssessmentResult } from './resultPersistence.ts';

export type AssessmentResultRepository = {
  save: (result: PersistedUserAssessmentResult) => Promise<PersistedUserAssessmentResult>;
  list: (userId: string, listingId?: string) => Promise<PersistedUserAssessmentResult[]>;
  listStale: (userId: string) => Promise<PersistedUserAssessmentResult[]>;
};

export class AssessmentResultRepositoryError extends Error {
  readonly code:
    | 'ASSESSMENT_RESULT_AUTH_REQUIRED'
    | 'ASSESSMENT_RESULT_PROFILE_REVISION_MISMATCH'
    | 'ASSESSMENT_RESULT_RULE_SET_MISMATCH'
    | 'ASSESSMENT_RESULT_SOURCE_DOCUMENT_MISMATCH'
    | 'ASSESSMENT_RESULT_INVALID_PAYLOAD'
    | 'ASSESSMENT_RESULT_READ_FAILED'
    | 'ASSESSMENT_RESULT_WRITE_FAILED';

  constructor(
    code:
      | 'ASSESSMENT_RESULT_AUTH_REQUIRED'
      | 'ASSESSMENT_RESULT_PROFILE_REVISION_MISMATCH'
      | 'ASSESSMENT_RESULT_RULE_SET_MISMATCH'
      | 'ASSESSMENT_RESULT_SOURCE_DOCUMENT_MISMATCH'
      | 'ASSESSMENT_RESULT_INVALID_PAYLOAD'
      | 'ASSESSMENT_RESULT_READ_FAILED'
      | 'ASSESSMENT_RESULT_WRITE_FAILED',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = code;
    this.name = 'AssessmentResultRepositoryError';
  }
}

type ResultRow = {
  id: string;
  user_id: string;
  result_snapshot: unknown;
  calculated_at: string;
  stale_at: string | null;
  stale_reason: PersistedUserAssessmentResult['stale']['reason'] | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const knownCodes = [
  'ASSESSMENT_RESULT_AUTH_REQUIRED',
  'ASSESSMENT_RESULT_PROFILE_REVISION_MISMATCH',
  'ASSESSMENT_RESULT_RULE_SET_MISMATCH',
  'ASSESSMENT_RESULT_SOURCE_DOCUMENT_MISMATCH',
  'ASSESSMENT_RESULT_INVALID_PAYLOAD',
] as const;

function errorCode(error: unknown): typeof knownCodes[number] | null {
  if (!isRecord(error)) return null;
  const text = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return knownCodes.find(code => new RegExp(`(?:^|\\b)${code}(?:\\b|$)`).test(text)) ?? null;
}

function decodeRow(value: unknown): PersistedUserAssessmentResult {
  if (!isRecord(value) || !isRecord(value.result_snapshot)) {
    throw new Error('ASSESSMENT_RESULT_ROW_INVALID');
  }
  const row = value as unknown as ResultRow;
  const snapshot = row.result_snapshot as unknown as PersistedUserAssessmentResult;
  if (snapshot.userId !== row.user_id) throw new Error('ASSESSMENT_RESULT_OWNER_MISMATCH');
  return {
    ...snapshot,
    id: row.id,
    calculatedAt: row.calculated_at,
    stale: row.stale_at && row.stale_reason
      ? { isStale: true, reason: row.stale_reason, detectedAt: row.stale_at }
      : { isStale: false },
  };
}

const columns = 'id,user_id,result_snapshot,calculated_at,stale_at,stale_reason';

export function createSupabaseAssessmentResultRepository(
  client: SupabaseClient,
): AssessmentResultRepository {
  return {
    async save(result) {
      const { data, error } = await client.rpc('save_user_assessment_result', { p_result: result });
      if (error) {
        const code = errorCode(error);
        if (code) {
          const messages: Record<typeof code, string> = {
            ASSESSMENT_RESULT_AUTH_REQUIRED: '로그인이 필요합니다.',
            ASSESSMENT_RESULT_PROFILE_REVISION_MISMATCH: '프로필이 변경되어 다시 계산해야 합니다.',
            ASSESSMENT_RESULT_RULE_SET_MISMATCH: '공고 규칙 버전이 변경되었습니다.',
            ASSESSMENT_RESULT_SOURCE_DOCUMENT_MISMATCH: '공고문 버전이 변경되었습니다.',
            ASSESSMENT_RESULT_INVALID_PAYLOAD: '계산 결과 형식이 올바르지 않습니다.',
          };
          throw new AssessmentResultRepositoryError(code, messages[code], { cause: error });
        }
        throw new AssessmentResultRepositoryError(
          'ASSESSMENT_RESULT_WRITE_FAILED', '계산 결과를 저장하지 못했습니다.', { cause: error },
        );
      }
      try {
        return decodeRow(data);
      } catch (cause) {
        throw new AssessmentResultRepositoryError(
          'ASSESSMENT_RESULT_WRITE_FAILED', '저장된 계산 결과 응답이 올바르지 않습니다.', { cause },
        );
      }
    },

    async list(userId, listingId) {
      let query = client.from('user_assessment_results')
        .select(columns)
        .eq('user_id', userId)
        .is('superseded_at', null)
        .order('calculated_at', { ascending: false });
      if (listingId) query = query.eq('listing_id', listingId);
      const { data, error } = await query;
      if (error) throw new AssessmentResultRepositoryError(
        'ASSESSMENT_RESULT_READ_FAILED', '계산 결과를 불러오지 못했습니다.', { cause: error },
      );
      return (data ?? []).map(decodeRow);
    },

    async listStale(userId) {
      const { data, error } = await client.from('user_assessment_results')
        .select(columns)
        .eq('user_id', userId)
        .not('stale_at', 'is', null)
        .is('superseded_at', null)
        .order('stale_at', { ascending: false });
      if (error) throw new AssessmentResultRepositoryError(
        'ASSESSMENT_RESULT_READ_FAILED', '갱신이 필요한 결과를 불러오지 못했습니다.', { cause: error },
      );
      return (data ?? []).map(decodeRow);
    },
  };
}
