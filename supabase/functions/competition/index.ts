// 한국부동산원 청약Home 공식 경쟁률/특별공급 신청현황 lazy proxy.
// DATA_GO_KR_SERVICE_KEY와 service role은 Supabase secret에만 둔다.

import {
  adaptCompetitionRows,
  adaptSpecialSupplyRows,
  type SupportedCompetitionOperation,
} from '../../../features/competition/auditAdapter.ts';
import {
  isCompetitionApiPayload,
  getCompetitionCacheTtlMs,
  type CompetitionApiPayload,
  type ListingCompetitionSourceType,
} from '../../../features/competition/domain.ts';

const API_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';
const UPSTREAM_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 500_000;
const REFRESH_LEASE_MS = 10_000;
const CACHE_WAIT_MS = 250;
const CACHE_WAIT_ATTEMPTS = 24;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CompetitionRequest = {
  sourceType: ListingCompetitionSourceType;
  houseManageNo: string;
  pblancNo: string;
};

const inFlight = new Map<string, Promise<CompetitionApiPayload>>();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST만 지원해요.' }, 405);

  let input: CompetitionRequest;
  try {
    input = parseRequest(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '요청 형식이 올바르지 않아요.' }, 400);
  }

  const serviceKey = Deno.env.get('DATA_GO_KR_SERVICE_KEY')?.trim();
  if (!serviceKey) return json({ error: '공식 경쟁정보 연결이 설정되지 않았어요.' }, 503);

  const cacheKey = `${input.sourceType}:${input.houseManageNo}:${input.pblancNo}`;
  try {
    const cached = await readCache(cacheKey);
    if (cached) return json(markCache(cached, 'hit'));

    const localPending = inFlight.get(cacheKey);
    if (localPending) return json(await localPending);

    const ownsRefresh = await claimRefresh(cacheKey, input);
    if (!ownsRefresh) {
      for (let attempt = 0; attempt < CACHE_WAIT_ATTEMPTS; attempt += 1) {
        await delay(CACHE_WAIT_MS);
        const refreshed = await readCache(cacheKey);
        if (refreshed) return json(markCache(refreshed, 'hit'));
      }
    }

    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = fetchCompetition(input, serviceKey);
      inFlight.set(cacheKey, pending);
    }
    const payload = await pending;
    await writeCache(cacheKey, input, payload);
    return json(payload);
  } catch (error) {
    console.error('competition provider error', {
      sourceType: input.sourceType,
      houseManageNo: input.houseManageNo,
      pblancNo: input.pblancNo,
      message: error instanceof Error ? error.message.slice(0, 180) : 'unknown error',
    });
    return json({ error: '공식 경쟁정보를 잠시 확인할 수 없어요.' }, 502);
  } finally {
    inFlight.delete(cacheKey);
  }
});

async function fetchCompetition(
  input: CompetitionRequest,
  serviceKey: string,
): Promise<CompetitionApiPayload> {
  const mainOperation: SupportedCompetitionOperation = input.sourceType === 'apt'
    ? 'getAPTLttotPblancCmpet'
    : 'getRemndrLttotPblancCmpet';
  const requests = [fetchRows(mainOperation, input, serviceKey)];
  if (input.sourceType === 'apt') requests.push(fetchRows('getAPTSpsplyReqstStus', input, serviceKey));
  const settled = await Promise.allSettled(requests);
  const mainRecords = settled[0]?.status === 'fulfilled' ? settled[0].value : [];
  const specialRecords = settled[1]?.status === 'fulfilled' ? settled[1].value : [];
  const partial = settled.some((result) => result.status === 'rejected');
  if (settled.every((result) => result.status === 'rejected')) {
    throw new Error('all official operations failed');
  }

  const fetchedAt = new Date().toISOString();
  const generalRows = adaptCompetitionRows(mainOperation, mainRecords).filter((row) =>
    row.houseManageNo === input.houseManageNo && row.pblancNo === input.pblancNo
  );
  const specialSupplyRows = input.sourceType === 'apt'
    ? adaptSpecialSupplyRows(specialRecords).filter((row) =>
      row.houseManageNo === input.houseManageNo && row.pblancNo === input.pblancNo
    )
    : [];
  const payload: CompetitionApiPayload = {
    schemaVersion: 1,
    identifier: input,
    generalRows,
    specialSupplyRows,
    source: {
      provider: '한국부동산원 청약Home',
      dataset: '청약접수 경쟁률 및 특별공급 신청현황',
      fetchedAt,
      cache: 'miss',
      partial,
    },
  };
  if (!isCompetitionApiPayload(payload)) throw new Error('normalized payload failed validation');
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('normalized payload exceeded size limit');
  }
  return payload;
}

