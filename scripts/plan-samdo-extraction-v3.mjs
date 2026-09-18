import { readFile,readdir,writeFile,mkdir } from 'node:fs/promises';
import { join,resolve,dirname } from 'node:path';
import { validateParsedDocument } from '../features/ruleExtraction/server/parsedDocument.ts';
import { extractFacts } from '../features/ruleExtraction/server/v3/facts.ts';
import { buildCallPlan } from '../features/ruleExtraction/server/v3/plans.ts';
import { assertGeminiSafeSchema,GEMINI_SAFE_BINDING_SCHEMA,V3_PROMPT_VERSION } from '../features/ruleExtraction/server/v3/contract.ts';

async function files(root,name,out=[]){for(const entry of await readdir(root,{withFileTypes:true}).catch(()=>[])){const path=join(root,entry.name);if(entry.isDirectory())await files(path,name,out);else if(entry.name===name)out.push(path);}return out;}
const args=process.argv.slice(2),value=(flag)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;};
const explicit=value('--document'),candidates=explicit?[resolve(explicit)]:(await files(resolve('.ingestion'),'document.json')).filter(path=>path.includes('document-parser-v1'));
let documentPath=explicit?candidates[0]:null,document=null;
for(const path of candidates){const parsed=JSON.parse(await readFile(path,'utf8'));if(parsed.mimeType==='application/x-hwp'&&parsed.blocks?.length===4115){documentPath=path;document=parsed;break;}}
if(!documentPath)throw new Error('SAMDO_PARSED_DOCUMENT_NOT_FOUND');if(!document)document=JSON.parse(await readFile(documentPath,'utf8'));
validateParsedDocument(document);assertGeminiSafeSchema(GEMINI_SAFE_BINDING_SCHEMA);
const facts=extractFacts(document),a=buildCallPlan(document,facts,'PLAN_A_16'),b=buildCallPlan(document,facts,'PLAN_B_24');
const artifact={schemaVersion:1,promptVersion:V3_PROMPT_VERSION,mode:'PLAN_ONLY',providerCalls:0,document:{documentId:document.documentId,blocks:document.blocks.length,tables:document.tables.length},factCount:facts.length,factTypes:Object.fromEntries([...new Set(facts.map(f=>f.type))].sort().map(type=>[type,facts.filter(f=>f.type===type).length])),plans:{PLAN_A_16:a.rows,PLAN_B_24:b.rows}};
const out=value('--out');if(out){await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(resolve(out),JSON.stringify(artifact,null,2));}
console.log(JSON.stringify({...artifact,documentPath,out:out?resolve(out):null},null,2));
