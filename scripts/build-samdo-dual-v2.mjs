import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourcePackagePath = resolve(root, 'data/assessment-rules/samdo-2026-v1.8.json');
const outputPackagePath = resolve(root, 'data/assessment-rules/samdo-2-2026-v1.8.json');
const outputRagPath = resolve(root, 'data/event/samdo-dual-v2-rag.json');
const district1Path = resolve(root, '.cache/samdo-dual-v2/district1.json');
const district2Path = resolve(root, '.cache/samdo-dual-v2/district2.json');

const sourcePackage = JSON.parse(readFileSync(sourcePackagePath, 'utf8'));
const district1 = JSON.parse(readFileSync(district1Path, 'utf8'));
const district2 = JSON.parse(readFileSync(district2Path, 'utf8'));
const paragraphs1 = district1.paragraphs;
const paragraphs2 = district2.paragraphs;

const DISTRICT_2 = {
  announcementId: '28f88d9e-b4a4-4cf1-97e1-8b1838e81a02',
  documentId: '28f88d9e-b4a4-4cf1-97e1-8b1838e81d02',
  ruleSetId: '28f88d9e-b4a4-4cf1-97e1-8b1838e81c02',
  fileName: '(최종1.8)삼도이동 2지구 토지임대부 분양주택 입주자모집공고문.hwp',
  sha256: '336c345354c6ab9085683ede9e8fde52f4be73969c5058c0a62602257289ab71',
  managementNumber: '2026000435',
};

function normalized(text) {
  return String(text ?? '').replace(/\s+/g, '').replace(/[·ㆍ]/g, '·');
}

function district2Text(text) {
  return String(text ?? '')
    .replaceAll('삼도이동 1지구', '삼도이동 2지구')
    .replaceAll('1지구', '2지구')
    .replaceAll('2026000434', '2026000435')
    .replaceAll('2026.11.24', '2026.11.25')
    .replaceAll('2026-11-24', '2026-11-25');
}

function findDistrict2Paragraph(index) {
  const original = paragraphs1[index];
  if (!original) throw new Error(`District 1 paragraph ${index} does not exist`);
  const target = normalized(district2Text(original.text));
  const candidates = paragraphs2
    .map((paragraph, candidateIndex) => ({ paragraph, candidateIndex }))
    .filter(({ paragraph }) => normalized(paragraph.text) === target);
  if (!candidates.length) throw new Error(`No district 2 paragraph for district 1 paragraph ${index}: ${original.text.slice(0, 120)}`);
  const nearest = candidates.sort((a, b) => Math.abs(a.candidateIndex - index) - Math.abs(b.candidateIndex - index))[0];
  return { index: nearest.candidateIndex, stream: nearest.paragraph.stream, offset: nearest.paragraph.offset };
}

function remapEvidence(evidence) {
  const paragraphs = Array.isArray(evidence.locator?.paragraphs)
    ? evidence.locator.paragraphs.map(item => findDistrict2Paragraph(item.index))
    : [];
  return {
    ...evidence,
    id: evidence.id.replace(/^samdo\.v18\./, 'samdo.v18.d2.'),
    documentId: DISTRICT_2.documentId,
    source: `삼도이동 2지구 최종1.8 (SHA-256 ${DISTRICT_2.sha256.slice(0, 12)}…)`,
    textExcerpt: district2Text(evidence.textExcerpt),
    locator: { ...evidence.locator, sha256: DISTRICT_2.sha256, paragraphs },
  };
}

