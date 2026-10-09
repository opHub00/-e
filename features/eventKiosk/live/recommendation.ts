import type { KioskEvaluation, KioskOutcome, OfficialScoreState, WanpanLevel } from '../evaluate.ts';
import { WANPAN_LEVEL_LABELS } from '../presentation.ts';
import type { ListingApplicationStatus, ListingHighlight, ListingLocation, ListingMediaImage, ServiceListing, ServiceListingPortfolio } from './types.ts';

export type RecommendationAssessmentStatus = KioskOutcome['status'] | 'INFORMATION_ONLY';

export type RecommendationItem = {
  id: string;
  listing: Pick<ServiceListing, 'canonicalKey' | 'title' | 'housingName' | 'provider' | 'sourceUrl' | 'assessmentAvailability'>;
  supplyType: string;
  assessmentStatus: RecommendationAssessmentStatus;
  priority: { rank: number | null; label: string | null };
  officialScore: {
    status: OfficialScoreState['status'];
    total: number | null;
    max: number | null;
    reason: string | null;
  };
  wanpanRecommendation: { level: WanpanLevel | 'unavailable'; label: string };
  whyMatched: string[];
  cautions: string[];
  missingDocuments: string[];
  applicationDates: { start: string | null; end: string | null; status: ListingApplicationStatus };
  location: ListingLocation;
  primaryImage: ListingMediaImage | null;
  nearbyHighlights: ListingHighlight[];
  favorite: boolean;
  rank: number;
};

export type RecommendationPortfolio = {
  schemaVersion: 1;
  generatedAt: string;
  items: RecommendationItem[];
  counts: Record<RecommendationAssessmentStatus, number>;
};

type Unranked = Omit<RecommendationItem, 'rank'> & { sortKey: readonly [number, number, number, number, string, string] };

export function buildRecommendationPortfolio(input: {
  listings: ServiceListingPortfolio;
  evaluation: KioskEvaluation;
  favoriteIds: readonly string[];
}): RecommendationPortfolio {
  const favorites = new Set(input.favoriteIds);
  const byAssessmentId = new Map(
    input.listings.listings
      .filter(listing => listing.assessmentListingId)
      .map(listing => [listing.assessmentListingId!, listing]),
  );
  const assessed = input.evaluation.outcomes.flatMap(outcome => {
    const listing = byAssessmentId.get(outcome.listing.listingId);
    return listing ? [fromOutcome(listing, outcome, favorites.has(outcome.id))] : [];
  });
  const informationOnly = input.listings.listings
    .filter(listing => listing.assessmentAvailability === 'INFORMATION_ONLY')
    .flatMap(listing => (listing.supplyTypes.length ? listing.supplyTypes : ['공급유형 확인 필요'])
      .map((supplyType, index) => fromInformationOnly(listing, supplyType, favorites.has(listing.canonicalKey) || favorites.has(`${listing.canonicalKey}:${index}`))));
  const ranked = [...assessed, ...informationOnly]
    .sort(compareRecommendation)
    .map(({ sortKey: _sortKey, ...item }, index) => ({ ...item, rank: index + 1 }));
  const counts = { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0, INFORMATION_ONLY: 0 } satisfies Record<RecommendationAssessmentStatus, number>;
  for (const item of ranked) counts[item.assessmentStatus] += 1;
  return { schemaVersion: 1, generatedAt: input.evaluation.evaluatedAt, items: ranked, counts };
}

