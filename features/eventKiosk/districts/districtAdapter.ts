import type { SamdoRecommendationItem } from '../samdo/types.ts';
import { SAMDO_DISTRICTS } from '../samdoDual/config.ts';
import type { SamdoDistrictAssessment, SamdoDualAssessment } from '../samdoDual/types.ts';
import type { DistrictAssessment, DistrictCardModel, DistrictComparisonModel, DistrictId, DistrictPriceTier } from './districtContract.ts';
import { DISTRICT_LAYOUT_SAMPLE } from './districtSource.ts';

export const DISTRICT_PROGRAM_TITLE = '삼도이동 토지임대부 분양주택 1·2지구';

const uiId = (id: 'samdo-1' | 'samdo-2'): DistrictId => id === 'samdo-1' ? 'D1' : 'D2';

function itemAssessment(item: SamdoRecommendationItem | null): DistrictAssessment {
  if (!item) return { status: 'READY', recommendedSupply: null, eligibility: 'INELIGIBLE', priorityStage: null, officialScore: { status: 'NOT_APPLICABLE' }, supplyCount: null };
  const score = item.officialScore;
  return {
    status: 'READY',
    recommendedSupply: item.supplyLabel,
    eligibility: item.eligibility,
    priorityStage: item.stageLabel,
    officialScore: score.status === 'AVAILABLE' ? { status: 'AVAILABLE', total: score.total, max: score.max } : { status: score.status },
    supplyCount: item.supplyCount,
    notes: [...item.matchedAdvantages, ...item.cautions].slice(0, 2),
  };
}

function districtAssessment(value: SamdoDistrictAssessment | undefined): DistrictAssessment {
  if (!value) return { status: 'PENDING', reason: '정보를 입력하면 이 지구의 신청유형을 판정해 드려요.' };
  return itemAssessment(value.recommendation.recommendedType ?? value.recommendation.alternatives[0] ?? value.recommendation.lowerPriorityTypes[0] ?? null);
}

function card(id: 'samdo-1' | 'samdo-2', dual: SamdoDualAssessment | null): DistrictCardModel {
  const district = SAMDO_DISTRICTS[id];
  const assessed = dual?.districts.find(item => item.district.id === id);
  const unit49 = district.units.find(item => item.unitType === '49A')!;
  const unit59 = district.units.find(item => item.unitType === '59A')!;
  return {
    id: uiId(id),
    label: id === 'samdo-1' ? '1지구' : '2지구',
    title: district.title,
    managementNumber: district.managementNumber,
    location: district.location,
    inventory: {
      total: district.inventory.total,
      special: district.inventory.special,
      general: district.inventory.general,
      units49: unit49.supplyCount,
      units59: unit59.supplyCount,
    },
    costs: {
      salePrices49: unit49.prices.map(({ floor, priceKrw }): DistrictPriceTier => ({ floor, priceKrw })),
      salePrices59: unit59.prices.map(({ floor, priceKrw }): DistrictPriceTier => ({ floor, priceKrw })),
      monthlyLandRent49: unit49.monthlyLandRentKrw,
      monthlyLandRent59: unit59.monthlyLandRentKrw,
    },
    schedule: {
      special: district.schedule.special,
      generalFirst: district.schedule.generalFirst,
      generalSecond: district.schedule.generalSecond,
      winnerAnnouncement: district.schedule.winnerAnnouncement,
    },
    assessment: districtAssessment(assessed),
    source: { status: 'FINAL_USER_SOURCE', label: '최종1.8 공고', sha256: district.document.sha256 },
  };
}

function applyLayoutSample(cardValue: DistrictCardModel, enabled: boolean): DistrictCardModel {
  if (!enabled) return cardValue;
  const sample = DISTRICT_LAYOUT_SAMPLE.find(item => item.id === cardValue.id);
  if (!sample) return cardValue;
  return {
    ...cardValue,
    ...sample,
    costs: sample.costs ?? cardValue.costs,
    schedule: sample.schedule ?? cardValue.schedule,
    assessment: sample.assessment ?? cardValue.assessment,
    source: sample.source ?? cardValue.source,
  };
}

export function buildDistrictComparison(input: { dual: SamdoDualAssessment | null; layoutSample?: boolean }): DistrictComparisonModel {
  const cards = (['samdo-1', 'samdo-2'] as const).map(id => applyLayoutSample(card(id, input.dual), input.layoutSample === true));
  return { title: DISTRICT_PROGRAM_TITLE, cards, sample: cards.some(item => item.source.status === 'LAYOUT_SAMPLE') };
}

/** 2026-11-16 → '11월 16일(월)' (short) / '2026년 11월 16일' (long). */
export function formatDistrictDate(iso: string | null, style: 'short' | 'long' = 'short'): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (style === 'long') return `${year}년 ${month}월 ${day}일`;
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}월 ${day}일(${weekday})`;
}

export function formatPrice(won: number | null): string | null {
  if (won === null || !Number.isFinite(won)) return null;
  const man = Math.round(won / 10_000);
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (!eok) return `${rest.toLocaleString('ko-KR')}만원`;
  return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
}

export function formatPriceTiers(tiers: readonly DistrictPriceTier[]): string {
  return tiers.map(item => `${item.floor} ${formatPrice(item.priceKrw)}`).join('\n');
}

export function formatMonthly(won: number | null): string | null {
  if (won === null || !Number.isFinite(won)) return null;
  return `월 ${Math.round(won).toLocaleString('ko-KR')}원`;
}

export const ELIGIBILITY_TEXT: Record<'ELIGIBLE' | 'EVIDENCE_REQUIRED' | 'CONDITIONAL' | 'INELIGIBLE', { label: string; tone: 'eligible' | 'review' | 'difficult' }> = {
  ELIGIBLE: { label: '신청 가능', tone: 'eligible' },
  EVIDENCE_REQUIRED: { label: '서류 확인 필요', tone: 'review' },
  CONDITIONAL: { label: '정보 추가 확인', tone: 'review' },
  INELIGIBLE: { label: '신청 어려움', tone: 'difficult' },
};
