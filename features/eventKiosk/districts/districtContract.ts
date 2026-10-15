/**
 * 삼도이동 토지임대부 분양주택 1·2지구 비교 — presentation contract.
 *
 * 이 파일은 "화면이 받을 모양"만 정한다. 판정·순위·공고 값은 Codex 쪽(rule package / evaluator / presentation)이 만든다.
 * UI 는 아래 CodexDistrictPresentation 을 받아 districtAdapter 로 화면 모델을 만들 뿐이며, 숫자를 직접 적지 않는다.
 *
 * 값이 아직 없으면 null 로 둔다. 화면은 null 을 '공고 데이터 연결 전'으로 보여 주고 임의 값을 만들지 않는다.
 */
export type DistrictId = 'D1' | 'D2';

/** 'YYYY-MM-DD'. */
export type IsoDate = string;

export type DistrictSchedule = {
  special: IsoDate | null;
  generalFirst: IsoDate | null;
  generalSecond: IsoDate | null;
  winnerAnnouncement: IsoDate | null;
};

/** 원 단위 정수. 표시 형식은 UI 가 정한다. */
export type DistrictCosts = {
  salePrice49: number | null;
  salePrice59: number | null;
  monthlyLandRent49: number | null;
  monthlyLandRent59: number | null;
};

export type DistrictInventory = { total: number; units49: number; units59: number };

/** 이 지구에 대한 방문자 판정 요약. 판정 자체는 Codex 엔진 결과이고 UI 는 라벨만 고른다. */
export type DistrictAssessment =
  | {
      status: 'READY';
      /** 예: '신생아 특별공급'. 신청 가능한 유형이 없으면 null. */
      recommendedSupply: string | null;
      eligibility: 'ELIGIBLE' | 'EVIDENCE_REQUIRED' | 'CONDITIONAL' | 'INELIGIBLE';
      /** 예: '1단계 우선공급'. */
      priorityStage: string | null;
      officialScore: { status: 'AVAILABLE'; total: number; max: number } | { status: 'NOT_APPLICABLE' } | { status: 'PENDING' };
      /** 추천 공급유형의 공급 세대수. */
      supplyCount: number | null;
      /** 짧은 이유 1~2줄(선택). */
      notes?: string[];
    }
  | { status: 'PENDING'; reason: string };

export type DistrictSourceStatus = 'OFFICIAL' | 'FINAL_USER_SOURCE' | 'BRIEF' | 'LAYOUT_SAMPLE';

/** Codex 가 지구마다 하나씩 주는 값. 모든 필드는 선택이며, 없는 값은 화면에서 '연결 전'으로 남는다. */
export type CodexDistrictPresentation = {
  id: DistrictId;
  /** 예: '1지구'. */
  label?: string;
  inventory?: DistrictInventory | null;
  costs?: Partial<DistrictCosts> | null;
  schedule?: Partial<DistrictSchedule> | null;
  assessment?: DistrictAssessment | null;
  source?: { status: DistrictSourceStatus; label: string } | null;
};

/** 화면 모델(adapter 출력). */
export type DistrictCardModel = {
  id: DistrictId;
  label: string;
  title: string;
  inventory: DistrictInventory | null;
  costs: DistrictCosts;
  schedule: DistrictSchedule;
  assessment: DistrictAssessment;
  source: { status: DistrictSourceStatus; label: string };
};

export type DistrictComparisonModel = {
  title: string;
  cards: DistrictCardModel[];
  /** 레이아웃 점검용 예시 값이 섞여 있으면 true(화면에 크게 표시한다). */
  sample: boolean;
};
