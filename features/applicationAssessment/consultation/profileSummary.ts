import { knownValue, type ApplicantProfileV2, type ProfileFieldState } from '../../profile/domain.ts';
import type { ConsultationFieldUpdate, ConsultationResponse, ConsultationSession } from './types.ts';

type ProfileLine = {
  label: string;
  /** Conversation update that overrides this profile field inside the session. */
  field: ConsultationFieldUpdate['field'] | null;
  read: (profile: ApplicantProfileV2) => ProfileFieldState<unknown>;
  format: (value: unknown) => string;
};

const yesNo = (yes: string, no: string) => (value: unknown) => value ? yes : no;

const PROFILE_LINES: ProfileLine[] = [
  { label: '혼인 상태', field: 'marriageStatus', read: p => p.family.marriageStatus, format: v => v === 'married' ? '기혼' : '미혼' },
  { label: '현재 주택', field: 'currentHousingOwnership', read: p => p.housing.currentOwnership, format: v => v === 'owns-home' ? '주택 보유' : '무주택' },
  { label: '과거 주택 소유 이력', field: 'previousHousingOwnership', read: p => p.housing.previousOwnership, format: yesNo('있음', '없음') },
  { label: '세대원 주택 보유', field: 'householdHasHome', read: p => p.housing.householdHasHome, format: yesNo('있음', '없음') },
  { label: '세대원 과거 주택 소유 이력', field: null, read: p => p.housing.householdDisqualifyingPreviousOwnership, format: yesNo('있음', '없음') },
  { label: '특별공급 제한', field: null, read: p => p.housing.hasSpecialSupplyRestriction, format: yesNo('있음', '없음') },
  { label: '청약통장', field: 'hasSubscriptionAccount', read: p => p.subscriptionAccount.hasAccount, format: yesNo('있음', '없음') },
  { label: '근로·사업소득', field: 'workOrBusinessIncomeEligible', read: p => p.income.workOrBusinessIncomeEligible, format: yesNo('있음', '없음') },
  { label: '소득세 납부기간', field: 'incomeTaxPaymentYears', read: p => p.income.incomeTaxPaymentYears, format: v => `${v}년` },
  { label: '세대원 수', field: null, read: p => p.household.memberCount, format: v => `${v}명` },
];

const won = (value: unknown) => typeof value === 'number' ? `${value.toLocaleString('ko-KR')}원` : String(value);
const ANSWER_LINES: [key: string, label: string, format: (value: unknown) => string][] = [
  ['birthDate', '생년월일', String],
  ['declaredAgeYears', '나이(말씀하신 값)', v => `${v}살`],
  ['currentResidence', '현재 거주지역', String],
  ['declaredResidenceMonths', '거주기간', v => `${v}개월`],
  ['residenceStartDate', '거주 시작일', String],
  ['declaredSubscriptionMonths', '청약통장 가입기간', v => `${v}개월`],
  ['subscriptionAccountOpenedAt', '청약통장 가입일', String],
  ['accountKindEligible', '청약통장 종류', yesNo('주택청약종합저축·청약저축', '확인 필요')],
  ['recognizedPaymentCount', '납입 인정 횟수', v => `${v}회`],
  ['recognizedDepositAmount', '인정 저축액', won],
  ['monthlyIncome', '본인 월평균소득', won],
  ['householdIncome', '세대 월평균소득', won],
  ['dualIncome', '맞벌이', yesNo('맞벌이', '외벌이')],
  ['totalAssets', '총자산', won],
  ['parentAssets', '부모 자산', won],
  ['realEstateAssets', '세대 부동산 가액', won],
  ['vehicleValue', '가장 높은 차량가액', won],
  ['familyCategory', '가족 유형', v => ({ married: '신혼부부', engaged: '예비신혼부부', singleParent: '한부모' } as Record<string, string>)[String(v)] ?? String(v)],
  ['marriageDate', '혼인신고일', String],
  ['marriageDateLatest', '혼인신고일(늦은 끝)', String],
  ['incomeHouseholdSize', '소득 가구원 수', v => `${v}명`],
  ['declaredChildCount', '말씀하신 자녀 수', v => `${v}명`],
  ['plannedMarriageWithinDeadline', '입주 전 혼인 증명', yesNo('가능', '어려움')],
  ['singleParentQualified', '한부모가족 증명', yesNo('가능', '확인 필요')],
  ['specialSupplyHistory', '특별공급 당첨 이력', yesNo('있음', '없음')],
  ['reWinningRestriction', '재당첨 제한', yesNo('있음', '없음')],
  ['overseasStayHistory', '해외체류 이력', v => Array.isArray(v) && v.length === 0 ? '없음' : '있음(확인 필요)'],
  ['children', '자녀 생년월일', v => Array.isArray(v) && v.length === 0 ? '없음' : Array.isArray(v) ? v.map(c => (c as { birthDate?: string; birthDateLatest?: string }).birthDateLatest ? `${(c as { birthDate?: string }).birthDate}~${(c as { birthDateLatest?: string }).birthDateLatest}` : String((c as { birthDate?: string }).birthDate)).join(', ') : '확인 필요'],
  ['specialExceptions', '특례', v => Array.isArray(v) && v.length === 0 ? '해당 없음' : `확인 필요 ${Array.isArray(v) ? v.length : 0}건`],
];

/**
 * 상담에 쓰이고 있는 정보만 보여준다. 판정을 다시 하지 않고, 저장된 프로필은
 * 바꾸지 않는다. 상담 중 말한 값은 "프로필에는 저장되지 않음"으로 구분한다.
 */
export function buildProfileSummaryResponse(session: ConsultationSession): ConsultationResponse {
  const stated = new Set(session.conversationFactKeys ?? []);
  const fromProfile: string[] = [];
  const fromConversation: string[] = [];
  for (const line of PROFILE_LINES) {
    const value = knownValue(line.read(session.userProfileSnapshot));
    if (value === undefined) continue;
    const text = `${line.label}: ${line.format(value)}`;
    if (line.field && stated.has(line.field)) fromConversation.push(text);
    else fromProfile.push(text);
  }
  const answers = session.collectedAnswers as Record<string, unknown>;
  for (const [key, label, format] of ANSWER_LINES) {
    if (answers[key] === undefined || answers[key] === null) continue;
    fromConversation.push(`${label}: ${format(answers[key])}`);
  }
  const sections = ['지금 상담에 사용 중인 정보예요. 판정은 이 값으로만 계산해요.'];
  if (fromProfile.length) sections.push(`프로필에서 가져온 정보\n${fromProfile.map(line => `• ${line}`).join('\n')}`);
  if (fromConversation.length) sections.push(`이번 판정·상담에서 입력한 정보 (프로필에는 저장되지 않아요)\n${fromConversation.map(line => `• ${line}`).join('\n')}`);
  if (!fromProfile.length && !fromConversation.length) sections.push('아직 사용 중인 정보가 없어요. 생년월일, 거주기간처럼 확인 가능한 값을 알려주세요.');
  const last = session.lastAssessmentResult;
  return {
    message: sections.join('\n\n'),
    summary: sections[0],
    intent: 'SHOW_PROFILE',
    resolution: last?.status === 'NEEDS_MORE_INFORMATION' || !last ? 'NEEDS_MORE_INFORMATION' : 'ASSESSED',
    assessmentStatus: null,
    supplyType: session.supplyType,
    stage: null,
    suggestedQuestions: [],
    actions: [{ type: 'EDIT_PROFILE', label: '프로필 정보 확인하기' }],
    evidenceRefs: [],
    sourceStatus: last?.sourceStatus ?? null,
  };
}