const district2Package = structuredClone(sourcePackage);
district2Package.announcement = {
  ...district2Package.announcement,
  id: DISTRICT_2.announcementId,
  externalId: 'samdo-2-2026-final-1.8',
  housingManagementNumber: DISTRICT_2.managementNumber,
  title: '삼도이동 2지구 토지임대부 분양주택',
};
district2Package.document = {
  ...district2Package.document,
  id: DISTRICT_2.documentId,
  storagePath: `2026/${DISTRICT_2.announcementId}/${DISTRICT_2.documentId}/original.hwp`,
  fileName: DISTRICT_2.fileName,
  sha256: DISTRICT_2.sha256,
};
district2Package.ruleSet = {
  ...district2Package.ruleSet,
  id: DISTRICT_2.ruleSetId,
  config: structuredClone(district2Package.ruleSet.config),
};
Object.assign(district2Package.ruleSet.config.parameters, {
  'source.managementNumberCandidates': DISTRICT_2.managementNumber,
  'schedule.winnerAnnouncement': '2026-11-25',
  'inventory.total': 40,
  'inventory.units49': 8,
  'inventory.units59': 32,
  'inventory.special': 32,
  'inventory.general': 8,
  'inventory.youth': 6,
  'inventory.newlywed': 6,
  'inventory.newborn': 14,
  'inventory.firstHome': 6,
});
district2Package.rules = district2Package.rules.map(rule => ({ ...rule, evidence: remapEvidence(rule.evidence) }));

function locator(indices, document) {
  return {
    parser: 'HWP5_RECORDS',
    sha256: document.sha256,
    paragraphs: indices.map(index => {
      const paragraph = document.paragraphs[index];
      if (!paragraph) throw new Error(`Missing paragraph ${index}`);
      return { index, stream: paragraph.stream, offset: paragraph.offset };
    }),
  };
}

function chunk(districtId, document, spec) {
  const textExcerpt = spec.indices.map(index => document.paragraphs[index]?.text).filter(Boolean).join('\n');
  return {
    id: `${districtId}.${spec.id}`,
    districtId,
    section: spec.section,
    kind: spec.kind ?? 'paragraph',
    supplyTypes: spec.supplyTypes ?? [],
    keywords: spec.keywords,
    textExcerpt,
    locator: locator(spec.indices, document),
  };
}

const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);

const commonSpecs = [
  { id: 'land-lease', section: '토지임대부 분양주택 안내', indices: [744, 745, 746], keywords: ['토지임대부', '토지 소유권', '건물 소유권', '임대료'] },
  { id: 'overseas', section: '거주기간 및 해외체류', indices: [196, 197], keywords: ['해외체류', '출국', '거주기간', '우선공급'] },
  { id: 'youth-eligibility', section: '청년 특별공급 신청자격', indices: [1568, 1569, 1570, 1578, 1579], supplyTypes: ['YOUTH'], keywords: ['청년', '미혼', '무주택', '청약통장', '소득'] },
  { id: 'newlywed-eligibility', section: '신혼부부 특별공급 신청자격', indices: [1713, 1714, 1715, 1716, 1717, 1718], supplyTypes: ['NEWLYWED'], keywords: ['신혼부부', '예비신혼', '한부모', '혼인', '청약통장'] },
  { id: 'first-home-eligibility', section: '생애최초 특별공급 신청자격', indices: [1974, 1975, 1976, 1977, 1978, 1979], supplyTypes: ['FIRST_HOME'], keywords: ['생애최초', '주택소유', '600만원', '소득세', '세대주'] },
  { id: 'newborn-eligibility', section: '신생아 특별공급 신청자격', indices: [2080, 2081, 2082, 2083, 2084], supplyTypes: ['NEWBORN'], keywords: ['신생아', '2세 미만', '태아', '입양', '무주택'] },
  { id: 'general-eligibility', section: '일반공급 신청자격', indices: [2269, 2270, 2271, 2272], supplyTypes: ['GENERAL'], keywords: ['일반공급', '무주택세대구성원', '1순위', '2순위'] },
  { id: 'documents', section: '신청서류 및 당첨자 제출서류', indices: [2693, 2694, 2695, 2696, 2929, 2930, 2931], keywords: ['준비서류', '제출서류', '등본', '초본', '청약통장', '소득', '자산'] },
];

