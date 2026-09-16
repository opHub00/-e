// Actual HWP-derived package on isolated PostgreSQL. Optional loopback HTTP read bridge.
// This bridge is NOT Supabase/PostgREST and exposes no import/approval/write endpoint.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createRuleLifecycle, ruleSemantics } from '../features/applicationAssessment/server/lifecycle.ts';
import { DatabaseAssessmentRuleRepository } from '../features/applicationAssessment/data/databaseRuleRepository.ts';
import { assessApplication } from '../features/applicationAssessment/engine.ts';
import { samdoApplicant } from '../features/applicationAssessment/server/samdoProfiles.test-data.ts';
const {PGlite}=await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const p=JSON.parse(await readFile('data/assessment-rules/samdo-2026-v1.7.json','utf8'));
const file=process.env.SAMDO_HWP_PATH ?? resolve('../source',p.document.fileName);
const original=await readFile(file);
assert.equal(createHash('sha256').update(original).digest('hex'),p.document.sha256,'Exact reviewed original is required');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema public,storage to anon,authenticated,service_role;
grant all on storage.objects to service_role;`);
for(const name of ['20260915105910_assessment_rule_registry.sql','20260915112848_assessment_rule_import_lifecycle.sql']) await db.exec(await readFile(`supabase/migrations/${name}`,'utf8'));
const role=async (name,fn)=>{await db.exec(`set role ${name}`);try{return await fn();}finally{await db.exec('reset role');}};
const calls={
 import_assessment_rule_package:['select public.import_assessment_rule_package($1) as data',['p_package']],
 get_assessment_review_snapshot:['select public.get_assessment_review_snapshot($1) as data',['p_rule_set_id']],
 approve_assessment_rule_set:['select public.approve_assessment_rule_set($1,$2,$3) as data',['p_rule_set_id','p_fingerprint','p_reviewer']],
 activate_assessment_rule_set:['select public.activate_assessment_rule_set($1,$2) as data',['p_rule_set_id','p_expected_active_id']],
};
const lifecycle=createRuleLifecycle((name,args)=>role('service_role',async()=>{const [sql,keys]=calls[name];return (await db.query(sql,keys.map(k=>args[k]))).rows[0].data;}));
const read=lookup=>role('anon',async()=>(await db.query('select public.read_assessment_rule_set($1,$2) as data',[lookup.announcementId??null,lookup.listingId??null])).rows[0].data);
const catalog=after=>role('anon',async()=>(await db.query('select * from public.list_assessment_announcements($1)',[after??null])).rows);
const repo=new DatabaseAssessmentRuleRepository({read,catalog});
const lookup={announcementId:p.announcement.id};
// Actual private HWP remains on local disk. storage.objects is a metadata stand-in only.
await role('service_role',()=>db.query("insert into storage.objects(bucket_id,name) values('announcement-documents',$1)",[p.document.storagePath]));
const imported=await lifecycle.import(p);
assert.equal((await repo.getActiveRuleSet(lookup)).status,'RULE_NOT_AVAILABLE');
const review=await lifecycle.review(p.ruleSet.id);
assert.deepEqual(ruleSemantics(review.rules),ruleSemantics(imported.expectedRules));
await lifecycle.approve(p.ruleSet.id,review.fingerprint,'LOCAL HWP TRANSCRIPTION REVIEW — not official approval');
assert.equal((await repo.getActiveRuleSet(lookup)).status,'RULE_NOT_AVAILABLE');
await lifecycle.activate(p.ruleSet.id,null);
const loaded=await repo.getActiveRuleSet(lookup);assert.equal(loaded.status,'AVAILABLE');
assert.deepEqual(ruleSemantics(loaded.rules),ruleSemantics(imported.expectedRules));
const scenarios=[];
function scenario(name,type,input,status,stage,score){
 const result=assessApplication(loaded.rules,input).find(r=>r.supplyType===type);
 assert.equal(result.status,status,name);if(stage!==undefined)assert.equal(result.stage,stage,name);assert.equal(result.score?.total,score,name);
 assert.equal(result.sourceStatus,'DRAFT_SOURCE_VERIFIED');
 assert.ok(result.evidence.every(e=>e.documentId===p.document.id && e.locator.sha256===p.document.sha256));
 assert.equal(result.provenance.documentId,p.document.id);
 scenarios.push({name,input,result});
}
scenario('청년 우선','youth',samdoApplicant(),'ELIGIBLE','PRIORITY',9);
const general=samdoApplicant();general.profile.income.incomeTaxPaymentYears={status:'known',value:3};
scenario('청년 일반','youth',general,'ELIGIBLE','GENERAL',11);
const bad=samdoApplicant();bad.details.birthDate='2008-09-15';scenario('청년 자격 미달','youth',bad,'INELIGIBLE',null);
scenario('정보 부족','youth',{...samdoApplicant(),details:{}},'NEEDS_MORE_INFORMATION',null);
scenario('신혼 우선','newlywed',samdoApplicant('newlywed'),'ELIGIBLE','PRIORITY',9);
const newly=samdoApplicant('newlywed');newly.details.marriageDate='2021-09-14';newly.details.firstMarriageDate='2021-09-14';
scenario('신혼 일반','newlywed',newly,'ELIGIBLE','GENERAL',9);
for(const [income,stage] of [[9000000,'PRIORITY'],[10000000,'GENERAL'],[12000000,'LOTTERY']]){
 const first=samdoApplicant('firstHome');first.details.dualIncome=true;first.details.householdIncome=income;
 scenario(`생애최초 ${stage}`,'firstHome',first,'ELIGIBLE',stage);
}
const proof={sourceSha256:p.document.sha256,ruleSetId:p.ruleSet.id,sourceStatus:p.ruleSet.sourceStatus,ruleCount:p.rules.length,
 reviewFingerprint:review.fingerprint,roundTrip:'PASS',environment:'isolated PGlite; real HWP; Storage metadata stand-in',scenarios};
await writeFile('.cache/samdo-db-proof.json',JSON.stringify(proof,null,2));
console.log(JSON.stringify({roundTrip:'PASS',rules:p.rules.length,scenarios:scenarios.map(s=>({name:s.name,status:s.result.status,stage:s.result.stage,score:s.result.score?.total}))}));
if(!process.argv.includes('--serve')){await db.close();}else{
 // The browser runs the real app and Supabase JS transport against these two read-only RPCs.
 const webRoot=resolve('.cache/samdo-web');let queue=Promise.resolve();let reads=0;
 const server=createServer((req,res)=>{
  const handle=async()=>{
   const url=new URL(req.url,'http://127.0.0.1:9531');
   if(req.method==='POST' && url.pathname.startsWith('/rest/v1/rpc/')){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('Request too large');}
    const args=JSON.parse(body);let data;
    if(url.pathname==='/rest/v1/rpc/read_assessment_rule_set'){data=await read({announcementId:args.p_announcement_id,listingId:args.p_listing_id});reads++;}
    else if(url.pathname==='/rest/v1/rpc/list_assessment_announcements')data=await catalog(args.p_after);
    else {res.writeHead(403);res.end();return;}
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
   }
   if(req.method!=='GET'){res.writeHead(403);res.end();return;}
   if(url.pathname==='/qa/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({readCount:reads,backend:'isolated PGlite bridge; not PostgREST'}));return;}
   // Explicit test-only profile source, never part of production export/data APIs.
   if(url.pathname==='/qa/profile'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(samdoApplicant(['newlywed','firstHome'].includes(url.searchParams.get('type'))?url.searchParams.get('type'):'youth').profile));return;}
   let path=resolve(webRoot,'.'+decodeURIComponent(url.pathname));
   if(!path.startsWith(webRoot+sep) && path!==webRoot){res.writeHead(403);res.end();return;}
   if(path===webRoot)path=resolve(webRoot,'index.html');
   try{if(!(await stat(path)).isFile())throw Error();}catch{path=path+'.html';}
   const bytes=await readFile(path);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'}[extname(path)]??'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(bytes);
  };
  queue=queue.then(handle).catch(()=>{if(!res.headersSent)res.writeHead(404);res.end();});
 });
 server.listen(9531,'127.0.0.1',()=>console.log('Local QA http://127.0.0.1:9531 — no production connection, no write API'));
 process.on('SIGINT',()=>server.close(()=>{void db.close().then(()=>process.exit(0));}));
}
