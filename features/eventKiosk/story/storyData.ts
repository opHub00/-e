import type { LoadedEvent } from '../eventConfig.ts';
import { buildDistrictComparison, DISTRICT_PROGRAM_TITLE } from '../districts/districtAdapter.ts';
import type { DistrictId, DistrictInventory, DistrictSchedule } from '../districts/districtContract.ts';
import { codexDistrictPresentation } from '../districts/districtSource.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/index.ts';
import type { SamdoSupplyType } from '../samdo/types.ts';

/**
 * Product Story 그림에 들어가는 값. 세대수·일정은 1·2지구 adapter(공고 패키지 · Codex presentation · 브리프)에서 읽고
 * Story 안에 숫자·날짜를 따로 적지 않는다. 판정 장면(4·5)의 상태는 '이렇게 보여 준다'는 예시이며 화면에 예시라고 표시한다.
 */
export type StoryTone = 'eligible' | 'review' | 'difficult';

export type StoryDistrict = { id: DistrictId; label: string; inventory: DistrictInventory | null; schedule: DistrictSchedule };

export type StoryData = {
  /** 장면 문구의 지역 이름. */
  region: string;
  program: string;
  districts: StoryDistrict[];
  /** 지구마다 확인하는 신청유형(짧은 이름). */
  supplies: { type: SamdoSupplyType; short: string }[];
  conditions: readonly { icon: string; label: string }[];
  /** 장면 4 예시 판정(지구별). */
  compare: { district: DistrictId; eligibility: { label: string; tone: StoryTone }; stage: string }[];
  /** 장면 5 예시 선택지(지구별). */
  choices: { district: DistrictId; supply: string; status: { label: string; tone: StoryTone } }[];
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

const SHORT: Partial<Record<SamdoSupplyType, string>> = {
  YOUTH: '청년', NEWLYWED: '신혼부부', NEWBORN: '신생아', FIRST_HOME: '생애최초', GENERAL: '일반공급',
};
const ORDER: SamdoSupplyType[] = ['YOUTH', 'NEWLYWED', 'NEWBORN', 'FIRST_HOME', 'GENERAL'];

/** '2026-11-16' → '11.16'. 없으면 null. */
export function storyShortDate(iso: string | null): string | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return match ? `${Number(match[2])}.${Number(match[3])}` : null;
}

export function storyDataFrom(_event: LoadedEvent): StoryData {
  const comparison = buildDistrictComparison({ district1: null, codex: codexDistrictPresentation() });
  const available = new Set(SAMDO_DEEP_RULE_PACKAGE.supplies.filter(supply => supply.autoRecommend).map(supply => supply.supplyType));
  return {
    region: '삼도이동',
    program: DISTRICT_PROGRAM_TITLE,
    districts: comparison.cards.map(card => ({ id: card.id, label: card.label, inventory: card.inventory, schedule: card.schedule })),
    supplies: ORDER.filter(type => available.has(type)).map(type => ({ type, short: SHORT[type] ?? type })),
    conditions: STORY_CONDITIONS,
    compare: [
      { district: 'D1', eligibility: { label: '신청 가능', tone: 'eligible' }, stage: '우선공급' },
      { district: 'D2', eligibility: { label: '서류 확인 필요', tone: 'review' }, stage: '확인 후 결정' },
    ],
    choices: [
      { district: 'D1', supply: '신생아 특별공급', status: { label: '신청 가능', tone: 'eligible' } },
      { district: 'D2', supply: '생애최초 특별공급', status: { label: '서류 확인 필요', tone: 'review' } },
    ],
  };
}
