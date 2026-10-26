// Isolated migration verification. This never connects to Staging or Production.
import { readFile, readdir } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite(); let checks = 0;
const ok = (value, description) => { assert.ok(value, description); checks++; };
const denied = async (query, description) => { await assert.rejects(db.query(query), undefined, description); checks++; };
try {
  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
  const versions = files.map(name => name.slice(0, 14));
  ok(new Set(versions).size === versions.length, 'local migration versions are unique');
  ok(files.includes('20261022120000_product_v3_operational_analytics.sql'), 'Analytics migration remains in the local chain');
  const tableOwners = [];
  for (const file of files) if (/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.product_v3_analytics_events\b/i
    .test(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))) tableOwners.push(file);
  ok(tableOwners.length === 1 && tableOwners[0] === '20261022120000_product_v3_operational_analytics.sql', 'no other local migration creates the Analytics table');
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;`);
  for (const migration of [
    '20260915105910_assessment_rule_registry.sql',
    '20261016054748_product_v3_operations.sql',
    '20261018072931_product_v3_assessment_events.sql',
    '20261018134607_product_v3_rag_index_metadata.sql',
    '20261018181550_product_v3_rag_index_grants_hardening.sql',
    '20261022120000_product_v3_operational_analytics.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  ok((await db.query("select count(*)::int count from pg_class where relnamespace='public'::regnamespace and relname = any($1::text[])",
    [['product_v3_ai_monitoring', 'product_v3_assessment_events', 'product_v3_rag_index_metadata', 'product_v3_analytics_events']])).rows[0].count === 4,
    'Analytics and preceding Product V3 objects coexist without collision');
  const table = 'public.product_v3_analytics_events';
  const columns = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='product_v3_analytics_events'`)).rows.map(row => row.column_name);
  for (const prohibited of ['name', 'email', 'phone', 'birth_date', 'income', 'assets', 'qr_token', 'profile', 'question', 'answer', 'raw_fact_value'])
    ok(!columns.includes(prohibited), `no ${prohibited} column`);
  const row = `('26d97871-03b6-4074-8010-6a3fcb2fa44a','829c8bfe-b396-4ac8-9f04-4bd8974203f4','notice-1','VER1.8','SESSION_STARTED','staging','qa')`;
  await db.query(`insert into ${table}(event_id,anonymous_session_id,notice_id,notice_version,event_type,environment,traffic_type) values ${row}`);
  await denied(`insert into ${table}(event_id,anonymous_session_id,notice_id,notice_version,event_type,environment,traffic_type) values ${row}`, 'event ID is idempotent');
  await denied(`insert into ${table}(event_id,anonymous_session_id,notice_id,notice_version,event_type,environment,traffic_type) values ('36d97871-03b6-4074-8010-6a3fcb2fa44a','829c8bfe-b396-4ac8-9f04-4bd8974203f4','notice-1','VER1.8','SESSION_STARTED','staging','real')`, 'real traffic cannot be Staging');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await denied(`select * from ${table}`, `${role} read denied`);
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) ok(!(await db.query('select has_table_privilege(current_user,$1,$2) allowed', [table, privilege])).rows[0].allowed, `${role} ${privilege} denied`);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  ok((await db.query('select has_table_privilege(current_user,$1,$2) allowed', [table, 'INSERT'])).rows[0].allowed, 'server insert allowed');
  ok((await db.query('select has_table_privilege(current_user,$1,$2) allowed', [table, 'SELECT'])).rows[0].allowed, 'server read allowed');
  ok(!(await db.query('select has_table_privilege(current_user,$1,$2) allowed', [table, 'DELETE'])).rows[0].allowed, 'server delete denied pending retention policy');
  await db.exec('reset role');
  ok((await db.query("select relrowsecurity from pg_class where oid='public.product_v3_analytics_events'::regclass")).rows[0].relrowsecurity, 'RLS enabled');
  console.log(`Product V3 Analytics migration chain: ${checks} isolated PGlite checks passed (no remote connection)`);
} finally { await db.close(); }
