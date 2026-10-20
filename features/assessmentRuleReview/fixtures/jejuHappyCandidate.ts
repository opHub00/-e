/** Offline/admin preparation fixture only. No public notice registration or DB mutation. */
import { readFileSync } from 'node:fs';
import { validateImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import { buildAssessmentReviewSeed } from '../seed/buildAssessmentReviewSeed.ts';
import { decodeReviewSeedAnnotation } from '../seed/annotations.ts';
import { createImportedPackageAdapter } from '../../noticePlatform/importedPackageAdapter.ts';

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../../data/assessment-rules/${name}`, import.meta.url), 'utf8'));

export function prepareJejuHappyV2Candidate() {
  const raw = read('lh-jeju-ildo-samdo-happy-20260918.v2.json');
  const { package: pkg } = validateImportPackage(raw);
  const metadata = read('lh-jeju-ildo-samdo-happy-20260918.v2.review-candidate.json') as {
    status: string; approved: boolean; active: boolean; source: { sha256: string };
    ruleSet: { id: string; version: string }; unresolved: { decision: string };
    warnings: Array<{ classification: string }>;
  };
  const annotations = decodeReviewSeedAnnotation(read('lh-jeju-ildo-samdo-happy-20260918.v2.review-annotations.json'));
  if (metadata.status !== 'REVIEW_CANDIDATE' || metadata.approved !== false || metadata.active !== false ||
    metadata.source.sha256 !== pkg.document.sha256 || metadata.ruleSet.id !== pkg.ruleSet.id ||
    metadata.ruleSet.version !== pkg.ruleSet.version || metadata.unresolved.decision !== 'UNRESOLVED_BLOCKER' ||
    annotations.documentSha256 !== pkg.document.sha256) throw new Error('JEJU_REVIEW_CANDIDATE_MISMATCH');
  const reviewSeed = buildAssessmentReviewSeed(pkg, annotations);
  if (reviewSeed.rules.length !== 44 || !reviewSeed.unresolvedItems.length) throw new Error('JEJU_REVIEW_SEED_INCOMPLETE');
  const reviewBlockers = [metadata.unresolved.decision,
    ...metadata.warnings.filter(item => item.classification === 'BLOCKER').map(() => 'CLASSIFIED_BLOCKER'),
    ...annotations.safetyBlockers.map(item => `RULE:${item.ruleKey}`)];
  const adapter = createImportedPackageAdapter(raw, { announcementId: pkg.announcement.id,
    documentSha256: pkg.document.sha256, ruleSetVersion: pkg.ruleSet.version, reviewBlockers });
  return { adapter, reviewSeed, metadata: structuredClone(metadata) };
}
