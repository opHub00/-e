import { validateImportPackage } from '../applicationAssessment/server/importPackage.ts';
import { assessApplication } from '../applicationAssessment/engine.ts';
import type { ApplicationAssessmentResult, Evidence } from '../applicationAssessment/types.ts';
import type { Assessment, NoticeAdapter, NoticeSupplyAssessment, Rule } from './types.ts';

const status = (value: ApplicationAssessmentResult): NoticeSupplyAssessment['eligibility'] =>
  value.status === 'ELIGIBLE' ? 'ELIGIBLE' : value.status === 'INELIGIBLE' ? 'INELIGIBLE' : 'CONDITIONAL';

const mapResult = (value: ApplicationAssessmentResult): NoticeSupplyAssessment => ({
  supplyTypeId: value.supplyType.toUpperCase(), supplyTypeLabel: value.supplyType,
  eligibility: status(value), priorityStage: value.stage, priorityLabel: value.stageExplanation,
  officialScore: value.scoring === 'AVAILABLE' && value.score
    ? { status: 'AVAILABLE', total: value.score.total, max: value.score.max,
      breakdown: value.score.breakdown.map(item => ({ label: item.label, points: item.points, max: item.max, evidenceId: item.evidenceId })) }
    : value.scoring === 'PENDING' ? { status: 'PENDING' } : { status: 'NOT_APPLICABLE' },
  // The import package has no unit allocation: zero means "not supplied", never a winning chance.
  supplyCount: 0, applicationDate: '',
  matchedAdvantages: value.satisfiedConditions.map(item => item.label),
  cautions: [...value.warnings], evidenceRequired: [...value.requiredDocuments],
  reasons: [value.stageExplanation].filter(Boolean), failedReasons: value.failedConditions.map(item => item.label),
  missingInformation: [...value.missingInformation], evidence: structuredClone(value.evidence),
  autoRecommend: true, rank: 0,
});

/** Import is structural only: source verification never implies review approval or publication. */
export function createImportedPackageAdapter(raw: unknown, candidate?: {
  announcementId: string; documentSha256: string; ruleSetVersion: string; reviewBlockers: readonly string[];
}): NoticeAdapter {
  const { package: pkg, rules } = validateImportPackage(raw);
  if (candidate && (candidate.announcementId !== pkg.announcement.id || candidate.documentSha256 !== pkg.document.sha256 ||
    candidate.ruleSetVersion !== pkg.ruleSet.version)) throw new Error('REVIEW_CANDIDATE_IDENTITY_MISMATCH');
  // Versions of one notice family coexist; no imported candidate replaces another by ID.
  const noticeId = `import-${pkg.announcement.id}-${pkg.ruleSet.id}`.toLowerCase();
  const evidence = new Map<string, Evidence>();
  for (const supply of rules.supplies) {
    for (const rule of [...supply.eligibility, ...supply.stages.flatMap(stage => [...stage.conditions, ...(stage.scores ?? [])])]) evidence.set(rule.evidence.id, rule.evidence);
  }
  const ruleRows: Rule[] = pkg.rules.map(row => ({
    id: row.ruleKey, type: row.category, supplyTypeId: row.supplyType.toUpperCase(),
    label: row.evidence.label, evidence: evidence.get(row.evidence.id)!, isScoreRule: row.category === 'SCORE',
  }));
  const date = `${pkg.announcement.announcementDate}T00:00:00+09:00`;
  const notice: NoticeAdapter['notice'] = {
    id: noticeId, title: pkg.announcement.title, managementNumber: pkg.announcement.housingManagementNumber ?? '',
    listing: { id: rules.listingId, complexId: noticeId, title: pkg.announcement.title, address: '', region: pkg.announcement.regionName },
    complex: { id: noticeId, name: pkg.announcement.title, region: pkg.announcement.regionName, address: '' },
    noticeDate: pkg.announcement.announcementDate, status: candidate ? 'REVIEW_REQUIRED' : 'DRAFT',
    sourceDocument: { fileName: pkg.document.fileName, sha256: pkg.document.sha256, official: pkg.document.isOfficial },
    supplyTypes: rules.supplies.map(supply => ({ id: supply.type.toUpperCase(), label: supply.type, supplyCount: 0, assessmentMode: 'RULE_ENGINE' })),
    createdAt: date, updatedAt: date, activatedAt: null,
  };
  return {
    notice,
    rulePackage: { id: pkg.ruleSet.id, noticeId, version: pkg.ruleSet.version, sourceStatus: pkg.ruleSet.sourceStatus,
      status: 'DRAFT', sourceHash: pkg.document.sha256, rules: ruleRows,
      // Structural validity is not a review decision. The existing Admin service
      // refuses approval while validationErrors remain, including this marker.
      validationErrors: [candidate ? 'REVIEW_CANDIDATE_NOT_APPROVED' : 'SOURCE_REVIEW_REQUIRED', ...(candidate?.reviewBlockers ?? [])],
      createdAt: date, updatedAt: date },
    lifecycle: { sourceVerificationState: pkg.ruleSet.sourceStatus === 'REFERENCE' ? 'UNVERIFIED' : 'SOURCE_VERIFIED',
      reviewStatus: candidate ? 'REVIEW_REQUIRED' : 'DRAFT', publicationStatus: 'INACTIVE' },
    binding: { noticeId, rulePackageId: pkg.ruleSet.id, sourceHash: pkg.document.sha256, status: 'INACTIVE' },
    reviewBlockers: candidate ? [...candidate.reviewBlockers] : [],
    ragSource: { id: `${noticeId}-rag`, noticeId, version: pkg.ruleSet.version, sourceHash: pkg.document.sha256,
      chunks: pkg.rules.flatMap(row => row.evidence.textExcerpt ? [{ id: row.evidence.id, section: row.evidence.section,
        kind: row.evidence.tableLabel ? 'table' as const : 'paragraph' as const, supplyTypeIds: [row.supplyType.toUpperCase()],
        textExcerpt: row.evidence.textExcerpt, locator: structuredClone(row.evidence.locator) }] : []) },
    assess: profile => {
      const evaluations = assessApplication(rules, profile, rules.listingId).map(mapResult);
      const viable = evaluations.filter(item => item.eligibility !== 'INELIGIBLE');
      const recommended = viable.find(item => item.eligibility === 'ELIGIBLE') ?? viable[0] ?? null;
      const assessment: Assessment = { noticeId, listingId: rules.listingId, rulePackageId: pkg.ruleSet.id,
        rulePackageVersion: pkg.ruleSet.version, sourceStatus: pkg.ruleSet.sourceStatus, evaluations,
        recommendation: { recommended, alternatives: viable.filter(item => item !== recommended), lowerPriority: [],
          rejected: evaluations.filter(item => item.eligibility === 'INELIGIBLE'), informationOnly: [] },
        requiredDocuments: [...new Set(evaluations.flatMap(item => item.evidenceRequired))],
        unresolvedFacts: [...new Set(evaluations.flatMap(item => item.missingInformation))].map(key => ({
          id: key, label: '확인 필요', state: 'UNKNOWN', affectedSupplyTypeIds: evaluations.filter(item => item.missingInformation.includes(key)).map(item => item.supplyTypeId),
          question: '해당 자격 요건을 확인해 주세요.', reason: '공고문 기준 판정에 필요한 정보가 없습니다.', evidenceNeeded: '공고문과 증빙서류 확인',
        })),
      };
      return assessment;
    },
  };
}