function fromOutcome(listing: ServiceListing, outcome: KioskOutcome, favorite: boolean): Unranked {
  const whyMatched = unique([...outcome.advantages, ...listing.sellingPoints.map(item => item.text)]).slice(0, 5);
  const cautions = unique([...outcome.cautions, ...listing.locationCautions.map(item => item.text)]).slice(0, 5);
  return {
    id: outcome.id,
    listing: listingIdentity(listing),
    supplyType: outcome.supplyLabel,
    assessmentStatus: outcome.status,
    priority: {
      rank: outcome.result?.priority.status === 'DETERMINED' ? outcome.result.priority.rank : null,
      label: outcome.stageLabel,
    },
    officialScore: {
      status: outcome.officialScoreState.status,
      total: outcome.officialScore?.total ?? null,
      max: outcome.officialScore?.max ?? null,
      reason: outcome.officialScoreState.reason,
    },
    wanpanRecommendation: { level: outcome.wanpan.level, label: WANPAN_LEVEL_LABELS[outcome.wanpan.level] },
    whyMatched,
    cautions,
    missingDocuments: unique(outcome.requiredDocuments),
    applicationDates: { start: listing.applicationStart, end: listing.applicationEnd, status: listing.applicationStatus },
    location: { ...listing.location },
    primaryImage: listing.media.primary ? { ...listing.media.primary } : null,
    nearbyHighlights: listing.sellingPoints.map(item => ({ ...item, evidence: { ...item.evidence } })),
    favorite,
    sortKey: [
      assessmentOrder(outcome.status),
      outcome.missing.length,
      outcome.result?.matchedRules.length ? 0 : 1,
      scheduleOrder(listing.applicationStatus),
      listing.title,
      outcome.supplyLabel,
    ],
  };
}

function fromInformationOnly(listing: ServiceListing, supplyType: string, favorite: boolean): Unranked {
  return {
    id: `${listing.canonicalKey}:${supplyType}`,
    listing: listingIdentity(listing),
    supplyType,
    assessmentStatus: 'INFORMATION_ONLY',
    priority: { rank: null, label: null },
    officialScore: { status: 'PENDING', total: null, max: null, reason: '검수된 판정 규칙이 아직 연결되지 않았어요.' },
    wanpanRecommendation: { level: 'unavailable', label: '공고 정보만 제공' },
    whyMatched: listing.sellingPoints.map(item => item.text).slice(0, 5),
    cautions: unique(['자격 판정 전 공고예요. 공식 공고에서 신청 조건을 확인해 주세요.', ...listing.locationCautions.map(item => item.text)]).slice(0, 5),
    missingDocuments: [],
    applicationDates: { start: listing.applicationStart, end: listing.applicationEnd, status: listing.applicationStatus },
    location: { ...listing.location },
    primaryImage: listing.media.primary ? { ...listing.media.primary } : null,
    nearbyHighlights: listing.sellingPoints.map(item => ({ ...item, evidence: { ...item.evidence } })),
    favorite,
    sortKey: [assessmentOrder('INFORMATION_ONLY'), 0, 2, scheduleOrder(listing.applicationStatus), listing.title, supplyType],
  };
}

function listingIdentity(listing: ServiceListing): RecommendationItem['listing'] {
  return {
    canonicalKey: listing.canonicalKey,
    title: listing.title,
    housingName: listing.housingName,
    provider: listing.provider,
    sourceUrl: listing.sourceUrl,
    assessmentAvailability: listing.assessmentAvailability,
  };
}

function assessmentOrder(status: RecommendationAssessmentStatus): number {
  return ({ COMPLETE: 0, NEEDS_USER_INPUT: 1, INFORMATION_ONLY: 2, INELIGIBLE: 3, UNAVAILABLE: 4 })[status];
}
function scheduleOrder(status: ListingApplicationStatus): number {
  return ({ OPEN: 0, UPCOMING: 1, UNKNOWN: 2, CLOSED: 3 })[status];
}
function compareRecommendation(a: Unranked, b: Unranked): number {
  for (let index = 0; index < a.sortKey.length; index += 1) {
    const left = a.sortKey[index]!;
    const right = b.sortKey[index]!;
    const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'ko');
    if (compared) return compared;
  }
  return a.id.localeCompare(b.id);
}
const unique = (items: readonly string[]) => [...new Set(items.filter(Boolean))];
