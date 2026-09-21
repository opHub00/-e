import type { ImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import type {
  CriticalBlockerCode,
  CriticalCategory,
  ReviewableRuleSnapshot,
  RuleReviewSeed,
  RuleReviewWorkspaceSeed,
} from '../server/types.ts';

/**
 * Staging review seed: every materialized source rule gets a review candidate.
 *
 * The activation gate refuses to activate while any materialized rule has no
 * review row, so a partial seed can never reach ACTIVATION_ELIGIBLE. The
 * test/dev fixture in buildSamdoReviewSeed.ts deliberately covers a curated
 * handful and stays that way; this builder covers the whole imported set.
 *
 * Nothing here marks a candidate as reviewed or approved. Every row starts
 * pending and has to go through the normal review lifecycle.
 */

/** Derived from the rule key, so the same rule always lands in the same category. */
const CATEGORY_BY_SEGMENT: Record<string, CriticalCategory> = {
  age: 'AGE',
  adult: 'AGE',
  housing: 'HOUSING',
  household: 'HOUSING',
  head: 'HOUSING',
  family: 'HOUSING',
  size: 'HOUSING',
  single: 'HOUSING',
  restrictions: 'HOUSING',
  specialHistory: 'SUBSCRIPTION',
  reWinning: 'SUBSCRIPTION',
  account: 'SUBSCRIPTION',
  months: 'SUBSCRIPTION',
  payments: 'SUBSCRIPTION',
  rank: 'SUBSCRIPTION',
  fiveYears: 'SUBSCRIPTION',
  deposit: 'SAVINGS',
  income: 'INCOME',
  assets: 'ASSET',
  parentAssets: 'ASSET',
  tax: 'TAX',
  residence: 'SCOPE',
  overseas: 'EXCEPTION',
  exceptions: 'EXCEPTION',
  childbirth: 'EXCEPTION',
};

/** Rules the announcement states for the whole household rather than the applicant. */
const HOUSEHOLD_SEGMENTS = new Set(['housing', 'household', 'size', 'assets', 'income', 'family', 'fiveYears', 'head']);

/** Findings carried over from the draft transcription review. */
const SAFETY_BLOCKERS: Record<string, CriticalBlockerCode[]> = {
  'firstHome.deposit': ['SEMANTIC_EVIDENCE_MISMATCH'],
};

const OVERSEAS_WARNING = '해외체류와 생업 목적 예외를 함께 검토해야 합니다.';

function segmentOf(ruleKey: string): string {
  return ruleKey.split('.')[1] ?? '';
}

function categoryOf(rule: ImportPackage['rules'][number]): CriticalCategory {
  if (rule.category === 'STAGE') return 'STAGE';
  if (rule.category === 'SCORE') return 'SCORE';
  const category = CATEGORY_BY_SEGMENT[segmentOf(rule.ruleKey)];
  // An unmapped rule must stop the build rather than land in an arbitrary bucket.
  if (!category) throw new Error(`SAMDO_RULE_CATEGORY_UNMAPPED:${rule.ruleKey}`);
  return category;
}

function scopeOf(rule: ImportPackage['rules'][number]): string {
  const segment = segmentOf(rule.ruleKey);
  return rule.supplyType !== 'youth' && HOUSEHOLD_SEGMENTS.has(segment) ? 'HOUSEHOLD' : 'APPLICANT';
}

function snapshot(
  rule: ImportPackage['rules'][number],
  relatedExceptionRuleIds: string[],
): ReviewableRuleSnapshot {
  const expression = rule.config.expression as { op?: string; value?: unknown; all?: unknown[] } | undefined;
  return {
    ruleKey: rule.ruleKey,
    label: String(rule.config.label),
    semanticRole: rule.ruleKey.toUpperCase().replaceAll('.', '_'),
    supplyType: rule.supplyType,
    category: categoryOf(rule),
    operator: expression?.op ?? null,
    value: expression?.value ?? expression?.all ?? null,
    scope: scopeOf(rule),
    stage: rule.stage,
    // The package carries no scoring table, so no score is invented here.
    score: null,
    maxScore: null,
    relatedExceptionRuleIds,
    warnings: segmentOf(rule.ruleKey) === 'overseas' ? [OVERSEAS_WARNING] : [],
    evidence: [{
      id: rule.evidence.id,
      documentId: rule.evidence.documentId,
      section: rule.evidence.section,
      tableLabel: rule.evidence.tableLabel,
      label: rule.evidence.label,
      textExcerpt: rule.evidence.textExcerpt,
      locator: rule.evidence.locator,
    }],
  };
}

export function buildSamdoStagingReviewSeed(samdo: ImportPackage): RuleReviewWorkspaceSeed {
  const keys = new Set(samdo.rules.map(rule => rule.ruleKey));
  const rules: RuleReviewSeed[] = samdo.rules.map(rule => {
    const segment = segmentOf(rule.ruleKey);
    const category = categoryOf(rule);
    // A residence rule is qualified by the same supply's overseas exception.
    const related = segment === 'residence' && keys.has(`${rule.supplyType}.overseas`)
      ? [`${rule.supplyType}.overseas`]
      : [];
    const safetyBlockers = SAFETY_BLOCKERS[rule.ruleKey] ?? [];
    const critical = segment !== 'restrictions';
    return {
      ruleId: rule.ruleKey,
      ruleVersionId: samdo.ruleSet.id,
      critical,
      // Exceptions qualify other rules instead of standing as their own requirement.
      required: critical && category !== 'EXCEPTION',
      candidateStatus: safetyBlockers.length > 0 || category === 'EXCEPTION' ? 'REVIEW_REQUIRED' : 'AUTO_SAFE_CANDIDATE',
      safetyBlockers,
      originalCandidate: snapshot(rule, related),
    };
  });

  const residenceEvidence = rules.find(rule => rule.ruleId === 'youth.residence')?.originalCandidate.evidence[0].id;
  if (!residenceEvidence) throw new Error('SAMDO_RULE_NOT_FOUND:youth.residence');

  const requiredCategories: { supplyType: string; category: CriticalCategory }[] = [];
  for (const rule of rules) {
    if (!rule.required) continue;
    const { supplyType, category } = rule.originalCandidate;
    if (!requiredCategories.some(item => item.supplyType === supplyType && item.category === category)) {
      requiredCategories.push({ supplyType, category });
    }
  }

  return {
    ruleVersionId: samdo.ruleSet.id,
    announcement: { id: samdo.announcement.id, title: samdo.announcement.title },
    document: {
      id: samdo.document.id,
      fileName: samdo.document.fileName,
      sha256: samdo.document.sha256,
      versionLabel: samdo.document.versionLabel,
    },
    sourceStatus: samdo.ruleSet.sourceStatus,
    version: samdo.ruleSet.version,
    rules,
    conflicts: [{
      conflictId: 'samdo.region.priority-date',
      concept: '지역우선 기준일',
      candidateRuleIds: ['youth.residence'],
      candidates: [
        { candidateId: 'continuous-one-year', value: '2025-09-14 이전부터 계속 거주', evidenceIds: [residenceEvidence] },
        { candidateId: 'announcement-date', value: '공고일 현재 거주', evidenceIds: [residenceEvidence] },
      ],
    }],
    unresolvedItems: [{
      unresolvedId: 'samdo.management-number-mapping',
      type: 'AMBIGUOUS_HOUSING_MANAGEMENT_NUMBER',
      description: '관리번호와 1·2지구 연결이 검토본에서 확정되지 않았습니다.',
      ruleIds: [],
    }],
    requiredCategories,
  };
}
