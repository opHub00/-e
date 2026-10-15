import type { Evidence } from '../../applicationAssessment/types.ts';
import type { SamdoDeepRulePackage, SamdoRuleCategory, SamdoRuleSummary, SamdoSupplyType } from './types.ts';

const FILE = '(최종1.8)삼도이동 1지구 토지임대부 분양주택 입주자모집공고문.hwp';
const HASH = '5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2';
const DOCUMENT_ID = '18f88d9e-b4a4-4cf1-97e1-8b1838e81d01';

function evidence(id: string, section: string, paragraphs: string, excerpt: string, tableLabel?: string): Evidence {
  return {
    id,
    source: FILE,
    section,
    label: `${section} (${paragraphs})`,
    documentId: DOCUMENT_ID,
    tableLabel,
    textExcerpt: excerpt,
    locator: { parser: 'HWP5_RECORDS', paragraphRange: paragraphs, sha256: HASH },
  };
}

const FINAL_PARAGRAPHS: Record<SamdoSupplyType, Partial<Record<SamdoRuleCategory, string>>> = {
  YOUTH: { APPLICANT: '1568-1579', NO_HOME: '1568-1579', SUBSCRIPTION: '1570', INCOME: '1578-1579', ASSETS: '923-926,996-1009', RESTRICTION: '1702-1703', SPECIAL_SUPPLY_HISTORY: '1702-1703', STAGE: '1584-1692', SCORE: '1592-1692' },
  NEWLYWED: { APPLICANT: '1713-1718', HOUSEHOLD: '1713-1718,1949', SUBSCRIPTION: '1716', ASSETS: '906-926,1000-1009', RESTRICTION: '1956-1963', SPECIAL_SUPPLY_HISTORY: '1956-1963', CHILD_BIRTH: '224-233,1495-1528', STAGE: '1827-1944', SCORE: '1830-1922' },
  FIRST_HOME: { APPLICANT: '1974-1979', HOUSING_HISTORY: '151,1974', SUBSCRIPTION: '1975', INCOME: '1976-1979,2045-2051', ASSETS: '906-926,1000-1009', RESTRICTION: '2062-2063', SPECIAL_SUPPLY_HISTORY: '2062-2063', STAGE: '2045-2051' },
  NEWBORN: { RESIDENCE: '308,783-788', CHILD_BIRTH: '2080-2084', NO_HOME: '2080-2084', SUBSCRIPTION: '2081', INCOME: '2149-2152', ASSETS: '906-926,1000-1009', RESTRICTION: '2254-2259', SPECIAL_SUPPLY_HISTORY: '2254-2259', STAGE: '2149-2244', SCORE: '2156-2239' },
  GENERAL: { RESIDENCE: '308,783-788', NO_HOME: '2269-2272', SUBSCRIPTION: '2270,2343-2345', INCOME: '2337-2364', ASSETS: '906-926,1000-1009', RESTRICTION: '2376,2392-2401', STAGE: '2336-2365', SCORE: '2346-2359' },
  INSTITUTIONAL_RECOMMENDATION: {},
};

const common = (type: SamdoSupplyType, category: SamdoRuleCategory, label: string, paragraphs: string, excerpt: string): SamdoRuleSummary => ({
  id: `samdo.deep.${type.toLowerCase()}.${category.toLowerCase()}`,
  category,
  label,
  evidence: evidence(`samdo.deep.ev.${type.toLowerCase()}.${category.toLowerCase()}`, `${type} 신청자격`, FINAL_PARAGRAPHS[type][category] ?? paragraphs, excerpt),
});

const restriction = (type: SamdoSupplyType) => common(type, 'RESTRICTION', '재당첨 제한 및 부적격 당첨 제한 기간이 아니어야 해요.', '2737-2743', '재당첨 제한기간 또는 부적격 당첨 제한기간 내인 신청자·세대는 신청할 수 없습니다.');
const residence = (type: SamdoSupplyType) => common(type, 'RESIDENCE', '공고일 현재 제주특별자치도에 거주해야 해요.', type === 'NEWBORN' ? '2392-2394' : '2607-2609', '입주자모집공고일 현재 제주특별자치도에 거주해야 합니다.');
const assets = (type: SamdoSupplyType) => common(type, 'ASSETS', '세대 총자산이 공고 기준 이하여야 해요.', '1190-1219', '신혼부부·생애최초·신생아·일반공급은 무주택세대구성원 전원의 총자산을 검증하며 기본 기준은 362백만원 이하입니다.');

