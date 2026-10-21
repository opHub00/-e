import type { JejuV2CandidateView } from '../../adminConsole/reviewCandidateContract.ts';

/** Local contract only. No public registry, Staging write, or approval transition. */
export type CandidateActor = { id: string; role: 'reviewer' | 'admin' };
export type WarningDecision = 'ACCEPTED_AS_SAFE' | 'REQUIRES_CHANGE' | 'RESOLVED_WITH_SOURCE' |
  'RESOLVED_WITH_SCOPE_DECISION' | 'REJECTED';
export type BlockerDecision = 'RESOLVED_WITH_SOURCE' | 'RESOLVED_WITH_SCOPE_DECISION' | 'REJECT_RULE' | 'KEEP_BLOCKED';
export type MissingCellDecision = 'KEEP_NULL' | 'REQUIRES_EXTERNAL_POLICY_SOURCE' | 'REJECT_DEFAULT_VALUE';
export type CandidateAction =
  | { type: 'MOVE_TO_IN_REVIEW' }
  | { type: 'ADD_REVIEW_NOTE'; target: 'RULE' | 'WARNING' | 'BLOCKER' | 'PARAMETER'; targetId: string; note: string }
  | { type: 'MARK_RULE_REVIEWED'; ruleId: string; note: string }
  | { type: 'RESOLVE_WARNING'; warningId: string; decision: WarningDecision; note: string; provenance?: DecisionProvenance }
  | { type: 'RESOLVE_BLOCKER'; blockerId: string; decision: BlockerDecision; note: string; provenance?: DecisionProvenance }
  | { type: 'DECIDE_NOT_IN_SOURCE'; parameterId: string; decision: MissingCellDecision; note: string }
  | { type: 'REVIEW_SCOPE'; ruleId: string; decision: 'CONFIRM_CURRENT_SCOPE' | 'REQUIRES_CHANGE'; note: string }
  | { type: 'REJECT_RULE'; ruleId: string; note: string }
  | { type: 'REJECT_CANDIDATE'; note: string };

export type DecisionProvenance = { documentSha256: string; locator: string; excerpt: string };
type DecisionRecord<T extends string> = { decision: T; note: string; actor: CandidateActor; decidedAt: string; provenance: DecisionProvenance | null };
export type CandidateReviewState = {
  ruleSetId: string; candidateVersion: string; sourceHash: string; revision: number;
  lifecycle: 'REVIEW_CANDIDATE' | 'IN_REVIEW' | 'REJECTED';
  publicationStatus: 'INACTIVE'; approved: false; active: false;
  ruleIds: string[]; warningIds: string[]; parameterIds: string[]; blockerId: string;
  notes: Array<{ target: string; targetId: string; text: string; actor: CandidateActor; at: string }>;
  reviewedRules: Record<string, DecisionRecord<'REVIEWED' | 'REJECTED'>>;
  scopeDecisions: Record<string, DecisionRecord<'CONFIRM_CURRENT_SCOPE' | 'REQUIRES_CHANGE'>>;
  warningDecisions: Record<string, DecisionRecord<WarningDecision>>;
  missingCellDecisions: Record<string, DecisionRecord<MissingCellDecision>>;
  blockerDecision: DecisionRecord<BlockerDecision> | null;
};
export type CandidateAuditEntry = {
  actor: CandidateActor; action: CandidateAction['type']; entityType: string; entityId: string;
  before: unknown; after: unknown; timestamp: string; candidateVersion: string; reason: string;
};

const fail = (code: string): never => { throw new Error(code); };
const requireText = (value: string, code: string): string => {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 2000) fail(code);
  return value.trim();
};
const assertId = (ids: string[], id: string, code: string) => { if (!ids.includes(id)) fail(code); };
const clone = <T>(value: T): T => structuredClone(value);
const assertChoice = (value: string, options: readonly string[], code: string) => {
  if (!options.includes(value)) fail(code);
};

export function createJejuV2ReviewState(candidate: JejuV2CandidateView): CandidateReviewState {
  if (candidate.status !== 'REVIEW_CANDIDATE' || candidate.registrationStatus !== 'NOT_REGISTERED' ||
    candidate.approved !== false || candidate.active !== false || candidate.blockerCount !== 1 ||
    candidate.rules.length !== 44 || candidate.warnings.length !== 22 || candidate.notInSource.length !== 5) fail('UNSAFE_CANDIDATE_SEED');
  return { ruleSetId: candidate.ruleSetId, candidateVersion: candidate.version, sourceHash: candidate.source.sha256,
    revision: 0, lifecycle: 'REVIEW_CANDIDATE', publicationStatus: 'INACTIVE', approved: false, active: false,
    ruleIds: candidate.rules.map(item => item.id), warningIds: candidate.warnings.map(item => item.id),
    parameterIds: candidate.notInSource.map(item => item.parameterId), blockerId: candidate.blocker.unresolvedId,
    notes: [], reviewedRules: {}, scopeDecisions: {}, warningDecisions: {}, missingCellDecisions: {}, blockerDecision: null };
}