const perDistrictSpecs = {
  'samdo-1': [
    { id: 'overview', section: '공급개요', indices: [9, 10], keywords: ['1지구', '위치', '총 32세대', '49㎡', '59㎡'] },
    { id: 'schedule', section: '공급일정', indices: [329, 338, 339, 340, 341, 342, 343, 344, 345], kind: 'table', keywords: ['신청일', '특별공급', '일반공급', '당첨자발표', '서류접수', '계약'] },
    { id: 'inventory', section: '공급대상 및 공급세대수', indices: range(380, 489), kind: 'table', keywords: ['공급세대', '청년', '신혼부부', '신생아', '생애최초', '일반공급'] },
    { id: 'price-49', section: '49㎡ 분양가격', indices: range(499, 554), kind: 'table', keywords: ['49㎡', '분양가격', '공급금액'] },
    { id: 'price-59', section: '59㎡ 분양가격', indices: range(555, 590), kind: 'table', keywords: ['59㎡', '분양가격', '공급금액'] },
    { id: 'rent', section: '월 토지임대료', indices: [734, 735, 736, 737, 738, 739, 740, 741, 742, 743], kind: 'table', keywords: ['토지임대료', '49㎡', '59㎡', '월 임대료'] },
  ],
  'samdo-2': [
    { id: 'overview', section: '공급개요', indices: [9, 10], keywords: ['2지구', '위치', '총 40세대', '49㎡', '59㎡'] },
    { id: 'schedule', section: '공급일정', indices: [329, 338, 339, 340, 341, 342, 343, 344, 345], kind: 'table', keywords: ['신청일', '특별공급', '일반공급', '당첨자발표', '서류접수', '계약'] },
    { id: 'inventory', section: '공급대상 및 공급세대수', indices: range(380, 489), kind: 'table', keywords: ['공급세대', '청년', '신혼부부', '신생아', '생애최초', '일반공급'] },
    { id: 'price-49', section: '49㎡ 분양가격', indices: range(499, 555), kind: 'table', keywords: ['49㎡', '분양가격', '공급금액'] },
    { id: 'price-59', section: '59㎡ 분양가격', indices: range(556, 591), kind: 'table', keywords: ['59㎡', '분양가격', '공급금액'] },
    { id: 'rent', section: '월 토지임대료', indices: [735, 736, 737, 738, 739, 740, 741, 742, 743, 744], kind: 'table', keywords: ['토지임대료', '49㎡', '59㎡', '월 임대료'] },
  ],
};

function shiftedSpecs(specs, delta) {
  return specs.map(spec => ({ ...spec, indices: spec.indices.map(index => index >= 744 ? index + delta : index) }));
}

const documents = [
  { districtId: 'samdo-1', title: '삼도이동 1지구 토지임대부 분양주택', managementNumber: '2026000434', fileName: district1.fileName, sha256: district1.sha256 },
  { districtId: 'samdo-2', title: '삼도이동 2지구 토지임대부 분양주택', managementNumber: '2026000435', fileName: district2.fileName, sha256: district2.sha256 },
];
const chunks = [
  ...[...perDistrictSpecs['samdo-1'], ...commonSpecs].map(spec => chunk('samdo-1', district1, spec)),
  ...[...perDistrictSpecs['samdo-2'], ...shiftedSpecs(commonSpecs, 1)].map(spec => chunk('samdo-2', district2, spec)),
];
const rag = { schemaVersion: 1, generatedFrom: documents, chunks };
rag.fingerprint = createHash('sha256').update(JSON.stringify(rag)).digest('hex');

mkdirSync(dirname(outputPackagePath), { recursive: true });
mkdirSync(dirname(outputRagPath), { recursive: true });
writeFileSync(outputPackagePath, `${JSON.stringify(district2Package, null, 2)}\n`);
writeFileSync(outputRagPath, `${JSON.stringify(rag, null, 2)}\n`);
console.log(JSON.stringify({ package: outputPackagePath, rag: outputRagPath, rules: district2Package.rules.length, chunks: chunks.length, fingerprint: rag.fingerprint }, null, 2));
