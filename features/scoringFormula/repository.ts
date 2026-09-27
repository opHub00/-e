import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateScore, componentMax, type ScoringBand, type ScoringComponent, type ScoringFormula, type ScoringResult,
  type ScoringTarget, type ScoringTestCase } from './domain.ts';

export type PersistedScoringStatus = 'DRAFT' | 'IN_REVIEW' | 'ACTIVE' | 'RETIRED';
export type FormulaMutation = { expectedRevision: number; reason: string };
export type FormulaMetadataPatch = Partial<Pick<ScoringFormula, 'name' | 'description' | 'legalBasis' | 'interpretations'>>;
export type FormulaAuditEntry = { id: number; action: string; actorUserId: string | null; reason: string; before: unknown; after: unknown; revision: number; createdAt: string };
export type StoredScoringFormula = Omit<ScoringFormula, 'status'> & { status: PersistedScoringStatus; slug: string; target: ScoringTarget; scopeKey: string; revision: number; audit?: FormulaAuditEntry[] };
export type FormulaReviewResult = { validation: string[]; testCases: Array<{ id: string; expectedTotal: number; actualTotal: number | null; passed: boolean }> };
export type CreateFormulaDraftInput = Pick<StoredScoringFormula, 'slug' | 'version' | 'name' | 'description' | 'target' | 'scopeKey' | 'legalBasis' | 'interpretations'>
  & { applicableScope?: Record<string, unknown> };

