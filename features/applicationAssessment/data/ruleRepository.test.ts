import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { samdoReferenceRules } from '../referenceRules.ts';
import { assessApplication } from '../engine.ts';
import { createMinimalApplicantProfile } from '../../profile/domain.ts';
import { serializeRuleSet, decodeRuleSet } from './ruleCodec.ts';
import { StaticAssessmentRuleRepository } from './ruleRepository.ts';
import { DatabaseAssessmentRuleRepository } from './databaseRuleRepository.ts';
import { createSupabaseRuleRepository } from './supabaseRuleRepository.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const ids = { announcementId: '11111111-1111-4111-8111-111111111111', ruleSetId: '22222222-2222-4222-8222-222222222222', documentId: null };
const lookup = { announcementId: ids.announcementId };
function payload() {
  const p = serializeRuleSet(samdoReferenceRules, ids);
  return { ...p, rule_set: { ...p.rule_set, is_active: true, is_public: true, approved_at: '2026-09-15T00:00:00Z' } };
}
const repository = (value: unknown) => new DatabaseAssessmentRuleRepository({ read: async () => value, catalog: async () => [] });
const input = { profile: createMinimalApplicantProfile({ name: 'DB test', age: 30, currentRegion: '제주특별자치도', preferredRegions: [] }), details: {} };

