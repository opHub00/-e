import { loadFormulas } from './registry.ts';
import {
  ScoringRepositoryException,
  scoringErrorMessage,
  type FormulaAuditEntry,
  type FormulaMutation,
  type PersistedScoringStatus,
  type ScoringAccess,
  type ScoringFormulaRepository,
  type StoredScoringFormula,
} from './repository.ts';
import {
  calculateScore,
  runTestCases,
  validateFormula,
  type ScoringBand,
  type ScoringComponent,
  type ScoringFormula,
  type ScoringResult,
  type ScoringStatus,
  type ScoringTarget,
  type ScoringTestCase,
} from './domain.ts';

export type ScoringSource = 'fixture-repository' | 'supabase' | 'injected';

export type ScoringFormulaView = ScoringFormula & {
  revision: number;
  hasDraft: boolean;
  draftVersion: StoredScoringFormula['draftVersion'];
  actors: StoredScoringFormula['actors'];
  audit: FormulaAuditEntry[];
};

const LOCAL_ENVIRONMENTS = new Set(['local', 'development', 'test']);
const uiStatus = (status: PersistedScoringStatus): ScoringStatus =>
  status === 'IN_REVIEW' ? 'REVIEW' : status === 'RETIRED' ? 'SUSPENDED' : status;
const storedStatus = (status: ScoringStatus): PersistedScoringStatus =>
  status === 'REVIEW' ? 'IN_REVIEW' : status === 'SUSPENDED' ? 'RETIRED' : status;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function toScoringFormulaView(formula: StoredScoringFormula, audit = formula.audit ?? []): ScoringFormulaView {
  return {
    ...clone(formula),
    status: uiStatus(formula.status),
    audit: clone(audit),
    history: audit.map(entry => ({
      at: entry.createdAt,
      actor: entry.actor?.displayLabel ?? entry.actorUserId ?? '시스템',
      summary: entry.reason || entry.action,
    })),
  };
}

const localActor = { userId: 'local-admin', email: 'local-admin@example.test', displayLabel: 'local-admin@example.test', role: 'admin' as const };

/** E2E와 로컬 개발 전용 repository. 브라우저 storage를 사용하지 않는다. */
export class InMemoryScoringFormulaRepository implements ScoringFormulaRepository {
  private readonly formulas = new Map<string, StoredScoringFormula>();
  private readonly logs = new Map<string, FormulaAuditEntry[]>();
  private auditId = 0;
  private readonly access: ScoringAccess;

  constructor(access: ScoringAccess = {
    role: 'admin', canRead: true, canReview: true, canMutate: true, canActivate: true,
  }) {
    this.access = access;
    for (const formula of loadFormulas()) {
      const status = storedStatus(formula.status);
      this.formulas.set(formula.id, {
        ...clone(formula),
        status,
        slug: formula.id.split('@')[0],
        target: formula.targets[0],
        scopeKey: formula.targets[0],
        revision: 1,
        hasDraft: status === 'DRAFT' || status === 'IN_REVIEW',
        draftVersion: status === 'DRAFT' || status === 'IN_REVIEW'
          ? { id: formula.id, version: formula.version, status, updatedAt: formula.updatedAt }
          : null,
        actors: { created: localActor, updated: localActor, activated: status === 'ACTIVE' ? localActor : null },
      });
      this.logs.set(formula.id, []);
    }
  }

