import ragData from '../../../data/event/samdo-dual-v2-rag.json' with { type: 'json' };
import type { SamdoDistrictId, SamdoRagChunk, SamdoRagIntent, SamdoRagRetrieval } from './types.ts';

const chunks = ragData.chunks as SamdoRagChunk[];

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');

export function classifySamdoRagIntent(question: string): SamdoRagIntent {
  const value = normalize(question);
  // "신청하면 좋은 공고" is a recommendation question, not an application date.
  if (/(언제|일정|접수|신청일|발표|계약|신청.*(날짜|기간)|청약.*(날짜|기간))/.test(value)) return 'SCHEDULE';
  if (/(분양가|분양가격|공급금액|가격)/.test(value)) return 'PRICE';
  if (/(토지임대료|월임대료|임대료)/.test(value)) return 'LAND_RENT';
  if (/(몇세대|공급세대|물량)/.test(value)) return 'SUPPLY_COUNT';
  if (/(신청가능|둘다신청|자격|소득|자산|청약통장|무주택)/.test(value)) return 'ELIGIBILITY';
  if (/(차이|비교|어느.*지구|둘다|둘다)/.test(value)) return 'COMPARISON';
  if (/(토지임대부|토지소유|건물소유)/.test(value)) return 'LAND_LEASE';
  if (/(해외|출국|체류)/.test(value)) return 'OVERSEAS';
  if (/(서류|준비|증빙)/.test(value)) return 'DOCUMENTS';
  if (/(가능해)/.test(value)) return 'ELIGIBILITY';
  return 'UNKNOWN';
}

export function detectSamdoDistricts(question: string): SamdoDistrictId[] {
  const value = normalize(question);
  const first = /(?:1지구|일지구|samdo-?1)/.test(value);
  const second = /(?:2지구|이지구|samdo-?2)/.test(value);
  if (first && !second) return ['samdo-1'];
  if (second && !first) return ['samdo-2'];
  return ['samdo-1', 'samdo-2'];
}

const intentKeywords: Record<SamdoRagIntent, string[]> = {
  COMPARISON: ['차이', '비교', '공급세대', '분양가격', '토지임대료'],
  ELIGIBILITY: ['신청자격', '무주택', '소득', '자산', '청약통장'],
  SCHEDULE: ['신청일', '특별공급', '일반공급', '당첨자발표', '계약'],
  PRICE: ['분양가격', '공급금액', '49㎡', '59㎡'],
  LAND_RENT: ['토지임대료', '월 임대료', '49㎡', '59㎡'],
  SUPPLY_COUNT: ['공급세대', '청년', '신혼부부', '신생아', '생애최초'],
  LAND_LEASE: ['토지임대부', '토지 소유권', '건물 소유권'],
  OVERSEAS: ['해외체류', '출국', '거주기간'],
  DOCUMENTS: ['준비서류', '제출서류', '등본', '초본'],
  UNKNOWN: [],
};

export function retrieveSamdoEvidence(question: string, maxChunks = 6): SamdoRagRetrieval {
  const intent = classifySamdoRagIntent(question);
  const districtIds = detectSamdoDistricts(question);
  const terms = [...intentKeywords[intent], ...question.split(/\s+/).filter(term => term.length >= 2)].map(normalize);
  const scored = chunks
    .filter(chunk => districtIds.includes(chunk.districtId))
    .map(chunk => {
      const searchable = normalize([chunk.section, ...chunk.keywords, chunk.textExcerpt].join(' '));
      const score = terms.reduce((sum, term) => sum + (term && searchable.includes(term) ? 2 : 0), 0)
        + (intent === 'UNKNOWN' ? 0 : chunk.keywords.some(keyword => intentKeywords[intent].includes(keyword)) ? 3 : 0);
      return { chunk, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, maxChunks)
    .map(item => item.chunk);
  return { intent, districtIds, chunks: scored };
}

export const samdoRagFingerprint = ragData.fingerprint;
