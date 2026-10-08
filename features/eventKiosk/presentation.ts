import type {
  KioskBucket,
  KioskStatus,
  KioskUnavailableReason,
  OfficialScoreState,
  WanpanLevel,
} from './evaluate.ts';

/** User-facing copy. Domain values stay stable and machine-readable. */
export const KIOSK_STATUS_LABELS: Record<KioskStatus, string> = {
  COMPLETE: '신청 가능',
  NEEDS_USER_INPUT: '추가 확인 필요',
  INELIGIBLE: '신청 어려움',
  UNAVAILABLE: '현재 분석 불가',
};

export const UNAVAILABLE_REASON_LABELS: Record<KioskUnavailableReason, string> = {
  NO_ACTIVE_RULE_SET: '분석 전 공고',
  MISSING_ANNOUNCEMENT_FACTS: '공고 정보 확인 필요',
  ASSESSMENT_FAILED: '현재 분석 불가',
};

export const OFFICIAL_SCORE_STATUS_LABELS: Record<OfficialScoreState['status'], string> = {
  AVAILABLE: '공식 배점',
  NOT_APPLICABLE: '해당 없음',
  PENDING: '정보·서류 확인 필요',
};

export const EVIDENCE_STATUS_LABELS = {
  PENDING: '서류 확인 필요',
  REVIEW_REQUIRED: '서류 확인 필요',
} as const;

export const BUCKET_LABELS: Record<KioskBucket, string> = {
  eligible: '신청 가능',
  review: '추가 확인 필요',
  difficult: '신청 어려움',
};

export const WANPAN_LEVEL_LABELS: Record<WanpanLevel, string> = {
  high: '적극 검토',
  medium: '검토 가능',
  low: '조건 확인 필요',
  none: '신청 어려움',
};

/** Every fact used by jeju-event-2026-10-v1 has a non-technical label. */
export const FACT_LABELS: Record<string, string> = {
  'applicant.age': '신청자 생년월일',
  'applicant.currentHomeCount': '신청자 주택 보유 여부',
  'applicant.isJejuResident': '제주 거주 여부',
  'applicant.maritalStatus': '혼인 상태',
  'applicant.monthlyIncomeKrw': '신청자 월평균 소득',
  'applicant.recognizedPaymentCount': '청약통장 인정 납입 횟수',
  'applicant.residenceMonths': '제주 계속 거주기간',
  'applicant.totalAssetsKrw': '신청자 총자산',
  'event.applicantDisabilityPoints': '공고 기준 장애인 가점',
  'event.applicantParentMaxVehicleValueKrw': '본인·부모 차량가액',
  'event.applicantParentMonthlyIncomeKrw': '본인·부모 월평균 소득',
  'event.applicantParentTotalAssetsKrw': '본인·부모 총자산',
  'event.benefitCategory': '복지급여·지원 자격',
  'event.collegeStudent': '대학생·입학·복학 예정 여부',
  'event.currentProgramTenant': '동일 유형 매입임대 계약·거주 여부',
  'event.eligibleResident': '국적·외국인등록 신청 자격',
  'event.generalRentalPriorityCategory': '일반 매입임대 우선순위 증빙',
  'event.isHousingBenefitRecipient': '주거급여 수급 여부',
  'event.jobSeekerWithinTwoYears': '졸업·중퇴 후 2년 이내 취업준비 여부',
  'event.lhCollegeIncomeEligible': '본인·부모 합산 소득 기준',
  'event.marriageBeforeMoveIn': '입주 전 혼인 증빙',
  'event.rentBurdenPercent': '월 소득 대비 임차료 부담률',
  'event.supportedSingleParent': '한부모가족 증빙',
  'event.workHistoryMonths': '소득 활동 기간',
  'family.marriageMonths': '혼인신고일',
  'household.allNoHome': '세대 전체 무주택 여부',
  'household.childUnder7Count': '만 7세 미만 자녀',
  'household.dependentCount': '부양가족 수',
  'household.dualIncome': '맞벌이 여부',
  'household.maxVehicleValueKrw': '세대 보유 차량가액',
  'household.memberCount': '세대원 수',
  'household.minorChildCount': '미성년 자녀 수',
  'household.monthlyIncomeKrw': '세대 월평균 소득',
  'household.newbornCountWithinTwoYears': '최근 2년 이내 출생 자녀',
  'household.post20230328ChildCount': '2023년 3월 28일 이후 출생 자녀',
  'household.totalAssetsKrw': '세대 총자산',
  'profile.composition': '가구 형태',
  'score.applicantDisabled': '신청자 등록장애인 여부',
  'score.benefit.jpdcMultiChild': '다자녀 공급 복지급여·지원 자격',
  'score.benefit.jpdcNewlywed': '신혼부부 공급 복지급여·지원 자격',
  'score.benefit.jpdcYouth': '청년 공급 복지급여·지원 자격',
  'score.housingVulnerable': '주거취약계층 증빙',
  'score.parentNoHome': '부모 무주택 여부',
  'score.severeDisability': '세대 중증장애인 여부',
  'score.supportsSeniorParent': '만 65세 이상 직계존속 부양',
  'score.youthIncomeUnderHalf': '청년 소득 50% 이하 여부',
  'input:age': '신청자 나이',
  'input:monthlyIncome': '월평균 소득',
  'input:noHomeMonths': '무주택 기간',
  'rule:verifiedAnnouncement': '공고문 검수 상태',
};

const RAW_KEY = /^(?:(?:applicant|spouse|household|family|profile|event|score)\.[A-Za-z0-9_.-]+|(?:input|rule|fact):[A-Za-z0-9_.-]+|[A-Z][A-Z0-9_]{2,})$/;
const EMBEDDED_RAW_KEY = /\b(?:(?:applicant|spouse|household|family|profile|event|score)\.[A-Za-z0-9_.-]+|(?:input|rule|fact):[A-Za-z0-9_.-]+)/g;

export function isRawDomainKey(value: string): boolean {
  return RAW_KEY.test(value.trim());
}

export function containsRawDomainKey(value: string): boolean {
  return isRawDomainKey(value) || value.search(EMBEDDED_RAW_KEY) >= 0;
}

export function userFacingFactLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '추가 자격 정보';
  const direct = FACT_LABELS[trimmed];
  if (direct) return direct;
  const unwrapped = trimmed.replace(/^(?:input|rule|fact):/, '');
  const normalized = FACT_LABELS[unwrapped];
  if (normalized) return normalized;
  if (isRawDomainKey(trimmed)) return '추가 자격 정보';
  return trimmed.replace(EMBEDDED_RAW_KEY, key => FACT_LABELS[key] ?? '추가 자격 정보');
}

export function userFacingLabels(values: readonly string[]): string[] {
  return [...new Set(values.map(userFacingFactLabel).filter(Boolean))];
}

export function kioskStatusLabel(status: KioskStatus, reason: KioskUnavailableReason | null = null): string {
  return status === 'UNAVAILABLE' && reason ? UNAVAILABLE_REASON_LABELS[reason] : KIOSK_STATUS_LABELS[status];
}

export function officialScoreStatusLabel(status: OfficialScoreState['status']): string {
  return OFFICIAL_SCORE_STATUS_LABELS[status];
}
