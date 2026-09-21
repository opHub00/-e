import assert from 'node:assert/strict';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  E2E_FIXTURE_KEY,
  E2E_FIXTURE_URL,
  createE2EBuildEnvironment,
  createReleaseBuildEnvironment,
  runWebExport,
} from './web-build.mjs';

const root = resolve('.cache/build-isolation');
const outputs = {
  release: join(root, 'release'),
  e2e: join(root, 'e2e'),
  staging: join(root, 'staging'),
  default: join(root, 'default'),
};
const safePublicValues = {
  release: ['https://release-build-probe.invalid', 'public-anon-release-build-probe'],
  staging: ['https://staging-build-probe.invalid', 'public-anon-staging-build-probe'],
};

await rm(root, { recursive: true, force: true });

const walk = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(?:html|js|json)$/.test(entry.name)) files.push(path);
  }
  return files;
};

const bundleText = async directory => {
  const files = await walk(directory);
  return (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
};

const environmentFor = profile => {
  if (profile === 'default') {
    const env = { ...process.env };
    delete env.EXPO_PUBLIC_WANPANE_ENV;
    delete env.EXPO_PUBLIC_SUPABASE_URL;
    delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete env.WANPANE_METRO_CACHE_NAMESPACE;
    return env;
  }
  if (profile === 'e2e') {
    return {
      ...createE2EBuildEnvironment(process.env),
      WANPANE_METRO_CACHE_NAMESPACE: 'probe-e2e',
    };
  }
  const target = profile === 'staging' ? 'staging' : 'production';
  const [url, key] = safePublicValues[profile];
  return {
    ...createReleaseBuildEnvironment(target, process.env),
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: key,
    WANPANE_METRO_CACHE_NAMESPACE: `probe-${profile}`,
  };
};

const run = async (profile, clear = false) => {
  await runWebExport({ env: environmentFor(profile), outputDir: outputs[profile], clear });
};

const assertReleaseLike = async profile => {
  const text = await bundleText(outputs[profile]);
  const [expectedUrl, expectedKey] = safePublicValues[profile];
  const expectedEnvironment = profile === 'staging' ? 'staging' : 'production';
  assert.ok(text.includes(expectedUrl), `${profile}: expected public probe URL missing`);
  assert.ok(text.includes(expectedKey), `${profile}: expected public probe key missing`);
  assert.match(
    text,
    new RegExp(`allowsLocalReviewSeed\\)\\("${expectedEnvironment}"\\)`),
    `${profile}: local seed guard did not receive the explicit environment`,
  );
  assert.match(
    text,
    new RegExp(`isRuleReviewTestEnvironment\\)\\("${expectedEnvironment}"\\)`),
    `${profile}: fault plan guard did not receive the explicit environment`,
  );
  assert.ok(!text.includes(E2E_FIXTURE_URL), `${profile}: E2E fixture URL leaked`);
  assert.ok(!text.includes(E2E_FIXTURE_KEY), `${profile}: E2E fixture key leaked`);
  assert.ok(!/service_role|SUPABASE_SERVICE_ROLE/i.test(text), `${profile}: service role marker leaked`);
};

const assertE2E = async () => {
  const text = await bundleText(outputs.e2e);
  assert.match(text, /allowsLocalReviewSeed\)\("test"\)/, 'e2e: local seed test guard was not inlined');
  assert.match(text, /isRuleReviewTestEnvironment\)\("test"\)/, 'e2e: fault plan test guard was not inlined');
  assert.ok(text.includes(E2E_FIXTURE_URL), 'e2e: fixture URL was not inlined');
  assert.ok(text.includes(E2E_FIXTURE_KEY), 'e2e: fixture key was not inlined');
};

const assertUnknownEnvironmentFailsClosed = async () => {
  const text = await bundleText(outputs.default);
  assert.match(text, /allowsLocalReviewSeed\)\((?:void 0|undefined)\)/, 'default: local seed guard was not fail-closed');
  assert.match(text, /isRuleReviewTestEnvironment\)\((?:void 0|undefined)\)/, 'default: fault plan guard was not fail-closed');
  assert.ok(!text.includes(E2E_FIXTURE_URL), 'default: E2E fixture URL leaked');
  assert.ok(!text.includes(E2E_FIXTURE_KEY), 'default: E2E fixture key leaked');
  assert.ok(!/service_role|SUPABASE_SERVICE_ROLE/i.test(text), 'default: service role marker leaked');
};

// A. release -> release
await run('release', true);
await run('release');
await assertReleaseLike('release');
console.log('PASS A release -> release');

// B. e2e -> release
await run('e2e', true);
await run('release');
await assertReleaseLike('release');
console.log('PASS B e2e -> release');

// C. release -> e2e -> release
await run('release');
await run('e2e');
await run('release');
await assertReleaseLike('release');
console.log('PASS C release -> e2e -> release');

// D. e2e -> e2e -> release
await run('e2e');
await run('e2e');
await run('release');
await assertReleaseLike('release');
console.log('PASS D e2e -> e2e -> release');

// E. release -> e2e
await run('release');
await run('e2e');
await assertE2E();
console.log('PASS E release -> e2e');

await run('staging', true);
await assertReleaseLike('staging');
console.log('PASS staging profile: local seed/fault fixture markers absent');

// Exact M-6 shape: unknown-env clean export -> E2E -> unknown-env non-clean export.
await run('default', true);
await run('e2e');
await run('default');
await assertUnknownEnvironmentFailsClosed();
console.log('PASS M-6 default -> e2e -> default: unknown env remains fail-closed');
