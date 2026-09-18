// Deliberately imports no oracle/comparator/importer module. Evaluation runs as a separate process.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { LocalIngestionStore } from '../features/announcementIngestion/server/localStore.ts';
import { GeminiStructuredProvider,providerConfig } from '../features/ruleExtraction/server/geminiProvider.ts';
import { LLMRuleExtractor } from '../features/ruleExtraction/server/llmExtractor.ts';
const SAMDO_SHA='bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763';
try{
 const {values}=parseArgs({options:{run:{type:'string'},'dry-run':{type:'boolean'}},strict:true});
 if(!values.run||!/^[a-z0-9-]{1,60}$/.test(values.run))throw new Error('RUN_ID_REQUIRED');
 const store=new LocalIngestionStore('.ingestion'),state=await store.load();
 const manifest=Object.values(state.entries).find(e=>e.manifest.documents.some(d=>d.sha256===SAMDO_SHA))?.manifest;
 if(!manifest||manifest.announcement.source!=='MANUAL')throw new Error('SAMDO_MANIFEST_REQUIRED');
 const doc=manifest.documents.find(d=>d.sha256===SAMDO_SHA);if(!await store.cached(doc))throw new Error('SOURCE_HASH_MISMATCH');
 const parsed=JSON.parse(await readFile(store.path(`announcements/${manifest.canonicalId}/parsed/${SAMDO_SHA}/document-parser-v1/document.json`),'utf8'));
 const config=providerConfig(process.env),dir=store.path(`announcements/${manifest.canonicalId}/extraction/${values.run}`);
 if(values['dry-run']){console.log(JSON.stringify({model:config.model,maxCalls:config.maxCalls,maxOutputTokens:config.maxOutputTokens,maxEstimatedUsd:config.maxEstimatedUsd,documentSha:SAMDO_SHA,oracleInput:false,remoteWrites:false}));}
 else{
  await mkdir(dir); // Existing run cannot be overwritten or silently rerun.
  const record=async(name,value)=>{await writeFile(resolve(dir,name+'.json'),JSON.stringify(value,null,2));};
  const provider=new GeminiStructuredProvider(config,fetch,async usage=>record('samdo-token-usage-v1',{model:config.model,pricing:{input:config.inputUsdPerMillion,outputIncludingThinking:config.outputUsdPerMillion,unit:'USD per million tokens'},calls:usage}));
  const extractor=new LLMRuleExtractor(provider,record);
  await record('run-config',{model:config.model,maxCalls:config.maxCalls,maxOutputTokens:config.maxOutputTokens,thinkingBudget:config.thinkingBudget,maxEstimatedUsd:config.maxEstimatedUsd});
  try{const candidate=await extractor.extract({manifest,document:parsed});console.log(JSON.stringify({run:values.run,candidates:candidate.candidateRules.length,calls:provider.usage.length,completed:true}));}
  catch(error){await record('run-failure',{code:error instanceof Error?error.message:'UNKNOWN'});throw error;}
 }
}catch(error){console.error(error instanceof Error&&/^[A-Z_0-9]+$/.test(error.message)?error.message:'BENCHMARK_FAILED');process.exitCode=1;}
