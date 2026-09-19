import { readFileSync } from 'node:fs';
import type { ImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import type { CriticalCategory, ReviewableRuleSnapshot, RuleReviewWorkspaceSeed } from './types.ts';

const samdo = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8')) as ImportPackage;
const selected = ['youth.age', 'youth.income', 'newlywed.assets', 'firstHome.deposit', 'youth.residence', 'youth.overseas', 'youth.restrictions'];
const categoryByKey: Record<string, CriticalCategory> = {
  'youth.age': 'AGE', 'youth.income': 'INCOME', 'newlywed.assets': 'ASSET', 'firstHome.deposit': 'SAVINGS',
  'youth.residence': 'SCOPE', 'youth.overseas': 'EXCEPTION', 'youth.restrictions': 'HOUSING',
};
const expression = (config: Record<string, unknown>) => config.expression as { fact?: string; op?: string; value?: unknown; all?: unknown[] } | undefined;
function snapshot(rule: ImportPackage['rules'][number]): ReviewableRuleSnapshot {
  const e = expression(rule.config), category = categoryByKey[rule.ruleKey];
  return { ruleKey: rule.ruleKey, label: String(rule.config.label), semanticRole: rule.ruleKey.toUpperCase().replaceAll('.', '_'), supplyType: rule.supplyType,
    category, operator: e?.op ?? null, value: e?.value ?? e?.all ?? null, scope: rule.ruleKey === 'youth.overseas' ? 'APPLICANT' : rule.ruleKey === 'newlywed.assets' ? 'HOUSEHOLD' : 'APPLICANT',
    stage: rule.stage, score: null, maxScore: null, relatedExceptionRuleIds: rule.ruleKey === 'youth.residence' ? ['youth.overseas'] : [], warnings: rule.ruleKey === 'youth.overseas' ? ['해외체류와 생업 목적 예외를 함께 검토해야 합니다.'] : [],
    evidence: [{ id: rule.evidence.id, documentId: rule.evidence.documentId, section: rule.evidence.section, tableLabel: rule.evidence.tableLabel,
      label: rule.evidence.label, textExcerpt: rule.evidence.textExcerpt, locator: rule.evidence.locator }] };
}

export function samdoReviewSeed(): RuleReviewWorkspaceSeed {
  const rules = selected.map(key => { const source = samdo.rules.find(rule => rule.ruleKey === key); if (!source) throw new Error(`SAMDO_RULE_NOT_FOUND:${key}`);
    const extra = key === 'youth.restrictions', blocker = key === 'firstHome.deposit' ? ['SEMANTIC_EVIDENCE_MISMATCH' as const] : [];
    return { ruleId: key, ruleVersionId: samdo.ruleSet.id, required: !extra && key !== 'youth.overseas', critical: !extra,
      candidateStatus: blocker.length || key === 'youth.overseas' ? 'REVIEW_REQUIRED' as const : 'AUTO_SAFE_CANDIDATE' as const,
      safetyBlockers: blocker, originalCandidate: snapshot(source) }; });
  return { ruleVersionId: samdo.ruleSet.id, announcement: { id: samdo.announcement.id, title: samdo.announcement.title },
    document: { id: samdo.document.id, fileName: samdo.document.fileName, sha256: samdo.document.sha256, versionLabel: samdo.document.versionLabel },
    sourceStatus: samdo.ruleSet.sourceStatus, version: samdo.ruleSet.version, rules,
    conflicts: [{ conflictId: 'samdo.region.priority-date', concept: '지역우선 기준일', candidateRuleIds: ['youth.residence'], candidates: [
      { candidateId: 'continuous-one-year', value: '2025-09-14 이전부터 계속 거주', evidenceIds: [rules.find(rule => rule.ruleId === 'youth.residence')!.originalCandidate.evidence[0].id] },
      { candidateId: 'announcement-date', value: '공고일 현재 거주', evidenceIds: [rules.find(rule => rule.ruleId === 'youth.residence')!.originalCandidate.evidence[0].id] }] }],
    unresolvedItems: [{ unresolvedId: 'samdo.management-number-mapping', type: 'AMBIGUOUS_HOUSING_MANAGEMENT_NUMBER', description: '관리번호와 1·2지구 연결이 검토본에서 확정되지 않았습니다.', ruleIds: [] }],
    requiredCategories: rules.filter(rule => rule.required).map(rule => ({ supplyType: rule.originalCandidate.supplyType, category: rule.originalCandidate.category })) };
}
