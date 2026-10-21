import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SAMDO_PERSONAS } from '../eventKiosk/samdo/personas.test-data.ts';
import { SAMDO_NOTICE_ADAPTERS } from '../eventKiosk/noticePlatform/samdoAdapter.ts';
import { createImportedPackageAdapter } from './importedPackageAdapter.ts';
import { NoticePlatform } from './platform.ts';
import { prepareJejuHappyV2Candidate } from '../assessmentRuleReview/fixtures/jejuHappyCandidate.ts';
import { compareRulePackageVersions } from './server/reviewPreview.ts';
import { buildRulePackageReviewViewModel } from '../productV3/admin/presentation.ts';
import { InMemoryAdminOperationStore } from '../productV3/admin/repository.ts';
import { AdminOperationService } from '../productV3/admin/service.ts';
import { buildProductV3AdminSeed } from '../productV3/admin/seed.ts';
import { SCOPE_CHOICES, SCOPE_TEXT } from '../assessmentRuleReview/ui/ruleFields.ts';
import type { NoticeAdapter } from './types.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../data/assessment-rules/${name}`, import.meta.url), 'utf8'));
const v1Raw = read('lh-jeju-ildo-samdo-happy-20260918.json');
const v2Raw = read('lh-jeju-ildo-samdo-happy-20260918.v2.json');
const profile = SAMDO_PERSONAS[0].input;
const activeCopy = (input: NoticeAdapter): NoticeAdapter => {
  const copy = { ...input, notice: structuredClone(input.notice), rulePackage: structuredClone(input.rulePackage),
    lifecycle: structuredClone(input.lifecycle), binding: structuredClone(input.binding), reviewBlockers: [...input.reviewBlockers] };
  copy.notice.status = 'ACTIVE'; copy.notice.activatedAt = '2026-10-21T00:00:00Z';
  copy.rulePackage.status = 'ACTIVE'; copy.lifecycle.reviewStatus = 'APPROVED';
  copy.lifecycle.publicationStatus = 'ACTIVE'; copy.binding.status = 'ACTIVE';
  return copy;
};

test('candidate is neither approved nor active and direct-ID public APIs fail closed', () => {
  const { adapter } = prepareJejuHappyV2Candidate();
  const platform = new NoticePlatform([...SAMDO_NOTICE_ADAPTERS, adapter]);
  assert.equal(adapter.rulePackage.status, 'DRAFT');
  assert.ok(adapter.rulePackage.validationErrors.includes('REVIEW_CANDIDATE_NOT_APPROVED'));
  const adminPreview = buildRulePackageReviewViewModel({ ...adapter.rulePackage, status: 'IN_REVIEW' });
  assert.equal(adminPreview.canApprove, false);
  assert.equal(adapter.lifecycle.reviewStatus, 'REVIEW_REQUIRED');
  assert.equal(adapter.lifecycle.publicationStatus, 'INACTIVE');
  assert.deepEqual(platform.getActiveNotices().map(item => item.id), ['samdo-1', 'samdo-2']);
  assert.throws(() => platform.assessNotice(profile, adapter.notice.id), /REVIEW_REQUIRED/);
  assert.throws(() => platform.assessNotices(profile, ['samdo-1', adapter.notice.id]), /REVIEW_REQUIRED/);
  assert.throws(() => platform.retrieveNoticeEvidence(adapter.notice.id, '청년 소득'), /REVIEW_REQUIRED/);
  assert.throws(() => platform.getNoticePresentation(adapter.notice.id), /REVIEW_REQUIRED/);
  assert.throws(() => platform.rulePackage(adapter.notice.id), /REVIEW_REQUIRED/);
  assert.throws(() => platform.ragSource(adapter.notice.id), /REVIEW_REQUIRED/);
  const reviewerOnly = adapter.assess(profile);
  assert.throws(() => platform.compareAssessmentResults([reviewerOnly]), /REVIEW_REQUIRED/);
});

test('locally simulated Staging IN_REVIEW registration still cannot reach public or Copilot paths', () => {
  const { adapter } = prepareJejuHappyV2Candidate();
  const staged: NoticeAdapter = { ...adapter, lifecycle: { ...adapter.lifecycle, reviewStatus: 'IN_REVIEW',
    publicationStatus: 'INACTIVE' }, rulePackage: { ...adapter.rulePackage, status: 'IN_REVIEW' } };
  const platform = new NoticePlatform([...SAMDO_NOTICE_ADAPTERS, staged]);
  assert.deepEqual(platform.getActiveNotices().map(item => item.id), ['samdo-1', 'samdo-2']);
  assert.throws(() => platform.assessNotice(profile, staged.notice.id), /REVIEW_REQUIRED/);
  assert.throws(() => platform.assessNotices(profile, ['samdo-1', staged.notice.id]), /REVIEW_REQUIRED/);
  assert.throws(() => platform.getNoticePresentation(staged.notice.id), /REVIEW_REQUIRED/);
  assert.throws(() => platform.retrieveNoticeEvidence(staged.notice.id, '소득 기준'), /REVIEW_REQUIRED/);
  assert.throws(() => platform.compareAssessmentResults([staged.assess(profile)]), /REVIEW_REQUIRED/);
});

