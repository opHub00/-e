import type { SamdoDistrictConfig, SamdoDistrictId } from './types.ts';

const D1_HASH = '5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2';
const D2_HASH = '336c345354c6ab9085683ede9e8fde52f4be73969c5058c0a62602257289ab71';

const locator = (sha256: string, paragraphRange: string) => ({ parser: 'HWP5_RECORDS' as const, sha256, paragraphRange });
const commonSchedule = {
  special: '2026-11-16',
  generalFirst: '2026-11-17',
  generalSecond: '2026-11-18',
  documentSubmission: { start: '2026-11-30', end: '2026-12-04' },
  contract: { start: '2027-01-25', end: '2027-01-29' },
};

export const SAMDO_DISTRICTS: Record<SamdoDistrictId, SamdoDistrictConfig> = {
  'samdo-1': {
    id: 'samdo-1',
    title: '삼도이동 1지구 토지임대부 분양주택',
    managementNumber: '2026000434',
    location: '제주특별자치도 제주시 삼도이동 1244-1 외 0필지',
    announcementDate: '2026-10-27',
    document: { fileName: '(최종1.8)삼도이동 1지구 토지임대부 분양주택 입주자모집공고문.hwp', sha256: D1_HASH, paragraphCount: 3754, isOfficial: false },
    inventory: {
      total: 32, special: 26, general: 6,
      bySupplyType: { YOUTH: 5, NEWLYWED: 5, NEWBORN: 11, FIRST_HOME: 5, GENERAL: 6 },
      institutionalRecommendation: 0,
    },
    units: [
      { unitType: '49A', supplyCount: 8, prices: [{ floor: '2층', priceKrw: 242_256_000 }, { floor: '3층', priceKrw: 247_303_000 }, { floor: '4~9층', priceKrw: 252_350_000 }], monthlyLandRentKrw: 247_050 },
      { unitType: '59A', supplyCount: 24, prices: [{ floor: '2층', priceKrw: 290_240_000 }, { floor: '3층', priceKrw: 296_287_000 }, { floor: '4~9층', priceKrw: 302_334_000 }], monthlyLandRentKrw: 298_840 },
    ],
    schedule: { ...commonSchedule, winnerAnnouncement: '2026-11-24' },
    sourceLocators: {
      overview: locator(D1_HASH, '9-10'), inventory: locator(D1_HASH, '380-489'), prices: locator(D1_HASH, '499-590'),
      landRent: locator(D1_HASH, '734-744'), schedule: locator(D1_HASH, '329-345'), eligibility: locator(D1_HASH, '1568-2401'),
    },
  },
  'samdo-2': {
    id: 'samdo-2',
    title: '삼도이동 2지구 토지임대부 분양주택',
    managementNumber: '2026000435',
    location: '제주특별자치도 제주시 삼도이동 1246-1 외 4필지',
    announcementDate: '2026-10-27',
    document: { fileName: '(최종1.8)삼도이동 2지구 토지임대부 분양주택 입주자모집공고문.hwp', sha256: D2_HASH, paragraphCount: 3757, isOfficial: false },
    inventory: {
      total: 40, special: 32, general: 8,
      bySupplyType: { YOUTH: 6, NEWLYWED: 6, NEWBORN: 14, FIRST_HOME: 6, GENERAL: 8 },
      institutionalRecommendation: 0,
    },
    units: [
      { unitType: '49A', supplyCount: 8, prices: [{ floor: '2층', priceKrw: 241_927_000 }, { floor: '3층', priceKrw: 246_967_000 }, { floor: '4~9층', priceKrw: 252_007_000 }], monthlyLandRentKrw: 283_920 },
      { unitType: '59A', supplyCount: 32, prices: [{ floor: '2층', priceKrw: 289_898_000 }, { floor: '3층', priceKrw: 295_937_000 }, { floor: '4~9층', priceKrw: 301_977_000 }], monthlyLandRentKrw: 343_440 },
    ],
    schedule: { ...commonSchedule, winnerAnnouncement: '2026-11-25' },
    sourceLocators: {
      overview: locator(D2_HASH, '9-10'), inventory: locator(D2_HASH, '380-489'), prices: locator(D2_HASH, '499-590'),
      landRent: locator(D2_HASH, '735-744'), schedule: locator(D2_HASH, '329-345'), eligibility: locator(D2_HASH, '1569-2402'),
    },
  },
};

export const samdoDistrict = (id: SamdoDistrictId): SamdoDistrictConfig => SAMDO_DISTRICTS[id];
