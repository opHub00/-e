import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actorName, auditActionLabel, auditActorLabel, auditRows, operatorError, testInputMismatchMessage, transitionReason,
} from './operatorCopy.ts';
import type { FormulaAuditEntry, StoredScoringFormula } from './repository.ts';
import type { ScoringComponent } from './domain.ts';

const UUID = '3f7b1b6e-2c4d-4a55-9f0e-1b2c3d4e5f60';
const actors: StoredScoringFormula['actors'] = {
  created: { userId: UUID, email: 'jo@wanpane.test', role: 'admin' },
  updated: { userId: UUID, email: 'jo@wanpane.test', role: 'admin' },
  activated: null,
};

const entry = (over: Partial<FormulaAuditEntry> = {}): FormulaAuditEntry => ({
  id: 1, action: 'ACTIVATE', actorUserId: UUID, reason: '검토를 마쳐 활성화', before: null, after: null,
  revision: 2, createdAt: '2026-09-28T01:00:00.000Z',
  ...over,
});

test('감사 기록에 UUID 를 그대로 보여주지 않는다', () => {
  const [row] = auditRows([entry()], actors);
  assert.equal(row.actor, 'jo@wanpane.test');
  assert.doesNotMatch(row.actor, /[0-9a-f]{8}-[0-9a-f]{4}/, 'UUID 가 화면에 나오면 안 된다');

  // 같은 산식의 actors 에 없는 사용자라도 UUID 를 노출하지 않는다.
  const [unknown] = auditRows([entry({ actorUserId: 'ffffffff-0000-4000-8000-000000000000' })], actors);
  assert.equal(unknown.actor, '확인할 수 없는 계정');
  assert.doesNotMatch(unknown.actor, /ffffffff/);

  // 원래 값은 고급 정보에서 볼 수 있어야 한다. 숨기는 게 아니라 뒤로 미루는 것이다.
  assert.equal(unknown.raw.actorUserId, 'ffffffff-0000-4000-8000-000000000000');

  assert.equal(auditActorLabel(null, new Map()), '시스템');
  assert.equal(actorName(null), '기록 없음');
  assert.equal(actorName({ userId: UUID, email: null, role: 'admin' }), '확인할 수 없는 계정');
});

test('action 코드를 운영자 말로 바꾼다', () => {
  assert.equal(auditActionLabel('CLONE'), '새 버전 생성');
  assert.equal(auditActionLabel('CLONE_VERSION'), '새 버전 생성');
  assert.equal(auditActionLabel('REQUEST_REVIEW'), '검토 요청');
  assert.equal(auditActionLabel('ACTIVATE'), '활성화');
  assert.equal(auditActionLabel('RETIRE'), '중지');
  assert.equal(auditActionLabel('CREATE_BAND'), '구간 추가');
  assert.equal(auditActionLabel('AUTO_RETIRE_FOR_REPLACEMENT'), '새 버전으로 교체되며 중지');
  // 모르는 코드도 코드값을 그대로 보여주지 않는다.
  assert.equal(auditActionLabel('SOME_NEW_ACTION'), '기타 변경');
});

test('감사 기록은 최근 것이 위에 오고, 사유를 그대로 싣는다', () => {
  const rows = auditRows([
    entry({ id: 1, action: 'CREATE', reason: '처음 등록' }),
    entry({ id: 3, action: 'ACTIVATE', reason: '검토 완료' }),
    entry({ id: 2, action: 'REQUEST_REVIEW', reason: '' }),
  ], actors);
  assert.deepEqual(rows.map(row => row.action), ['활성화', '검토 요청', '산식 만들기']);
  assert.equal(rows[0].reason, '검토 완료');
  assert.equal(rows[1].reason, '', '사유가 없으면 코드로 채우지 않고 비워 둔다');
});

test('DB 원문과 제약 이름은 기본 화면에 내보내지 않는다', () => {
  const duplicate = operatorError('SCORING_DB_ERROR:duplicate key value violates unique constraint "scoring_formulas_slug_version_key"');
  assert.match(duplicate.message, /같은 값이 이미 있어요/);
  assert.doesNotMatch(duplicate.message, /unique constraint|duplicate key|scoring_formulas_slug/);
  assert.match(duplicate.detail ?? '', /unique constraint/, '원문은 고급 정보에 남긴다');

  const other = operatorError('SCORING_DB_ERROR:null value in column "slug" violates not-null constraint');
  assert.doesNotMatch(other.message, /null value|column|constraint/);
  assert.ok(other.detail);

  // 계약에 있는 코드는 계약 문구를 그대로 쓴다.
  const known = operatorError('SCORING_STALE_REVISION');
  assert.match(known.message, /다른 관리자가 먼저 변경했어요/);
  assert.equal(known.detail, null);

  // 계약에 없는 코드도 코드값을 화면에 싣지 않는다.
  const unknown = operatorError('SOMETHING_ELSE');
  assert.doesNotMatch(unknown.message, /SOMETHING_ELSE/);
  assert.equal(unknown.detail, 'SOMETHING_ELSE');

  assert.match(operatorError('SCORING_DUPLICATE_DRAFT').message, /이미 만들어 둔 초안/);
  assert.match(operatorError('REASON_REQUIRED').message, /사유를 적어/);
});

