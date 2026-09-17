import { fetchApplyHomeListings } from '../../discovery/server/ApplyHomeApi.ts';
import { canonicalUrl, validDate } from './domain.ts';
import { allowedDocumentUrl, type IngestionHttp } from './http.ts';
import type { AnnouncementSourceAdapter, NormalizedAnnouncement, RawAnnouncement } from './model.ts';

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';
const entities = (s: string) => s.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(x[0-9a-f]+|\d+);/gi, (_, v: string) => {
  const code = v[0].toLowerCase() === 'x' ? parseInt(v.slice(1), 16) : Number(v);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
});
/** Anchors only. Never executes scripts or invents attachment IDs from the housing number. */
export function parseDocumentUrls(html: string, detailUrl: string): string[] {
  const base = new URL(allowedDocumentUrl(detailUrl)), found = new Set<string>();
  const anchors = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  for (const match of anchors.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    try {
      const url = new URL(allowedDocumentUrl(new URL(entities(match[1] ?? match[2]), base).href));
      const attachment = url.pathname === '/ai/aia/getAtchmnfl.do';
      if (!attachment && !/\.(pdf|hwp|hwpx)$/i.test(url.pathname)) continue;
      if (attachment && (!url.searchParams.has('atchmnflSeqNo') || !url.searchParams.has('atchmnflSn') ||
        ['houseManageNo', 'pblancNo'].some(k => !base.searchParams.get(k) || url.searchParams.get(k) !== base.searchParams.get(k)))) continue;
      found.add(url.href);
    } catch { /* Unsupported links are not fetched. */ }
  }
  return [...found].sort();
}
export function normalizeApplyHome(raw: RawAnnouncement, retrievedAt: string): NormalizedAnnouncement {
  const operation = text(raw.__applyHomeOperation);
  if (!['getAPTLttotPblancDetail', 'getRemndrLttotPblancDetail'].includes(operation)) throw new Error('UNKNOWN_OPERATION');
  const date = text(raw.RCRIT_PBLANC_DE).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  const title = text(raw.HOUSE_NM), house = text(raw.HOUSE_MANAGE_NO), notice = text(raw.PBLANC_NO);
  if (!title || !validDate(date)) throw new Error('INVALID_SOURCE_RECORD');
  const detailUrl = text(raw.PBLANC_URL) ? allowedDocumentUrl(text(raw.PBLANC_URL)) : null;
  // Explicitly retained source fields only: never serialize API URLs, credentials or volatile enrichment.
  const keys = ['HOUSE_MANAGE_NO', 'PBLANC_NO', 'HOUSE_NM', 'BSNS_MBY_NM', 'CNSTRCT_ENTRPS_NM', 'RCRIT_PBLANC_DE',
    'SUBSCRPT_AREA_CODE', 'SUBSCRPT_AREA_CODE_NM', 'HSSPLY_ADRES', 'TOT_SUPLY_HSHLDCO', 'RCEPT_BGNDE', 'RCEPT_ENDDE', 'PRZWNER_PRESNATN_DE', '__applyHomeOperation'];
  return { source: 'APT_APPLY', externalId: notice ? `${operation}:${house || 'unknown'}:${notice}` : null,
    housingManagementNumber: house || null, title, publisher: text(raw.BSNS_MBY_NM) || null, announcementDate: date,
    region: { code: text(raw.SUBSCRPT_AREA_CODE) || null, name: text(raw.SUBSCRPT_AREA_CODE_NM) || null },
    detailUrl: detailUrl ? canonicalUrl(detailUrl) : null, documentUrls: [],
    rawMetadata: Object.fromEntries(keys.map(k => [k, text(raw[k]) || null])), retrievedAt };
}
export function createApplyHomeSource(serviceKey: string, http: IngestionHttp): AnnouncementSourceAdapter {
  return {
    source: 'APT_APPLY', normalize: normalizeApplyHome,
    async fetchAnnouncements({ from, to }) {
      try {
        const result = await fetchApplyHomeListings({ serviceKey, fromDate: from, toDate: to, perPage: 100, maxPages: 5,
          fetcher: (async (input: URL | RequestInfo) => {
            const r = await http.get(String(input), { Accept: 'application/json' }, 3_000_000, true);
            return new Response(Buffer.from(r.bytes), { status: r.status, headers: r.headers });
          }) as typeof fetch });
        return { records: result.records, complete: result.operations.every(o => o.fetchedCount >= o.matchCount) };
      } catch { throw new Error('SOURCE_FETCH_FAILED'); }
    },
    async discoverDocuments(a) {
      if (a.documentUrls.length) return a.documentUrls.map(allowedDocumentUrl);
      if (!a.detailUrl) return [];
      const response = await http.get(a.detailUrl);
      const html = new TextDecoder().decode(response.bytes);
      if (/captcha|자동입력\s*방지|로그인\s*후\s*이용/i.test(html)) throw new Error('INTERACTIVE_ACCESS_REQUIRED');
      return parseDocumentUrls(html, a.detailUrl);
    },
  };
}
