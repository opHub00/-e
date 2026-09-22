import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { decodeListingBindingState, SupabaseListingBindingRepository, bindingErrorMessage, type ListingBindingRpcClient } from './repository/ListingBindingRepository.ts';
import { buildBindingRows } from './ui/listingBindingPresentation.ts';

const A = { announcementId: 'a-1', title: '공고 1', activeRuleSetId: 'rs-1', activeVersion: 'v1', sourceStatus: 'OFFICIAL_VERIFIED', listingIds: ['apt-1-1'] };
const B = { announcementId: 'a-2', title: '공고 2', activeRuleSetId: 'rs-2', activeVersion: 'v2', sourceStatus: 'DRAFT_SOURCE_VERIFIED', listingIds: ['draft-2'] };
const binding = (listingId: string, announcementId: string, boundRuleSetId: string, revision = 1) =>
  ({ listingId, announcementId, announcementTitle: announcementId === 'a-1' ? '공고 1' : '공고 2', boundRuleSetId, activeRuleSetId: boundRuleSetId, revision, updatedAt: '2026-09-22T00:00:00Z' });
const state = (role: 'admin' | 'reviewer', bindings: ReturnType<typeof binding>[]) => ({ role, announcements: [A, B], bindings, audit: [] });

test('rows show each canonical listing and offer only the actions the server would accept', () => {
  const rows = buildBindingRows(state('admin', [binding('apt-1-1', 'a-1', 'rs-1', 3)]));
  const bound = rows.find(r => r.listingId === 'apt-1-1')!, unbound = rows.find(r => r.listingId === 'draft-2')!;
  assert.equal(bound.status, 'BOUND');
  assert.deepEqual(bound.actions.map(a => [a.kind, a.expectedRevision]), [['UNBIND', 3]]);
  assert.equal(unbound.status, 'UNBOUND');
  assert.deepEqual(unbound.actions.map(a => [a.kind, a.ruleSetId, a.expectedRevision]), [['BIND', 'rs-2', 0]]);
});

test('a stale version, a wrong announcement and an unplaceable listing are all shown and repairable', () => {
  const rows = buildBindingRows(state('admin', [
    binding('apt-1-1', 'a-1', 'rs-old', 2), binding('draft-2', 'a-1', 'rs-1', 4), binding('legacy-x', 'a-2', 'rs-2', 1),
  ]));
  const byId = Object.fromEntries(rows.map(r => [r.listingId, r]));
  assert.equal(byId['apt-1-1'].status, 'STALE_VERSION');
  assert.deepEqual(byId['apt-1-1'].actions.map(a => [a.kind, a.ruleSetId, a.expectedRevision]), [['REBIND', 'rs-1', 2], ['UNBIND', null, 2]]);
  assert.equal(byId['draft-2'].status, 'WRONG_ANNOUNCEMENT');
  assert.equal(byId['draft-2'].actions[0].ruleSetId, 'rs-2', 'repair points at the listing owner, not the wrong announcement');
  assert.equal(byId['legacy-x'].status, 'UNKNOWN_LISTING');
  assert.deepEqual(byId['legacy-x'].actions.map(a => a.kind), ['UNBIND']);
});

test('reviewers get the same table with no actions', () => {
  const rows = buildBindingRows(state('reviewer', [binding('apt-1-1', 'a-1', 'rs-old', 2)]));
  assert.ok(rows.length === 2 && rows.every(r => r.actions.length === 0));
});

