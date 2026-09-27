import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activationBlock, createScoringRepository, discardLocalDraft, editabilityOf, hasLocalDraft, localScoringRepository,
  newVersionFrom, nextVersion, runScoring, scoringMessage, scoringPermission, scoringSource,
  useServerScoringRepository,
} from './adapter.ts';
import { upsertTestCase } from './draftStore.ts';
import { scoringFormula } from './registry.ts';
import type { ScoringRepository } from './repository.ts';
import type { ScoringFormula } from './domain.ts';

const base = () => scoringFormula('general-private-standard')!;

test('서버 구현이 없으면 로컬 구현을 쓰고, 끼우면 그쪽을 쓴다', async () => {
  useServerScoringRepository(null);
  assert.equal(createScoringRepository(), localScoringRepository);
  assert.equal(scoringSource(), 'local-draft');

  const fake: ScoringRepository = { list: async () => [], save: async () => {}, setStatus: async () => {} };
  useServerScoringRepository(fake);
  assert.equal(createScoringRepository(), fake, '서버 구현을 끼우는 지점은 한 곳이다');
  assert.equal(scoringSource(), 'server');

  useServerScoringRepository(null);
});

test('로컬 구현은 배포본 위에 이 브라우저 초안을 덮어 준다', async () => {
  const formula = base();
  discardLocalDraft(formula.id);
  const before = await localScoringRepository.list();
  assert.equal(before.find(item => item.id === formula.id)?.status, 'REVIEW');
  assert.equal(hasLocalDraft(formula.id), false);

  await localScoringRepository.save({ ...formula, status: 'DRAFT' });
  const after = await localScoringRepository.list();
  assert.equal(after.find(item => item.id === formula.id)?.status, 'DRAFT');
  assert.equal(hasLocalDraft(formula.id), true);
  assert.equal(scoringFormula('general-private-standard')!.status, 'REVIEW', '배포 파일은 그대로다');

  discardLocalDraft(formula.id);
});

test('활성화 조건은 서버가 막는 것과 같은 것을 로컬에서도 막는다', async () => {
  const formula = base();
  discardLocalDraft(formula.id);

  // 예시가 틀리면 활성으로 못 간다.
  await localScoringRepository.save(upsertTestCase(formula, { ...formula.testCases[0], expectedTotal: 1 }));
  const failed = await runScoring(() => localScoringRepository.setStatus(formula.id, 'ACTIVE', '검사'));
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.code, 'SCORING_NOT_READY');
    assert.match(failed.message, /검사를 통과하지 못했어요/);
  }

  discardLocalDraft(formula.id);
  const passed = await runScoring(() => localScoringRepository.setStatus(formula.id, 'ACTIVE', '검사'));
  assert.equal(passed.ok, true, '법정 배점표는 활성화할 수 있어야 한다');
  discardLocalDraft(formula.id);
});

test('오류 코드는 언제나 운영자 문구로 바뀐다', () => {
  // 서버 계약에 있는 코드는 계약의 문구를 그대로 쓴다.
  assert.match(scoringMessage('SCORING_VERSION_PUBLISHED'), /새 버전/);
  assert.match(scoringMessage('SCORING_TARGET_ALREADY_ACTIVE'), /중지/);
  assert.match(scoringMessage('SCORING_FORMULA_NOT_FOUND'), /찾지 못했어요/);
  assert.match(scoringMessage('AUTH_REQUIRED'), /로그인/);
  // 계약에 없는 코드도 코드값을 그대로 보여주지 않는다.
  assert.match(scoringMessage('SCORING_NOT_READY'), /검사/);
  assert.match(scoringMessage('아무거나'), /처리하지 못했어요/);
});

test('검수자는 보기만, 관리자는 고치고 활성화까지', () => {
  const admin = scoringPermission('admin');
  assert.deepEqual(admin, { canEdit: true, canActivate: true, reason: null });

  const reviewer = scoringPermission('reviewer');
  assert.equal(reviewer.canEdit, false);
  assert.equal(reviewer.canActivate, false);
  assert.match(reviewer.reason ?? '', /관리자만/, '잠근 이유를 반드시 적는다');

  const anonymous = scoringPermission(null);
  assert.equal(anonymous.canEdit, false);
  assert.match(anonymous.reason ?? '', /로그인/);
});

test('이미 서비스에 쓰인 버전은 고치지 않고 새 버전을 뜬다', () => {
  const admin = scoringPermission('admin');
  const draft = editabilityOf({ ...base(), status: 'DRAFT' }, admin);
  assert.deepEqual(draft, { canEditBands: true, mustCreateNewVersion: false, notice: null });

  const active = editabilityOf({ ...base(), status: 'ACTIVE' }, admin);
  assert.equal(active.canEditBands, false);
  assert.equal(active.mustCreateNewVersion, true);
  assert.match(active.notice ?? '', /새 버전/);

  // 중지된 버전도 이미 서비스에 나간 적이 있으므로 같은 규칙을 쓴다.
  assert.equal(editabilityOf({ ...base(), status: 'SUSPENDED' }, admin).mustCreateNewVersion, true);

  // 권한이 없으면 버전 문제 이전에 편집 자체가 안 된다.
  const reviewer = editabilityOf({ ...base(), status: 'DRAFT' }, scoringPermission('reviewer'));
  assert.equal(reviewer.canEditBands, false);
  assert.equal(reviewer.mustCreateNewVersion, false);
  assert.match(reviewer.notice ?? '', /관리자만/);
});

test('새 버전은 초안이고 사용자에게 공개되지 않는다', () => {
  const active: ScoringFormula = { ...base(), status: 'ACTIVE', publishedToUsers: true, version: '1.2.3' };
  const next = newVersionFrom(active, '홍길동');
  assert.equal(next.version, '1.3.0');
  assert.equal(next.status, 'DRAFT');
  assert.equal(next.publishedToUsers, false, '새 버전이 곧바로 사용자에게 나가면 안 된다');
  assert.notEqual(next.id, active.id, '같은 id 를 쓰면 이전 버전을 덮어쓴다');
  assert.deepEqual(next.components, active.components, '배점 항목은 그대로 가져온다');
  assert.deepEqual(next.testCases, active.testCases, '예시도 그대로 가져온다');
  assert.match(next.history.at(-1)!.summary, /1\.3\.0/);
  assert.equal(next.history.at(-1)!.actor, '홍길동');
});

test('버전 올리기는 모양이 이상해도 무너지지 않는다', () => {
  assert.equal(nextVersion('1.0.0'), '1.1.0');
  assert.equal(nextVersion('2.9.4'), '2.10.0');
  assert.equal(nextVersion('v1'), 'v1.1');
  assert.equal(nextVersion(''), '1.0.0.1');
});

test('활성화 버튼이 막힌 이유를 한 문장으로 준다', () => {
  const ready = base();
  assert.equal(activationBlock(ready, scoringPermission('admin')), null);
  assert.match(activationBlock(ready, scoringPermission('reviewer')) ?? '', /관리자만/);
  const broken = upsertTestCase(ready, { ...ready.testCases[0], expectedTotal: 1 });
  assert.match(activationBlock(broken, scoringPermission('admin')) ?? '', /검사/);
});