test('DB rows round-trip: ordered rules, evidence and pure evaluator are preserved', () => {
  const result = decodeRuleSet(JSON.parse(JSON.stringify(payload())), lookup);
  assert.equal(result.status, 'AVAILABLE');
  if (result.status !== 'AVAILABLE') return;
  assert.deepEqual(result.rules.supplies, samdoReferenceRules.supplies);
  assert.deepEqual(result.rules.parameters, samdoReferenceRules.parameters);
  assert.equal(result.rules.provenance?.announcementId, ids.announcementId);
  assert.equal(result.rules.id, ids.ruleSetId);
  assert.equal(result.rules.sourceStatus, 'REFERENCE');
  const actual = assessApplication(result.rules, input);
  const expected = assessApplication(samdoReferenceRules, input);
  assert.deepEqual(actual.map(r => [r.status, r.stage, r.score, r.missingInformation]), expected.map(r => [r.status, r.stage, r.score, r.missingInformation]));
});
test('Serialization never publishes, activates or upgrades legacy VERIFIED', () => {
  const r = structuredClone(samdoReferenceRules); r.verification = 'VERIFIED';
  const encoded = serializeRuleSet(r, ids);
  assert.equal(encoded.rule_set.source_status, 'REFERENCE');
  assert.equal(encoded.rule_set.is_active, false); assert.equal(encoded.rule_set.is_public, false); assert.equal(encoded.rule_set.approved_at, null);
});
for (const field of ['is_active', 'is_public', 'approved_at'] as const) test(`Inactive/private/unapproved excluded: ${field}`, async () => {
  const p = payload(); Object.assign(p.rule_set, { [field]: field === 'approved_at' ? null : false });
  assert.equal((await repository(p).getActiveRuleSet(lookup)).status, 'RULE_NOT_AVAILABLE');
});
test('Unknown announcement and empty response do not fallback', async () => {
  assert.equal((await repository(null).getActiveRuleSet(lookup)).status, 'RULE_NOT_AVAILABLE');
  assert.equal((await repository(payload()).getActiveRuleSet({ announcementId: 'bad-id' })).status, 'RULE_NOT_AVAILABLE');
});
test('Database failure is explicit; reference never replaces it', async () => {
  const repo = new DatabaseAssessmentRuleRepository({ read: async () => { throw new Error('offline'); }, catalog: async () => { throw new Error('offline'); } });
  assert.equal((await repo.getActiveRuleSet(lookup)).status, 'SERVICE_UNAVAILABLE');
  assert.equal((await repo.listAnnouncements()).status, 'SERVICE_UNAVAILABLE');
});
test('Static registry retains exact binding and returns isolated snapshots', async () => {
  const repo = new StaticAssessmentRuleRepository([samdoReferenceRules]);
  assert.equal((await repo.getActiveRuleSet({ listingId: 'wrong' })).status, 'RULE_NOT_AVAILABLE');
  const result = await repo.getActiveRuleSet({ listingId: samdoReferenceRules.listingId });
  assert.equal(result.status, 'AVAILABLE');
  if (result.status === 'AVAILABLE') result.rules.title = 'mutated';
  assert.equal((await repo.listAnnouncements()).status, 'AVAILABLE');
  const again = await repo.getActiveRuleSet({ announcementId: samdoReferenceRules.id });
  assert.equal(again.status === 'AVAILABLE' && again.rules.title, samdoReferenceRules.title);
});
test('Wrong announcement and listing bindings fail closed', () => {
  assert.equal(decodeRuleSet(payload(), { announcementId: ids.ruleSetId }).status, 'INVALID_RULE_SET');
  assert.equal(decodeRuleSet(payload(), { listingId: 'seoul' }).status, 'INVALID_RULE_SET');
});
test('Unknown schema is distinct from missing rules', () => {
  const p = payload(); p.rule_set.schema_version = 99;
  assert.equal(decodeRuleSet(p, lookup).status, 'UNSUPPORTED_SCHEMA');
});
test('Missing, duplicate and unreferenced rows are rejected', () => {
  const p = payload(); p.rules.pop(); assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
  const q = payload(); q.rules.push(q.rules[0]); assert.equal(decodeRuleSet(q, lookup).status, 'INVALID_RULE_SET');
  const r = payload(); r.rules.push({ ...r.rules[0], rule_key: 'extra' }); assert.equal(decodeRuleSet(r, lookup).status, 'INVALID_RULE_SET');
});
test('Evidence omission, guessed page zero and foreign document fail closed', () => {
  const original = (payload().rules[0].evidence as Record<string, unknown>[])[0];
  for (const evidence of [[], [{ ...original, page_number: 0 }], [{ ...original, document_id: ids.ruleSetId }]]) {
    const p = payload(); p.rules[0].evidence = evidence; assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
  }
});
test('Conflicting evidence identity is rejected instead of showing another rule source', () => {
  const p = payload();
  const first = (p.rules[0].evidence as Record<string, unknown>[])[0];
  const second = (p.rules[1].evidence as Record<string, unknown>[])[0];
  second.evidence_key = first.evidence_key;
  assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
});
test('Legacy VERIFIED does not invent OFFICIAL_VERIFIED provenance', () => {
  const r = structuredClone(samdoReferenceRules); r.verification = 'VERIFIED'; r.announcementDate = '2026-09-14';
  assert.equal(assessApplication(r, input)[0].sourceStatus, undefined);
  r.sourceStatus = 'REFERENCE';
  assert.equal(assessApplication(r, input)[0].sourceStatus, 'REFERENCE');
  assert.equal(assessApplication(r, input)[0].status, 'NEEDS_MORE_INFORMATION');
});
test('Unknown fact/operator/parameter and empty boolean expressions are rejected', () => {
  for (const expression of [{ fact: 'newUnsupportedFact', op: 'eq', value: true }, { fact: 'age', op: 'execute', value: 1 },
    { fact: 'age', op: 'gte', value: { parameter: 'missing' } }, { all: [] }, { all: [], any: [] }]) {
    const p = payload(); (p.rules[0].config as Record<string, unknown>).expression = expression;
    assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
  }
});
test('Future config semantics cannot silently be discarded', () => {
  const p = payload(); (p.rules[0].config as Record<string, unknown>).unsupportedException = true;
  assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
});
test('Malformed and overlapping score bands are rejected before evaluation', () => {
  for (const bands of [[{ min: 0, max: 10, points: 3 }, { min: 10, points: 1 }], [{ points: -1 }], [], [{ min: 5, max: 1, points: 1 }]]) {
    const p = payload(); const row = p.rules.find(r => r.category === 'SCORE')!;
    (row.config as Record<string, unknown>).bands = bands;
    assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
  }
});
test('Malformed stage ordering, unknown supply and no-score modes fail closed', () => {
  const p = payload(); p.rule_set.config.supplies[0].stages.reverse(); assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
  const q = payload(); Object.assign(q.rule_set.config.supplies[0], { type: 'NEWBORN' }); assert.equal(decodeRuleSet(q, lookup).status, 'INVALID_RULE_SET');
  const r = payload(); r.rule_set.config.supplies[2].stages[0].scores = []; assert.equal(decodeRuleSet(r, lookup).status, 'INVALID_RULE_SET');
});
test('Verified state requires real document identity and valid fixed date', () => {
  for (const status of ['DRAFT_SOURCE_VERIFIED', 'OFFICIAL_VERIFIED'] as const) {
    const p = payload(); p.rule_set.source_status = status;
    assert.equal(decodeRuleSet(p, lookup).status, 'INVALID_RULE_SET');
  }
});
test('Synthetic draft source calculates deterministically and carries provenance warning', () => {
  const r = structuredClone(samdoReferenceRules);
  r.sourceStatus = 'DRAFT_SOURCE_VERIFIED'; r.announcementDate = '2026-09-14';
  r.supplies = [{ type: 'youth', eligibility: [{ id: 'synthetic.age', label: 'TEST ONLY', expression: { fact: 'age', op: 'gte', value: 19 }, documents: ['TEST'], evidence: r.supplies[0].eligibility[0].evidence }],
    stages: [{ stage: 'GENERAL', conditions: [], scores: null }] }];
  const p = serializeRuleSet(r, { ...ids, documentId: '33333333-3333-4333-8333-333333333333' });
  const wire = { ...p, rule_set: { ...p.rule_set, is_active: true, is_public: true, approved_at: '2026-09-15T00:00:00Z' } };
  const decoded = decodeRuleSet(wire, lookup); assert.equal(decoded.status, 'AVAILABLE');
  if (decoded.status !== 'AVAILABLE') return;
  const [result] = assessApplication(decoded.rules, { ...input, details: { birthDate: '1996-09-14' } });
  assert.equal(result.status, 'ELIGIBLE'); assert.equal(result.sourceStatus, 'DRAFT_SOURCE_VERIFIED');
  assert.equal(result.warnings.filter(w => w.includes('검토본')).length, 1);
  assert.equal(result.provenance?.documentId, p.rule_set.document_id);
});
test('Selected lottery stage has no score even if earlier stages use points', () => {
  const r = structuredClone(samdoReferenceRules);
  r.sourceStatus = 'DRAFT_SOURCE_VERIFIED'; r.announcementDate = '2026-09-14';
  const ev = r.supplies[0].eligibility[0].evidence;
  r.supplies = [{ type: 'newlywed', eligibility: [{ id: 'test.age', label: 'TEST', expression: { fact: 'age', op: 'gte', value: 19 }, documents: [], evidence: ev }],
    stages: [{ stage: 'GENERAL', conditions: [{ id: 'test.stage', label: 'TEST', expression: { fact: 'age', op: 'lte', value: 20 }, documents: [], evidence: ev }],
      scores: [{ id: 'test.score', label: 'TEST', fact: 'age', bands: [{ points: 1 }], evidence: ev }] },
    { stage: 'LOTTERY', conditions: [], scores: null }] }];
  const result = assessApplication(r, { ...input, details: { birthDate: '1996-09-14' } })[0];
  assert.equal(result.status, 'ELIGIBLE'); assert.equal(result.stage, 'LOTTERY');
  assert.equal(result.scoring, 'NOT_APPLICABLE'); assert.equal(result.score, undefined);
});
test('Catalog paginates metadata without reading any rule payloads', async () => {
  let reads = 0;
  const repo = new DatabaseAssessmentRuleRepository({ read: async () => { reads++; }, catalog: async () => Array.from({ length: 51 }, (_, i) => ({ id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`, title: 'metadata', source_status: 'REFERENCE' })) });
  const result = await repo.listAnnouncements(); assert.equal(result.status, 'AVAILABLE');
  if (result.status === 'AVAILABLE') { assert.equal(result.items.length, 50); assert.equal(result.nextCursor, result.items[49].id); }
  assert.equal(reads, 0);
});
test('Supabase adapter uses one scoped RPC and propagates unavailable state', async () => {
  const calls: unknown[] = [];
  const fake = { rpc: (name: string, args: unknown) => { calls.push({ name, args }); return { abortSignal: async () => ({ data: null, error: null }) }; } } as unknown as SupabaseClient;
  const repo = createSupabaseRuleRepository(fake);
  assert.equal((await repo.getActiveRuleSet({ listingId: 'apt:exact:id' })).status, 'RULE_NOT_AVAILABLE');
  assert.deepEqual(calls, [{ name: 'read_assessment_rule_set', args: { p_announcement_id: null, p_listing_id: 'apt:exact:id' } }]);
  assert.equal((await createSupabaseRuleRepository(null).getActiveRuleSet(lookup)).status, 'SERVICE_UNAVAILABLE');
});
