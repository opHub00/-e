import type {
  DiscoveryRegion,
  HousingType,
  Listing,
  ListingImagePlaceholder,
  ListingInterestTag,
  ListingGeocodeStatus,
  ListingSourceType,
  RecruitmentStatus,
  SupplyType,
} from '../types.ts';
import { DISCOVERY_REGIONS, normalizeDiscoveryRegion } from '../regions.ts';
import type {
  ListingDataSource,
  ListingValidationIssue,
  RawListingRecord,
} from './ListingProvider.ts';

const IMAGE_PALETTES: ListingImagePlaceholder[] = [
  { from: '#6558C8', to: '#393091', icon: 'apartment' },
  { from: '#3E8B75', to: '#256151', icon: 'holiday-village' },
  { from: '#547AA9', to: '#324F77', icon: 'location-city' },
  { from: '#F39A62', to: '#B85B35', icon: 'domain' },
];

const INTEREST_TAGS = new Set<ListingInterestTag>([
  '청년 관심',
  '무주택 관심',
  '첫 청약 관심',
  '직장인 관심',
  '통장 유지 관심',
  '수도권 관심',
]);

const IMAGE_ICONS = new Set<ListingImagePlaceholder['icon']>([
  'apartment',
  'location-city',
  'holiday-village',
  'domain',
]);

const DEFAULT_CHECKPOINTS = [
  '공식 모집공고의 신청 조건',
  '모집 일정과 접수 방법',
  '계약 및 입주 관련 유의사항',
];

type NormalizationContext = {
  source: ListingDataSource;
  fetchedAt: string;
  referenceDate?: Date;
  recordIndex?: number;
};

export type NormalizedListingRecord = {
  listing: Listing | null;
  issues: ListingValidationIssue[];
};

export type NormalizedListingBatch = {
  listings: Listing[];
  issues: ListingValidationIssue[];
};

type StatusCalculationInput = {
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
  referenceDate: Date;
  rawStatus?: unknown;
};

export function calculateRecruitmentStatus({
  recruitmentStartDate,
  recruitmentEndDate,
  referenceDate,
  rawStatus,
}: StatusCalculationInput): RecruitmentStatus {
  const today = formatKoreanDate(referenceDate);

  if (
    recruitmentStartDate &&
    recruitmentEndDate &&
    recruitmentStartDate > recruitmentEndDate
  ) return 'unknown';
  if (recruitmentStartDate && today < recruitmentStartDate) return 'upcoming';
  if (recruitmentEndDate && today > recruitmentEndDate) return 'closed';
  if (recruitmentStartDate && recruitmentEndDate) return 'open';

  return normalizeRawStatus(rawStatus) ?? 'unknown';
}

