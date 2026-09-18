import type { ParsedDocument } from '../parsedDocument.ts';

const texts=[
  '해당지역은 제주특별자치도 1년 이상 계속 거주자이며 기타지역은 1년 미만 계속 거주자입니다.',
  '해외체류기간이 계속하여 90일을 초과하거나 연간 183일을 초과한 기간은 국내 거주로 인정하지 않습니다. 단, 생업에 직접 종사하기 위하여 국외에 체류한 경우는 예외로 합니다.',
  '세대 내 1인만 신청할 수 있습니다. 다만, 신청자의 배우자가 별도 신청할 수 있는 특례는 별도 확인이 필요합니다.',
  '무주택세대구성원이어야 합니다. 단, 청년 특별공급은 신청자 본인, 예비신혼부부는 혼인으로 구성될 세대를 말합니다.',
  '신혼부부 특별공급은 우선공급, 일반공급 및 잔여물량 추첨공급 단계로 선정합니다.',
  '생애최초 특별공급은 1단계, 2단계 및 3단계에서 추첨으로 선정하며 별도 가점은 없습니다.',
];
export function samdoExceptionFixture():ParsedDocument{
  const blocks=texts.map((text,i)=>({id:`b${String(i).padStart(6,'0')}`,type:'paragraph' as const,text,sectionPath:[i===4?'신혼부부 특별공급':i===5?'생애최초 특별공급':'공통 신청자격'],sourceLocator:{kind:'HWP_RECORD' as const,pageNumber:null,stream:'BodyText/Section0',recordOffset:i,recordLevel:0,paragraphIndex:i}}));
  const joined=blocks.map(b=>b.text).join('\n');return {schemaVersion:1,documentId:'sha256:'+'c'.repeat(64),sha256:'c'.repeat(64),mimeType:'application/x-hwp',parserVersion:'document-parser-v1',status:'PARSED',pages:null,blocks,tables:[],metadata:{},quality:{textBlockCount:blocks.length,tableCount:0,characterCount:[...joined].length,emptyBlockRatio:0,replacementCharacterCount:0,suspiciousEncoding:false,parserWarnings:[],extractionAllowed:true}};
}
