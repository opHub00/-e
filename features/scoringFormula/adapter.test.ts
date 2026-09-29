import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryScoringFormulaRepository,
  activateAndPublishFormula,
  activationBlock,
  changeFormulaStatus,
  createFormulaTestCase,
  createNextFormulaVersion,
  createScoringRepository,
  loadScoringFormulaDetail,
  loadScoringFormulaList,
  nextVersion,
  resetScoringRepositoryForTests,
  runScoring,
  scoringMessage,
  scoringPermission,
  scoringSource,
  setFormulaPublication,
  toScoringFormulaView,
  useServerScoringRepository,
} from './adapter.ts';
import { scoringFormula } from './registry.ts';
import type { ScoringFormulaRepository, StoredScoringFormula } from './repository.ts';

const adminAccess = { role: 'admin' as const, canRead: true as const, canReview: true as const, canMutate: true, canActivate: true };
const reviewerAccess = { role: 'reviewer' as const, canRead: true as const, canReview: true as const, canMutate: false, canActivate: false };

test('명시적 test 환경만 메모리 repository를 사용하고 browser draftStore는 쓰지 않는다', () => {
  const previous = process.env.EXPO_PUBLIC_WANPANE_ENV;
  process.env.EXPO_PUBLIC_WANPANE_ENV = 'test';
  resetScoringRepositoryForTests();
  assert.ok(createScoringRepository() instanceof InMemoryScoringFormulaRepository);
  assert.equal(scoringSource(), 'fixture-repository');
  process.env.EXPO_PUBLIC_WANPANE_ENV = previous;
  resetScoringRepositoryForTests();
});

test('repository 주입 지점은 ScoringFormulaRepository 하나다', () => {
  const repository = new InMemoryScoringFormulaRepository();
  useServerScoringRepository(repository);
  assert.equal(createScoringRepository(), repository);
  assert.equal(scoringSource(), 'injected');
  useServerScoringRepository(null);
  resetScoringRepositoryForTests();
});

test('DB 상태는 UI 상태로만 번역하고 revision·draft·actor를 보존한다', async () => {
  const repository = new InMemoryScoringFormulaRepository();
  const list = await loadScoringFormulaList(repository);
  assert.equal(list.access.role, 'admin');
  const formula = list.formulas.find(value => value.id === 'general-private-standard')!;
  assert.equal(formula.status, 'REVIEW', 'IN_REVIEW → REVIEW');
  assert.equal(formula.hasDraft, true);
  assert.equal(formula.actors.updated?.userId, 'local-admin');
  const retired = toScoringFormulaView({ ...await repository.get(formula.id), status: 'RETIRED' });
  assert.equal(retired.status, 'SUSPENDED', 'RETIRED → SUSPENDED');
});

test('ACTIVE 수정 오류 SCORING_VERSION_PUBLISHED는 그대로 전달된다', async () => {
  const formula = scoringFormula('general-private-standard')!;
  const active: StoredScoringFormula = {
    ...formula, status: 'ACTIVE', slug: formula.id, target: formula.targets[0], scopeKey: formula.targets[0],
    revision: 7, hasDraft: false, draftVersion: null,
    actors: { created: null, updated: null, activated: null },
  };
  const fake = repositoryStub({ formula: active });
  fake.updateMetadata = async () => { throw new Error('SCORING_VERSION_PUBLISHED'); };
  const outcome = await runScoring(() => fake.updateMetadata(active.id, { name: 'blocked' }, { expectedRevision: 7, reason: 'edit' }));
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, 'SCORING_VERSION_PUBLISHED');
});

test('ACTIVE 편집은 cloneVersion을 사용하고 서버 snapshot·audit을 채택한다', async () => {
  const repository = new InMemoryScoringFormulaRepository();
  const review = (await loadScoringFormulaDetail('general-private-standard', repository)).formula;
  const active = await changeFormulaStatus(repository, review, 'ACTIVE');
  const cloned = await createNextFormulaVersion(repository, active);
  assert.equal(cloned.status, 'DRAFT');
  assert.equal(cloned.revision, 1);
  assert.notEqual(cloned.id, active.id);
  assert.deepEqual(cloned.components, active.components);
  const sourceAfterClone = await repository.get(active.id);
  assert.equal(sourceAfterClone.hasDraft, true, 'source ACTIVE snapshot also reports its sibling draft');
  assert.equal(sourceAfterClone.draftVersion?.id, cloned.id);
});

test('검토본은 revision과 audit을 보존하며 초안으로 되돌릴 수 있다', async () => {
  const repository = new InMemoryScoringFormulaRepository();
  const review = (await loadScoringFormulaDetail('general-private-standard', repository)).formula;
  const draft = await changeFormulaStatus(repository, review, 'DRAFT');
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.revision, review.revision + 1);
  assert.equal(draft.audit.at(-1)?.action, 'RETURN_TO_DRAFT');
});