export function formatKoreanDate(value: Date): string {
  const shifted = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function normalizeListingDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-./년\s]?(\d{1,2})[-./월\s]?(\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

export function normalizeListingUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeListingRecord(
  input: unknown,
  context: NormalizationContext,
): NormalizedListingRecord {
  const recordIndex = context.recordIndex ?? 0;
  const issues: ListingValidationIssue[] = [];
  const addIssue = (
    field: string,
    code: ListingValidationIssue['code'],
    severity: ListingValidationIssue['severity'],
    message: string,
  ) => issues.push({ recordIndex, field, code, severity, message });

  if (!isRecord(input)) {
    addIssue('record', 'invalid-record', 'error', '객체 형식의 공고가 아니어서 제외했습니다.');
    return { listing: null, issues };
  }

  const name = readString(input, [
    'complexName',
    'HOUSE_NM',
    'houseNm',
    'house_name',
    '공고명',
    '주택명',
  ]);
  const address = readString(input, [
    'address',
    'HSSPLY_ADRES',
    'hssplyAdres',
    'FULL_ADDRESS',
    '주소',
  ]);
  const region = normalizeRegion(
    readValue(input, ['region', 'SUBSCRPT_AREA_CODE_NM', 'sido', '시도명']) ?? address,
  );

  if (!region) {
    addIssue('region', 'unsupported-region', 'warning', '국내 시도 지역을 확인할 수 없어 제외했습니다.');
    return { listing: null, issues };
  }

  const fetchedDate = normalizeListingDate(context.fetchedAt) ?? formatKoreanDate(new Date());
  const announcementDate = readDate(
    input,
    ['announcementDate', 'RCRIT_PBLANC_DE', '공고일'],
    'announcementDate',
    addIssue,
  );
  const startDate = readDate(
    input,
    [
      'recruitmentStartDate',
      'SUBSCRPT_RCEPT_BGNDE',
      'RCEPT_BGNDE',
      'receiptStartDate',
      '접수시작일',
    ],
    'recruitmentStartDate',
    addIssue,
  );
  const endDate = readDate(
    input,
    [
      'recruitmentEndDate',
      'SUBSCRPT_RCEPT_ENDDE',
      'RCEPT_ENDDE',
      'receiptEndDate',
      '접수종료일',
    ],
    'recruitmentEndDate',
    addIssue,
  );
  if (startDate && endDate && startDate > endDate) {
    addIssue('recruitmentEndDate', 'invalid-value', 'warning', '종료일이 시작일보다 빨라 일정 상태를 확정하지 않았습니다.');
  }

  const sourceType = normalizeSourceType(input, context.source);
  const providerIdPrefix = sourceType === 'applyhome-apt'
    ? 'apt'
    : sourceType === 'applyhome-remnant'
      ? 'remndr'
      : '';
  const idSeed = [
    providerIdPrefix,
    readString(input, ['id', 'HOUSE_MANAGE_NO', 'houseManageNo']),
    readString(input, ['PBLANC_NO', 'pblancNo', 'announcementNumber']),
  ]
    .filter(Boolean)
    .join('-');
  const safeName = name || '공고명 확인 필요';
  const safeAddress = address || `${region} 상세 주소 확인 필요`;
  if (!name) addIssue('complexName', 'missing-value', 'warning', '공고명이 없어 대체 문구를 사용했습니다.');
  if (!address) addIssue('address', 'missing-value', 'warning', '주소가 없어 대체 문구를 사용했습니다.');

  const latitude = normalizeCoordinate(
    readValue(input, ['latitude', 'LATITUDE', 'lat', '위도']),
    -90,
    90,
  );
  const longitude = normalizeCoordinate(
    readValue(input, ['longitude', 'LONGITUDE', 'lng', 'lon', '경도']),
    -180,
    180,
  );
  if (latitude === null) addIssue('latitude', 'missing-value', 'warning', '위도가 없어 지도 핀에서 제외됩니다.');
  if (longitude === null) addIssue('longitude', 'missing-value', 'warning', '경도가 없어 지도 핀에서 제외됩니다.');

  const interestTags = normalizeInterestTags(
    readValue(input, ['interestTags', 'interest_tags', '관련조건태그']),
  );
  const checkpoints = normalizeStringList(
    readValue(input, ['checkpoints', 'CHECKPOINTS', '확인조건']),
  );
  const placeholder = normalizeImagePlaceholder(readValue(input, ['imagePlaceholder']), idSeed || safeName);
  const referenceDate = isValidDate(context.referenceDate)
    ? context.referenceDate
    : new Date(context.fetchedAt);
  const safeReferenceDate = isValidDate(referenceDate) ? referenceDate : new Date(`${fetchedDate}T00:00:00.000Z`);

  const listing: Listing = {
    id: normalizeId(idSeed || `${safeName}-${safeAddress}-${startDate}`),
    sourceType,
    complexName: safeName,
    region,
    district:
      readString(input, ['district', 'SIGUNGU_NM', 'sigungu', '시군구명']) ||
      inferDistrict(safeAddress, region),
    address: safeAddress,
    latitude,
    longitude,
    coordinateSource:
      latitude !== null && longitude !== null && readString(input, ['__coordinateSource']) === 'kakao'
        ? 'kakao'
        : undefined,
    geocodeStatus: normalizeGeocodeStatus(readValue(input, ['__geocodeStatus'])),
    geocodeMatchedAddress: readString(input, ['__geocodeMatchedAddress']) || undefined,
    announcementDate,
    recruitmentStatus: calculateRecruitmentStatus({
      recruitmentStartDate: startDate,
      recruitmentEndDate: endDate,
      referenceDate: safeReferenceDate,
      rawStatus: readValue(input, ['recruitmentStatus', 'STATUS_NM', 'status', '모집상태']),
    }),
    recruitmentStartDate: startDate,
    recruitmentEndDate: endDate,
    winnerAnnouncementDate: readDate(
      input,
      ['winnerAnnouncementDate', 'PRZWNER_PRESNATN_DE'],
      'winnerAnnouncementDate',
      addIssue,
    ),
    contractStartDate: readDate(
      input,
      ['contractStartDate', 'CNTRCT_CNCLS_BGNDE'],
      'contractStartDate',
      addIssue,
    ),
    contractEndDate: readDate(
      input,
      ['contractEndDate', 'CNTRCT_CNCLS_ENDDE'],
      'contractEndDate',
      addIssue,
    ),
    announcementUrl: readUrl(
      input,
      ['announcementUrl', 'PBLANC_URL'],
      'announcementUrl',
      addIssue,
    ),
    homepageUrl: readUrl(
      input,
      ['homepageUrl', 'HMPG_ADRES'],
      'homepageUrl',
      addIssue,
    ),
    housingType: normalizeHousingType(
      readValue(input, ['housingType', 'HOUSE_SECD_NM', 'houseType', '주택유형']),
    ),
    supplyType: normalizeSupplyType(
      readValue(input, ['supplyType', 'HOUSE_DTL_SECD_NM', 'supplyTypeName', '공급유형']),
    ),
    representativePrice: normalizeNonNegativeNumberOrNull(
      readValue(input, ['representativePrice', 'LTTOT_TOP_AMOUNT', 'MAX_PRICE', '대표가격']),
    ),
    householdCount: roundOrNull(normalizeNonNegativeNumberOrNull(
      readValue(input, ['householdCount', 'TOT_SUPLY_HSHLDCO', 'TOTAL_HOUSEHOLDS', '세대수']),
    )),
    imagePlaceholder: placeholder,
    interestTags,
    checkpoints: checkpoints.length > 0 ? checkpoints.slice(0, 5) : [...DEFAULT_CHECKPOINTS],
    isDemo: context.source.kind === 'mock' || context.source.kind === 'fixture',
  };

  const validationErrors = validateListing(listing, recordIndex);
  if (validationErrors.some((issue) => issue.severity === 'error')) {
    return { listing: null, issues: [...issues, ...validationErrors] };
  }

  return { listing, issues: [...issues, ...validationErrors] };
}

export function normalizeListingBatch(
  records: unknown,
  context: Omit<NormalizationContext, 'recordIndex'>,
): NormalizedListingBatch {
  if (!Array.isArray(records)) {
    return {
      listings: [],
      issues: [
        {
          recordIndex: -1,
          field: 'records',
          code: 'invalid-record',
          severity: 'error',
          message: '공고 목록이 배열이 아니어서 사용할 수 없습니다.',
        },
      ],
    };
  }

  const listings: Listing[] = [];
  const issues: ListingValidationIssue[] = [];
  const seenIds = new Set<string>();

  records.forEach((record, recordIndex) => {
    const normalized = normalizeListingRecord(record, { ...context, recordIndex });
    issues.push(...normalized.issues);
    if (!normalized.listing) return;
    if (seenIds.has(normalized.listing.id)) {
      issues.push({
        recordIndex,
        field: 'id',
        code: 'duplicate-id',
        severity: 'warning',
        message: `중복 공고 ${normalized.listing.id}를 제외했습니다.`,
      });
      return;
    }
    seenIds.add(normalized.listing.id);
    listings.push(normalized.listing);
  });

  return { listings, issues };
}

export function validateListing(listing: unknown, recordIndex = 0): ListingValidationIssue[] {
  const issues: ListingValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ recordIndex, field, code: 'invalid-value', severity: 'error', message } as const);

  if (!isRecord(listing)) {
    return [{ recordIndex, field: 'record', code: 'invalid-record', severity: 'error', message: '공고 객체가 아닙니다.' }];
  }
  if (!readString(listing, ['id'])) error('id', 'id가 필요합니다.');
  if (!readString(listing, ['complexName'])) error('complexName', '공고명이 필요합니다.');
  if (!DISCOVERY_REGIONS.includes(listing.region as DiscoveryRegion)) error('region', '지원하지 않는 지역입니다.');
  if (listing.latitude !== null && (!Number.isFinite(listing.latitude) || Number(listing.latitude) < -90 || Number(listing.latitude) > 90)) {
    error('latitude', '유효한 위도가 필요합니다.');
  }
  if (listing.longitude !== null && (!Number.isFinite(listing.longitude) || Number(listing.longitude) < -180 || Number(listing.longitude) > 180)) {
    error('longitude', '유효한 경도가 필요합니다.');
  }
  if (listing.recruitmentStartDate !== null && !normalizeListingDate(listing.recruitmentStartDate)) error('recruitmentStartDate', '유효한 시작일이 필요합니다.');
  if (listing.recruitmentEndDate !== null && !normalizeListingDate(listing.recruitmentEndDate)) error('recruitmentEndDate', '유효한 종료일이 필요합니다.');
  if (!['open', 'upcoming', 'closed', 'unknown'].includes(String(listing.recruitmentStatus))) {
    error('recruitmentStatus', '유효한 모집 상태가 필요합니다.');
  }
  if (!isRecord(listing.imagePlaceholder)) error('imagePlaceholder', '이미지 placeholder가 필요합니다.');
  if (!Array.isArray(listing.interestTags)) error('interestTags', '관심 태그 배열이 필요합니다.');
  if (!Array.isArray(listing.checkpoints)) error('checkpoints', '확인 조건 배열이 필요합니다.');

  return issues;
}