  private requireAdmin(): void { if (!this.access.canMutate) throw new Error('FORBIDDEN'); }
  private withDraftState(value: StoredScoringFormula): StoredScoringFormula {
    const draft = [...this.formulas.values()]
      .filter(candidate => candidate.slug === value.slug && (candidate.status === 'DRAFT' || candidate.status === 'IN_REVIEW'))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return {
      ...value,
      hasDraft: Boolean(draft),
      draftVersion: draft ? { id: draft.id, version: draft.version, status: draft.status as 'DRAFT' | 'IN_REVIEW', updatedAt: draft.updatedAt } : null,
    };
  }
  private read(id: string): StoredScoringFormula {
    const value = this.formulas.get(id);
    if (!value) throw new Error('SCORING_FORMULA_NOT_FOUND');
    return this.withDraftState(value);
  }
  private mutation(id: string, mutation: FormulaMutation): StoredScoringFormula {
    this.requireAdmin();
    if (!mutation.reason.trim()) throw new Error('SCORING_VALIDATION_FAILED');
    const current = this.read(id);
    if (current.revision !== mutation.expectedRevision) throw new Error('SCORING_STALE_REVISION');
    if (current.status === 'ACTIVE') throw new Error('SCORING_VERSION_PUBLISHED');
    if (current.status === 'RETIRED') throw new Error('SCORING_VERSION_IMMUTABLE');
    return current;
  }
  private save(current: StoredScoringFormula, next: StoredScoringFormula, action: string, reason: string): StoredScoringFormula {
    const revision = current.revision + 1;
    const updated = {
      ...clone(next), revision, updatedAt: new Date().toISOString(),
      actors: { ...next.actors, updated: localActor },
    };
    this.formulas.set(updated.id, updated);
    const entry: FormulaAuditEntry = {
      id: ++this.auditId, action, actorUserId: localActor.userId, actor: localActor, reason,
      before: clone(current), after: clone(updated), revision, createdAt: updated.updatedAt,
    };
    this.logs.set(updated.id, [...(this.logs.get(updated.id) ?? []), entry]);
    return clone(updated);
  }

