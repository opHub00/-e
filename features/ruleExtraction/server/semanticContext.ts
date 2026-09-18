import { createHash } from 'node:crypto';
import type { ParsedBlock, ParsedDocument } from './parsedDocument.ts';
import { array,object,string,exact } from './parsedDocument.ts';
import { GROUPS,type Group } from './semanticContract.ts';

export const EXCEPTION_MARKERS=['단,','다만','제외','예외','의 경우','배우자','혼인 전','해외체류','국외','생업','출산','특례'] as const;
export const SELECTION_LIMITS:Record<Group,{tables:number;blocks:number}>={
  COMMON:{tables:8,blocks:30},YOUTH:{tables:10,blocks:50},NEWLYWED:{tables:10,blocks:60},FIRST_TIME:{tables:8,blocks:50},EXCEPTIONS:{tables:8,blocks:60},
};
const KEYWORDS:Record<Group,string[]>={
  COMMON:['입주자모집공고일','지역우선','해당지역','기타지역','해외체류','출입국','무주택세대구성원','청약통장','재당첨','중복신청','총 자산 보유 기준','소득 기준'],
  YOUTH:['청년 특별공급','청년','표7','표8','만 19세','39세'],
  NEWLYWED:['신혼부부 특별공급','예비신혼','한부모','표9','표10','혼인기간'],
  FIRST_TIME:['생애최초 특별공급','생애최초','600만원','소득세','1인 가구'],
  EXCEPTIONS:['단,','다만','제외','예외','특례','해외체류','배우자','혼인 전','출산'],
};
const SUPPLY_TERMS=['청년 특별공급','신혼부부 특별공급','생애최초 특별공급','신생아 특별공급'];
export const hasExceptionMarker=(text:string)=>EXCEPTION_MARKERS.some(marker=>text.includes(marker));
const score=(text:string,group:Group)=>{
  let value=KEYWORDS[group].reduce((sum,k)=>sum+(text.includes(k)?10:0),0)+(hasExceptionMarker(text)&&group==='EXCEPTIONS'?8:0);
  if(group==='YOUTH'&&text.includes('청년 특별공급'))value+=50;if(group==='YOUTH'&&/[<〈]표[78][>〉]/.test(text))value+=80;
  if(group==='YOUTH'&&/(2,669,354|5,338,708|276백만원|1,034백만원)/.test(text))value+=70;
  if(group==='NEWLYWED'&&text.includes('신혼부부 특별공급'))value+=50;if(group==='NEWLYWED'&&/[<〈]표(?:9|10)[>〉]/.test(text))value+=80;
  if(group==='NEWLYWED'&&/(9,793,892|10,547,268|362백만원)/.test(text))value+=50;
  if(group==='FIRST_TIME'&&text.includes('생애최초 특별공급'))value+=60;
  if(group==='COMMON'&&(/특별공급 공급 세대수/.test(text)||/[<〈]표(?:7|8|9|10)[>〉]/.test(text)))value-=120;
  if(group==='COMMON'&&SUPPLY_TERMS.some(k=>text.includes(k))&&!KEYWORDS.COMMON.some(k=>text.includes(k)))value-=20;return value;
};

