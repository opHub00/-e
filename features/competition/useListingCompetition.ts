import { useEffect, useMemo, useState } from 'react';
import type { DiscoveryListing } from '../discovery/types.ts';
import {
  attachCompetitionStatus,
  deriveListingCompetitionStatus,
  getCompetitionIdentifier,
  isCompetitionApiPayload,
  type CompetitionApiPayload,
  type ListingCompetition,
  type ListingCompetitionStatus,
} from './domain.ts';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const CLIENT_CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

type CacheEntry = { payload: CompetitionApiPayload; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CompetitionApiPayload>>();

export type ListingCompetitionSnapshot = {
  requestStatus: 'idle' | 'loading' | 'ready' | 'error';
  status: ListingCompetitionStatus;
  competition: ListingCompetition | null;
  error: string | null;
  retry: () => void;
};

export function useListingCompetition(listing: DiscoveryListing | null | undefined): ListingCompetitionSnapshot {
  const identifier = useMemo(() => listing ? getCompetitionIdentifier(listing) : null, [listing]);
  const immediateStatus = deriveListingCompetitionStatus(listing?.recruitmentStatus ?? 'unknown', 0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<ListingCompetitionSnapshot, 'retry'>>({
    requestStatus: listing?.recruitmentStatus === 'closed' && identifier ? 'loading' : 'idle',
    status: immediateStatus,
    competition: null,
    error: null,
  });

  useEffect(() => {
    let disposed = false;
    if (!listing || !identifier || listing.recruitmentStatus !== 'closed') {
      setState({
        requestStatus: 'idle',
        status: immediateStatus,
        competition: null,
        error: null,
      });
      return () => { disposed = true; };
    }

    setState((current) => ({ ...current, requestStatus: 'loading', error: null }));
    void fetchCompetition(identifier, attempt > 0).then((payload) => {
      if (disposed) return;
      const competition = attachCompetitionStatus(listing, payload);
      setState({
        requestStatus: 'ready',
        status: competition.status,
        competition,
        error: null,
      });
    }).catch(() => {
      if (disposed) return;
      setState({
        requestStatus: 'error',
        status: 'not_available',
        competition: null,
        error: '공식 경쟁정보를 잠시 확인할 수 없어요.',
      });
    });
    return () => { disposed = true; };
  }, [attempt, identifier, immediateStatus, listing]);

  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

export async function fetchCompetition(
  identifier: NonNullable<ReturnType<typeof getCompetitionIdentifier>>,
  bypassClientCache = false,
  fetcher: typeof fetch = fetch.bind(globalThis),
): Promise<CompetitionApiPayload> {
  const key = `${identifier.sourceType}:${identifier.houseManageNo}:${identifier.pblancNo}`;
  const cached = cache.get(key);
  if (!bypassClientCache && cached && cached.expiresAt > Date.now()) return cached.payload;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = requestCompetition(identifier, fetcher).then((payload) => {
    cache.set(key, { payload, expiresAt: Date.now() + CLIENT_CACHE_MS });
    return payload;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

async function requestCompetition(
  identifier: NonNullable<ReturnType<typeof getCompetitionIdentifier>>,
  fetcher: typeof fetch,
): Promise<CompetitionApiPayload> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('competition endpoint is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/competition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(identifier),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isCompetitionApiPayload(payload)) throw new Error(`competition HTTP ${response.status}`);
    if (payload.identifier.houseManageNo !== identifier.houseManageNo
      || payload.identifier.pblancNo !== identifier.pblancNo
      || payload.identifier.sourceType !== identifier.sourceType) {
      throw new Error('competition identifier mismatch');
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}
