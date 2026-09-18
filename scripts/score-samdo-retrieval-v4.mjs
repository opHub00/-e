import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { extractFacts } from '../features/ruleExtraction/server/v3/facts.ts';
import { buildCallPlan } from '../features/ruleExtraction/server/v3/plans.ts';
import { buildOfflineRetrievalScorecard } from '../features/ruleExtraction/server/v4/scorecard.ts';

const documentPath=resolve('.ingestion/announcements/990b2823e0ddc98fe7222815b6c844131bda6e9c1deac50c6de253eb0dbe524f/parsed/bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763/document-parser-v1/document.json');
const outputPath=resolve('.ingestion/announcements/990b2823e0ddc98fe7222815b6c844131bda6e9c1deac50c6de253eb0dbe524f/extraction/samdo-v4-retrieval-scorecard.json');
const document=JSON.parse(await readFile(documentPath,'utf8')),facts=extractFacts(document),scorecard=buildOfflineRetrievalScorecard(document,facts);
const artifact={schemaVersion:1,benchmark:'Samdo fact retrieval v4 offline',providerCalls:0,generatedAt:new Date().toISOString(),plans:{PLAN_A_16:buildCallPlan(document,facts,'PLAN_A_16').rows,PLAN_B_24:buildCallPlan(document,facts,'PLAN_B_24').rows},scorecard};
await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({providerCalls:0,rows:scorecard.rows,wrongFactCount:scorecard.wrongFactCount,missingOperatorFallback:scorecard.missingOperatorFallback,scoreTableCoverage:scorecard.scoreTableCoverage,planBSuperset:scorecard.planBSuperset,exceptionTasks:scorecard.exceptionTasks,FACT_RETRIEVAL_V4_READY:scorecard.ready?'YES':'NO'},null,2));
