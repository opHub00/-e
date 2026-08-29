export const APPLYHOME_API_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';

export const APPLYHOME_OPERATIONS = [
  'getAPTLttotPblancDetail',
  'getRemndrLttotPblancDetail',
] as const;

export type ApplyHomeOperation = (typeof APPLYHOME_OPERATIONS)[number];

export type ApplyHomeRequestOptions = {
  serviceKey: string;
  fromDate: string;
  toDate: string;
  perPage?: number;
  maxPages?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

export type ApplyHomeFetchResult = {
  records: Readonly<Record<string, unknown>>[];
  operations: Array<{
    operation: ApplyHomeOperation;
    fetchedCount: number;
    matchCount: number;
    pagesFetched: number;
  }>;
};

export type ApplyHomeDiagnostic = {
  endpoint: ApplyHomeOperation;
  httpStatus: number;
  providerCode?: string;
  message: string;
};

export class ApplyHomeProviderError extends Error {
  readonly diagnostic: ApplyHomeDiagnostic;

  constructor(diagnostic: ApplyHomeDiagnostic) {
    super(diagnostic.message);
    this.name = 'ApplyHomeProviderError';
    this.diagnostic = diagnostic;
  }
}

export function decodeServiceKeyOnce(serviceKey: string): string {
  const trimmed = serviceKey.trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function buildApplyHomeRequestUrl({
  operation,
  serviceKey,
  fromDate,
  toDate,
  page,
  perPage,
}: {
  operation: ApplyHomeOperation;
  serviceKey: string;
  fromDate: string;
  toDate: string;
  page: number;
  perPage: number;
}): URL {
  const url = new URL(`${APPLYHOME_API_BASE}/${operation}`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('cond[RCRIT_PBLANC_DE::GTE]', fromDate);
  url.searchParams.set('cond[RCRIT_PBLANC_DE::LTE]', toDate);
  url.searchParams.set('serviceKey', decodeServiceKeyOnce(serviceKey));
  return url;
}

export async function fetchApplyHomeListings(
  options: ApplyHomeRequestOptions,
): Promise<ApplyHomeFetchResult> {
  if (!options.serviceKey.trim()) {
    throw new ApplyHomeProviderError({
      endpoint: APPLYHOME_OPERATIONS[0],
      httpStatus: 503,
      providerCode: 'missing-service-key',
      message: 'DATA_GO_KR_SERVICE_KEY is not configured',
    });
  }

  const results = await Promise.all(
    APPLYHOME_OPERATIONS.map((operation) => fetchOperation(operation, options)),
  );
  return {
    records: results.flatMap((result) => result.records),
    operations: results.map(({ records: _records, ...summary }) => summary),
  };
}

async function fetchOperation(
  operation: ApplyHomeOperation,
  options: ApplyHomeRequestOptions,
) {
  const fetcher = options.fetcher ?? fetch;
  const perPage = clampInteger(options.perPage ?? 100, 1, 100);
  const maxPages = clampInteger(options.maxPages ?? 3, 1, 5);
  const records: Readonly<Record<string, unknown>>[] = [];
  let matchCount = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildApplyHomeRequestUrl({
      operation,
      serviceKey: options.serviceKey,
      fromDate: options.fromDate,
      toDate: options.toDate,
      page,
      perPage,
    });
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new ApplyHomeProviderError(toDiagnostic(operation, response.status, payload));
    }

    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new ApplyHomeProviderError(toDiagnostic(operation, response.status, payload, 'Invalid upstream response'));
    }
    const pageRecords = payload.data.filter(isRecord);

    const upstreamMatchCount = readCount(payload.matchCount ?? payload.totalCount);
    matchCount = upstreamMatchCount ?? Math.max(matchCount, records.length + pageRecords.length);
    records.push(
      ...pageRecords.map((record) => ({ ...record, __applyHomeOperation: operation })),
    );
    pagesFetched = page;

    if (pageRecords.length < perPage || records.length >= matchCount) break;
  }

  return { operation, records, fetchedCount: records.length, matchCount, pagesFetched };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: 'Upstream returned non-JSON data' };
  }
}

function toDiagnostic(
  endpoint: ApplyHomeOperation,
  httpStatus: number,
  payload: unknown,
  fallbackMessage = 'ApplyHome upstream request failed',
): ApplyHomeDiagnostic {
  const record = isRecord(payload) ? payload : {};
  const error = isRecord(record.error) ? record.error : {};
  return {
    endpoint,
    httpStatus,
    providerCode: readText(error.code ?? record.code),
    message: (readText(error.message ?? record.message) || fallbackMessage).slice(0, 240),
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function readCount(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function readText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
