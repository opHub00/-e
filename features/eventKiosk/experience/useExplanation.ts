import { useMemo } from 'react';
import type { KioskOutcome } from '../evaluate';
import { kioskEvent } from '../kioskEvent';
import { cautionLines, evidenceOnlyFacts, explainOutcome, type ListingExplanation } from './explain';

export { cautionLines };

/** 화면에서 쓰는 설명. 결과가 같으면 다시 만들지 않는다. */
export function useListingExplanation(outcome: KioskOutcome): ListingExplanation {
  return useMemo(() => {
    const load = kioskEvent();
    return explainOutcome(outcome, load.ok ? evidenceOnlyFacts(load.event.dataset) : new Set());
  }, [outcome]);
}
