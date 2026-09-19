import { validDate } from './facts.ts';
import type { AssessmentInput, SupplyType } from './types.ts';

type Details = AssessmentInput['details'];
/**
 * 질문 묶음. 한 화면에 30개 가까운 칸이 평평하게 늘어서면 어디까지 답했는지 알 수 없다.
 * 판정 입력 자체는 그대로 두고 표시 순서와 제목만 나눈다.
 */
export const FORM_GROUPS = ['basic', 'residence', 'family', 'housing', 'account', 'income', 'assets', 'announcement'] as const;
export type FormGroup = typeof FORM_GROUPS[number];
export const FORM_GROUP_LABELS: Record<FormGroup, string> = {
  basic: '기본정보', residence: '거주', family: '혼인·자녀', housing: '주택·당첨 이력',
  account: '청약통장', income: '소득', assets: '자산', announcement: '공고를 확인한 경우에만',
};
export const FORM_GROUP_HINTS: Partial<Record<FormGroup, string>> = {
  announcement: '공고 원문에서 직접 확인한 경우에만 답해 주세요. 모르면 비워 두는 편이 정확해요.',
};
export type FormField = { key: keyof Details; label: string; kind: 'date' | 'number' | 'boolean' | 'children' | 'dates'; group: FormGroup; money?: true; supplies?: SupplyType[] };
export const FORM_FIELDS: FormField[] = [
  { key: 'birthDate', label: '생년월일', kind: 'date', group: 'basic' },
  { key: 'isHouseholdHead', label: '공고일 현재 세대주인가요?', kind:'boolean', group: 'basic', supplies:['firstHome'] },
  { key: 'incomeHouseholdSize', label: '공고 소득 산정 가구원수(태아·직계존속 인정기준 확인)', kind: 'number', group: 'basic', supplies: ['newlywed','firstHome'] },
  { key: 'residenceStartDate', label: '제주 연속거주 시작일', kind: 'date', group: 'residence' },
  { key: 'everMarried', label: '과거를 포함해 혼인한 적이 있나요?', kind: 'boolean', group: 'family', supplies:['newlywed'] },
  { key: 'marriageDate', label: '혼인신고일(신혼부부 해당 시)', kind: 'date', group: 'family', supplies: ['newlywed'] },
  { key: 'firstMarriageDate', label: '최초 혼인신고일(혼인 이력이 있을 때)', kind:'date', group: 'family', supplies:['newlywed'] },
  { key: 'plannedMarriageWithinDeadline', label:'예비신혼부부: 공고일부터 1년 이내 또는 앞선 입주일까지 혼인 증명이 가능한가요?', kind:'boolean', group: 'family', supplies:['newlywed'] },
  { key: 'singleParentQualified', label:'한부모: 공고의 한부모가족 자격과 자녀 등재 요건을 충족하나요?', kind:'boolean', group: 'family', supplies:['newlywed'] },
  { key: 'unmarriedChildInHousehold', label:'혼인 중이 아니라면 동일 등본에 미혼 자녀가 있나요?', kind:'boolean', group: 'family', supplies:['firstHome'] },
  { key: 'children', label: '출생 자녀 생년월일(쉼표로 구분, 없으면 없음)', kind: 'children', group: 'family' },
  { key: 'housingDisposalDates', label:'세대원 주택처분일(쉼표로 구분, 이력이 없으면 없음)', kind:'dates', group: 'housing', supplies:['newlywed'] },
  { key: 'noHomeSince', label: '공고에서 인정하는 무주택기간 시작일', kind: 'date', group: 'housing', supplies: ['newlywed'] },
  { key: 'householdNoWinningFiveYears', label: '세대원 전원이 과거 5년 이내 다른 주택의 당첨 이력이 없나요?', kind:'boolean', group: 'housing', supplies:['firstHome'] },
  { key: 'specialSupplyHistory', label: '특별공급 당첨 이력이 있나요?', kind: 'boolean', group: 'housing' },
  { key: 'reWinningRestriction', label: '재당첨 제한 기간에 해당하나요?', kind: 'boolean', group: 'housing' },
  { key: 'accountKindEligible', label: '통장이 주택청약종합저축 또는 청약저축인가요?', kind: 'boolean', group: 'account' },
  { key: 'firstRank', label: '청약통장 순위확인서에서 1순위인가요?', kind: 'boolean', group: 'account', supplies: ['firstHome'] },
  { key: 'subscriptionAccountOpenedAt', label: '청약통장 가입일', kind: 'date', group: 'account' },
  { key: 'recognizedPaymentCount', label: '납입인정횟수(회)', kind: 'number', group: 'account' },
  { key: 'recognizedDepositAmount', label: '선납금을 포함한 저축액(원)', kind: 'number', group: 'account', money: true, supplies: ['firstHome'] },
  { key: 'monthlyIncome', label: '본인 월평균소득(원)', kind: 'number', group: 'income', money: true, supplies: ['youth'] },
  { key: 'householdIncome', label: '세대 월평균소득(원)', kind: 'number', group: 'income', money: true, supplies: ['newlywed', 'firstHome'] },
  { key: 'dualIncome', label: '맞벌이인가요?', kind: 'boolean', group: 'income', supplies: ['newlywed', 'firstHome'] },
  { key: 'workStartedAt', label: '근로 시작일', kind: 'date', group: 'income', supplies: ['youth'] },
  { key: 'totalAssets', label: '자산 총액(원, 청년은 본인 / 그 외 세대)', kind: 'number', group: 'assets', money: true },
  { key: 'parentAssets', label: '부모 자산 총액(원)', kind: 'number', group: 'assets', money: true, supplies: ['youth'] },
  { key: 'youthPriorityTarget', label: '공고의 청년 우선공급 대상 조건에 해당하나요?', kind: 'boolean', group: 'announcement', supplies: ['youth'] },
  { key: 'newlywedPriorityTarget', label: '공고의 신혼부부 우선공급 대상 조건에 해당하나요?', kind: 'boolean', group: 'announcement', supplies: ['newlywed'] },
];

