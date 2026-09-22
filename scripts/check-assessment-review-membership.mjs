// Isolated PostgreSQL test for reviewer/admin membership RPCs, audit and grants. No network or credentials.
import { readdir, readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite(); let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const rejects = async (fn, pattern, message) => { await assert.rejects(fn, pattern, message); checks++; };
const users = {
  admin: ['55555555-5555-4555-8555-555555555555', 'admin@example.test'],
  reviewer: ['44444444-4444-4444-8444-444444444444', 'reviewer@example.test'],
  normal: ['66666666-6666-4666-8666-666666666666', 'normal@example.test'],
  second: ['77777777-7777-4777-8777-777777777777', 'Second@Example.test'],
};
const as = async (role, who) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who ? users[who][0] : '']);
  await db.exec(`set role ${role}`);
};
const call = async (sql, params = []) => (await db.query(sql, params)).rows[0];

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key, email text);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security; grant usage on schema public,auth,storage to anon,authenticated,service_role; grant all on storage.objects to anon,authenticated,service_role;`);
  for (const [id, email] of Object.values(users)) await db.query('insert into auth.users(id,email) values($1,$2)', [id, email]);
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name >= '20260915').sort();
  for (const name of migrations) {
    if (name.startsWith('20260923090000')) {
      // A member that exists before auditing starts gets a BASELINE row.
      await db.query("insert into public.assessment_review_members(user_id,role) values($1,'reviewer')", [users.reviewer[0]]);
    }
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  ok(migrations.at(-1).startsWith('20260923090000'), 'membership migration applies last');
  const baseline = (await db.query("select action, actor_role, target_user_id from public.assessment_review_membership_audit_log")).rows;
  ok(baseline.length === 1 && baseline[0].action === 'BASELINE' && baseline[0].target_user_id === users.reviewer[0], 'existing member recorded as BASELINE');

  // service role: no direct writes, bootstrap only while no admin exists.
  await as('service_role');
  await rejects(() => db.query("insert into public.assessment_review_members(user_id,role) values($1,'admin')", [users.admin[0]]), /permission denied/, 'service role cannot insert members directly');
  await rejects(() => db.query("update public.assessment_review_members set role='admin'"), /permission denied/, 'service role cannot update members directly');
  await rejects(() => db.query('delete from public.assessment_review_members'), /permission denied/, 'service role cannot delete members directly');
  await rejects(() => db.query("select public.list_assessment_review_members()"), /permission denied/, 'service role cannot call admin list');
  await rejects(() => db.query("select public.bootstrap_assessment_review_admin($1,'x')", [users.admin[1]]), /REASON_REQUIRED/, 'bootstrap needs a reason');
  await rejects(() => db.query("select public.bootstrap_assessment_review_admin('nobody@example.test','first admin')"), /USER_NOT_FOUND/, 'bootstrap needs an existing user');
  ok((await call("select public.bootstrap_assessment_review_admin($1,'first production admin') r", [users.admin[1]])).r.status === 'BOOTSTRAP_ADMIN', 'service role bootstraps the first admin');
  await rejects(() => db.query("select public.bootstrap_assessment_review_admin($1,'second bootstrap')", [users.second[1]]), /ADMIN_ALREADY_EXISTS/, 'bootstrap refused once an admin exists');

  // anon: nothing.
  await as('anon');
  for (const sql of ["select public.list_assessment_review_members()", "select public.set_assessment_review_member('a@b.c','reviewer','reason')",
    "select public.revoke_assessment_review_member('a@b.c','reason')", "select public.bootstrap_assessment_review_admin('a@b.c','reason')",
    'select * from public.assessment_review_membership_audit_log', 'select * from public.assessment_review_members'])
    await rejects(() => db.query(sql), /permission denied/, `anon denied: ${sql}`);

  // normal authenticated user and reviewer: no mutation, no list.
  for (const who of ['normal', 'reviewer']) {
    await as('authenticated', who);
    await rejects(() => db.query('select public.list_assessment_review_members()'), /FORBIDDEN/, `${who} cannot list members`);
    await rejects(() => db.query("select public.set_assessment_review_member($1,'admin','promote myself')", [users[who][1]]), /FORBIDDEN/, `${who} cannot grant`);
    await rejects(() => db.query("select public.revoke_assessment_review_member($1,'remove admin')", [users.admin[1]]), /FORBIDDEN/, `${who} cannot revoke`);
    await rejects(() => db.query("select public.bootstrap_assessment_review_admin($1,'bootstrap')", [users[who][1]]), /permission denied/, `${who} cannot bootstrap`);
    await rejects(() => db.query('select * from public.assessment_review_membership_audit_log'), /permission denied/, `${who} cannot read raw audit`);
  }

  // admin: grant, change role, revoke, with audit.
  await as('authenticated', 'admin');
  await rejects(() => db.query("select public.set_assessment_review_member($1,'owner','bad role')", [users.second[1]]), /INVALID_REVIEW_ROLE/, 'unknown role refused');
  await rejects(() => db.query("select public.set_assessment_review_member($1,'reviewer','')", [users.second[1]]), /REASON_REQUIRED/, 'reason required');
  await rejects(() => db.query("select public.set_assessment_review_member($1,'reviewer','demote myself')", [users.admin[1]]), /SELF_MEMBERSHIP_CHANGE_FORBIDDEN/, 'admin cannot change own role');
  await rejects(() => db.query("select public.revoke_assessment_review_member($1,'remove myself')", [users.admin[1]]), /SELF_MEMBERSHIP_CHANGE_FORBIDDEN/, 'admin cannot revoke self');
  ok((await call("select public.set_assessment_review_member('second@example.test','reviewer','new reviewer for Godeok') r")).r.status === 'GRANT', 'grant by case-insensitive email');
  ok((await call("select public.set_assessment_review_member($1,'reviewer','again') r", [users.second[1]])).r.status === 'NO_CHANGE', 'same role is a no-op');
  ok((await call("select public.set_assessment_review_member($1,'admin','promote to admin') r", [users.second[1]])).r.status === 'CHANGE_ROLE', 'role change');
  ok((await call("select public.revoke_assessment_review_member($1,'left the team') r", [users.second[1]])).r.previousRole === 'admin', 'revoke');
  ok((await call("select public.revoke_assessment_review_member($1,'again') r", [users.second[1]])).r.status === 'NO_CHANGE', 'revoke twice is a no-op');
  ok((await call("select public.set_assessment_review_member($1,'reviewer','came back') r", [users.second[1]])).r.status === 'GRANT', 're-grant after revoke is a GRANT');
  const listed = (await call('select public.list_assessment_review_members() r')).r;
  ok(listed.members.length === 3 && listed.members.every(m => m.email), 'admin lists members with email');
  const actions = listed.audit.map(a => a.action).reverse();
  ok(JSON.stringify(actions) === JSON.stringify(['BASELINE', 'BOOTSTRAP_ADMIN', 'GRANT', 'CHANGE_ROLE', 'REVOKE', 'GRANT']), `audit order ${actions}`);
  ok(listed.audit.filter(a => a.actor_role === 'admin').every(a => a.actor_user_id === users.admin[0]), 'admin actions carry the actor');

  // access follows membership.
  await as('authenticated', 'second');
  ok((await call('select public.get_assessment_review_access() a')).a.role === 'reviewer', 're-granted member has reviewer access');
  await as('service_role');
  ok((await db.query("select 1 from public.assessment_review_members where user_id=$1 and enabled", [users.second[0]])).rows.length === 1, 'service role can still read members');

  // audit is append-only, even for the owner.
  await db.exec('reset role');
  await rejects(() => db.query('update public.assessment_review_membership_audit_log set reason = $1', ['rewritten']), /append-only/, 'audit update blocked');
  await rejects(() => db.query('delete from public.assessment_review_membership_audit_log'), /append-only/, 'audit delete blocked');
  console.log(`Assessment review membership SQL/RLS: ${checks} checks passed (isolated PGlite; no remote connection)`);
} finally { await db.close(); }
