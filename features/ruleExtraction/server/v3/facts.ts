import { createHash } from 'node:crypto';
import type { ParsedDocument, SourceLocator } from '../parsedDocument.ts';
import { OFFICIAL_REGION_NAME_PATTERN } from '../../../discovery/regions.ts';

export const FACT_TYPES = ['PERCENT','MONEY','DATE','DURATION_MONTHS','DURATION_YEARS','COUNT','SCORE','RATIO','AGE','BOOLEAN_PHRASE','RANGE'] as const;
export type FactType = typeof FACT_TYPES[number];
export type FactOperator = 'eq'|'gt'|'gte'|'lt'|'lte'|null;
export const FACT_CONTEXT_TAGS = ['YOUTH','NEWLYWED','FIRST_TIME','COMMON','INCOME','ASSET','SUBSCRIPTION','SCORE','STAGE','RESIDENCE','AGE','TAX','EXCEPTION','CHILDBIRTH_RELAXATION'] as const;
export type FactContextTag = typeof FACT_CONTEXT_TAGS[number];
export const TABLE_IDENTITIES = ['INCOME_TABLE','ASSET_TABLE','YOUTH_SCORE_TABLE','NEWLYWED_SCORE_TABLE','SUPPLY_STAGE_TABLE','SUBSCRIPTION_TABLE','UNKNOWN_TABLE'] as const;
export type TableIdentity = typeof TABLE_IDENTITIES[number];
export type ApplicantScope = 'APPLICANT'|'HOUSEHOLD'|'FUTURE_HOUSEHOLD'|'SPOUSE'|'PARENT'|'CHILD';
export type FactRange = { lowerValue:number; lowerOperator:'gt'|'gte'; upperValue:number; upperOperator:'lt'|'lte'; unit:string };
export type ExtractedFact = {
  factId: string; type: FactType; rawValue: string; normalizedValue: number|string|boolean; unit: string;
  operator: FactOperator; bindingStatus: 'BOUND'|'AMBIGUOUS_OPERATOR_BINDING'; sourceId: string;
  sourceLocator: SourceLocator; tableId: string|null; row: number|null; column: number|null; surroundingBlockIds: string[];
  characterOffset: number; contextText: string; contextTags: FactContextTag[]; applicantScopes: ApplicantScope[];
  localContextText:string; primarySupplyScope:'YOUTH'|'NEWLYWED'|'FIRST_TIME'|null; tableIdentities: TableIdentity[]; range: FactRange|null;
};

const OPERATOR: Record<string, Exclude<FactOperator,null>> = { 이상:'gte', 이하:'lte', 초과:'gt', 미만:'lt', 이내:'lte' };
const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const patterns: { type: FactType; unit: string; regex: RegExp }[] = [
  { type:'DATE', unit:'DATE', regex:/\b(?:19|20)\d{2}[-.년\s]+(?:0?[1-9]|1[0-2])[-.월\s]+(?:0?[1-9]|[12]\d|3[01])일?\b/gu },
  { type:'PERCENT', unit:'PERCENT', regex:new RegExp(`(${NUMBER})\\s*%\\s*(이상|이하|초과|미만|이내)?`,'gu') },
  { type:'MONEY', unit:'KRW', regex:new RegExp(`(${NUMBER})\\s*(백만원|만원|원)\\s*(이상|이하|초과|미만|이내)?`,'gu') },
  { type:'DURATION_MONTHS', unit:'MONTH', regex:new RegExp(`(${NUMBER})\\s*개월\\s*(이상|이하|초과|미만|이내|경과)?`,'gu') },
  { type:'DURATION_YEARS', unit:'YEAR', regex:new RegExp(`(${NUMBER})\\s*년\\s*(이상|이하|초과|미만|이내)?`,'gu') },
  { type:'COUNT', unit:'PAYMENT_COUNT', regex:new RegExp(`(${NUMBER})\\s*회\\s*(이상|이하|초과|미만|이내)?`,'gu') },
  { type:'COUNT', unit:'DAY', regex:new RegExp(`(${NUMBER})\\s*일\\s*(이상|이하|초과|미만|이내)?`,'gu') },
  { type:'COUNT', unit:'PERSON', regex:new RegExp(`(${NUMBER})\\s*명\\s*(이상|이하|초과|미만|이내)?`,'gu') },
  { type:'AGE', unit:'AGE_YEAR', regex:new RegExp(`(?:만\\s*)?(${NUMBER})\\s*세\\s*(이상|이하|초과|미만|이내)?`,'gu') },
  { type:'SCORE', unit:'POINT', regex:new RegExp(`(${NUMBER})\\s*점\\s*(이상|이하|초과|미만|이내)?`,'gu') },
];