/**
 * 원 단위 입력을 사람이 읽는 단위로 되읽어 준다. 입력값 자체는 바꾸지 않는다.
 * 362000000 -> "3억 6,200만원". 0을 한 자리 더 치거나 덜 친 것을 바로 알아채게 하는 용도다.
 */
export function koreanMoneyHint(raw: string | undefined): string | null {
  const text = raw?.trim();
  if (!text || !/^\d+(,\d{3})*$/.test(text)) return null;
  const amount = Number(text.replaceAll(',', ''));
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const parts: string[] = [];
  const eok = Math.floor(amount / 100_000_000);
  const man = Math.floor((amount % 100_000_000) / 10_000);
  const won = amount % 10_000;
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (won) parts.push(won.toLocaleString('ko-KR'));
  return `${parts.join(' ')}원`;
}
export function parseForm(raw: Record<string, string>, supply: SupplyType): { details: Details; errors: string[] } {
  const details: Details = {};
  const errors: string[] = [];
  for (const field of FORM_FIELDS.filter(f => !f.supplies || f.supplies.includes(supply))) {
    const value = raw[field.key]?.trim();
    if (!value) continue;
    let parsed: unknown;
    if (field.kind === 'date') {
      if (!validDate(value)) { errors.push(`${field.label}: YYYY-MM-DD 형식의 실제 날짜를 입력해 주세요.`); continue; }
      parsed = value;
    } else if (field.kind === 'number') {
      const number = Number(value.replaceAll(',', ''));
      if (!/^\d+(,\d{3})*(\.\d+)?$/.test(value) || !Number.isFinite(number) || (['recognizedPaymentCount','incomeHouseholdSize'].includes(field.key) && !Number.isInteger(number))) {
        errors.push(`${field.label}: 0 이상의 올바른 숫자를 입력해 주세요.`); continue;
      }
      parsed = number;
    } else if (field.kind === 'children' || field.kind === 'dates') {
      const dates = value === '없음' ? [] : value.split(',').map(s => s.trim());
      if (dates.some(date => !validDate(date))) { errors.push(`${field.label}: 날짜를 확인해 주세요.`); continue; }
      parsed = field.kind === 'dates' ? dates : dates.map(birthDate => ({ birthDate, unborn: false }));
    } else {
      if (!['yes', 'no'].includes(value)) { errors.push(`${field.label}: 응답을 다시 확인해 주세요.`); continue; }
      parsed = value === 'yes';
    }
    Object.assign(details, { [field.key]: parsed });
  }
  if (raw.currentResidence) details.currentResidence = raw.currentResidence;
  if (raw.overseas === 'no') details.overseasStayHistory = [];
  if (raw.exceptions === 'no') details.specialExceptions = [];
  if (raw.exceptions === 'yes') details.specialExceptions = ['공고 특례 추가 확인'];
  if (['married', 'engaged', 'singleParent'].includes(raw.familyCategory)) details.familyCategory = raw.familyCategory as Details['familyCategory'];
  return { details, errors };
}