test('검증 예시 입력이 어긋나면 배점 항목 이름으로 알려준다', () => {
  const components: ScoringComponent[] = [
    { id: 'noHomePeriod', label: '무주택 기간', description: '', unit: '개월', fact: 'noHomeMonths', order: 1, bands: [] },
    { id: 'dependents', label: '부양가족 수', description: '', unit: '명', fact: 'dependentCount', order: 2, bands: [] },
  ];
  const missing = testInputMismatchMessage(components, { noHomePeriod: 12 });
  assert.match(missing, /부양가족 수 값이 빠졌어요/);
  assert.doesNotMatch(missing, /key|item_key|inputs/i, '기술 용어를 쓰지 않는다');

  const extra = testInputMismatchMessage(components, { noHomePeriod: 12, dependents: 2, noHomeMonths: 12 });
  assert.match(extra, /배점 항목에 없는 값\(noHomeMonths\)/);

  const both = testInputMismatchMessage(components, { noHomeMonths: 12 });
  assert.match(both, /무주택 기간, 부양가족 수 값이 빠졌어요/);
  assert.match(both, /2개를 모두 채워야/);
});

test('막힌 상태 전이는 이유와 대안을 함께 말한다', () => {
  assert.match(transitionReason('ACTIVE', 'DRAFT', true) ?? '', /새 버전을 만들어/);
  assert.match(transitionReason('SUSPENDED', 'ACTIVE', true) ?? '', /되살리지 않아요/);
  assert.match(transitionReason('REVIEW', 'DRAFT', true) ?? '', /초안으로 되돌릴 수 없어요/);
  assert.match(transitionReason('DRAFT', 'ACTIVE', true) ?? '', /검토 요청을 거쳐야/);
  // 권한이 없으면 전이 규칙보다 먼저 그 사실을 말한다.
  assert.match(transitionReason('DRAFT', 'REVIEW', false) ?? '', /관리자만/);
  // 같은 상태이거나 허용되는 전이는 이유가 없다.
  assert.equal(transitionReason('DRAFT', 'DRAFT', true), null);
  assert.equal(transitionReason('REVIEW', 'ACTIVE', true), null);
  assert.equal(transitionReason('ACTIVE', 'SUSPENDED', true), null);
});

test('픽스처 저장소도 서버처럼 후속 초안을 계산한다', async () => {
  const { InMemoryScoringFormulaRepository, loadScoringFormulaDetail, changeFormulaStatus, createNextFormulaVersion } =
    await import('./adapter.ts');
  const repository = new InMemoryScoringFormulaRepository();
  const review = (await loadScoringFormulaDetail('general-private-standard', repository)).formula;
  // 서버와 같은 뜻: 같은 slug 에 초안·검토 중 버전이 있는가. 검토 중인 자기 자신도 센다.
  assert.equal(review.hasDraft, true, '검토 중인 버전 자신도 초안으로 센다');

  const active = await changeFormulaStatus(repository, review, 'ACTIVE');
  assert.equal(active.hasDraft, false, '활성으로 옮기면 더 이상 초안이 없다');
  const cloned = await createNextFormulaVersion(repository, active);

  const reloaded = (await loadScoringFormulaDetail(active.id, repository)).formula;
  assert.equal(reloaded.hasDraft, true, '초안을 만든 뒤에는 원본이 그 사실을 알아야 한다');
  assert.equal(reloaded.draftVersion?.version, cloned.version);
  assert.equal(reloaded.draftVersion?.id, cloned.id, '초안 열기 동선이 쓸 id 가 있어야 한다');
});

test('상태 변경 사유에 내부 enum 을 쓰지 않는다', async () => {
  const { InMemoryScoringFormulaRepository, loadScoringFormulaDetail, changeFormulaStatus } = await import('./adapter.ts');
  const repository = new InMemoryScoringFormulaRepository();
  const review = (await loadScoringFormulaDetail('general-private-standard', repository)).formula;
  const active = await changeFormulaStatus(repository, review, 'ACTIVE');
  const [latest] = auditRows(active.audit, active.actors);
  assert.equal(latest.action, '활성화');
  assert.doesNotMatch(latest.reason, /ACTIVE|DRAFT|IN_REVIEW|RETIRED/, '사유에 내부 상태값이 남으면 안 된다');
  assert.match(latest.reason, /활성/);
});