const numeric = (raw:string) => Number(raw.replaceAll(',',''));
const money = (raw:string, unit:string) => numeric(raw) * (unit === '백만원' ? 1_000_000 : unit === '만원' ? 10_000 : 1);
const date = (raw:string) => {
  const parts = raw.match(/\d+/g) ?? [];
  return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
};
const id = (sourceId:string, type:FactType, start:number, raw:string) => `f_${createHash('sha256').update(`${sourceId}|${type}|${start}|${raw}`).digest('hex').slice(0,20)}`;
const operatorNear = (match:string, explicit:string|undefined):FactOperator => explicit ? OPERATOR[explicit] : Object.entries(OPERATOR).find(([word])=>match.trimEnd().endsWith(word))?.[1] ?? null;

type SupplyScope='YOUTH'|'NEWLYWED'|'FIRST_TIME';
type Source = { sourceId:string; text:string; contextSeed:string; primarySupplyScope:SupplyScope|null; locator:SourceLocator; tableId:string|null; row:number|null; column:number|null; blockIds:string[] };
const has=(text:string,re:RegExp)=>re.test(text);
export function classifyTableText(text:string):TableIdentity[]{
  const tags:TableIdentity[]=[];
  if(has(text,/(월평균소득|도시근로자|외벌이|맞벌이)/u))tags.push('INCOME_TABLE');
  if(has(text,/(총자산|자산 보유기준|부동산|자동차)/u))tags.push('ASSET_TABLE');
  if(has(text,/(청년.{0,30}가점|청년 특별공급.{0,60}가점|청년.*납입인정횟수)/su))tags.push('YOUTH_SCORE_TABLE');
  if(has(text,/(신혼부부.{0,30}가점|신혼부부 특별공급.{0,60}가점|무주택기간.*가점)/su))tags.push('NEWLYWED_SCORE_TABLE');
  if(has(text,/(우선공급|일반공급|추첨공급).{0,80}(30%|60%|70%|20%)/su))tags.push('SUPPLY_STAGE_TABLE');
  if(has(text,/(청약저축|주택청약종합저축|납입인정횟수|선납금)/u))tags.push('SUBSCRIPTION_TABLE');
  return tags.length?tags:['UNKNOWN_TABLE'];
}
function tagsFor(text:string,tableIdentities:TableIdentity[]):FactContextTag[]{
  const tags:FactContextTag[]=[];
  if(has(text,/청년/u)||tableIdentities.includes('YOUTH_SCORE_TABLE'))tags.push('YOUTH');
  if(has(text,/신혼부부|예비신혼|한부모/u)||tableIdentities.includes('NEWLYWED_SCORE_TABLE'))tags.push('NEWLYWED');
  if(has(text,/생애최초/u))tags.push('FIRST_TIME');
  if(!tags.some(tag=>['YOUTH','NEWLYWED','FIRST_TIME'].includes(tag)))tags.push('COMMON');
  if(has(text,/소득|도시근로자|외벌이|맞벌이/u))tags.push('INCOME');
  if(has(text,/자산|부동산|자동차/u))tags.push('ASSET');
  if(has(text,/청약|저축|납입|선납/u))tags.push('SUBSCRIPTION');
  if(has(text,/가점|점수|점\b/u))tags.push('SCORE');
  if(has(text,/단계|우선공급|일반공급|추첨/u))tags.push('STAGE');
  if(has(text,/거주|해당지역/u)||OFFICIAL_REGION_NAME_PATTERN.test(text))tags.push('RESIDENCE');
  if(has(text,/나이|연령|만\s*\d+\s*세/u))tags.push('AGE');
  if(has(text,/소득세|근로기간/u))tags.push('TAX');
  if(has(text,/단,|다만|제외|예외|불구하고|특례|해외체류|국외체류|혼인 전/u))tags.push('EXCEPTION');
  if(has(text,/출산|2023[.-]0?3[.-]28|10%p|20%p/u))tags.push('CHILDBIRTH_RELAXATION');
  return [...new Set(tags)];
}
function scopesFor(text:string):ApplicantScope[]{
  const scopes:ApplicantScope[]=[];
  if(has(text,/본인|신청자/u))scopes.push('APPLICANT');
  if(has(text,/세대|세대구성원/u))scopes.push('HOUSEHOLD');
  if(has(text,/예비신혼/u))scopes.push('FUTURE_HOUSEHOLD');
  if(has(text,/배우자/u))scopes.push('SPOUSE');
  if(has(text,/부모/u))scopes.push('PARENT');
  if(has(text,/자녀|태아|입양/u))scopes.push('CHILD');
  return scopes.length?scopes:['APPLICANT'];
}
const contextWindow=(text:string,start:number,length:number)=>text.slice(Math.max(0,start-180),Math.min(text.length,start+length+180));
function extractSource(source:Source,tableIdentities:TableIdentity[]):ExtractedFact[] {
  const facts:ExtractedFact[]=[];
  const ratio = new RegExp(`(${NUMBER})\\s*[/／]\\s*(${NUMBER})\\s*점`,'gu');
  for (const match of source.text.matchAll(ratio)) {
    const start=match.index ?? 0;
    facts.push(make(source,'SCORE',match[1],numeric(match[1]),'SCORE_VALUE',null,start,tableIdentities));
    facts.push(make(source,'SCORE',match[2],numeric(match[2]),'MAX_SCORE',null,start+match[0].indexOf(match[2]),tableIdentities));
  }
  const plainRatio=new RegExp(`(${NUMBER})\\s*[:：]\\s*(${NUMBER})(?!\\s*점)`,'gu');
  for(const match of source.text.matchAll(plainRatio))facts.push(make(source,'RATIO',match[0],`${numeric(match[1])}:${numeric(match[2])}`,'RATIO',null,match.index??0,tableIdentities));
  const range=new RegExp(`(${NUMBER})\\s*(%|회|개월|년|세)\\s*(초과|이상)\\s*(${NUMBER})\\s*\\2\\s*(이하|미만)`,'gu');
  for(const match of source.text.matchAll(range)){
    const unit=match[2]==='%'?'PERCENT':match[2]==='회'?'PAYMENT_COUNT':match[2]==='개월'?'MONTH':match[2]==='년'?'YEAR':'AGE_YEAR';
    const lowerOperator=OPERATOR[match[3]] as 'gt'|'gte',upperOperator=OPERATOR[match[5]] as 'lt'|'lte';
    const value:FactRange={lowerValue:numeric(match[1]),lowerOperator,upperValue:numeric(match[4]),upperOperator,unit};
    const fact=make(source,'RANGE',match[0],`${lowerOperator}:${value.lowerValue}|${upperOperator}:${value.upperValue}`,unit,null,match.index??0,tableIdentities);fact.range=value;facts.push(fact);
  }
  for (const pattern of patterns) for (const match of source.text.matchAll(pattern.regex)) {
    if (pattern.type === 'SCORE' && /[/／]\s*$/.test(source.text.slice(Math.max(0,(match.index??0)-4),match.index))) continue;
    const rawNumber=match[1] ?? match[0], rawUnit=pattern.type==='MONEY' ? match[2] : pattern.unit;
    const explicit=pattern.type==='MONEY' ? match[3] : match[2];
    const normalized=pattern.type==='DATE' ? date(match[0]) : pattern.type==='MONEY' ? money(rawNumber,rawUnit) : numeric(rawNumber);
    const scoreUnit=pattern.type==='SCORE'&&/(최대|총점)/u.test(contextWindow(source.text,match.index??0,match[0].length))?'MAX_SCORE':pattern.type==='SCORE'?'SCORE_VALUE':pattern.unit;
    const inferred=explicit==='경과'?'gte':operatorNear(match[0],explicit)??(pattern.type==='PERCENT'&&tableIdentities.includes('INCOME_TABLE')&&/월평균소득액?의?/u.test(source.contextSeed+source.text)&&!/출산|완화/u.test(source.contextSeed+source.text)?'lte':null);
    const fact=make(source,pattern.type,match[0],normalized,scoreUnit,inferred,match.index??0,tableIdentities);
    if(explicit&&/^\s*(?:또는|및|\/)?\s*(?:이상|이하|초과|미만)/u.test(source.text.slice((match.index??0)+match[0].length)))fact.bindingStatus='AMBIGUOUS_OPERATOR_BINDING';
    facts.push(fact);
  }
  for (const [phrase,value] of [['혼인 중이 아님',false],['무주택자',true],['무주택세대구성원',true],['우선공급',true],['일반공급',true],['추첨공급',true],['추첨',true],['1단계',true],['2단계',true],['3단계',true],['가점 없음',true],['예비신혼부부',true],['한부모가족',true],['1인 가구 신청 불가',true],['해외체류',true],['배우자 혼인 전',true],['출산특례',true]] as const) {
    let start=source.text.indexOf(phrase); while(start>=0){facts.push(make(source,'BOOLEAN_PHRASE',phrase,value,'BOOLEAN',null,start,tableIdentities));start=source.text.indexOf(phrase,start+phrase.length);}
  }
  if(tableIdentities.some(tag=>tag==='YOUTH_SCORE_TABLE'||tag==='NEWLYWED_SCORE_TABLE')&&/점수/u.test(source.contextSeed)){
    for(const match of source.text.matchAll(/(?:^|[\s|])([0-3])\s*(?:점)?(?=$|[\s|])/gu)){
      if(/점/u.test(match[0]))continue;
      const start=(match.index??0)+match[0].indexOf(match[1]);facts.push(make(source,'SCORE',match[1],numeric(match[1]),'SCORE_VALUE',null,start,tableIdentities));
    }
  }
  return facts;
}
function make(source:Source,type:FactType,rawValue:string,normalizedValue:number|string|boolean,unit:string,operator:FactOperator,start:number,tableIdentities:TableIdentity[]):ExtractedFact {
  const local=contextWindow(source.text,start,rawValue.length),contextText=`${source.contextSeed}\n${local}`.trim();
  const scopes=[/청년 특별공급/u.test(contextText)?'YOUTH':null,/신혼부부 특별공급/u.test(contextText)?'NEWLYWED':null,/생애최초 특별공급/u.test(contextText)?'FIRST_TIME':null].filter((value):value is SupplyScope=>value!==null);
  return {factId:id(source.sourceId,type,start,rawValue),type,rawValue,normalizedValue,unit,operator,bindingStatus:'BOUND',sourceId:source.sourceId,sourceLocator:source.locator,tableId:source.tableId,row:source.row,column:source.column,surroundingBlockIds:[...source.blockIds],characterOffset:start,contextText,localContextText:local,primarySupplyScope:source.primarySupplyScope??(scopes.length===1?scopes[0]:null),contextTags:tagsFor(contextText,tableIdentities),applicantScopes:scopesFor(contextText),tableIdentities:[...tableIdentities],range:null};
}

