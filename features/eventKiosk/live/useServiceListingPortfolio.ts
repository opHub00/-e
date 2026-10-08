import { useEffect, useMemo, useState } from 'react';
import type { FrozenListingDataset } from '../frozen/domain/rules.ts';
import { frozenOnlyPortfolio } from './portfolio.ts';
import type { ServiceListingPortfolio } from './types.ts';

let cached: ServiceListingPortfolio | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function isPortfolio(value: unknown): value is ServiceListingPortfolio {
  const portfolio = value as ServiceListingPortfolio;
  return Boolean(
    portfolio
    && portfolio.schemaVersion === 1
    && typeof portfolio.generatedAt === 'string'
    && Array.isArray(portfolio.listings)
    && Array.isArray(portfolio.sources),
  );
}

export function useServiceListingPortfolio(dataset: FrozenListingDataset | null) {
  const freshCache = cached && Date.now() - cachedAt < CACHE_MS ? cached : null;
  const fallback = useMemo(
    () => dataset ? frozenOnlyPortfolio(dataset, new Date().toISOString(), 'LIVE_SOURCE_NOT_LOADED') : null,
    [dataset],
  );
  const [portfolio, setPortfolio] = useState<ServiceListingPortfolio | null>(freshCache ?? fallback);
  const [loading, setLoading] = useState(!freshCache);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!dataset || !fallback) {
      setLoading(false);
      return () => controller.abort();
    }
    if (cached && Date.now() - cachedAt < CACHE_MS) {
      setPortfolio(cached);
      setLoading(false);
      return () => { active = false; controller.abort(); };
    }
    fetch('/event-api/listings', { signal: controller.signal, headers: { accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error('LIVE_LISTINGS_FAILED');
        const next = await response.json();
        if (!isPortfolio(next)) throw new Error('LIVE_LISTINGS_INVALID');
        cached = next;
        cachedAt = Date.now();
        if (active) setPortfolio(next);
      })
      .catch(() => { if (active) setPortfolio(fallback); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [dataset, fallback]);

  return { portfolio, loading };
}

export function clearServiceListingCacheForTests() {
  cached = null;
  cachedAt = 0;
}
