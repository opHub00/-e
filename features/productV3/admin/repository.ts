import type { AdminOperationSnapshot, AiMonitoringRecord, AssessmentMonitoringRecord, AuditLogEntry } from './types.ts';

const clone = <T>(value: T): T => structuredClone(value);

export interface AdminOperationStore {
  read(): Promise<AdminOperationSnapshot>;
  replace(next: AdminOperationSnapshot): Promise<void>;
  appendAi(record: AiMonitoringRecord): Promise<void>;
  appendAssessment(record: AssessmentMonitoringRecord): Promise<void>;
}

/** Local/preview test store. A persistent adapter can implement the same server-only port. */
export class InMemoryAdminOperationStore implements AdminOperationStore {
  #snapshot: AdminOperationSnapshot;
  constructor(seed: AdminOperationSnapshot = { notices: [], rulePackages: [], ragVersions: {}, audits: [], ai: [], assessments: [] }) { this.#snapshot = clone(seed); }
  async read() { return clone(this.#snapshot); }
  async replace(next: AdminOperationSnapshot) { this.#snapshot = clone(next); }
  async appendAi(record: AiMonitoringRecord) { this.#snapshot.ai.push(clone(record)); }
  async appendAssessment(record: AssessmentMonitoringRecord) { this.#snapshot.assessments.push(clone(record)); }
}

export const appendImmutableAudit = (snapshot: AdminOperationSnapshot, entry: AuditLogEntry): AdminOperationSnapshot => ({
  ...clone(snapshot), audits: [...snapshot.audits.map(clone), clone(entry)],
});
