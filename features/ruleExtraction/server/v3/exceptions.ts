import type { ParsedDocument } from '../parsedDocument.ts';
import type { SemanticBinding, BindingUnresolved } from './contract.ts';

export const STRONG_EXCEPTION_MARKERS=['단,','다만','제외','예외','불구하고','한하여','특례','검토','확인 필요'] as const;
export const CONTEXTUAL_EXCEPTION_MARKERS=['의 경우','배우자','혼인 전','해외체류','국외체류','생업','출산'] as const;
export const V3_EXCEPTION_MARKERS=[...STRONG_EXCEPTION_MARKERS,...CONTEXTUAL_EXCEPTION_MARKERS] as const;
export type ExceptionSource={sourceId:string;text:string;markers:string[]};
export function exceptionMarkers(text:string):string[]{
  const strong=STRONG_EXCEPTION_MARKERS.filter(marker=>text.includes(marker));
  const contextual=CONTEXTUAL_EXCEPTION_MARKERS.filter(marker=>text.includes(marker));
  const contextualSupported=strong.length>0||contextual.length>=2||(/(완화|제한|인정|신청 가능|해당하지 않)/u.test(text)&&contextual.length>0);
  return [...strong,...(contextualSupported?contextual:[])];
}
export const hasExceptionContext=(text:string)=>exceptionMarkers(text).length>0;
export function discoverExceptionSources(document:ParsedDocument):ExceptionSource[]{
  const sources:ExceptionSource[]=[];
  for(const block of document.blocks){const markers=exceptionMarkers(block.text);if(markers.length)sources.push({sourceId:block.id,text:block.text,markers});}
  for(const table of document.tables)for(const row of table.rows)for(const cell of row){const markers=exceptionMarkers(cell.text);if(markers.length)sources.push({sourceId:`cell:${table.id}:${cell.row}:${cell.column}`,text:cell.text,markers});}
  return sources;
}
export function unresolvedExceptions(sources:ExceptionSource[],bindings:SemanticBinding[]):BindingUnresolved[]{
  const linked=new Set(bindings.flatMap(binding=>[...binding.qualifierSourceIds,...(binding.semanticRole.includes('EXCEPTION')?binding.sourceIds:[])]));
  return sources.filter(source=>!linked.has(source.sourceId)).map(source=>({reason:`EXCEPTION_UNRESOLVED:${source.markers.join(',')}`,sourceIds:[source.sourceId]}));
}
export type ExceptionRelation={baseBindingId:string;exceptionBindingId:string;relation:'limitedBy'|'exceptedBy';sourceIds:string[]};
export function linkExceptionRelations(bindings:SemanticBinding[]):ExceptionRelation[]{
  const exceptions=bindings.filter(binding=>binding.semanticRole.includes('EXCEPTION'));
  return bindings.filter(binding=>!binding.semanticRole.includes('EXCEPTION')).flatMap(base=>exceptions.filter(exception=>base.qualifierSourceIds.some(id=>exception.sourceIds.includes(id))).map(exception=>({baseBindingId:base.bindingId,exceptionBindingId:exception.bindingId,relation:'limitedBy' as const,sourceIds:[...new Set(base.qualifierSourceIds.filter(id=>exception.sourceIds.includes(id)))]})));
}