  async getAccess() { return clone(this.access); }
  async list() { return [...this.formulas.values()].map(value => clone(this.withDraftState(value))); }
  async get(id: string) { return clone(this.read(id)); }
  async createDraft(input: Parameters<ScoringFormulaRepository['createDraft']>[0], reason: string) {
    this.requireAdmin();
    if (!reason.trim()) throw new Error('SCORING_VALIDATION_FAILED');
    const id = `${input.slug}@${input.version}`;
    if (this.formulas.has(id)) throw new Error('SCORING_VERSION_CONFLICT');
    const now = new Date().toISOString();
    const formula: StoredScoringFormula = {
      id, slug: input.slug, version: input.version, name: input.name, description: input.description,
      target: input.target, targets: [input.target], scopeKey: input.scopeKey, status: 'DRAFT',
      publishedToUsers: false, legalBasis: input.legalBasis, interpretations: clone(input.interpretations),
      components: [], testCases: [], history: [], revision: 1, hasDraft: true,
      draftVersion: { id, version: input.version, status: 'DRAFT', updatedAt: now },
      actors: { created: localActor, updated: localActor, activated: null }, updatedAt: now,
    };
    this.formulas.set(id, formula); this.logs.set(id, []); return clone(formula);
  }
  async cloneVersion(id: string, version: string, reason: string) {
    this.requireAdmin();
    const current = this.read(id);
    const nextId = `${current.slug}@${version}`;
    if (this.formulas.has(nextId)) throw new Error('SCORING_VERSION_CONFLICT');
    const now = new Date().toISOString();
    const next: StoredScoringFormula = {
      ...clone(current), id: nextId, version, status: 'DRAFT', publishedToUsers: false, revision: 1,
      hasDraft: true, draftVersion: { id: nextId, version, status: 'DRAFT', updatedAt: now },
      actors: { created: localActor, updated: localActor, activated: null }, audit: undefined, history: [], updatedAt: now,
    };
    this.formulas.set(nextId, next); this.logs.set(nextId, []);
    this.logs.set(id, [...(this.logs.get(id) ?? []), {
      id: ++this.auditId, action: 'CLONE_VERSION', actorUserId: localActor.userId, actor: localActor, reason,
      before: { id }, after: { id: nextId }, revision: current.revision, createdAt: now,
    }]);
    return clone(next);
  }
  async updateMetadata(id: string, patch: Parameters<ScoringFormulaRepository['updateMetadata']>[1], m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, { ...current, ...clone(patch) }, 'UPDATE_METADATA', m.reason);
  }
  async createItem(id: string, item: ScoringComponent, m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, { ...current, components: [...current.components, clone(item)] }, 'CREATE_ITEM', m.reason);
  }
  async updateItem(id: string, item: ScoringComponent, m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, { ...current, components: current.components.map(value => value.id === item.id ? clone(item) : value) }, 'UPDATE_ITEM', m.reason);
  }
  async deleteItem(id: string, itemId: string, m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, { ...current, components: current.components.filter(value => value.id !== itemId) }, 'DELETE_ITEM', m.reason);
  }
  async createBand(id: string, itemId: string, band: ScoringBand, order: number, m: FormulaMutation) {
    const current = this.mutation(id, m);
    const nextBand = { ...clone(band), recordId: `${id}:${itemId}:${Date.now()}` } as ScoringBand;
    return this.save(current, {
      ...current,
      components: current.components.map(item => item.id === itemId
        ? { ...item, bands: [...item.bands.slice(0, order), nextBand, ...item.bands.slice(order)] }
        : item),
    }, 'CREATE_BAND', m.reason);
  }
  async updateBand(id: string, bandId: string, band: ScoringBand, _order: number, m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, {
      ...current,
      components: current.components.map(item => ({
        ...item,
        bands: item.bands.map((value, index) => bandRecordId(value, item.id, index) === bandId
          ? { ...clone(band), recordId: bandId } as ScoringBand : value),
      })),
    }, 'UPDATE_BAND', m.reason);
  }
  async deleteBand(id: string, bandId: string, m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, {
      ...current,
      components: current.components.map(item => ({
        ...item, bands: item.bands.filter((value, index) => bandRecordId(value, item.id, index) !== bandId),
      })),
    }, 'DELETE_BAND', m.reason);
  }
  async createTestCase(id: string, testCase: ScoringTestCase, order: number, m: FormulaMutation) {
    const current = this.mutation(id, m); assertTestInputKeys(current, testCase);
    const cases = [...current.testCases]; cases.splice(order, 0, clone(testCase));
    return this.save(current, { ...current, testCases: cases }, 'CREATE_TEST_CASE', m.reason);
  }
  async updateTestCase(id: string, testCase: ScoringTestCase, _order: number, m: FormulaMutation) {
    const current = this.mutation(id, m); assertTestInputKeys(current, testCase);
    return this.save(current, {
      ...current, testCases: current.testCases.map(value => value.id === testCase.id ? clone(testCase) : value),
    }, 'UPDATE_TEST_CASE', m.reason);
  }
  async deleteTestCase(id: string, testCaseId: string, m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, { ...current, testCases: current.testCases.filter(value => value.id !== testCaseId) }, 'DELETE_TEST_CASE', m.reason);
  }
  async requestReview(id: string, m: FormulaMutation) {
    const current = this.mutation(id, m);
    return this.save(current, {
      ...current, status: 'IN_REVIEW',
      draftVersion: { id, version: current.version, status: 'IN_REVIEW', updatedAt: current.updatedAt },
    }, 'REQUEST_REVIEW', m.reason);
  }
  async returnToDraft(id: string, m: FormulaMutation) {
    this.requireAdmin();
    const current = this.read(id);
    if (current.revision !== m.expectedRevision) throw new Error('SCORING_STALE_REVISION');
    if (current.status !== 'IN_REVIEW') throw new Error('SCORING_STATUS_INVALID');
    return this.save(current, {
      ...current, status: 'DRAFT',
      draftVersion: { id, version: current.version, status: 'DRAFT', updatedAt: current.updatedAt },
    }, 'RETURN_TO_DRAFT', m.reason);
  }
  async review(id: string) {
    const current = this.read(id);
    const view = toScoringFormulaView(current);
    return {
      validation: validateFormula(view).map(item => item.message),
      testCases: runTestCases(view).map(run => ({
        id: run.testCase.id, expectedTotal: run.testCase.expectedTotal,
        actualTotal: run.actualTotal, passed: run.passed,
      })),
    };
  }
  async activate(id: string, publishToUsers: boolean, m: FormulaMutation) {
    this.requireAdmin();
    const current = this.read(id);
    if (current.revision !== m.expectedRevision) throw new Error('SCORING_STALE_REVISION');
    if (current.status !== 'IN_REVIEW') throw new Error(current.status === 'ACTIVE' ? 'SCORING_VERSION_PUBLISHED' : 'SCORING_STATUS_INVALID');
    const review = await this.review(id);
    if (review.validation.length) throw new Error('SCORING_VALIDATION_FAILED');
    if (!review.testCases.length || review.testCases.some(test => !test.passed)) throw new Error('SCORING_TEST_CASE_FAILED');
    return this.save(current, {
      ...current, status: 'ACTIVE', publishedToUsers: publishToUsers, hasDraft: false, draftVersion: null,
      actors: { ...current.actors, activated: localActor },
    }, 'ACTIVATE', m.reason);
  }
  async retire(id: string, m: FormulaMutation) {
    this.requireAdmin();
    const current = this.read(id);
    if (current.revision !== m.expectedRevision) throw new Error('SCORING_STALE_REVISION');
    if (current.status !== 'ACTIVE') throw new Error('SCORING_STATUS_INVALID');
    return this.save(current, { ...current, status: 'RETIRED', publishedToUsers: false }, 'RETIRE', m.reason);
  }
  async auditHistory(id: string) { this.read(id); return clone(this.logs.get(id) ?? []); }
  async getActiveFormula(target: ScoringTarget) {
    return clone([...this.formulas.values()].find(value => value.target === target && value.status === 'ACTIVE' && value.publishedToUsers) ?? null);
  }
  async evaluateActiveFormula(target: ScoringTarget, input: Record<string, number | null>): Promise<ScoringResult | null> {
    const value = await this.getActiveFormula(target);
    return value ? calculateScore(toScoringFormulaView(value), input) : null;
  }
}

