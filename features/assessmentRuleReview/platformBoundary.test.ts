import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ImportPackage } from '../applicationAssessment/server/importPackage.ts';
import { canonicalSerialize, createWebCryptoCandidateHasher, hashCanonical, sha256Hex } from './domain/hashing.ts';
import { buildSamdoReviewSeed } from './fixtures/buildSamdoReviewSeed.ts';
import { SAMDO_REVIEW_SEED, SAMDO_REVIEW_SEED_PROVENANCE } from './fixtures/samdoReviewSeed.generated.ts';
import { verifyReviewSeedProvenance } from './fixtures/provenance.ts';
import { createRuleReviewWorkspace } from './server/service.ts';
import { createBrowserRuleReviewRepository, InMemoryRuleReviewRepository, RULE_REVIEW_DEMO_SEED_KEY } from './repository/RuleReviewRepository.ts';

const sourceUrl = new URL('../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, 'utf8')) as ImportPackage;

test('portable and Web Crypto SHA-256 agree across required byte boundaries and Samdo candidate', async () => {
  const web = createWebCryptoCandidateHasher();
  const values: (string | Uint8Array)[] = ['', 'abc', '청년 특별공급 검토본', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), 'd'.repeat(1000), canonicalSerialize(SAMDO_REVIEW_SEED.rules[0].originalCandidate)];
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const value of values) assert.equal(sha256Hex(value), await web.sha256(value));
});

test('canonical serialization is stable and defines undefined semantics', () => {
  assert.equal(canonicalSerialize({ z: 1, a: '한글', omitted: undefined, nested: { y: 2, x: null } }),
    canonicalSerialize({ nested: { x: null, y: 2 }, a: '한글', z: 1 }));
  assert.equal(canonicalSerialize([1, undefined, null]), '[1,null,null]');
  assert.equal(hashCanonical({ b: 2, a: 1 }), hashCanonical({ a: 1, b: 2 }));
  assert.throws(() => canonicalSerialize(undefined), /UNDEFINED_CANONICAL_ROOT/);
  assert.throws(() => canonicalSerialize({ value: Number.NaN }), /NON_FINITE_CANONICAL_NUMBER/);
});

test('review domain accepts an injected synchronous hasher without knowing its platform', () => {
  const workspace = createRuleReviewWorkspace(SAMDO_REVIEW_SEED, { sha256: () => 'f'.repeat(64) });
  assert.ok(workspace.rules.every(rule => rule.originalCandidateHash === 'f'.repeat(64)));
});

test('generated Samdo seed is reproducible and provenance detects an in-memory source change', () => {
  assert.deepEqual(buildSamdoReviewSeed(source), SAMDO_REVIEW_SEED);
  assert.doesNotThrow(() => verifyReviewSeedProvenance(source, SAMDO_REVIEW_SEED_PROVENANCE));
  const changed = structuredClone(source); changed.announcement.title += ' 수정';
  assert.throws(() => verifyReviewSeedProvenance(changed, SAMDO_REVIEW_SEED_PROVENANCE), /STALE_REVIEW_SEED/);
});

test('browser repository receives an explicit seed and preserves domain activation guards', () => {
  const repository = createBrowserRuleReviewRepository({ getItem: key => key === RULE_REVIEW_DEMO_SEED_KEY ? JSON.stringify(SAMDO_REVIEW_SEED) : null });
  assert.ok(repository);
  assert.equal(repository.snapshot().lifecycleStatus, 'PENDING_REVIEW');
  repository.startReview({ expectedRevision: repository.snapshot().revision, reason: 'fixture repository boundary' });
  assert.equal(repository.snapshot().lifecycleStatus, 'IN_REVIEW');
  assert.equal(repository.gate().canActivate, false);
});

