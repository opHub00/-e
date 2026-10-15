import type { Evidence } from '../../applicationAssessment/types.ts';
import type { SamdoRecommendation, SamdoSupplyType } from '../samdo/types.ts';

export type SamdoDistrictId = 'samdo-1' | 'samdo-2';
export type SamdoUnitType = '49A' | '59A';

export type SamdoSourceLocator = {
  parser: 'HWP5_RECORDS';
  sha256: string;
  paragraphRange: string;
};

export type SamdoPriceTier = {
  floor: '2층' | '3층' | '4~9층';
  priceKrw: number;
};

export type SamdoUnitEconomics = {
  unitType: SamdoUnitType;
  supplyCount: number;
  prices: SamdoPriceTier[];
  monthlyLandRentKrw: number;
};

export type SamdoDistrictSchedule = {
  special: string;
  generalFirst: string;
  generalSecond: string;
  winnerAnnouncement: string;
  documentSubmission: { start: string; end: string };
  contract: { start: string; end: string };
};

export type SamdoDistrictConfig = {
  id: SamdoDistrictId;
  title: string;
  managementNumber: string;
  location: string;
  announcementDate: string;
  document: { fileName: string; sha256: string; paragraphCount: number; isOfficial: false };
  inventory: {
    total: number;
    special: number;
    general: number;
    bySupplyType: Record<Exclude<SamdoSupplyType, 'INSTITUTIONAL_RECOMMENDATION'>, number>;
    institutionalRecommendation: number;
  };
  units: SamdoUnitEconomics[];
  schedule: SamdoDistrictSchedule;
  sourceLocators: Record<'overview' | 'inventory' | 'prices' | 'landRent' | 'schedule' | 'eligibility', SamdoSourceLocator>;
};

export type SamdoChecklistItem = {
  id: string;
  label: string;
  official: true;
  appliesTo: SamdoSupplyType[];
  condition: string;
  evidence: Evidence;
};

export type SamdoDistrictAssessment = {
  district: SamdoDistrictConfig;
  recommendation: SamdoRecommendation;
  checklist: SamdoChecklistItem[];
  specialProvisions: Array<{
    label: string;
    supplyTypes: SamdoSupplyType[];
    status: 'EVIDENCE_REQUIRED';
  }>;
};

export type SamdoDistrictComparison = {
  preferredDistrictId: SamdoDistrictId | null;
  basis: 'ELIGIBILITY' | 'PRIORITY_STAGE' | 'OFFICIAL_SCORE' | 'EVIDENCE_COMPLETENESS' | 'SUPPLY_COUNT' | 'EQUIVALENT' | 'NO_RECOMMENDATION';
  reasons: string[];
  economicContext: Array<{
    unitType: SamdoUnitType;
    district1: { priceRangeKrw: [number, number]; monthlyLandRentKrw: number };
    district2: { priceRangeKrw: [number, number]; monthlyLandRentKrw: number };
  }>;
  disclaimer: string;
};

export type SamdoDualAssessment = {
  schemaVersion: 1;
  districts: [SamdoDistrictAssessment, SamdoDistrictAssessment];
  comparison: SamdoDistrictComparison;
};

export type SamdoRagChunk = {
  id: string;
  districtId: SamdoDistrictId;
  section: string;
  kind: 'paragraph' | 'table';
  supplyTypes: SamdoSupplyType[];
  keywords: string[];
  textExcerpt: string;
  locator: {
    parser: 'HWP5_RECORDS';
    sha256: string;
    paragraphs: Array<{ index: number; stream: string; offset: number }>;
  };
};

export type SamdoRagIntent = 'COMPARISON' | 'ELIGIBILITY' | 'SCHEDULE' | 'PRICE' | 'LAND_RENT' | 'SUPPLY_COUNT' | 'LAND_LEASE' | 'OVERSEAS' | 'DOCUMENTS' | 'UNKNOWN';

export type SamdoRagRetrieval = {
  intent: SamdoRagIntent;
  districtIds: SamdoDistrictId[];
  chunks: SamdoRagChunk[];
};
