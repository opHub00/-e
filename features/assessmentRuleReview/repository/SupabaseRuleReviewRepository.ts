import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExceptionRelationType } from '../../ruleExtraction/server/v4_1/exceptionRelations.ts';
import { buildReviewSummary, getRuleDetail, listReviewRules, type RuleListFilter } from '../server/dto.ts';
import { canActivateRuleVersion } from '../server/service.ts';
import type { ConflictResolution, CriticalBlockerCode, EvidenceReviewStatus, ExceptionReviewStatus, ReviewEvidence,
  ReviewableRuleSnapshot, RuleReviewWorkspace } from '../server/types.ts';
import type { ReviewRepositoryMutation } from './RuleReviewRepository.ts';

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type RuleReviewRpcClient = Pick<SupabaseClient, 'rpc'> & { auth: Pick<SupabaseClient['auth'], 'getSession'> };
export type ReviewAccess = { authenticated: boolean; role: 'reviewer' | 'admin' | null; userId: string | null };

const errorCode = (message: string) => {
  if (/failed to fetch|network(?:error)?|load failed|fetch failed/i.test(message)) return 'RULE_REVIEW_OFFLINE';
  if (/stale review revision/i.test(message)) return 'STALE_REVIEW_REVISION';
  if (/not authorized|forbidden|permission denied/i.test(message)) return 'FORBIDDEN';
  if (/jwt|session|authenticated/i.test(message)) return 'AUTH_REQUIRED';
  if (/document revalidation/i.test(message)) return 'DOCUMENT_REVALIDATION_REQUIRED';
  return `RULE_REVIEW_DB_ERROR:${message}`;
};

export class SupabaseRuleReviewRepository {
  private readonly client: RuleReviewRpcClient;
  readonly ruleSetId: string;
  constructor(client: RuleReviewRpcClient, ruleSetId: string) { this.client = client; this.ruleSetId = ruleSetId; }

  async access(): Promise<ReviewAccess> {
    const session = await this.client.auth.getSession();
    if (session.error || !session.data.session) return { authenticated: false, role: null, userId: null };
    const { data, error } = await this.client.rpc('get_assessment_review_access') as RpcResult;
    if (error) throw new Error(errorCode(error.message));
    const role = typeof data === 'object' && data ? (data as { role?: unknown }).role : null;
    return {
      authenticated: true,
      role: role === 'admin' || role === 'reviewer' ? role : null,
      userId: session.data.session.user.id,
    };
  }

  async snapshot(): Promise<RuleReviewWorkspace> {
    const { data, error } = await this.client.rpc('load_assessment_rule_review_workspace', { p_rule_set_id: this.ruleSetId }) as RpcResult;
    if (error) throw new Error(errorCode(error.message));
    if (!data || typeof data !== 'object') throw new Error('RULE_REVIEW_WORKSPACE_NOT_FOUND');
    return data as RuleReviewWorkspace;
  }

  async summary() { return buildReviewSummary(await this.snapshot()); }
  async gate() { return canActivateRuleVersion(await this.snapshot()); }
  async list(filter: RuleListFilter = {}) { return listReviewRules(await this.snapshot(), filter); }
  async detail(ruleId: string) { return getRuleDetail(await this.snapshot(), ruleId); }

  private async mutate(action: string, targetId: string | null, payload: Record<string, unknown>, mutation: ReviewRepositoryMutation): Promise<void> {
    const { error } = await this.client.rpc('mutate_assessment_rule_review', {
      p_rule_set_id: this.ruleSetId, p_expected_revision: mutation.expectedRevision, p_action: action,
      p_target_id: targetId, p_payload: payload, p_reason: mutation.reason,
    }) as RpcResult;
    if (error) throw new Error(errorCode(error.message));
  }
  startReview(m: ReviewRepositoryMutation) { return this.mutate('START_REVIEW', this.ruleSetId, {}, m); }
  approve(id: string, m: ReviewRepositoryMutation) { return this.mutate('APPROVE_RULE', id, {}, m); }
  approveWithEdit(id: string, edited: ReviewableRuleSnapshot, resolved: CriticalBlockerCode[], m: ReviewRepositoryMutation) {
    return this.mutate('APPROVE_RULE_WITH_EDIT', id, { editedRuleSnapshot: edited, resolvedBlockers: resolved }, m);
  }
  hold(id: string, m: ReviewRepositoryMutation) { return this.mutate('HOLD_RULE', id, {}, m); }
  reject(id: string, m: ReviewRepositoryMutation) { return this.mutate('REJECT_RULE', id, {}, m); }
  reviewEvidence(ruleId: string, evidenceId: string, status: EvidenceReviewStatus, m: ReviewRepositoryMutation, replacement?: ReviewEvidence) {
    return this.mutate('REVIEW_EVIDENCE', ruleId, { evidenceId, status, replacement: replacement ?? null }, m);
  }
  resolveConflict(id: string, resolution: ConflictResolution, m: ReviewRepositoryMutation) { return this.mutate('RESOLVE_CONFLICT', id, { resolution }, m); }
  resolveUnresolved(id: string, resolution: string, m: ReviewRepositoryMutation) { return this.mutate('RESOLVE_UNRESOLVED', id, { resolution }, m); }
  linkException(id: string, decision: { status: Exclude<ExceptionReviewStatus, 'ORPHAN_EXCEPTION' | 'WRONG_RELATION'>; baseRuleId?: string; relationType?: ExceptionRelationType }, m: ReviewRepositoryMutation) {
    return this.mutate('REVIEW_EXCEPTION', id, { decision }, m);
  }
  bulkApproveSafe(ids: string[], m: ReviewRepositoryMutation) { return this.mutate('BULK_APPROVE_SAFE', this.ruleSetId, { ruleIds: ids }, m); }
  invalidateDocument(hash: string, m: ReviewRepositoryMutation) { return this.mutate('INVALIDATE_DOCUMENT', this.ruleSetId, { hash }, m); }
  async activate(expectedRevision: number, expectedActiveId: string | null) {
    const { data, error } = await this.client.rpc('activate_reviewed_assessment_rule_set', {
      p_rule_set_id: this.ruleSetId, p_expected_revision: expectedRevision, p_expected_active_id: expectedActiveId,
    }) as RpcResult;
    if (error) throw new Error(errorCode(error.message));
    return data;
  }
}
