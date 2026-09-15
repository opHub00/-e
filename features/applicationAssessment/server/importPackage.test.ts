import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { syntheticPackage } from './lifecycleFixture.test-data.ts';
import { validateImportPackage } from './importPackage.ts';
import { createRuleLifecycle } from './lifecycle.ts';
import { guardImportTarget } from './importTarget.ts';
import { createSupabaseRuleRepository } from '../data/supabaseRuleRepository.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

test('Import package preserves schema, draft status, null pages and document provenance', () => {
  const p = syntheticPackage(), { package: parsed, rules } = validateImportPackage(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(parsed, p); assert.equal(rules.sourceStatus, 'DRAFT_SOURCE_VERIFIED');
  assert.equal(rules.provenance?.documentId, p.document.id);
  assert.equal(rules.supplies[0].eligibility[0].evidence.page, undefined);
  assert.equal(rules.supplies[2].stages[0].scores, null);
});
for (const [name, mutate] of Object.entries({
  unknownSchema: p => { p.schemaVersion = 2; },
  missingDocument: p => { delete p.document; },
  missingEvidence: p => { delete p.rules[0].evidence; },
  wrongDocument: p => { p.rules[0].evidence.documentId = p.announcement.id; },
  wrongPath: p => { p.document.storagePath = 'file.hwp'; },
  missingHash: p => { p.document.sha256 = ''; },
  guessedPage: p => { p.rules[0].evidence.pageNumber = 0; },
  invalidDate: p => { p.announcement.announcementDate = '2026-02-30'; },
  malformedConfig: p => { p.rules[0].config.expression.op = 'execute'; },
  unknownConfig: p => { p.rules[0].config.override = true; },
  forgedOfficial: p => { p.ruleSet.sourceStatus = 'OFFICIAL_VERIFIED'; },
  hiddenApproval: p => { p.ruleSet.approved_at = '2026-09-15'; },
  duplicateRule: p => { p.rules.push(p.rules[0]); },
} satisfies Record<string, (p: any) => void>)) {
  test(`Reject ${name} before any database write`, async () => {
    const p = syntheticPackage(); mutate(p); let calls = 0;
    const lifecycle = createRuleLifecycle(async () => { calls++; return null; });
    await assert.rejects(lifecycle.import(p)); assert.equal(calls, 0);
  });
}
test('Target guard rejects production, arbitrary hosts and missing environment', () => {
  const production = ['https://prod.supabase.co'];
  assert.throws(() => guardImportTarget(production[0], 'staging', 'prod', production));
  assert.throws(() => guardImportTarget('https://other.supabase.co', 'staging', 'stage', production));
  assert.throws(() => guardImportTarget('http://remote.example', 'local', undefined, production));
  assert.throws(() => guardImportTarget('http://127.0.0.1:54321', undefined, undefined, production));
  assert.equal(guardImportTarget('http://127.0.0.1:54321', 'local', undefined, production), 'http://127.0.0.1:54321');
  assert.equal(guardImportTarget('http://127.0.0.1:54321', 'local', undefined, ['http://127.0.0.1:54321']), 'http://127.0.0.1:54321');
  assert.equal(guardImportTarget('https://stage.supabase.co', 'staging', 'stage', production), 'https://stage.supabase.co');
});
test('Abort timeout is surfaced without a static fallback', async () => {
  const originalTimeout = globalThis.setTimeout;
  // Compress the adapter's 15-second deadline without changing production configuration.
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => originalTimeout(callback, 1)) as typeof setTimeout;
  try {
    const client = { rpc: () => ({ abortSignal: (signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) }) } as unknown as SupabaseClient;
    const result = await createSupabaseRuleRepository(client).getActiveRuleSet({ announcementId: syntheticPackage().announcement.id });
    assert.equal(result.status, 'SERVICE_UNAVAILABLE');
  } finally { globalThis.setTimeout = originalTimeout; }
});
