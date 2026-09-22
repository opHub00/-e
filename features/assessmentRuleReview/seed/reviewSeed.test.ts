import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeReviewSeedAnnotation, emptyReviewSeedAnnotation } from './annotations.ts';
import { buildAssessmentReviewSeed } from './buildAssessmentReviewSeed.ts';
import { reviewSeedPaths } from '../../../scripts/review-seed-input.mjs';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
// 실제로 존재하는 유일한 공고 패키지로 generic 성질만 검증한다. 가짜 두 번째 공고는 만들지 않는다.
const source = read('../../../data/assessment-rules/samdo-2026-v1.7.json');
const annotation = decodeReviewSeedAnnotation(read('../../../data/assessment-rules/samdo-2026-v1.7.review-annotations.json'));
const identity = { announcementId: source.announcement.id, documentSha256: source.document.sha256, ruleSetVersion: source.ruleSet.version };

test('generic builder source names no announcement, region or rule key', () => {
  for (const file of ['./buildAssessmentReviewSeed.ts', './annotations.ts']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /삼도|[Ss]amdo|SAMDO|제주|관리번호|지역우선/, file);
    assert.doesNotMatch(code, /'(?:youth|newlywed|firstHome)\.[a-zA-Z]+'/, `${file} must not special-case a rule key`);
  }
});

test('announcement findings come from annotation data, not from the builder', () => {
  const bare = buildAssessmentReviewSeed(source, emptyReviewSeedAnnotation(identity));
  assert.equal(bare.rules.length, source.rules.length);
  assert.deepEqual(bare.conflicts, []);
  assert.deepEqual(bare.unresolvedItems, []);
  assert.ok(bare.rules.every(rule => rule.safetyBlockers.length === 0), 'no blocker without an annotation');
  const annotated = buildAssessmentReviewSeed(source, annotation);
  const blocked = annotated.rules.filter(rule => rule.safetyBlockers.length);
  assert.deepEqual(blocked.map(rule => rule.ruleId), annotation.safetyBlockers.map(item => item.ruleKey));
  assert.ok(blocked.every(rule => rule.candidateStatus === 'REVIEW_REQUIRED'));
  assert.equal(annotated.conflicts.length, annotation.conflicts.length);
  assert.equal(annotated.unresolvedItems.length, annotation.unresolved.length);
});

test('conflict evidence is resolved through the cited rules', () => {
  const seed = buildAssessmentReviewSeed(source, annotation);
  for (const conflict of annotation.conflicts) {
    const built = seed.conflicts.find(item => item.conflictId === conflict.conflictId)!;
    for (const candidate of conflict.candidates) {
      const expected = candidate.evidenceRuleKeys.map(key => source.rules.find((rule: { ruleKey: string }) => rule.ruleKey === key).evidence.id);
      assert.deepEqual(built.candidates.find(item => item.candidateId === candidate.candidateId)!.evidenceIds, [...new Set(expected)]);
    }
  }
});

test('an annotation cannot attach to a different announcement, document or version', () => {
  assert.throws(() => buildAssessmentReviewSeed(source, { ...annotation, announcementId: 'other' }), /REVIEW_ANNOTATION_ANNOUNCEMENT_MISMATCH/);
  assert.throws(() => buildAssessmentReviewSeed(source, { ...annotation, documentSha256: '0'.repeat(64) }), /REVIEW_ANNOTATION_DOCUMENT_MISMATCH/);
  assert.throws(() => buildAssessmentReviewSeed(source, { ...annotation, ruleSetVersion: 'v-next' }), /REVIEW_ANNOTATION_VERSION_MISMATCH/);
});

test('annotations that reference missing rules or non-exception relations fail closed', () => {
  const unknown = { ...annotation, warnings: [{ ruleKey: 'youth.notInPackage', message: 'x' }] };
  assert.throws(() => buildAssessmentReviewSeed(source, unknown), /REVIEW_ANNOTATION_UNKNOWN_RULE:youth.notInPackage/);
  const wrongRelation = { ...annotation, exceptions: [{ ruleKey: 'youth.residence', exceptionRuleKey: 'youth.age' }] };
  assert.throws(() => buildAssessmentReviewSeed(source, wrongRelation), /REVIEW_ANNOTATION_NOT_AN_EXCEPTION/);
  const duplicate = { ...annotation, unresolved: [...annotation.unresolved, ...annotation.unresolved] };
  assert.throws(() => buildAssessmentReviewSeed(source, duplicate), /REVIEW_ANNOTATION_DUPLICATE_ID/);
});

test('annotation decoder is strict', () => {
  const raw = read('../../../data/assessment-rules/samdo-2026-v1.7.review-annotations.json');
  assert.throws(() => decodeReviewSeedAnnotation({ ...raw, extra: true }), /REVIEW_ANNOTATION_INVALID:root.extra/);
  assert.throws(() => decodeReviewSeedAnnotation({ ...raw, safetyBlockers: [{ ruleKey: 'x', codes: ['APPROVED'], reason: 'r' }] }), /codes/);
  assert.throws(() => decodeReviewSeedAnnotation({ ...raw, conflicts: [{ ...raw.conflicts[0], candidates: [raw.conflicts[0].candidates[0]] }] }), /candidates/);
  assert.throws(() => decodeReviewSeedAnnotation({ ...raw, documentSha256: 'not-a-hash' }), /documentSha256/);
});

test('annotated extra exception relations and warnings are carried without duplicates', () => {
  const extra = { ...annotation, exceptions: [{ ruleKey: 'youth.residence', exceptionRuleKey: 'youth.overseas' }], warnings: [{ ruleKey: 'youth.age', message: '만 나이 기준일 확인' }] };
  const seed = buildAssessmentReviewSeed(source, extra);
  assert.deepEqual(seed.rules.find(rule => rule.ruleId === 'youth.residence')!.originalCandidate.relatedExceptionRuleIds, ['youth.overseas']);
  assert.deepEqual(seed.rules.find(rule => rule.ruleId === 'youth.age')!.originalCandidate.warnings, ['만 나이 기준일 확인']);
});

test('seed tooling has no default announcement', () => {
  assert.throws(() => reviewSeedPaths([]), /REVIEW_SEED_INPUT_REQUIRED/);
  assert.throws(() => reviewSeedPaths(['--package', 'a.json']), /REVIEW_SEED_INPUT_REQUIRED/);
  assert.ok(reviewSeedPaths(['--package', 'a.json', '--annotations', 'b.json']).packagePath.endsWith('a.json'));
});
