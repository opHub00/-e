import type { Notice, RulePackage } from '../../noticePlatform/types.ts';
import { appendImmutableAudit, type AdminOperationStore } from './repository.ts';
import { buildAdminDashboardViewModel, buildNoticeAdminViewModel, buildRulePackageReviewViewModel } from './presentation.ts';
import type { AdminMutation, AdminRuntime, AiMonitoringRecord, AssessmentMonitoringRecord, AuditLogEntry, NoticeAdminViewModel, RulePackageDraft } from './types.ts';

const clone = <T>(value: T): T => structuredClone(value);
const assertText = (value: string, code: string) => { if (!value.trim()) throw new Error(code); };
const timestamp = (mutation: AdminMutation) => mutation.at ?? new Date().toISOString();

export function sanitizeMonitoringQuestion(value: string): string {
  return value.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[이메일 제거]')
    .replace(/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[전화번호 제거]')
    .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, '[주민번호 제거]')
    .replace(/\b(?:qr|token)[:=]\s*[A-Za-z0-9_-]{16,}\b/gi, '[토큰 제거]')
    .replace(/(income|asset|소득|자산)\s*[:=]?\s*\d[\d,]{3,}/gi, '$1 [정확한 값 제거]')
    .slice(0, 500);
}

export class AdminOperationService {
  private readonly store: AdminOperationStore;
  private readonly runtime: AdminRuntime;
  constructor(store: AdminOperationStore, runtime: AdminRuntime) { this.store = store; this.runtime = runtime; }

  async dashboard() { const state = await this.store.read(); return buildAdminDashboardViewModel(state.notices, state.rulePackages, state.ai, state.assessments); }
  async notices(): Promise<NoticeAdminViewModel[]> { const state = await this.store.read(); return state.notices.map(notice => buildNoticeAdminViewModel(notice, state.rulePackages.find(pkg => pkg.noticeId === notice.id && pkg.status === 'ACTIVE'), state.ragVersions[notice.id])); }
  async rulePackage(id: string) { const state = await this.store.read(), pkg = state.rulePackages.find(item => item.id === id); if (!pkg) throw new Error('RULE_PACKAGE_NOT_FOUND'); return buildRulePackageReviewViewModel(pkg); }
  async audits() { return (await this.store.read()).audits.map(clone); }

  async stageNotice(notice: Notice, mutation: AdminMutation) {
    return this.#mutate('STAGE_NOTICE', 'NOTICE', notice.id, mutation, state => {
      if (state.notices.some(item => item.id === notice.id && item.status === 'ACTIVE')) throw new Error('ACTIVE_NOTICE_IMMUTABLE');
      const draft = { ...clone(notice), status: 'DRAFT' as const, activatedAt: null, updatedAt: timestamp(mutation) };
      state.notices = [...state.notices.filter(item => item.id !== notice.id), draft]; return draft;
    });
  }

  async stageRulePackage(draft: RulePackageDraft, mutation: AdminMutation) {
    return this.#mutate('STAGE_RULE_PACKAGE', 'RULE_PACKAGE', draft.id, mutation, state => {
      if (state.rulePackages.some(item => item.id === draft.id && item.status === 'ACTIVE')) throw new Error('ACTIVE_RULE_PACKAGE_IMMUTABLE');
      if (!state.notices.some(item => item.id === draft.noticeId)) throw new Error('NOTICE_NOT_FOUND');
      const now = timestamp(mutation), value: RulePackage = { ...clone(draft), status: 'DRAFT', createdAt: now, updatedAt: now };
      state.rulePackages = [...state.rulePackages.filter(item => item.id !== draft.id), value]; return value;
    });
  }

  async requestRuleReview(id: string, mutation: AdminMutation) { return this.#transition(id, 'DRAFT', 'IN_REVIEW', 'REQUEST_RULE_REVIEW', mutation); }
  async approveRulePackage(id: string, mutation: AdminMutation) {
    const state = await this.store.read(), pkg = state.rulePackages.find(item => item.id === id); if (!pkg) throw new Error('RULE_PACKAGE_NOT_FOUND');
    const review = buildRulePackageReviewViewModel(pkg); if (!review.canApprove) throw new Error('RULE_PACKAGE_REVIEW_INCOMPLETE');
    return this.#transition(id, 'IN_REVIEW', 'APPROVED', 'APPROVE_RULE_PACKAGE', mutation);
  }
  async activateRulePackage(id: string, mutation: AdminMutation) {
    const state = await this.store.read(), pkg = state.rulePackages.find(item => item.id === id); if (!pkg) throw new Error('RULE_PACKAGE_NOT_FOUND');
    if (!buildRulePackageReviewViewModel(pkg).canActivate) throw new Error('RULE_PACKAGE_NOT_APPROVED');
    return this.#transition(id, 'APPROVED', 'ACTIVE', 'ACTIVATE_RULE_PACKAGE', mutation);
  }

  async recordAi(record: AiMonitoringRecord) { await this.store.appendAi({ ...clone(record), sanitizedQuestion: sanitizeMonitoringQuestion(record.sanitizedQuestion) }); }
  async recordAssessment(record: AssessmentMonitoringRecord) { await this.store.appendAssessment(clone(record)); }

  async #transition(id: string, expected: RulePackage['status'], next: RulePackage['status'], action: string, mutation: AdminMutation) {
    return this.#mutate(action, 'RULE_PACKAGE', id, mutation, state => { const pkg = state.rulePackages.find(item => item.id === id); if (!pkg) throw new Error('RULE_PACKAGE_NOT_FOUND');
      if (pkg.status !== expected) throw new Error(`INVALID_RULE_PACKAGE_TRANSITION:${pkg.status}:${next}`); pkg.status = next; pkg.updatedAt = timestamp(mutation); return pkg; });
  }

  async #mutate<T>(action: string, entity: AuditLogEntry['entity'], entityId: string, mutation: AdminMutation, operation: (state: Awaited<ReturnType<AdminOperationStore['read']>>) => T): Promise<T> {
    if (this.runtime === 'production') throw new Error('PRODUCTION_ADMIN_MUTATION_DISABLED');
    if (mutation.actor.role !== 'admin' && action !== 'REQUEST_RULE_REVIEW') throw new Error('ADMIN_ROLE_REQUIRED');
    assertText(mutation.actor.id, 'ACTOR_REQUIRED'); assertText(mutation.reason, 'REASON_REQUIRED');
    const state = await this.store.read(), before = clone(state), result = operation(state), at = timestamp(mutation);
    const entry: AuditLogEntry = { id: `${at}:${state.audits.length + 1}`, actor: clone(mutation.actor), action, entity, entityId,
      before: entity === 'NOTICE' ? before.notices.find(item => item.id === entityId) ?? null : before.rulePackages.find(item => item.id === entityId) ?? null,
      after: entity === 'NOTICE' ? state.notices.find(item => item.id === entityId) ?? null : state.rulePackages.find(item => item.id === entityId) ?? null,
      timestamp: at, reason: mutation.reason };
    await this.store.replace(appendImmutableAudit(state, entry));
    return clone(result);
  }
}