test('decoder is strict and the repository never throws', async () => {
  assert.throws(() => decodeListingBindingState({ role: 'user', announcements: [], bindings: [], audit: [] }), /INVALID_RESPONSE/);
  assert.throws(() => decodeListingBindingState({ role: 'admin', announcements: [{ ...A, listingIds: 'apt-1-1' }], bindings: [], audit: [] }), /INVALID_RESPONSE/);
  const reply = (data: unknown, error: { message?: string; code?: string } | null = null): ListingBindingRpcClient => ({ rpc: async () => ({ data, error }) });
  assert.deepEqual(await new SupabaseListingBindingRepository(reply(null, { message: 'FORBIDDEN' })).bind({ listingId: 'x', ruleSetId: 'y', expectedRevision: 0, reason: 'r' }), { status: 'FAILED', code: 'FORBIDDEN' });
  assert.deepEqual(await new SupabaseListingBindingRepository(reply(null, { message: 'permission denied', code: '42501' })).unbind({ listingId: 'x', expectedRevision: 1, reason: 'r' }), { status: 'FAILED', code: 'FORBIDDEN' });
  assert.deepEqual(await new SupabaseListingBindingRepository(reply({ status: 'EVERYTHING' })).bind({ listingId: 'x', ruleSetId: 'y', expectedRevision: 0, reason: 'r' }), { status: 'FAILED', code: 'INVALID_RESPONSE' });
  const thrower: ListingBindingRpcClient = { rpc: async () => { throw new Error('offline'); } };
  assert.deepEqual(await new SupabaseListingBindingRepository(thrower).load(), { status: 'FAILED', code: 'NETWORK' });
  const ok = await new SupabaseListingBindingRepository(reply({ status: 'NO_CHANGE', listingId: 'x', revision: 3 })).bind({ listingId: 'x', ruleSetId: 'y', expectedRevision: 3, reason: 'r' });
  assert.deepEqual(ok, { status: 'NO_CHANGE', listingId: 'x', revision: 3 });
  assert.match(bindingErrorMessage('ANNOUNCEMENT_MISMATCH'), /다른 공고/);
});

// The database is the authorization boundary; pin its security properties so an edit cannot quietly weaken them.
const migrations = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort();
const sql = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const binding_sql = sql('20260922120000_listing_binding_operations.sql');
const fnBody = (text: string, name: string) => { const start = text.indexOf(`function public.${name}(`); return text.slice(start, text.indexOf('end $$;', start)); };

test('binding RPCs authorize as admin on the server before touching data', () => {
  for (const name of ['bind_listing_to_assessment_rule_set', 'unbind_listing_from_assessment_rule_set']) {
    const body = fnBody(binding_sql, name);
    assert.match(body, /security definer set search_path = ''/, name);
    const firstStatement = body.slice(body.indexOf('begin') + 5).trim();
    assert.match(firstStatement, /^actor_role := public\.assert_assessment_review_access\(true\);/, `${name} must authorize first`);
    assert.match(body, /STALE_BINDING_REVISION/, `${name} must guard the revision`);
    assert.match(body, /insert into public\.announcement_listing_binding_audit_log/, `${name} must audit`);
  }
  const bind = fnBody(binding_sql, 'bind_listing_to_assessment_rule_set');
  for (const code of ['UNKNOWN_RULE_SET', 'RULE_SET_NOT_ACTIVE', 'ANNOUNCEMENT_MISMATCH', 'UNKNOWN_LISTING', 'REASON_REQUIRED']) assert.match(bind, new RegExp(code));
  const readFix = sql('20260922121000_listing_binding_read_fix.sql');
  assert.match(fnBody(readFix, 'load_assessment_listing_bindings'), /public\.assert_assessment_review_access\(false\)/);
});

test('audit is append-only, private, and anon cannot execute binding RPCs', () => {
  assert.match(binding_sql, /before update or delete on public\.announcement_listing_binding_audit_log/);
  assert.match(binding_sql, /revoke all on public\.announcement_listing_binding_audit_log from public, anon, authenticated;/);
  assert.match(binding_sql, /from public, anon, authenticated;\s*-- Authorization happens inside/);
  const grants = binding_sql.slice(binding_sql.indexOf('grant execute on function public.bind_listing'));
  assert.doesNotMatch(grants.slice(0, grants.indexOf(';')), /\banon\b/);
});

test('the consultation read path is not redefined by the binding migrations', () => {
  for (const name of migrations.filter(m => m >= '20260922120000')) assert.doesNotMatch(sql(name), /function public\.read_assessment_rule_set/, name);
});
