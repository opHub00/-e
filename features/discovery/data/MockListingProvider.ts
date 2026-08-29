import type {
  ListingDataSource,
  ListingProvider,
  ListingProviderPayload,
  ListingProviderRequest,
} from './ListingProvider.ts';
import { mockListingRecords } from './mockListingRecords.ts';

export const MOCK_LISTING_FETCHED_AT = '2026-08-24T00:00:00.000Z';

type MockListingProviderOptions = {
  records?: readonly unknown[];
  fetchedAt?: string;
};

export class MockListingProvider implements ListingProvider {
  readonly source: ListingDataSource = {
    id: 'wanpan-demo-v1',
    kind: 'mock',
    label: '완판e 데모 데이터',
  };

  private readonly records: readonly unknown[];
  private readonly fetchedAt: string;

  constructor(options: MockListingProviderOptions = {}) {
    this.records = options.records ?? mockListingRecords;
    this.fetchedAt = options.fetchedAt ?? MOCK_LISTING_FETCHED_AT;
  }

  getFixturePayload(): ListingProviderPayload {
    return {
      records: this.records,
      fetchedAt: this.fetchedAt,
      statusAsOf: this.fetchedAt,
    };
  }

  async fetchListings(_request?: ListingProviderRequest): Promise<ListingProviderPayload> {
    return this.getFixturePayload();
  }
}

export const mockListingProvider = new MockListingProvider();