export function sourceIndex(d:ParsedDocument){
  const contained=new Set(d.tables.flatMap(t=>t.rows.flat().flatMap(c=>c.blockIds)));
  return {tables:d.tables.map(t=>({id:t.id,rows:t.rowCount,columns:t.columnCount,preview:t.rows.flat().map(c=>c.text).join(' ').slice(0,260),headings:d.blocks.find(b=>t.rows.flat().some(c=>c.blockIds.includes(b.id)))?.sectionPath??[]})),
    otherBlocks:d.blocks.filter(b=>!contained.has(b.id)).map(b=>({id:b.id,type:b.type,text:b.text.slice(0,250),sectionPath:b.sectionPath,memoAnchors:memoAnchors(d,b.id).map(id=>({blockId:id,tableId:d.blocks.find(x=>x.id===id)?.sourceLocator.tableId??null}))}))};
}
function memoAnchors(d:ParsedDocument,blockId:string):string[]{const b=d.blocks.find(b=>b.id===blockId);if(b?.type!=='note'||b.sourceLocator.memoId===undefined||!Array.isArray(d.metadata.memoAnchors))return [];return d.metadata.memoAnchors.filter((a:any)=>a.memoId===b.sourceLocator.memoId&&typeof a.precedingBlockId==='string').map((a:any)=>a.precedingBlockId);}
export type Selection={group:Group;tableIds:string[];blockIds:string[]};
export function validateSelection(raw:unknown,d:ParsedDocument):Selection[]{
  const o=object(raw);exact(o,['groups']);const seen=new Set<string>();
  const result=array(o.groups,5).map(value=>{const g=object(value);exact(g,['group','tableIds','blockIds']);const group=string(g.group) as Group;
    if(!GROUPS.includes(group)||seen.has(group))throw new Error('INVALID_DISCOVERY_GROUP');seen.add(group);
    const tableIds=array(g.tableIds,172).map(x=>string(x)),blockIds=array(g.blockIds,500).map(x=>string(x));
    if(tableIds.some(id=>!d.tables.some(t=>t.id===id))||blockIds.some(id=>!d.blocks.some(b=>b.id===id)))throw new Error('UNKNOWN_SELECTED_SOURCE');
    return {group,tableIds:[...new Set(tableIds)],blockIds:[...new Set(blockIds)]};});
  if(seen.size!==5)throw new Error('MISSING_DISCOVERY_GROUP');return result;
}
function rankedIds<T extends {id:string}>(items:T[],selected:Set<string>,text:(item:T)=>string,group:Group,limit:number){
  return items.map((item,index)=>({id:item.id,index,selected:selected.has(item.id),score:score(text(item),group)}))
    .filter(x=>x.selected||x.score>0).sort((a,b)=>b.score-a.score||Number(b.selected)-Number(a.selected)||a.index-b.index).slice(0,limit).map(x=>x.id);
}
export type SelectionPolicyReport={before:Record<Group,{tables:number;blocks:number}>;after:Record<Group,{tables:number;blocks:number}>;caps:typeof SELECTION_LIMITS};
export function applySelectionPolicy(d:ParsedDocument,input:Selection[]):{selection:Selection[];report:SelectionPolicyReport}{
  const before={} as SelectionPolicyReport['before'],after={} as SelectionPolicyReport['after'];
  const selection=GROUPS.map(group=>{const current=input.find(x=>x.group===group)??{group,tableIds:[],blockIds:[]};before[group]={tables:current.tableIds.length,blocks:current.blockIds.length};
    const tableIds=rankedIds(d.tables,new Set(current.tableIds),t=>tableScopeText(d,t.id),group,SELECTION_LIMITS[group].tables);
    const selectedTableBlocks=new Set(d.tables.filter(t=>tableIds.includes(t.id)).flatMap(t=>t.rows.flat().flatMap(c=>c.blockIds)));
    const blockIds=rankedIds(d.blocks.filter(b=>!selectedTableBlocks.has(b.id)),new Set(current.blockIds),b=>`${b.sectionPath.join(' ')} ${b.text}`,group,SELECTION_LIMITS[group].blocks);
    after[group]={tables:tableIds.length,blocks:blockIds.length};return {group,tableIds,blockIds};});
  return {selection,report:{before,after,caps:SELECTION_LIMITS}};
}
function tableScopeText(d:ParsedDocument,tableId:string){const table=d.tables.find(t=>t.id===tableId);if(!table)return '';const memberIds=new Set(table.rows.flat().flatMap(c=>c.blockIds)),indexes=d.blocks.flatMap((b,i)=>memberIds.has(b.id)?[i]:[]),near=indexes.length?d.blocks.slice(Math.max(0,indexes[0]-6),Math.min(d.blocks.length,indexes.at(-1)!+4)):[];return `${table.caption??''} ${table.rows.flat().map(c=>c.text).join(' ')} ${near.map(b=>b.text).join(' ')}`;}
export function deterministicSelection(d:ParsedDocument):Selection[]{return applySelectionPolicy(d,GROUPS.map(group=>({group,tableIds:[],blockIds:[]}))).selection;}

