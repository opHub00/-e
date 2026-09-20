import type { ImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import type { CriticalCategory, ReviewableRuleSnapshot, RuleReviewWorkspaceSeed } from '../server/types.ts';

const SELECTED = ['youth.age', 'youth.income', 'newlywed.assets', 'firstHome.deposit', 'youth.residence', 'youth.overseas', 'youth.restrictions'] as const;
const CATEGORY_BY_KEY: Record<string, CriticalCategory> = {
  'youth.age': 'AGE', 'youth.income': 'INCOME', 'newlywed.assets': 'ASSET', 'firstHome.deposit': 'SAVINGS',
  'youth.residence': 'SCOPE', 'youth.overseas': 'EXCEPTION', 'youth.restrictions': 'HOUSING',
};
const expression = (config: Record<string, unknown>) => config.expression as { fact?: string; op?: string; value?: unknown; all?: unknown[] } | undefined;

function snapshot(rule: ImportPackage['rules'][number]): ReviewableRuleSnapshot {
  const item = expression(rule.config), category = CATEGORY_BY_KEY[rule.ruleKey];
  return { ruleKey: rule.ruleKey, label: String(rule.config.label), semanticRole: rule.ruleKey.toUpperCase().replaceAll('.', '_'), supplyType: rule.supplyType,
    category, operator: item?.op ?? null, value: item?.value ?? item?.all ?? null,
    scope: rule.ruleKey === 'youth.overseas' ? 'APPLICANT' : rule.ruleKey === 'newlywed.assets' ? 'HOUSEHOLD' : 'APPLICANT',
    stage: rule.stage, score: null, maxScore: null, relatedExceptionRuleIds: rule.ruleKey === 'youth.residence' ? ['youth.overseas'] : [],
    warnings: rule.ruleKey === 'youth.overseas' ? ['해외체류와 생업 목적 예외를 함께 검토해야 합니다.'] : [],
    evidence: [{ id: rule.evidence.id, documentId: rule.evidence.documentId, section: rule.evidence.section, tableLabel: rule.evidence.tableLabel,
      label: rule.evidence.label, textExcerpt: rule.evidence.textExcerpt, locator: rule.evidence.locator }] };
}

/** Pure fixture transformation. File access belongs only to the generator/verification scripts. */
export function buildSamdoReviewSeed(samdo: ImportPackage): RuleReviewWorkspaceSeed {
  const rules = SELECTED.map(key => {
    const source = samdo.rules.find(rule => rule.ruleKey === key);
    if (!source) throw new Error(`SAMDO_RULE_NOT_FOUND:${key}`);
    const extra = key === 'youth.restrictions', blockers = key === 'firstHome.deposit' ? ['SEMANTIC_EVIDENCE_MISMATCH' as const] : [];
    return { ruleId: key, ruleVersionId: samdo.ruleSet.id, required: !extra && key !== 'youth.overseas', critical: !extra,
      candidateStatus: blockers.length || key === 'youth.overseas' ? 'REVIEW_REQUIRED' as const : 'AUTO_SAFE_CANDIDATE' as const,
      safetyBlockers: blockers, originalCandidate: snapshot(source) };
  });
  const residenceEvidence = rules.find(rule => rule.ruleId === 'youth.residence')!.originalCandidate.evidence[0].id;
  return { ruleVersionId: samdo.ruleSet.id, announcement: { id: samdo.announcement.id, title: samdo.announcement.title },
    document: { id: samdo.document.id, fileName: samdo.document.fileName, sha256: samdo.document.sha256, versionLabel: samdo.document.versionLabel },
    sourceStatus: samdo.ruleSet.sourceStatus, version: samdo.ruleSet.version, rules,
    conflicts: [{ conflictId: 'samdo.region.priority-date', concept: '지역우선 기준일', candidateRuleIds: ['youth.residence'], candidates: [
      { candidateId: 'continuous-one-year', value: '2025-09-14 이전부터 계속 거주', evidenceIds: [residenceEvidence] },
      { candidateId: 'announcement-date', value: '공고일 현재 거주', evidenceIds: [residenceEvidence] }] }],
    unresolvedItems: [{ unresolvedId: 'samdo.management-number-mapping', type: 'AMBIGUOUS_HOUSING_MANAGEMENT_NUMBER',
      description: '관리번호와 1·2지구 연결이 검토본에서 확정되지 않았습니다.', ruleIds: [] }],
    requiredCategories: rules.filter(rule => rule.required).map(rule => ({ supplyType: rule.originalCandidate.supplyType, category: rule.originalCandidate.category })) };
}
