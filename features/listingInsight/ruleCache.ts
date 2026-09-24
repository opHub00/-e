import type { AnnouncementRules } from '../applicationAssessment/types.ts';

/**
 * listing 별 규칙 조회를 한 번만 하게 만드는 메모리 캐시.
 *
 * 규칙은 listing 1건당 RPC 1회다. 목록에서 전부 미리 부르면 공고 수만큼 요청이 나간다.
 * 그래서 (1) 화면에 보이는 카드만, (2) listingId 기준으로 캐시하고,
 * (3) 같은 listing 에 대해 진행 중인 요청이 있으면 그 약속을 함께 쓴다.
 * 결과가 없는 listing(규칙 미연결)도 "없음"으로 기억해서 다시 묻지 않는다.
 */
export type RuleLookupResult = { status: 'AVAILABLE'; rules: AnnouncementRules } | { status: 'NONE' };
export type RuleLookup = (listingId: string) => Promise<RuleLookupResult>;

export type RuleCacheStats = { requests: number; hits: number; inflightJoins: number; lookups: number };

export class ListingRuleCache {
  private readonly lookup: RuleLookup;
  private readonly resolved = new Map<string, RuleLookupResult>();
  private readonly inflight = new Map<string, Promise<RuleLookupResult>>();
  private readonly stats: RuleCacheStats = { requests: 0, hits: 0, inflightJoins: 0, lookups: 0 };

  constructor(lookup: RuleLookup) { this.lookup = lookup; }

  /** 이미 받아 둔 값. 렌더 중에 동기적으로 읽는다. */
  peek(listingId: string): RuleLookupResult | undefined { return this.resolved.get(listingId); }

  async get(listingId: string): Promise<RuleLookupResult> {
    this.stats.requests += 1;
    const cached = this.resolved.get(listingId);
    if (cached) { this.stats.hits += 1; return cached; }
    const pending = this.inflight.get(listingId);
    if (pending) { this.stats.inflightJoins += 1; return pending; }
    this.stats.lookups += 1;
    const request = this.lookup(listingId)
      .then(result => { this.resolved.set(listingId, result); return result; })
      .catch(() => {
        // 실패는 기억하지 않는다. 다음에 다시 보일 때 한 번 더 시도할 수 있어야 한다.
        const miss: RuleLookupResult = { status: 'NONE' };
        return miss;
      })
      .finally(() => { this.inflight.delete(listingId); });
    this.inflight.set(listingId, request);
    return request;
  }

  /** 스모크와 테스트에서 실제 호출 수를 세는 데 쓴다. */
  snapshotStats(): RuleCacheStats { return { ...this.stats }; }
}
