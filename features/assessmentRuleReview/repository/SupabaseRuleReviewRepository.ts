import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExceptionRelationType } from '../../ruleExtraction/server/v4_1/exceptionRelations.ts';
import { buildReviewSummary, getRuleDetail, listReviewRules, type RuleListFilter } from '../server/dto.ts';
import { canActivateRuleVersion } from '../server/service.ts';
import type { ConflictResolution, CriticalBlockerCode, EvidenceReviewStatus, ExceptionReviewStatus, ReviewEvidence,
  ReviewableRuleSnapshot, RuleReviewWorkspace } from '../server/types.ts';
import type { ReviewRepositoryMutation } from './RuleReviewRepository.ts';
import { normalizeReviewDbError, type SupabaseErrorLike } from './reviewDbErrorCodes.ts';

type RpcResult = { data: unknown; error: SupabaseErrorLike | null };
export type RuleReviewRpcClient = Pick<SupabaseClient, 'rpc'> & { auth: Pick<SupabaseClient['auth'], 'getSession'> };
export type ReviewAccess = { authenticated: boolean; role: 'reviewer' | 'admin' | null; userId: string | null };

const workspaceFromRpc = (data: unknown, invalidCode = 'RULE_REVIEW_WORKSPACE_NOT_FOUND'): RuleReviewWorkspace => {
  if (!data || typeof data !== 'object') throw new Error(invalidCode);
  const value = data as Partial<RuleReviewWorkspace>;
  if (typeof value.ruleVersionId !== 'string' || typeof value.revision !== 'number' || !Array.isArray(value.rules)) {
    throw new Error(invalidCode);
  }
  return data as RuleReviewWorkspace;
};

export class SupabaseRuleReviewRepository {
  private readonly client: RuleReviewRpcClient;
  readonly ruleSetId: string;
  /**
   * Last known active state. Review mutations never change activation, so it is
   * read on load and reattached to mutation results without an extra request.
   */
  private activation: RuleReviewWorkspace['activation'];
  constructor(client: RuleReviewRpcClient, ruleSetId: string) { this.client = client; this.ruleSetId = ruleSetId; }

  /**
   * Consultation only reads an approved, active, public version. Asking the same
   * public RPC tells the console whether this version is the one in use.
   * A failure leaves the state unknown instead of blocking the review workspace.
   */
  private async readActivation(workspace: RuleReviewWorkspace): Promise<RuleReviewWorkspace['activation']> {
    try {
      const { data, error } = await this.client.rpc('read_assessment_rule_set', {
        p_announcement_id: workspace.announcement.id, p_listing_id: null,
      }) as RpcResult;
      if (error) return undefined;
      const activeId = typeof data === 'object' && data ? (data as { rule_set?: { id?: unknown } }).rule_set?.id : undefined;
      return { state: activeId === workspace.ruleVersionId ? 'ACTIVE' : 'NOT_ACTIVE' };
    } catch {
      return undefined;
    }
  }

  private withActivation(workspace: RuleReviewWorkspace): RuleReviewWorkspace {
    return this.activation ? { ...workspace, activation: this.activation } : workspace;
  }

  async access(): Promise<ReviewAccess> {
    const session = await this.client.auth.getSession();
    if (session.error || !session.data.session) return { authenticated: false, role: null, userId: null };
    const { data, error } = await this.client.rpc('get_assessment_review_access') as RpcResult;
    if (error) throw new Error(normalizeReviewDbError(error));
    const role = typeof data === 'object' && data ? (data as { role?: unknown }).role : null;
    return {
      authenticated: true,
      role: role === 'admin' || role === 'reviewer' ? role : null,
      userId: session.data.session.user.id,
    };
  }

  async snapshot(): Promise<RuleReviewWorkspace> {
    const { data, error } = await this.client.rpc('load_assessment_rule_review_workspace', { p_rule_set_id: this.ruleSetId }) as RpcResult;
    if (error) throw new Error(normalizeReviewDbError(error));
    const workspace = workspaceFromRpc(data);
    this.activation = await this.readActivation(workspace);
    return this.withActivation(workspace);
  }

  async summary() { return buildReviewSummary(await this.snapshot()); }
  async gate() { return canActivateRuleVersion(await this.snapshot()); }
  async list(filter: RuleListFilter = {}) { return listReviewRules(await this.snapshot(), filter); }
  async detail(ruleId: string) { return getRuleDetail(await this.snapshot(), ruleId); }

  private async mutate(action: string, targetId: string | null, payload: Record<string, unknown>, mutation: ReviewRepositoryMutation): Promise<RuleReviewWorkspace> {
    const { data, error } = await this.client.rpc('mutate_assessment_rule_review', {
      p_rule_set_id: this.ruleSetId, p_expected_revision: mutation.expectedRevision, p_action: action,
      p_target_id: targetId, p_payload: payload, p_reason: mutation.reason,
    }) as RpcResult;
    if (error) throw new Error(normalizeReviewDbError(error));
    // The RPC returns the workspace from the same transaction as mutation/audit/revision.
    // A second read could mix in another reviewer's later mutation.
    return this.withActivation(workspaceFromRpc(data, 'RULE_REVIEW_INVALID_MUTATION_RESULT'));
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
    if (error) throw new Error(normalizeReviewDbError(error));
    if (typeof data === 'object' && data && (data as { status?: unknown }).status === 'ACTIVE') this.activation = { state: 'ACTIVE' };
    return data;
  }
}
