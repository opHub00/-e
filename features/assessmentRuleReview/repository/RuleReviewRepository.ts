import type { ExceptionRelationType } from '../../ruleExtraction/server/v4_1/exceptionRelations.ts';
import { buildReviewSummary, getRuleDetail, listReviewRules, type ReviewSummaryDto, type RuleListFilter, type RuleListItemDto } from '../server/dto.ts';
import { RuleReviewService } from '../server/service.ts';
import type { ActivationGate, ConflictResolution, CriticalBlockerCode, EvidenceReviewStatus, ExceptionReviewStatus,
  ReviewEvidence, ReviewableRuleSnapshot, RuleReviewWorkspace, RuleReviewWorkspaceSeed } from '../server/types.ts';

export type ReviewRepositoryMutation = { expectedRevision: number; reason: string };
export type Awaitable<T> = T | Promise<T>;
export type ReviewMutationResult = void | RuleReviewWorkspace;

export interface RuleReviewRepository {
  snapshot(): RuleReviewWorkspace;
  summary(): ReviewSummaryDto;
  gate(): ActivationGate;
  list(filter?: RuleListFilter): RuleListItemDto[];
  detail(ruleId: string): ReturnType<typeof getRuleDetail>;
  startReview(mutation: ReviewRepositoryMutation): ReviewMutationResult;
  approve(ruleId: string, mutation: ReviewRepositoryMutation): ReviewMutationResult;
  approveWithEdit(ruleId: string, edited: ReviewableRuleSnapshot, resolved: CriticalBlockerCode[], mutation: ReviewRepositoryMutation): ReviewMutationResult;
  hold(ruleId: string, mutation: ReviewRepositoryMutation): ReviewMutationResult;
  reject(ruleId: string, mutation: ReviewRepositoryMutation): ReviewMutationResult;
  reviewEvidence(ruleId: string, evidenceId: string, status: EvidenceReviewStatus, mutation: ReviewRepositoryMutation, replacement?: ReviewEvidence): ReviewMutationResult;
  resolveConflict(conflictId: string, resolution: ConflictResolution, mutation: ReviewRepositoryMutation): ReviewMutationResult;
  resolveUnresolved(unresolvedId: string, resolution: string, mutation: ReviewRepositoryMutation): ReviewMutationResult;
  linkException(exceptionRuleId: string, decision: { status: Exclude<ExceptionReviewStatus, 'ORPHAN_EXCEPTION' | 'WRONG_RELATION'>; baseRuleId?: string; relationType?: ExceptionRelationType }, mutation: ReviewRepositoryMutation): ReviewMutationResult;
  bulkApproveSafe(ruleIds: string[], mutation: ReviewRepositoryMutation): ReviewMutationResult;
  invalidateDocument(hash: string, mutation: ReviewRepositoryMutation): ReviewMutationResult;
}

export type AsyncRuleReviewRepository = {
  [K in keyof RuleReviewRepository]: RuleReviewRepository[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>> : RuleReviewRepository[K]
};
export type RuleReviewRepositoryLike = RuleReviewRepository | AsyncRuleReviewRepository;

/** Test/dev adapter. Future production UI can replace it with a trusted server repository. */
export class InMemoryRuleReviewRepository implements RuleReviewRepository {
  private readonly service: RuleReviewService;
  private readonly actor: string;
  constructor(seed: RuleReviewWorkspaceSeed, actor: string) { this.service = new RuleReviewService(seed); this.actor = actor; }
  private mutation(input: ReviewRepositoryMutation) { return { ...input, actor: this.actor }; }
  snapshot() { return this.service.snapshot(); }
  summary() { return buildReviewSummary(this.snapshot()); }
  gate() { return this.service.gate(); }
  list(filter: RuleListFilter = {}) { return listReviewRules(this.snapshot(), filter); }
  detail(ruleId: string) { return getRuleDetail(this.snapshot(), ruleId); }
  startReview(mutation: ReviewRepositoryMutation) { this.service.startReview(this.mutation(mutation)); }
  approve(ruleId: string, mutation: ReviewRepositoryMutation) { this.service.approveRule(ruleId, this.mutation(mutation)); }
  approveWithEdit(ruleId: string, edited: ReviewableRuleSnapshot, resolved: CriticalBlockerCode[], mutation: ReviewRepositoryMutation) {
    this.service.approveRuleWithEdit(ruleId, edited, resolved, this.mutation(mutation));
  }
  hold(ruleId: string, mutation: ReviewRepositoryMutation) { this.service.holdRule(ruleId, this.mutation(mutation)); }
  reject(ruleId: string, mutation: ReviewRepositoryMutation) { this.service.rejectRule(ruleId, this.mutation(mutation)); }
  reviewEvidence(ruleId: string, evidenceId: string, status: EvidenceReviewStatus, mutation: ReviewRepositoryMutation, replacement?: ReviewEvidence) {
    this.service.reviewEvidence(ruleId, evidenceId, status, this.mutation(mutation), replacement ? { replacement } : {});
  }
  resolveConflict(conflictId: string, resolution: ConflictResolution, mutation: ReviewRepositoryMutation) { this.service.resolveConflict(conflictId, resolution, this.mutation(mutation)); }
  resolveUnresolved(unresolvedId: string, resolution: string, mutation: ReviewRepositoryMutation) { this.service.resolveUnresolved(unresolvedId, resolution, this.mutation(mutation)); }
  linkException(exceptionRuleId: string, decision: Parameters<RuleReviewRepository['linkException']>[1], mutation: ReviewRepositoryMutation) {
    this.service.linkException(exceptionRuleId, decision, this.mutation(mutation));
  }
  bulkApproveSafe(ruleIds: string[], mutation: ReviewRepositoryMutation) { this.service.bulkApproveSafe(ruleIds, this.mutation(mutation)); }
  invalidateDocument(hash: string, mutation: ReviewRepositoryMutation) { this.service.invalidateDocument(hash, this.snapshot().sourceStatus, this.mutation(mutation)); }
}

export const RULE_REVIEW_DEMO_SEED_KEY = 'wanpane:admin-rule-review:seed:v1';

/** Loads only explicit test/dev seed injection. No fixture module or filesystem enters the app bundle. */
export function createBrowserRuleReviewRepository(storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): RuleReviewRepository | null {
  const raw = storage?.getItem(RULE_REVIEW_DEMO_SEED_KEY);
  if (!raw) return null;
  try { return new InMemoryRuleReviewRepository(JSON.parse(raw) as RuleReviewWorkspaceSeed, 'reviewer@wanpane.local'); }
  catch { return null; }
}
