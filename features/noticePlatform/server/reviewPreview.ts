/** Server/tooling-only review path. Do not export from the public noticePlatform entrypoint. */
import { createImportedPackageAdapter } from '../importedPackageAdapter.ts';
import type { Assessment, NoticeAssessmentInput } from '../types.ts';

export type ReviewPreviewAuthorization = {
  actorId: string;
  authorize: (actorId: string, action: 'REVIEW_RULE_PACKAGE') => boolean;
};

export function compareRulePackageVersions(request: {
  mode: 'REVIEW_PREVIEW';
  from: unknown;
  to: unknown;
  profile: NoticeAssessmentInput;
  authorization: ReviewPreviewAuthorization;
}): { mode: 'REVIEW_PREVIEW'; public: false; from: Assessment; to: Assessment } {
  if (request.mode !== 'REVIEW_PREVIEW' || !request.authorization.actorId ||
    !request.authorization.authorize(request.authorization.actorId, 'REVIEW_RULE_PACKAGE')) throw new Error('REVIEW_PREVIEW_FORBIDDEN');
  const from = createImportedPackageAdapter(request.from);
  const to = createImportedPackageAdapter(request.to);
  if (from.notice.managementNumber !== to.notice.managementNumber ||
    from.notice.sourceDocument.sha256 !== to.notice.sourceDocument.sha256 ||
    from.rulePackage.id === to.rulePackage.id) throw new Error('REVIEW_VERSION_PAIR_MISMATCH');
  return { mode: 'REVIEW_PREVIEW', public: false,
    from: structuredClone(from.assess(request.profile)), to: structuredClone(to.assess(request.profile)) };
}
