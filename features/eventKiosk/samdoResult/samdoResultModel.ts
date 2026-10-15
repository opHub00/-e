import {
  SAMDO_DEEP_RULE_PACKAGE,
  SAMDO_ELIGIBILITY_LABELS,
  SAMDO_STAGE_LABELS,
  type SamdoEligibility,
  type SamdoPresentationItem,
  type SamdoPresentationRecommendation,
  type SamdoRecommendation,
  type SamdoSupplyType,
} from '../samdo/index.ts';
import type { AssessmentInput } from '../../applicationAssessment/types.ts';
import { containsRawKey } from '../presentation.ts';
import { SAMDO_EVENT } from '../samdoEventScope.ts';
import { buildOfficialCriteria, type OfficialCriterion } from './officialCriteria.ts';

/**
 * 삼도이동 1지구 전용 결과 화면 모델.
 *
 * 자격·공급단계·순위는 Codex 판정(toSamdoPresentationRecommendation)이 정한다. 여기서는 순서를 바꾸지 않고
 * 화면에 놓을 칸(추천 → 이유 → 다른 유형 → 어려운 유형 → 다음 행동)으로 나누고 문장을 짧게 고르기만 한다.
 * 공급 세대수는 정보로만 보여 주고 당첨 가능성처럼 쓰지 않는다. 경쟁률·당첨확률은 계산하지 않는다.
 */
export type SamdoTone = 'eligible' | 'review' | 'difficult' | 'info';

export type SamdoChip = { label: string; tone: SamdoTone | 'neutral'; testID: string };

export type SamdoHero = {
  kind: 'recommended' | 'review' | 'none';
  supplyType: SamdoSupplyType | null;
  eyebrow: string;
  headline: string;
  body: string;
  chips: SamdoChip[];
  /** 공식 가점이 있을 때만. 항목별 점수(공고 배점표 그대로). */
  score: { total: number; max: number; items: { label: string; points: number; max: number }[] } | null;
};

export type SamdoTypeCard = {
  supplyType: SamdoSupplyType;
  rank: number;
  title: string;
  status: { label: string; tone: SamdoTone };
  stage: string;
  supplyCount: string;
  applicationDate: string;
  officialScore: string;
  strengths: string[];
  checks: string[];
};

export type SamdoRejected = { supplyType: SamdoSupplyType; title: string; reason: string };

export type SamdoScheduleRow = { id: 'special' | 'generalFirst' | 'generalSecond'; date: string; label: string; types: string[]; highlight: boolean };