test('unresolved blocker, source, binding and approval are independent gates', () => {
  const candidate = prepareJejuHappyV2Candidate().adapter;
  assert.throws(() => new NoticePlatform([activeCopy(candidate)]).assessNotice(profile, candidate.notice.id), /REVIEW_REQUIRED/);
  const approved = activeCopy({ ...candidate, reviewBlockers: [], rulePackage: { ...candidate.rulePackage, validationErrors: [] } });
  approved.lifecycle.sourceVerificationState = 'UNVERIFIED';
  assert.throws(() => new NoticePlatform([approved]).assessNotice(profile, approved.notice.id), /SOURCE_NOT_VERIFIED/);
  approved.lifecycle.sourceVerificationState = 'SOURCE_VERIFIED'; approved.binding.status = 'INACTIVE';
  assert.throws(() => new NoticePlatform([approved]).assessNotice(profile, approved.notice.id), /NOT_ACTIVE/);
  approved.binding.status = 'ACTIVE'; approved.lifecycle.reviewStatus = 'DRAFT';
  assert.throws(() => new NoticePlatform([approved]).assessNotice(profile, approved.notice.id), /RULE_PACKAGE_NOT_APPROVED/);
});

test('existing Admin workflow cannot approve an imported review candidate with its blocker', async () => {
  const candidate = prepareJejuHappyV2Candidate().adapter;
  const store = new InMemoryAdminOperationStore(buildProductV3AdminSeed(new NoticePlatform(SAMDO_NOTICE_ADAPTERS)));
  const service = new AdminOperationService(store, 'test');
  const mutation = { actor: { id: 'review-admin', role: 'admin' as const }, reason: '비공개 검수 후보 확인' };
  await service.stageNotice(candidate.notice, mutation);
  await service.stageRulePackage(candidate.rulePackage, mutation);
  await service.requestRuleReview(candidate.rulePackage.id, mutation);
  await assert.rejects(() => service.approveRulePackage(candidate.rulePackage.id, mutation), /RULE_PACKAGE_REVIEW_INCOMPLETE/);
  assert.equal((await service.rulePackage(candidate.rulePackage.id)).canActivate, false);
});

test('v1 and v2 coexist by version identity; no unreviewed replacement of an active family', () => {
  const v1 = createImportedPackageAdapter(v1Raw), v2 = prepareJejuHappyV2Candidate().adapter;
  assert.notEqual(v1.notice.id, v2.notice.id);
  assert.equal(v1.notice.managementNumber, v2.notice.managementNumber);
  assert.equal(v1.notice.sourceDocument.sha256, v2.notice.sourceDocument.sha256);
  const platform = new NoticePlatform([v1, v2]);
  assert.deepEqual(platform.getActiveNotices(), []);
  const activateForCollisionTest = (adapter: NoticeAdapter) => activeCopy({ ...adapter, reviewBlockers: [], rulePackage: { ...adapter.rulePackage, validationErrors: [] } });
  assert.throws(() => new NoticePlatform([activateForCollisionTest(v1), activateForCollisionTest(v2)]), /ACTIVE_VERSION_COLLISION/);
});

test('review preview requires explicit reviewer authorization and never enters public registry', () => {
  const base = { mode: 'REVIEW_PREVIEW' as const, from: v1Raw, to: v2Raw, profile };
  assert.throws(() => compareRulePackageVersions({ ...base, authorization: { actorId: 'visitor', authorize: () => false } }), /REVIEW_PREVIEW_FORBIDDEN/);
  const result = compareRulePackageVersions({ ...base, authorization: { actorId: 'reviewer', authorize: () => true } });
  assert.equal(result.mode, 'REVIEW_PREVIEW'); assert.equal(result.public, false);
  assert.equal(result.from.evaluations.length, 5); assert.equal(result.to.evaluations.length, 5);
});

test('review scope distinguishes parents, head/member, future household and spouse', () => {
  const { reviewSeed } = prepareJejuHappyV2Candidate();
  const scope = (key: string) => reviewSeed.rules.find(rule => rule.ruleId === key)?.originalCandidate.scope;
  assert.equal(scope('student.income'), 'APPLICANT_AND_PARENTS');
  assert.equal(scope('student.assets'), 'APPLICANT');
  assert.equal(scope('youth.income'), 'HEAD_HOUSEHOLD_OR_MEMBER_APPLICANT');
  assert.equal(scope('newlywed.income'), 'CURRENT_OR_FUTURE_HOUSEHOLD');
  assert.equal(scope('newlywed.account'), 'APPLICANT_OR_SPOUSE');
  assert.equal(scope('newlywed.rank1'), 'APPLICANT_OR_SPOUSE');
  for (const key of ['student.income', 'youth.income', 'newlywed.income', 'newlywed.account']) {
    const value = scope(key);
    assert.ok(value && SCOPE_CHOICES.includes(value as typeof SCOPE_CHOICES[number]));
    assert.ok(value && SCOPE_TEXT[value]);
  }
});

test('not-in-source cells remain null; no-car ownership is not zero-valued vehicle', () => {
  const parameters = v2Raw.ruleSet.config.parameters;
  for (const key of ['threshold.newlywed.incomePercent.single.1', 'threshold.newlywed.incomePercent.dual.1',
    'threshold.student.vehicle.0', 'threshold.student.vehicle.1', 'threshold.student.vehicle.2']) {
    assert.equal(parameters[key], null);
  }
  const vehicle = v2Raw.rules.find((rule: { ruleKey: string }) => rule.ruleKey === 'student.vehicle');
  assert.match(JSON.stringify(vehicle.config.expression), /applicantOwnsVehicle/);
  assert.doesNotMatch(JSON.stringify(vehicle.config.expression), /applicantVehicleValue/);
});