function requireProvenance(value: DecisionProvenance | undefined, sourceHash: string): DecisionProvenance {
  if (!value) return fail('REVIEW_PROVENANCE_REQUIRED');
  if (value.documentSha256 !== sourceHash) fail('REVIEW_SOURCE_HASH_MISMATCH');
  requireText(value.locator, 'REVIEW_LOCATOR_REQUIRED');
  requireText(value.excerpt, 'REVIEW_EXCERPT_REQUIRED');
  return clone(value);
}

/** Pure transition: notes/decisions never modify a rule, evaluator, or public binding. */
export function planJejuV2Decision(
  current: CandidateReviewState, action: CandidateAction, actor: CandidateActor, at: string,
): { next: CandidateReviewState; audit: CandidateAuditEntry } {
  if (!actor || !['reviewer', 'admin'].includes(actor.role)) fail('REVIEW_ROLE_REQUIRED');
  requireText(actor.id, 'REVIEW_ACTOR_REQUIRED');
  if (!Number.isFinite(Date.parse(at))) fail('REVIEW_TIMESTAMP_REQUIRED');
  if (current.lifecycle === 'REJECTED') fail('CANDIDATE_REJECTED');
  const next = clone(current);
  let entityType: string = 'CANDIDATE', entityId = current.ruleSetId, before: unknown = current.lifecycle,
    after: unknown, reason = '검수 시작';
  const record = <T extends string>(decision: T, note: string, provenance?: DecisionProvenance): DecisionRecord<T> => ({
    decision, note: requireText(note, 'REVIEW_REASON_REQUIRED'), actor: clone(actor), decidedAt: at,
    provenance: provenance ? requireProvenance(provenance, current.sourceHash) : null,
  });
  if (action.type === 'MOVE_TO_IN_REVIEW') {
    if (current.lifecycle !== 'REVIEW_CANDIDATE') fail('REVIEW_ALREADY_STARTED');
    next.lifecycle = 'IN_REVIEW'; after = next.lifecycle;
  } else {
    if (current.lifecycle !== 'IN_REVIEW') fail('REVIEW_NOT_IN_PROGRESS');
    if (action.type === 'ADD_REVIEW_NOTE') {
      assertChoice(action.target, ['RULE', 'WARNING', 'BLOCKER', 'PARAMETER'], 'INVALID_REVIEW_TARGET_TYPE');
      const ids = action.target === 'RULE' ? current.ruleIds : action.target === 'WARNING' ? current.warningIds
        : action.target === 'PARAMETER' ? current.parameterIds : [current.blockerId];
      assertId(ids, action.targetId, 'REVIEW_TARGET_NOT_FOUND');
      entityType = action.target; entityId = action.targetId;
      before = current.notes.filter(item => item.target === action.target && item.targetId === action.targetId);
      reason = requireText(action.note, 'REVIEW_REASON_REQUIRED');
      next.notes.push({ target: action.target, targetId: action.targetId, text: reason, actor: clone(actor), at });
      after = next.notes.filter(item => item.target === action.target && item.targetId === action.targetId);
    } else if (action.type === 'MARK_RULE_REVIEWED' || action.type === 'REJECT_RULE') {
      assertId(current.ruleIds, action.ruleId, 'REVIEW_RULE_NOT_FOUND');
      entityType = 'RULE'; entityId = action.ruleId; before = current.reviewedRules[action.ruleId] ?? null;
      const value = record(action.type === 'REJECT_RULE' ? 'REJECTED' : 'REVIEWED', action.note);
      next.reviewedRules[action.ruleId] = value; after = value; reason = value.note;
    } else if (action.type === 'REVIEW_SCOPE') {
      assertId(current.ruleIds, action.ruleId, 'REVIEW_RULE_NOT_FOUND');
      assertChoice(action.decision, ['CONFIRM_CURRENT_SCOPE', 'REQUIRES_CHANGE'], 'INVALID_SCOPE_DECISION');
      entityType = 'SCOPE'; entityId = action.ruleId; before = current.scopeDecisions[action.ruleId] ?? null;
      const value = record(action.decision, action.note);
      next.scopeDecisions[action.ruleId] = value; after = value; reason = value.note;
    } else if (action.type === 'RESOLVE_WARNING') {
      assertId(current.warningIds, action.warningId, 'REVIEW_WARNING_NOT_FOUND');
      assertChoice(action.decision, ['ACCEPTED_AS_SAFE', 'REQUIRES_CHANGE', 'RESOLVED_WITH_SOURCE',
        'RESOLVED_WITH_SCOPE_DECISION', 'REJECTED'], 'INVALID_WARNING_DECISION');
      entityType = 'WARNING'; entityId = action.warningId; before = current.warningDecisions[action.warningId] ?? null;
      if (action.decision.startsWith('RESOLVED_WITH_') && !action.provenance) fail('REVIEW_PROVENANCE_REQUIRED');
      const value = record(action.decision, action.note, action.provenance);
      next.warningDecisions[action.warningId] = value; after = value; reason = value.note;
    } else if (action.type === 'RESOLVE_BLOCKER') {
      if (action.blockerId !== current.blockerId) fail('REVIEW_BLOCKER_NOT_FOUND');
      assertChoice(action.decision, ['RESOLVED_WITH_SOURCE', 'RESOLVED_WITH_SCOPE_DECISION',
        'REJECT_RULE', 'KEEP_BLOCKED'], 'INVALID_BLOCKER_DECISION');
      entityType = 'BLOCKER'; entityId = action.blockerId; before = current.blockerDecision;
      if (action.decision.startsWith('RESOLVED_WITH_') && !action.provenance) fail('REVIEW_PROVENANCE_REQUIRED');
      const value = record(action.decision, action.note, action.provenance);
      next.blockerDecision = value; after = value; reason = value.note;
    } else if (action.type === 'DECIDE_NOT_IN_SOURCE') {
      assertId(current.parameterIds, action.parameterId, 'REVIEW_PARAMETER_NOT_FOUND');
      assertChoice(action.decision, ['KEEP_NULL', 'REQUIRES_EXTERNAL_POLICY_SOURCE',
        'REJECT_DEFAULT_VALUE'], 'INVALID_MISSING_CELL_DECISION');
      entityType = 'PARAMETER'; entityId = action.parameterId; before = current.missingCellDecisions[action.parameterId] ?? null;
      const value = record(action.decision, action.note);
      next.missingCellDecisions[action.parameterId] = value; after = value; reason = value.note;
    } else if (action.type === 'REJECT_CANDIDATE') {
      reason = requireText(action.note, 'REVIEW_REASON_REQUIRED'); next.lifecycle = 'REJECTED'; after = next.lifecycle;
    } else fail('UNKNOWN_REVIEW_ACTION');
  }
  next.revision++;
  return { next, audit: { actor: clone(actor), action: action.type, entityType, entityId,
    before: clone(before), after: clone(after), timestamp: at, candidateVersion: current.candidateVersion, reason } };
}

