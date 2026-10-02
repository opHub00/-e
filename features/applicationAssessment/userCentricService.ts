import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentInput, SupplyType } from './types.ts';
import type { PersistedUserAssessmentResult } from './resultPersistence.ts';
import { staleReasonToUiState, type AssessmentResultFreshnessStatus } from './serverExecution.ts';
import {
  createSupabaseAssessmentResultRepository,
  type AssessmentResultRepository,
} from './resultRepository.ts';

export type UserCentricAssessmentResponse = {
  result: PersistedUserAssessmentResult;
  reused: boolean;
  freshness: AssessmentResultFreshnessStatus;
};

export type UserCentricAssessmentService = {
  latest: (userId: string, listingId: string, supplyType: SupplyType) => Promise<UserCentricAssessmentResponse | null>;
  loadOrRecalculate: (input: {
    userId: string;
    listingId: string;
    supplyType: SupplyType;
    announcementDetails: AssessmentInput['details'];
  }) => Promise<UserCentricAssessmentResponse>;
};

export class UserCentricAssessmentServiceError extends Error {
  readonly code:
    | 'AUTH_REQUIRED'
    | 'PROFILE_V3_REQUIRED'
    | 'RULE_NOT_AVAILABLE'
    | 'SERVER_EXECUTION_FAILED'
    | 'INVALID_SERVER_RESPONSE';
  constructor(
    code:
      | 'AUTH_REQUIRED'
      | 'PROFILE_V3_REQUIRED'
      | 'RULE_NOT_AVAILABLE'
      | 'SERVER_EXECUTION_FAILED'
      | 'INVALID_SERVER_RESPONSE',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = code;
    this.name = 'UserCentricAssessmentServiceError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function decodeResponse(value: unknown): UserCentricAssessmentResponse {
  if (!isRecord(value) || !isRecord(value.result) || typeof value.reused !== 'boolean'
      || value.freshness !== 'FRESH') throw new Error('INVALID_SERVER_RESPONSE');
  return {
    result: value.result as unknown as PersistedUserAssessmentResult,
    reused: value.reused,
    freshness: value.freshness,
  };
}

export function createUserCentricAssessmentService(input: {
  client: SupabaseClient;
  results?: AssessmentResultRepository;
}): UserCentricAssessmentService {
  const results = input.results ?? createSupabaseAssessmentResultRepository(input.client);
  return {
    async latest(userId, listingId, supplyType) {
      const latest = (await results.list(userId, listingId))
        .find(item => item.supplyType === supplyType);
      if (!latest) return null;
      return {
        result: latest,
        reused: true,
        freshness: staleReasonToUiState(latest.stale.reason),
      };
    },

    async loadOrRecalculate(request) {
      // Reading first gives the UI an explicit persisted-result path. The Edge
      // function remains the final freshness authority because it compares the
      // current profile, rule, document and engine provenance before reuse.
      await this.latest(request.userId, request.listingId, request.supplyType);
      const { data, error } = await input.client.functions.invoke('user-assessment', {
        body: {
          listingId: request.listingId,
          supplyType: request.supplyType,
          announcementDetails: request.announcementDetails,
        },
      });
      if (error) {
        throw new UserCentricAssessmentServiceError(
          'SERVER_EXECUTION_FAILED', '서버 판정을 완료하지 못했습니다.', { cause: error },
        );
      }
      if (isRecord(data) && typeof data.code === 'string') {
        const code = data.code === 'PROFILE_V3_REQUIRED' ? 'PROFILE_V3_REQUIRED'
          : data.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED'
            : data.code.includes('RULE') ? 'RULE_NOT_AVAILABLE'
              : 'SERVER_EXECUTION_FAILED';
        throw new UserCentricAssessmentServiceError(code, '서버 판정을 완료하지 못했습니다.');
      }
      try { return decodeResponse(data); }
      catch (cause) {
        throw new UserCentricAssessmentServiceError(
          'INVALID_SERVER_RESPONSE', '서버 판정 응답을 확인하지 못했습니다.', { cause },
        );
      }
    },
  };
}
