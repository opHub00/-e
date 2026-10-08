/**
 * 행사 화면에 보이는 모든 문장을 지나가는 마지막 관문.
 *
 * 판정 결과에는 기계용 키(`score.applicantDisabled`, `input:age`, `NEWLYWED_WITH_CHILD` 같은)가
 * 사람용 라벨과 섞여 들어온다. 화면은 이 파일을 거친 문장만 그린다.
 * - 아는 키는 사람이 읽는 이름으로 바꾼다.
 * - 모르는 키는 '추가 자격 정보'로 감춘다. 절대 원문 그대로 내보내지 않는다.
 *
 * 판정 로직·Rule Package 와는 무관하다. 표시 문구만 다룬다.
 * (Codex 의 `presentation.ts` 가 합쳐지면 같은 표를 그쪽으로 모을 수 있다.)
 */
export const FACT_LABELS: Record<string, string> = {
  'applicant.age': '신청자 생년월일',
  'applicant.currentHomeCount': '신청자 주택 보유 여부',
  'applicant.isJejuResident': '행사 지역 거주 여부',
  'applicant.maritalStatus': '혼인 상태',
  'applicant.monthlyIncomeKrw': '신청자 월평균 소득',
  'applicant.recognizedPaymentCount': '청약통장 인정 납입 횟수',
  'applicant.residenceMonths': '행사 지역 계속 거주기간',
  'applicant.totalAssetsKrw': '신청자 총자산',
  'event.applicantDisabilityPoints': '장애인 가점',
  'event.applicantParentMaxVehicleValueKrw': '본인·부모 차량가액',
  'event.applicantParentMonthlyIncomeKrw': '본인·부모 월평균 소득',
  'event.applicantParentTotalAssetsKrw': '본인·부모 총자산',
  'event.benefitCategory': '복지급여·지원 자격',
  'event.collegeStudent': '대학생·입학·복학 예정 여부',
  'event.currentProgramTenant': '동일 청년매입임대 계약·거주 여부',
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
  // 이전 판정 엔진에서 넘어올 수 있는 키
  'input:age': '신청자 나이',
  'input:monthlyIncome': '월평균 소득',
  'input:noHomeMonths': '무주택 기간',
  'rule:verifiedAnnouncement': '공고문 검수 상태',
};

export const UNKNOWN_FACT_LABEL = '추가 자격 정보';

const FACT_KEY = /(?:applicant|spouse|household|family|profile|event|score)\.[A-Za-z0-9_.]*[A-Za-z0-9_]/g;
const PREFIXED_KEY = /(?:input|rule|fact|review):[A-Za-z0-9_.]*[A-Za-z0-9_]/g;
/** 두 단어 이상이 밑줄로 이어진 대문자 코드. 'NEWLYWED_WITH_CHILD', 'PRIORITY_1' 같은 것. */
const ENUM_CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

export function factLabel(key: string): string {
  const trimmed = key.trim();
  if (FACT_LABELS[trimmed]) return FACT_LABELS[trimmed];
  const unwrapped = trimmed.replace(/^(?:input|rule|fact|review):/, '');
  return FACT_LABELS[unwrapped] ?? UNKNOWN_FACT_LABEL;
}

export function containsRawKey(text: string): boolean {
  return new RegExp(FACT_KEY.source).test(text) || new RegExp(PREFIXED_KEY.source).test(text) || new RegExp(ENUM_CODE.source).test(text);
}

/**
 * 문장 안의 기계용 키를 사람용 이름으로 바꾼다. 문장 전체가 키라면 이름 하나만 돌려준다.
 * 대문자 코드는 사람용 이름이 없으므로 지우고, 남는 구분자를 정리한다.
 */
export function humanize(text: string): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  const replaced = trimmed
    .replace(PREFIXED_KEY, key => factLabel(key))
    .replace(FACT_KEY, key => factLabel(key))
    .replace(ENUM_CODE, '')
    .replace(/\s*·\s*(?=·|$)/g, '')
    .replace(/^\s*·\s*/, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return replaced || UNKNOWN_FACT_LABEL;
}

/** 목록을 사람용으로 바꾸고, 바꾼 뒤 같아진 항목은 하나로 합친다. */
export function humanizeAll(items: readonly string[]): string[] {
  return [...new Set(items.map(humanize).filter(Boolean))];
}
