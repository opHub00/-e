/**
 * LEGACY / REFERENCE_ONLY — structural sample of one announcement (삼도이동 1지구).
 *
 * This is not the runtime rule source. Real announcements are loaded from the
 * rule registry (import package → review → activation → listing binding). The
 * sample is reachable only by explicitly selecting REFERENCE_LISTING_ID and is
 * always labelled 원문 확인 전. Keep announcement-specific wording in this folder.
 */
import type { AnnouncementRules, ConditionRule, Evidence, Expression, ScoreRule } from '../types.ts';

export const REFERENCE_LISTING_ID = 'reference:samdo-2-1';
const evidence = (id: string, label: string): Evidence => ({ id: `samdo:${id}`, source: '삼도이동 1지구 · 공고 원문 확인 전', section: id.split('.')[0], label });
const eq = (fact: string, value: string | boolean): Expression => ({ fact, op: 'eq', value });
const limit = (fact: string, op: 'gte' | 'lte', parameter: string): Expression => ({ fact, op, value: { parameter } });
const rule = (id: string, label: string, expression: Expression, documents: string[]): ConditionRule => ({ id, label, expression, documents, evidence: evidence(id, label) });
const score = (id: string, label: string, fact: string): ScoreRule => ({ id, label, fact, bands: null, evidence: evidence(id, label) });
const income = (prefix: string): Expression => ({ any: [
  { all: [eq('dualIncome', false), limit('householdIncome', 'lte', `${prefix}.singleIncome`)] },
  { all: [eq('dualIncome', true), limit('householdIncome', 'lte', `${prefix}.dualIncome`)] },
] });
const common = (prefix: string): ConditionRule[] => [
  rule(`${prefix}.region`, '공고 기준일의 제주 거주', eq('residence', '제주특별자치도'), ['주민등록표 초본(주소 변동 포함)']),
  rule(`${prefix}.account`, '청약통장 보유·가입기간·납입인정횟수', { all: [eq('hasAccount', true), limit('accountMonths', 'gte', `${prefix}.accountMonths`), limit('recognizedPaymentCount', 'gte', `${prefix}.payments`)] }, ['청약통장 가입확인서·순위확인서']),
  rule(`${prefix}.restriction`, '특별공급·재당첨 제한 확인', { all: [eq('noSpecialRestriction', true), eq('noSpecialSupplyHistory', true), eq('noReWinningRestriction', true)] }, ['청약 제한사항 확인자료']),
  { ...rule(`${prefix}.exceptions`, '별도 특례 적용 여부 확인', eq('exceptionsClear', true), ['특례 적용 시 해당 증빙']), onFailure: 'REVIEW' },
];
const youthScores = (stage: string) => [
  score(`youth.${stage}.income`, '본인 월평균소득', 'monthlyIncome'),
  score(`youth.${stage}.residence`, '제주 연속거주기간(개월)', 'residenceMonths'),
  score(`youth.${stage}.payments`, '청약저축 납입인정횟수', 'recognizedPaymentCount'),
];
const newlywedScores = (stage: string) => [
  score(`newlywed.${stage}.residence`, '제주 연속거주기간(개월)', 'residenceMonths'),
  score(`newlywed.${stage}.payments`, '청약저축 납입인정횟수', 'recognizedPaymentCount'),
];

