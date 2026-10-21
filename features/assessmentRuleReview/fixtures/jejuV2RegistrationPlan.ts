import { readFileSync } from 'node:fs';
import { buildJejuV2CandidateView } from './jejuV2CandidateView.ts';
import { prepareJejuHappyV2Candidate } from './jejuHappyCandidate.ts';

/** Offline preflight only: this module has no database, storage, or HTTP client. */
export function buildJejuV2RegistrationPlan(documentSha256: string | null = null) {
  const v1 = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.json', import.meta.url), 'utf8'));
  const v2 = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.v2.json', import.meta.url), 'utf8'));
  const { reviewSeed, adapter } = prepareJejuHappyV2Candidate();
  const view = buildJejuV2CandidateView();
  if (v1.announcement.id !== v2.announcement.id || v1.document.id === v2.document.id ||
    v1.ruleSet.id === v2.ruleSet.id || v1.ruleSet.version === v2.ruleSet.version ||
    v1.document.sha256 !== v2.document.sha256 || v2.document.sha256 !== view.source.sha256 ||
    reviewSeed.rules.length !== 44 || adapter.rulePackage.status !== 'DRAFT' ||
    adapter.lifecycle.publicationStatus !== 'INACTIVE') throw new Error('JEJU_V2_REGISTRATION_IDENTITY_MISMATCH');
  if (documentSha256 !== null && documentSha256 !== view.source.sha256) throw new Error('JEJU_V2_ORIGINAL_HASH_MISMATCH');
  return {
    mode: 'OFFLINE_DRY_RUN' as const, contactedStaging: false as const, mutationPerformed: false as const,
    candidate: { announcementId: v2.announcement.id as string, documentId: v2.document.id as string,
      ruleSetId: view.ruleSetId, version: view.version, sourceHash: view.source.sha256,
      sourceReference: view.source.pdfUrl, sourceVerificationState: 'SOURCE_VERIFIED' as const,
      reviewStatus: 'IN_REVIEW' as const, publicationStatus: 'INACTIVE' as const,
      approved: false as const, active: false as const, ruleCount: view.ruleCount,
      warningCount: view.warningCount, notInSourceCount: view.notInSource.length, blockerCount: view.blockerCount },
    existingV1: { announcementId: v1.announcement.id as string, documentId: v1.document.id as string,
      ruleSetId: v1.ruleSet.id as string, version: v1.ruleSet.version as string, preserveUnchanged: true as const },
    originalDocument: { storagePath: v2.document.storagePath as string, expectedHash: v2.document.sha256 as string,
      providedHash: documentSha256, verified: documentSha256 === view.source.sha256 },
    plannedOperations: [
      'Staging/Production ref, approved operator, schema and existing v1/v2 rows read-only inspect',
      'Verify original PDF bytes and private storage hash; never overwrite existing object',
      'Import v2 as independent RuleSet without approval, activation or public binding',
      'Seed 44 rule review rows and candidate warning/blocker/NOT_IN_SOURCE metadata',
      'Start IN_REVIEW through authorized audited transition',
      'Verify reviewer-only read and public assess/compare/RAG/discovery rejection',
    ] as const,
    writeBlockedReasons: [
      ...(documentSha256 === null ? ['ORIGINAL_DOCUMENT_BYTES_NOT_VERIFIED'] : []),
      'STAGING_IDENTITY_AND_EXISTING_ROWS_NOT_INSPECTED',
      'TYPED_DECISION_AUDIT_SCHEMA_NOT_VERIFIED',
      'APPROVED_REVIEWER_SESSION_NOT_VERIFIED',
    ],
  };
}
