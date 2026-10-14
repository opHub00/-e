import { SAMDO_DEEP_RULE_PACKAGE } from './samdo/rulePackage.ts';

/** 행사 사용자 경로는 이 공고 하나만 다룬다. 다공고 기능은 일반 제품/QA 경로에 그대로 남겨 둔다. */
export const SAMDO_EVENT = {
  listingId: SAMDO_DEEP_RULE_PACKAGE.listingId,
  title: '삼도이동 1지구 토지임대부 공공분양주택',
  shortTitle: '삼도이동 1지구',
  contextLabel: '삼도이동 1지구 자격 분석',
  resultPath: '/event/samdo',
  inventory: SAMDO_DEEP_RULE_PACKAGE.inventory,
  applicationDates: SAMDO_DEEP_RULE_PACKAGE.applicationDates,
  recommendationSupplies: SAMDO_DEEP_RULE_PACKAGE.supplies
    .filter(supply => supply.autoRecommend)
    .map(supply => ({ type: supply.supplyType, label: supply.label, count: supply.supplyCount })),
  informationOnlySupplies: SAMDO_DEEP_RULE_PACKAGE.supplies
    .filter(supply => !supply.autoRecommend)
    .map(supply => ({ type: supply.supplyType, label: supply.label, count: supply.supplyCount })),
} as const;

export const SAMDO_EVENT_COPY = {
  eyebrow: '삼도이동 1지구 청약 자격분석',
  landingTitle: '나에게 가장 유리한 신청유형을 확인해보세요',
  landingSubtitle: '삼도이동 1지구 토지임대부 공공분양주택의 청년·신혼부부·신생아·생애최초·일반공급 조건을 한 번에 비교해드려요.',
  landingCta: '내 신청유형 분석하기',
  introTitle: '공고문은 하나지만\n신청 방법은 여러 개입니다.',
  introSteps: [
    '내 조건과 필요한 확인사항을 입력하고',
    '청년·신혼부부·신생아·생애최초·일반공급 자격을 검증한 뒤',
    '가장 유리한 신청유형과 근거·대안·확인할 항목을 안내합니다.',
  ],
} as const;

