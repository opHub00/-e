import * as applyHomeApi from '../../discovery/server/ApplyHomeApi.ts';

const applyHomeNamespace = applyHomeApi as typeof applyHomeApi & { default?: typeof applyHomeApi };
const fetchApplyHomeListings = applyHomeNamespace.fetchApplyHomeListings
  ?? applyHomeNamespace.default?.fetchApplyHomeListings;

export type OfficialListingFetchOptions = {
  now: Date;
  fetcher?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
};

function koreanRange(now: Date, days = 90) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const toDate = shifted.toISOString().slice(0, 10);
  const from = new Date(`${toDate}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

function isJeju(record: Readonly<Record<string, unknown>>): boolean {
  return [record.SUBSCRPT_AREA_CODE_NM, record.HSSPLY_ADRES].some(value =>
    (typeof value === 'string' || typeof value === 'number') && String(value).includes('제주'));
}

function configured(value: string | undefined): value is string {
  return Boolean(value?.trim() && value !== '[SENSITIVE]');
}

async function fetchThroughExistingProxy(
  supabaseUrl: string,
  anonKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const response = await fetcher(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/listings`, {
    method: 'POST',
    headers: { authorization: `Bearer ${anonKey}`, apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ days: 90, perPage: 100, maxPages: 5, geocodeLimit: 0 }),
    signal,
  });
  if (!response.ok) throw new Error('LIVE_LISTING_PROXY_FAILED');
  const body = await response.json() as { records?: unknown; fetchedAt?: unknown };
  if (!Array.isArray(body.records)) throw new Error('LIVE_LISTING_PROXY_INVALID');
  return {
    records: body.records.filter((record): record is Readonly<Record<string, unknown>> =>
      Boolean(record && typeof record === 'object' && !Array.isArray(record))).filter(isJeju),
    fetchedAt: typeof body.fetchedAt === 'string' ? body.fetchedAt : new Date().toISOString(),
  };
}

export async function fetchOfficialJejuListings(options: OfficialListingFetchOptions) {
  const fetcher = options.fetcher ?? fetch;
  const env = options.env ?? process.env;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    if (configured(env.DATA_GO_KR_SERVICE_KEY)) {
      const range = koreanRange(options.now);
      const result = await fetchApplyHomeListings({
        serviceKey: env.DATA_GO_KR_SERVICE_KEY,
        ...range,
        perPage: 100,
        maxPages: 5,
        fetcher,
        signal: controller.signal,
      });
      return { records: result.records.filter(isJeju), fetchedAt: options.now.toISOString(), transport: 'DIRECT_OFFICIAL_API' as const };
    }
    if (configured(env.EXPO_PUBLIC_SUPABASE_URL) && configured(env.EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
      const result = await fetchThroughExistingProxy(
        env.EXPO_PUBLIC_SUPABASE_URL,
        env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        fetcher,
        controller.signal,
      );
      return { ...result, transport: 'EXISTING_OFFICIAL_PROXY' as const };
    }
    throw new Error('LIVE_LISTING_SOURCE_UNCONFIGURED');
  } finally {
    clearTimeout(timeout);
  }
}
