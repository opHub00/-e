// Isolated migration verification. This never connects to Staging or Production.
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite(); let checks = 0;
const ok = (value, description) => { assert.ok(value, description); checks++; };
const denied = async (query, description) => { await assert.rejects(db.query(query), undefined, description); checks++; };
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;');
  await db.exec(await readFile(new URL('../supabase/migrations/20261022120000_product_v3_operational_analytics.sql', import.meta.url), 'utf8'));
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
  console.log(`Product V3 Analytics migration: ${checks} isolated PGlite checks passed`);
} finally { await db.close(); }
