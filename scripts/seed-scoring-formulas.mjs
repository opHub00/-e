import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { buildScoringSeedPackage, verifyScoringSeedPackage } from '../features/scoringFormula/seedPackage.ts';

const source = JSON.parse(await readFile(new URL('../data/scoring-formulas/formulas.json', import.meta.url), 'utf8'));
const packages = source.formulas.map(buildScoringSeedPackage);
packages.forEach(verifyScoringSeedPackage);
const apply = process.argv.includes('--apply');

if (!apply) {
  console.log(JSON.stringify({ dryRun: true, formulas: packages.map(item => ({ slug: item.formula.slug, version: item.formula.version,
    status: item.formula.status, publishedToUsers: item.formula.publishedToUsers, sourcePackageHash: item.sourcePackageHash })) }, null, 2));
  process.exit(0);
}

const environment = process.env.WANPANE_ENV?.trim().toLowerCase();
const url = process.env.SUPABASE_STAGING_URL?.trim();
const expected = process.env.SUPABASE_STAGING_PROJECT_REF?.trim().toLowerCase();
const production = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
const ref = (() => { try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; } catch { return null; } })();
assert.equal(environment, 'staging', 'STAGING_ENV_REQUIRED');
assert.ok(expected && ref === expected, 'STAGING_PROJECT_REF_MISMATCH');
assert.ok(!production || ref !== production, 'PRODUCTION_PROJECT_FORBIDDEN');
const serviceKey = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim();
assert.ok(serviceKey, 'STAGING_SERVICE_ROLE_KEY_REQUIRED');
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
for (const seedPackage of packages) {
  const { data, error } = await client.rpc('seed_scoring_formula_package', { p_package: seedPackage, p_dry_run: false });
  if (error) throw new Error(`SCORING_SEED_FAILED:${error.message}`);
  console.log(JSON.stringify({ slug: seedPackage.formula.slug, result: data }));
}