function exceptionWindow(d:ParsedDocument,index:number){
  const selected=new Set<number>([index]);const base=d.blocks[index];if(!base)return [];
  if(hasExceptionMarker(base.text))for(let i=Math.max(0,index-1);i<=Math.min(d.blocks.length-1,index+2);i++)selected.add(i);
  return [...selected].sort((a,b)=>a-b).map(i=>d.blocks[i]);
}
export type SemanticBatch={group:Group;tableIds:string[];blockIds:string[];context:unknown;oversized:boolean;hasExceptionContext:boolean;exceptionBlockIds:string[];contextHash:string};
export function semanticBatches(d:ParsedDocument,selection:Selection[],maxCharacters=24000){
  const batches:SemanticBatch[]=[];
  for(const group of selection){
    const covered=new Set<string>();
    const units:{tableIds:string[];blockIds:string[];context:unknown;exceptionBlockIds:string[]}[]=[];
    for(const id of group.tableIds){
      const t=d.tables.find(t=>t.id===id)!;const inside=new Set(t.rows.flat().flatMap(c=>c.blockIds));
      const indexes=d.blocks.flatMap((b,i)=>inside.has(b.id)?[i]:[]);const contextIds=new Set([...inside]);
      if(indexes.length)for(const b of d.blocks.slice(Math.max(0,indexes[0]-2),Math.min(d.blocks.length,indexes.at(-1)!+3)))if(!b.sourceLocator.tableId||b.sourceLocator.tableId===id||Math.abs(d.blocks.indexOf(b)-indexes[0])<=2||Math.abs(d.blocks.indexOf(b)-indexes.at(-1)!)<=2)contextIds.add(b.id);
      const exceptions=d.blocks.filter(b=>contextIds.has(b.id)&&hasExceptionMarker(b.text));for(const ex of exceptions)for(const b of exceptionWindow(d,d.blocks.indexOf(ex)))contextIds.add(b.id);
      const blocks=d.blocks.filter(b=>contextIds.has(b.id));blocks.forEach(b=>covered.add(b.id));
      units.push({tableIds:[id],blockIds:blocks.map(b=>b.id),exceptionBlockIds:blocks.filter(b=>hasExceptionMarker(b.text)).map(b=>b.id),context:{table:{id,caption:t.caption,fidelity:t.fidelity,warnings:t.warnings,rows:t.rows.map(row=>row.map(c=>({row:c.row,column:c.column,rowSpan:c.rowSpan,columnSpan:c.columnSpan,blockIds:c.blockIds,...(!c.blockIds.length?{text:c.text}:{})})))},blocks:blocks.map(compactBlock)}});
    }
    for(const id of group.blockIds)if(!covered.has(id)){const index=d.blocks.findIndex(b=>b.id===id);const blockSet=new Map<string,ParsedBlock>();for(const b of [...exceptionWindow(d,index),...memoAnchors(d,id).map(anchor=>d.blocks.find(b=>b.id===anchor)).filter((b):b is ParsedBlock=>!!b)])blockSet.set(b.id,b);const blocks=[...blockSet.values()];units.push({tableIds:[],blockIds:blocks.map(b=>b.id),exceptionBlockIds:blocks.filter(b=>hasExceptionMarker(b.text)).map(b=>b.id),context:{blocks:blocks.map(compactBlock)}});}
    let pending:typeof units=[];
    const flush=()=>{if(pending.length){const context=pending.map(u=>u.context),blockIds=[...new Set(pending.flatMap(u=>u.blockIds))],exceptionBlockIds=[...new Set(pending.flatMap(u=>u.exceptionBlockIds))],serialized=JSON.stringify(context);batches.push({group:group.group,tableIds:pending.flatMap(u=>u.tableIds),blockIds,context,oversized:serialized.length>maxCharacters,hasExceptionContext:exceptionBlockIds.length>0,exceptionBlockIds,contextHash:createHash('sha256').update(serialized).digest('hex')});pending=[];}};
    for(const unit of units){if(JSON.stringify([...pending,unit].map(u=>u.context)).length>maxCharacters)flush();pending.push(unit);if(JSON.stringify(unit.context).length>maxCharacters)flush();}flush();
  }
  return batches;
}
const compactBlock=(b:ParsedBlock)=>({id:b.id,text:b.text,type:b.type,sectionPath:b.sectionPath});
export function selectionQuality(d:ParsedDocument,selection:Selection[],batches:SemanticBatch[]){
  const selected=new Set(batches.flatMap(b=>b.blockIds)),allException=d.blocks.filter(b=>hasExceptionMarker(b.text)),selectedException=allException.filter(b=>selected.has(b.id));
  const exposure=new Map<string,number>();for(const b of batches)for(const id of b.blockIds)exposure.set(id,(exposure.get(id)??0)+1);
  return {selectedBlockCount:selected.size,selectedTableCount:new Set(batches.flatMap(b=>b.tableIds)).size,batchCountByScope:Object.fromEntries(GROUPS.map(g=>[g,batches.filter(b=>b.group===g).length])),duplicateContextRatio:selected.size?[...exposure.values()].filter(n=>n>1).length/selected.size:0,exceptionMarkerCoverage:{selected:selectedException.length,total:allException.length,ratio:allException.length?selectedException.length/allException.length:null}};
}
