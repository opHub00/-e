// 한국부동산원 청약홈 APT + APT 잔여세대 server proxy.
// DATA_GO_KR_SERVICE_KEY는 이 함수의 secret으로만 주입한다.

import {
  ApplyHomeProviderError,
  fetchApplyHomeListings,
} from '../../../features/discovery/server/ApplyHomeApi.ts';
import {
  enrichApplyHomeRecordsWithGeocodes,
  KakaoAddressGeocoder,
  SupabaseRestGeocodeCache,
  type GeocodeEnrichmentDiagnostics,
} from '../../../features/discovery/server/KakaoGeocoding.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 1_500_000;
const GEOCODE_CONCURRENCY = 4;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'GET 또는 POST만 지원해요.' }, 405);
  }

  let input: { days: number; perPage: number; maxPages: number; geocodeLimit: number };
  try {
    input = request.method === 'POST'
      ? parseRequest(await request.json().catch(() => ({})))
      : parseRequest({});
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '요청 형식이 올바르지 않아요.' }, 400);
  }

  const serviceKey = Deno.env.get('DATA_GO_KR_SERVICE_KEY') ?? '';
  if (!serviceKey.trim()) {
    console.error('listings provider error', {
      endpoint: 'configuration',
      httpStatus: 503,
      providerCode: 'missing-service-key',
      message: 'DATA_GO_KR_SERVICE_KEY is not configured',
    });
    return json({ error: '청약홈 데이터 연결이 설정되지 않았어요.' }, 503);
  }

  const fetchedAt = new Date();
  const { fromDate, toDate } = getKoreanDateRange(fetchedAt, input.days);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result: Awaited<ReturnType<typeof fetchApplyHomeListings>>;

  try {
    result = await fetchApplyHomeListings({
      serviceKey,
      fromDate,
      toDate,
      perPage: input.perPage,
      maxPages: input.maxPages,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof ApplyHomeProviderError) {
      console.error('listings provider error', error.diagnostic);
      return json({ error: '청약홈 분양정보를 불러오지 못했어요.' }, 502);
    }
    const timedOut = controller.signal.aborted;
    console.error('listings provider error', {
      endpoint: 'request',
      httpStatus: timedOut ? 504 : 502,
      providerCode: timedOut ? 'timeout' : 'connection-error',
      message: error instanceof Error ? error.message.slice(0, 240) : 'unknown error',
    });
    return json(
      { error: timedOut ? '청약홈 응답 시간이 초과됐어요.' : '청약홈에 연결하지 못했어요.' },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timer);
  }

  let records = result.records;
  let geocoding: GeocodeEnrichmentDiagnostics | { error: string };
  try {
    const enrichment = await enrichApplyHomeRecordsWithGeocodes(result.records, {
      geocoder: new KakaoAddressGeocoder({
        apiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
      }),
      cache: new SupabaseRestGeocodeCache({
        supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      }),
      concurrency: GEOCODE_CONCURRENCY,
      limit: input.geocodeLimit,
      now: fetchedAt,
    });
    records = enrichment.records;
    geocoding = enrichment.diagnostics;
  } catch (error) {
    console.error('listings geocode error', {
      endpoint: 'kakao-address',
      httpStatus: 502,
      providerCode: 'enrichment-error',
      message: error instanceof Error ? error.message.slice(0, 240) : 'unknown error',
    });
    geocoding = { error: 'Geocode enrichment failed; listings were preserved without coordinates' };
  }

  const body = {
    records,
    source: { id: 'applyhome-apt-v1', kind: 'applyhome', label: '한국부동산원 청약홈 분양정보' },
    fetchedAt: fetchedAt.toISOString(),
    statusAsOf: fetchedAt.toISOString(),
    isFallback: false,
    range: { fromDate, toDate },
    operations: result.operations,
    geocoding,
  };
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_RESPONSE_BYTES) {
    console.error('listings provider error', {
      endpoint: 'response',
      httpStatus: 502,
      providerCode: 'response-too-large',
      message: 'Normalized response exceeded size limit',
    });
    return json({ error: '청약홈 응답 크기가 허용 범위를 넘었어요.' }, 502);
  }
  return json(body);
});

function parseRequest(value: unknown) {
  if (!isRecord(value)) throw new Error('요청은 JSON 객체여야 해요.');
  return {
    days: readInteger(value.days, 90, 30, 90, 'days'),
    perPage: readInteger(value.perPage, 100, 1, 100, 'perPage'),
    maxPages: readInteger(value.maxPages, 3, 1, 5, 'maxPages'),
    geocodeLimit: readInteger(value.geocodeLimit, 200, 0, 200, 'geocodeLimit'),
  };
}

function readInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${field} 값이 허용 범위를 벗어났어요.`);
  }
  return Number(value);
}

function getKoreanDateRange(now: Date, days: number) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const toDate = shifted.toISOString().slice(0, 10);
  const from = new Date(`${toDate}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
