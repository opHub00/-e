// Provider calls only. This process must never import or read the human oracle.
import { access,mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GeminiStructuredProvider } from '../features/ruleExtraction/server/geminiProvider.ts';
import { createStructuredBenchmarkProvider,verifyFrozenBenchmarkPack } from '../features/ruleExtraction/server/v4_1/benchmarkPack.ts';

const EXPECTED_HASH='90936b302840fc046a4fe70f5b3845eb8121b365066f5845482adeff5b9c889b';
const ROOT='.ingestion/announcements/990b2823e0ddc98fe7222815b6c844131bda6e9c1deac50c6de253eb0dbe524f';
const sourceDir=resolve(ROOT,'extraction','samdo-v4-1-offline'),outDir=resolve(ROOT,'extraction','model-comparison-small'),complete=resolve(outDir,'providers-complete.json');
try{await access(complete);throw new Error('SMALL_COMPARISON_ALREADY_COMPLETE');}catch(error){if(error instanceof Error&&error.message==='SMALL_COMPARISON_ALREADY_COMPLETE')throw error;}
if(!process.env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY_REQUIRED');
const pack=JSON.parse(await readFile(resolve(sourceDir,'samdo-v4-1-frozen-pack.json'),'utf8'));
if(pack.hash!==EXPECTED_HASH||!verifyFrozenBenchmarkPack(pack))throw new Error('FROZEN_PACK_HASH_MISMATCH');
const taskIds=pack.profiles.SMALL;if(taskIds.length!==6)throw new Error('SMALL_PROFILE_CHANGED');
const tasks=taskIds.map(id=>pack.tasks.find(task=>task.taskId===id));if(tasks.some(task=>!task))throw new Error('SMALL_TASK_MISSING');
await mkdir(outDir,{recursive:true});
const write=(name,value)=>writeFile(resolve(outDir,name),`${JSON.stringify(value,null,2)}\n`);
await write('frozen-pack-metadata.json',{schemaVersion:1,hash:pack.hash,verified:true,packVersion:pack.packVersion,taskIds,taskCount:taskIds.length,oracleIncluded:false,retrievalRegenerated:false});

const models=[
  {key:'provider-a',id:'google-gemini',model:'gemini-2.5-flash',inputPrice:0.30,outputPrice:2.50},
  {key:'provider-b',id:'google-gemini',model:'gemini-3.1-pro-preview',inputPrice:2.00,outputPrice:12.00},
];
let totalCalls=0,totalCost=0;
async function execute(spec){
  const usage=[];
  const config={model:spec.model,apiKey:process.env.GEMINI_API_KEY,maxCalls:7,maxOutputTokens:2048,thinkingBudget:1024,timeoutMs:180000,inputUsdPerMillion:spec.inputPrice,outputUsdPerMillion:spec.outputPrice,maxEstimatedUsd:Math.max(.01,2-totalCost),maxRetryCalls:1,transientCircuitThreshold:3};
  const rawProvider=new GeminiStructuredProvider(config,fetch,async rows=>{usage.splice(0,usage.length,...structuredClone(rows));await write(`${spec.key}-usage.json`,{model:spec.model,pricing:{inputUsdPerMillion:spec.inputPrice,outputIncludingThinkingUsdPerMillion:spec.outputPrice},calls:usage});});
  const provider=createStructuredBenchmarkProvider(spec.id,spec.model,rawProvider),results=[];let incompatible=false;
  for(let index=0;index<tasks.length;index++){
    const task=tasks[index];
    if(incompatible){results.push({taskId:task.taskId,status:'PROVIDER_NOT_RUN',response:null,error:'COMPATIBILITY_PROBE_FAILED'});continue;}
    try{results.push({taskId:task.taskId,status:'SUCCESS',response:await provider.bind(structuredClone(task)),error:null});}
    catch(error){const code=error instanceof Error?error.message:'PROVIDER_ERROR';results.push({taskId:task.taskId,status:'FAILED',response:null,error:code});if(index===0&&/HTTP_(?:400|401|403)|INVALID_JSON/u.test(code))incompatible=true;}
    totalCalls=models.slice(0,models.indexOf(spec)).reduce((sum,item)=>sum+(item.calls??0),0)+usage.length;
    if(totalCalls>14)throw new Error('NETWORK_CALL_CAP_EXCEEDED');
  }
  const estimatedUsd=usage.reduce((sum,row)=>sum+(row.estimatedUsd??0),0);totalCost+=estimatedUsd;if(totalCost>2)throw new Error('COST_CAP_EXCEEDED');spec.calls=usage.length;
  const artifact={schemaVersion:1,packHash:pack.hash,provider:{id:spec.id,model:spec.model},profile:'SMALL',compatibility:incompatible?'INCOMPATIBLE':results[0]?.status==='SUCCESS'?'COMPATIBLE':'UNCONFIRMED',results,usageSummary:{calls:usage.length,retries:usage.filter(row=>row.attempt>0).length,errors:Object.fromEntries([...new Set(usage.filter(row=>row.status!=='OK').map(row=>row.status))].map(status=>[status,usage.filter(row=>row.status===status).length])),inputTokens:usage.reduce((sum,row)=>sum+(row.inputTokens??0),0),outputTokens:usage.reduce((sum,row)=>sum+(row.outputTokens??0),0),thinkingTokens:usage.reduce((sum,row)=>sum+(row.thinkingTokens??0),0),totalTokens:usage.reduce((sum,row)=>sum+(row.totalTokens??0),0),estimatedUsd}};
  await write(`${spec.key}-results.json`,artifact);return artifact;
}
const providerA=await execute(models[0]),providerB=await execute(models[1]);
const calls=providerA.usageSummary.calls+providerB.usageSummary.calls,cost=providerA.usageSummary.estimatedUsd+providerB.usageSummary.estimatedUsd;
if(calls>14||cost>2)throw new Error('GLOBAL_BUDGET_EXCEEDED');
await write('usage.json',{hardCaps:{semanticTasksPerProvider:6,retriesPerProvider:1,totalNetworkCalls:14,totalEstimatedUsd:2},providerA:providerA.usageSummary,providerB:providerB.usageSummary,totals:{calls,estimatedUsd:cost}});
await write('providers-complete.json',{completedAt:new Date().toISOString(),packHash:pack.hash,oracleRead:false,retrievalRegenerated:false,providerA:{model:providerA.provider.model,compatibility:providerA.compatibility},providerB:{model:providerB.provider.model,compatibility:providerB.compatibility},calls,estimatedUsd:cost,remoteWrites:false});
console.log(JSON.stringify({packHash:pack.hash,tasks:taskIds,providerA:{model:providerA.provider.model,compatibility:providerA.compatibility,usage:providerA.usageSummary,statuses:providerA.results.map(row=>({taskId:row.taskId,status:row.status,error:row.error}))},providerB:{model:providerB.provider.model,compatibility:providerB.compatibility,usage:providerB.usageSummary,statuses:providerB.results.map(row=>({taskId:row.taskId,status:row.status,error:row.error}))},totals:{calls,estimatedUsd:cost},oracleRead:false,remoteWrites:false},null,2));
