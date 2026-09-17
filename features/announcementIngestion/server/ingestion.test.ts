import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizeApplyHome, parseDocumentUrls, createApplyHomeSource } from './applyHomeSource.ts';
import { buildExtractionInput, canonicalUrl, deduplicate, identity, metadataHash, sha256, syncRange, validateManifest, validateAnnouncement } from './domain.ts';
import { documentFormat, downloadDocument, storeDocument } from './documents.ts';
import { allowedDocumentUrl, createHttp, readBounded } from './http.ts';
import { LocalIngestionStore } from './localStore.ts';
import { syncAnnouncements } from './pipeline.ts';
import type { AnnouncementSourceAdapter, RawAnnouncement } from './model.ts';

const now = '2026-09-17T03:00:00Z', pdf = Buffer.from('%PDF-1.7\nfixture document');
const raw = (id = '2026000449'): RawAnnouncement => ({ __applyHomeOperation: 'getAPTLttotPblancDetail', PBLANC_NO: id, HOUSE_MANAGE_NO: id,
  HOUSE_NM: '테스트 공고', BSNS_MBY_NM: '테스트 사업주체', RCRIT_PBLANC_DE: '20260914', SUBSCRPT_AREA_CODE_NM: '제주',
  PBLANC_URL: `https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=${id}&pblancNo=${id}` });
const docUrl = 'https://static.applyhome.co.kr/original.pdf';
const announcement = normalizeApplyHome(raw(), now);
function source(records = [raw()], discover = async () => [docUrl], complete = true): AnnouncementSourceAdapter {
  return { source: 'APT_APPLY', fetchAnnouncements: async () => ({ records, complete }), normalize: normalizeApplyHome, discoverDocuments: discover };
}
const options = { now, from: '2026-09-10', to: '2026-09-17', limit: 10, dryRun: false };
async function temporary(run: (store: LocalIngestionStore) => Promise<void>) {
  const prefix = resolve(tmpdir(), 'wanpan-ingestion-'), root = await mkdtemp(prefix);
  try { await run(new LocalIngestionStore(join(root, 'state'))); }
  finally { if (!resolve(root).startsWith(prefix)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); }
}

test('normalization preserves exact source IDs/date and excludes untrusted credentials', () => {
  const a = normalizeApplyHome({ ...raw(), serviceKey: 'do-not-persist', arbitraryField: 'ignored' }, now);
  assert.equal(a.externalId, 'getAPTLttotPblancDetail:2026000449:2026000449');
  assert.equal(a.announcementDate, '2026-09-14'); assert.equal(a.region.name, '제주'); assert.equal(a.documentUrls.length, 0);
  assert.ok(!JSON.stringify(a).includes('do-not-persist'));
  assert.throws(() => normalizeApplyHome({ ...raw(), RCRIT_PBLANC_DE: '2026-02-30' }, now));
});
test('metadata hash ignores retrieval time and object key order, catches correction', () => {
  assert.equal(metadataHash(announcement), metadataHash({ ...announcement, retrievedAt: '2026-09-18T00:00:00Z' }));
  assert.notEqual(metadataHash(announcement), metadataHash({ ...announcement, title: '정정 공고' }));
});
test('identity priority, namespacing, URL and title fallbacks', () => {
  assert.equal(identity(announcement).identityBasis, 'EXTERNAL_ID');
  const noId = { ...announcement, externalId: null };
  assert.equal(identity(noId).identityBasis, 'MANAGEMENT_NUMBER');
  assert.equal(identity({ ...noId, housingManagementNumber: null }).identityBasis, 'SOURCE_URL');
  assert.equal(identity({ ...noId, housingManagementNumber: null, detailUrl: null }).identityBasis, 'TITLE_FALLBACK');
  assert.notEqual(identity(announcement).canonicalId, identity({ ...announcement, source: 'MANUAL' }).canonicalId);
  assert.notEqual(identity(announcement).canonicalId, identity(normalizeApplyHome({ ...raw(), __applyHomeOperation: 'getRemndrLttotPblancDetail' }, now)).canonicalId);
});
test('dedupe exact duplicates; conflicting same identity is quarantined', () => {
  assert.equal(deduplicate([announcement, { ...announcement }]).records.length, 1);
  const result = deduplicate([announcement, { ...announcement, title: '다른 정보' }]);
  assert.equal(result.records.length, 0); assert.equal(result.conflicts.length, 1);
});
test('document links decode entities, retain observed IDs, reject cross-announcement and JavaScript', () => {
  const base = announcement.detailUrl!;
  const html = `<a href="https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?houseManageNo=2026000449&amp;pblancNo=2026000449&amp;atchmnflSeqNo=12&amp;atchmnflSn=2">모집공고문</a>
   <a href="javascript:alert(1)">x</a><a href="https://evil.test/a.pdf">x</a>
   <a href="/ai/aia/getAtchmnfl.do?houseManageNo=999&amp;pblancNo=999&amp;atchmnflSeqNo=12&amp;atchmnflSn=2">다른 공고</a>`;
  const urls = parseDocumentUrls(html, base); assert.equal(urls.length, 1); assert.ok(urls[0].includes('atchmnflSeqNo=12'));
  assert.deepEqual(parseDocumentUrls('<a href="/files/a.hwpx">원문</a>', base), ['https://www.applyhome.co.kr/files/a.hwpx']);
});
for (const url of ['http://www.applyhome.co.kr/a.pdf', 'https://127.0.0.1/a.pdf', 'https://www.applyhome.co.kr.evil.test/a.pdf', 'https://user:pass@www.applyhome.co.kr/a.pdf', 'https://www.applyhome.co.kr/a.pdf?token=secret'])
  test(`download URL rejects ${new URL(url).hostname}`, () => assert.throws(() => allowedDocumentUrl(url)));
