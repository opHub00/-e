import type { KioskOutcome, WanpanLevel } from '../evaluate.ts';
import type { ListingExplanation } from '../experience/explain.ts';
import { cautionLines } from '../experience/explain.ts';
import type { ServiceListing } from '../live/types.ts';
import { formatDistance, locationOf, nearbyHighlights, POI_CATEGORY_LABELS } from '../location/locationModel.ts';
import { listingMediaOf, type ListingMedia } from '../media/listingMedia.ts';
import { humanize, humanizeAll, kioskStatusLabel, officialScoreStatusLabel, WANPAN_LEVEL_LABELS } from '../presentation.ts';

/**
 * Listing Card V2 의 화면 모델. 카드가 그리는 모든 값이 여기 한 곳에 모인다.
 * 데이터가 없는 칸은 null/빈 배열이고, 카드는 그 칸을 조용히 뺀다(자리만 남는 빈 칸 없음).
 *
 * 공식 배점(officialScore)과 완판e 추천(recommendation)은 다른 필드·다른 모양이다. 숫자 점수로 합치지 않는다.
 */
export type CardTone = 'eligible' | 'review' | 'difficult' | 'info';

export type ListingCardModel = {
  key: string;
  rank: number | null;
  title: string;
  /** 공급유형 · 주택유형 · 지역 같은 한 줄. */
  subtitle: string | null;
  status: { tone: CardTone; label: string };
  stage: string | null;
  media: ListingMedia | null;
  housingType: string;
  district: string;
  location: { label: string } | null;
  application: { label: string; state: 'OPEN' | 'UPCOMING' | 'CLOSED' | 'UNKNOWN'; stateLabel: string } | null;
  recommendation: { label: string; level: WanpanLevel } | null;
  officialScore: { title: string; detail: string | null; available: boolean } | null;
  nearby: { key: string; label: string; distance: string }[];
  advantages: string[];
  cautions: string[];
  /** 카드 아래 짧은 안내(예: 판정에 포함하지 않은 이유). */
  note: string | null;
};

const dot = (date: string | null | undefined) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5).replace('-', '.') : null);

export const APPLICATION_STATE_LABELS = { OPEN: '접수 중', UPCOMING: '접수 예정', CLOSED: '접수 마감', UNKNOWN: '일정 확인 필요' } as const;

type ApplicationState = keyof typeof APPLICATION_STATE_LABELS;

function applicationOf(start: string | null | undefined, end: string | null | undefined, state: ApplicationState): ListingCardModel['application'] {
  const from = dot(start);
  const to = dot(end);
  if (!from && !to && state === 'UNKNOWN') return null;
  const label = from || to ? `접수 ${from ?? '미정'} ~ ${to ?? '미정'}` : '접수 일정 미정';
  return { label, state, stateLabel: APPLICATION_STATE_LABELS[state] };
}

function nearbyOf(record: Record<string, unknown>): ListingCardModel['nearby'] {
  const { nearby } = locationOf(record);
  return nearbyHighlights(nearby).map(place => ({
    key: place.id,
    label: `${POI_CATEGORY_LABELS[place.category]} ${place.name}`,
    distance: formatDistance(place).primary,
  }));
}

const RECRUITMENT_STATE = { open: 'OPEN', upcoming: 'UPCOMING', closed: 'CLOSED', unknown: 'UNKNOWN' } as const;

/** 판정 결과 카드. 기존 카드의 의미(상태·순위·공식 배점 상태·완판e 추천·유리/확인 조건)를 그대로 옮긴다. */
export function cardModelFromOutcome(outcome: KioskOutcome, explanation: ListingExplanation): ListingCardModel {
  const listing = outcome.listing as typeof outcome.listing & Record<string, unknown>;
  const { location } = locationOf(listing);
  const official = outcome.officialScore
    ? { title: `${outcome.officialScore.total} / ${outcome.officialScore.max}점`, detail: '모집공고 배점표 기준', available: true }
    : { title: explanation.score.title ?? officialScoreStatusLabel(outcome.officialScoreState.status), detail: null, available: false };
  return {
    key: outcome.id,
    rank: outcome.rank,
    title: listing.title,
    subtitle: `${outcome.supplyType ? `${outcome.supplyLabel} · ` : ''}${listing.housingType} · ${listing.district}`,
    status: { tone: outcome.bucket, label: kioskStatusLabel(outcome.status, outcome.unavailableReason) },
    stage: outcome.stageLabel ? humanize(outcome.stageLabel) : null,
    media: listingMediaOf(listing),
    housingType: listing.housingType,
    district: listing.district,
    location: location?.address ? { label: location.address } : listing.address ? { label: listing.address } : null,
    application: applicationOf(listing.recruitment?.startDate, listing.recruitment?.endDate, RECRUITMENT_STATE[listing.recruitment?.status ?? 'unknown']),
    recommendation: { label: WANPAN_LEVEL_LABELS[outcome.wanpan.level], level: outcome.wanpan.level },
    officialScore: official,
    nearby: nearbyOf(listing),
    advantages: humanizeAll(outcome.advantages).slice(0, 2),
    cautions: cautionLines(explanation).slice(0, 2),
    note: null,
  };
}

/** 실시간 공고(판정 규칙이 없는 정보 제공용 포함). 판정 상태 대신 '공고 정보만 제공'으로 표시한다. */
export function cardModelFromServiceListing(listing: ServiceListing): ListingCardModel {
  const record = listing as unknown as Record<string, unknown>;
  const { location } = locationOf(record);
  const assessable = listing.assessmentAvailability === 'ASSESSABLE';
  return {
    key: listing.canonicalKey,
    rank: null,
    title: listing.title,
    subtitle: listing.supplyTypes.length ? listing.supplyTypes.join(' · ') : null,
    status: assessable ? { tone: 'info', label: '분석 가능 공고' } : { tone: 'info', label: '공고 정보만 제공' },
    stage: null,
    media: listing.media,
    housingType: listing.supplyTypes.join(' · ') || '공고',
    district: listing.region,
    location: location?.address ? { label: location.address } : listing.address ? { label: listing.address } : null,
    application: applicationOf(listing.applicationStart, listing.applicationEnd, listing.applicationStatus),
    recommendation: null,
    officialScore: null,
    nearby: nearbyOf(record),
    advantages: [],
    cautions: [],
    note: assessable ? null : '검수된 Rule Package가 없어 자격 판정에는 포함하지 않아요.',
  };
}