export interface ScoringFormulaRepository {
  list(): Promise<StoredScoringFormula[]>;
  get(id: string): Promise<StoredScoringFormula>;
  createDraft(input: CreateFormulaDraftInput, reason: string): Promise<StoredScoringFormula>;
  cloneVersion(id: string, version: string, reason: string): Promise<StoredScoringFormula>;
  updateMetadata(id: string, patch: FormulaMetadataPatch, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  createItem(id: string, item: ScoringComponent, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  updateItem(id: string, item: ScoringComponent, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  deleteItem(id: string, itemId: string, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  createBand(id: string, itemId: string, band: ScoringBand, order: number, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  updateBand(id: string, bandId: string, band: ScoringBand, order: number, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  deleteBand(id: string, bandId: string, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  createTestCase(id: string, value: ScoringTestCase, order: number, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  updateTestCase(id: string, value: ScoringTestCase, order: number, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  deleteTestCase(id: string, testCaseId: string, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  requestReview(id: string, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  review(id: string): Promise<FormulaReviewResult>;
  activate(id: string, publishToUsers: boolean, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  retire(id: string, mutation: FormulaMutation): Promise<StoredScoringFormula>;
  auditHistory(id: string): Promise<FormulaAuditEntry[]>;
  getActiveFormula(target: ScoringTarget): Promise<StoredScoringFormula | null>;
  evaluateActiveFormula(target: ScoringTarget, input: Record<string, number | null>): Promise<ScoringResult | null>;
}

export type ScoringRepositoryError =
  | 'SCORING_VERSION_IMMUTABLE' | 'SCORING_SCOPE_ALREADY_ACTIVE' | 'SCORING_FORMULA_NOT_FOUND'
  | 'SCORING_STALE_REVISION' | 'SCORING_VALIDATION_FAILED' | 'SCORING_TEST_CASE_FAILED'
  | 'SCORING_STATUS_INVALID' | 'AUTH_REQUIRED' | 'FORBIDDEN';

export const SCORING_ERROR_MESSAGE: Record<ScoringRepositoryError, string> = {
  SCORING_VERSION_IMMUTABLE: '활성화되었거나 종료된 버전은 고칠 수 없어요. 새 버전을 만들어 주세요.',
  SCORING_SCOPE_ALREADY_ACTIVE: '같은 적용 범위에 이미 활성 산식이 있어요.',
  SCORING_FORMULA_NOT_FOUND: '산식을 찾지 못했어요.',
  SCORING_STALE_REVISION: '다른 관리자가 먼저 변경했어요. 최신 버전을 다시 불러와 주세요.',
  SCORING_VALIDATION_FAILED: '구간·만점·필수 값 검증을 통과하지 못했어요.',
  SCORING_TEST_CASE_FAILED: '저장된 검증 예시가 기대 점수와 달라요.',
  SCORING_STATUS_INVALID: '현재 상태에서 그 작업을 할 수 없어요.',
  AUTH_REQUIRED: '관리자 계정으로 로그인해 주세요.',
  FORBIDDEN: '이 작업은 관리자만 할 수 있어요.',
};
export const scoringErrorMessage = (code: string): string => SCORING_ERROR_MESSAGE[code as ScoringRepositoryError] ?? `처리하지 못했어요 (${code}).`;

export const SCORING_RPC = {
  list: 'list_scoring_formulas', detail: 'get_scoring_formula_detail', createDraft: 'create_scoring_formula_draft',
  cloneVersion: 'clone_scoring_formula_version', mutate: 'mutate_scoring_formula_draft', requestReview: 'request_scoring_formula_review',
  review: 'review_scoring_formula',
  activate: 'activate_scoring_formula', retire: 'retire_scoring_formula', audit: 'get_scoring_formula_audit',
  getActive: 'get_active_scoring_formula', evaluateActive: 'evaluate_active_scoring_formula',
} as const;

type RpcClient = Pick<SupabaseClient, 'rpc'>;
const result = <T>(data: unknown, error: { message?: string; details?: string } | null): T => {
  if (error) {
    const text = `${error.message ?? ''} ${error.details ?? ''}`;
    const known = Object.keys(SCORING_ERROR_MESSAGE).find(code => new RegExp(`(?:^|\\W)${code}(?:$|\\W)`).test(text));
    throw new Error(known ?? `SCORING_DB_ERROR:${error.message ?? 'UNKNOWN'}`);
  }
  return data as T;
};

export class SupabaseScoringFormulaRepository implements ScoringFormulaRepository {
  private readonly client: RpcClient;
  constructor(client: RpcClient) { this.client = client; }
  private async call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    return result<T>(data, error);
  }
  list() { return this.call<StoredScoringFormula[]>(SCORING_RPC.list); }
  get(id: string) { return this.call<StoredScoringFormula>(SCORING_RPC.detail, { p_formula_id: id }); }
  createDraft(input: CreateFormulaDraftInput, reason: string) { return this.call<StoredScoringFormula>(SCORING_RPC.createDraft, { p_input: input, p_reason: reason }); }
  cloneVersion(id: string, version: string, reason: string) { return this.call<StoredScoringFormula>(SCORING_RPC.cloneVersion, { p_formula_id: id, p_version: version, p_reason: reason }); }
  private mutate(id: string, action: string, payload: unknown, m: FormulaMutation) { return this.call<StoredScoringFormula>(SCORING_RPC.mutate, { p_formula_id: id, p_expected_revision: m.expectedRevision, p_action: action, p_payload: payload, p_reason: m.reason }); }
  updateMetadata(id: string, patch: FormulaMetadataPatch, m: FormulaMutation) { return this.mutate(id, 'UPDATE_METADATA', patch, m); }
  createItem(id: string, item: ScoringComponent, m: FormulaMutation) { return this.mutate(id, 'CREATE_ITEM', { ...item, declaredMaxScore: componentMax(item) }, m); }
  updateItem(id: string, item: ScoringComponent, m: FormulaMutation) { return this.mutate(id, 'UPDATE_ITEM', { ...item, declaredMaxScore: componentMax(item) }, m); }
  deleteItem(id: string, itemId: string, m: FormulaMutation) { return this.mutate(id, 'DELETE_ITEM', { itemId }, m); }
  createBand(id: string, itemId: string, band: ScoringBand, order: number, m: FormulaMutation) { return this.mutate(id, 'CREATE_BAND', { itemId, band, order }, m); }
  updateBand(id: string, bandId: string, band: ScoringBand, order: number, m: FormulaMutation) { return this.mutate(id, 'UPDATE_BAND', { bandId, band, order }, m); }
  deleteBand(id: string, bandId: string, m: FormulaMutation) { return this.mutate(id, 'DELETE_BAND', { bandId }, m); }
  createTestCase(id: string, testCase: ScoringTestCase, order: number, m: FormulaMutation) { return this.mutate(id, 'CREATE_TEST_CASE', { testCase, order }, m); }
  updateTestCase(id: string, testCase: ScoringTestCase, order: number, m: FormulaMutation) { return this.mutate(id, 'UPDATE_TEST_CASE', { testCase, order }, m); }
  deleteTestCase(id: string, testCaseId: string, m: FormulaMutation) { return this.mutate(id, 'DELETE_TEST_CASE', { testCaseId }, m); }
  requestReview(id: string, m: FormulaMutation) { return this.call<StoredScoringFormula>(SCORING_RPC.requestReview, { p_formula_id: id, p_expected_revision: m.expectedRevision, p_reason: m.reason }); }
  review(id: string) { return this.call<FormulaReviewResult>(SCORING_RPC.review, { p_formula_id: id }); }
  activate(id: string, publishToUsers: boolean, m: FormulaMutation) { return this.call<StoredScoringFormula>(SCORING_RPC.activate, { p_formula_id: id, p_expected_revision: m.expectedRevision, p_publish_to_users: publishToUsers, p_reason: m.reason }); }
  retire(id: string, m: FormulaMutation) { return this.call<StoredScoringFormula>(SCORING_RPC.retire, { p_formula_id: id, p_expected_revision: m.expectedRevision, p_reason: m.reason }); }
  auditHistory(id: string) { return this.call<FormulaAuditEntry[]>(SCORING_RPC.audit, { p_formula_id: id }); }
  getActiveFormula(target: ScoringTarget) { return this.call<StoredScoringFormula | null>(SCORING_RPC.getActive, { p_target: target }); }
  evaluateActiveFormula(target: ScoringTarget, input: Record<string, number | null>) { return this.call<ScoringResult | null>(SCORING_RPC.evaluateActive, { p_target: target, p_inputs: input }); }
}

export async function evaluateActiveFormula(repository: Pick<ScoringFormulaRepository, 'getActiveFormula'>, target: ScoringTarget, input: Record<string, number | null>): Promise<ScoringResult | null> {
  const formula = await repository.getActiveFormula(target);
  if (!formula) return null;
  const compatible: ScoringFormula = { ...formula, status: formula.status === 'IN_REVIEW' ? 'REVIEW' : formula.status === 'RETIRED' ? 'SUSPENDED' : formula.status };
  return calculateScore(compatible, input);
}
