import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { ListingCard } from '../discovery/components/ListingCard';
import type { DiscoveryListing, ListingRelevance } from '../discovery/types';
import { deadlineLabel } from './domain';
import { useListingInsight } from './useListingInsight';

export type ListViewport = { height: number; scrollY: number };

type Props = {
  listing: DiscoveryListing;
  relevance: ListingRelevance;
  saved: boolean;
  viewport: ListViewport;
  today: string;
  onToggleSaved: () => void;
  onOpen: () => void;
  onStartAssessment: () => void;
};

/** 화면에 들어오기 직전까지 포함하는 여유. 스크롤 중 빈 칸이 보이지 않을 만큼만 둔다. */
const PREFETCH_BELOW = 160;
const KEEP_ABOVE = 80;

/**
 * 목록 카드 한 장. 자기가 화면 안에 들어왔을 때만 판정 규칙을 부른다.
 *
 * 목록 전체를 미리 부르면 공고 수만큼 요청이 나간다. 그래서 카드가 자기 위치를 재고,
 * 지금 보이는 범위에 걸칠 때만 enabled 를 넘긴다. 같은 listing 을 다시 묻지 않는 일은
 * useListingInsight 뒤의 캐시가 맡는다.
 */
export function InsightListingCard({ listing, relevance, saved, viewport, today, onToggleSaved, onOpen, onStartAssessment }: Props) {
  const [box, setBox] = useState<{ y: number; height: number } | null>(null);
  const measured = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setBox(previous => (previous && previous.y === y && previous.height === height ? previous : { y, height }));
  };
  const visible = Boolean(box) && viewport.height > 0
    && box!.y < viewport.scrollY + viewport.height + PREFETCH_BELOW
    && box!.y + box!.height > viewport.scrollY - KEEP_ABOVE;
  const state = useListingInsight(listing.id, visible);
  return (
    <View onLayout={measured}>
      <ListingCard
        listing={listing}
        relevance={relevance}
        saved={saved}
        onToggleSaved={onToggleSaved}
        onOpen={onOpen}
        insight={state.phase === 'READY' ? state.insight : null}
        deadline={deadlineLabel(listing.recruitmentEndDate, today)}
        onStartAssessment={onStartAssessment}
      />
    </View>
  );
}
