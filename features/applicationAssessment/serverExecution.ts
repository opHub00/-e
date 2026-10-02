import { assessApplication } from './engine.ts';
import { portfolioEntryFromAssessment } from './portfolio.ts';
import { buildPersistedAssessmentResult, type PersistedUserAssessmentResult } from './resultPersistence.ts';
import { assessmentInputFromApplicantProfileV3 } from './v3Adapter.ts';
import type { AnnouncementRules, AssessmentInput, SupplyType } from './types.ts';
import type { ApplicantProfileV3 } from '../profile/v3.ts';

export const USER_CENTRIC_ASSESSMENT_ENGINE_VERSION = 'assessment-engine-v3-profile-1';

export function canonicalSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalSerialize(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  throw new Error('UNSUPPORTED_CANONICAL_VALUE');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function trustedAssessmentInputHash(input: {
  listingId: string;
  supplyType: SupplyType;
  profileRevision: number;
  profile: ApplicantProfileV3;
  announcementDetails: AssessmentInput['details'];
  ruleSetId: string;
  ruleSetVersion: string;
  sourceDocumentHash: string | null;
  engineVersion?: string;
}): Promise<string> {
  return sha256Hex(canonicalSerialize({
    ...input,
    engineVersion: input.engineVersion ?? USER_CENTRIC_ASSESSMENT_ENGINE_VERSION,
  }));
}

export async function executeTrustedAssessment(input: {
  userId: string;
  announcementId: string;
  profileRevision: number;
  profile: ApplicantProfileV3;
  rules: AnnouncementRules;
  supplyType: SupplyType;
  announcementDetails: AssessmentInput['details'];
  sourceDocumentHash: string | null;
  now?: string;
  id?: string;
}): Promise<PersistedUserAssessmentResult> {
  const adapted = assessmentInputFromApplicantProfileV3(input.profile, {
    announcementDate: input.rules.announcementDate,
    announcementDetails: input.announcementDetails,
  });
  const result = assessApplication(input.rules, adapted, input.rules.listingId)
    .find(item => item.supplyType === input.supplyType);
  if (!result) throw new Error('SUPPLY_TYPE_NOT_AVAILABLE');
  const inputHash = await trustedAssessmentInputHash({
    listingId: input.rules.listingId,
    supplyType: input.supplyType,
    profileRevision: input.profileRevision,
    profile: input.profile,
    announcementDetails: input.announcementDetails,
    ruleSetId: input.rules.id,
    ruleSetVersion: input.rules.version,
    sourceDocumentHash: input.sourceDocumentHash,
  });
  return buildPersistedAssessmentResult(portfolioEntryFromAssessment(result), {
    id: input.id ?? crypto.randomUUID(),
    userId: input.userId,
    announcementId: input.announcementId,
    sourceStatus: input.rules.sourceStatus ?? 'REFERENCE',
    sourceDocumentId: input.rules.provenance?.documentId ?? null,
    sourceDocumentHash: input.sourceDocumentHash,
    profileRevision: input.profileRevision,
    engineVersion: USER_CENTRIC_ASSESSMENT_ENGINE_VERSION,
    inputHash,
    calculatedAt: input.now ?? new Date().toISOString(),
  });
}

export type AssessmentResultFreshnessStatus =
  | 'FRESH'
  | 'STALE_PROFILE'
  | 'STALE_RULE'
  | 'STALE_DOCUMENT'
  | 'STALE_ENGINE';

export function staleReasonToUiState(
  reason: PersistedUserAssessmentResult['stale']['reason'],
): AssessmentResultFreshnessStatus {
  return reason === 'PROFILE_CHANGED' ? 'STALE_PROFILE'
    : reason === 'RULE_SET_CHANGED' ? 'STALE_RULE'
      : reason === 'SOURCE_DOCUMENT_CHANGED' ? 'STALE_DOCUMENT'
        : reason === 'ENGINE_CHANGED' ? 'STALE_ENGINE'
          : 'FRESH';
}
