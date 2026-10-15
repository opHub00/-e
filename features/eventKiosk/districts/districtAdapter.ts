import brief from '../../../data/events/samdo-districts.brief.json' with { type: 'json' };
import { SAMDO_DEEP_RULE_PACKAGE, SAMDO_STAGE_LABELS, type SamdoPresentationItem, type SamdoPresentationRecommendation } from '../samdo/index.ts';
import type {
  CodexDistrictPresentation,
  DistrictAssessment,
  DistrictCardModel,
  DistrictComparisonModel,
  DistrictCosts,
  DistrictId,
  DistrictSchedule,
} from './districtContract.ts';

/**
 * 1·2지구 비교 화면 모델을 만든다. 숫자는 모두 입력에서 온다.
 *  - 1지구: 최종 1.8 규칙 패키지(세대수·일정) + 이 방문자의 1지구 판정(toSamdoPresentationRecommendation 결과)
 *  - 2지구: 브리프 데이터 파일의 공급 규모만. 판정·가격·일정은 Codex 값이 올 때까지 '연결 전'
 *  - codex: Codex presentation 값. 지구·필드 단위로 위 값을 덮어쓴다(값이 있는 필드만).
 */
export const DISTRICT_PROGRAM_TITLE = '삼도이동 토지임대부 분양주택 1·2지구';
const DISTRICT_TITLE: Record<DistrictId, string> = { D1: '삼도이동 1지구', D2: '삼도이동 2지구' };
const DISTRICT_LABEL: Record<DistrictId, string> = { D1: '1지구', D2: '2지구' };

const EMPTY_SCHEDULE: DistrictSchedule = { special: null, generalFirst: null, generalSecond: null, winnerAnnouncement: null };
const EMPTY_COSTS: DistrictCosts = { salePrice49: null, salePrice59: null, monthlyLandRent49: null, monthlyLandRent59: null };

function itemAssessment(item: SamdoPresentationItem, recommended: boolean): DistrictAssessment {
  const score = item.officialScore;
  return {
    status: 'READY',
    recommendedSupply: recommended || item.eligibility !== 'INELIGIBLE' ? item.supplyLabel : null,
    eligibility: item.eligibility,
    priorityStage: item.stage ? `${item.stageLabel.length <= 22 && !/[요다]\.?$/.test(item.stageLabel) ? item.stageLabel : SAMDO_STAGE_LABELS[item.stage]}` : null,
    officialScore: score.status === 'AVAILABLE' ? { status: 'AVAILABLE', total: score.total, max: score.max } : { status: score.status },
    supplyCount: item.supplyCount,
  };
}

/** 1지구 판정 → 카드 요약. 추천이 없으면 다음 후보, 그것도 없으면 '신청 가능한 유형 없음'. */
export function district1Assessment(recommendation: SamdoPresentationRecommendation | null): DistrictAssessment {
  if (!recommendation) return { status: 'PENDING', reason: '정보를 입력하면 1지구 판정을 보여 드려요.' };
  if (recommendation.recommendedType) return itemAssessment(recommendation.recommendedType, true);
  const next = recommendation.alternatives[0] ?? recommendation.lowerPriorityTypes[0];
  if (next) return itemAssessment(next, false);
  return { status: 'READY', recommendedSupply: null, eligibility: 'INELIGIBLE', priorityStage: null, officialScore: { status: 'NOT_APPLICABLE' }, supplyCount: null };
}

function base(id: DistrictId, district1: SamdoPresentationRecommendation | null): DistrictCardModel {
  if (id === 'D1') {
    const pkg = SAMDO_DEEP_RULE_PACKAGE;
    return {
      id,
      label: DISTRICT_LABEL.D1,
      title: DISTRICT_TITLE.D1,
      inventory: { total: pkg.inventory.total, units49: pkg.inventory.units49, units59: pkg.inventory.units59 },
      costs: { ...EMPTY_COSTS },
      schedule: { special: pkg.schedule.special, generalFirst: pkg.schedule.generalFirst, generalSecond: pkg.schedule.generalSecond, winnerAnnouncement: pkg.schedule.winnerAnnouncement },
      assessment: district1Assessment(district1),
      source: { status: 'FINAL_USER_SOURCE', label: '최종1.8 공고' },
    };
  }
  const fromBrief = brief.districts.find(item => item.id === id);
  return {
    id,
    label: DISTRICT_LABEL[id],
    title: DISTRICT_TITLE[id],
    inventory: fromBrief?.inventory ?? null,
    costs: { ...EMPTY_COSTS },
    schedule: { ...EMPTY_SCHEDULE },
    assessment: { status: 'PENDING', reason: '2지구 판정은 공고 데이터가 연결되면 같은 입력으로 보여 드려요.' },
    source: fromBrief?.source ? { status: fromBrief.source.status as 'BRIEF', label: fromBrief.source.label } : { status: 'BRIEF', label: '공고 데이터 연결 전' },
  };
}

const pick = <T extends object>(current: T, patch: Partial<T> | null | undefined): T => {
  if (!patch) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined && value !== null) (next as Record<string, unknown>)[key] = value;
  return next;
};

function merge(card: DistrictCardModel, codex: CodexDistrictPresentation | undefined): DistrictCardModel {
  if (!codex) return card;
  return {
    ...card,
    label: codex.label ?? card.label,
    inventory: codex.inventory ?? card.inventory,
    costs: pick(card.costs, codex.costs),
    schedule: pick(card.schedule, codex.schedule),
    assessment: codex.assessment ?? card.assessment,
    source: codex.source ?? card.source,
  };
}

export function buildDistrictComparison(input: {
  district1: SamdoPresentationRecommendation | null;
  codex?: readonly CodexDistrictPresentation[] | null;
}): DistrictComparisonModel {
  const cards = (['D1', 'D2'] as const).map(id => merge(base(id, input.district1), input.codex?.find(item => item.id === id)));
  return { title: DISTRICT_PROGRAM_TITLE, cards, sample: cards.some(card => card.source.status === 'LAYOUT_SAMPLE') };
}

/* ── 표시 형식 ─────────────────────────────────────────── */

/** 2026-11-16 → '11월 16일(월)' (short) / '2026년 11월 16일' (long). */
export function formatDistrictDate(iso: string | null, style: 'short' | 'long' = 'short'): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (style === 'long') return `${y}년 ${mo}월 ${d}일`;
  const day = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${mo}월 ${d}일(${day})`;
}

/** 245,000,000 → '2억 4,500만원'. */
export function formatPrice(won: number | null): string | null {
  if (won === null || !Number.isFinite(won)) return null;
  const man = Math.round(won / 10_000);
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (!eok) return `${rest.toLocaleString('ko-KR')}만원`;
  return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
}

/** 213,000 → '월 213,000원'. */
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

export const NOT_CONNECTED = '공고 데이터 연결 전';