test('test case inputs는 component.id(DB item_key) 집합과 정확히 같아야 한다', async () => {
  const repository = new InMemoryScoringFormulaRepository();
  const review = (await loadScoringFormulaDetail('general-private-standard', repository)).formula;
  const formula = await changeFormulaStatus(repository, review, 'DRAFT');
  const inputs = Object.fromEntries(formula.components.map(component => [component.id, 0]));
  const saved = await createFormulaTestCase(repository, formula, { id: 'case-contract', label: '계약 확인', inputs, expectedTotal: 6 });
  assert.deepEqual(Object.keys(saved.testCases.at(-1)!.inputs).sort(), formula.components.map(component => component.id).sort());
  await assert.rejects(
    () => createFormulaTestCase(repository, saved, { id: 'case-wrong', label: '잘못된 키', inputs: { noHomeMonths: 0 }, expectedTotal: 2 }),
    /TEST_INPUT_KEYS_MISMATCH/,
  );
});

test('권한 UI는 repository.getAccess 결과를 사용한다', () => {
  assert.deepEqual(scoringPermission(adminAccess), { canEdit: true, canActivate: true, canReview: true, reason: null });
  const reviewer = scoringPermission(reviewerAccess);
  assert.equal(reviewer.canEdit, false);
  assert.equal(reviewer.canReview, true);
  assert.equal(reviewer.canActivate, false);
  assert.match(reviewer.reason ?? '', /관리자만/);
});

test('상태 mutation은 expectedRevision과 reason을 전달하고 서버 snapshot을 사용한다', async () => {
  const repository = new InMemoryScoringFormulaRepository();
  const before = (await loadScoringFormulaDetail('general-private-standard', repository)).formula;
  const after = await changeFormulaStatus(repository, before, 'ACTIVE');
  assert.equal(after.status, 'ACTIVE');
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.audit.at(-1)?.action, 'ACTIVATE');
  await assert.rejects(() => changeFormulaStatus(repository, before, 'ACTIVE'), /SCORING_STALE_REVISION/);
});

test('ACTIVE 공개 여부는 내용 수정 없이 revision과 audit을 남긴다', async () => {
  const repository = new InMemoryScoringFormulaRepository();
  const review = (await loadScoringFormulaDetail('general-private-standard', repository)).formula;
  const active = await activateAndPublishFormula(repository, review);
  const hidden = await setFormulaPublication(repository, active, false);
  assert.equal(hidden.status, 'ACTIVE');
  assert.equal(hidden.publishedToUsers, false);
  assert.equal(hidden.revision, active.revision + 1);
  assert.equal(hidden.audit.at(-1)?.action, 'HIDE_FROM_USERS');
  const visible = await setFormulaPublication(repository, hidden, true);
  assert.equal(visible.publishedToUsers, true);
  assert.equal(visible.audit.at(-1)?.action, 'PUBLISH_TO_USERS');
});

test('오류 문구와 활성화 guard는 안전하게 유지된다', () => {
  assert.match(scoringMessage('SCORING_VERSION_PUBLISHED'), /새.*버전/);
  assert.match(scoringMessage('AUTH_REQUIRED'), /로그인/);
  const formula = scoringFormula('general-private-standard')!;
  assert.equal(activationBlock(formula, scoringPermission(adminAccess)), null);
  assert.match(activationBlock(formula, scoringPermission(reviewerAccess)) ?? '', /관리자만/);
});

test('버전 올리기는 결정적이다', () => {
  assert.equal(nextVersion('1.0.0'), '1.1.0');
  assert.equal(nextVersion('2.9.4'), '2.10.0');
  assert.equal(nextVersion('v1'), 'v1.1');
});

function repositoryStub({ formula }: { formula: StoredScoringFormula }): ScoringFormulaRepository {
  const unavailable = async () => { throw new Error('UNUSED'); };
  return {
    getAccess: async () => adminAccess,
    list: async () => [formula], get: async () => formula,
    createDraft: unavailable, cloneVersion: unavailable, updateMetadata: unavailable,
    createItem: unavailable, updateItem: unavailable, deleteItem: unavailable,
    createBand: unavailable, updateBand: unavailable, deleteBand: unavailable,
    createTestCase: unavailable, updateTestCase: unavailable, deleteTestCase: unavailable,
    requestReview: unavailable, returnToDraft: unavailable, review: unavailable, activate: unavailable, setPublication: unavailable, retire: unavailable,
    auditHistory: async () => [], getActiveFormula: async () => null, evaluateActiveFormula: async () => null,
  } as ScoringFormulaRepository;
}
