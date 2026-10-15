import type { AssessmentInput, Evidence } from '../../applicationAssessment/types.ts';
import { buildSamdoRecommendationForPackage } from '../samdo/evaluate.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage.ts';
import type { SamdoEligibility, SamdoRecommendationItem, SamdoStage, SamdoSupplyType } from '../samdo/types.ts';
import { samdoRules } from '../samdoResult/samdoEvaluate.ts';
import { SAMDO_DISTRICTS } from './config.ts';
import { SAMDO_DISTRICT2_DEEP_RULE_PACKAGE, samdoDistrict2Rules } from './rulePackages.ts';
import type { SamdoChecklistItem, SamdoDistrictAssessment, SamdoDistrictComparison, SamdoDualAssessment, SamdoUnitEconomics } from './types.ts';

const statusWeight: Record<SamdoEligibility, number> = { ELIGIBLE: 4, EVIDENCE_REQUIRED: 3, CONDITIONAL: 2, INELIGIBLE: 0 };
const stageWeight: Record<SamdoStage, number> = {
  PRIORITY: 6, NEWBORN_PRIORITY: 6, FIRST_RANK_PRIORITY: 5, GENERAL: 4, LOTTERY: 3, SECOND_RANK: 2, INFORMATION_ONLY: 0,
};

const officialScore = (item: SamdoRecommendationItem | null): number => item?.officialScore.status === 'AVAILABLE' ? item.officialScore.total : -1;
const evidenceGap = (item: SamdoRecommendationItem | null): number => item ? item.evidenceRequired.length + item.missingFacts.length : Number.MAX_SAFE_INTEGER;
const comparisonItem = (district: SamdoDistrictAssessment): SamdoRecommendationItem | null => district.recommendation.recommendedType ?? district.recommendation.evaluations.find(item => item.autoRecommend) ?? null;

function priceRange(unit: SamdoUnitEconomics): [number, number] {
  const values = unit.prices.map(price => price.priceKrw);
  return [Math.min(...values), Math.max(...values)];
}

function compareDistricts(district1: SamdoDistrictAssessment, district2: SamdoDistrictAssessment): SamdoDistrictComparison {
  const first = comparisonItem(district1);
  const second = comparisonItem(district2);
  const economicContext = district1.district.units.map(unit1 => {
    const unit2 = district2.district.units.find(item => item.unitType === unit1.unitType)!;
    return {
      unitType: unit1.unitType,
      district1: { priceRangeKrw: priceRange(unit1), monthlyLandRentKrw: unit1.monthlyLandRentKrw },
      district2: { priceRangeKrw: priceRange(unit2), monthlyLandRentKrw: unit2.monthlyLandRentKrw },
    };
  });
  const common = { economicContext, disclaimer: '이 비교는 공고문상 자격·공급단계·공식 점수·확인 필요 항목·공급 세대수만 정렬하며, 경쟁률이나 당첨확률을 추정하지 않아요.' };
  if (!first && !second) return { ...common, preferredDistrictId: null, basis: 'NO_RECOMMENDATION', reasons: ['두 지구 모두 비교할 판정 결과가 없어요.'] };

  const criteria: Array<{ basis: SamdoDistrictComparison['basis']; a: number; b: number; reason: (id: 'samdo-1' | 'samdo-2') => string }> = [
    { basis: 'ELIGIBILITY', a: first ? statusWeight[first.eligibility] : -1, b: second ? statusWeight[second.eligibility] : -1, reason: id => `${id === 'samdo-1' ? '1지구' : '2지구'}의 자격 상태가 더 앞서요.` },
    { basis: 'PRIORITY_STAGE', a: first ? stageWeight[first.stage ?? 'INFORMATION_ONLY'] : -1, b: second ? stageWeight[second.stage ?? 'INFORMATION_ONLY'] : -1, reason: id => `${id === 'samdo-1' ? '1지구' : '2지구'}의 공급단계가 더 앞서요.` },
    { basis: 'OFFICIAL_SCORE', a: officialScore(first), b: officialScore(second), reason: id => `${id === 'samdo-1' ? '1지구' : '2지구'}의 공고상 공식 점수가 더 높아요.` },
    { basis: 'EVIDENCE_COMPLETENESS', a: -evidenceGap(first), b: -evidenceGap(second), reason: id => `${id === 'samdo-1' ? '1지구' : '2지구'}에 남은 확인 필요 항목이 더 적어요.` },
    { basis: 'SUPPLY_COUNT', a: first?.supplyCount ?? -1, b: second?.supplyCount ?? -1, reason: id => `${id === 'samdo-1' ? '1지구' : '2지구'}의 해당 공급유형 배정 세대수가 더 많아요. 공급량은 당첨확률을 뜻하지 않아요.` },
  ];
  for (const criterion of criteria) {
    if (criterion.a === criterion.b) continue;
    const preferredDistrictId = criterion.a > criterion.b ? 'samdo-1' : 'samdo-2';
    return { ...common, preferredDistrictId, basis: criterion.basis, reasons: [criterion.reason(preferredDistrictId)] };
  }
  return { ...common, preferredDistrictId: null, basis: 'EQUIVALENT', reasons: ['현재 입력에서는 두 지구의 판정 우선순위가 같아요. 분양가격과 월 토지임대료는 별도 경제조건으로 비교하세요.'] };
}

