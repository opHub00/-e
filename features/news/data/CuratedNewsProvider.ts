import type {
  NewsDataSource,
  NewsProvider,
  NewsProviderPayload,
  NewsProviderRequest,
} from './NewsProvider.ts';
import { createCuratedNewsFixture } from './curatedNewsFixture.ts';

type CuratedNewsProviderOptions = {
  now?: () => Date;
  records?: readonly unknown[];
};

export class CuratedNewsProvider implements NewsProvider {
  readonly source: NewsDataSource = {
    id: 'wanpan-curated-news-v1',
    kind: 'fixture',
    label: '완판e 공식 확인 경로',
  };

  private readonly now: () => Date;
  private readonly records?: readonly unknown[];

  constructor(options: CuratedNewsProviderOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.records = options.records;
  }

  async fetchNews(_request?: NewsProviderRequest): Promise<NewsProviderPayload> {
    const now = this.now();
    return {
      records: this.records ?? createCuratedNewsFixture(now),
      fetchedAt: now.toISOString(),
    };
  }
}
