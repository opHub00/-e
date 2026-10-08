import { fonts, spacing, tracking } from '../../../design/tokens';

/**
 * 행사 화면 전용 크기.
 *
 * Figma 행사 화면의 시각 토큰을 production 디자인 시스템과 분리해 둔다.
 * 글꼴은 앱에 이미 포함된 Pretendard를 사용한다.
 * 행사장에서는 한두 걸음 떨어져 서서 보고, 손가락으로 큰 영역을 누른다.
 * 일반 앱 화면의 타입 스케일을 바꾸지 않도록 여기서 따로 정의한다.
 */
export const k = {
  colors: {
    primary: '#5140AA',
    onPrimary: '#FFFFFF',
    primaryFixed: '#F0EDF9',
    lavender: '#F0EDF9',
    background: '#F4F5F8',
    surface: '#FFFFFF',
    surfaceLow: '#F8F8FA',
    surfaceContainer: '#F4F5F8',
    surfaceHigh: '#E8EAF0',
    surfaceHighest: '#DDE0E8',
    outline: '#DDE0E8',
    text: '#202333',
    textMuted: '#646A7C',
    textSubtle: '#858A99',
    hairline: '#ECEEF2',
    success: '#247A4B',
    warning: '#8A5A00',
    danger: '#A83939',
    error: '#A83939',
  },
  tint: {
    purple: { bg: '#F0EDF9', fg: '#5140AA' },
    green: { bg: '#E9F6EE', fg: '#247A4B' },
    amber: { bg: '#FFF4E5', fg: '#8A5A00' },
    pink: { bg: '#FFF0EF', fg: '#A83939' },
    neutral: { bg: '#EEF0F4', fg: '#646A7C' },
  },
  radius: { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 },
  spacing,
  /** 최소 터치 영역. 일반 앱(44)보다 크게. */
  touch: 64,
  touchLarge: 64,
  /** 본문 최대 폭. 데스크톱에서 줄이 너무 길어지지 않게. */
  contentMax: 1240,
  gutter: 40,
  type: {
    display: { fontFamily: fonts.bold, fontSize: 48, lineHeight: 64, letterSpacing: tracking.display },
    hero: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 50, letterSpacing: tracking.headline },
    title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 40, letterSpacing: tracking.headline },
    section: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 36, letterSpacing: tracking.tight },
    question: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 33, letterSpacing: tracking.tight },
    bodyLg: { fontFamily: fonts.regular, fontSize: 20, lineHeight: 30, letterSpacing: tracking.snug },
    bodyLgStrong: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 30, letterSpacing: tracking.snug },
    body: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 27, letterSpacing: tracking.normal },
    bodyStrong: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 27, letterSpacing: tracking.normal },
    label: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24, letterSpacing: tracking.normal },
    caption: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, letterSpacing: tracking.normal },
    metric: { fontFamily: fonts.bold, fontSize: 48, lineHeight: 58, letterSpacing: tracking.display },
  },
} as const;

/** 결과 묶음별 색. 신청 가능=초록, 추가 확인=주황, 신청 어려움=회색. 빨강은 쓰지 않는다(오류처럼 읽힌다). */
export const bucketTone = {
  eligible: { bg: k.tint.green.bg, fg: k.tint.green.fg, icon: 'check-circle' as const },
  review: { bg: k.tint.amber.bg, fg: k.tint.amber.fg, icon: 'help' as const },
  difficult: { bg: k.tint.neutral.bg, fg: k.tint.neutral.fg, icon: 'remove-circle-outline' as const },
};

