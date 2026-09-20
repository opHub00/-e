import type { CandidateRulePackage, CandidateRule, Evidence } from '../../ruleExtraction/server/candidate.ts';
import type { CriticalRole, GuardStatus, SemanticErrorCategory } from '../../ruleExtraction/server/v4_1/semanticSafety.ts';
import { hashCanonical } from '../domain/hashing.ts';
import type { CriticalBlockerCode, CriticalCategory, RuleReviewWorkspaceSeed } from './types.ts';

export type CandidateSafetyReview = { status: GuardStatus; criticalRole: CriticalRole; confidence: 'HIGH' | 'MEDIUM' | 'REVIEW_REQUIRED'; issues: { code: string; category: SemanticErrorCategory }[] };
export type MaterializeReviewInput = {
  candidatePackage: CandidateRulePackage;
  ruleVersionId: string;
  version: string;
  document: { id: string; parsedDocumentId: string; fileName: string; versionLabel: string };
  safetyByCandidateId: Record<string, CandidateSafetyReview>;
  semanticRoleByCandidateId: Record<string, string>;
  scopeByCandidateId?: Record<string, string>;
  highCriticalErrorIds?: string[];
  requiredCategories: { supplyType: string; category: CriticalCategory }[];
};

const categoryOf = (role: CriticalRole): CriticalCategory => role === 'TAX_HISTORY' ? 'TAX' : role;
const evidenceId = (rule: CandidateRule, evidence: Evidence, index: number) => hashCanonical([rule.candidateRuleId, index, evidence.locator]);
function blocker(code: string): CriticalBlockerCode | null {
  if (code.startsWith('PARTIAL_RANGE_BINDING')) return 'PARTIAL_RANGE_BINDING';
  if (code.startsWith('SCOPE_MISMATCH') || code === 'SUPPLY_SCOPE_MISMATCH' || code === 'FUTURE_HOUSEHOLD_SCOPE_REQUIRED') return 'SCOPE_MISMATCH';
  if (code === 'CRITICAL_SCORE_VIOLATION') return 'CRITICAL_SCORE_VIOLATION';
  if (code.includes('EVIDENCE_CONTEXT_MISMATCH') || code === 'EVIDENCE_SEMANTIC_MISMATCH') return 'SEMANTIC_EVIDENCE_MISMATCH';
  return null;
}

/** Converts extractor output into a review queue. It never imports, approves or activates rules. */
export function materializeCandidateReviewSeed(input: MaterializeReviewInput): RuleReviewWorkspaceSeed {
  const pkg = input.candidatePackage, high = new Set(input.highCriticalErrorIds ?? []);
  if (pkg.document.documentId !== input.document.parsedDocumentId) throw new Error('REVIEW_DOCUMENT_ID_MISMATCH');
  const rules = pkg.candidateRules.map(rule => {
    const safety = input.safetyByCandidateId[rule.candidateRuleId]; if (!safety) throw new Error(`MISSING_V41_SAFETY_RESULT:${rule.candidateRuleId}`);
    const semanticRole = input.semanticRoleByCandidateId[rule.candidateRuleId]; if (!semanticRole) throw new Error(`MISSING_SEMANTIC_ROLE:${rule.candidateRuleId}`);
    const safetyBlockers = safety.issues.map(item => blocker(item.code)).filter((item): item is CriticalBlockerCode => item !== null);
    if (high.has(rule.candidateRuleId)) safetyBlockers.push('HIGH_CRITICAL_ERROR');
    const category = categoryOf(safety.criticalRole), critical = true;
    const candidateStatus = safety.status === 'ACCEPTED' && safety.confidence === 'HIGH' && !critical && !safetyBlockers.length ? 'AUTO_SAFE_CANDIDATE' as const :
      safety.status === 'REJECTED' ? 'UNRESOLVED' as const : 'REVIEW_REQUIRED' as const;
    return { ruleId: rule.candidateRuleId, ruleVersionId: input.ruleVersionId,
      required: input.requiredCategories.some(item => item.supplyType === rule.supplyType && item.category === category), critical, candidateStatus,
      safetyBlockers: [...new Set(safetyBlockers)], originalCandidate: { ruleKey: rule.ruleKey, label: rule.ruleKey, semanticRole, supplyType: rule.supplyType,
        category, operator: rule.condition.operator, value: rule.condition.operator === 'in' ? rule.condition.values : rule.condition.value,
        scope: input.scopeByCandidateId?.[rule.candidateRuleId] ?? null, stage: rule.stage, score: rule.score, maxScore: rule.maxScore,
        evidence: rule.evidence.map((item, index) => ({ id: evidenceId(rule, item, index), documentId: input.document.id, section: item.locator.stream ?? pkg.announcement.title,
          tableLabel: item.tableId, label: item.snippet.slice(0, 120), textExcerpt: item.snippet, locator: structuredClone(item.locator) })),
        relatedExceptionRuleIds: [...rule.relatedExceptionRuleKeys], warnings: safety.issues.map(item => item.code) } };
  });
  return { ruleVersionId: input.ruleVersionId, announcement: { id: pkg.announcement.canonicalId, title: pkg.announcement.title },
    document: { id: input.document.id, fileName: input.document.fileName, sha256: pkg.document.sha256, versionLabel: input.document.versionLabel },
    sourceStatus: pkg.sourceStatus, version: input.version, rules,
    conflicts: pkg.conflicts.map((conflict, index) => ({ conflictId: `conflict:${index}`, concept: conflict.description, candidateRuleIds: [],
      candidates: conflict.alternatives.map((alternative, alternativeIndex) => ({ candidateId: `conflict:${index}:${alternativeIndex}`, value: alternative.value,
        evidenceIds: alternative.evidence.map((item, evidenceIndex) => hashCanonical(['conflict', index, alternativeIndex, evidenceIndex, item.locator])) })) })),
    unresolvedItems: pkg.unresolvedItems.map((item, index) => ({ unresolvedId: `unresolved:${index}`, type: item.type, description: item.description, ruleIds: [] })),
    // CandidateRule only states related keys; it does not prove the semantic relation type. Keep exception relations orphaned for review.
    requiredCategories: structuredClone(input.requiredCategories), initialExceptionRelations: [] };
}
