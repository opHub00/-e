import { parseApplyHomeListingPayload } from './ApplyHomeListingAdapter.ts';
import type {
  ListingDataSource,
  ListingProvider,
  ListingProviderPayload,
  ListingProviderRequest,
} from './ListingProvider.ts';

type ApplyHomeListingProviderOptions = {
  supabaseUrl?: string;
  anonKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export class ApplyHomeListingProvider implements ListingProvider {
  readonly source: ListingDataSource = {
    id: 'applyhome-apt-v1',
    kind: 'applyhome',
    label: '한국부동산원 청약홈 분양정보',
  };

  private readonly endpoint?: string;
  private readonly anonKey?: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApplyHomeListingProviderOptions = {}) {
    this.endpoint = buildListingsEndpoint(options.supabaseUrl);
    this.anonKey = options.anonKey;
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async fetchListings(request: ListingProviderRequest = {}): Promise<ListingProviderPayload> {
    if (!this.endpoint || !this.anonKey) {
      logListingDev(`fetch skipped: ${!this.endpoint ? 'missing endpoint' : 'missing anon key'}`);
      throw new Error('ApplyHome Edge Function is not configured');
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    if (request.signal?.aborted) abort();
    request.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);

    try {
      logListingDev(`endpoint: ${this.endpoint}`);
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.anonKey}`,
          apikey: this.anonKey,
        },
        body: JSON.stringify({ days: 90, perPage: 100, maxPages: 3 }),
        signal: controller.signal,
      });
      logListingDev(`response status: ${response.status}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : `ApplyHome Edge Function returned ${response.status}`;
        throw new Error(`listings HTTP ${response.status}: ${message}`.slice(0, 240));
      }
      const parsed = parseApplyHomeListingPayload(payload);
      if (parsed.records.length === 0) throw new Error('ApplyHome returned no listing records');
      return parsed;
    } catch (error) {
      if (controller.signal.aborted && !request.signal?.aborted) {
        throw new Error(`listings request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', abort);
    }
  }
}

function logListingDev(message: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.info(`[Listings] ${message}`);
}

function buildListingsEndpoint(rawUrl: string | undefined): string | undefined {
  if (!rawUrl?.trim()) return undefined;
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return undefined;
    url.pathname = '/functions/v1/listings';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
