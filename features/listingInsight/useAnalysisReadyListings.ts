import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../auth/supabaseClient';
import type { DiscoveryListing } from '../discovery/types';
import { readBoundListings, type BindingReadClient } from './analyzableListings';

/**
 * 분석 가능 공고(활성·공개·승인된 rule set 과 binding 이 있는 listing) 목록.
 *
 * 화면당 한 번만 조회한다. 섹션과 일반 목록이 같은 결과를 함께 쓰기 위해 이 훅을 부모에 둔다.
 * 섹션이 보여준 공고를 일반 목록에서 빼려면, 부모가 "섹션이 실제로 무엇을 보여줬는지"를 알아야 한다.
 */
let boundPromise: Promise<string[]> | null = null;
const loadBoundListingIds = (): Promise<string[]> => {
  if (!boundPromise) {
    const client = getSupabaseClient();
    boundPromise = client
      ? readBoundListings(client as unknown as BindingReadClient).then(rows => rows.map(row => row.listingId)).catch(() => [])
      : Promise.resolve([]);
  }
  return boundPromise;
};

export type AnalysisReadyState = {
  /** 조회 중에는 LOADING. 실패는 빈 결과와 같게 다뤄 일반 목록을 건드리지 않는다. */
  status: 'LOADING' | 'READY';
  /** 섹션이 실제로 보여줄 공고. dataset 에 없는 binding 은 제외된다. */
  listings: DiscoveryListing[];
  ids: string[];
};

export function useAnalysisReadyListings(listings: DiscoveryListing[]): AnalysisReadyState {
  const [boundIds, setBoundIds] = useState<string[] | null>(null);
  useEffect(() => {
    let current = true;
    void loadBoundListingIds().then(ids => { if (current) setBoundIds(ids); });
    return () => { current = false; };
  }, []);

  return useMemo(() => {
    if (boundIds === null) return { status: 'LOADING', listings: [], ids: [] };
    const bound = new Set(boundIds);
    const matched = listings.filter(listing => bound.has(listing.id));
    return { status: 'READY', listings: matched, ids: matched.map(listing => listing.id) };
  }, [boundIds, listings]);
}
