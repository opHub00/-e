import type { NewsArticle } from '../types.ts';

export type NewsSourceKind = 'naver' | 'fixture';

export type NewsDataSource = {
  id: string;
  kind: NewsSourceKind;
  label: string;
};

/** Provider 원본은 신뢰하지 않으며 normalization 전에는 앱 모델로 사용하지 않는다. */
export type RawNewsRecord = Readonly<Record<string, unknown>>;

export type NewsProviderPayload = {
  records: readonly unknown[];
  fetchedAt?: string;
};

export type NewsProviderRequest = {
  signal?: AbortSignal;
};

export interface NewsProvider {
  readonly source: NewsDataSource;
  fetchNews(request?: NewsProviderRequest): Promise<NewsProviderPayload>;
}

export type NewsValidationIssue = {
  recordIndex: number;
  field: string;
  code:
    | 'invalid-record'
    | 'missing-value'
    | 'invalid-value'
    | 'too-old'
    | 'future-date'
    | 'duplicate-url'
    | 'duplicate-title';
  severity: 'warning' | 'error';
  message: string;
};

export type NewsDataset = {
  articles: NewsArticle[];
  source: NewsDataSource;
  fetchedAt: string;
  isFallback: boolean;
  fallbackReason?: string;
  cacheStatus: 'miss' | 'hit';
  validationIssues: NewsValidationIssue[];
};

export type NewsProviderDiagnostic = {
  code: 'missing-credentials' | 'provider-error' | 'invalid-response';
  message: string;
  httpStatus?: number;
  providerCode?: string;
};

export class NewsProviderError extends Error {
  readonly code: 'missing-credentials' | 'provider-error' | 'invalid-response';
  readonly httpStatus?: number;
  readonly providerCode?: string;

  constructor(
    code: NewsProviderError['code'],
    message: string,
    details: Pick<NewsProviderDiagnostic, 'httpStatus' | 'providerCode'> = {},
  ) {
    super(message);
    this.name = 'NewsProviderError';
    this.code = code;
    this.httpStatus = details.httpStatus;
    this.providerCode = sanitizeProviderCode(details.providerCode);
  }
}

/** fallback 로그에 credential이나 원본 응답을 싣지 않는 안전한 진단 정보만 반환한다. */
export function toNewsProviderDiagnostic(error: unknown): NewsProviderDiagnostic {
  if (error instanceof NewsProviderError) {
    return {
      code: error.code,
      message: error.message.slice(0, 200),
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
      ...(error.providerCode ? { providerCode: error.providerCode } : {}),
    };
  }
  return {
    code: 'provider-error',
    message: 'Unexpected primary news provider failure',
  };
}

function sanitizeProviderCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const safe = value.trim().replace(/[^a-z0-9_.-]/gi, '').slice(0, 80);
  return safe || undefined;
}
