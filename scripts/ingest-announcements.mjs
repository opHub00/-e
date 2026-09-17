// Local-only entrypoint. No Supabase client, remote write, extraction or approval calls.
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApplyHomeSource } from '../features/announcementIngestion/server/applyHomeSource.ts';
import { createHttp } from '../features/announcementIngestion/server/http.ts';
import { LocalIngestionStore } from '../features/announcementIngestion/server/localStore.ts';
import { downloadDocument, storeDocument } from '../features/announcementIngestion/server/documents.ts';
import { syncAnnouncements } from '../features/announcementIngestion/server/pipeline.ts';
import { sha256 } from '../features/announcementIngestion/server/domain.ts';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';

const usage = `ingest:announcements [--source APT_APPLY|MANUAL] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
  [--limit 1..100] [--dry-run] [--recheck] [--work-dir .ingestion]
MANUAL requires --package PACKAGE.json --document ORIGINAL.hwp
APT_APPLY uses DATA_GO_KR_SERVICE_KEY. No Supabase configuration is used.
--dry-run performs read-only discovery; creates no directories, downloads, state or manifests.
--recheck bypasses the 24-hour document check interval; uses HTTP validators where available.`;
async function main() {
  const args = process.argv.slice(2), options = {};
  const flags = ['--dry-run', '--recheck'], values = ['--source', '--from', '--to', '--limit', '--work-dir', '--package', '--document'];
  if (args.includes('--help')) { console.log(usage); return; }
  for (let i = 0; i < args.length; i++) {
    const k = args[i]; if (k in options) throw new Error('DUPLICATE_OPTION');
    if (flags.includes(k)) options[k] = true;
    else if (values.includes(k) && args[i + 1] && !args[i + 1].startsWith('--')) options[k] = args[++i];
    else throw new Error('INVALID_OPTIONS');
  }
  const source = options['--source'] ?? 'APT_APPLY', store = new LocalIngestionStore(options['--work-dir'] ?? '.ingestion');
  const now = new Date().toISOString(), http = createHttp();
  let adapter, download, from = options['--from'], to = options['--to'];
  if (source === 'APT_APPLY') {
    if (options['--package'] || options['--document']) throw new Error('MANUAL_OPTIONS_ONLY');
    if (!process.env.DATA_GO_KR_SERVICE_KEY?.trim()) throw new Error('MISSING_DATA_GO_KR_SERVICE_KEY');
    adapter = createApplyHomeSource(process.env.DATA_GO_KR_SERVICE_KEY, http);
    download = (url, time, previous) => downloadDocument(http, store, url, time, previous);
  } else if (source === 'MANUAL') {
    if (!options['--package'] || !options['--document']) throw new Error('MANUAL_INPUT_REQUIRED');
    if ((await stat(options['--package'])).size > 2_000_000 || (await stat(options['--document'])).size > 50_000_000) throw new Error('INPUT_TOO_LARGE');
    const { package: p } = validateImportPackage(JSON.parse(await readFile(options['--package'], 'utf8')));
    // Read-only hash check also runs in dry-run; it is not a remote download or state mutation.
    const original = await readFile(options['--document']);
    if (sha256(original) !== p.document.sha256) throw new Error('MANUAL_HASH_MISMATCH');
    from ??= p.announcement.announcementDate; to ??= p.announcement.announcementDate;
    adapter = { source: 'MANUAL', fetchAnnouncements: async () => ({ records: [p.announcement], complete: true }),
      normalize: (_raw, retrievedAt) => ({ source: 'MANUAL', externalId: p.announcement.id, housingManagementNumber: p.announcement.housingManagementNumber,
        title: p.announcement.title, publisher: p.announcement.publisher, announcementDate: p.announcement.announcementDate,
        region: { code: p.announcement.regionCode, name: p.announcement.regionName }, detailUrl: p.announcement.sourceUrl, documentUrls: [],
        rawMetadata: { suppliedManually: true, originalSource: p.announcement.source, versionLabel: p.document.versionLabel,
          providedDocumentHash: p.document.sha256, existingRuleSetSourceStatus: p.ruleSet.sourceStatus }, retrievedAt }),
      discoverDocuments: async () => ['manual:provided-original'] };
    download = (_url, time) => storeDocument(store, original, time, null);
  } else throw new Error('UNSUPPORTED_SOURCE');
  const result = await syncAnnouncements(adapter, store, download, { now, from, to, limit: Number(options['--limit'] ?? 10), dryRun: !!options['--dry-run'], recheck: !!options['--recheck'] });
  console.log(JSON.stringify({ ...result, workDirectory: options['--dry-run'] ? undefined : resolve(store.root) }, null, 2));
  if (result.normalizationErrors.length || result.conflicts.length || result.items.some(i => i.status === 'FAILED')) process.exitCode = 2;
}
main().catch(error => {
  // Only bounded codes; never output request URLs, key values, fetch diagnostics or file contents.
  console.error(JSON.stringify({ error: error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'INGESTION_FAILED' }));
  process.exitCode = 1;
});