export type SamdoResultView = {
  title: string;
  subtitle: string;
  sourceNote: string;
  hero: SamdoHero;
  officialCriteria: OfficialCriterion[];
  why: string[];
  alternatives: SamdoTypeCard[];
  lowerPriorityTypes: SamdoTypeCard[];
  rejected: SamdoRejected[];
  informationOnly: { title: string; note: string }[];
  documents: string[];
  schedule: SamdoScheduleRow[];
  /** 결과에 함께 넣는 주의 문장(짧게, 최대 3개). */
  notes: string[];
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-11-16' → '11월 16일(월)'. */
export function formatSamdoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match.map(Number) as unknown as [number, number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일(${WEEKDAYS[day]})`;
}

const TONE: Record<SamdoEligibility, SamdoTone> = { ELIGIBLE: 'eligible', EVIDENCE_REQUIRED: 'review', CONDITIONAL: 'review', INELIGIBLE: 'difficult' };

/** 받침이 있으면 '을', 없으면 '를'. 한글이 아니면 '을(를)'. */
function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 ? '을' : '를';
}

/** 엔진이 문장으로 준 단계 설명은 길어서, 짧은 단계 이름이 있으면 그쪽을 쓴다. */
export function shortStage(item: Pick<SamdoPresentationItem, 'stage' | 'stageLabel'>): string {
  const label = item.stageLabel.trim();
  if (label && label.length <= 22 && !/[요다]\.?$/.test(label)) return label;
  if (item.stage) return SAMDO_STAGE_LABELS[item.stage];
  return '공급단계 확인 필요';
}

function scoreText(item: SamdoPresentationItem): string {
  const score = item.officialScore;
  if (score.status === 'AVAILABLE') return `공식 가점 ${score.total}/${score.max}점`;
  if (score.status === 'NOT_APPLICABLE') return '공식 점수 해당 없음';
  return '공식 가점 계산 전';
}

/** 화면 이유 목록에서 빼는 문장: 장점이 아니라 확인 메모인 것. */
const NOT_A_STRENGTH = /검토 메모|확인 필요|추가 확인|별도 심사|미적용|해당 없음|계산하지 않/;
/** 사람이 결정에 쓰는 주제 순서: 혼인·자녀 → 소득 → 제주 거주 → 청약통장 → 무주택 → 단계. */
const TOPICS: RegExp[] = [/혼인|신혼|자녀|태아|출산|한부모/, /소득/, /거주/, /통장|납입|저축|1순위|순위/, /무주택|주택소유/, /우선공급|단계/];

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 엔진이 준 충족 조건에서 주제별로 하나씩 골라 최대 limit 개. 순서는 TOPICS, 같은 주제 안에서는 엔진 순서. */
export function pickStrengths(item: SamdoPresentationItem, limit: number): string[] {
  const stage = item.stageLabel.trim();
  const pool = [...new Set([...item.matchedAdvantages, ...item.reasons].map(tidy))]
    .filter(text => text && text !== stage && !NOT_A_STRENGTH.test(text) && !containsRawKey(text) && !/^공식 가점/.test(text));
  const picked: string[] = [];
  for (const topic of TOPICS) {
    const hit = pool.find(text => topic.test(text) && !picked.includes(text));
    if (hit) picked.push(hit);
    if (picked.length >= limit) return picked;
  }
  for (const text of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(text)) picked.push(text);
  }
  return picked;
}

const BOILERPLATE = /당첨확률|검토본|미완성|공식 점수제가 아니|동점자|자동 추천에서 제외/;

function checksOf(item: SamdoPresentationItem, limit: number): string[] {
  const lines: string[] = [];
  if (item.eligibility === 'CONDITIONAL') lines.push('입력하지 않은 정보가 있어 자격을 다 확인하지 못했어요.');
  if (!item.stage && item.eligibility !== 'INELIGIBLE') lines.push('공급단계는 추가 확인 뒤 정해져요.');
  for (const doc of item.evidenceRequired.map(text => tidy(text).replace(/^특례:\s*/, ''))) lines.push(doc);
  // 공통 안내(검토본·당첨확률·미완성 표기)는 화면 아래 주의에 한 번만 둔다.
  for (const caution of item.cautions.map(tidy)) if (!BOILERPLATE.test(caution)) lines.push(caution);
  return [...new Set(lines)].filter(text => !containsRawKey(text)).slice(0, limit);
}

function card(item: SamdoPresentationItem): SamdoTypeCard {
  return {
    supplyType: item.supplyType,
    rank: item.rank,
    title: item.supplyLabel,
    status: { label: SAMDO_ELIGIBILITY_LABELS[item.eligibility], tone: TONE[item.eligibility] },
    stage: shortStage(item),
    supplyCount: `공급 ${item.supplyCount}세대`,
    applicationDate: `접수 ${formatSamdoDate(item.applicationDate)}`,
    officialScore: scoreText(item),
    strengths: pickStrengths(item, 2),
    checks: checksOf(item, 2),
  };
}

const PRIORITY_STAGES = new Set(['PRIORITY', 'NEWBORN_PRIORITY', 'FIRST_RANK_PRIORITY']);

function heroOf(rec: SamdoPresentationRecommendation): SamdoHero {
  const top = rec.recommendedType;
  if (top) {
    const priority = top.stage && PRIORITY_STAGES.has(top.stage) ? ` ${SAMDO_STAGE_LABELS[top.stage]}` : '';
    const name = `${top.supplyLabel}${priority}`;
    const score = top.officialScore.status === 'AVAILABLE'
      ? { total: top.officialScore.total, max: top.officialScore.max, items: top.officialScore.breakdown.map(item => ({ label: item.label.replace(/\s*\(.*\)\s*$/, ''), points: item.points, max: item.max })) }
      : null;
    return {
      kind: 'recommended',
      supplyType: top.supplyType,
      eyebrow: '가장 유리한 신청유형',
      headline: `${name}${objectParticle(name)} 먼저 검토하세요`,
      body: `입력한 정보로 보면 ${top.supplyLabel}의 ${shortStage(top)}에 해당해요. 신청 전에 서류로 한 번 더 확인해요.`,
      chips: [
        { label: SAMDO_ELIGIBILITY_LABELS[top.eligibility], tone: 'eligible', testID: 'samdo-hero-status' },
        { label: shortStage(top), tone: 'neutral', testID: 'samdo-hero-stage' },
        { label: scoreText(top), tone: top.officialScore.status === 'AVAILABLE' ? 'neutral' : 'info', testID: 'samdo-hero-score' },
        { label: `접수 ${formatSamdoDate(top.applicationDate)}`, tone: 'neutral', testID: 'samdo-hero-date' },
      ],
      score,
    };
  }
  const next = rec.alternatives[0] ?? rec.lowerPriorityTypes[0] ?? null;
  if (next) {
    return {
      kind: 'review',
      supplyType: next.supplyType,
      eyebrow: '먼저 확인할 신청유형',
      headline: `${next.supplyLabel}${objectParticle(next.supplyLabel)} 확인해 보세요`,
      body: next.eligibility === 'EVIDENCE_REQUIRED'
        ? '조건은 맞지만 서류로 확인해야 신청 가능 여부가 정해져요. 바로 신청 가능한 유형은 아직 없어요.'
        : '입력하지 않은 정보가 있어 아직 신청 가능 여부를 정하지 못했어요. 바로 신청 가능한 유형은 아직 없어요.',
      chips: [
        { label: SAMDO_ELIGIBILITY_LABELS[next.eligibility], tone: 'review', testID: 'samdo-hero-status' },
        { label: shortStage(next), tone: 'neutral', testID: 'samdo-hero-stage' },
        { label: `접수 ${formatSamdoDate(next.applicationDate)}`, tone: 'neutral', testID: 'samdo-hero-date' },
      ],
      score: null,
    };
  }
  return {
    kind: 'none',
    supplyType: null,
    eyebrow: '분석 결과',
    headline: '지금 입력한 정보로는 신청하기 어려워요',
    body: '아래에서 유형별로 어떤 조건이 맞지 않았는지 확인할 수 있어요. 정보가 바뀌면 다시 분석해 보세요.',
    chips: [{ label: '신청 가능한 유형 없음', tone: 'difficult', testID: 'samdo-hero-status' }],
    score: null,
  };
}

function scheduleOf(rec: SamdoPresentationRecommendation, focus: SamdoSupplyType | null): SamdoScheduleRow[] {
  const dates = SAMDO_DEEP_RULE_PACKAGE.applicationDates;
  const candidates = [rec.recommendedType, ...rec.alternatives, ...rec.lowerPriorityTypes].filter((item): item is SamdoPresentationItem => Boolean(item));
  const focusDate = candidates.find(item => item.supplyType === focus)?.applicationDate ?? null;
  const typesOn = (date: string) => candidates.filter(item => item.applicationDate === date).map(item => item.supplyLabel);
  const rows: SamdoScheduleRow[] = [
    { id: 'special', date: dates.special, label: '특별공급 접수', types: typesOn(dates.special), highlight: false },
    { id: 'generalFirst', date: dates.generalFirst, label: '일반공급 1순위 접수', types: typesOn(dates.generalFirst), highlight: false },
    { id: 'generalSecond', date: dates.generalSecond, label: '일반공급 2순위 접수', types: typesOn(dates.generalSecond), highlight: false },
  ];
  const hit = rows.find(row => row.date === focusDate);
  if (hit) hit.highlight = true;
  return rows.map(row => ({ ...row, date: formatSamdoDate(row.date) }));
}

/** 엔진 탈락 사유가 조건 이름만이면('만 19~39세') 문장으로 감싼다. 이미 문장이면 그대로. */
export function failedSentence(reason: string | undefined): string {
  const text = tidy(reason ?? '');
  if (!text) return '필요한 조건을 충족하지 못했어요.';
  if (/[요다]\.?$/.test(text)) return text;
  return `'${text}' 조건을 충족하지 못했어요.`;
}

export function buildSamdoResultView(
  rec: SamdoPresentationRecommendation,
  detail?: { rawRecommendation: SamdoRecommendation; input: AssessmentInput },
): SamdoResultView {
  const hero = heroOf(rec);
  const focus = rec.recommendedType ?? rec.alternatives[0] ?? rec.lowerPriorityTypes[0] ?? null;
  const rawFocus = focus && detail
    ? detail.rawRecommendation.evaluations.find(item => item.supplyType === focus.supplyType) ?? null
    : null;
  const why = focus ? pickStrengths(focus, 5) : [];
  if (rec.recommendedType && hero.score) why.splice(Math.min(why.length, 4), 0, `공식 가점 ${hero.score.total}/${hero.score.max}점이에요.`);
  const shown = new Set([hero.supplyType]);
  const alternatives = rec.alternatives.filter(item => !shown.has(item.supplyType)).map(card);
  const lowerPriorityTypes = rec.lowerPriorityTypes.filter(item => !shown.has(item.supplyType)).map(card);
  const notes = [
    rec.sourceStatus === 'OFFICIAL_VERIFIED' ? null : '사용자가 제공한 최종1.8 공고문을 기준으로 계산했어요. 접수 전 공급기관 공개 원문도 확인해 주세요.',
    '공급 세대수는 공고 정보일 뿐 당첨 가능성을 뜻하지 않아요.',
    focus?.officialScore.status === 'AVAILABLE' ? '가점이 같으면 추첨으로 정해요.' : null,
  ].filter((line): line is string => Boolean(line));
  return {
    title: `완판e가 ${SAMDO_EVENT.shortTitle} 청약을 분석했어요`,
    subtitle: SAMDO_EVENT.title,
    sourceNote: rec.sourceStatus === 'OFFICIAL_VERIFIED' ? '공식 공고 기준' : '최종1.8 사용자 제공본 기준 · 공개 원문 별도 확인',
    hero,
    officialCriteria: rawFocus && detail ? buildOfficialCriteria(rawFocus, detail.input) : [],
    why: why.slice(0, 5),
    alternatives,
    lowerPriorityTypes,
    rejected: rec.rejectedTypes.map(item => ({
      supplyType: item.supplyType,
      title: item.supplyLabel,
      reason: failedSentence(item.failedReasons[0]),
    })),
    informationOnly: rec.informationOnlyTypes.map(item => ({ title: item.supplyLabel, note: tidy(item.cautions[0] ?? '정보 제공만 해요.') })),
    documents: focus ? [...new Set(focus.evidenceRequired.map(text => tidy(text).replace(/^특례:\s*/, '')))].slice(0, 6) : [],
    schedule: scheduleOf(rec, focus?.supplyType ?? null),
    notes,
  };
}