function ruleEvidence(district: SamdoDistrictAssessment, supplyType: SamdoSupplyType, category: string): Evidence | undefined {
  const pkg = district.district.id === 'samdo-1' ? SAMDO_DEEP_RULE_PACKAGE : SAMDO_DISTRICT2_DEEP_RULE_PACKAGE;
  const rules = pkg.supplies.find(item => item.supplyType === supplyType)?.rules ?? [];
  return rules.find(rule => rule.category === category)?.evidence
    ?? (category === 'RESIDENCE' ? rules.find(rule => rule.category === 'APPLICANT')?.evidence : undefined);
}

function checklist(district: SamdoDistrictAssessment): SamdoChecklistItem[] {
  const active = district.recommendation.evaluations.filter(item => item.autoRecommend && item.eligibility !== 'INELIGIBLE').map(item => item.supplyType);
  const unique = [...new Set(active)];
  const definitions: Array<{ id: string; label: string; category: string; types: SamdoSupplyType[]; condition: string }> = [
    { id: 'residence', label: '주민등록표등본·초본으로 제주 거주 및 거주기간 확인', category: 'RESIDENCE', types: unique, condition: '모든 신청유형' },
    { id: 'subscription', label: '청약홈 순위확인서로 입주자저축 가입기간·납입횟수 확인', category: 'SUBSCRIPTION', types: unique, condition: '모든 신청유형' },
    { id: 'income-assets', label: '소득·자산 보유사실 확인 및 금융정보 제공 동의', category: 'ASSETS', types: unique, condition: '소득·자산 검증 대상' },
    { id: 'family', label: '가족관계·혼인·출생·입양·임신 관계 서류 확인', category: 'CHILD_BIRTH', types: unique.filter(type => ['NEWLYWED', 'NEWBORN', 'FIRST_HOME'].includes(type)), condition: '신혼부부·신생아·생애최초 신청 시' },
    { id: 'history', label: '특별공급 당첨이력 및 재당첨제한 확인', category: 'RESTRICTION', types: unique, condition: '공고상 제한 검증 대상' },
  ];
  return definitions.flatMap(definition => {
    const type = definition.types[0];
    const evidence = type ? ruleEvidence(district, type, definition.category) : undefined;
    return evidence ? [{ ...definition, official: true as const, appliesTo: definition.types, evidence }] : [];
  });
}

export function buildSamdoDualAssessment(input: AssessmentInput): SamdoDualAssessment {
  const district1: SamdoDistrictAssessment = {
    district: SAMDO_DISTRICTS['samdo-1'],
    recommendation: buildSamdoRecommendationForPackage(samdoRules(), input, SAMDO_DEEP_RULE_PACKAGE),
    checklist: [], specialProvisions: [],
  };
  const district2: SamdoDistrictAssessment = {
    district: SAMDO_DISTRICTS['samdo-2'],
    recommendation: buildSamdoRecommendationForPackage(samdoDistrict2Rules(), input, SAMDO_DISTRICT2_DEEP_RULE_PACKAGE),
    checklist: [], specialProvisions: [],
  };
  district1.checklist = checklist(district1);
  district2.checklist = checklist(district2);
  for (const district of [district1, district2]) {
    const grouped = new Map<string, Set<SamdoSupplyType>>();
    for (const evaluation of district.recommendation.evaluations) for (const label of evaluation.evidenceRequired.filter(item => item.startsWith('특례:'))) {
      const types = grouped.get(label) ?? new Set<SamdoSupplyType>();
      types.add(evaluation.supplyType);
      grouped.set(label, types);
    }
    district.specialProvisions = [...grouped].map(([label, types]) => ({ label: label.replace(/^특례:\s*/, ''), supplyTypes: [...types], status: 'EVIDENCE_REQUIRED' as const }));
  }
  return { schemaVersion: 1, districts: [district1, district2], comparison: compareDistricts(district1, district2) };
}