type AddIssue = (
  field: string,
  code: ListingValidationIssue['code'],
  severity: ListingValidationIssue['severity'],
  message: string,
) => void;

function readDate(
  record: RawListingRecord,
  aliases: readonly string[],
  field: string,
  addIssue: AddIssue,
): string | null {
  const raw = readValue(record, aliases);
  const normalized = normalizeListingDate(raw);
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    addIssue(field, 'missing-value', 'warning', `${field} 값이 없습니다.`);
  } else if (!normalized) {
    addIssue(field, 'invalid-value', 'warning', `${field} 날짜 형식을 확인할 수 없습니다.`);
  }
  return normalized;
}

function readUrl(
  record: RawListingRecord,
  aliases: readonly string[],
  field: string,
  addIssue: AddIssue,
): string | null {
  const raw = readValue(record, aliases);
  const normalized = normalizeListingUrl(raw);
  if (raw !== null && raw !== undefined && String(raw).trim() !== '' && !normalized) {
    addIssue(field, 'invalid-value', 'warning', `${field} URL을 사용할 수 없습니다.`);
  }
  return normalized;
}

function normalizeSourceType(
  record: RawListingRecord,
  source: ListingDataSource,
): ListingSourceType {
  const operation = readString(record, ['__applyHomeOperation', 'applyHomeOperation']);
  if (operation === 'getAPTLttotPblancDetail') return 'applyhome-apt';
  if (operation === 'getRemndrLttotPblancDetail') return 'applyhome-remnant';
  if (source.kind === 'mock' || source.kind === 'fixture') return 'mock';
  return 'openapi';
}

