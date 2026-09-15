// Trusted Node CLI only. Never import this module into Expo.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';
import { createRuleLifecycle, ruleSemantics } from '../features/applicationAssessment/server/lifecycle.ts';
import { guardImportTarget } from '../features/applicationAssessment/server/importTarget.ts';
import { isDeepStrictEqual } from 'node:util';

const usage = `assessment-rules validate PACKAGE.json
assessment-rules upload PACKAGE.json --document ORIGINAL.hwp
assessment-rules import PACKAGE.json
assessment-rules review RULE_SET_UUID --out REVIEW.json
assessment-rules approve RULE_SET_UUID --fingerprint REVIEW_FINGERPRINT --reviewer NAME
assessment-rules activate RULE_SET_UUID --expected-active none|PREVIOUS_RULE_SET_UUID
Network commands require ASSESSMENT_IMPORT_ENV=local|staging, ASSESSMENT_IMPORT_URL,
ASSESSMENT_SERVICE_ROLE_KEY and (staging only) ASSESSMENT_STAGING_PROJECT_REF.
Production endpoints found in the app configuration/linked project are forbidden.`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function readBounded(path, maxBytes) {
  if ((await stat(path)).size > maxBytes) throw new Error('Input file is too large');
  return readFile(path);
}
async function productionUrls() {
  const urls = [process.env.EXPO_PUBLIC_SUPABASE_URL].filter(Boolean);
  for (const path of ['../.env', '../.env.local']) {
    try {
      const text = await readFile(new URL(path, import.meta.url), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*["']?([^"'\s]+)["']?\s*$/);
        if (match) urls.push(match[1]);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  try {
    const ref = (await readFile(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8')).trim();
    if (/^[a-z0-9]+$/.test(ref)) urls.push(`https://${ref}.supabase.co`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return urls;
}
async function main() {
  const [command, target, ...args] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(usage); return; }
  const required = { validate: [], upload: ['--document'], import: [], review: ['--out'], approve: ['--fingerprint', '--reviewer'], activate: ['--expected-active'] }[command];
  if (!target || !required || args.length !== required.length * 2) throw new Error(usage);
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  if (Object.keys(options).length !== required.length || required.some(key => !options[key])) throw new Error(usage);
  let validated;
  if (['validate', 'upload', 'import'].includes(command)) {
    validated = validateImportPackage(JSON.parse((await readBounded(target, 2_000_000)).toString('utf8')));
    if (command === 'validate') {
      console.log(JSON.stringify({ status: 'VALID_STRUCTURE_ONLY', ruleSetId: validated.package.ruleSet.id, sourceStatus: validated.package.ruleSet.sourceStatus, supplies: validated.rules.supplies.map(s => s.type) })); return;
    }
  }
  // Validate all write arguments before contacting any target.
  if (command === 'approve' && !/^[a-f0-9]{32}$/.test(options['--fingerprint'])) throw new Error('Use the fingerprint from a saved review snapshot');
  const url = guardImportTarget(process.env.ASSESSMENT_IMPORT_URL, process.env.ASSESSMENT_IMPORT_ENV, process.env.ASSESSMENT_STAGING_PROJECT_REF, await productionUrls());
  const key = process.env.ASSESSMENT_SERVICE_ROLE_KEY;
  if (!key) throw new Error('A dedicated server credential is required');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }) } });
  const lifecycle = createRuleLifecycle(async (name, args) => {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(30000));
    if (error) throw new Error(`RPC failed (${error.code || 'NETWORK_OR_TIMEOUT'}). Inspect the rule-set ID before retrying; no automatic retry was made.`);
    return data;
  });
  if (command === 'upload') {
    const bytes = await readBounded(options['--document'], 50_000_000);
    const d = validated.package.document;
    if (sha256(bytes) !== d.sha256) throw new Error('Local original SHA-256 does not match package');
    const { error } = await client.storage.from('announcement-documents').upload(d.storagePath, bytes, { upsert: false, contentType: d.mimeType });
    if (error) throw new Error('Original upload failed; no overwrite or automatic retry was attempted');
    console.log(JSON.stringify({ status: 'PRIVATE_ORIGINAL_UPLOADED', documentId: d.id }));
  } else if (command === 'import') {
    const p = validated.package;
    const { data, error } = await client.storage.from('announcement-documents').download(p.document.storagePath);
    if (error || !data) throw new Error('Verified private original must be uploaded first');
    if (data.size > 50_000_000 || sha256(Buffer.from(await data.arrayBuffer())) !== p.document.sha256) throw new Error('Stored original SHA-256 mismatch');
    const imported = await lifecycle.import(p);
    const roundTrip = await lifecycle.review(p.ruleSet.id);
    if (!isDeepStrictEqual(ruleSemantics(imported.expectedRules), ruleSemantics(roundTrip.rules))) throw new Error('Imported semantic round-trip mismatch; do not approve');
    console.log(JSON.stringify({ ...imported.receipt, semanticRoundTrip: 'PASS', approved: false, active: false }));
  } else if (command === 'review') {
    const review = await lifecycle.review(target);
    await writeFile(options['--out'], JSON.stringify({ fingerprint: review.fingerprint, snapshot: review.snapshot }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({ ruleSetId: target, fingerprint: review.fingerprint, status: 'REVIEW_SNAPSHOT_SAVED' }));
  } else if (command === 'approve') console.log(JSON.stringify(await lifecycle.approve(target, options['--fingerprint'], options['--reviewer'])));
  else if (command === 'activate') console.log(JSON.stringify(await lifecycle.activate(target, options['--expected-active'] === 'none' ? null : options['--expected-active'])));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