test('platform repository carries the full edited review to activation eligibility and revalidation', () => {
  const repository = new InMemoryRuleReviewRepository(SAMDO_REVIEW_SEED, 'reviewer:integration');
  const mutation = (reason: string) => ({ expectedRevision: repository.snapshot().revision, reason });
  repository.startReview(mutation('검수 시작'));
  assert.throws(() => repository.hold('youth.age', { expectedRevision: 0, reason: '오래된 화면' }), /STALE_REVIEW_REVISION/);

  const initial = repository.snapshot();
  const originalHash = initial.rules.find(rule => rule.ruleId === 'youth.age')!.originalCandidateHash;
  const replacement = initial.rules.find(rule => rule.ruleId === 'youth.income')!.originalCandidate.evidence[0];
  for (const rule of initial.rules) {
    const evidenceId = rule.originalCandidate.evidence[0].id;
    repository.reviewEvidence(rule.ruleId, evidenceId, rule.ruleId === 'youth.age' ? 'REPLACED' : 'VALID',
      mutation('원문 근거 검토'), rule.ruleId === 'youth.age' ? replacement : undefined);
  }
  for (const rule of repository.snapshot().rules) {
    if (rule.ruleId === 'firstHome.deposit') {
      const edited = structuredClone(rule.originalCandidate); edited.scope = 'HOUSEHOLD';
      repository.approveWithEdit(rule.ruleId, edited, ['SEMANTIC_EVIDENCE_MISMATCH'], mutation('저축액 scope 수정'));
    } else if (rule.ruleId === 'youth.restrictions') repository.reject(rule.ruleId, mutation('불필요한 extra 제외'));
    else repository.approve(rule.ruleId, mutation('원문과 일치'));
  }
  repository.linkException('youth.overseas',
    { status: 'LINKED', baseRuleId: 'youth.residence', relationType: 'LIMITED_BY' }, mutation('해외체류 제한 연결'));
  const residenceEvidenceId = repository.snapshot().rules.find(rule => rule.ruleId === 'youth.residence')!.originalCandidate.evidence[0].id;
  repository.resolveConflict('samdo.region.priority-date',
    { type: 'CUSTOM', value: '공고일 기준 1년 이상 계속 거주', evidenceIds: [residenceEvidenceId], reason: '표2 대조' },
    mutation('지역우선 충돌 해결'));
  repository.resolveUnresolved('samdo.management-number-mapping', '판정 scope에서 제외하고 별도 확인', mutation('관리번호 보류'));

  assert.equal(repository.gate().canActivate, true);
  assert.equal(repository.gate().status, 'ACTIVATION_ELIGIBLE');
  const reviewed = repository.snapshot();
  assert.equal(reviewed.rules.find(rule => rule.ruleId === 'youth.age')!.originalCandidateHash, originalHash);
  assert.equal(reviewed.rules.find(rule => rule.ruleId === 'firstHome.deposit')!.reviewStatus, 'APPROVED_WITH_EDIT');
  assert.ok(reviewed.auditLog.some(entry => entry.action === 'REVIEW_EVIDENCE' && JSON.stringify(entry.after).includes('REPLACED')));

  repository.invalidateDocument('a'.repeat(63) + '1', mutation('새 문서 수신'));
  assert.equal(repository.gate().status, 'REVALIDATION_REQUIRED');
  assert.equal(repository.gate().canActivate, false);
});

test('production UI boundary imports neither generated fixtures nor RuleReviewService', async () => {
  const [route, hook, service, materialize, fixture] = await Promise.all([
    readFile(new URL('../../app/admin/rule-review.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./ui/useRuleReviewWorkspace.ts', import.meta.url), 'utf8'),
    readFile(new URL('./server/service.ts', import.meta.url), 'utf8'),
    readFile(new URL('./server/materialize.ts', import.meta.url), 'utf8'),
    readFile(new URL('./server/samdoReviewFixture.test-data.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(route, /samdoReviewSeed\.generated/);
  assert.doesNotMatch(hook, /RuleReviewService/);
  assert.doesNotMatch(service + materialize, /node:crypto|from ['"]crypto['"]/);
  assert.doesNotMatch(fixture, /readFileSync|node:fs/);
});
