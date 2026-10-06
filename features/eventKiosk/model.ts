/**
 * 행사 체험에서 방문자가 입력하는 정보.
 *
 * 청약 유형을 먼저 고르게 하지 않는다. 방문자는 '신혼부부 특별공급'보다 '배우자와 함께 준비'를 먼저 안다.
 * 그래서 가구 형태부터 묻고, 어떤 공급에 해당하는지는 판정 엔진이 정한다.
 *
 * 모든 질문에 '잘 모르겠어요'를 둔다. 모르는 값은 null 로 남기고 0 이나 false 로 바꾸지 않는다.
 * 모르는 값을 아니라고 적으면 판정이 거짓말이 된다.
 */

export type HouseholdType = 'single' | 'couple' | 'withChildren' | 'singleParent' | 'other';

export const HOUSEHOLD_TYPES: { key: HouseholdType; label: string; hint: string }[] = [
  { key: 'single', label: '혼자 준비', hint: '혼인하지 않았고 혼자 신청해요' },
  { key: 'couple', label: '배우자와 함께 준비', hint: '혼인했거나 곧 혼인할 예정이에요' },
  { key: 'withChildren', label: '자녀가 있는 가구', hint: '배우자와 자녀가 함께 살아요' },
  { key: 'singleParent', label: '한부모 가구', hint: '혼자 자녀를 키우고 있어요' },
  { key: 'other', label: '기타', hint: '위에 딱 맞는 게 없어요' },
];

/** 배우자 정보를 따로 받아야 하는 가구. 이 가구를 고르면 배우자 단계가 자동으로 붙는다. */
export const hasSpouse = (type: HouseholdType | null): boolean => type === 'couple' || type === 'withChildren';

/** 예 / 아니오 / 모름. 모름은 null 이다. */
export type YesNo = boolean | null;

export type ApplicantInfo = {
  /** 화면 인사에만 쓴다. 판정에 쓰지 않고, 비워 둬도 된다. */
  displayName: string;
  /** YYYY-MM-DD. 모르면 빈 문자열. */
  birthDate: string;
  /** 지금 행사 지역에 살고 있는가. */
  livesInEventRegion: YesNo;
  /** 그 지역에 산 지 얼마나 됐는가(개월). 모르면 null. */
  residenceMonths: number | null;
  isHouseholdHead: YesNo;
  /** 본인과 세대원 모두 지금 집이 없는가. */
  householdNoHome: YesNo;
  /** 본인과 세대원 모두 지금까지 집을 가진 적이 없는가. 질문 문구가 세대까지 묻기 때문에 세대 사실로 쓴다. */
  neverOwnedHome: YesNo;
  /**
   * 청약에 당첨된 적이 있는가(본인·세대원).
   * 한 질문으로 특별공급 당첨·재당첨 제한·5년 내 당첨을 함께 덮는다. '없어요'는 셋 다 없다는 뜻이다.
   */
  winningHistory: YesNo;
  /** 본인 월 소득(원). 모르면 null. */
  monthlyIncome: number | null;
  /** 일해서 소득세를 낸 기간(년). 모르면 null. */
  taxPaymentYears: number | null;
  /** 최근 해외에 오래(계속 90일 넘게) 나가 있었던 적이 있는가. */
  longOverseasStay: YesNo;
  /** 공고 특례(출산·해외 근무 등)에 해당한다고 알고 있는가. '아니요'는 해당 없음이다. */
  specialException: YesNo;
};

export type HouseholdInfo = {
  /** 혼인신고를 했는가. '아니요'면 예비신혼부부로 본다. 배우자 가구일 때만 묻는다. */
  marriageRegistered: YesNo;
  /** 혼인신고일. 배우자 가구이고 신고했을 때만 의미가 있다. YYYY-MM-DD. */
  marriageDate: string;
  /** 예비신혼부부: 입주 전까지 혼인 사실을 증명할 수 있는가. */
  plannedMarriageWithinDeadline: YesNo;
  /** 한부모 가구: 한부모가족 증명을 받을 수 있는가. */
  singleParentQualified: YesNo;
  /** 배우자도 소득이 있는가. */
  dualIncome: YesNo;
  /** 세대 월 소득 합계(원). 모르면 null. */
  householdIncome: number | null;
  /** 세대원 수(본인 포함). */
  householdSize: number | null;
  childrenCount: number | null;
  /** 자녀별 출생 연도. 길이는 childrenCount 와 같다. 모르는 자녀는 null. */
  childBirthYears: (number | null)[];
  /** 세대 총자산(원). 모르면 null. */
  totalAssets: number | null;
  /** 부모 총자산(원). 청년 공급에서만 쓴다. */
  parentAssets: number | null;
};

