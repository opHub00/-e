import { EXCEPTION_RELATION_TYPES, type ExceptionRelationType } from '../../ruleExtraction/server/v4_1/exceptionRelations.ts';
import { canonicalSerialize, hashCanonical, PORTABLE_CANDIDATE_HASHER, type CandidateHasher } from '../domain/hashing.ts';
import type { ActivationBlocker, ActivationGate, ConflictResolution, CriticalBlockerCode, EvidenceReviewStatus, ExceptionReviewStatus,
  ReviewAuditEntry, ReviewEvidence, ReviewMutation, ReviewableRuleSnapshot, RuleEditDiff, RuleReviewRecord, RuleReviewWorkspace, RuleReviewWorkspaceSeed } from './types.ts';

const clone = <T>(value: T): T => structuredClone(value);
const auditView = (workspace: RuleReviewWorkspace) => { const { auditLog: _auditLog, ...rest } = workspace; return clone(rest); };
const stable = canonicalSerialize;
export const hashReviewCandidate = (value: ReviewableRuleSnapshot, hasher: CandidateHasher = PORTABLE_CANDIDATE_HASHER) => hashCanonical(value, hasher);
const now = (mutation: ReviewMutation) => mutation.at ?? new Date().toISOString();
const assertText = (value: string, name: string) => { if (!value.trim()) throw new Error(`${name}_REQUIRED`); };
const blockingSafety = (rule: RuleReviewRecord) => rule.safetyBlockers.filter(code => !rule.resolvedBlockerCodes.includes(code));
const effectiveRule = (rule: RuleReviewRecord) => rule.editedRuleSnapshot ?? rule.originalCandidate;
const categoryKey = (supplyType: string, category: string) => `${supplyType}:${category}`;