export function extractFacts(document:ParsedDocument):ExtractedFact[] {
  const inTables=new Set(document.tables.flatMap(table=>table.rows.flat().flatMap(cell=>cell.blockIds)));
  const sources:Source[]=[];
  const blockOrder=new Map(document.blocks.map((block,index)=>[block.id,index]));
  const nearestSupply=(tableId:string)=>{const table=document.tables.find(item=>item.id===tableId);const first=table?.rows.flat().flatMap(cell=>cell.blockIds).map(id=>blockOrder.get(id)??-1).filter(index=>index>=0).sort((a,b)=>a-b)[0]??0;for(let index=first-1;index>=Math.max(0,first-80);index--){const text=document.blocks[index]?.text??'';if(/(청년|신혼부부|생애최초) 특별공급/u.test(text))return text.slice(0,240);}return '';};
  const tableContext=new Map(document.tables.map(table=>{const body=table.rows.flat().map(cell=>cell.text).join('\n'),near=/가점항목/u.test(body)?nearestSupply(table.id):'',title=table.rows.slice(0,2).flat().map(cell=>cell.text).join(' '),scopeMatches=[/청년 특별공급/u.test(title)?'YOUTH':null,/신혼부부 특별공급/u.test(title)?'NEWLYWED':null,/생애최초 특별공급/u.test(title)?'FIRST_TIME':null].filter((value):value is SupplyScope=>value!==null),nearMatches=[/청년 특별공급/u.test(near)?'YOUTH':null,/신혼부부 특별공급/u.test(near)?'NEWLYWED':null,/생애최초 특별공급/u.test(near)?'FIRST_TIME':null].filter((value):value is SupplyScope=>value!==null);return [table.id,{near,primarySupplyScope:scopeMatches.length===1?scopeMatches[0]:nearMatches.length===1?nearMatches[0]:null,identities:classifyTableText(`${near}\n${table.caption??''}\n${body}`)}] as const;}));
  for(const table of document.tables) for(const row of table.rows) for(const cell of row) if(cell.text.trim()){
    const targetEnd=cell.column+(cell.columnSpan??1);const columnHeaders=table.rows.slice(0,Math.min(cell.row+1,3)).flatMap(headerRow=>{const texts:string[]=[];for(let column=cell.column;column<targetEnd;column++){const matches=headerRow.filter(item=>item.column<=column&&item.column+(item.columnSpan??1)>column).sort((a,b)=>(a.columnSpan??1)-(b.columnSpan??1)||b.column-a.column);if(matches[0])texts.push(matches[0].text);}return [...new Set(texts)];});
    const rowHeaders=row.filter(item=>item.column<cell.column&&item.text.length<120).slice(-2).map(item=>item.text);
    const inheritedColumn=table.rows.slice(0,cell.row+1).flat().filter(item=>item.column===0&&item.text.trim()).slice(-1).map(item=>item.text);
    const inheritedStage=table.rows.slice(0,cell.row+1).flat().filter(item=>item.column===1&&/(우선공급|일반공급|추첨공급)/u.test(item.text)).slice(-1).map(item=>item.text);
    const context=tableContext.get(table.id)!;const contextSeed=[context.near,...columnHeaders,...rowHeaders,...inheritedColumn,...inheritedStage].join(' ');
    const rowScopeText=table.rows.slice(0,cell.row+1).flat().filter(item=>item.column===0&&/(청년|신혼\s*부부|생애\s*최초)/u.test(item.text)).slice(-1)[0]?.text??'';
    const rowScopes=[/청년/u.test(rowScopeText)?'YOUTH':null,/신혼\s*부부/u.test(rowScopeText)?'NEWLYWED':null,/생애\s*최초/u.test(rowScopeText)?'FIRST_TIME':null].filter((value):value is SupplyScope=>value!==null);
    sources.push({sourceId:`cell:${table.id}:${cell.row}:${cell.column}`,text:cell.text,contextSeed,primarySupplyScope:rowScopes.length===1?rowScopes[0]:context.primarySupplyScope,locator:cell.sourceLocator,tableId:table.id,row:cell.row,column:cell.column,blockIds:cell.blockIds});
  }
  for(const block of document.blocks) if(!inTables.has(block.id)&&block.text.trim()) sources.push({sourceId:block.id,text:block.text,contextSeed:block.sectionPath.join(' '),primarySupplyScope:null,locator:block.sourceLocator,tableId:null,row:null,column:null,blockIds:[block.id]});
  const result=sources.flatMap(source=>extractSource(source,source.tableId?tableContext.get(source.tableId)?.identities??['UNKNOWN_TABLE']:['UNKNOWN_TABLE']));
  for(const table of document.tables){const identities=tableContext.get(table.id)?.identities??['UNKNOWN_TABLE'];if(!identities.some(tag=>tag==='YOUTH_SCORE_TABLE'||tag==='NEWLYWED_SCORE_TABLE'))continue;let maxScore=0;for(const row of table.rows){const label=row.find(cell=>cell.column===0)?.text??'',score=row.find(cell=>cell.column===2)?.text.trim()??'';if(/^\(\d+\)/u.test(label)&&/^[0-3]$/u.test(score))maxScore+=Number(score);}if(!maxScore)continue;const anchor=table.rows[0]?.find(cell=>cell.column===2)??table.rows[0]?.[0];if(!anchor)continue;const source:Source={sourceId:`cell:${table.id}:${anchor.row}:${anchor.column}`,text:anchor.text,contextSeed:`${tableContext.get(table.id)?.near??''} 가점 총점`,primarySupplyScope:tableContext.get(table.id)?.primarySupplyScope??null,locator:anchor.sourceLocator,tableId:table.id,row:anchor.row,column:anchor.column,blockIds:anchor.blockIds};result.push(make(source,'SCORE',`derived:${maxScore}`,maxScore,'MAX_SCORE',null,0,identities));}
  return [...new Map(result.map(fact=>[fact.factId,fact])).values()];
}

export function factEvidenceText(document:ParsedDocument,fact:ExtractedFact):string {
  if(fact.tableId!==null) return document.tables.find(t=>t.id===fact.tableId)?.rows[fact.row!]?.find(c=>c.column===fact.column)?.text ?? '';
  return document.blocks.find(b=>b.id===fact.sourceId)?.text ?? '';
}
