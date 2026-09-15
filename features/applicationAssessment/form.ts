import { validDate } from './facts.ts';
import type { AssessmentInput, SupplyType } from './types.ts';

type Details = AssessmentInput['details'];
export type FormField = { key: keyof Details; label: string; kind: 'date' | 'number' | 'boolean' | 'children'; supplies?: SupplyType[] };
export const FORM_FIELDS: FormField[] = [
  { key: 'birthDate', label: '생년월일', kind: 'date', supplies: ['youth'] },
  { key: 'marriageDate', label: '혼인신고일(신혼부부 해당 시)', kind: 'date', supplies: ['newlywed'] },
  { key: 'children', label: '출생 자녀 생년월일(쉼표로 구분, 없으면 없음)', kind: 'children', supplies: ['newlywed', 'firstHome'] },
  { key: 'residenceStartDate', label: '제주 연속거주 시작일', kind: 'date' },
  { key: 'subscriptionAccountOpenedAt', label: '청약통장 가입일', kind: 'date' },
  { key: 'recognizedPaymentCount', label: '납입인정횟수(회)', kind: 'number' },
  { key: 'recognizedDepositAmount', label: '납입인정금액(원)', kind: 'number', supplies: ['firstHome'] },
  { key: 'monthlyIncome', label: '본인 월평균소득(원)', kind: 'number', supplies: ['youth'] },
  { key: 'householdIncome', label: '세대 월평균소득(원)', kind: 'number', supplies: ['newlywed', 'firstHome'] },
  { key: 'dualIncome', label: '맞벌이인가요?', kind: 'boolean', supplies: ['newlywed', 'firstHome'] },
  { key: 'totalAssets', label: '자산 총액(원, 청년은 본인 / 그 외 세대)', kind: 'number' },
  { key: 'parentAssets', label: '부모 자산 총액(원)', kind: 'number', supplies: ['youth'] },
  { key: 'noHomeSince', label: '공고에서 인정하는 무주택기간 시작일', kind: 'date', supplies: ['newlywed'] },
  { key: 'workStartedAt', label: '근로 시작일', kind: 'date', supplies: ['youth'] },
  { key: 'youthPriorityTarget', label: '공고의 청년 우선공급 대상 조건에 해당하나요?', kind: 'boolean', supplies: ['youth'] },
  { key: 'newlywedPriorityTarget', label: '공고의 신혼부부 우선공급 대상 조건에 해당하나요?', kind: 'boolean', supplies: ['newlywed'] },
  { key: 'specialSupplyHistory', label: '특별공급 당첨 이력이 있나요?', kind: 'boolean' },
  { key: 'reWinningRestriction', label: '재당첨 제한 기간에 해당하나요?', kind: 'boolean' },
];
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
      if (!/^\d+(,\d{3})*(\.\d+)?$/.test(value) || !Number.isFinite(number) || (field.key === 'recognizedPaymentCount' && !Number.isInteger(number))) {
        errors.push(`${field.label}: 0 이상의 올바른 숫자를 입력해 주세요.`); continue;
      }
      parsed = number;
    } else if (field.kind === 'children') {
      const dates = value === '없음' ? [] : value.split(',').map(s => s.trim());
      if (dates.some(date => !validDate(date))) { errors.push('자녀 생년월일을 확인해 주세요.'); continue; }
      parsed = dates.map(birthDate => ({ birthDate, unborn: false }));
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