function diff(before: unknown, after: unknown, path = ''): RuleEditDiff[] {
  if (stable(before) === stable(after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return [{ path: path || '$', before: clone(before), after: clone(after) }];
  const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap(key => diff(a[key], b[key], path ? `${path}.${key}` : key));
}

export function createRuleReviewWorkspace(seed: RuleReviewWorkspaceSeed, hasher: CandidateHasher = PORTABLE_CANDIDATE_HASHER): RuleReviewWorkspace {
  if (!/^[a-f0-9]{64}$/.test(seed.document.sha256)) throw new Error('INVALID_DOCUMENT_HASH');
  if (!seed.rules.length) throw new Error('RULES_REQUIRED');
  const ids = new Set<string>();
  const rules = seed.rules.map(rule => {
    if (ids.has(rule.ruleId) || rule.ruleVersionId !== seed.ruleVersionId) throw new Error('INVALID_RULE_IDENTITY');
    ids.add(rule.ruleId);
    const originalCandidate = clone(rule.originalCandidate);
    return { ...clone(rule), originalCandidate, reviewStatus: 'PENDING_REVIEW' as const, reviewerId: null, reviewedAt: null, reviewNote: null,
      decisionReason: null, originalCandidateHash: hashReviewCandidate(originalCandidate, hasher), editedRuleSnapshot: null, editDiff: [], resolvedBlockerCodes: [],
      evidenceReviews: originalCandidate.evidence.map(evidence => ({ evidenceId: evidence.id, status: 'NEEDS_REVIEW' as const, reviewerId: null, reviewedAt: null, note: null, replacement: null })) };
  });
  const exceptionReviews = rules.filter(rule => rule.originalCandidate.category === 'EXCEPTION').map(rule => {
    const relation = seed.initialExceptionRelations?.find(item => item.exceptionRuleId === rule.ruleId);
    return { exceptionRuleId: rule.ruleId, baseRuleId: relation?.baseRuleId ?? null, relationType: relation?.type ?? null,
      status: relation ? 'LINKED' as const : 'ORPHAN_EXCEPTION' as const, reason: null };
  });
  return { ruleVersionId: seed.ruleVersionId, announcement: clone(seed.announcement), document: clone(seed.document), sourceStatus: seed.sourceStatus, version: seed.version,
    lifecycleStatus: 'PENDING_REVIEW', revision: 0, reviewedDocumentHash: seed.document.sha256, currentDocumentHash: seed.document.sha256, rules,
    conflicts: seed.conflicts.map(item => ({ ...clone(item), resolution: null, reviewedBy: null, reviewedAt: null })),
    unresolvedItems: seed.unresolvedItems.map(item => ({ ...clone(item), resolution: null, reviewedBy: null, reviewedAt: null })),
    exceptionReviews, requiredCategories: clone(seed.requiredCategories), auditLog: [] };
}

function audit(workspace: RuleReviewWorkspace, mutation: ReviewMutation, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
  const entry: ReviewAuditEntry = { sequence: workspace.auditLog.length + 1, actor: mutation.actor, at: now(mutation), action, targetType, targetId,
    before: clone(before), after: clone(after), reason: mutation.reason };
  workspace.auditLog.push(entry);
}

function evidenceIsValid(rule: RuleReviewRecord) { return rule.evidenceReviews.some(item => item.status === 'VALID' || item.status === 'REPLACED'); }
function findRule(workspace: RuleReviewWorkspace, ruleId: string) { const rule = workspace.rules.find(item => item.ruleId === ruleId); if (!rule) throw new Error('RULE_NOT_FOUND'); return rule; }

export function canActivateRuleVersion(workspace: RuleReviewWorkspace): ActivationGate {
  const blockers: ActivationBlocker[] = [];
  const add = (blocker: ActivationBlocker) => { if (!blockers.some(item => stable(item) === stable(blocker))) blockers.push(blocker); };
  if (workspace.lifecycleStatus === 'PENDING_REVIEW') add({ code: 'REVIEW_NOT_STARTED', message: '검수가 시작되지 않았습니다.' });
  if (workspace.currentDocumentHash !== workspace.reviewedDocumentHash || workspace.lifecycleStatus === 'REVALIDATION_REQUIRED') add({ code: 'DOCUMENT_REVALIDATION_REQUIRED', message: '문서 hash가 변경되어 새 rule version 검수가 필요합니다.' });
  for (const unresolved of workspace.unresolvedItems.filter(item => item.resolution === null)) add({ code: 'UNRESOLVED', unresolvedId: unresolved.unresolvedId, message: unresolved.description });
  for (const conflict of workspace.conflicts) {
    if (!conflict.resolution || conflict.resolution.type === 'HELD') add({ code: 'CONFLICT', conflictId: conflict.conflictId, message: `${conflict.concept} 충돌이 해결되지 않았습니다.` });
  }
  for (const exception of workspace.exceptionReviews) {
    if (exception.status === 'ORPHAN_EXCEPTION') add({ code: 'ORPHAN_EXCEPTION', ruleId: exception.exceptionRuleId, message: '예외가 base rule에 연결되지 않았습니다.' });
    if (exception.status === 'WRONG_RELATION') add({ code: 'ORPHAN_EXCEPTION', ruleId: exception.exceptionRuleId, message: '예외 관계 유형 또는 대상이 올바르지 않습니다.' });
    if (exception.status === 'HELD') add({ code: 'HELD_RULE', ruleId: exception.exceptionRuleId, message: '예외 관계가 보류 중입니다.' });
  }
  for (const rule of workspace.rules) {
    for (const code of blockingSafety(rule)) add({ code, ruleId: rule.ruleId, message: `${effectiveRule(rule).label}: ${code}` });
    if (rule.reviewStatus === 'HELD') add({ code: 'HELD_RULE', ruleId: rule.ruleId, message: `${effectiveRule(rule).label} 검수가 보류되었습니다.` });
    if (rule.reviewStatus === 'PENDING_REVIEW' || rule.reviewStatus === 'IN_REVIEW') add({ code: rule.critical ? 'PENDING_CRITICAL_REVIEW' : 'NON_CRITICAL_REVIEW_INCOMPLETE', ruleId: rule.ruleId, message: `${effectiveRule(rule).label} 검수가 완료되지 않았습니다.` });
    if (rule.critical && rule.reviewStatus === 'REJECTED') add({ code: 'REJECTED_CRITICAL_RULE', ruleId: rule.ruleId, message: `${effectiveRule(rule).label} critical rule이 거절되었습니다.` });
    if (rule.critical && ['APPROVED', 'APPROVED_WITH_EDIT'].includes(rule.reviewStatus) && !evidenceIsValid(rule)) add({ code: 'EVIDENCE_NOT_VALID', ruleId: rule.ruleId, message: `${effectiveRule(rule).label}에 유효한 근거가 없습니다.` });
  }
  const approvedCategories = new Set(workspace.rules.filter(rule => rule.required && ['APPROVED', 'APPROVED_WITH_EDIT'].includes(rule.reviewStatus)).map(rule => categoryKey(effectiveRule(rule).supplyType, effectiveRule(rule).category)));
  const missingRequiredCategories = workspace.requiredCategories.map(item => categoryKey(item.supplyType, item.category)).filter(key => !approvedCategories.has(key));
  for (const key of missingRequiredCategories) add({ code: 'MISSING_CRITICAL_RULE', message: `${key} 필수 category가 승인되지 않았습니다.` });
  return { canActivate: blockers.length === 0, status: workspace.lifecycleStatus === 'REVALIDATION_REQUIRED' ? 'REVALIDATION_REQUIRED' : blockers.length ? 'BLOCKED' : 'ACTIVATION_ELIGIBLE', blockers,
    unresolvedCount: workspace.unresolvedItems.filter(item => item.resolution === null).length,
    conflictsCount: workspace.conflicts.filter(item => !item.resolution || item.resolution.type === 'HELD').length,
    heldCount: workspace.rules.filter(rule => rule.reviewStatus === 'HELD').length + workspace.exceptionReviews.filter(item => item.status === 'HELD').length,
    rejectedCriticalCount: workspace.rules.filter(rule => rule.critical && rule.reviewStatus === 'REJECTED').length,
    pendingCriticalCount: workspace.rules.filter(rule => rule.critical && ['PENDING_REVIEW', 'IN_REVIEW'].includes(rule.reviewStatus)).length,
    missingRequiredCategories };
}

export class RuleReviewService {
  #workspace: RuleReviewWorkspace;
  constructor(seed: RuleReviewWorkspaceSeed, hasher: CandidateHasher = PORTABLE_CANDIDATE_HASHER) { this.#workspace = createRuleReviewWorkspace(seed, hasher); }
  snapshot() { return clone(this.#workspace); }
  gate() { return canActivateRuleVersion(this.#workspace); }
  #mutate<T>(mutation: ReviewMutation, action: string, targetType: string, targetId: string, operation: () => T): T {
    if (mutation.expectedRevision !== this.#workspace.revision) throw new Error('STALE_REVIEW_REVISION');
    assertText(mutation.actor, 'ACTOR'); assertText(mutation.reason, 'REASON');
    if (action === 'START_REVIEW' && this.#workspace.lifecycleStatus !== 'PENDING_REVIEW') throw new Error('REVIEW_ALREADY_STARTED');
    if (!['START_REVIEW', 'DOCUMENT_INVALIDATED'].includes(action) && this.#workspace.lifecycleStatus !== 'IN_REVIEW') throw new Error('REVIEW_NOT_IN_PROGRESS');
    if (this.#workspace.currentDocumentHash !== this.#workspace.reviewedDocumentHash && action !== 'DOCUMENT_INVALIDATED') throw new Error('DOCUMENT_REVALIDATION_REQUIRED');
    const rollback = clone(this.#workspace), before = auditView(this.#workspace);
    try { const result = operation(); this.#workspace.revision++;
      audit(this.#workspace, mutation, action, targetType, targetId, before, auditView(this.#workspace)); return result;
    } catch (error) { this.#workspace = rollback; throw error; }
  }
  startReview(mutation: ReviewMutation) { return this.#mutate(mutation, 'START_REVIEW', 'RULE_VERSION', this.#workspace.ruleVersionId, () => { this.#workspace.lifecycleStatus = 'IN_REVIEW'; return this.snapshot(); }); }
  reviewEvidence(ruleId: string, evidenceId: string, status: EvidenceReviewStatus, mutation: ReviewMutation, options: { note?: string; replacement?: ReviewEvidence } = {}) {
    return this.#mutate(mutation, 'REVIEW_EVIDENCE', 'EVIDENCE', evidenceId, () => {
      const rule = findRule(this.#workspace, ruleId), item = rule.evidenceReviews.find(review => review.evidenceId === evidenceId); if (!item) throw new Error('EVIDENCE_NOT_FOUND');
      if (status === 'REPLACED' && (!options.replacement || options.replacement.documentId !== this.#workspace.document.id)) throw new Error('VALID_REPLACEMENT_EVIDENCE_REQUIRED');
      item.status = status; item.reviewerId = mutation.actor; item.reviewedAt = now(mutation); item.note = options.note ?? null; item.replacement = status === 'REPLACED' ? clone(options.replacement!) : null;
      return clone(item);
    });
  }
  approveRule(ruleId: string, mutation: ReviewMutation, note: string | null = null) {
    return this.#mutate(mutation, 'APPROVE_RULE', 'RULE', ruleId, () => {
      const rule = findRule(this.#workspace, ruleId); if (blockingSafety(rule).length) throw new Error('RULE_HAS_SAFETY_BLOCKERS');
      if (rule.critical && !evidenceIsValid(rule)) throw new Error('CRITICAL_RULE_REQUIRES_VALID_EVIDENCE');
      Object.assign(rule, { reviewStatus: 'APPROVED' as const, reviewerId: mutation.actor, reviewedAt: now(mutation), reviewNote: note, decisionReason: mutation.reason, editedRuleSnapshot: null, editDiff: [] });
      return clone(rule);
    });
  }
  approveRuleWithEdit(ruleId: string, edited: ReviewableRuleSnapshot, resolvedBlockerCodes: CriticalBlockerCode[], mutation: ReviewMutation, note: string | null = null) {
    return this.#mutate(mutation, 'APPROVE_RULE_WITH_EDIT', 'RULE', ruleId, () => {
      const rule = findRule(this.#workspace, ruleId), changes = diff(rule.originalCandidate, edited);
      if (!changes.length) throw new Error('EDIT_REQUIRED');
      if (edited.ruleKey !== rule.originalCandidate.ruleKey || edited.evidence.some(item => item.documentId !== this.#workspace.document.id)) throw new Error('EDIT_IDENTITY_OR_DOCUMENT_MISMATCH');
      const unknown = resolvedBlockerCodes.filter(code => !rule.safetyBlockers.includes(code)); if (unknown.length) throw new Error('UNKNOWN_RESOLVED_BLOCKER');
      const remaining = rule.safetyBlockers.filter(code => !resolvedBlockerCodes.includes(code)); if (remaining.length) throw new Error(`UNRESOLVED_SAFETY_BLOCKERS:${remaining.join(',')}`);
      if (rule.critical && !evidenceIsValid(rule)) throw new Error('CRITICAL_RULE_REQUIRES_VALID_EVIDENCE');
      Object.assign(rule, { reviewStatus: 'APPROVED_WITH_EDIT' as const, reviewerId: mutation.actor, reviewedAt: now(mutation), reviewNote: note,
        decisionReason: mutation.reason, editedRuleSnapshot: clone(edited), editDiff: changes, resolvedBlockerCodes: [...new Set(resolvedBlockerCodes)] });
      return clone(rule);
    });
  }
  holdRule(ruleId: string, mutation: ReviewMutation, note: string | null = null) { return this.#decide(ruleId, 'HELD', mutation, note); }
  rejectRule(ruleId: string, mutation: ReviewMutation, note: string | null = null) { return this.#decide(ruleId, 'REJECTED', mutation, note); }
  #decide(ruleId: string, status: 'HELD' | 'REJECTED', mutation: ReviewMutation, note: string | null) {
    return this.#mutate(mutation, status === 'HELD' ? 'HOLD_RULE' : 'REJECT_RULE', 'RULE', ruleId, () => { const rule = findRule(this.#workspace, ruleId);
      Object.assign(rule, { reviewStatus: status, reviewerId: mutation.actor, reviewedAt: now(mutation), reviewNote: note, decisionReason: mutation.reason }); return clone(rule); });
  }
  resolveConflict(conflictId: string, resolution: ConflictResolution, mutation: ReviewMutation) {
    return this.#mutate(mutation, 'RESOLVE_CONFLICT', 'CONFLICT', conflictId, () => { const conflict = this.#workspace.conflicts.find(item => item.conflictId === conflictId); if (!conflict) throw new Error('CONFLICT_NOT_FOUND');
      if (resolution.type === 'CANDIDATE' && !conflict.candidates.some(item => item.candidateId === resolution.candidateId)) throw new Error('CONFLICT_CANDIDATE_NOT_FOUND');
      const knownEvidenceIds = new Set([...this.#workspace.rules.flatMap(rule => rule.originalCandidate.evidence.map(e => e.id)), ...conflict.candidates.flatMap(candidate => candidate.evidenceIds)]);
      if (resolution.type === 'CUSTOM' && (!resolution.evidenceIds.length || resolution.evidenceIds.some(id => !knownEvidenceIds.has(id)))) throw new Error('CUSTOM_RESOLUTION_REQUIRES_VALID_EVIDENCE');
      assertText(resolution.reason, 'RESOLUTION_REASON'); conflict.resolution = clone(resolution); conflict.reviewedBy = mutation.actor; conflict.reviewedAt = now(mutation); return clone(conflict); });
  }
  resolveUnresolved(unresolvedId: string, resolution: string, mutation: ReviewMutation) {
    return this.#mutate(mutation, 'RESOLVE_UNRESOLVED', 'UNRESOLVED', unresolvedId, () => { const item = this.#workspace.unresolvedItems.find(value => value.unresolvedId === unresolvedId); if (!item) throw new Error('UNRESOLVED_NOT_FOUND'); assertText(resolution, 'RESOLUTION'); item.resolution = resolution; item.reviewedBy = mutation.actor; item.reviewedAt = now(mutation); return clone(item); });
  }
  linkException(exceptionRuleId: string, decision: { status: Exclude<ExceptionReviewStatus, 'ORPHAN_EXCEPTION' | 'WRONG_RELATION'>; baseRuleId?: string; relationType?: ExceptionRelationType }, mutation: ReviewMutation) {
    return this.#mutate(mutation, 'REVIEW_EXCEPTION', 'EXCEPTION', exceptionRuleId, () => { const item = this.#workspace.exceptionReviews.find(value => value.exceptionRuleId === exceptionRuleId); if (!item) throw new Error('EXCEPTION_NOT_FOUND');
      if (decision.status === 'LINKED') { if (!decision.baseRuleId || !findRule(this.#workspace, decision.baseRuleId) || !decision.relationType || !EXCEPTION_RELATION_TYPES.includes(decision.relationType)) throw new Error('VALID_EXCEPTION_RELATION_REQUIRED'); item.baseRuleId = decision.baseRuleId; item.relationType = decision.relationType; }
      else { item.baseRuleId = null; item.relationType = null; }
      item.status = decision.status; item.reason = mutation.reason;
      if (decision.status === 'EXCLUDED') { const rule = findRule(this.#workspace, exceptionRuleId); rule.reviewStatus = 'REJECTED'; rule.reviewerId = mutation.actor; rule.reviewedAt = now(mutation); rule.decisionReason = mutation.reason; }
      return clone(item); });
  }
  bulkApproveSafe(ruleIds: string[], mutation: ReviewMutation) {
    return this.#mutate(mutation, 'BULK_APPROVE_SAFE', 'RULE_VERSION', this.#workspace.ruleVersionId, () => {
      if (!ruleIds.length) throw new Error('BULK_RULES_REQUIRED'); const selected = ruleIds.map(id => findRule(this.#workspace, id));
      if (selected.some(rule => rule.critical || rule.required || rule.candidateStatus !== 'AUTO_SAFE_CANDIDATE' || rule.safetyBlockers.length || rule.originalCandidate.category === 'EXCEPTION' || !evidenceIsValid(rule) || this.#workspace.conflicts.some(conflict => conflict.candidateRuleIds.includes(rule.ruleId)) || this.#workspace.unresolvedItems.some(item => item.ruleIds.includes(rule.ruleId) && item.resolution === null))) throw new Error('BULK_APPROVAL_UNSAFE');
      for (const rule of selected) Object.assign(rule, { reviewStatus: 'APPROVED' as const, reviewerId: mutation.actor, reviewedAt: now(mutation), decisionReason: mutation.reason }); return selected.map(clone);
    });
  }
  invalidateDocument(newHash: string, newSourceStatus: RuleReviewWorkspace['sourceStatus'], mutation: ReviewMutation) {
    if (!/^[a-f0-9]{64}$/.test(newHash) || newHash === this.#workspace.currentDocumentHash) throw new Error('NEW_DOCUMENT_HASH_REQUIRED');
    return this.#mutate(mutation, 'DOCUMENT_INVALIDATED', 'DOCUMENT', this.#workspace.document.id, () => { this.#workspace.currentDocumentHash = newHash; this.#workspace.sourceStatus = newSourceStatus; this.#workspace.lifecycleStatus = 'REVALIDATION_REQUIRED'; return this.snapshot(); });
  }
  completeReview(mutation: ReviewMutation) { return this.#mutate(mutation, 'COMPLETE_REVIEW', 'RULE_VERSION', this.#workspace.ruleVersionId, () => clone(canActivateRuleVersion(this.#workspace))); }
}