/**
 * 여러 Edge isolate가 동시에 cold miss를 만나도 한 요청만 upstream을 갱신한다.
 * lease payload는 정상 contract가 아니어서 readCache가 사용자 응답으로 반환하지 않는다.
 */
async function claimRefresh(cacheKey: string, input: CompetitionRequest): Promise<boolean> {
  const config = cacheConfig();
  if (!config) return true;
  const now = new Date();
  const deleteUrl = new URL(`${config.url}/rest/v1/listing_competition_cache`);
  deleteUrl.searchParams.set('cache_key', `eq.${cacheKey}`);
  deleteUrl.searchParams.set('expires_at', `lt.${now.toISOString()}`);
  await fetch(deleteUrl, { method: 'DELETE', headers: serviceHeaders(config.key) }).catch(() => null);

  const response = await fetch(`${config.url}/rest/v1/listing_competition_cache`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(config.key),
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify({
      cache_key: cacheKey,
      source_type: input.sourceType,
      house_manage_no: input.houseManageNo,
      pblanc_no: input.pblancNo,
      payload: { refreshLease: true },
      fetched_at: now.toISOString(),
      expires_at: new Date(now.getTime() + REFRESH_LEASE_MS).toISOString(),
      updated_at: now.toISOString(),
    }),
  }).catch(() => null);
  if (!response?.ok) return true;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
}

async function fetchRows(
  operation: SupportedCompetitionOperation | 'getAPTSpsplyReqstStus',
  input: CompetitionRequest,
  serviceKey: string,
): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const rows: unknown[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const url = new URL(`${API_BASE}/${operation}`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('perPage', '100');
      url.searchParams.set('returnType', 'JSON');
      url.searchParams.set('serviceKey', serviceKey);
      url.searchParams.set('cond[HOUSE_MANAGE_NO::EQ]', input.houseManageNo);
      url.searchParams.set('cond[PBLANC_NO::EQ]', input.pblancNo);
      const response = await fetch(url, { signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.data)) {
        throw new Error(`official ${operation} HTTP ${response.status}`);
      }
      rows.push(...payload.data);
      if (payload.data.length < 100) break;
    }
    return rows.slice(0, 300);
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(cacheKey: string): Promise<CompetitionApiPayload | null> {
  const config = cacheConfig();
  if (!config) return null;
  const url = new URL(`${config.url}/rest/v1/listing_competition_cache`);
  url.searchParams.set('cache_key', `eq.${cacheKey}`);
  url.searchParams.set('expires_at', `gt.${new Date().toISOString()}`);
  url.searchParams.set('select', 'payload');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: serviceHeaders(config.key) });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const payload = Array.isArray(rows) && rows[0] && isRecord(rows[0]) ? rows[0].payload : null;
  return isCompetitionApiPayload(payload) ? payload : null;
}

async function writeCache(
  cacheKey: string,
  input: CompetitionRequest,
  payload: CompetitionApiPayload,
): Promise<void> {
  const config = cacheConfig();
  if (!config) return;
  const rowCount = payload.generalRows.length + payload.specialSupplyRows.length;
  const ttlMs = getCompetitionCacheTtlMs(rowCount);
  const fetchedAt = new Date(payload.source.fetchedAt);
  const response = await fetch(`${config.url}/rest/v1/listing_competition_cache?on_conflict=cache_key`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(config.key),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      cache_key: cacheKey,
      source_type: input.sourceType,
      house_manage_no: input.houseManageNo,
      pblanc_no: input.pblancNo,
      payload,
      fetched_at: fetchedAt.toISOString(),
      expires_at: new Date(fetchedAt.getTime() + ttlMs).toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) console.error('competition cache write failed', { status: response.status });
}

function markCache(payload: CompetitionApiPayload, cache: 'hit'): CompetitionApiPayload {
  return { ...payload, source: { ...payload.source, cache } };
}

function parseRequest(value: unknown): CompetitionRequest {
  if (!isRecord(value)) throw new Error('요청은 JSON 객체여야 해요.');
  const sourceType = value.sourceType;
  const houseManageNo = String(value.houseManageNo ?? '').trim();
  const pblancNo = String(value.pblancNo ?? '').trim();
  if (sourceType !== 'apt' && sourceType !== 'remnant') throw new Error('지원하지 않는 공고 유형이에요.');
  if (!/^[0-9A-Za-z_-]{1,40}$/.test(houseManageNo) || !/^[0-9A-Za-z_-]{1,40}$/.test(pblancNo)) {
    throw new Error('공고 식별자가 올바르지 않아요.');
  }
  return { sourceType, houseManageNo, pblancNo };
}

function cacheConfig(): { url: string; key: string } | null {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

function serviceHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
