import type {
  SamdoEligibility,
  SamdoOfficialScore,
  SamdoPresentationItem,
  SamdoPresentationRecommendation,
  SamdoRecommendation,
  SamdoRecommendationItem,
  SamdoStage,
  SamdoSupplyType,
} from './types.ts';

export const SAMDO_ELIGIBILITY_LABELS: Record<SamdoEligibility, string> = {
  ELIGIBLE: '신청 가능',
  CONDITIONAL: '정보 추가 확인',
  INELIGIBLE: '신청 불가',
  EVIDENCE_REQUIRED: '서류 확인 필요',
};

export const SAMDO_SUPPLY_LABELS: Record<SamdoSupplyType, string> = {
  YOUTH: '청년 특별공급',
  NEWLYWED: '신혼부부 특별공급',
  FIRST_HOME: '생애최초 특별공급',
  NEWBORN: '신생아 특별공급',
  GENERAL: '일반공급',
  INSTITUTIONAL_RECOMMENDATION: '기관추천 특별공급',
};

export const SAMDO_STAGE_LABELS: Record<SamdoStage, string> = {
  PRIORITY: '우선공급',
  GENERAL: '일반공급 단계',
  LOTTERY: '추첨공급',
  NEWBORN_PRIORITY: '신생아 우선공급',
  FIRST_RANK_PRIORITY: '1순위 우선공급',
  SECOND_RANK: '2순위',
  INFORMATION_ONLY: '정보 제공만',
};

export const SAMDO_OFFICIAL_SCORE_LABELS: Record<SamdoOfficialScore['status'], string> = {
  AVAILABLE: '공식 가점',
  NOT_APPLICABLE: '공식 점수 해당 없음',
  PENDING: '공식 가점 계산 전',
};

const presentItem = ({ missingFacts: _internal, ...item }: SamdoRecommendationItem): SamdoPresentationItem => item;

/** Result screens receive only display-ready copy; adaptive fact keys stay in the internal recommendation. */
export function toSamdoPresentationRecommendation(result: SamdoRecommendation): SamdoPresentationRecommendation {
  return {
    listingId: result.listingId,
    sourceStatus: result.sourceStatus,
    recommendedType: result.recommendedType ? presentItem(result.recommendedType) : null,
    alternatives: result.alternatives.map(presentItem),
    lowerPriorityTypes: result.lowerPriorityTypes.map(presentItem),
    rejectedTypes: result.rejectedTypes.map(presentItem),
    informationOnlyTypes: result.informationOnlyTypes.map(presentItem),
    evaluations: result.evaluations.map(presentItem),
  };
}
