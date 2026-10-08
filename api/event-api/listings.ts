import activeDataset from '../../data/events/jeju-event-2026-10-v1.json';
import reference from '../../data/events/jeju-live-reference-2026-10-09.json';
import { buildServiceListingPortfolio } from '../../features/eventKiosk/live/portfolio.ts';
import { fetchOfficialJejuListings } from '../../features/eventKiosk/live/source.ts';
import type { FrozenListingDataset } from '../../features/eventKiosk/frozen/domain/rules.ts';

type ApiRequest = { method?: string };
type ApiResponse = {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
  const now = new Date();
  try {
    const official = await fetchOfficialJejuListings({ now });
    response.status(200).json({
      ...buildServiceListingPortfolio({
        now: now.toISOString(),
        fetchedAt: official.fetchedAt,
        liveRecords: official.records,
        liveSourceStatus: 'LIVE',
        frozenDataset: activeDataset as FrozenListingDataset,
      }),
      transport: official.transport,
    });
  } catch {
    response.status(200).json({
      ...buildServiceListingPortfolio({
        now: now.toISOString(),
        fetchedAt: reference.fetchedAt,
        liveRecords: reference.records,
        liveSourceStatus: 'STALE_REFERENCE',
        frozenDataset: activeDataset as FrozenListingDataset,
      }),
      transport: 'BUNDLED_REFERENCE',
    });
  }
}