export const SAMDO_DEEP_RULE_PACKAGE: SamdoDeepRulePackage = {
  id: 'samdo-1-deep-analysis-final-1.8',
  baseRuleSetId: '18f88d9e-b4a4-4cf1-97e1-8b1838e81c01',
  announcementId: '18f88d9e-b4a4-4cf1-97e1-8b1838e81a01',
  version: 'FINAL-1.8-user-source-1',
  listingId: 'samdo-1-2026-final-1.8',
  title: '삼도이동 1지구 토지임대부 분양주택',
  sourceStatus: 'DRAFT_SOURCE_VERIFIED',
  announcementDate: '2026-10-27',
  applicationDates: { special: '2026-11-16', generalFirst: '2026-11-17', generalSecond: '2026-11-18' },
  schedule: {
    special: '2026-11-16', generalFirst: '2026-11-17', generalSecond: '2026-11-18', winnerAnnouncement: '2026-11-24',
    documentSubmission: { start: '2026-11-30', end: '2026-12-04' },
    contract: { start: '2027-01-25', end: '2027-01-29' },
  },
  document: { id: DOCUMENT_ID, fileName: FILE, sha256: HASH, isOfficial: false },
  inventory: { total: 32, units49: 8, units59: 24, special: 26, general: 6 },
  supplies: [
    {
      supplyType: 'YOUTH', label: '청년 특별공급', supplyCount: 5, autoRecommend: true, assessmentMode: 'RULE_ENGINE',
      rules: [
        common('YOUTH', 'APPLICANT', '만 19세 이상 39세 이하 미혼 청년이어야 해요.', '1882-1898', '청년 특별공급 신청자격과 연령·혼인 기준'),
        common('YOUTH', 'NO_HOME', '신청자 본인이 현재와 과거 모두 무주택이어야 해요.', '1882-1898', '신청자 본인의 무주택 및 과거 소유 이력을 검증합니다.'),
        common('YOUTH', 'SUBSCRIPTION', '청약통장 6개월·6회 이상이 필요해요.', '1882-1898', '입주자저축 가입 6개월 및 6회 이상 납입'),
        common('YOUTH', 'INCOME', '신청자 월평균소득이 공고 기준 이하여야 해요.', '1325-1357', '청년 소득기준은 신청자 본인을 대상으로 합니다.'),
        common('YOUTH', 'ASSETS', '본인 2억7,600만원, 부모 10억3,500만원 이하의 자산기준을 확인해요.', '923-926,996-1009', '청년은 신청자 본인과 부모 자산을 각각 검증합니다.'),
        restriction('YOUTH'),
        common('YOUTH', 'SPECIAL_SUPPLY_HISTORY', '과거 특별공급 당첨 이력이 없어야 해요.', '289-292', '청년 특별공급은 신청자 본인의 특별공급 당첨 이력을 확인합니다.'),
        common('YOUTH', 'STAGE', '소득활동과 소득세 납부기간으로 우선공급 여부를 구분해요.', '1920-1969', '우선공급과 일반공급을 구분합니다.'),
        common('YOUTH', 'SCORE', '소득·제주 거주기간·납입횟수·소득세 납부기간을 공식 가점으로 계산해요.', '1934-2008', '청년 특별공급 우선·일반공급 가점표'),
      ],
    },
    {
      supplyType: 'NEWLYWED', label: '신혼부부 특별공급', supplyCount: 5, autoRecommend: true, assessmentMode: 'RULE_ENGINE',
      rules: [
        common('NEWLYWED', 'APPLICANT', '혼인 7년 이내, 예비신혼부부 또는 자격 있는 한부모가족이어야 해요.', '2024-2095', '신혼부부 특별공급 신청자격'),
        common('NEWLYWED', 'HOUSEHOLD', '혼인으로 구성될 세대를 포함해 자격을 검증해요.', '175-191', '예비신혼부부는 혼인으로 구성될 세대를 검증합니다.'),
        common('NEWLYWED', 'SUBSCRIPTION', '청약통장 6개월·6회 이상이 필요해요.', '2024-2095', '입주자저축 가입 6개월 및 6회 이상 납입'),
        assets('NEWLYWED'), restriction('NEWLYWED'),
        common('NEWLYWED', 'SPECIAL_SUPPLY_HISTORY', '세대의 특별공급 당첨 이력을 확인해요.', '289-292', '신혼부부 특별공급은 신청자와 세대의 특별공급 이력을 확인합니다.'),
        common('NEWLYWED', 'CHILD_BIRTH', '자녀·태아·입양 및 출산특례는 증빙으로 확인해요.', '242-249', '혼인·출산특례와 기존 주택 처분 조건'),
        common('NEWLYWED', 'STAGE', '혼인·자녀 연령과 소득으로 우선·일반·추첨 단계를 구분해요.', '2160-2266', '신혼부부 3단계 선정방법'),
        common('NEWLYWED', 'SCORE', '단계별 공식 가점표를 적용해요.', '2170-2249', '신혼부부 특별공급 가점표'),
      ],
    },
    {
      supplyType: 'FIRST_HOME', label: '생애최초 특별공급', supplyCount: 5, autoRecommend: true, assessmentMode: 'RULE_ENGINE',
      rules: [
        common('FIRST_HOME', 'HOUSING_HISTORY', '세대구성원 전원이 과거 주택을 소유한 사실이 없어야 해요.', '171-176', '생애최초는 세대구성원 전원의 과거 주택소유를 검증합니다.'),
        common('FIRST_HOME', 'SUBSCRIPTION', '1순위, 6개월·6회, 저축총액 600만원 이상을 확인해요.', '2280-2335', '생애최초 특별공급 청약통장 기준'),
        common('FIRST_HOME', 'APPLICANT', '세대주이며 혼인 중이거나 미혼 자녀가 있어야 해요.', '2280-2335', '생애최초 특별공급 신청자격'),
        common('FIRST_HOME', 'INCOME', '5년 이상 소득세 납부와 세대소득 기준을 확인해요.', '2280-2374', '소득세 납부 및 단계별 소득기준'),
        assets('FIRST_HOME'), restriction('FIRST_HOME'),
        common('FIRST_HOME', 'SPECIAL_SUPPLY_HISTORY', '세대의 특별공급 당첨 이력을 확인해요.', '289-292', '생애최초 특별공급은 세대의 특별공급 이력을 확인합니다.'),
        common('FIRST_HOME', 'STAGE', '소득으로 우선·일반·추첨 단계를 구분해요.', '2355-2374', '생애최초 3단계 선정방법'),
      ],
    },
    {
      supplyType: 'NEWBORN', label: '신생아 특별공급', supplyCount: 11, autoRecommend: true, assessmentMode: 'DEDICATED',
      rules: [
        residence('NEWBORN'),
        common('NEWBORN', 'CHILD_BIRTH', '공고일 현재 2세 미만 자녀(태아 포함)가 있어야 해요.', '2392-2399', '2세 미만 자녀의 출생·입양·임신 및 양육 증빙을 확인합니다.'),
        common('NEWBORN', 'NO_HOME', '세대구성원 전원이 무주택이어야 해요.', '2392-2402', '신생아 특별공급 무주택세대구성원 기준'),
        common('NEWBORN', 'SUBSCRIPTION', '청약통장 6개월·6회 이상이 필요해요.', '2400-2402', '입주자저축 가입 6개월 및 6회 이상 납입'),
        common('NEWBORN', 'INCOME', '세대 월평균소득이 단계별 기준 이하여야 해요.', '2402-2462', '신생아 특별공급 소득기준'),
        assets('NEWBORN'), restriction('NEWBORN'),
        common('NEWBORN', 'SPECIAL_SUPPLY_HISTORY', '세대의 특별공급 당첨 이력을 확인해요.', '2572-2578', '특별공급 이력과 출산특례'),
        common('NEWBORN', 'STAGE', '70% 우선·20% 일반·잔여 추첨 단계로 구분해요.', '2466-2473,2562-2563', '신생아 특별공급 3단계 선정방법'),
        common('NEWBORN', 'SCORE', '소득·미성년 자녀·제주 거주기간·납입횟수를 12점 만점으로 계산해요.', '2473-2556', '신생아 특별공급 우선·일반공급 가점표'),
      ],
    },
    {
      supplyType: 'GENERAL', label: '일반공급', supplyCount: 6, autoRecommend: true, assessmentMode: 'DEDICATED',
      rules: [
        residence('GENERAL'),
        common('GENERAL', 'NO_HOME', '세대구성원 전원이 무주택이어야 해요.', '2607-2611', '일반공급 무주택세대구성원 기준'),
        common('GENERAL', 'SUBSCRIPTION', '청약통장 가입이 필요하고, 1순위는 6개월·6회·세대주·5년 무당첨을 확인해요.', '2678-2687', '일반공급 순위별 자격요건'),
        common('GENERAL', 'INCOME', '세대 월평균소득이 단계별 기준 이하여야 해요.', '2611-2670', '일반공급 소득기준'),
        assets('GENERAL'), restriction('GENERAL'),
        common('GENERAL', 'STAGE', '신생아 우선 50%·1순위 우선 30%·잔여 추첨으로 구분해요.', '2674-2707', '일반공급 3단계 선정방법'),
        common('GENERAL', 'SCORE', '공식 점수는 없고, 1순위 경쟁 시 무주택 3년 이상과 저축총액 순차를 적용해요.', '2688-2704', '1순위 내 동일지역 경쟁 시 당첨자 선정순차'),
      ],
    },
  ],
};

export const SAMDO_EVIDENCE = {
  newbornEligibility: SAMDO_DEEP_RULE_PACKAGE.supplies.find(item => item.supplyType === 'NEWBORN')!.rules[1].evidence,
  newbornScore: SAMDO_DEEP_RULE_PACKAGE.supplies.find(item => item.supplyType === 'NEWBORN')!.rules.at(-1)!.evidence,
  generalEligibility: SAMDO_DEEP_RULE_PACKAGE.supplies.find(item => item.supplyType === 'GENERAL')!.rules[1].evidence,
  generalStage: SAMDO_DEEP_RULE_PACKAGE.supplies.find(item => item.supplyType === 'GENERAL')!.rules.at(-2)!.evidence,
  generalSequence: SAMDO_DEEP_RULE_PACKAGE.supplies.find(item => item.supplyType === 'GENERAL')!.rules.at(-1)!.evidence,
} as const;
