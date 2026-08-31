export const DISCOVERY_REGIONS = [
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;

export type DiscoveryRegion = (typeof DISCOVERY_REGIONS)[number];

const REGION_ALIASES: ReadonlyArray<readonly [DiscoveryRegion, readonly string[]]> = [
  ['서울', ['서울특별시', '서울']],
  ['부산', ['부산광역시', '부산']],
  ['대구', ['대구광역시', '대구']],
  ['인천', ['인천광역시', '인천']],
  ['광주', ['광주광역시', '광주']],
  ['대전', ['대전광역시', '대전']],
  ['울산', ['울산광역시', '울산']],
  ['세종', ['세종특별자치시', '세종']],
  ['경기', ['경기도', '경기']],
  ['강원', ['강원특별자치도', '강원도', '강원']],
  ['충북', ['충청북도', '충북']],
  ['충남', ['충청남도', '충남']],
  ['전북', ['전북특별자치도', '전라북도', '전북']],
  ['전남', ['전라남도', '전남']],
  ['경북', ['경상북도', '경북']],
  ['경남', ['경상남도', '경남']],
  ['제주', ['제주특별자치도', '제주도', '제주']],
];

export function normalizeDiscoveryRegion(value: unknown): DiscoveryRegion | null {
  const text = value === null || value === undefined
    ? ''
    : String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  for (const [region, aliases] of REGION_ALIASES) {
    if (aliases.some((alias) => text.includes(alias))) return region;
  }
  return null;
}

export function normalizeDiscoveryRegions(values: readonly unknown[]): DiscoveryRegion[] {
  const selected = new Set<DiscoveryRegion>();
  values.forEach((value) => {
    const region = normalizeDiscoveryRegion(value);
    if (region) selected.add(region);
  });
  return DISCOVERY_REGIONS.filter((region) => selected.has(region));
}