function readValue(record: RawListingRecord, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (alias in record) return record[alias];
  }
  const lowercaseEntries = new Map(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const alias of aliases) {
    const value = lowercaseEntries.get(alias.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function readString(record: RawListingRecord, aliases: readonly string[]): string {
  const value = readValue(record, aliases);
  return value === null || value === undefined ? '' : String(value).trim();
}

function isRecord(value: unknown): value is RawListingRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizeRegion(value: unknown): DiscoveryRegion | null {
  return normalizeDiscoveryRegion(value);
}

function inferDistrict(address: string, region: DiscoveryRegion): string {
  const tokens = address.normalize('NFKC').trim().split(/\s+/);
  if (normalizeDiscoveryRegion(tokens[0]) === region) tokens.shift();
  return tokens[0] || `${region} 지역`;
}

function normalizeCoordinate(value: unknown, min: number, max: number): number | null {
  const number = normalizeNumber(value);
  return number !== null && number >= min && number <= max ? number : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeNonNegativeNumberOrNull(value: unknown): number | null {
  const number = normalizeNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function normalizeRawStatus(value: unknown): RecruitmentStatus | null {
  const text = value === null || value === undefined ? '' : String(value).trim().toLowerCase();
  if (['open', '모집중', '접수중', '진행중'].includes(text)) return 'open';
  if (['upcoming', '모집예정', '접수예정', '예정'].includes(text)) return 'upcoming';
  if (['closed', '모집종료', '접수종료', '마감', '종료'].includes(text)) return 'closed';
  return null;
}

function normalizeGeocodeStatus(value: unknown): ListingGeocodeStatus | undefined {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return ['resolved', 'not_found', 'ambiguous', 'provider_error'].includes(text)
    ? text as ListingGeocodeStatus
    : undefined;
}

function normalizeHousingType(value: unknown): HousingType {
  const text = value === null || value === undefined ? '' : String(value).trim().toLowerCase();
  if (text.includes('오피스텔')) return '오피스텔';
  if (text.includes('도시형')) return '도시형생활주택';
  if (text.includes('apt') || text.includes('아파트')) return '아파트';
  return '기타';
}

function normalizeSupplyType(value: unknown): SupplyType {
  const text = value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (text.includes('공공지원') && text.includes('민간임대')) return '공공지원 민간임대';
  if (text.includes('공공') || text.includes('국민')) return '공공분양';
  if (text.includes('민간') || text.includes('민영')) return '민간분양';
  if (text.includes('일반')) return '일반공급';
  return '기타';
}

function normalizeStringList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,|]/)
      : [];
  return values
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

function normalizeInterestTags(value: unknown): ListingInterestTag[] {
  return normalizeStringList(value).filter((tag): tag is ListingInterestTag =>
    INTEREST_TAGS.has(tag as ListingInterestTag),
  );
}

function normalizeImagePlaceholder(value: unknown, seed: string): ListingImagePlaceholder {
  if (isRecord(value)) {
    const from = readString(value, ['from']);
    const to = readString(value, ['to']);
    const icon = readString(value, ['icon']) as ListingImagePlaceholder['icon'];
    if (isColor(from) && isColor(to) && IMAGE_ICONS.has(icon)) return { from, to, icon };
  }
  return IMAGE_PALETTES[stableHash(seed) % IMAGE_PALETTES.length];
}

function isColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeId(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  return slug || `listing-${stableHash(value).toString(36)}`;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