function assertTestInputKeys(formula: StoredScoringFormula, testCase: ScoringTestCase): void {
  const actual = Object.keys(testCase.inputs).sort();
  const expected = formula.components.map(item => item.id).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('SCORING_VALIDATION_FAILED');
}

function bandRecordId(band: ScoringBand, itemId: string, index: number): string {
  return (band as ScoringBand & { recordId?: string }).recordId ?? `${itemId}:${index}`;
}

let injectedRepository: ScoringFormulaRepository | null = null;
let fixtureRepository: InMemoryScoringFormulaRepository | null = null;

export function useServerScoringRepository(repository: ScoringFormulaRepository | null): void { injectedRepository = repository; }
export function resetScoringRepositoryForTests(): void {
  injectedRepository = null; fixtureRepository = null;
}
export function scoringSource(): ScoringSource {
  if (injectedRepository) return 'injected';
  return LOCAL_ENVIRONMENTS.has(process.env.EXPO_PUBLIC_WANPANE_ENV?.trim().toLowerCase() ?? '')
    ? 'fixture-repository' : 'supabase';
}
export function createScoringRepository(remoteRepository?: () => ScoringFormulaRepository): ScoringFormulaRepository {
  if (injectedRepository) return injectedRepository;
  if (LOCAL_ENVIRONMENTS.has(process.env.EXPO_PUBLIC_WANPANE_ENV?.trim().toLowerCase() ?? '')) {
    return fixtureRepository ??= new InMemoryScoringFormulaRepository();
  }
  if (remoteRepository) return remoteRepository();
  throw new Error('SCORING_REPOSITORY_UNAVAILABLE');
}

export const loadScoringFormulaList = async (repository = createScoringRepository()) => {
  const access = await repository.getAccess();
  const formulas = await repository.list();
  return { access, formulas: formulas.map(value => toScoringFormulaView(value)) };
};
export const loadScoringFormulaDetail = async (id: string, repository = createScoringRepository()) => {
  const access = await repository.getAccess();
  const formula = await repository.get(id);
  const audit = await repository.auditHistory(id);
  return { access, formula: toScoringFormulaView(formula, audit) };
};

export type ScoringPermission = { canEdit: boolean; canActivate: boolean; canReview: boolean; reason: string | null };
export function scoringPermission(access: ScoringAccess | null): ScoringPermission {
  if (!access) return { canEdit: false, canActivate: false, canReview: false, reason: '산식 운영 권한을 확인하고 있어요.' };
  if (access.canMutate) return { canEdit: true, canActivate: access.canActivate, canReview: access.canReview, reason: null };
  if (access.canReview) return { canEdit: false, canActivate: false, canReview: true, reason: '검수자는 산식과 검증 결과를 확인할 수 있어요. 수정과 활성화는 관리자만 할 수 있어요.' };
  return { canEdit: false, canActivate: false, canReview: false, reason: '산식 운영 권한이 없습니다.' };
}

export const formulaMutation = (formula: ScoringFormulaView, reason: string): FormulaMutation => ({
  expectedRevision: formula.revision, reason,
});

