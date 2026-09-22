// Trusted Node CLI only. Never import this module into Expo.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { validateImportPackage } from '../features/applicationAssessment/server/importPackage.ts';
import { createRuleLifecycle, ruleSemantics } from '../features/applicationAssessment/server/lifecycle.ts';
import {
  PRODUCTION_FORBIDDEN_COMMANDS, assertProductionConfirmation, guardImportTarget, guardProductionImportTarget, projectRefFromSupabaseHost,
} from '../features/applicationAssessment/server/importTarget.ts';
import { hashReviewCandidate } from '../features/assessmentRuleReview/server/service.ts';
import { loadReviewSeedInput, reviewSeedPaths } from './review-seed-input.mjs';
import { isDeepStrictEqual } from 'node:util';

const usage = `assessment-rules validate PACKAGE.json
assessment-rules upload PACKAGE.json --document ORIGINAL.hwp
assessment-rules import PACKAGE.json
assessment-rules open-review RULE_SET_UUID --package PACKAGE.json --annotations ANNOTATIONS.json
assessment-rules review RULE_SET_UUID --out REVIEW.json
assessment-rules approve RULE_SET_UUID --fingerprint REVIEW_FINGERPRINT --reviewer NAME
assessment-rules activate RULE_SET_UUID --expected-active none|PREVIOUS_RULE_SET_UUID
assessment-rules bootstrap-admin EMAIL --reason TEXT

Network commands require ASSESSMENT_IMPORT_ENV=local|staging|production, ASSESSMENT_IMPORT_URL and
ASSESSMENT_SERVICE_ROLE_KEY (server process only; never printed).
  staging:    ASSESSMENT_STAGING_PROJECT_REF, and a declared production identity to compare against.
  production: ASSESSMENT_PRODUCTION_PROJECT_REF and ASSESSMENT_STAGING_PROJECT_REF (must differ), and
              --confirm <command>:<production ref>:<subject> on every command. The subject is the rule
              set id (the package's rule set for upload/import) or the e-mail for bootstrap-admin.
--dry-run validates everything locally and prints the planned calls. It contacts no project and needs
no credential. Reset, reseed and delete do not exist for production.`;

