/**
 * 화면 밀도. 같은 행사 UI 를 기기에 맞는 '정보량'으로 보여 주기 위한 layout token.
 *
 *  - touch:       휴대폰. 손가락으로 쓰는 좁은 화면. 한 열, 터치 영역 넉넉히.
 *  - comfortable: iPad·행사 키오스크. 지금의 큰 touch UI 를 그대로 유지한다(줄이지 않는다).
 *  - compact:     노트북·데스크톱. 마우스·트랙패드 기준. 한 화면 정보량을 크게 늘린다.
 *
 * 색·글꼴·의미(상태 이름, 판정 표시)는 밀도와 상관없이 같다. 바뀌는 것은 크기·간격·열 수뿐이다.
 * 어느 밀도에서도 누르는 영역은 44px 이상이다.
 */
export type Density = 'compact' | 'comfortable' | 'touch';

export type DensityTokens = {
  /** 기본 버튼·입력 높이. */
  control: number;
  /** 화면의 주 행동 버튼 높이. */
  controlLarge: number;
  controlPaddingX: number;
  controlLargePaddingX: number;
  /** 화면 안 큰 묶음 사이. */
  sectionGap: number;
  /** 카드 안쪽 여백과 카드 안 요소 사이. */
  cardPadding: number;
  cardGap: number;
  /** 카드 목록 사이. */
  gridGap: number;
  /** 제목과 바로 아래 설명 사이. */
  headingGap: number;
  /** 화면 좌우 여백, 본문 최대 폭. */
  gutter: number;
  contentMax: number;
  /** 결과 카드 한 장의 기준 폭(flexBasis). 이 값으로 한 줄에 몇 장이 들어갈지 정해진다. */
  cardBasis: number;
  /** 썸네일 한 변. */
  thumb: number;
};

/** 크기·간격 token. 글자 크기는 densityType.ts(글꼴 token 을 쓰는 화면 쪽)에 있다. */
export const DENSITY: Record<Density, DensityTokens> = {
  compact: {
    control: 44,
    controlLarge: 52,
    controlPaddingX: 16,
    controlLargePaddingX: 22,
    sectionGap: 20,
    cardPadding: 16,
    cardGap: 10,
    gridGap: 14,
    headingGap: 4,
    gutter: 32,
    contentMax: 1320,
    cardBasis: 320,
    thumb: 64,
  },
  comfortable: {
    control: 64,
    controlLarge: 64,
    controlPaddingX: 24,
    controlLargePaddingX: 32,
    sectionGap: 32,
    cardPadding: 24,
    cardGap: 16,
    gridGap: 20,
    headingGap: 8,
    gutter: 40,
    contentMax: 1240,
    cardBasis: 360,
    thumb: 72,
  },
  touch: {
    control: 52,
    controlLarge: 56,
    controlPaddingX: 18,
    controlLargePaddingX: 22,
    sectionGap: 22,
    cardPadding: 18,
    cardGap: 12,
    gridGap: 14,
    headingGap: 6,
    gutter: 16,
    contentMax: 640,
    cardBasis: 300,
    thumb: 64,
  },
};

/** 노트북 화면부터 compact. iPad 가로(1024~1194)는 comfortable 로 남긴다. */
export const COMPACT_MIN_WIDTH = 1200;
/** iPad mini 세로(744)부터 comfortable. */
export const COMFORTABLE_MIN_WIDTH = 744;

/**
 * 폭과 입력 방식으로 밀도를 고른다.
 * 넓어도 손가락으로 쓰는 화면(대형 터치 키오스크)은 comfortable 로 둔다. 큰 터치 UI 를 줄이지 않는다.
 */
export function densityFor(width: number, input: { coarsePointer?: boolean } = {}): Density {
  if (width <= 0) return 'comfortable';
  if (width < COMFORTABLE_MIN_WIDTH) return 'touch';
  if (width >= COMPACT_MIN_WIDTH && !input.coarsePointer) return 'compact';
  return 'comfortable';
}