export async function createNextFormulaVersion(repository: ScoringFormulaRepository, formula: ScoringFormulaView): Promise<ScoringFormulaView> {
  const stored = await repository.cloneVersion(formula.id, nextVersion(formula.version), '발행된 산식을 수정하기 위한 새 초안 버전');
  return toScoringFormulaView(stored, await repository.auditHistory(stored.id));
}
export async function changeFormulaStatus(repository: ScoringFormulaRepository, formula: ScoringFormulaView, next: ScoringStatus): Promise<ScoringFormulaView> {
  const statusWord: Record<ScoringStatus, string> = { DRAFT: '초안', REVIEW: '검토 중', ACTIVE: '활성', SUSPENDED: '중지' };
  const reason = `상태를 ${statusWord[next]}(으)로 바꿨어요`;
  let stored: StoredScoringFormula;
  if (next === 'REVIEW' && formula.status === 'DRAFT') stored = await repository.requestReview(formula.id, formulaMutation(formula, reason));
  else if (next === 'DRAFT' && formula.status === 'REVIEW') stored = await repository.returnToDraft(formula.id, formulaMutation(formula, reason));
  else if (next === 'ACTIVE' && formula.status === 'REVIEW') stored = await repository.activate(formula.id, formula.publishedToUsers, formulaMutation(formula, reason));
  else if (next === 'SUSPENDED' && formula.status === 'ACTIVE') stored = await repository.retire(formula.id, formulaMutation(formula, reason));
  else throw new Error('SCORING_STATUS_INVALID');
  return toScoringFormulaView(stored, await repository.auditHistory(stored.id));
}
export async function activateAndPublishFormula(repository: ScoringFormulaRepository, formula: ScoringFormulaView): Promise<ScoringFormulaView> {
  const stored = await repository.activate(formula.id, true, formulaMutation(formula, '검증을 통과한 산식을 활성화하고 사용자에게 공개'));
  return toScoringFormulaView(stored, await repository.auditHistory(stored.id));
}
export async function saveBand(repository: ScoringFormulaRepository, formula: ScoringFormulaView, componentId: string, index: number, band: ScoringBand): Promise<ScoringFormulaView> {
  const component = formula.components.find(item => item.id === componentId);
  if (!component) throw new Error('SCORING_VALIDATION_FAILED');
  const current = component.bands[index];
  const stored = current
    ? await repository.updateBand(formula.id, bandRecordId(current, componentId, index), band, index, formulaMutation(formula, `${component.label} ${index + 1}번째 구간 수정`))
    : await repository.createBand(formula.id, componentId, band, index, formulaMutation(formula, `${component.label} 구간 추가`));
  return toScoringFormulaView(stored, await repository.auditHistory(stored.id));
}
export async function deleteFormulaBand(repository: ScoringFormulaRepository, formula: ScoringFormulaView, componentId: string, index: number): Promise<ScoringFormulaView> {
  const component = formula.components.find(item => item.id === componentId);
  const current = component?.bands[index];
  if (!component || !current) throw new Error('SCORING_VALIDATION_FAILED');
  const stored = await repository.deleteBand(formula.id, bandRecordId(current, componentId, index), formulaMutation(formula, `${component.label} ${index + 1}번째 구간 삭제`));
  return toScoringFormulaView(stored, await repository.auditHistory(stored.id));
}
export async function createFormulaTestCase(repository: ScoringFormulaRepository, formula: ScoringFormulaView, testCase: ScoringTestCase): Promise<ScoringFormulaView> {
  const stored = await repository.createTestCase(formula.id, testCase, formula.testCases.length, formulaMutation(formula, `검증 예시 추가: ${testCase.label}`));
  return toScoringFormulaView(stored, await repository.auditHistory(stored.id));
}
export async function deleteFormulaTestCase(repository: ScoringFormulaRepository, formula: ScoringFormulaView, testCaseId: string): Promise<ScoringFormulaView> {
  const stored = await repository.deleteTestCase(formula.id, testCaseId, formulaMutation(formula, '검증 예시 삭제'));
  return toScoringFormulaView(stored, await repository.auditHistory(stored.id));
}

export const scoringMessage = (code: string): string => code === 'SCORING_REPOSITORY_UNAVAILABLE'
  ? '산식 운영 저장소에 연결하지 못했어요.' : scoringErrorMessage(code);
