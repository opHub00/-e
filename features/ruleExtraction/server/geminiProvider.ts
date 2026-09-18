// Server/CLI only. Reuses the existing Gemini REST provider without the app's explanation endpoint.
export type Usage = { label: string; model: string; attempt: number; latencyMs: number; status: string;
  inputTokens: number|null; outputTokens: number|null; thinkingTokens: number|null; totalTokens: number|null; estimatedUsd: number|null };
export interface StructuredProvider { generate(label: string, system: string, input: unknown, schema: unknown): Promise<unknown>; }
export type ProviderConfig = { model: string; apiKey: string; maxCalls: number; maxOutputTokens: number; thinkingBudget: number; timeoutMs: number;
  inputUsdPerMillion: number; outputUsdPerMillion: number; maxEstimatedUsd: number; maxRetryCalls:number; transientCircuitThreshold:number };
export function providerConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  if (!env.GEMINI_API_KEY || !env.ASSESSMENT_EXTRACTION_MODEL) throw new Error('AI_CONFIGURATION_REQUIRED');
  if(env.ASSESSMENT_EXTRACTION_MODEL!=='gemini-2.5-pro'&&(!env.ASSESSMENT_EXTRACTION_INPUT_PRICE||!env.ASSESSMENT_EXTRACTION_OUTPUT_PRICE))throw new Error('MODEL_PRICING_REQUIRED');
  const number = (key: string, fallback: number, min: number, max: number) => { const v=Number(env[key]??fallback);if(!Number.isFinite(v)||v<min||v>max)throw new Error('INVALID_AI_BUDGET');return v; };
  const config={ model:env.ASSESSMENT_EXTRACTION_MODEL,apiKey:env.GEMINI_API_KEY,
    maxCalls:number('ASSESSMENT_EXTRACTION_MAX_CALLS',16,1,24),maxOutputTokens:number('ASSESSMENT_EXTRACTION_MAX_OUTPUT',16000,1000,24000),
    thinkingBudget:number('ASSESSMENT_EXTRACTION_THINKING',2048,128,8192),timeoutMs:180000,
    inputUsdPerMillion:number('ASSESSMENT_EXTRACTION_INPUT_PRICE',1.25,0,100),outputUsdPerMillion:number('ASSESSMENT_EXTRACTION_OUTPUT_PRICE',10,0,100),maxEstimatedUsd:number('ASSESSMENT_EXTRACTION_MAX_USD',4,0.01,10),
    maxRetryCalls:number('ASSESSMENT_EXTRACTION_MAX_RETRIES',2,0,3),transientCircuitThreshold:number('ASSESSMENT_EXTRACTION_CIRCUIT_THRESHOLD',3,1,3) };
  if(![config.maxCalls,config.maxOutputTokens,config.thinkingBudget,config.maxRetryCalls,config.transientCircuitThreshold].every(Number.isSafeInteger))throw new Error('INTEGER_BUDGET_REQUIRED');return config;
}
export function mapUsage(raw: any, config: ProviderConfig) {
  const count=(v: unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):null;
  const inputTokens=count(raw?.promptTokenCount), outputTokens=count(raw?.candidatesTokenCount),thinkingTokens=count(raw?.thoughtsTokenCount??0),totalTokens=count(raw?.totalTokenCount);
  return {inputTokens,outputTokens,thinkingTokens,totalTokens,estimatedUsd:inputTokens===null||outputTokens===null||thinkingTokens===null?null:(inputTokens*config.inputUsdPerMillion+(outputTokens+thinkingTokens)*config.outputUsdPerMillion)/1e6};
}
export class GeminiStructuredProvider implements StructuredProvider {
  readonly config: ProviderConfig; readonly usage: Usage[]=[]; private reservedUsd=0;private retryCalls=0;private consecutiveTransientErrors=0;private circuitOpen=false;
  private request: typeof fetch; private persist: (usage: Usage[])=>Promise<void>;
  constructor(config:ProviderConfig, request:typeof fetch=fetch,persist: (usage:Usage[])=>Promise<void>=async()=>{}) {
    if(!/^[a-z0-9.-]+$/.test(config.model))throw new Error('INVALID_MODEL');this.config=config;this.request=request;this.persist=persist;
  }
  async generate(label:string,system:string,input:unknown,schema:unknown):Promise<unknown> {
    if(this.circuitOpen)throw new Error('PROVIDER_CIRCUIT_OPEN');
    const c=this.config, text=JSON.stringify(input);
    const body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text}]}],generationConfig:{temperature:0,maxOutputTokens:c.maxOutputTokens,thinkingConfig:{thinkingBudget:c.thinkingBudget},responseMimeType:'application/json',responseJsonSchema:schema}};
    const serialized=JSON.stringify(body);
    if(Buffer.byteLength(serialized)>160000)throw new Error('CONTEXT_BUDGET_EXCEEDED');
    // Byte upper bound reserves even failed/unknown-billing attempts, avoiding budget resets on retries.
    const reserve=(Buffer.byteLength(serialized)*c.inputUsdPerMillion+c.maxOutputTokens*c.outputUsdPerMillion)/1e6;
    for(let attempt=0;attempt<2;attempt++){
      if(this.usage.length>=c.maxCalls||this.reservedUsd+reserve>c.maxEstimatedUsd)throw new Error('AI_BUDGET_EXHAUSTED');
      this.reservedUsd+=reserve;
      const started=Date.now(), row:Usage={label,model:c.model,attempt,latencyMs:0,status:'STARTED',inputTokens:null,outputTokens:null,thinkingTokens:null,totalTokens:null,estimatedUsd:null};
      this.usage.push(row);await this.persist(this.usage);
      try {
        const res=await this.request(`https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':c.apiKey},body:serialized,signal:AbortSignal.timeout(c.timeoutMs)});
        if(!res.ok){row.status=`HTTP_${res.status}`;if(res.status===429){throw new Error(row.status);}if(res.status===503){this.consecutiveTransientErrors++;if(this.consecutiveTransientErrors>=c.transientCircuitThreshold)this.circuitOpen=true;if(attempt===0&&!this.circuitOpen&&this.retryCalls<c.maxRetryCalls){this.retryCalls++;await new Promise(r=>setTimeout(r,1000));continue;}}throw new Error(row.status);}
        const data:any=await res.json();Object.assign(row,mapUsage(data.usageMetadata,c));
        const candidate=data.candidates?.[0];if(candidate?.finishReason!=='STOP'){row.status='INCOMPLETE_OUTPUT';throw new Error(row.status);}
        const answer=candidate.content?.parts?.filter((p:any)=>!p.thought).map((p:any)=>p.text??'').join('');
        try{const parsed=JSON.parse(answer);row.status='OK';this.consecutiveTransientErrors=0;return parsed;}catch{row.status='INVALID_JSON';throw new Error(row.status);}
      }catch(error){if(row.status==='STARTED')row.status='NETWORK_OR_TIMEOUT';throw new Error(row.status);}
      finally{row.latencyMs=Date.now()-started;await this.persist(this.usage);}
    }
    throw new Error('RETRY_EXHAUSTED');
  }
}
