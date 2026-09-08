import type { DiscoveryListing } from '../discovery/types.ts';
import type {
  ApplyHomeCompetitionIdentifier,
  CompetitionRow,
  SpecialSupplyCompetitionRow,
} from './auditAdapter.ts';

export type ListingCompetitionSourceType = 'apt' | 'remnant';
export type ListingCompetitionStatus =
  | 'available'
  | 'in_progress'
  | 'not_started'
  | 'not_available';

export type ListingCompetition = {
  schemaVersion: 1;
  identifier: ApplyHomeCompetitionIdentifier & { sourceType: ListingCompetitionSourceType };
  status: ListingCompetitionStatus;
  generalRows: CompetitionRow[];
  specialSupplyRows: SpecialSupplyCompetitionRow[];
  source: {
    provider: '한국부동산원 청약Home';
    dataset: '청약접수 경쟁률 및 특별공급 신청현황';
    fetchedAt: string;
    cache: 'hit' | 'miss' | 'unavailable';
    partial: boolean;
  };
};

export type CompetitionApiPayload = Omit<ListingCompetition, 'status'>;

export type CompetitionAiSummary = {
  source: '한국부동산원 청약Home';
  status: ListingCompetitionStatus;
  rows: Array<{
    scope: string;
    suppliedUnits: number;
    applicants: number;
    rate: string;
  }>;
  disclaimer: string;
};

export const COMPETITION_CACHE_TTL_MS = 10 * 60 * 1000;
export const COMPETITION_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

export function getCompetitionCacheTtlMs(rowCount: number): number {
  return Number.isInteger(rowCount) && rowCount > 0
    ? COMPETITION_CACHE_TTL_MS
    : COMPETITION_NEGATIVE_CACHE_TTL_MS;
}

export function isCompetitionCacheFresh(expiresAt: string, now = new Date()): boolean {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function getCompetitionIdentifier(listing: DiscoveryListing): (
  ApplyHomeCompetitionIdentifier & { sourceType: ListingCompetitionSourceType }
) | null {
  const identifiers = listing.sourceIdentifiers;
  if (!identifiers) return null;
  const sourceType = listing.sourceType === 'applyhome-apt'
    ? 'apt'
    : listing.sourceType === 'applyhome-remnant'
      ? 'remnant'
      : null;
  if (!sourceType) return null;
  if (!isIdentifier(identifiers.houseManageNo) || !isIdentifier(identifiers.pblancNo)) return null;
  return { ...identifiers, sourceType };
}

export function deriveListingCompetitionStatus(
  recruitmentStatus: DiscoveryListing['recruitmentStatus'],
  rowCount: number,
): ListingCompetitionStatus {
  if (recruitmentStatus === 'upcoming') return 'not_started';
  if (recruitmentStatus === 'open') return 'in_progress';
  if (recruitmentStatus === 'closed' && rowCount > 0) return 'available';
  return 'not_available';
}

export function attachCompetitionStatus(
  listing: DiscoveryListing,
  payload: CompetitionApiPayload,
): ListingCompetition {
  return {
    ...payload,
    status: deriveListingCompetitionStatus(
      listing.recruitmentStatus,
      payload.generalRows.length + payload.specialSupplyRows.length,
    ),
  };
}

export function isCompetitionApiPayload(value: unknown): value is CompetitionApiPayload {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!isRecord(value.identifier) || !isIdentifier(value.identifier.houseManageNo)
    || !isIdentifier(value.identifier.pblancNo)
    || (value.identifier.sourceType !== 'apt' && value.identifier.sourceType !== 'remnant')) return false;
  if (!Array.isArray(value.generalRows) || value.generalRows.length > 300) return false;
  if (!Array.isArray(value.specialSupplyRows) || value.specialSupplyRows.length > 300) return false;
  if (!value.generalRows.every(isGeneralRow) || !value.specialSupplyRows.every(isSpecialRow)) return false;
  if (!isRecord(value.source)
    || value.source.provider !== '한국부동산원 청약Home'
    || value.source.dataset !== '청약접수 경쟁률 및 특별공급 신청현황'
    || !isIsoDate(value.source.fetchedAt)
    || !['hit', 'miss', 'unavailable'].includes(String(value.source.cache))
    || typeof value.source.partial !== 'boolean') return false;
  return true;
}

/** AI에는 공식 숫자와 범위만 최대 8행 전달한다. listing id나 profile은 포함하지 않는다. */
export function buildCompetitionAiSummary(
  competition: ListingCompetition | null,
): CompetitionAiSummary | null {
  if (!competition || competition.status !== 'available') return null;
  const general = competition.generalRows.slice(0, 6).map((row) => ({
    scope: [row.housingType, row.rankCode ? `${row.rankCode}순위` : null, row.residenceName]
      .filter(Boolean).join(' · '),
    suppliedUnits: row.suppliedUnits ?? 0,
    applicants: row.applicants ?? 0,
    rate: safeRateLabel(row.officialCompetitionRate, row.officialCompetitionRateLabel, row.applicants),
  }));
  const special = competition.specialSupplyRows.slice(0, Math.max(0, 8 - general.length)).map((row) => ({
    scope: `${row.housingType} · 특별공급 ${row.category}`,
    suppliedUnits: row.suppliedUnits,
    applicants: row.applicants,
    rate: row.calculatedCompetitionRate === null
      ? '계산 불가'
      : `${row.calculatedCompetitionRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} : 1 (공식 건수로 계산)`,
  }));
  return {
    source: '한국부동산원 청약Home',
    status: competition.status,
    rows: [...general, ...special],
    disclaimer: '공식 접수 결과를 범위별로 표시한 참고 정보이며 당첨 확률이 아닙니다.',
  };
}

function safeRateLabel(rate: number | null, label: string | null, applicants: number | null): string {
  if (rate !== null) return `${rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} : 1`;
  if (applicants === 0) return '신청 없음';
  const deficit = label?.match(/[△▲]\s*([\d,]+)/);
  return deficit ? `미달 ${deficit[1]}세대` : '공식 경쟁률 확인 필요';
}

function isGeneralRow(value: unknown): value is CompetitionRow {
  if (!isRecord(value)) return false;
  return isIdentifier(value.houseManageNo) && isIdentifier(value.pblancNo)
    && typeof value.housingType === 'string' && value.housingType.length > 0
    && isNullableNonNegativeInteger(value.suppliedUnits)
    && isNullableNonNegativeInteger(value.applicants)
    && isNullableNonNegativeNumber(value.officialCompetitionRate)
    && (value.officialCompetitionRateLabel === null || typeof value.officialCompetitionRateLabel === 'string');
}

function isSpecialRow(value: unknown): value is SpecialSupplyCompetitionRow {
  if (!isRecord(value)) return false;
  return isIdentifier(value.houseManageNo) && isIdentifier(value.pblancNo)
    && typeof value.housingType === 'string' && value.housingType.length > 0
    && typeof value.category === 'string'
    && Number.isInteger(value.suppliedUnits) && Number(value.suppliedUnits) >= 0
    && Number.isInteger(value.applicants) && Number(value.applicants) >= 0
    && isNullableNonNegativeNumber(value.calculatedCompetitionRate);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-Za-z_-]{1,40}$/.test(value);
}

function isNullableNonNegativeInteger(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Number(value) >= 0);
}

function isNullableNonNegativeNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