export type ScoringOutcome<T> = { ok: true; value: T } | {
  ok: false;
  code: string;
  message: string;
  conflict: ScoringRepositoryException['context'];
};
export async function runScoring<T>(action: () => Promise<T>): Promise<ScoringOutcome<T>> {
  try { return { ok: true, value: await action() }; }
  catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    return { ok: false, code, message: scoringMessage(code), conflict: error instanceof ScoringRepositoryException ? error.context : null };
  }
}
export function nextVersion(version: string): string {
  const parts = version.trim().split('.');
  if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) return `${parts[0]}.${Number(parts[1]) + 1}.0`;
  return `${version.trim() || '1.0.0'}.1`;
}

export type Editability = { canEditBands: boolean; mustCreateNewVersion: boolean; notice: string | null };
export function editabilityOf(formula: ScoringFormula, permission: ScoringPermission): Editability {
  if (!permission.canEdit) return { canEditBands: false, mustCreateNewVersion: false, notice: permission.reason };
  if (formula.status === 'ACTIVE' || formula.status === 'SUSPENDED') return {
    canEditBands: false, mustCreateNewVersion: true,
    notice: '이 버전은 이미 발행됐어요. 배점을 바꾸려면 서버에 새 초안 버전을 만들어야 해요.',
  };
  return { canEditBands: true, mustCreateNewVersion: false, notice: null };
}
export function activationBlock(formula: ScoringFormula, permission: ScoringPermission): string | null {
  if (!permission.canActivate) return permission.reason;
  if (formula.status !== 'REVIEW') return '검토 중인 산식만 활성화할 수 있어요.';
  const tests = runTestCases(formula);
  if (validateFormula(formula).length || !tests.length || tests.some(run => !run.passed)) return '통과하지 못한 검사가 있어 활성화할 수 없어요.';
  return null;
}
export type ActivationCheck = { key: string; label: string; passed: boolean; detail: string };
export function activationChecks(formula: ScoringFormula): ActivationCheck[] {
  const problems = validateFormula(formula);
  const runs = runTestCases(formula);
  const has = (pattern: RegExp) => problems.filter(problem => pattern.test(problem.message));
  const overlap = has(/겹쳐/); const gap = has(/빈틈/); const negative = has(/0 이상/);
  const basics = problems.filter(problem => !/겹쳐|빈틈|0 이상/.test(problem.message));
  return [
    { key: 'basics', label: '기본 정보', passed: basics.length === 0, detail: basics.length ? basics.map(value => value.message).join(' ') : '이름·적용 대상·근거가 모두 적혀 있어요.' },
    { key: 'overlap', label: '구간 겹침', passed: overlap.length === 0, detail: overlap.length ? overlap.map(value => value.message).join(' ') : '같은 값이 두 구간에 걸치지 않아요.' },
    { key: 'gap', label: '구간 빈틈', passed: gap.length === 0, detail: gap.length ? gap.map(value => value.message).join(' ') : '구간이 빠짐없이 이어져 있어요.' },
    { key: 'negative', label: '음수 점수', passed: negative.length === 0, detail: negative.length ? negative.map(value => value.message).join(' ') : '모든 구간 점수가 0 이상이에요.' },
    { key: 'max', label: '항목별 만점', passed: formula.components.every(item => item.bands.length > 0), detail: formula.components.map(item => `${item.label} ${Math.max(...item.bands.map(band => band.points))}점`).join(' · ') || '배점 항목이 없어요.' },
    { key: 'tests', label: '저장된 예시', passed: runs.length > 0 && runs.every(run => run.passed), detail: runs.length ? `${runs.filter(run => run.passed).length} / ${runs.length}개 통과` : '예시가 하나도 없어요.' },
  ];
}
export const statusTransitionAllowed = (current: ScoringStatus, next: ScoringStatus): boolean =>
  (current === 'DRAFT' && next === 'REVIEW')
  || (current === 'REVIEW' && next === 'DRAFT')
  || (current === 'REVIEW' && next === 'ACTIVE')
  || (current === 'ACTIVE' && next === 'SUSPENDED');
export const actorLabel = (value: StoredScoringFormula['actors']['updated']): string => value?.email ?? value?.userId ?? '기록 없음';
