import { validateImportPackage } from '../applicationAssessment/server/importPackage.ts';
import type { AnnouncementRules } from '../applicationAssessment/types.ts';

/**
 * 행사 설정.
 *
 * 지역 이름, 화면 문구, 공고 목록은 전부 데이터에서 온다. 이 파일은 그 데이터를 검사해 타입을 붙일 뿐이다.
 * 잘못된 설정으로 행사 화면이 반쯤 그려지는 것보다, 처음부터 무엇이 잘못됐는지 알리는 편이 낫다.
 */
export type RecruitmentStatus = 'open' | 'upcoming' | 'closed' | 'unknown';

export type EventListing = {
  listingId: string;
  title: string;
  district: string;
  housingType: string;
  publisher: string | null;
  address: string | null;
  households: number | null;
  announcementDate: string | null;
  recruitment: { status: RecruitmentStatus; startDate: string | null; endDate: string | null };
  winnerAnnouncementDate: string | null;
  sourceUrl: string | null;
  /** 판정 규칙 패키지 키. 없으면 완판e 가 아직 이 공고를 분석할 수 없다. */
  rulePackage: string | null;
  /** 이 공고의 결과를 어떻게 읽어야 하는지. 화면이 그대로 보여준다. */
  sourceNote: string;
};

export type EventConfig = {
  id: string;
  regionLabel: string;
  /** 규칙이 기대하는 거주지 표기. 엔진 입력에 그대로 들어간다. */
  residenceRegion: string;
  copy: {
    brand: string;
    landingTitle: string;
    landingSubtitle: string;
    landingCta: string;
    introSteps: string[];
  };
  idleResetSeconds: number;
  idleWarningSeconds: number;
  /**
   * 휴대폰으로 가져가는 링크의 주소 앞부분(예: https://example.com).
   * 비우면 지금 화면의 주소를 쓴다. 행사 기기를 내부 주소로 띄우면 휴대폰이 열 수 없으니 이 값을 채운다.
   */
  shareBaseUrl: string | null;
  listings: EventListing[];
};

export type LoadedEvent = {
  config: EventConfig;
  /** listingId → 규칙. 규칙이 없는 공고는 들어 있지 않다. */
  rulesByListing: Map<string, AnnouncementRules>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`EVENT_CONFIG_INVALID:${path}`);
  return value;
};
const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const optionalNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const RECRUITMENT = new Set<RecruitmentStatus>(['open', 'upcoming', 'closed', 'unknown']);

function decodeListing(raw: unknown, index: number): EventListing {
  if (!isRecord(raw)) throw new Error(`EVENT_CONFIG_INVALID:listings.${index}`);
  const recruitment = isRecord(raw.recruitment) ? raw.recruitment : {};
  const status = String(recruitment.status ?? 'unknown') as RecruitmentStatus;
  return {
    listingId: text(raw.listingId, `listings.${index}.listingId`),
    title: text(raw.title, `listings.${index}.title`),
    district: text(raw.district, `listings.${index}.district`),
    housingType: text(raw.housingType, `listings.${index}.housingType`),
    publisher: optionalText(raw.publisher),
    address: optionalText(raw.address),
    households: optionalNumber(raw.households),
    announcementDate: optionalText(raw.announcementDate),
    recruitment: {
      status: RECRUITMENT.has(status) ? status : 'unknown',
      startDate: optionalText(recruitment.startDate),
      endDate: optionalText(recruitment.endDate),
    },
    winnerAnnouncementDate: optionalText(raw.winnerAnnouncementDate),
    sourceUrl: optionalText(raw.sourceUrl),
    rulePackage: optionalText(raw.rulePackage),
    sourceNote: text(raw.sourceNote, `listings.${index}.sourceNote`),
  };
}

export function decodeEventConfig(raw: unknown): EventConfig {
  if (!isRecord(raw)) throw new Error('EVENT_CONFIG_INVALID:root');
  const copy = isRecord(raw.copy) ? raw.copy : {};
  const steps = Array.isArray(copy.introSteps) ? copy.introSteps.filter((step): step is string => typeof step === 'string') : [];
  if (!steps.length) throw new Error('EVENT_CONFIG_INVALID:copy.introSteps');
  const listings = Array.isArray(raw.listings) ? raw.listings.map(decodeListing) : [];
  if (!listings.length) throw new Error('EVENT_CONFIG_INVALID:listings');
  const ids = new Set<string>();
  for (const listing of listings) {
    if (ids.has(listing.listingId)) throw new Error(`EVENT_CONFIG_INVALID:duplicate ${listing.listingId}`);
    ids.add(listing.listingId);
  }
  return {
    id: text(raw.id, 'id'),
    regionLabel: text(raw.regionLabel, 'regionLabel'),
    residenceRegion: text(raw.residenceRegion, 'residenceRegion'),
    copy: {
      brand: text(copy.brand, 'copy.brand'),
      landingTitle: text(copy.landingTitle, 'copy.landingTitle'),
      landingSubtitle: text(copy.landingSubtitle, 'copy.landingSubtitle'),
      landingCta: text(copy.landingCta, 'copy.landingCta'),
      introSteps: steps,
    },
    idleResetSeconds: optionalNumber(raw.idleResetSeconds) ?? 150,
    idleWarningSeconds: optionalNumber(raw.idleWarningSeconds) ?? 20,
    shareBaseUrl: optionalText(raw.shareBaseUrl)?.replace(/\/+$/, '') ?? null,
    listings,
  };
}

/**
 * 설정과 규칙 패키지를 함께 읽는다.
 *
 * 규칙은 공고와 묶여 있어야 한다. 패키지의 listingId 와 설정의 listingId 가 다르면 판정 엔진이
 * "다른 공고의 규칙"으로 보고 결과를 내지 않는다. 그 실수를 행사장이 아니라 여기서 잡는다.
 */
export function loadEvent(rawConfig: unknown, rulePackages: Record<string, unknown>): LoadedEvent {
  const config = decodeEventConfig(rawConfig);
  const rulesByListing = new Map<string, AnnouncementRules>();
  for (const listing of config.listings) {
    if (!listing.rulePackage) continue;
    const raw = rulePackages[listing.rulePackage];
    if (!raw) throw new Error(`EVENT_RULE_PACKAGE_MISSING:${listing.rulePackage}`);
    const { rules } = validateImportPackage(raw);
    if (rules.listingId !== listing.listingId) {
      throw new Error(`EVENT_RULE_LISTING_MISMATCH:${listing.listingId}`);
    }
    rulesByListing.set(listing.listingId, rules);
  }
  return { config, rulesByListing };
}
