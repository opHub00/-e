import { duration, easing, stagger, travel } from '../../../design/motion';

/**
 * 행사 화면의 motion 규칙. 새 숫자를 만들지 않고 design/motion 토큰을 조합만 한다.
 * 공공·금융 서비스답게 짧고 차분하게: opacity + 작은 이동만, bounce·scale 튐 없음.
 */
export const eventMotion = {
  /** 화면 진입. stack 전환과 같은 길이. */
  screen: { duration: duration.screen, easing: easing.enter, distance: travel.screen },
  /** 입력 단계 사이 이동. 앞으로는 오른쪽에서, 뒤로는 왼쪽에서 살짝. */
  step: { duration: duration.screen, easing: easing.enter, distance: travel.stack },
  /** 화면 안 블록이 순서대로 나올 때의 간격. 블록은 3개 이하. */
  sequence: stagger.normal,
  /** 진행 막대가 채워지는 시간. */
  progress: { duration: duration.sheet, easing: easing.standard },
  /** QR 처럼 '완료됐다'를 알려야 하는 강조. 한 번만, 길게 끌지 않는다. */
  emphasis: { duration: duration.major, easing: easing.standard },
} as const;