test('URL query ordering is canonical, meaningful identifiers retained', () => assert.equal(canonicalUrl('https://www.applyhome.co.kr/a?b=2&a=1#fragment'), 'https://www.applyhome.co.kr/a?a=1&b=2'));
test('format signatures distinguish PDF/HWP/HWPX from HTML error pages', () => {
  assert.equal(documentFormat(pdf).extension, 'pdf');
  assert.equal(documentFormat(Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.from('HWP Document File')])).extension, 'hwp');
  assert.equal(documentFormat(Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('mimetype Contents/content.hpf')])).extension, 'hwpx');
  assert.throws(() => documentFormat(Buffer.from('<html>login</html>')));
});
test('stream size limit rejects before persisting any oversized document', async () => {
  await assert.rejects(readBounded(new Response('12345'), 4), /RESPONSE_TOO_LARGE/);
});
test('HTTP redirects cannot escape allowlist and API keys are never forwarded', async () => {
  let calls = 0;
  const http = createHttp((async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/x' } }); }) as typeof fetch, 0);
  await assert.rejects(http.get(docUrl), /UNSUPPORTED_DOCUMENT_HOST/); assert.equal(calls, 1);
  await assert.rejects(http.get('https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/test?serviceKey=private', {}, 100, true), /API_REDIRECT_REJECTED/); assert.equal(calls, 2);
});
test('HTTP 401 is explicit, raw network diagnostics are redacted', async () => {
  await assert.rejects(createHttp((async () => new Response('secret', { status: 401 })) as typeof fetch, 0).get(docUrl), /HTTP_401/);
  await assert.rejects(createHttp((async () => { throw new Error('https://x?serviceKey=secret'); }) as typeof fetch, 0).get(docUrl), /^Error: NETWORK_ERROR$/);
});
test('429 long Retry-After defers without hammering source', async () => {
  let calls = 0;
  const http = createHttp((async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '120' } }); }) as typeof fetch, 0);
  await assert.rejects(http.get(docUrl), /RETRY_LATER/); assert.equal(calls, 1);
});
test('dry-run fetches/discovers and creates no directory or download', () => temporary(async store => {
  let downloads = 0, discoveries = 0;
  const result = await syncAnnouncements(source([raw()], async () => { discoveries++; return [docUrl]; }), store,
    async () => { downloads++; throw new Error('SHOULD_NOT_RUN'); }, { ...options, dryRun: true });
  assert.equal(result.items[0].status, 'DOCUMENT_FOUND'); assert.equal(discoveries, 1); assert.equal(downloads, 0);
  await assert.rejects(stat(store.root), { code: 'ENOENT' });
}));
test('download + manifest + extraction handoff carry SHA and remain REFERENCE', () => temporary(async store => {
  const r = await syncAnnouncements(source(), store, (url, time) => storeDocument(store, pdf, time, url), options);
  assert.equal(r.items[0].change, 'NEW'); assert.equal(r.items[0].status, 'DOWNLOADED');
  const state = await store.load(), m = Object.values(state.entries)[0].manifest;
  validateManifest(m); assert.equal(m.documents[0].sha256, sha256(pdf)); assert.equal(m.documents[0].size, pdf.length);
  const input = buildExtractionInput(m); assert.equal(input.sourceStatusCandidate, 'REFERENCE'); assert.equal(input.requiresHumanReview, true);
  for (const mutate of [() => { m.documents[0].localPath = '../../secret'; }, () => { m.schemaVersion = 2 as 1; }]) { const copy = JSON.parse(JSON.stringify(m)); mutate(); assert.throws(() => validateManifest(m)); Object.assign(m, copy); }
}));
test('same document bytes are deduplicated; conditional 304 reuses verified local copy', () => temporary(async store => {
  const first = await storeDocument(store, pdf, now, docUrl, new Headers({ etag: '"v1"' })); let conditional = '';
  const http = createHttp((async (_url, init) => { conditional = (init?.headers as Record<string, string>)['If-None-Match']; return new Response(null, { status: 304 }); }) as typeof fetch, 0);
  assert.equal((await downloadDocument(http, store, docUrl, now, first)).sha256, first.sha256); assert.equal(conditional, '"v1"');
  await storeDocument(store, pdf, now, 'https://static.applyhome.co.kr/another.pdf');
  assert.equal((await readdir(store.path('blobs'))).length, 1);
}));
test('failed document isolation and retry preserve another announcement success', () => temporary(async store => {
  let attempt = 0;
  const download = (url: string, time: string) => ++attempt === 1 ? Promise.reject(new Error('HTTP_503')) : storeDocument(store, pdf, time, url);
  const r = await syncAnnouncements(source([raw('1'), raw('2')]), store, download, options);
  assert.equal(r.items.filter(i => i.status === 'FAILED').length, 1); assert.equal(r.items.filter(i => i.status === 'DOWNLOADED').length, 1);
  assert.equal(r.cursorAdvanced, false);
  const retry = await syncAnnouncements(source([raw('1'), raw('2')]), store, download, options);
  assert.ok(retry.items.every(i => i.status === 'DOWNLOADED')); assert.equal(retry.cursorAdvanced, true);
}));
test('unchanged, metadata correction and same URL document replacement get distinct versions', () => temporary(async store => {
  let bytes = pdf, downloads = 0;
  const download = (url: string, time: string) => { downloads++; return storeDocument(store, bytes, time, url); };
  const first = await syncAnnouncements(source(), store, download, options);
  const same = await syncAnnouncements(source(), store, download, options); assert.equal(same.items[0].change, 'UNCHANGED'); assert.equal(downloads, 1);
  bytes = Buffer.from('%PDF-1.7\nchanged');
  const changed = await syncAnnouncements(source(), store, download, { ...options, recheck: true });
  assert.equal(changed.items[0].change, 'MODIFIED'); assert.notEqual(changed.items[0].version, first.items[0].version);
  const corrected = await syncAnnouncements(source([{ ...raw(), HOUSE_NM: '정정 공고' }]), store, download, options);
  assert.equal(corrected.items[0].change, 'MODIFIED'); assert.notEqual(corrected.items[0].version, changed.items[0].version);
}));
test('incremental range overlaps six prior days; invalid or excessive ranges fail', () => {
  assert.deepEqual(syncRange(now), { from: '2026-09-11', to: '2026-09-17' });
  assert.deepEqual(syncRange(now, '2026-09-15'), { from: '2026-09-09', to: '2026-09-17' });
  assert.throws(() => syncRange(now, undefined, '2026-01-01')); assert.throws(() => syncRange(now, undefined, '2026-02-30'));
});
test('truncated source and limit never advance cursor; next run selects unseen records', () => temporary(async store => {
  const adapter = source([raw('1'), raw('2')], async () => [docUrl], false);
  const run = () => syncAnnouncements(adapter, store, (url, time) => storeDocument(store, pdf, time, url), { ...options, limit: 1 });
  const a = await run(), b = await run(); assert.equal(a.cursorAdvanced, false); assert.equal(b.cursorAdvanced, false);
  assert.notEqual(a.items[0].canonicalId, b.items[0].canonicalId);
}));
test('no documents is DISCOVERED, never extraction ready', () => temporary(async store => {
  await syncAnnouncements(source([raw()], async () => []), store, () => { throw new Error('UNEXPECTED'); }, options);
  const m = Object.values((await store.load()).entries)[0].manifest; assert.equal(m.status, 'DISCOVERED'); assert.throws(() => buildExtractionInput(m));
}));
test('dry-run existing state is byte-for-byte unchanged', () => temporary(async store => {
  await syncAnnouncements(source(), store, (url, time) => storeDocument(store, pdf, time, url), options);
  const before = await readFile(store.path('state.json'));
  await syncAnnouncements(source(), store, () => { throw new Error('UNEXPECTED'); }, { ...options, dryRun: true });
  assert.deepEqual(await readFile(store.path('state.json')), before);
}));
test('corrupt state fails closed and concurrent sync is rejected', () => temporary(async store => {
  const release = await store.lock(); await assert.rejects(store.lock(), /SYNC_LOCKED/);
  await writeFile(store.path('state.json'), '{"schemaVersion":999}'); await assert.rejects(store.load(), /INVALID_STATE/); await release();
}));
test('adapter reuses existing ApplyHome operations and reports truncated upstream', async () => {
  let calls = 0;
  const http = createHttp((async () => { calls++; return new Response(JSON.stringify({ data: [raw()], matchCount: 2 })); }) as typeof fetch, 0);
  const r = await createApplyHomeSource('test-key', http).fetchAnnouncements({ from: '2026-09-10', to: '2026-09-17' });
  assert.equal(calls, 2); assert.equal(r.complete, false); assert.equal(r.records.length, 2);
});

