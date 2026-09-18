import { createHash } from 'node:crypto';
import type { ParsedDocument, SourceLocator } from '../parsedDocument.ts';

export const FACT_TYPES = ['PERCENT','MONEY','DATE','DURATION_MONTHS','DURATION_YEARS','COUNT','SCORE','RATIO','AGE','BOOLEAN_PHRASE'] as const;
export type FactType = typeof FACT_TYPES[number];
export type FactOperator = 'eq'|'gt'|'gte'|'lt'|'lte'|null;
export type ExtractedFact = {
  factId: string; type: FactType; rawValue: string; normalizedValue: number|string|boolean; unit: string;
  operator: FactOperator; bindingStatus: 'BOUND'|'AMBIGUOUS_OPERATOR_BINDING'; sourceId: string;
  sourceLocator: SourceLocator; tableId: string|null; row: number|null; column: number|null; surroundingBlockIds: string[];
};

const OPERATOR: Record<string, Exclude<FactOperator,null>> = { 이상:'gte', 이하:'lte', 초과:'gt', 미만:'lt' };
const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const patterns: { type: FactType; unit: string; regex: RegExp }[] = [
  { type:'DATE', unit:'DATE', regex:/\b(?:19|20)\d{2}[-.년\s]+(?:0?[1-9]|1[0-2])[-.월\s]+(?:0?[1-9]|[12]\d|3[01])일?\b/gu },
  { type:'PERCENT', unit:'PERCENT', regex:new RegExp(`(${NUMBER})\\s*%\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'MONEY', unit:'KRW', regex:new RegExp(`(${NUMBER})\\s*(백만원|만원|원)\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'DURATION_MONTHS', unit:'MONTH', regex:new RegExp(`(${NUMBER})\\s*개월\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'DURATION_YEARS', unit:'YEAR', regex:new RegExp(`(${NUMBER})\\s*년\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'COUNT', unit:'PAYMENT_COUNT', regex:new RegExp(`(${NUMBER})\\s*회\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'COUNT', unit:'DAY', regex:new RegExp(`(${NUMBER})\\s*일\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'COUNT', unit:'PERSON', regex:new RegExp(`(${NUMBER})\\s*명\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'AGE', unit:'AGE_YEAR', regex:new RegExp(`(?:만\\s*)?(${NUMBER})\\s*세\\s*(이상|이하|초과|미만)?`,'gu') },
  { type:'SCORE', unit:'POINT', regex:new RegExp(`(${NUMBER})\\s*점\\s*(이상|이하|초과|미만)?`,'gu') },
];

const numeric = (raw:string) => Number(raw.replaceAll(',',''));
const money = (raw:string, unit:string) => numeric(raw) * (unit === '백만원' ? 1_000_000 : unit === '만원' ? 10_000 : 1);
const date = (raw:string) => {
  const parts = raw.match(/\d+/g) ?? [];
  return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
};
const id = (sourceId:string, type:FactType, start:number, raw:string) => `f_${createHash('sha256').update(`${sourceId}|${type}|${start}|${raw}`).digest('hex').slice(0,20)}`;
const operatorNear = (match:string, explicit:string|undefined):FactOperator => explicit ? OPERATOR[explicit] : Object.entries(OPERATOR).find(([word])=>match.trimEnd().endsWith(word))?.[1] ?? null;

type Source = { sourceId:string; text:string; locator:SourceLocator; tableId:string|null; row:number|null; column:number|null; blockIds:string[] };
function extractSource(source:Source):ExtractedFact[] {
  const facts:ExtractedFact[]=[];
  const ratio = new RegExp(`(${NUMBER})\\s*[/／]\\s*(${NUMBER})\\s*점`,'gu');
  for (const match of source.text.matchAll(ratio)) {
    const start=match.index ?? 0;
    facts.push(make(source,'SCORE',match[1],numeric(match[1]),'POINT',null,start));
    facts.push(make(source,'SCORE',match[2],numeric(match[2]),'MAX_POINT',null,start+match[0].indexOf(match[2])));
  }
  const plainRatio=new RegExp(`(${NUMBER})\\s*[:：]\\s*(${NUMBER})(?!\\s*점)`,'gu');
  for(const match of source.text.matchAll(plainRatio))facts.push(make(source,'RATIO',match[0],`${numeric(match[1])}:${numeric(match[2])}`,'RATIO',null,match.index??0));
  for (const pattern of patterns) for (const match of source.text.matchAll(pattern.regex)) {
    if (pattern.type === 'SCORE' && /[/／]\s*$/.test(source.text.slice(Math.max(0,(match.index??0)-4),match.index))) continue;
    const rawNumber=match[1] ?? match[0], rawUnit=pattern.type==='MONEY' ? match[2] : pattern.unit;
    const explicit=pattern.type==='MONEY' ? match[3] : match[2];
    const normalized=pattern.type==='DATE' ? date(match[0]) : pattern.type==='MONEY' ? money(rawNumber,rawUnit) : numeric(rawNumber);
    const fact=make(source,pattern.type,match[0],normalized,pattern.unit,operatorNear(match[0],explicit),match.index??0);
    if(explicit&&/^\s*(?:또는|및|\/)?\s*(?:이상|이하|초과|미만)/u.test(source.text.slice((match.index??0)+match[0].length)))fact.bindingStatus='AMBIGUOUS_OPERATOR_BINDING';
    facts.push(fact);
  }
  for (const [phrase,value] of [['혼인 중이 아님',false],['무주택자',true],['무주택세대구성원',true],['우선공급',true],['일반공급',true],['추첨공급',true],['추첨',true],['1단계',true],['2단계',true],['3단계',true],['가점 없음',true],['예비신혼부부',true],['한부모가족',true],['1인 가구 신청 불가',true],['해외체류',true],['배우자 혼인 전',true],['출산특례',true]] as const) {
    let start=source.text.indexOf(phrase); while(start>=0){facts.push(make(source,'BOOLEAN_PHRASE',phrase,value,'BOOLEAN',null,start));start=source.text.indexOf(phrase,start+phrase.length);}
  }
  return facts;
}
function make(source:Source,type:FactType,rawValue:string,normalizedValue:number|string|boolean,unit:string,operator:FactOperator,start:number):ExtractedFact {
  return {factId:id(source.sourceId,type,start,rawValue),type,rawValue,normalizedValue,unit,operator,bindingStatus:'BOUND',sourceId:source.sourceId,sourceLocator:source.locator,tableId:source.tableId,row:source.row,column:source.column,surroundingBlockIds:[...source.blockIds]};
}

export function extractFacts(document:ParsedDocument):ExtractedFact[] {
  const inTables=new Set(document.tables.flatMap(table=>table.rows.flat().flatMap(cell=>cell.blockIds)));
  const sources:Source[]=[];
  for(const table of document.tables) for(const row of table.rows) for(const cell of row) if(cell.text.trim()) sources.push({sourceId:`cell:${table.id}:${cell.row}:${cell.column}`,text:cell.text,locator:cell.sourceLocator,tableId:table.id,row:cell.row,column:cell.column,blockIds:cell.blockIds});
  for(const block of document.blocks) if(!inTables.has(block.id)&&block.text.trim()) sources.push({sourceId:block.id,text:block.text,locator:block.sourceLocator,tableId:null,row:null,column:null,blockIds:[block.id]});
  const result=sources.flatMap(extractSource);
  return [...new Map(result.map(fact=>[fact.factId,fact])).values()];
}

export function factEvidenceText(document:ParsedDocument,fact:ExtractedFact):string {
  if(fact.tableId!==null) return document.tables.find(t=>t.id===fact.tableId)?.rows[fact.row!]?.find(c=>c.column===fact.column)?.text ?? '';
  return document.blocks.find(b=>b.id===fact.sourceId)?.text ?? '';
}
