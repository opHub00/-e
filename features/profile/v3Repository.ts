import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicantProfileV2 } from './domain.ts';
import {
  migrateApplicantProfileV2ToV3,
  type ApplicantProfileV3,
} from './v3.ts';

export type ApplicantProfileV3Record = {
  userId: string;
  schemaVersion: 3;
  revision: number;
  profile: ApplicantProfileV3;
  provenance: Record<string, unknown>;
  consentVersion: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateApplicantProfileV3Input = {
  expectedRevision: number;
  profile: ApplicantProfileV3;
  completedAt?: string | null;
  consentVersion?: string | null;
};

export type ApplicantProfileV3Repository = {
  read: (userId: string) => Promise<ApplicantProfileV3Record | null>;
  update: (input: UpdateApplicantProfileV3Input) => Promise<ApplicantProfileV3Record>;
};

export type ApplicantProfileReadResult =
  | { source: 'V3'; record: ApplicantProfileV3Record }
  | { source: 'V2_FALLBACK'; profile: ApplicantProfileV3; v2UpdatedAt: string }
  | { source: 'NONE'; profile: null };

export class ApplicantProfileV3RepositoryError extends Error {
  readonly code:
    | 'PROFILE_V3_AUTH_REQUIRED'
    | 'PROFILE_V3_REVISION_CONFLICT'
    | 'PROFILE_V3_INVALID_PAYLOAD'
    | 'PROFILE_V3_READ_FAILED'
    | 'PROFILE_V3_WRITE_FAILED';

  constructor(
    code:
      | 'PROFILE_V3_AUTH_REQUIRED'
      | 'PROFILE_V3_REVISION_CONFLICT'
      | 'PROFILE_V3_INVALID_PAYLOAD'
      | 'PROFILE_V3_READ_FAILED'
      | 'PROFILE_V3_WRITE_FAILED',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = code;
    this.name = 'ApplicantProfileV3RepositoryError';
  }
}

type V2Reader = {
  readProfile: (userId: string) => Promise<{
    profileJson: unknown;
    schemaVersion: number;
    updatedAt: string;
  } | null>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function parseDbCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const text = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return [
    'PROFILE_V3_AUTH_REQUIRED',
    'PROFILE_V3_REVISION_CONFLICT',
    'PROFILE_V3_INVALID_PAYLOAD',
    'PROFILE_V3_EXPECTED_REVISION_REQUIRED',
  ].find(code => new RegExp(`(?:^|\\b)${code}(?:\\b|$)`).test(text)) ?? null;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`PROFILE_V3_RECORD_INVALID:${field}`);
  return value;
}

function decodeRecord(value: unknown): ApplicantProfileV3Record {
  if (!isRecord(value) || !isRecord(value.profile)) throw new Error('PROFILE_V3_RECORD_INVALID');
  const revision = Number(value.revision);
  if (!Number.isSafeInteger(revision) || revision < 1 || value.profile.version !== 3) {
    throw new Error('PROFILE_V3_RECORD_INVALID');
  }
  const profile = value.profile as ApplicantProfileV3;
  if (profile.revision !== revision) throw new Error('PROFILE_V3_REVISION_PAYLOAD_MISMATCH');
  return {
    userId: readString(value.userId, 'userId'),
    schemaVersion: 3,
    revision,
    profile,
    provenance: isRecord(value.provenance) ? value.provenance : {},
    consentVersion: typeof value.consentVersion === 'string' ? value.consentVersion : null,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    createdAt: readString(value.createdAt, 'createdAt'),
    updatedAt: readString(value.updatedAt, 'updatedAt'),
  };
}

export function createSupabaseApplicantProfileV3Repository(
  client: SupabaseClient,
): ApplicantProfileV3Repository {
  return {
    async read(userId) {
      const { data, error } = await client
        .from('applicant_profiles_v3')
        .select('user_id,schema_version,revision,profile_json,provenance,consent_version,completed_at,created_at,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new ApplicantProfileV3RepositoryError(
        'PROFILE_V3_READ_FAILED', '프로필을 불러오지 못했습니다.', { cause: error },
      );
      if (!data) return null;
      return decodeRecord({
        userId: data.user_id,
        schemaVersion: data.schema_version,
        revision: data.revision,
        profile: data.profile_json,
        provenance: data.provenance,
        consentVersion: data.consent_version,
        completedAt: data.completed_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    },

    async update(input) {
      const { data, error } = await client.rpc('save_applicant_profile_v3', {
        p_expected_revision: input.expectedRevision,
        p_profile: input.profile,
        p_completed_at: input.completedAt ?? null,
        p_consent_version: input.consentVersion ?? null,
      });
      if (error) {
        const code = parseDbCode(error);
        if (code === 'PROFILE_V3_REVISION_CONFLICT') {
          throw new ApplicantProfileV3RepositoryError(
            'PROFILE_V3_REVISION_CONFLICT', '다른 기기에서 프로필이 먼저 변경되었습니다.', { cause: error },
          );
        }
        if (code === 'PROFILE_V3_AUTH_REQUIRED') {
          throw new ApplicantProfileV3RepositoryError(
            'PROFILE_V3_AUTH_REQUIRED', '로그인이 필요합니다.', { cause: error },
          );
        }
        if (code === 'PROFILE_V3_INVALID_PAYLOAD' || code === 'PROFILE_V3_EXPECTED_REVISION_REQUIRED') {
          throw new ApplicantProfileV3RepositoryError(
            'PROFILE_V3_INVALID_PAYLOAD', '프로필 형식이 올바르지 않습니다.', { cause: error },
          );
        }
        throw new ApplicantProfileV3RepositoryError(
          'PROFILE_V3_WRITE_FAILED', '프로필을 저장하지 못했습니다.', { cause: error },
        );
      }
      try {
        return decodeRecord(data);
      } catch (cause) {
        throw new ApplicantProfileV3RepositoryError(
          'PROFILE_V3_WRITE_FAILED', '저장된 프로필 응답이 올바르지 않습니다.', { cause },
        );
      }
    },
  };
}

/**
 * V3를 먼저 읽되, 아직 backfill되지 않은 사용자는 V2를 메모리에서만
 * deterministic 변환한다. fallback 자체는 V3 테이블에 쓰지 않는다.
 */
export async function readApplicantProfileWithV2Fallback(input: {
  userId: string;
  v3: ApplicantProfileV3Repository;
  v2: V2Reader;
  decodeV2: (value: unknown) => ApplicantProfileV2 | null;
}): Promise<ApplicantProfileReadResult> {
  const current = await input.v3.read(input.userId);
  if (current) return { source: 'V3', record: current };
  const legacy = await input.v2.readProfile(input.userId);
  if (!legacy || legacy.schemaVersion !== 2) return { source: 'NONE', profile: null };
  const profile = input.decodeV2(legacy.profileJson);
  if (!profile) return { source: 'NONE', profile: null };
  return {
    source: 'V2_FALLBACK',
    profile: migrateApplicantProfileV2ToV3(profile, {
      source: 'PERSISTED_USER',
      observedAt: legacy.updatedAt,
    }),
    v2UpdatedAt: legacy.updatedAt,
  };
}
