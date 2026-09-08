import { Platform } from 'react-native';

export const colors = {
  primary: '#3B309E',
  primaryContainer: '#534AB7',
  primaryFixed: '#E3DFFF',
  lavender: '#EEEDFE',
  background: '#FCF8FF',
  surface: '#FFFFFF',
  surfaceLow: '#F6F2FC',
  surfaceContainer: '#F0ECF6',
  surfaceHigh: '#EBE6F0',
  surfaceHighest: '#E5E1EB',
  text: '#1C1B22',
  textMuted: '#474553',
  /** 3단계 텍스트 위계의 마지막. 캡션·단위·보조 라벨용. */
  textSubtle: '#7A7786',
  outline: '#C8C4D5',
  /** 카드 내부 divider. 카드 테두리(surfaceHigh)보다 한 단계 옅다. */
  hairline: '#F1EDF6',
  success: '#2E7D55',
  warning: '#C96A24',
  error: '#BA1A1A',
  onPrimary: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  screen: 20,
} as const;

export const radius = {
  button: 10,
  cardSm: 12,
  card: 16,
  /** Stitch bento 타일. rounded-xl(1.5rem). */
  bento: 24,
  pill: 999,
} as const;

/**
 * Stitch 의 아이콘 칩 배색. 배경은 옅게, 글리프는 진하게.
 * STITCH_DESIGN_ORIGINAL.md 의 tertiary/error container 계열을 그대로 쓴다.
 */
export const tint = {
  purple: { bg: '#E3DFFF', fg: '#3B309E' },
  amber: { bg: '#FFDCC3', fg: '#8A4900' },
  pink: { bg: '#FFDAD6', fg: '#93000A' },
  green: { bg: '#D6EFE0', fg: '#2E7D55' },
} as const;

/** purple gradient 카드 위에 얹는 반투명 레이어. */
export const overlay = {
  soft: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.22)',
  track: 'rgba(255,255,255,0.24)',
  glow: 'rgba(255,255,255,0.10)',
  glowInner: 'rgba(255,255,255,0.08)',
} as const;

/** 보라색을 아주 옅게 번지게 하는 Visual V2 공통 depth. */
export const shadow = {
  card: Platform.select({
    web: { boxShadow: '0 8px 18px rgba(59,48,158,0.07)' },
    default: {
      shadowColor: '#3B309E',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.07,
      shadowRadius: 18,
      elevation: 2,
    },
  })!,
  floating: Platform.select({
    web: { boxShadow: '0 10px 22px rgba(28,27,34,0.10)' },
    default: {
      shadowColor: '#1C1B22',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 22,
      elevation: 4,
    },
  })!,
} as const;

/** Pretendard. assets/fonts 의 파일명과 1:1로 맞춘다. */
export const fonts = {
  regular: 'Pretendard-Regular',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

/** 최소 터치 영역·컨트롤 높이. 화면에서 숫자를 직접 쓰지 않는다. */
export const size = {
  touch: 44,
  /** 원형 아이콘 버튼의 시각 크기. 터치 영역은 hitSlop 으로 touch 까지 넓힌다. */
  iconButton: 36,
  control: 52,
  choice: 132,
  bar: 8,
  inputMax: 120,
} as const;

/**
 * DESIGN_SYSTEM.md 타이포 스케일. 화면에서는 이 값을 spread 해서 쓴다.
 * 여기 없는 크기가 필요하면 화면에서 덮어쓰지 말고 스케일에 단계를 추가한다.
 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 48, lineHeight: 56 },
  metric: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48 },
  hero: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 44 },
  question: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 40 },
  headline: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 34 },
  /** Page 제목. 화면 상단 1개만. */
  page: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  /** Section 제목. 화면 안 구획 구분. */
  section: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 26 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 26 },
  bodyLgStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 23 },
  /** 촘촘한 대시보드 본문. */
  bodySm: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  bodySmStrong: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  /** eyebrow / 축약 라벨. 대문자 트래킹과 함께 쓴다. */
  micro: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15 },
} as const;
