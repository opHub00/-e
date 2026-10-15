/** 삼도 1·2지구 화면 전용 presentation model. 판정·공고 값은 samdoDual domain에서만 온다. */
export type DistrictId = 'D1' | 'D2';
export type IsoDate = string;

export type DistrictSchedule = {
  special: IsoDate;
  generalFirst: IsoDate;
  generalSecond: IsoDate;
  winnerAnnouncement: IsoDate;
};

export type DistrictPriceTier = { floor: string; priceKrw: number };

export type DistrictCosts = {
  salePrices49: DistrictPriceTier[];
  salePrices59: DistrictPriceTier[];
  monthlyLandRent49: number;
  monthlyLandRent59: number;
};

export type DistrictInventory = {
  total: number;
  special: number;
  general: number;
  units49: number;
  units59: number;
};

export type DistrictAssessment =
  | {
      status: 'READY';
      recommendedSupply: string | null;
      eligibility: 'ELIGIBLE' | 'EVIDENCE_REQUIRED' | 'CONDITIONAL' | 'INELIGIBLE';
      priorityStage: string | null;
      officialScore: { status: 'AVAILABLE'; total: number; max: number } | { status: 'NOT_APPLICABLE' } | { status: 'PENDING' };
      supplyCount: number | null;
      notes?: string[];
    }
  | { status: 'PENDING'; reason: string };

export type DistrictCardModel = {
  id: DistrictId;
  label: string;
  title: string;
  managementNumber: string;
  location: string;
  inventory: DistrictInventory;
  costs: DistrictCosts;
  schedule: DistrictSchedule;
  assessment: DistrictAssessment;
  source: { status: 'FINAL_USER_SOURCE' | 'LAYOUT_SAMPLE'; label: string; sha256: string };
};

export type DistrictComparisonModel = {
  title: string;
  cards: DistrictCardModel[];
  sample: boolean;
};
