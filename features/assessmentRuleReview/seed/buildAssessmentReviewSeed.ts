import type { ImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import type {
  CriticalBlockerCode,
  CriticalCategory,
  ReviewableRuleSnapshot,
  RuleReviewSeed,
  RuleReviewWorkspaceSeed,
} from '../server/types.ts';
import type { ReviewSeedAnnotation } from './annotations.ts';

/**
 * Generic review seed: every materialized source rule of an import package gets
 * a review candidate. The activation gate refuses to activate while any
 * materialized rule has no review row, so a partial seed can never reach
 * ACTIVATION_ELIGIBLE.
 *
 * Everything here is derived deterministically from the package's rule
 * metadata and the shared rule-key vocabulary. Findings specific to one
 * announcement come only through ReviewSeedAnnotation. Nothing marks a
 * candidate as reviewed or approved: every row starts pending.
 */

/**
 * Rule keys follow `<supplyType>.<concept>[.<detail>]`. The concept decides
 * the review category. An unmapped concept stops the build rather than land in
 * an arbitrary bucket; extend this vocabulary, never special-case a rule key.
 */
export const REVIEW_CATEGORY_BY_CONCEPT: Readonly<Record<string, CriticalCategory>> = {
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

/** Concepts stated for the whole household. Youth supply is always assessed on the applicant alone. */
const HOUSEHOLD_CONCEPTS = new Set(['housing', 'household', 'size', 'assets', 'income', 'family', 'fiveYears', 'head']);
const APPLICANT_ONLY_SUPPLIES = new Set(['youth']);
/** Concepts that are recorded for review but do not block activation on their own. */
const NON_CRITICAL_CONCEPTS = new Set(['restrictions']);

/** Statutory relations between concepts, applied within the same supply type. */
const CONCEPT_EXCEPTIONS: Readonly<Record<string, string[]>> = { residence: ['overseas'] };
const CONCEPT_WARNINGS: Readonly<Record<string, string>> = {
  overseas: '해외체류와 생업 목적 예외를 함께 검토해야 합니다.',
};

type SourceRule = ImportPackage['rules'][number];

export type BuildAssessmentReviewSeedOptions = {
  /** Restrict the seed to these rule keys, in this order. For curated test fixtures only. */
  ruleKeys?: readonly string[];
};

export function conceptOf(ruleKey: string): string {
  return ruleKey.split('.')[1] ?? '';
}

export function reviewCategoryOf(rule: Pick<SourceRule, 'ruleKey' | 'category'>): CriticalCategory {
  if (rule.category === 'STAGE') return 'STAGE';
  if (rule.category === 'SCORE') return 'SCORE';
  const category = REVIEW_CATEGORY_BY_CONCEPT[conceptOf(rule.ruleKey)];
  if (!category) throw new Error(`REVIEW_RULE_CATEGORY_UNMAPPED:${rule.ruleKey}`);
  return category;
}

function scopeOf(rule: SourceRule): string {
  return !APPLICANT_ONLY_SUPPLIES.has(rule.supplyType) && HOUSEHOLD_CONCEPTS.has(conceptOf(rule.ruleKey)) ? 'HOUSEHOLD' : 'APPLICANT';
}

function assertAnnotationMatches(pkg: ImportPackage, annotation: ReviewSeedAnnotation) {
  if (annotation.announcementId !== pkg.announcement.id) throw new Error('REVIEW_ANNOTATION_ANNOUNCEMENT_MISMATCH');
  if (annotation.documentSha256 !== pkg.document.sha256) throw new Error('REVIEW_ANNOTATION_DOCUMENT_MISMATCH');
  if (annotation.ruleSetVersion !== pkg.ruleSet.version) throw new Error('REVIEW_ANNOTATION_VERSION_MISMATCH');
  const keys = new Set(pkg.rules.map(rule => rule.ruleKey));
  const referenced = [
    ...annotation.safetyBlockers.map(item => item.ruleKey),
    ...annotation.exceptions.flatMap(item => [item.ruleKey, item.exceptionRuleKey]),
    ...annotation.warnings.map(item => item.ruleKey),
    ...annotation.conflicts.flatMap(item => [...item.candidateRuleKeys, ...item.candidates.flatMap(candidate => candidate.evidenceRuleKeys)]),
    ...annotation.unresolved.flatMap(item => item.ruleKeys),
  ];
  const unknown = referenced.find(key => !keys.has(key));
  if (unknown) throw new Error(`REVIEW_ANNOTATION_UNKNOWN_RULE:${unknown}`);
  for (const relation of annotation.exceptions) {
    const exception = pkg.rules.find(rule => rule.ruleKey === relation.exceptionRuleKey)!;
    if (reviewCategoryOf(exception) !== 'EXCEPTION') throw new Error(`REVIEW_ANNOTATION_NOT_AN_EXCEPTION:${relation.exceptionRuleKey}`);
  }
  const ids = [...annotation.conflicts.map(item => item.conflictId), ...annotation.unresolved.map(item => item.unresolvedId)];
  if (new Set(ids).size !== ids.length) throw new Error('REVIEW_ANNOTATION_DUPLICATE_ID');
}

function snapshot(rule: SourceRule, relatedExceptionRuleIds: string[], warnings: string[]): ReviewableRuleSnapshot {
  const expression = rule.config.expression as { op?: string; value?: unknown; all?: unknown[] } | undefined;
  return {
    ruleKey: rule.ruleKey,
    label: String(rule.config.label),
    semanticRole: rule.ruleKey.toUpperCase().replaceAll('.', '_'),
    supplyType: rule.supplyType,
    category: reviewCategoryOf(rule),
    operator: expression?.op ?? null,
    value: expression?.value ?? expression?.all ?? null,
    scope: scopeOf(rule),
    stage: rule.stage,
    // The package carries no scoring table, so no score is invented here.
    score: null,
    maxScore: null,
    relatedExceptionRuleIds,
    warnings,
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

export function buildAssessmentReviewSeed(
  pkg: ImportPackage,
  annotation: ReviewSeedAnnotation,
  options: BuildAssessmentReviewSeedOptions = {},
): RuleReviewWorkspaceSeed {
  assertAnnotationMatches(pkg, annotation);
  const allKeys = new Set(pkg.rules.map(rule => rule.ruleKey));
  const source = options.ruleKeys
    ? options.ruleKeys.map(key => {
      const rule = pkg.rules.find(item => item.ruleKey === key);
      if (!rule) throw new Error(`REVIEW_RULE_NOT_FOUND:${key}`);
      return rule;
    })
    : pkg.rules;
  const blockersByKey = new Map<string, CriticalBlockerCode[]>();
  for (const item of annotation.safetyBlockers) blockersByKey.set(item.ruleKey, [...new Set([...(blockersByKey.get(item.ruleKey) ?? []), ...item.codes])]);

  const rules: RuleReviewSeed[] = source.map(rule => {
    const concept = conceptOf(rule.ruleKey);
    const category = reviewCategoryOf(rule);
    const related = [
      ...(CONCEPT_EXCEPTIONS[concept] ?? []).map(exception => `${rule.supplyType}.${exception}`).filter(key => allKeys.has(key)),
      ...annotation.exceptions.filter(item => item.ruleKey === rule.ruleKey).map(item => item.exceptionRuleKey),
    ];
    const warnings = [
      ...(CONCEPT_WARNINGS[concept] ? [CONCEPT_WARNINGS[concept]] : []),
      ...annotation.warnings.filter(item => item.ruleKey === rule.ruleKey).map(item => item.message),
    ];
    const safetyBlockers = blockersByKey.get(rule.ruleKey) ?? [];
    const critical = !NON_CRITICAL_CONCEPTS.has(concept);
    return {
      ruleId: rule.ruleKey,
      ruleVersionId: pkg.ruleSet.id,
      critical,
      // Exceptions qualify other rules instead of standing as their own requirement.
      required: critical && category !== 'EXCEPTION',
      candidateStatus: safetyBlockers.length > 0 || category === 'EXCEPTION' ? 'REVIEW_REQUIRED' : 'AUTO_SAFE_CANDIDATE',
      safetyBlockers,
      originalCandidate: snapshot(rule, [...new Set(related)], [...new Set(warnings)]),
    };
  });

  const evidenceOf = (ruleKey: string) => {
    const rule = pkg.rules.find(item => item.ruleKey === ruleKey);
    if (!rule) throw new Error(`REVIEW_ANNOTATION_UNKNOWN_RULE:${ruleKey}`);
    return rule.evidence.id;
  };

  const requiredCategories: { supplyType: string; category: CriticalCategory }[] = [];
  for (const rule of rules) {
    if (!rule.required) continue;
    const { supplyType, category } = rule.originalCandidate;
    if (!requiredCategories.some(item => item.supplyType === supplyType && item.category === category)) {
      requiredCategories.push({ supplyType, category });
    }
  }

  return {
    ruleVersionId: pkg.ruleSet.id,
    announcement: { id: pkg.announcement.id, title: pkg.announcement.title },
    document: {
      id: pkg.document.id,
      fileName: pkg.document.fileName,
      sha256: pkg.document.sha256,
      versionLabel: pkg.document.versionLabel,
    },
    sourceStatus: pkg.ruleSet.sourceStatus,
    version: pkg.ruleSet.version,
    rules,
    conflicts: annotation.conflicts.map(conflict => ({
      conflictId: conflict.conflictId,
      concept: conflict.concept,
      candidateRuleIds: [...conflict.candidateRuleKeys],
      candidates: conflict.candidates.map(candidate => ({
        candidateId: candidate.candidateId,
        value: structuredClone(candidate.value),
        evidenceIds: [...new Set(candidate.evidenceRuleKeys.map(evidenceOf))],
      })),
    })),
    unresolvedItems: annotation.unresolved.map(item => ({
      unresolvedId: item.unresolvedId,
      type: item.type,
      description: item.description,
      ruleIds: [...item.ruleKeys],
    })),
    requiredCategories,
  };
}
