import type { DiscoveryListing } from '../discovery/types.ts';
import { readFileSync } from 'node:fs';
import {
  attachCompetitionStatus,
  buildCompetitionAiSummary,
  deriveListingCompetitionStatus,
  getCompetitionCacheTtlMs,
  getCompetitionIdentifier,
  isCompetitionApiPayload,
  isCompetitionCacheFresh,
  type CompetitionApiPayload,
} from './domain.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const listing = (status: DiscoveryListing['recruitmentStatus'] = 'closed'): DiscoveryListing => ({
  id: 'apt-1-2', sourceType: 'applyhome-apt',
  sourceIdentifiers: { houseManageNo: '1', pblancNo: '2' },
  complexName: '공식 테스트 공고', region: '서울', district: '중구', address: '서울 중구',
  latitude: null, longitude: null, announcementDate: '2026-08-01', recruitmentStatus: status,
  recruitmentStartDate: '2026-08-02', recruitmentEndDate: '2026-08-03',
  winnerAnnouncementDate: null, contractStartDate: null, contractEndDate: null,
  announcementUrl: null, homepageUrl: null, housingType: '아파트', supplyType: '민간분양',
  representativePrice: null, householdCount: 10,
  imagePlaceholder: { from: '#000', to: '#111', icon: 'apartment' },
  interestTags: [], checkpoints: [], isDemo: false,
});

const payload: CompetitionApiPayload = {
  schemaVersion: 1,
  identifier: { sourceType: 'apt', houseManageNo: '1', pblancNo: '2' },
  generalRows: [{
    operation: 'getAPTLttotPblancCmpet', houseManageNo: '1', pblancNo: '2', housingType: '084A',
    modelNo: '01', suppliedUnits: 20, applicants: 401, officialCompetitionRate: 20.05,
    officialCompetitionRateLabel: '20.05', rankCode: 1, residenceCode: '01', residenceName: '해당지역',
    remnantAnnouncementTypeCode: null,
  }],
  specialSupplyRows: [],
  source: {
    provider: '한국부동산원 청약Home', dataset: '청약접수 경쟁률 및 특별공급 신청현황',
    fetchedAt: '2026-09-08T12:00:00.000Z', cache: 'miss', partial: false,
  },
};

check(getCompetitionIdentifier(listing())?.houseManageNo === '1', '공식 identifier를 listing에서 직접 읽는다');
check(getCompetitionIdentifier({ ...listing(), sourceIdentifiers: undefined }) === null, '화면 id를 역파싱하지 않는다');
check(deriveListingCompetitionStatus('upcoming', 2) === 'not_started', '접수 전 row를 최종 경쟁률로 표시하지 않는다');
check(deriveListingCompetitionStatus('open', 2) === 'in_progress', '접수 중 row를 최종 경쟁률로 표시하지 않는다');
check(deriveListingCompetitionStatus('closed', 1) === 'available', '종료 후 공식 row만 available이다');
check(deriveListingCompetitionStatus('closed', 0) === 'not_available', '종료 후 무응답은 unavailable이다');
check(isCompetitionApiPayload(payload), '정상 Edge payload 계약 허용');
check(!isCompetitionApiPayload({ ...payload, generalRows: [{ probability: 80 }] }), 'malformed 공식 응답 거부');
check(attachCompetitionStatus(listing(), payload).status === 'available', 'listing 일정과 공식 row로 상태를 결합한다');
check(getCompetitionCacheTtlMs(1) === 600_000, '공식 row cache TTL 10분');
check(getCompetitionCacheTtlMs(0) === 300_000, '무응답 negative cache TTL 5분');
check(isCompetitionCacheFresh('2026-09-08T12:05:00.000Z', new Date('2026-09-08T12:00:00.000Z')), 'fresh cache hit');
check(!isCompetitionCacheFresh('2026-09-08T11:59:59.000Z', new Date('2026-09-08T12:00:00.000Z')), 'stale cache miss');
const ai = buildCompetitionAiSummary(attachCompetitionStatus(listing(), payload));
check(ai?.rows[0]?.rate === '20.05 : 1', 'AI에는 공식 경쟁률만 전달');
check(!JSON.stringify(ai).includes('apt-1-2'), 'AI competition payload에 내부 listing id 없음');
check(!JSON.stringify(ai).includes('profile'), 'AI competition payload에 profile 없음');
check(buildCompetitionAiSummary(attachCompetitionStatus(listing('open'), payload)) === null, '진행 중 수치를 AI 최종 결과로 보내지 않는다');

const migration = readFileSync(
  new URL('../../supabase/migrations/20260908125941_create_listing_competition_cache.sql', import.meta.url),
  'utf8',
).toLowerCase();
check(migration.includes('enable row level security'), 'competition cache RLS 활성화');
check(migration.includes('revoke all on table public.listing_competition_cache from anon, authenticated'), 'client cache 직접 접근 차단');
check(migration.includes('grant all on table public.listing_competition_cache to service_role'), 'Edge service role만 cache 접근');

console.log(`competition domain checks passed: ${checks}`);
