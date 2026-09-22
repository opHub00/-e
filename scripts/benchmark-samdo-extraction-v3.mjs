// Provider benchmark only. This process deliberately never imports or reads the human oracle.
import { createHash } from 'node:crypto';
import { access,mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { LocalIngestionStore } from '../features/announcementIngestion/server/localStore.ts';
import { validateCandidatePackage } from '../features/ruleExtraction/server/candidate.ts';
import { GeminiStructuredProvider,providerConfig } from '../features/ruleExtraction/server/geminiProvider.ts';
import { validateParsedDocument } from '../features/ruleExtraction/server/parsedDocument.ts';
import { scanReviewNotes } from '../features/ruleExtraction/server/v3/conflicts.ts';
import { extractFacts } from '../features/ruleExtraction/server/v3/facts.ts';
import { buildCallPlan } from '../features/ruleExtraction/server/v3/plans.ts';
import { runV3BindingBenchmark } from '../features/ruleExtraction/server/v3/runner.ts';
import { SAMDO_LITERAL_EXPECTATIONS } from '../features/ruleExtraction/server/fixtures/samdoLiteralExpectations.ts';

const ID='990b2823e0ddc98fe7222815b6c844131bda6e9c1deac50c6de253eb0dbe524f';
const SHA='bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763';
const RUN='samdo-ai-v3-plan-a16';
const store=new LocalIngestionStore('.ingestion'),state=await store.load(),manifest=state.entries[ID]?.manifest;
if(!manifest)throw new Error('SAMDO_MANIFEST_REQUIRED');
const root=store.path(`announcements/${ID}`),dir=resolve(root,'extraction',RUN),complete=resolve(dir,'benchmark-complete.json');
try{await access(complete);throw new Error('BENCHMARK_ALREADY_COMPLETE');}catch(error){if(error instanceof Error&&error.message==='BENCHMARK_ALREADY_COMPLETE')throw error;}
const document=JSON.parse(await readFile(resolve(root,'parsed',SHA,'document-parser-v1','document.json'),'utf8'));
validateParsedDocument(document);if(document.sha256!==SHA)throw new Error('SAMDO_DOCUMENT_HASH_MISMATCH');
const facts=extractFacts(document),plan=buildCallPlan(document,facts,'PLAN_A_16');
if(plan.rows.length!==16||plan.rows.some(row=>row.status!=='READY'))throw new Error('PLAN_A_16_NOT_READY');
await mkdir(dir,{recursive:true});
const write=async(name,value)=>writeFile(resolve(dir,name),JSON.stringify(value,null,2));
await write('samdo-v3-plan.json',{schemaVersion:1,mode:'PLAN_A_16',oracleInput:false,providerCallsAtPlanTime:0,document:{documentId:document.documentId,blocks:document.blocks.length,tables:document.tables.length},factCount:facts.length,tasks:plan.rows});

const configured=providerConfig(process.env);
if(configured.model!=='gemini-2.5-flash')throw new Error('V3_BENCHMARK_MODEL_MUST_BE_GEMINI_2_5_FLASH');
// The runner owns the two global retries. Provider-internal retry is disabled so total HTTP attempts cannot exceed 18.
const config={...configured,maxCalls:18,maxRetryCalls:0,maxEstimatedUsd:Math.min(configured.maxEstimatedUsd,1),maxOutputTokens:Math.min(configured.maxOutputTokens,2048),thinkingBudget:Math.min(configured.thinkingBudget,1024)};
const persistUsage=async usage=>write('samdo-v3-provider-usage.json',{model:config.model,pricing:{input:config.inputUsdPerMillion,outputIncludingThinking:config.outputUsdPerMillion,unit:'USD per million tokens'},hardCaps:{semanticTasks:16,retries:2,networkCalls:18,estimatedUsd:1},calls:usage});
const provider=new GeminiStructuredProvider(config,fetch,persistUsage);
const result=await runV3BindingBenchmark(document,facts,provider,{plan:'PLAN_A_16',retryBudget:2,rateLimitBackoffMs:5000,literalExpectations:SAMDO_LITERAL_EXPECTATIONS});
if(provider.usage.length>18)throw new Error('NETWORK_CALL_CAP_EXCEEDED');
const estimated=provider.usage.reduce((sum,row)=>sum+(row.estimatedUsd??0),0);if(estimated>1)throw new Error('COST_CAP_EXCEEDED');

const announcement={canonicalId:manifest.canonicalId,title:manifest.announcement.title,announcementDate:manifest.announcement.announcementDate};
const base={schemaVersion:1,promptVersion:'assessment-rule-extraction-v3',sourceStatus:'REFERENCE',reviewStatus:'REVIEW_REQUIRED',announcement,document:{documentId:document.documentId,sha256:document.sha256,parserVersion:document.parserVersion},unresolvedItems:[],conflicts:[],extractionWarnings:result.warnings};
const accepted=[],rejected=[];
for(const rule of result.rules){const candidate={...base,candidateRules:[rule]};try{validateCandidatePackage(candidate,document,announcement);accepted.push(rule);}catch(error){rejected.push({candidateRuleId:rule.candidateRuleId,reason:error instanceof Error?error.message:'VALIDATION_FAILED'});}}
const hash=text=>createHash('sha256').update(text).digest('hex');
const sanitizedRules=accepted.map(rule=>({...rule,evidence:rule.evidence.map(({snippet,...evidence})=>({...evidence,snippetSha256:hash(snippet)}))}));
await write('samdo-v3-bindings.json',{schemaVersion:1,promptVersion:'assessment-rule-extraction-v3',oracleRead:false,responses:result.responses});
await write('samdo-v3-rules.json',{schemaVersion:1,sourceStatus:'REFERENCE',reviewStatus:'REVIEW_REQUIRED',rules:sanitizedRules});
await write('samdo-v3-validation.json',{schemaVersion:1,runs:result.runs,acceptedRuleIds:accepted.map(rule=>rule.candidateRuleId),rejectedRules:rejected,warnings:result.warnings,reviewNotes:scanReviewNotes(document).map(note=>({semanticConcept:note.semanticConcept,sourceA:note.sourceA,sourceB:note.sourceB,requiresReview:note.requiresReview})),retryBudgetRemaining:result.retryBudgetRemaining,oracleRead:false,automaticImport:false,remoteWrites:false});
await persistUsage(provider.usage);
const totals={calls:provider.usage.length,retries:provider.usage.filter(row=>row.attempt>0).length,successful:provider.usage.filter(row=>row.status==='OK').length,failed:provider.usage.filter(row=>row.status!=='OK').length,inputTokens:provider.usage.reduce((n,row)=>n+(row.inputTokens??0),0),outputTokens:provider.usage.reduce((n,row)=>n+(row.outputTokens??0),0),thinkingTokens:provider.usage.reduce((n,row)=>n+(row.thinkingTokens??0),0),totalTokens:provider.usage.reduce((n,row)=>n+(row.totalTokens??0),0),estimatedUsd:estimated};
await write('benchmark-complete.json',{completedAt:new Date().toISOString(),plan:'PLAN_A_16',model:config.model,totals,bindings:result.responses.reduce((n,item)=>n+item.response.bindings.length,0),generatedRules:result.rules.length,acceptedRules:accepted.length,rejectedRules:rejected.length,oracleRead:false,automaticImport:false,remoteWrites:false});
console.log(JSON.stringify({run:RUN,model:config.model,plan:plan.rows,totals,runs:result.runs,bindings:result.responses.reduce((n,item)=>n+item.response.bindings.length,0),generatedRules:result.rules.length,acceptedRules:accepted.length,rejectedRules:rejected.length,artifactDir:dir,oracleRead:false,automaticImport:false,remoteWrites:false},null,2));
