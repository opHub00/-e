// Isolated PGlite verification. No network, credentials, or remote database writes.
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite(); let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const rejects = async (action, message) => { await assert.rejects(action, undefined, message); checks++; };
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;');
  await db.exec(await readFile(new URL('../supabase/migrations/20261016054748_product_v3_operations.sql', import.meta.url), 'utf8'));
  await db.query(`insert into public.product_v3_ai_monitoring(request_id,sanitized_question,resolver,mode,rag_evidence_count,grounding_result,latency_ms,notice_ids)
    values('r1','일정 알려줘','EXACT','llm',2,'PASSED',80,'["notice-1"]')`);
  await db.query(`insert into public.product_v3_assessment_monitoring(id,complete_count,needs_user_input_count,ineligible_count,unavailable_count,unresolved_labels)
    values('a1',1,2,1,0,'["소득","재당첨 제한"]')`);
  await db.query(`insert into public.product_v3_admin_audit_log(id,actor_id,actor_role,action,entity,entity_id,reason)
    values('audit-1','admin-1','admin','APPROVE_RULE_PACKAGE','RULE_PACKAGE','pkg-1','isolated verification')`);
  ok((await db.query('select count(*)::int count from public.product_v3_ai_monitoring')).rows[0].count === 1, 'AI row stored');
  await rejects(() => db.query("update public.product_v3_admin_audit_log set reason='changed' where id='audit-1'"), 'audit is append-only');
  await rejects(() => db.query(`insert into public.product_v3_ai_monitoring(request_id,sanitized_question,resolver,mode,rag_evidence_count,grounding_result,latency_ms,notice_ids)
    values('bad','x','EXACT','fallback',0,'NOT_RUN',1,'[]')`), 'fallback requires reason');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of ['product_v3_ai_monitoring','product_v3_assessment_monitoring','product_v3_admin_audit_log']) {
      await rejects(() => db.query(`select * from public.${table}`), `${role} cannot read ${table}`);
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) ok((await db.query('select has_table_privilege(current_user,$1,$2) allowed', [`public.${table}`, privilege])).rows[0].allowed === false, `${role} ${privilege} denied`);
    }
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  ok((await db.query('select count(*)::int count from public.product_v3_assessment_monitoring')).rows[0].count === 1, 'service role reads telemetry');
  await db.exec('reset role');
  console.log(`Product V3 operations SQL/RLS: ${checks} checks passed (isolated PGlite; no remote connection)`);
} finally { await db.close(); }
