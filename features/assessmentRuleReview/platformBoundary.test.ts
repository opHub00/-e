import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ImportPackage } from '../applicationAssessment/server/importPackage.ts';
import { canonicalSerialize, createWebCryptoCandidateHasher, hashCanonical, sha256Hex } from './domain/hashing.ts';
import { buildSamdoReviewSeed } from './fixtures/buildSamdoReviewSeed.ts';
import { SAMDO_REVIEW_SEED, SAMDO_REVIEW_SEED_PROVENANCE } from './fixtures/samdoReviewSeed.generated.ts';
import { verifyReviewSeedProvenance } from './fixtures/provenance.ts';
import { createRuleReviewWorkspace } from './server/service.ts';
import { createBrowserRuleReviewRepository, RULE_REVIEW_DEMO_SEED_KEY } from './repository/RuleReviewRepository.ts';

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
  repository.startReview('fixture repository boundary');
  assert.equal(repository.snapshot().lifecycleStatus, 'IN_REVIEW');
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
