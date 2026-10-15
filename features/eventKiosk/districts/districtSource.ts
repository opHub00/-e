import type { DistrictCardModel } from './districtContract.ts';

/** Demo Mode의 ?layout=sample 전용. 정상 /event 경로에서는 절대 사용하지 않는다. */
export const DISTRICT_LAYOUT_SAMPLE: Partial<DistrictCardModel>[] = [
  {
    id: 'D1',
    costs: {
      salePrices49: [{ floor: '레이아웃 점검', priceKrw: 123_450_000 }],
      salePrices59: [{ floor: '레이아웃 점검', priceKrw: 234_560_000 }],
      monthlyLandRent49: 123_400,
      monthlyLandRent59: 234_500,
    },
    source: { status: 'LAYOUT_SAMPLE', label: '레이아웃 점검용 예시', sha256: 'layout-sample' },
  },
  {
    id: 'D2',
    costs: {
      salePrices49: [{ floor: '레이아웃 점검', priceKrw: 135_790_000 }],
      salePrices59: [{ floor: '레이아웃 점검', priceKrw: 246_800_000 }],
      monthlyLandRent49: 135_700,
      monthlyLandRent59: 246_800,
    },
    schedule: { special: '2099-12-01', generalFirst: '2099-12-02', generalSecond: '2099-12-03', winnerAnnouncement: '2099-12-09' },
    assessment: { status: 'READY', recommendedSupply: '생애최초 특별공급', eligibility: 'EVIDENCE_REQUIRED', priorityStage: '우선공급', officialScore: { status: 'NOT_APPLICABLE' }, supplyCount: 6 },
    source: { status: 'LAYOUT_SAMPLE', label: '레이아웃 점검용 예시', sha256: 'layout-sample' },
  },
];
