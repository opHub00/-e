// Isolated PGlite migration/lifecycle verification. No network or credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { buildScoringSeedPackage } from '../features/scoringFormula/seedPackage.ts';
import { scoringFormula } from '../features/scoringFormula/registry.ts';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite(); let checks = 0;
const upgradeDb = new PGlite();
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const rejects = async (fn, pattern, message) => { await assert.rejects(fn, pattern, message); checks += 1; };
const admin = '11111111-1111-4111-8111-111111111111';
const reviewer = '22222222-2222-4222-8222-222222222222';
const setupSql = `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.user_profiles(user_id uuid primary key,profile_json jsonb not null default '{}'::jsonb);
    create table public.assessment_review_members(user_id uuid primary key,role text not null,enabled boolean not null default true);
    insert into auth.users values('${admin}','admin@example.test'),('${reviewer}','reviewer@example.test');
    insert into public.user_profiles values('${admin}', '{"basic":{"name":"관리자"}}');
    insert into public.assessment_review_members values('${admin}','admin',true),('${reviewer}','reviewer',true);
    create function public.assert_assessment_review_access(p_admin boolean default false) returns text language plpgsql stable security definer set search_path='' as $$
    declare value text; begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
    select role into value from public.assessment_review_members where user_id=auth.uid() and enabled;
    if value is null or (p_admin and value<>'admin') then raise exception 'FORBIDDEN'; end if; return value; end $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function public.assert_assessment_review_access(boolean) to authenticated,service_role;`;