export interface CandidateDecisionStore {
  read(): Promise<{ state: CandidateReviewState; audits: CandidateAuditEntry[] }>;
  /** Must atomically compare revision, persist state, and append immutable audit. */
  commit(expectedRevision: number, next: CandidateReviewState, audit: CandidateAuditEntry): Promise<void>;
}

export class CandidateDecisionService {
  private readonly store: CandidateDecisionStore;
  constructor(store: CandidateDecisionStore) { this.store = store; }
  async decide(action: CandidateAction, actor: CandidateActor, at: string) {
    const { state } = await this.store.read();
    const { next, audit } = planJejuV2Decision(state, action, actor, at);
    await this.store.commit(state.revision, next, audit);
    return clone(next);
  }
}

/** Local-test port only; never used as a serverless or browser persistence backend. */
export class LocalCandidateDecisionStore implements CandidateDecisionStore {
  private state: CandidateReviewState;
  private audits: CandidateAuditEntry[] = [];
  private readonly appendAudit: (entry: CandidateAuditEntry) => void;
  constructor(seed: CandidateReviewState, appendAudit: (entry: CandidateAuditEntry) => void = () => {}) {
    this.state = clone(seed);
    this.appendAudit = appendAudit;
  }
  async read() { return { state: clone(this.state), audits: clone(this.audits) }; }
  async commit(expectedRevision: number, next: CandidateReviewState, audit: CandidateAuditEntry) {
    if (this.state.revision !== expectedRevision || next.revision !== expectedRevision + 1) fail('STALE_REVIEW_REVISION');
    if (next.ruleSetId !== this.state.ruleSetId || next.sourceHash !== this.state.sourceHash ||
      next.candidateVersion !== this.state.candidateVersion || next.publicationStatus !== 'INACTIVE' ||
      next.approved !== false || next.active !== false) fail('REVIEW_IDENTITY_OR_PUBLICATION_CHANGED');
    this.appendAudit(clone(audit)); // Throwing leaves both state and audit unchanged.
    this.audits = [...this.audits, clone(audit)];
    this.state = clone(next);
  }
}