/** 통장 종류를 함께 물어, 있는지와 신청에 쓸 수 있는 통장인지를 한 번에 안다. */
export type AccountKind = 'housing' | 'other' | 'none';

export type SubscriptionInfo = {
  /** 주택청약종합저축 / 그 밖의 청약통장 / 없음. 모르면 null. */
  accountKind: AccountKind | null;
  /** YYYY-MM-DD. 모르면 빈 문자열. */
  openedAt: string;
  paymentCount: number | null;
  /** 납입 인정 금액(원). */
  depositAmount: number | null;
  /** 1순위 조건(가입기간·납입횟수)을 채웠는가. */
  firstRank: YesNo;
};

export type KioskAnswers = {
  householdType: HouseholdType | null;
  applicant: ApplicantInfo;
  household: HouseholdInfo;
  subscription: SubscriptionInfo;
};

export const emptyAnswers = (): KioskAnswers => ({
  householdType: null,
  applicant: {
    displayName: '',
    birthDate: '',
    livesInEventRegion: null,
    residenceMonths: null,
    isHouseholdHead: null,
    householdNoHome: null,
    neverOwnedHome: null,
    winningHistory: null,
    monthlyIncome: null,
    taxPaymentYears: null,
    longOverseasStay: null,
    specialException: null,
  },
  household: {
    marriageRegistered: null,
    marriageDate: '',
    plannedMarriageWithinDeadline: null,
    singleParentQualified: null,
    dualIncome: null,
    householdIncome: null,
    householdSize: null,
    childrenCount: null,
    childBirthYears: [],
    totalAssets: null,
    parentAssets: null,
  },
  subscription: {
    accountKind: null,
    openedAt: '',
    paymentCount: null,
    depositAmount: null,
    firstRank: null,
  },
});

/**
 * 입력 단계. 화면 하나가 섹션 하나다.
 * 가족 단계(배우자·자녀)는 가구 형태에 따라 자동으로 끼거나 빠진다.
 */
export type InputStep = 'household' | 'applicant' | 'family' | 'finance' | 'subscription';

export const STEP_LABELS: Record<InputStep, string> = {
  household: '가구 형태',
  applicant: '신청자 정보',
  family: '배우자·자녀',
  finance: '소득·자산',
  subscription: '주택·청약통장',
};

/** 배우자나 자녀 정보를 받아야 하는 가구. */
export const hasFamilyStep = (type: HouseholdType | null): boolean =>
  hasSpouse(type) || type === 'singleParent';

export function inputSteps(type: HouseholdType | null): InputStep[] {
  return hasFamilyStep(type)
    ? ['household', 'applicant', 'family', 'finance', 'subscription']
    : ['household', 'applicant', 'finance', 'subscription'];
}

/** 단계별 진행률. 화면 위 진행 표시가 쓴다. */
export function stepProgress(type: HouseholdType | null, step: InputStep): { index: number; total: number } {
  const steps = inputSteps(type);
  const index = Math.max(0, steps.indexOf(step));
  return { index: index + 1, total: steps.length };
}

export const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** 이 단계를 넘어가려면 꼭 있어야 하는 것. 나머지는 '모름'으로 넘어갈 수 있다. */
export function stepBlocker(answers: KioskAnswers, step: InputStep): string | null {
  if (step === 'household' && !answers.householdType) return '가구 형태를 골라 주세요.';
  if (step === 'applicant' && !isIsoDate(answers.applicant.birthDate)) {
    return '생년월일을 입력해 주세요. 나이에 따라 신청할 수 있는 공급이 달라져요.';
  }
  if (step === 'family' && answers.household.marriageRegistered === true && answers.household.marriageDate && !isIsoDate(answers.household.marriageDate)) {
    return '혼인신고일을 날짜 형식으로 입력하거나 비워 주세요.';
  }
  if (step === 'subscription' && answers.subscription.openedAt && !isIsoDate(answers.subscription.openedAt)) {
    return '가입일을 날짜 형식으로 입력하거나 비워 주세요.';
  }
  return null;
}

/** 자녀 수를 바꾸면 출생 연도 칸도 그 수에 맞춘다. 이미 적은 값은 남긴다. */
export function resizeChildren(years: (number | null)[], count: number | null): (number | null)[] {
  const n = Math.max(0, Math.min(10, count ?? 0));
  return Array.from({ length: n }, (_, i) => years[i] ?? null);
}