/** Structural reference only. No guessed dates, eligibility thresholds, or scoring tables. */
export const samdoReferenceRules: AnnouncementRules = {
  id: 'samdo-application-assessment', version: 'reference-1', listingId: REFERENCE_LISTING_ID,
  title: '삼도이동 1지구 토지임대부 공공분양주택', verification: 'REFERENCE_ONLY', announcementDate: null,
  parameters: Object.fromEntries([
    'youth.ageMin', 'youth.ageMax', 'youth.accountMonths', 'youth.payments', 'youth.income', 'youth.assets', 'youth.parentAssets', 'youth.workPeriodBasis',
    'newlywed.accountMonths', 'newlywed.payments', 'newlywed.marriageMonths', 'newlywed.childMonths', 'newlywed.singleIncome', 'newlywed.dualIncome', 'newlywed.assets',
    'firstHome.accountMonths', 'firstHome.payments', 'firstHome.deposit', 'firstHome.taxYears', 'firstHome.singleIncome', 'firstHome.dualIncome', 'firstHome.assets',
    'firstHome.priority.singleIncome', 'firstHome.priority.dualIncome', 'firstHome.general.singleIncome', 'firstHome.general.dualIncome',
  ].map(key => [key, null])),
  supplies: [
    {
      type: 'youth', eligibility: [
        ...common('youth'),
        rule('youth.age', '청년 연령 범위', { all: [limit('age', 'gte', 'youth.ageMin'), limit('age', 'lte', 'youth.ageMax')] }, ['주민등록표 등본']),
        rule('youth.single', '혼인 여부', eq('maritalStatus', 'single'), ['혼인관계증명서(상세)']),
        rule('youth.housing', '본인 현재·과거 주택소유 여부', { all: [eq('noHome', true), eq('neverOwned', true)] }, ['주택소유 이력 확인자료']),
        rule('youth.income', '본인 소득 한도', limit('monthlyIncome', 'lte', 'youth.income'), ['본인 소득 증빙']),
        rule('youth.assets', '본인·부모 자산 한도', { all: [limit('totalAssets', 'lte', 'youth.assets'), limit('parentAssets', 'lte', 'youth.parentAssets')] }, ['본인·부모 자산 증빙', '가족관계증명서(상세)']),
      ], stages: [
        { stage: 'PRIORITY', conditions: [rule('youth.priority.target', '청년 우선공급 별도 대상 조건', eq('youthPriorityTarget', true), ['우선공급 대상 증빙(공고 확인 필요)'])], scores: youthScores('priority') },
        { stage: 'GENERAL', conditions: [], scores: [...youthScores('general'), score('youth.general.work', '근로기간 / 소득세 납부기간(공고 인정 개월)', 'workOrTaxMonths')] },
      ],
    },
    {
      type: 'newlywed', eligibility: [
        ...common('newlywed'),
        rule('newlywed.family', '신혼·예비신혼·한부모 공급대상', { any: [
          { all: [eq('familyCategory', 'married'), eq('maritalStatus', 'married'), limit('marriageMonths', 'lte', 'newlywed.marriageMonths')] },
          { all: [eq('familyCategory', 'engaged'), eq('maritalStatus', 'single')] },
          { all: [eq('familyCategory', 'singleParent'), eq('maritalStatus', 'single'), limit('youngestChildMonths', 'lte', 'newlywed.childMonths')] },
        ] }, ['혼인관계증명서', '가족관계증명서', '예비신혼·한부모 해당 증빙']),
        rule('newlywed.housing', '무주택세대구성원', eq('householdNoHome', true), ['세대원 주택소유 확인자료']),
        rule('newlywed.income', '가구·맞벌이 소득 한도', income('newlywed'), ['세대 소득 증빙', '맞벌이 증빙(해당 시)']),
        rule('newlywed.assets', '세대 자산 한도', limit('totalAssets', 'lte', 'newlywed.assets'), ['세대 자산 증빙']),
      ], stages: [
        { stage: 'PRIORITY', conditions: [rule('newlywed.priority.target', '신혼부부 우선공급 대상 조건', eq('newlywedPriorityTarget', true), ['우선공급 대상 증빙(공고 확인 필요)'])], scores: [score('newlywed.priority.income', '세대 월평균소득', 'householdIncome'), ...newlywedScores('priority')] },
        { stage: 'GENERAL', conditions: [], scores: [score('newlywed.general.children', '미성년 자녀수(출생아)', 'minorChildren'), score('newlywed.general.noHome', '무주택기간(개월)', 'noHomeMonths'), ...newlywedScores('general')] },
      ],
    },
    {
      type: 'firstHome', eligibility: [
        ...common('firstHome'),
        rule('firstHome.housing', '본인·세대의 생애최초 주택 이력', { all: [eq('householdNoHome', true), eq('neverOwned', true), eq('householdNeverOwned', true)] }, ['본인·세대원 주택소유 이력']),
        rule('firstHome.family', '혼인 또는 자녀 조건', { any: [eq('maritalStatus', 'married'), eq('hasChildren', true)] }, ['혼인·가족관계증명서']),
        rule('firstHome.tax', '근로·사업소득 및 소득세 납부기간', { all: [eq('workOrBusinessIncome', true), limit('incomeTaxPaymentYears', 'gte', 'firstHome.taxYears')] }, ['소득금액증명', '소득세 납부 증빙']),
        rule('firstHome.deposit', '청약저축 납입인정금액', limit('recognizedDepositAmount', 'gte', 'firstHome.deposit'), ['청약통장 순위확인서']),
        rule('firstHome.income', '세대 소득 한도', income('firstHome'), ['세대 소득 증빙']),
        rule('firstHome.assets', '세대 자산 한도', limit('totalAssets', 'lte', 'firstHome.assets'), ['세대 자산 증빙']),
      ], stages: [
        { stage: 'PRIORITY', conditions: [rule('firstHome.priority.income', '1단계 소득 기준', income('firstHome.priority'), ['세대 소득 증빙'])], scores: null },
        { stage: 'GENERAL', conditions: [rule('firstHome.general.income', '2단계 소득 기준', income('firstHome.general'), ['세대 소득 증빙'])], scores: null },
        { stage: 'LOTTERY', conditions: [], scores: null },
      ],
    },
  ],
};

/** Explicit ID binding only; names and unrelated real listings never inherit reference rules. */
export function rulesForListing(listingId: string): AnnouncementRules | undefined {
  return listingId === REFERENCE_LISTING_ID ? samdoReferenceRules : undefined;
}
