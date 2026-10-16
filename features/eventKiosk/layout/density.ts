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
    control: 48,
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
    // 휴대폰 전용: PC 를 줄인 것이 아니라 손가락·좁은 폭 기준으로 따로 정한다. CTA 48~52px, 누르는 영역 44px 이상.
    control: 48,
    controlLarge: 52,
    controlPaddingX: 16,
    controlLargePaddingX: 18,
    sectionGap: 16,
    cardPadding: 14,
    cardGap: 10,
    gridGap: 10,
    headingGap: 4,
    gutter: 16,
    contentMax: 640,
    cardBasis: 300,
    thumb: 56,
  },
};

/** 노트북 화면부터 compact. iPad 가로(1024~1194)는 comfortable 로 남긴다. */
export const COMPACT_MIN_WIDTH = 1200;
/** 360px 이하 휴대폰은 좌우 여백을 더 줄인다(320·360 기기). */
export const NARROW_PHONE_MAX_WIDTH = 360;
export const NARROW_PHONE_GUTTER = 12;

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

/* ── 반응형 품질 시스템: 폭 + 높이 + 입력 방식 + 화면 성격 ───────────────────────── */

/** 세로 여유에 따른 간격 단계. 토큰 등급(Density)과 별개로 간격·머리 높이만 조절한다. */
export type Spacing = 'compact' | 'comfortable' | 'spacious';
export type LayoutClass = 'phone' | 'tablet' | 'desktop';
export type ContentType = 'content' | 'form' | 'dashboard' | 'chat';

export type ViewportProfile = {
  /** 크기·글자 토큰 등급(기존 DENSITY 키). */
  density: Density;
  /** 세로 여유를 반영한 간격 단계. */
  spacing: Spacing;
  layout: LayoutClass;
  /** 높이가 짧아(노트북 720~768, 가로 태블릿) 머리·간격을 줄여야 하는 화면. */
  shortHeight: boolean;
};

/** 이 높이 이하이면 '낮은 화면'(1280×720, 1366×768, 1024×768 가로 태블릿, 320×568 휴대폰). */
export const SHORT_HEIGHT_MAX = 800;
/** 이 높이 이상 + 넓은 데스크톱이면 넉넉한 간격(1920×1080). */
export const SPACIOUS_MIN_HEIGHT = 1000;
export const SPACIOUS_MIN_WIDTH = 1600;

/**
 * 접속 환경에서 화면 밀도를 정한다. PC 화면을 줄이는 게 아니라 기기 성격마다 정보량을 다르게 둔다.
 *  - 폭: phone(<744) / tablet / desktop(≥1200, 마우스)
 *  - 높이: 낮으면(≤800) 간격 compact, 아주 넓고 높으면(≥1600×1000) spacious
 *  - 손가락 입력: 넓어도 tablet(큰 터치 UI 를 줄이지 않는다)
 *  - 화면 성격: dashboard 는 spacious 대신 comfortable(정보량 우선), chat 은 낮은 화면에서 compact
 * 붙기 전(폭 0)에는 정적 화면과 같도록 comfortable·tablet.
 */
export function deriveDensity(input: { width: number; height: number; pointerType?: 'fine' | 'coarse'; contentType?: ContentType }): ViewportProfile {
  const { width, height } = input;
  if (width <= 0) return { density: 'comfortable', spacing: 'comfortable', layout: 'tablet', shortHeight: false };
  const coarse = input.pointerType === 'coarse';
  const density = densityFor(width, { coarsePointer: coarse });
  const layout: LayoutClass = density === 'touch' ? 'phone' : density === 'compact' ? 'desktop' : 'tablet';
  const shortHeight = height > 0 && height <= SHORT_HEIGHT_MAX;
  let spacing: Spacing = 'comfortable';
  if (shortHeight || (layout === 'phone' && width <= NARROW_PHONE_MAX_WIDTH)) spacing = 'compact';
  else if (layout === 'desktop' && width >= SPACIOUS_MIN_WIDTH && height >= SPACIOUS_MIN_HEIGHT) spacing = 'spacious';
  if (input.contentType === 'dashboard' && spacing === 'spacious') spacing = 'comfortable';
  if (input.contentType === 'chat' && shortHeight) spacing = 'compact';
  return { density, spacing, layout, shortHeight };
}

const SPACING_SCALE: Record<Spacing, number> = { compact: 0.7, comfortable: 1, spacious: 1.2 };

/** 간격 단계를 토큰에 적용한다. 누르는 영역(control)과 글자 크기는 바꾸지 않는다. */
export function applySpacing(tokens: DensityTokens, spacing: Spacing): DensityTokens {
  if (spacing === 'comfortable') return tokens;
  const scale = SPACING_SCALE[spacing];
  const s = (value: number, min: number) => Math.max(min, Math.round(value * scale));
  return {
    ...tokens,
    sectionGap: s(tokens.sectionGap, 12),
    cardGap: s(tokens.cardGap, 8),
    gridGap: s(tokens.gridGap, 8),
    headingGap: s(tokens.headingGap, 2),
    cardPadding: s(tokens.cardPadding, 12),
  };
}
