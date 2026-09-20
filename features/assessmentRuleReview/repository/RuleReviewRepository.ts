import type { ExceptionRelationType } from '../../ruleExtraction/server/v4_1/exceptionRelations.ts';
import { buildReviewSummary, getRuleDetail, listReviewRules, type ReviewSummaryDto, type RuleListFilter, type RuleListItemDto } from '../server/dto.ts';
import { RuleReviewService } from '../server/service.ts';
import type { ActivationGate, ConflictResolution, CriticalBlockerCode, EvidenceReviewStatus, ExceptionReviewStatus,
  ReviewableRuleSnapshot, RuleReviewWorkspace, RuleReviewWorkspaceSeed } from '../server/types.ts';

export interface RuleReviewRepository {
  snapshot(): RuleReviewWorkspace;
  summary(): ReviewSummaryDto;
  gate(): ActivationGate;
  list(filter?: RuleListFilter): RuleListItemDto[];
  detail(ruleId: string): ReturnType<typeof getRuleDetail>;
  startReview(reason: string): void;
  approve(ruleId: string, reason: string): void;
  approveWithEdit(ruleId: string, edited: ReviewableRuleSnapshot, resolved: CriticalBlockerCode[], reason: string): void;
  hold(ruleId: string, reason: string): void;
  reject(ruleId: string, reason: string): void;
  reviewEvidence(ruleId: string, evidenceId: string, status: EvidenceReviewStatus, reason: string): void;
  resolveConflict(conflictId: string, resolution: ConflictResolution, reason: string): void;
  resolveUnresolved(unresolvedId: string, resolution: string, reason: string): void;
  linkException(exceptionRuleId: string, decision: { status: Exclude<ExceptionReviewStatus, 'ORPHAN_EXCEPTION' | 'WRONG_RELATION'>; baseRuleId?: string; relationType?: ExceptionRelationType }, reason: string): void;
  bulkApproveSafe(ruleIds: string[], reason: string): void;
  invalidateDocument(hash: string, reason: string): void;
}

/** Test/dev adapter. Future production UI can replace it with a trusted server repository. */
export class InMemoryRuleReviewRepository implements RuleReviewRepository {
  private readonly service: RuleReviewService;
  private readonly actor: string;
  constructor(seed: RuleReviewWorkspaceSeed, actor: string) { this.service = new RuleReviewService(seed); this.actor = actor; }
  private mutation(reason: string) { return { expectedRevision: this.service.snapshot().revision, actor: this.actor, reason }; }
  snapshot() { return this.service.snapshot(); }
  summary() { return buildReviewSummary(this.snapshot()); }
  gate() { return this.service.gate(); }
  list(filter: RuleListFilter = {}) { return listReviewRules(this.snapshot(), filter); }
  detail(ruleId: string) { return getRuleDetail(this.snapshot(), ruleId); }
  startReview(reason: string) { this.service.startReview(this.mutation(reason)); }
  approve(ruleId: string, reason: string) { this.service.approveRule(ruleId, this.mutation(reason)); }
  approveWithEdit(ruleId: string, edited: ReviewableRuleSnapshot, resolved: CriticalBlockerCode[], reason: string) {
    this.service.approveRuleWithEdit(ruleId, edited, resolved, this.mutation(reason));
  }
  hold(ruleId: string, reason: string) { this.service.holdRule(ruleId, this.mutation(reason)); }
  reject(ruleId: string, reason: string) { this.service.rejectRule(ruleId, this.mutation(reason)); }
  reviewEvidence(ruleId: string, evidenceId: string, status: EvidenceReviewStatus, reason: string) {
    this.service.reviewEvidence(ruleId, evidenceId, status, this.mutation(reason));
  }
  resolveConflict(conflictId: string, resolution: ConflictResolution, reason: string) { this.service.resolveConflict(conflictId, resolution, this.mutation(reason)); }
  resolveUnresolved(unresolvedId: string, resolution: string, reason: string) { this.service.resolveUnresolved(unresolvedId, resolution, this.mutation(reason)); }
  linkException(exceptionRuleId: string, decision: Parameters<RuleReviewRepository['linkException']>[1], reason: string) {
    this.service.linkException(exceptionRuleId, decision, this.mutation(reason));
  }
  bulkApproveSafe(ruleIds: string[], reason: string) { this.service.bulkApproveSafe(ruleIds, this.mutation(reason)); }
  invalidateDocument(hash: string, reason: string) { this.service.invalidateDocument(hash, this.snapshot().sourceStatus, this.mutation(reason)); }
}

export const RULE_REVIEW_DEMO_SEED_KEY = 'wanpane:admin-rule-review:seed:v1';

/** Loads only explicit test/dev seed injection. No fixture module or filesystem enters the app bundle. */
export function createBrowserRuleReviewRepository(storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): RuleReviewRepository | null {
  const raw = storage?.getItem(RULE_REVIEW_DEMO_SEED_KEY);
  if (!raw) return null;
  try { return new InMemoryRuleReviewRepository(JSON.parse(raw) as RuleReviewWorkspaceSeed, 'reviewer@wanpane.local'); }
  catch { return null; }
}
