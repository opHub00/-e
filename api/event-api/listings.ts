import activeDataset from '../../data/events/jeju-event-2026-10-v1.json';
import reference from '../../data/events/jeju-live-reference-2026-10-09.json';
import officialCatalog from '../../data/events/jeju-official-listing-catalog-2026-10-09.json';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FrozenListingDataset } from '../../features/eventKiosk/frozen/domain/rules.ts';
import type { OfficialCatalogListing } from '../../features/eventKiosk/live/types.ts';

const catalogRecords = officialCatalog.records as OfficialCatalogListing[];

type PortfolioModule = typeof import('../../features/eventKiosk/live/portfolio.ts');
type SourceModule = typeof import('../../features/eventKiosk/live/source.ts');
type EnrichmentModule = typeof import('../../features/eventKiosk/live/enrichment.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

async function loadListingModules(): Promise<[PortfolioModule, SourceModule, EnrichmentModule]> {
  const root = process.cwd();
  return Promise.all([
    nativeImport(pathToFileURL(join(root, 'features/eventKiosk/live/portfolio.ts')).href) as Promise<PortfolioModule>,
    nativeImport(pathToFileURL(join(root, 'features/eventKiosk/live/source.ts')).href) as Promise<SourceModule>,
    nativeImport(pathToFileURL(join(root, 'features/eventKiosk/live/enrichment.ts')).href) as Promise<EnrichmentModule>,
  ]);
}

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
    const [{ buildServiceListingPortfolio }, { fetchOfficialJejuListings }, { enrichServiceListingPortfolio }] = await loadListingModules();
    const official = await fetchOfficialJejuListings({ now });
    const portfolio = await enrichServiceListingPortfolio(buildServiceListingPortfolio({
        now: now.toISOString(),
        fetchedAt: official.fetchedAt,
        liveRecords: official.records,
        liveSourceStatus: 'LIVE',
        frozenDataset: activeDataset as FrozenListingDataset,
        officialCatalog: catalogRecords,
      }));
    response.status(200).json({
      ...portfolio,
      transport: official.transport,
    });
  } catch {
    const [{ buildServiceListingPortfolio }] = await loadListingModules();
    response.status(200).json({
      ...buildServiceListingPortfolio({
        now: now.toISOString(),
        fetchedAt: reference.fetchedAt,
        liveRecords: reference.records,
        liveSourceStatus: 'STALE_REFERENCE',
        frozenDataset: activeDataset as FrozenListingDataset,
        officialCatalog: catalogRecords,
      }),
      transport: 'BUNDLED_REFERENCE',
    });
  }
}