const COMMANDS = {
  validate: { required: [], network: false },
  upload: { required: ['--document'], draftGate: true },
  import: { required: [], draftGate: true },
  'open-review': { required: ['--package', '--annotations'] },
  review: { required: ['--out'] },
  approve: { required: ['--fingerprint', '--reviewer'] },
  activate: { required: ['--expected-active'] },
  'bootstrap-admin': { required: ['--reason'] },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function readBounded(path, maxBytes) {
  if ((await stat(path)).size > maxBytes) throw new Error('Input file is too large');
  return readFile(path);
}
/**
 * Declared production identity only.
 *
 * The CLI's linked project is the current working target, not a production
 * identity, so it is not consulted here. Process-level EXPO_PUBLIC_SUPABASE_URL
 * is also ignored because a staging shell legitimately sets it to staging.
 */
async function productionRefs() {
  const refs = new Set();
  const addRef = (value) => {
    const ref = value?.trim().toLowerCase();
    if (ref && /^[a-z0-9]+$/.test(ref)) refs.add(ref);
  };
  const addUrl = (value) => {
    try { addRef(projectRefFromSupabaseHost(new URL(value).hostname) ?? ''); } catch { /* not a URL */ }
  };
  addRef(process.env.SUPABASE_PRODUCTION_PROJECT_REF);
  for (const path of ['../.env', '../.env.local']) {
    try {
      const text = await readFile(new URL(path, import.meta.url), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const url = line.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*["']?([^"'\s]+)["']?\s*$/);
        if (url) addUrl(url[1]);
        const ref = line.match(/^SUPABASE_PRODUCTION_PROJECT_REF\s*=\s*["']?([^"'\s]+)["']?\s*$/);
        if (ref) addRef(ref[1]);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return [...refs];
}

/** A legacy Supabase JWT names its project. A key issued for another project is refused before any call. */
function assertCredentialProject(key, projectRef) {
  const [, payload] = key.split('.');
  if (!payload) return;
  let claims = {};
  try { claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return; }
  if (claims.role && claims.role !== 'service_role') throw new Error('SERVICE_ROLE_CREDENTIAL_REQUIRED');
  if (projectRef && claims.ref && claims.ref !== projectRef) throw new Error('CREDENTIAL_PROJECT_MISMATCH');
}

function parseArgs(argv) {
  const [command, target, ...rest] = argv;
  // No destructive command exists here; staging-only reset lives in its own opt-in script.
  if (PRODUCTION_FORBIDDEN_COMMANDS.includes(command)) throw new Error('DESTRUCTIVE_OPERATION_FORBIDDEN');
  const spec = COMMANDS[command];
  if (!spec || !target) throw new Error(usage);
  const options = {}; let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--dry-run') { dryRun = true; continue; }
    if (![...spec.required, '--confirm', ...(spec.draftGate ? ['--allow-draft-source'] : [])].includes(flag) || options[flag] !== undefined || !rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(usage);
    options[flag] = rest[++i];
  }
  if (spec.required.some(flag => !options[flag])) throw new Error(usage);
  return { command, target, options, dryRun, network: spec.network !== false };
}

/**
 * Only OFFICIAL_VERIFIED sources enter production by default. A package transcribed from a draft notice
 * (DRAFT_SOURCE_VERIFIED) needs a separate, recorded decision: --allow-draft-source <its rule set id>.
 */
let productionSourceStatus = null;
function assertProductionSource(command, subject, options) {
  if (!['upload', 'import'].includes(command) || productionSourceStatus === 'OFFICIAL_VERIFIED') return;
  if (options['--allow-draft-source'] !== subject) throw new Error(`PRODUCTION_SOURCE_NOT_OFFICIAL:${productionSourceStatus}`);
}

/** The target and, for production, the typed confirmation. Pure: nothing is contacted. */
async function resolveTarget(command, subject, options) {
  const environment = process.env.ASSESSMENT_IMPORT_ENV?.trim().toLowerCase();
  const declared = await productionRefs();
  if (environment === 'production') {
    const { origin, projectRef } = guardProductionImportTarget(process.env.ASSESSMENT_IMPORT_URL, process.env.ASSESSMENT_PRODUCTION_PROJECT_REF,
      process.env.ASSESSMENT_STAGING_PROJECT_REF, declared);
    assertProductionConfirmation(command, projectRef, subject, options['--confirm']);
    assertProductionSource(command, subject, options);
    return { environment, origin, projectRef };
  }
  if (options['--confirm'] !== undefined || options['--allow-draft-source'] !== undefined) throw new Error('--confirm and --allow-draft-source are only used for production');
  const origin = guardImportTarget(process.env.ASSESSMENT_IMPORT_URL, environment, process.env.ASSESSMENT_STAGING_PROJECT_REF, declared);
  return { environment, origin, projectRef: projectRefFromSupabaseHost(new URL(origin).hostname) };
}

async function main() {
  if (!process.argv[2] || process.argv[2] === '--help') { console.log(usage); return; }
  const { command, target, options, dryRun, network } = parseArgs(process.argv.slice(2));

  // Validate every local input before a target is even resolved.
  let validated, seed, documentBytes;
  if (['validate', 'upload', 'import'].includes(command)) {
    validated = validateImportPackage(JSON.parse((await readBounded(target, 2_000_000)).toString('utf8')));
    if (command === 'validate') {
      console.log(JSON.stringify({ status: 'VALID_STRUCTURE_ONLY', ruleSetId: validated.package.ruleSet.id, sourceStatus: validated.package.ruleSet.sourceStatus, supplies: validated.rules.supplies.map(s => s.type) })); return;
    }
  } else if (command === 'bootstrap-admin') {
    if (!/^[^\s@]+@[^\s@]+$/.test(target)) throw new Error('bootstrap-admin needs the e-mail of an existing Auth user');
    if (options['--reason'].trim().length < 3) throw new Error('A reason is required');
  } else if (!UUID.test(target)) throw new Error('Use the rule set UUID');
  if (command === 'upload') {
    documentBytes = await readBounded(options['--document'], 50_000_000);
    if (sha256(documentBytes) !== validated.package.document.sha256) throw new Error('Local original SHA-256 does not match package');
  }
  if (command === 'open-review') {
    const built = (await loadReviewSeedInput(reviewSeedPaths(['--package', options['--package'], '--annotations', options['--annotations']]))).seed;
    // The package being opened must be the rule set the operator named, not whatever file was passed.
    if (built.ruleVersionId !== target) throw new Error('REVIEW_PACKAGE_RULE_SET_MISMATCH');
    seed = { ...built, rules: built.rules.map(rule => ({ ...rule, originalCandidateHash: hashReviewCandidate(rule.originalCandidate) })) };
  }
  if (command === 'approve' && !/^[a-f0-9]{32}$/.test(options['--fingerprint'])) throw new Error('Use the fingerprint from a saved review snapshot');
  if (command === 'activate' && options['--expected-active'] !== 'none' && !UUID.test(options['--expected-active'])) throw new Error('--expected-active must be none or a rule set UUID');
  if (!network) return;

  const subject = validated ? validated.package.ruleSet.id : target;
  productionSourceStatus = validated?.package.ruleSet.sourceStatus ?? null;
  const { environment, origin, projectRef } = await resolveTarget(command, subject, options);
  const key = process.env.ASSESSMENT_SERVICE_ROLE_KEY?.trim();
  if (key) assertCredentialProject(key, projectRef);

  if (dryRun) {
    const calls = {
      upload: [`storage.upload announcement-documents/${validated?.package.document.storagePath} (upsert:false)`],
      import: ['storage.download (sha256 check)', 'rpc import_assessment_rule_package', 'rpc get_assessment_review_snapshot (round trip)'],
      'open-review': [`rpc seed_assessment_rule_review (${seed?.rules.length} rules; fails if a review already exists)`],
      review: ['rpc get_assessment_review_snapshot'],
      approve: ['rpc approve_assessment_rule_set'],
      activate: ['rpc activate_assessment_rule_set (review gate + expected active)'],
      'bootstrap-admin': ['rpc bootstrap_assessment_review_admin (fails if an enabled admin exists)'],
    }[command];
    console.log(JSON.stringify({
      status: 'DRY_RUN_OK', contacted: false, environment, projectRef, command, subject,
      confirmation: environment === 'production' ? 'VALID' : 'NOT_REQUIRED',
      serviceCredential: key ? 'PRESENT_NOT_USED' : 'ABSENT (required to execute)', plannedCalls: calls,
      ...(validated ? { sourceStatus: validated.package.ruleSet.sourceStatus } : {}),
      ...(options['--allow-draft-source'] ? { draftSourceDecision: 'EXPLICIT_ALLOW' } : {}),
    }, null, 2));
    return;
  }

  if (!key) throw new Error('A dedicated server credential is required');
  const client = createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }) } });
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(30000));
    // Database exceptions carry guard tokens (ADMIN_ALREADY_EXISTS, REVIEW_SEED_ALREADY_EXISTS …), never credentials.
    if (error) throw new Error(`RPC failed (${error.code || 'NETWORK_OR_TIMEOUT'}): ${String(error.message ?? '').split('\n')[0].slice(0, 200)}. Inspect the target before retrying; no automatic retry was made.`);
    return data;
  };
  const lifecycle = createRuleLifecycle(rpc);
  if (command === 'upload') {
    const d = validated.package.document;
    const { error } = await client.storage.from('announcement-documents').upload(d.storagePath, documentBytes, { upsert: false, contentType: d.mimeType });
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
  } else if (command === 'open-review') {
    const data = await rpc('seed_assessment_rule_review', { p_rule_set_id: target, p_seed: seed });
    console.log(JSON.stringify({ status: 'REVIEW_OPENED', ruleSetId: data.ruleSetId, rules: seed.rules.length, sourceStatus: seed.sourceStatus }));
  } else if (command === 'review') {
    const review = await lifecycle.review(target);
    await writeFile(options['--out'], JSON.stringify({ fingerprint: review.fingerprint, snapshot: review.snapshot }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({ ruleSetId: target, fingerprint: review.fingerprint, status: 'REVIEW_SNAPSHOT_SAVED' }));
  } else if (command === 'approve') console.log(JSON.stringify(await lifecycle.approve(target, options['--fingerprint'], options['--reviewer'])));
  else if (command === 'activate') console.log(JSON.stringify(await lifecycle.activate(target, options['--expected-active'] === 'none' ? null : options['--expected-active'])));
  else if (command === 'bootstrap-admin') console.log(JSON.stringify(await rpc('bootstrap_assessment_review_admin', { p_email: target, p_reason: options['--reason'].trim() })));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
