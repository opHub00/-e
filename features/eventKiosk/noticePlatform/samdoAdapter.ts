import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage.ts';
import type { SamdoDeepRulePackage, SamdoRecommendation, SamdoRecommendationItem } from '../samdo/types.ts';
import { buildSamdoResolutionCenter } from '../samdoResult/samdoRefinement.ts';
import { SAMDO_DISTRICTS } from '../samdoDual/config.ts';
import { buildSamdoDistrictAssessment } from '../samdoDual/evaluate.ts';
import { retrieveSamdoEvidence, samdoRagFingerprint } from '../samdoDual/rag.ts';
import { SAMDO_DISTRICT2_DEEP_RULE_PACKAGE } from '../samdoDual/rulePackages.ts';
import type { SamdoDistrictId } from '../samdoDual/types.ts';
import type { Assessment, Notice, NoticeAdapter, NoticeSupplyAssessment, RAGSource, Rule, RulePackage } from '../../noticePlatform/types.ts';

const timestamp = '2026-10-27T00:00:00+09:00';

function mapSupply(item: SamdoRecommendationItem): NoticeSupplyAssessment {
  return {
    supplyTypeId: item.supplyType,
    supplyTypeLabel: item.supplyLabel,
    eligibility: item.eligibility,
    priorityStage: item.stage,
    priorityLabel: item.stageLabel,
    officialScore: item.officialScore,
    supplyCount: item.supplyCount,
    applicationDate: item.applicationDate,
    matchedAdvantages: [...item.matchedAdvantages],
    cautions: [...item.cautions],
    evidenceRequired: [...item.evidenceRequired],
    reasons: [...item.reasons],
    failedReasons: [...item.failedReasons],
    missingInformation: [...item.missingFacts],
    evidence: structuredClone(item.evidence),
    autoRecommend: item.autoRecommend,
    rank: item.rank,
  };
}

function mapRecommendation(value: SamdoRecommendation) {
  return {
    recommended: value.recommendedType ? mapSupply(value.recommendedType) : null,
    alternatives: value.alternatives.map(mapSupply),
    lowerPriority: value.lowerPriorityTypes.map(mapSupply),
    rejected: value.rejectedTypes.map(mapSupply),
    informationOnly: value.informationOnlyTypes.map(mapSupply),
  };
}

function rulesFromPackage(pkg: SamdoDeepRulePackage): Rule[] {
  return pkg.supplies.flatMap(supply => supply.rules.map(rule => ({
    id: rule.id,
    type: rule.category,
    supplyTypeId: supply.supplyType,
    label: rule.label,
    evidence: structuredClone(rule.evidence),
    isScoreRule: rule.category === 'SCORE',
  })));
}

function noticeFor(id: SamdoDistrictId, pkg: SamdoDeepRulePackage): Notice {
  const district = SAMDO_DISTRICTS[id];
  return {
    id,
    title: district.title,
    managementNumber: district.managementNumber,
    listing: { id: pkg.listingId, complexId: id, title: district.title, address: district.location, region: '제주특별자치도' },
    complex: { id, name: district.title.replace(' 토지임대부 분양주택', ''), region: '제주특별자치도', address: district.location },
    noticeDate: district.announcementDate,
    status: 'ACTIVE',
    sourceDocument: { fileName: district.document.fileName, sha256: district.document.sha256, official: district.document.isOfficial },
    supplyTypes: pkg.supplies.map(supply => ({ id: supply.supplyType, label: supply.label, supplyCount: supply.supplyCount, assessmentMode: supply.assessmentMode })),
    createdAt: timestamp,
    updatedAt: timestamp,
    activatedAt: timestamp,
  };
}

function ragSource(id: SamdoDistrictId): RAGSource {
  const district = SAMDO_DISTRICTS[id];
  const retrieval = retrieveSamdoEvidence(id === 'samdo-1' ? '1지구 공고 자격 가격 일정 토지임대료 서류 해외체류' : '2지구 공고 자격 가격 일정 토지임대료 서류 해외체류', 200);
  return {
    id: `${id}-rag-final-1.8`, noticeId: id, version: 'final-1.8', sourceHash: samdoRagFingerprint,
    chunks: retrieval.chunks.filter(chunk => chunk.districtId === id).map(chunk => ({
      id: chunk.id, section: chunk.section, kind: chunk.kind, supplyTypeIds: [...chunk.supplyTypes], textExcerpt: chunk.textExcerpt,
      locator: structuredClone(chunk.locator),
    })),
  };
}

export function createSamdoNoticeAdapter(id: SamdoDistrictId): NoticeAdapter {
  const pkg = id === 'samdo-1' ? SAMDO_DEEP_RULE_PACKAGE : SAMDO_DISTRICT2_DEEP_RULE_PACKAGE;
  const notice = noticeFor(id, pkg);
  const rulePackage: RulePackage = {
    id: pkg.id, noticeId: id, version: pkg.version, sourceStatus: pkg.sourceStatus, status: 'ACTIVE',
    sourceHash: pkg.document.sha256, rules: rulesFromPackage(pkg), validationErrors: [], createdAt: timestamp, updatedAt: timestamp,
  };
  return {
    notice, rulePackage, ragSource: ragSource(id),
    // Preserve the pre-existing active event adapter; this declaration is not a new approval.
    // Source verification is distinct from whether the underlying HWP is officially published.
    lifecycle: { sourceVerificationState: 'SOURCE_VERIFIED', reviewStatus: 'APPROVED', publicationStatus: 'ACTIVE' },
    binding: { noticeId: id, rulePackageId: rulePackage.id, sourceHash: rulePackage.sourceHash, status: 'ACTIVE' },
    reviewBlockers: [],
    assess: profile => {
      const district = buildSamdoDistrictAssessment(profile, id);
      const recommendation = mapRecommendation(district.recommendation);
      const evaluations = district.recommendation.evaluations.map(mapSupply);
      const unresolved = buildSamdoResolutionCenter(district.recommendation, profile.answerStates ?? {}).map(item => ({
        id: item.id, label: item.label, state: item.currentState, affectedSupplyTypeIds: [...item.affectedSupplyTypes],
        question: item.inputKind === 'DATE' ? `${item.label}의 정확한 날짜를 확인할 수 있나요?` : `${item.label}을(를) 확인할 수 있나요?`,
        reason: item.reason, evidenceNeeded: item.help,
      }));
      const assessment: Assessment = {
        noticeId: id, listingId: notice.listing.id, rulePackageId: rulePackage.id, rulePackageVersion: rulePackage.version,
        sourceStatus: rulePackage.sourceStatus, evaluations, recommendation,
        requiredDocuments: district.checklist.map(item => item.label), unresolvedFacts: unresolved,
      };
      return assessment;
    },
  };
}

export const SAMDO_NOTICE_ADAPTERS = [createSamdoNoticeAdapter('samdo-1'), createSamdoNoticeAdapter('samdo-2')];
