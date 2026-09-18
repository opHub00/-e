import type { ParsedDocument } from './parsedDocument.ts';
import { array,object,string,exact } from './parsedDocument.ts';
import { GROUPS,type Group } from './semanticContract.ts';
export function sourceIndex(d:ParsedDocument){
  const contained=new Set(d.tables.flatMap(t=>t.rows.flat().flatMap(c=>c.blockIds)));
  return {tables:d.tables.map(t=>({id:t.id,rows:t.rowCount,columns:t.columnCount,preview:t.rows.flat().map(c=>c.text).join(' ').slice(0,260),headings:d.blocks.find(b=>t.rows.flat().some(c=>c.blockIds.includes(b.id)))?.sectionPath??[]})),
    otherBlocks:d.blocks.filter(b=>!contained.has(b.id)).map(b=>({id:b.id,type:b.type,text:b.text.slice(0,250),memoAnchors:memoAnchors(d,b.id).map(id=>({blockId:id,tableId:d.blocks.find(x=>x.id===id)?.sourceLocator.tableId??null}))}))};
}
function memoAnchors(d:ParsedDocument,blockId:string):string[]{const b=d.blocks.find(b=>b.id===blockId);if(b?.type!=='note'||b.sourceLocator.memoId===undefined||!Array.isArray(d.metadata.memoAnchors))return [];return d.metadata.memoAnchors.filter((a:any)=>a.memoId===b.sourceLocator.memoId&&typeof a.precedingBlockId==='string').map((a:any)=>a.precedingBlockId);}
export function validateSelection(raw:unknown,d:ParsedDocument):{group:Group;tableIds:string[];blockIds:string[]}[]{
  const o=object(raw);exact(o,['groups']);const seen=new Set<string>();
  const result=array(o.groups,5).map(value=>{const g=object(value);exact(g,['group','tableIds','blockIds']);const group=string(g.group) as Group;
    if(!GROUPS.includes(group)||seen.has(group))throw new Error('INVALID_DISCOVERY_GROUP');seen.add(group);
    const tableIds=array(g.tableIds,172).map(x=>string(x)),blockIds=array(g.blockIds,500).map(x=>string(x));
    if(tableIds.some(id=>!d.tables.some(t=>t.id===id))||blockIds.some(id=>!d.blocks.some(b=>b.id===id)))throw new Error('UNKNOWN_SELECTED_SOURCE');
    return {group,tableIds:[...new Set(tableIds)],blockIds:[...new Set(blockIds)]};});
  if(seen.size!==5)throw new Error('MISSING_DISCOVERY_GROUP');return result;
}
export type SemanticBatch={group:Group;tableIds:string[];blockIds:string[];context:unknown;oversized:boolean};
export function semanticBatches(d:ParsedDocument,selection:ReturnType<typeof validateSelection>,maxCharacters=24000){
  const batches:SemanticBatch[]=[];
  for(const group of selection){
    const covered=new Set<string>();
    const units:{tableIds:string[];blockIds:string[];context:unknown}[]=[];
    for(const id of group.tableIds){
      const t=d.tables.find(t=>t.id===id)!;const inside=new Set(t.rows.flat().flatMap(c=>c.blockIds));
      const indexes=d.blocks.flatMap((b,i)=>inside.has(b.id)?[i]:[]);
      const contextIds=new Set([...inside]);
      if(indexes.length)for(const b of d.blocks.slice(Math.max(0,indexes[0]-2),Math.min(d.blocks.length,indexes.at(-1)!+3)))if(!b.sourceLocator.tableId||b.sourceLocator.tableId===id||Math.abs(d.blocks.indexOf(b)-indexes[0])<=2||Math.abs(d.blocks.indexOf(b)-indexes.at(-1)!)<=2)contextIds.add(b.id);
      const blocks=d.blocks.filter(b=>contextIds.has(b.id));blocks.forEach(b=>covered.add(b.id));
      units.push({tableIds:[id],blockIds:blocks.map(b=>b.id),context:{table:{id,rows:t.rows.map(row=>row.map(c=>({row:c.row,column:c.column,rowSpan:c.rowSpan,columnSpan:c.columnSpan,blockIds:c.blockIds,...(!c.blockIds.length?{text:c.text}:{})})))},blocks:blocks.map(b=>({id:b.id,text:b.text,type:b.type}))}});
    }
    for(const id of group.blockIds)if(!covered.has(id)){const blocks=[id,...memoAnchors(d,id)].map(id=>d.blocks.find(b=>b.id===id)).filter(b=>b!==undefined);units.push({tableIds:[],blockIds:blocks.map(b=>b.id),context:{blocks:blocks.map(b=>({id:b.id,text:b.text,type:b.type}))}});}
    let pending:typeof units=[];
    const flush=()=>{if(pending.length){const context=pending.map(u=>u.context);batches.push({group:group.group,tableIds:pending.flatMap(u=>u.tableIds),blockIds:[...new Set(pending.flatMap(u=>u.blockIds))],context,oversized:JSON.stringify(context).length>maxCharacters});pending=[];}};
    for(const unit of units){if(JSON.stringify([...pending,unit].map(u=>u.context)).length>maxCharacters)flush();pending.push(unit);if(JSON.stringify(unit.context).length>maxCharacters)flush();}flush();
  }
  return batches;
}