test('invalid normalized metadata is rejected before manifest persistence', () => {
  for (const change of [{ externalId: 42 }, { publisher: undefined }, { rawMetadata: { api_key: 'secret' } }, { documentUrls: [null] }]) {
    assert.throws(() => validateAnnouncement({ ...announcement, ...change }));
  }
});
test('comment/script anchors are not document discovery evidence', () => {
  assert.deepEqual(parseDocumentUrls(`<!-- <a href="${docUrl}">ignored</a> --><script>const s='<a href="${docUrl}">x</a>';</script>`, announcement.detailUrl!), []);
});
test('transient failure does not masquerade as a content correction', () => temporary(async store => {
  await syncAnnouncements(source(), store, (url, time) => storeDocument(store, pdf, time, url), options);
  const failed = await syncAnnouncements(source(), store, async () => { throw new Error('TIMEOUT'); }, { ...options, recheck: true });
  assert.equal(failed.items[0].status, 'FAILED'); assert.equal(failed.items[0].change, 'UNCHANGED');
}));
test('HTTP same URL content change is hashed even if server lacks validators', () => temporary(async store => {
  const old = await storeDocument(store, pdf, now, docUrl);
  const http = createHttp((async () => new Response('%PDF-1.7\nnew bytes')) as typeof fetch, 0);
  const changed = await downloadDocument(http, store, docUrl, now, old);
  assert.notEqual(changed.sha256, old.sha256); assert.equal((await readdir(store.path('blobs'))).length, 2);
}));
test('unavailable cached blob cannot trust a 304 response', () => temporary(async store => {
  const old = await storeDocument(store, pdf, now, docUrl);
  await writeFile(store.path(old.localPath), 'corrupt');
  const http = createHttp((async () => new Response(null, { status: 304 })) as typeof fetch, 0);
  await assert.rejects(downloadDocument(http, store, docUrl, now, old), /INVALID_NOT_MODIFIED/);
}));
test('explicit backfill cannot rewind or skip the incremental cursor', () => temporary(async store => {
  const adapter = source([], async () => []);
  const download = async () => { throw new Error('UNEXPECTED'); };
  assert.equal((await syncAnnouncements(adapter, store, download, options)).cursorAdvanced, true);
  assert.equal((await syncAnnouncements(adapter, store, download, { ...options, to: '2026-09-16' })).cursorAdvanced, false);
  assert.equal((await syncAnnouncements(adapter, store, download, { ...options, from: '2026-09-19', to: '2026-09-19' })).cursorAdvanced, false);
  assert.equal((await store.load()).cursors.APT_APPLY, '2026-09-17');
}));