export const FACT_LABELS: Record<string, string> = {
  householdMemberCount:'세대원 수', marriageWithin2Years:'혼인기간 2년 이내', marriageWithin7Years:'혼인기간 7년 이내',
  hasChildUnder7:'만 7세 미만 자녀', hasChildUnder3:'만 3세 미만 자녀', childbirthClear:'출산가구 완화 해당 여부',
  calculatedNoHomeMonths:'생년월일·최초 혼인일·세대 주택처분일', householdIncomeScoreTier:'가구원수·맞벌이 여부별 소득구간',
  age: '생년월일', maritalStatus: '혼인 여부', familyCategory: '가족 유형', marriageMonths: '혼인신고일', hasChildren: '자녀 여부', minorChildren: '자녀 생년월일', youngestChildMonths: '가장 어린 자녀 생년월일',
  noHome: '현재 주택소유', neverOwned: '과거 주택소유', householdNoHome: '세대 주택소유', householdNeverOwned: '세대 과거 주택소유',
  noSpecialRestriction: '특별공급 제한', noSpecialSupplyHistory: '특별공급 당첨 이력', noReWinningRestriction: '재당첨 제한',
  hasAccount: '청약통장 보유', accountMonths: '청약통장 가입일', residence: '공고 기준일 거주지', residenceMonths: '연속거주기간·해외 체류', noHomeMonths: '무주택 시작일',
  workMonths: '근로기간', workOrTaxMonths: '근로·소득세 납부기간과 공고 인정기준', incomeTaxPaymentYears: '소득세 납부기간', workOrBusinessIncome: '근로·사업소득 요건', exceptionsClear: '특례 여부',
  ...Object.fromEntries(FORM_FIELDS.map(f => [f.key, f.label])),
};
export function missingLabel(key: string): string {
  if (key.startsWith('review:')) return '특례 관련 공고 조항·증빙 확인';
  if (key === 'rule:verifiedAnnouncement') return '공고 원문·기준일·규칙 검증';
  if (key === 'rule:stage') return '공급단계 기준 확인';
  if (key.startsWith('rule:score:')) return '공고의 항목별 배점표 확인';
  if (key.startsWith('rule:')) return '공고의 자격·소득·자산 기준 확인';
  return FACT_LABELS[key.slice(6)] ?? '추가 입력정보 확인';
}

/** 프로필 화면에서만 고칠 수 있는 판정 입력. 추가 질문 화면에는 이 항목들이 없다. */
const PROFILE_FACTS = new Set([
  'householdMemberCount',
  'maritalStatus', 'noHome', 'neverOwned', 'householdNoHome', 'householdNeverOwned',
  'noSpecialRestriction', 'hasAccount', 'incomeTaxPaymentYears', 'workOrBusinessIncome',
]);

export type MissingInformationGroups = { answers: string[]; profile: string[]; announcement: string[] };

/**
 * 누락정보를 "어디서 해결하는가"로 나눈다.
 *
 * 공고 기준이 없어 생긴 항목을 사용자 입력 목록에 섞으면,
 * 아무리 입력해도 풀리지 않는 칸을 채우려고 같은 질문을 되풀이하게 된다.
 * 판정 로직은 건드리지 않고 표시용으로만 나눈다.
 */
export function groupMissingInformation(keys: string[]): MissingInformationGroups {
  const groups: MissingInformationGroups = { answers: [], profile: [], announcement: [] };
  for (const key of keys) {
    const bucket = !key.startsWith('input:') ? groups.announcement
      : PROFILE_FACTS.has(key.slice(6)) ? groups.profile : groups.answers;
    const label = missingLabel(key);
    if (!bucket.includes(label)) bucket.push(label);
  }
  return groups;
}
