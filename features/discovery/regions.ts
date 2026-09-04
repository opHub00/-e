export const REGION_DEFINITIONS = [
  { discovery: '서울', profile: '서울특별시', aliases: ['서울특별시', '서울'] },
  { discovery: '부산', profile: '부산광역시', aliases: ['부산광역시', '부산'] },
  { discovery: '대구', profile: '대구광역시', aliases: ['대구광역시', '대구'] },
  { discovery: '인천', profile: '인천광역시', aliases: ['인천광역시', '인천'] },
  { discovery: '광주', profile: '광주광역시', aliases: ['광주광역시', '광주'] },
  { discovery: '대전', profile: '대전광역시', aliases: ['대전광역시', '대전'] },
  { discovery: '울산', profile: '울산광역시', aliases: ['울산광역시', '울산'] },
  { discovery: '세종', profile: '세종특별자치시', aliases: ['세종특별자치시', '세종'] },
  { discovery: '경기', profile: '경기도', aliases: ['경기도', '경기'] },
  { discovery: '강원', profile: '강원특별자치도', aliases: ['강원특별자치도', '강원도', '강원'] },
  { discovery: '충북', profile: '충청북도', aliases: ['충청북도', '충북'] },
  { discovery: '충남', profile: '충청남도', aliases: ['충청남도', '충남'] },
  { discovery: '전북', profile: '전북특별자치도', aliases: ['전북특별자치도', '전라북도', '전북'] },
  { discovery: '전남', profile: '전라남도', aliases: ['전라남도', '전남'] },
  { discovery: '경북', profile: '경상북도', aliases: ['경상북도', '경북'] },
  { discovery: '경남', profile: '경상남도', aliases: ['경상남도', '경남'] },
  { discovery: '제주', profile: '제주특별자치도', aliases: ['제주특별자치도', '제주도', '제주'] },
] as const;

export const DISCOVERY_REGIONS = REGION_DEFINITIONS.map((region) => region.discovery);
export const PROFILE_REGIONS = REGION_DEFINITIONS.map((region) => region.profile);

export type DiscoveryRegion = (typeof DISCOVERY_REGIONS)[number];

export function normalizeDiscoveryRegion(value: unknown): DiscoveryRegion | null {
  const text = value === null || value === undefined
    ? ''
    : String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  for (const region of REGION_DEFINITIONS) {
    if (region.aliases.some((alias) => text.includes(alias))) return region.discovery;
  }
  return null;
}

export function getRegionLabel(value: unknown): string {
  return normalizeDiscoveryRegion(value) ?? String(value ?? '').trim();
}

export function normalizeDiscoveryRegions(values: readonly unknown[]): DiscoveryRegion[] {
  const selected = new Set<DiscoveryRegion>();
  values.forEach((value) => {
    const region = normalizeDiscoveryRegion(value);
    if (region) selected.add(region);
  });
  return DISCOVERY_REGIONS.filter((region) => selected.has(region));
}
