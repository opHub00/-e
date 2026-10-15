import type { LoadedEvent } from '../eventConfig.ts';
import { SAMDO_EVENT } from '../samdoEventScope.ts';
import { SAMDO_DEEP_RULE_PACKAGE, SAMDO_STAGE_LABELS } from '../samdo/index.ts';
import type { SamdoSupplyType } from '../samdo/types.ts';

/**
 * Product Story 그림에 들어가는 값. 숫자·날짜는 모두 삼도이동 1지구 규칙 패키지(최종 1.8 공고)에서 읽는다.
 * Story 안에 세대수·접수일을 따로 적지 않는다.
 * 판정 장면(4·5)의 상태·점수는 '이렇게 보여 준다'는 예시이며, 화면에 예시라고 표시한다. 개인 값은 없다.
 */
export type StoryTone = 'eligible' | 'review' | 'difficult';

export type StorySupply = { type: SamdoSupplyType; label: string; short: string; count: number; icon: string };

export type StoryData = {
  region: string;
  title: string;
  meta: string;
  /** 특별공급·일반공급 합계(공고 공급 내역). */
  totals: { special: number; general: number };
  /** 행사에서 비교하는 다섯 신청유형(장면 순서: 청년 → 신혼부부 → 신생아 → 생애최초 → 일반공급). */
  supplies: StorySupply[];
  /** 자동 추천에서 빼고 정보만 주는 유형(기관추천). */
  informationOnly: string[];
  conditions: readonly { icon: string; label: string }[];
  /** 공고문에서 뽑아 내 정보와 비교하는 조건(장면 3). */
  criteria: readonly string[];
  schedule: { special: string; generalFirst: string; generalSecond: string; winnerAnnouncement: string };
  /** 장면 4 예시 판정. */
  compare: { short: string; status: StoryTone; label: string }[];
  /** 장면 5 예시 결과. */
  example: { supplyLabel: string; stage: string; score: { total: number; max: number }; reasons: readonly string[]; date: string; winnerAnnouncement: string };
};

/** 장면 2: 자격과 순위를 바꾸는 조건. 이름만 있고 값은 없다. */
export const STORY_CONDITIONS = [
  { icon: 'cake', label: '나이' },
  { icon: 'favorite-border', label: '혼인' },
  { icon: 'child-care', label: '자녀' },
  { icon: 'home', label: '무주택' },
  { icon: 'payments', label: '소득' },
  { icon: 'account-balance-wallet', label: '자산' },
  { icon: 'savings', label: '청약통장' },
] as const;

/** 장면 3: 공고문에서 추출하는 조건. 청약통장 기준은 규칙 패키지 문구에서 가져온다. */
function subscriptionCriterion(): string {
  const rule = SAMDO_DEEP_RULE_PACKAGE.supplies.find(supply => supply.supplyType === 'NEWBORN')?.rules.find(item => item.category === 'SUBSCRIPTION');
  return rule ? rule.label.replace(/(이|가)\s*필요해요\.?$/, '').trim() : '청약통장 가입·납입 기준';
}
export const STORY_CRITERIA = ['공고일 현재 제주 거주', '세대 전체 무주택', '소득·자산 기준', subscriptionCriterion()] as const;

/** 장면 5 예시의 공식 가점. 만점은 신생아 특별공급 배점표(엔진 결과와 같은지 테스트로 확인), 득점은 예시. */
export const STORY_EXAMPLE_SCORE = { total: 10, max: 12 } as const;

const ORDER: SamdoSupplyType[] = ['YOUTH', 'NEWLYWED', 'NEWBORN', 'FIRST_HOME', 'GENERAL'];
const SHORT: Partial<Record<SamdoSupplyType, { short: string; icon: string }>> = {
  YOUTH: { short: '청년', icon: 'person' },
  NEWLYWED: { short: '신혼부부', icon: 'favorite-border' },
  NEWBORN: { short: '신생아', icon: 'child-friendly' },
  FIRST_HOME: { short: '생애최초', icon: 'vpn-key' },
  GENERAL: { short: '일반공급', icon: 'groups' },
};

/** '2026-11-16' → '2026년 11월 16일'. */
export function storyDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

export function storyDataFrom(_event: LoadedEvent): StoryData {
  const byType = new Map(SAMDO_EVENT.recommendationSupplies.map(supply => [supply.type as SamdoSupplyType, supply]));
  const supplies = ORDER.flatMap(type => {
    const supply = byType.get(type);
    const short = SHORT[type];
    return supply && short ? [{ type, label: supply.label, short: short.short, icon: short.icon, count: supply.count }] : [];
  });
  const dates = SAMDO_EVENT.schedule;
  const label = (type: SamdoSupplyType) => supplies.find(item => item.type === type)?.short ?? '';
  return {
    region: SAMDO_EVENT.shortTitle,
    title: SAMDO_EVENT.title,
    meta: `토지임대부 분양 · 총 ${SAMDO_EVENT.inventory.total}세대`,
    totals: { special: SAMDO_EVENT.inventory.special, general: SAMDO_EVENT.inventory.general },
    supplies,
    informationOnly: SAMDO_EVENT.informationOnlySupplies.map(supply => supply.label),
    conditions: STORY_CONDITIONS,
    criteria: STORY_CRITERIA,
    schedule: { special: storyDate(dates.special), generalFirst: storyDate(dates.generalFirst), generalSecond: storyDate(dates.generalSecond), winnerAnnouncement: storyDate(dates.winnerAnnouncement) },
    compare: [
      { short: label('YOUTH'), status: 'difficult', label: '신청 어려움' },
      { short: label('NEWLYWED'), status: 'review', label: '서류 확인 필요' },
      { short: label('NEWBORN'), status: 'eligible', label: '신청 가능' },
      { short: label('FIRST_HOME'), status: 'review', label: '서류 확인 필요' },
      { short: label('GENERAL'), status: 'eligible', label: '신청 가능' },
    ],
    example: {
      supplyLabel: supplies.find(item => item.type === 'NEWBORN')?.label ?? '신생아 특별공급',
      stage: `1단계 ${SAMDO_STAGE_LABELS.PRIORITY}`,
      score: STORY_EXAMPLE_SCORE,
      reasons: ['2세 미만 자녀', '세대 전체 무주택', '소득·자산 기준 충족'],
      date: storyDate(dates.special),
      winnerAnnouncement: storyDate(dates.winnerAnnouncement),
    },
  };
}
