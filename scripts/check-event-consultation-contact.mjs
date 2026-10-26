// Isolated migration and privilege check. Never connects to Staging or Production.
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;');
  const sql = await readFile(new URL('../supabase/migrations/20261026120000_event_consultation_contact_delivery.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  const tables = (await db.query("select relname, relrowsecurity from pg_class where relname in ('consultation_contacts','consultation_result_deliveries') order by relname")).rows;
  assert.equal(tables.length, 2); assert.ok(tables.every(row => row.relrowsecurity));
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of ['consultation_contacts', 'consultation_result_deliveries']) {
      await assert.rejects(db.query(`select * from public.${table}`));
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
        assert.equal((await db.query('select has_table_privilege(current_user,$1,$2) allowed', [`public.${table}`, privilege])).rows[0].allowed, false);
    }
    await assert.rejects(db.query("select * from public.register_consultation_contact(null,'a','notice-1','CONDITIONAL',now(),'QA','+821012345678','v1',now(),now()+interval '7 day')"));
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const call = `select * from public.register_consultation_contact(
    '26d97871-03b6-4074-8010-6a3fcb2fa44a', repeat('a',64), 'notice-1', 'CONDITIONAL',
    '2026-10-26T09:00:00Z', 'QA', '+821012345678', 'v1', '2026-10-26T10:00:00Z', '2026-11-02T10:00:00Z')`;
  const first = (await db.query(call)).rows[0];
  const retry = (await db.query(call)).rows[0];
  assert.equal(first.created, true); assert.equal(retry.created, false);
  assert.equal(first.contact_id, retry.contact_id); assert.equal(first.delivery_id, retry.delivery_id);
  assert.equal(first.delivery_status, 'PROVIDER_UNCONFIGURED');
  assert.equal((await db.query('select count(*)::int as count from public.consultation_contacts')).rows[0].count, 1);
  assert.equal((await db.query('select count(*)::int as count from public.consultation_result_deliveries')).rows[0].count, 1);
  await assert.rejects(db.query(call.replace("'QA'", "'OTHER'")));
  await assert.rejects(db.query("update public.consultation_result_deliveries set delivery_status='SENT'"));
  await db.query("update public.consultation_result_deliveries set delivery_status='SENDING'");
  await assert.rejects(db.query("update public.consultation_result_deliveries set delivery_status='SENT', sent_at=now()"));
  await db.query("update public.consultation_result_deliveries set delivery_status='SENT', sent_at=now(), provider_message_id='qa-provider-id'");
  await assert.rejects(db.query("update public.consultation_result_deliveries set delivery_status='SENDING'"));
  assert.equal((await db.query("select has_table_privilege(current_user,'public.consultation_contacts','INSERT') allowed")).rows[0].allowed, false);
  await db.query(`delete from public.consultation_contacts where id='${first.contact_id}'`);
  assert.equal((await db.query('select count(*)::int as count from public.consultation_result_deliveries')).rows[0].count, 0, 'deleting a contact removes its delivery record');
  await db.exec('reset role');
  console.log('Event contact migration: isolated RLS, idempotency and delivery-status checks passed; no remote connection');
} finally { await db.close(); }
