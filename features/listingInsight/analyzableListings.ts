import type { AnnouncementRules } from '../applicationAssessment/types.ts';

/**
 * "완판e가 분석할 수 있는 공고" 판별.
 *
 * 새 테이블도 새 RPC 도 만들지 않는다. announcement_listing_bindings 를 그대로 읽으면 된다:
 * 이 테이블의 select 정책은 "그 공고에 보이는 rule set 이 있을 때"이고, rule set 은
 * 활성·공개·승인된 것만 보인다. 그래서 이 한 번의 조회 결과가 곧
 * (active + public + approved + binding 존재) 를 모두 만족하는 listing 목록이다.
 */
export type BoundListing = { listingId: string; announcementId: string };

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };
export type BindingReadClient = { from: (table: string) => { select: (columns: string) => PromiseLike<QueryResult> } };

export async function readBoundListings(client: BindingReadClient): Promise<BoundListing[]> {
  const { data, error } = await client.from('announcement_listing_bindings').select('listing_id,announcement_id');
  if (error || !Array.isArray(data)) return [];
  const out: BoundListing[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const listingId = typeof record.listing_id === 'string' ? record.listing_id : '';
    const announcementId = typeof record.announcement_id === 'string' ? record.announcement_id : '';
    if (listingId && announcementId) out.push({ listingId, announcementId });
  }
  return out;
}

/**
 * 분석 가능 섹션이 실제로 보여준 공고를 일반 목록에서 한 번만 빼기 위한 필터.
 *
 * 일반 목록의 filterListings 는 건드리지 않는다. 이미 걸러진 결과에서 섹션이 맡은 공고만 뺀다.
 * 섹션이 아무것도 못 보여줬으면(조회 실패·빈 결과) 일반 목록은 그대로 둔다. 그래야 실패했을 때
 * 공고가 어디에서도 보이지 않는 일이 생기지 않는다.
 */
export function excludeAnalysisReady<T extends { id: string }>(listings: T[], analysisReadyIds: readonly string[]): T[] {
  if (!analysisReadyIds.length) return listings;
  const shown = new Set(analysisReadyIds);
  return listings.filter(listing => !shown.has(listing.id));
}

/** 활성 rule set 이 담고 있는 규칙 수. 활성 세트는 승인된 세트이므로 곧 검수 완료 규칙 수다. */
export function countApprovedRules(rules: AnnouncementRules): number {
  let total = 0;
  for (const supply of rules.supplies) {
    total += supply.eligibility.length;
    for (const stage of supply.stages) total += stage.conditions.length + (stage.scores?.length ?? 0);
  }
  return total;
}

export const SOURCE_STATUS_LABEL: Record<string, string> = {
  OFFICIAL_VERIFIED: '공식 공고 기준',
  DRAFT_SOURCE_VERIFIED: '검토본 기준',
  REFERENCE: '원문 확인 전',
};

/** 공식 검증 여부는 rule set 의 source_status 로만 말한다. 값이 없으면 단정하지 않는다. */
export const sourceStatusLabel = (status: string | undefined) => (status ? SOURCE_STATUS_LABEL[status] ?? status : '확인 불가');
