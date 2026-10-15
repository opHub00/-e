import { readFileSync, writeFileSync } from 'node:fs';

const sourcePath = process.argv[2] ?? '.cache/samdo-final-1-8/district1.json';
const previousPath = process.argv[3] ?? 'data/assessment-rules/samdo-2026-v1.7.json';
const outputPath = process.argv[4] ?? 'data/assessment-rules/samdo-2026-v1.8.json';
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const pkg = JSON.parse(readFileSync(previousPath, 'utf8'));

const ANNOUNCEMENT_ID = '18f88d9e-b4a4-4cf1-97e1-8b1838e81a01';
const DOCUMENT_ID = '18f88d9e-b4a4-4cf1-97e1-8b1838e81d01';
const RULE_SET_ID = '18f88d9e-b4a4-4cf1-97e1-8b1838e81c01';
const HASH = '5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2';
const FILE = '(최종1.8)삼도이동 1지구 토지임대부 분양주택 입주자모집공고문.hwp';

if (source.sha256 !== HASH) throw new Error(`Unexpected final 1.8 source hash: ${source.sha256}`);

Object.assign(pkg.announcement, {
  id: ANNOUNCEMENT_ID,
  externalId: 'samdo-1-2026-final-1.8',
  housingManagementNumber: '2026000434',
  title: '삼도이동 1지구 토지임대부 분양주택',
  announcementDate: '2026-10-27',
});
Object.assign(pkg.document, {
  id: DOCUMENT_ID,
  storagePath: `2026/${ANNOUNCEMENT_ID}/${DOCUMENT_ID}/original.hwp`,
  fileName: FILE,
  versionLabel: '최종1.8',
  sha256: HASH,
});
Object.assign(pkg.ruleSet, {
  id: RULE_SET_ID,
  version: 'FINAL-1.8-user-source-1',
  effectiveDate: '2026-10-27',
});

const params = pkg.ruleSet.config.parameters;
Object.assign(params, {
  'source.managementNumberCandidates': '2026000434',
  'source.managementNumberMapping': 'CONFIRMED_IN_FINAL_1_8',
  'schedule.special': '2026-11-16',
  'schedule.generalFirst': '2026-11-17',
  'schedule.generalSecond': '2026-11-18',
  'schedule.winnerAnnouncement': '2026-11-24',
  'schedule.documentSubmissionStart': '2026-11-30',
  'schedule.documentSubmissionEnd': '2026-12-04',
  'schedule.contractStart': '2027-01-25',
  'schedule.contractEnd': '2027-01-29',
  'inventory.total': 32,
  'inventory.units49': 8,
  'inventory.units59': 24,
  'inventory.special': 26,
  'inventory.general': 6,
  'inventory.youth': 5,
  'inventory.newlywed': 5,
  'inventory.newborn': 11,
  'inventory.firstHome': 5,
  'asset.youth.parent.default': 1_035_000_000,
  'asset.household.oneRecentChild': 397_000_000,
  'warning.draft': '사용자가 제공한 최종1.8 HWP를 해시 검증해 전사했습니다. 공개 공식 URL 게시 여부는 별도 확인이 필요하며 혼인·출산·해외체류 특례는 증빙 확인이 필요합니다.',
});

const paragraph = index => {
  const item = source.paragraphs[index];
  if (!item) throw new Error(`Missing paragraph ${index}`);
  return { index, stream: item.stream, offset: item.offset };
};
const text = indexes => indexes.map(index => source.paragraphs[index]?.text).filter(Boolean).join('\n');

function anchors(rule) {
  const key = rule.ruleKey;
  if (key.endsWith('.adult')) return [249, 308];
  if (key.endsWith('.overseas')) return [196, 197, 788];
  if (key.endsWith('.exceptions') || key.endsWith('.childbirth')) return [224, 225, 231, 232, 1495, 1502, 1523, 1528];
  if (key.endsWith('.reWinning')) return [255, 256, 257, 2395, 2396];
  if (key.includes('assets') || key.includes('parentAssets')) return [906, 923, 924, 925, 926, 996, 997, 1000, 1001, 1004, 1005, 1008, 1009];
  if (rule.supplyType === 'youth') {
    if (key.includes('.PRIORITY') || key.includes('.GENERAL')) return [1584, 1592, 1606, 1620, 1634, 1642, 1655, 1669, 1683];
    if (key.endsWith('.restrictions') || key.endsWith('.specialHistory')) return [1702, 1703];
    return [1568, 1569, 1570, 1571, 1578, 1579];
  }
  if (rule.supplyType === 'newlywed') {
    if (key.endsWith('.restrictions') || key.endsWith('.specialHistory')) return [1956, 1957, 1961, 1962];
    if (key.includes('.PRIORITY') || key.includes('.GENERAL')) return [1827, 1830, 1877, 1944];
    return [1713, 1714, 1715, 1716, 1717, 1718];
  }
  if (rule.supplyType === 'firstHome') {
    if (key.endsWith('.restrictions') || key.endsWith('.specialHistory')) return [2062, 2063];
    if (key.includes('.PRIORITY') || key.includes('.GENERAL') || key.includes('.LOTTERY')) return [2045, 2048, 2051];
    return [1974, 1975, 1976, 1977, 1978, 1979];
  }
  return [308];
}

for (const rule of pkg.rules) {
  if (rule.ruleKey === 'youth.parentAssets') {
    rule.config.label = '부모 자산 1,035백만원 이하';
    rule.config.expression.value = 1_035_000_000;
  }
  if (rule.ruleKey === 'newlywed.adult' || rule.ruleKey === 'firstHome.adult') {
    rule.config.label = '만 19세 이상 또는 자녀 양육·형제자매 부양 미성년 세대주';
    rule.config.expression = {
      any: [
        { fact: 'age', op: 'gte', value: 19 },
        { fact: 'minorHouseholdHeadException', op: 'eq', value: true },
      ],
    };
    rule.config.documents = ['미성년 세대주 예외 해당 시 주민등록표 및 가족관계 증빙'];
    delete rule.config.onFailure;
  }
  const indexes = anchors(rule);
  rule.evidence.id = rule.evidence.id.replace('samdo.v17.', 'samdo.v18.');
  rule.evidence.documentId = DOCUMENT_ID;
  rule.evidence.source = `삼도이동 1지구 최종1.8 (SHA-256 ${HASH.slice(0, 12)}…)`;
  rule.evidence.label = rule.config.label;
  rule.evidence.textExcerpt = text(indexes);
  rule.evidence.locator = { parser: 'HWP5_RECORDS', sha256: HASH, paragraphs: indexes.map(paragraph) };
}

writeFileSync(outputPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`${outputPath}: ${pkg.rules.length} rules, source ${HASH}`);