const baseSql = await readFile(new URL('../supabase/migrations/20260927120000_scoring_formulas.sql', import.meta.url), 'utf8');
const hardeningSql = await readFile(new URL('../supabase/migrations/20260928075225_scoring_formula_production_hardening.sql', import.meta.url), 'utf8');
const publicationSql = await readFile(new URL('../supabase/migrations/20260928235028_scoring_formula_publication_control.sql', import.meta.url), 'utf8');
const actorDisplaySql = await readFile(new URL('../supabase/migrations/20260929002849_scoring_formula_actor_display_priority.sql', import.meta.url), 'utf8');
const cloneScopeSql = await readFile(new URL('../supabase/migrations/20260929003416_scoring_formula_clone_source_scope.sql', import.meta.url), 'utf8');
const schemaSignature = async database => ({
  columns: (await database.query(`select table_name,column_name,data_type,is_nullable,column_default
    from information_schema.columns where table_schema='public' and table_name like 'scoring_%'
    order by table_name,ordinal_position`)).rows,
  functions: (await database.query(`select p.proname,pg_get_function_identity_arguments(p.oid) arguments,
      pg_get_function_result(p.oid) result,p.provolatile,pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%scoring%'
    order by p.proname,arguments`)).rows,
  triggers: (await database.query(`select c.relname table_name,t.tgname,pg_get_triggerdef(t.oid) definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and c.relname like 'scoring_%'
    order by c.relname,t.tgname`)).rows,
  constraints: (await database.query(`select c.relname table_name,k.conname,pg_get_constraintdef(k.oid) definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'scoring_%' order by c.relname,k.conname`)).rows,
  indexes: (await database.query(`select tablename,indexname,indexdef from pg_indexes
    where schemaname='public' and tablename like 'scoring_%' order by tablename,indexname`)).rows,
  policies: (await database.query(`select tablename,policyname,roles,cmd,qual,with_check from pg_policies
    where schemaname='public' and tablename like 'scoring_%' order by tablename,policyname`)).rows,
});
try {
  await db.exec(setupSql); await db.exec(baseSql); await db.exec(hardeningSql); await db.exec(publicationSql); await db.exec(actorDisplaySql); await db.exec(cloneScopeSql);
  await upgradeDb.exec(setupSql); await upgradeDb.exec(baseSql);
  await upgradeDb.exec(`set role service_role; insert into public.scoring_formulas(
    slug,version,name,description,target,scope_key,status,published_to_users,legal_basis
  ) values('upgrade-fixture','1.0.0','Upgrade fixture','','generalPrivate','upgrade-fixture','DRAFT',false,'fixture'); reset role;`);
  await upgradeDb.exec(hardeningSql); await upgradeDb.exec(publicationSql); await upgradeDb.exec(actorDisplaySql); await upgradeDb.exec(cloneScopeSql);
  assert.deepEqual(await schemaSignature(upgradeDb), await schemaSignature(db)); checks += 1;
  ok(Number((await upgradeDb.query("select count(*) count from public.scoring_formulas where slug='upgrade-fixture'")).rows[0].count) === 1,
    'old-schema upgrade preserves existing scoring data');
  const seed = buildScoringSeedPackage(scoringFormula('general-private-standard'));
  await db.exec('set role service_role');
  const dry = (await db.query('select public.seed_scoring_formula_package($1,true) result', [seed])).rows[0].result;
  ok(dry.status === 'WOULD_INSERT', 'seed dry-run reports insert without writing');
  ok(Number((await db.query('select count(*) count from public.scoring_formulas')).rows[0].count) === 0, 'dry-run writes nothing');
  const inserted = (await db.query('select public.seed_scoring_formula_package($1,false) result', [seed])).rows[0].result;
  const formulaId = inserted.formulaId;
  ok(inserted.status === 'INSERTED', 'seed inserts once');
  ok((await db.query('select public.seed_scoring_formula_package($1,false) result', [seed])).rows[0].result.status === 'NO_CHANGE', 'seed is idempotent');
  ok((await db.query('select status from public.scoring_formulas where id=$1', [formulaId])).rows[0].status === 'IN_REVIEW', 'seed stays IN_REVIEW');
  await rejects(() => db.query('update public.scoring_formula_test_cases set inputs=$2 where formula_id=$1 and case_key=$3', [formulaId,
    { noHomeMonths: 180, dependentCount: 6, subscriptionMonths: 180 }, 'case-max']), /TEST_INPUT_KEYS_MISMATCH/,
  'test-case input contract rejects fact-name keys before persistence');
  await db.query('update public.scoring_formula_test_cases set expected_total=999 where formula_id=$1 and case_key=$2', [formulaId, 'case-max']);
  await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await rejects(() => db.query("select public.activate_scoring_formula($1,0,false,'broken test')", [formulaId]), /SCORING_TEST_CASE_FAILED/, 'failed test case rolls activation back');
  ok((await db.query('select public.get_scoring_formula_detail($1) detail', [formulaId])).rows[0].detail.status === 'IN_REVIEW', 'failed activation changes no status');
  await db.exec('reset role; set role service_role'); await db.query('update public.scoring_formula_test_cases set expected_total=84 where formula_id=$1 and case_key=$2', [formulaId, 'case-max']);
  await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [reviewer]);
  const reviewerAccess = (await db.query('select public.get_scoring_formula_access() access')).rows[0].access;
  ok(reviewerAccess.role === 'reviewer' && reviewerAccess.canReview && !reviewerAccess.canMutate && !reviewerAccess.canActivate, 'reviewer capabilities are explicit');
  ok((await db.query('select jsonb_array_length(public.list_scoring_formulas()) count')).rows[0].count === 1, 'reviewer can read');
  const review = (await db.query('select public.review_scoring_formula($1) review', [formulaId])).rows[0].review;
  ok(review.validation.length === 0 && review.testCases.every(item => item.passed), 'reviewer can run canonical validation and test cases');
  await rejects(() => db.query("select public.activate_scoring_formula($1,0,false,'reviewer activation')", [formulaId]), /FORBIDDEN/, 'reviewer cannot activate');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  const adminAccess = (await db.query('select public.get_scoring_formula_access() access')).rows[0].access;
  ok(adminAccess.role === 'admin' && adminAccess.canMutate && adminAccess.canActivate, 'admin capabilities enable mutation and activation controls');
  const active = (await db.query("select public.activate_scoring_formula($1,0,true,'admin activation') result", [formulaId])).rows[0].result;
  ok(active.status === 'ACTIVE' && active.publishedToUsers === true, 'activation validates and publishes transactionally');
  ok(active.actors.updated.userId === admin && active.actors.activated.email === 'admin@example.test', 'detail exposes actor identity to review members');
  const activationAudit = (await db.query('select public.get_scoring_formula_audit($1) audit', [formulaId])).rows[0].audit;
  ok(activationAudit.at(-1).actor.email === 'admin@example.test' && activationAudit.at(-1).actor.displayLabel === '관리자', 'review audit prefers the profile display name and exposes it only through the protected RPC');
  const hidden = (await db.query("select public.set_scoring_formula_publication($1,false,$2,'hide from users') result", [formulaId, active.revision])).rows[0].result;
  ok(hidden.status === 'ACTIVE' && hidden.publishedToUsers === false && hidden.revision === active.revision + 1, 'admin can hide an ACTIVE formula without changing score content');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [reviewer]);
  await rejects(() => db.query("select public.set_scoring_formula_publication($1,true,$2,'reviewer publish')", [formulaId, hidden.revision]), /FORBIDDEN/, 'reviewer cannot change publication');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  const republished = (await db.query("select public.set_scoring_formula_publication($1,true,$2,'publish to users') result", [formulaId, hidden.revision])).rows[0].result;
  ok(republished.publishedToUsers === true && republished.revision === hidden.revision + 1, 'admin can republish through the audited revision guard');
  await rejects(() => db.query("select public.set_scoring_formula_publication($1,false,$2,'stale publication')", [formulaId, hidden.revision]), /SCORING_STALE_REVISION/, 'publication rejects stale revision');
  await rejects(() => db.query("select public.mutate_scoring_formula_draft($1,$2,'UPDATE_METADATA',$3,'edit active')", [formulaId, republished.revision, { name: 'blocked' }]), /SCORING_VERSION_PUBLISHED/, 'ACTIVE mutation returns the immutable publication contract code');
  ok(active.components.length === 3, '84-point formula has three items');
  const max = active.components.reduce((sum, item) => sum + item.declaredMaxScore, 0);
  ok(max === 84, 'declared maxima total 84');
  const result = (await db.query("select public.evaluate_active_scoring_formula('generalPrivate',$1) result", [{ noHomeMonths: 180, dependentCount: 6, subscriptionMonths: 180 }])).rows[0].result;
  ok(result.total === 84, 'DB evaluator returns 84');
  const incomplete = (await db.query("select public.evaluate_active_scoring_formula('generalPrivate',$1) result", [{ noHomeMonths: null, dependentCount: 6, subscriptionMonths: 180 }])).rows[0].result;
  ok(incomplete.total === null && incomplete.problems.length === 1, 'unknown input is incomplete, never zero');
  await rejects(() => db.query("select public.evaluate_active_scoring_formula('generalPrivate',$1)", [{ noHomeMonths: '180', dependentCount: 6, subscriptionMonths: 180 }]), /SCORING_INPUT_INVALID/, 'canonical fact input rejects numeric strings');
  await db.exec('reset role; set role anon');
  await rejects(() => db.query('select count(*) from public.scoring_formulas'), /permission denied/i, 'anon cannot read formula rows containing actor metadata');
  await rejects(() => db.query('select count(*) from public.scoring_formula_items'), /permission denied/i, 'anon consumes sanitized active snapshots instead of raw item tables');
  await rejects(() => db.query('select count(*) from public.scoring_formula_test_cases'), /permission denied/i, 'anon cannot read scoring test cases');
  const publicFormula = (await db.query("select public.get_active_scoring_formula('generalPrivate') result")).rows[0].result;
  ok(publicFormula.testCases.length === 0 && publicFormula.history.length === 0 && publicFormula.actors === undefined && publicFormula.hasDraft === undefined, 'public active formula omits review metadata');
  await db.exec('reset role; set role service_role');
  await rejects(() => db.query("update public.scoring_formula_items set label='changed' where formula_id=$1", [formulaId]), /SCORING_VERSION_PUBLISHED/, 'ACTIVE children return the published-version contract code');
  await rejects(() => db.query("update public.scoring_formula_audit_logs set reason='changed' where formula_id=$1", [formulaId]), /SCORING_AUDIT_APPEND_ONLY/, 'audit is append-only even for privileged writes');
  await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await rejects(() => db.query("select public.retire_scoring_formula($1,99,'stale')", [formulaId]), /SCORING_STALE_REVISION/, 'stale revision rejected');
  const cloned = (await db.query("select public.clone_scoring_formula_version($1,'1.0.1','new version') result", [formulaId])).rows[0].result;
  ok(cloned.status === 'DRAFT' && cloned.components.length === 3, 'ACTIVE version clones to independent DRAFT');
  await rejects(() => db.query("select public.clone_scoring_formula_version($1,'1.0.1','duplicate version')", [formulaId]), /SCORING_VERSION_CONFLICT/, 'duplicate version returns a stable domain conflict');
  const originalWithDraft = (await db.query('select public.get_scoring_formula_detail($1) detail', [formulaId])).rows[0].detail;
  ok(originalWithDraft.hasDraft && originalWithDraft.draftVersion.id === cloned.id, 'list/detail exposes the sibling draft version');
  ok(cloned.actors.created.userId === admin && cloned.actors.created.role === 'admin', 'draft exposes its creating actor');
  await rejects(() => db.query("select public.activate_scoring_formula($1,0,false,'skip review')", [cloned.id]), /SCORING_STATUS_INVALID/, 'DRAFT cannot bypass review');
  const inReview = (await db.query("select public.request_scoring_formula_review($1,0,'ready for review') result", [cloned.id])).rows[0].result;
  await rejects(() => db.query("select public.mutate_scoring_formula_draft($1,$2,'UPDATE_METADATA',$3,'edit during review')", [cloned.id, inReview.revision, { name: 'blocked review edit' }]), /SCORING_STATUS_INVALID/, 'IN_REVIEW content is frozen until returned to DRAFT');
  const returned = (await db.query("select public.return_scoring_formula_to_draft($1,$2,'changes requested') result", [cloned.id, inReview.revision])).rows[0].result;
  ok(returned.status === 'DRAFT', 'IN_REVIEW can return to DRAFT without mutating a published version');
  const reviewedAgain = (await db.query("select public.request_scoring_formula_review($1,$2,'reviewed again') result", [cloned.id, returned.revision])).rows[0].result;
  const replacement = (await db.query("select public.activate_scoring_formula($1,$2,false,'replace active version') result", [cloned.id, reviewedAgain.revision])).rows[0].result;
  ok(replacement.status === 'ACTIVE', 'replacement version activates');
  await db.exec('reset role; set role service_role');
  ok(Number((await db.query("select count(*) count from public.scoring_formulas where scope_key='generalPrivate' and status='ACTIVE'")).rows[0].count) === 1, 'partial unique scope keeps exactly one ACTIVE');
  await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  ok((await db.query('select public.get_scoring_formula_detail($1) detail', [formulaId])).rows[0].detail.status === 'RETIRED', 'prior ACTIVE retires in the same transaction');
  const secondClone = (await db.query("select public.clone_scoring_formula_version($1,'1.0.2','clone with sibling versions') result", [cloned.id])).rows[0].result;
  ok(secondClone.components.length === 3 && secondClone.components.every(item => item.bands.length > 0), 'clone copies bands only from the selected source when sibling versions exist');
  const retired = (await db.query("select public.retire_scoring_formula($1,$2,'retire after test') result", [cloned.id, replacement.revision])).rows[0].result;
  ok(retired.status === 'RETIRED' && !retired.publishedToUsers, 'retire preserves immutable history and unpublishes');
  await db.exec('reset role; set role anon');
  ok((await db.query("select public.get_active_scoring_formula('generalPrivate') result")).rows[0].result === null, 'anon sees no retired formula through the sanitized public RPC');
  await rejects(() => db.query('select public.list_scoring_formulas()'), /permission denied|AUTH_REQUIRED/i, 'anon cannot call admin RPC');
  await db.exec('reset role');
  console.log(`Scoring formula SQL/RLS: ${checks} checks passed (isolated PGlite; no remote connection)`);
} finally { await db.close(); await upgradeDb.close(); }
