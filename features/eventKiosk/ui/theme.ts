import { colors, fonts, radius, spacing, tint, tracking } from '../../../design/tokens';

/**
 * 행사 화면 전용 크기.
 *
 * 색과 글꼴은 완판e 토큰을 그대로 쓴다. 크기만 키운다.
 * 행사장에서는 한두 걸음 떨어져 서서 보고, 손가락으로 큰 영역을 누른다.
 * 일반 앱 화면의 타입 스케일을 바꾸지 않도록 여기서 따로 정의한다.
 */
export const k = {
  colors,
  tint,
  radius,
  spacing,
  /** 최소 터치 영역. 일반 앱(44)보다 크게. */
  touch: 64,
  touchLarge: 76,
  /** 본문 최대 폭. 데스크톱에서 줄이 너무 길어지지 않게. */
  contentMax: 980,
  gutter: 24,
  type: {
    display: { fontFamily: fonts.bold, fontSize: 44, lineHeight: 56, letterSpacing: tracking.display },
    hero: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 46, letterSpacing: tracking.headline },
    title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 38, letterSpacing: tracking.headline },
    section: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, letterSpacing: tracking.tight },
    question: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 30, letterSpacing: tracking.tight },
    bodyLg: { fontFamily: fonts.regular, fontSize: 19, lineHeight: 29, letterSpacing: tracking.snug },
    bodyLgStrong: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 29, letterSpacing: tracking.snug },
    body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 26, letterSpacing: tracking.normal },
    bodyStrong: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 26, letterSpacing: tracking.normal },
    label: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: tracking.normal },
    caption: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, letterSpacing: tracking.normal },
    metric: { fontFamily: fonts.bold, fontSize: 52, lineHeight: 60, letterSpacing: tracking.display },
  },
} as const;

/** 결과 묶음별 색. 신청 가능=초록, 추가 확인=주황, 신청 어려움=회색. 빨강은 쓰지 않는다(오류처럼 읽힌다). */
export const bucketTone = {
  eligible: { bg: tint.green.bg, fg: tint.green.fg, icon: 'check-circle' as const },
  review: { bg: tint.amber.bg, fg: tint.amber.fg, icon: 'help' as const },
  difficult: { bg: tint.neutral.bg, fg: tint.neutral.fg, icon: 'remove-circle-outline' as const },
};

