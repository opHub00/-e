import { Easing, Platform } from 'react-native';

/**
 * 완판e 공통 motion 규칙.
 * 화면마다 숫자를 직접 쓰지 않고 여기 값을 쓴다.
 */
export const duration = {
  /** 버튼 press, chip 선택 같은 micro interaction */
  micro: 120,
  /** 눌리는 순간. 입력에 바로 붙어야 해서 짧게 간다. */
  pressIn: 120,
  /** 떼고 돌아오는 순간. 들어갈 때보다 조금 길어야 물컹하지 않다. */
  pressOut: 160,
  /** 화면 안 콘텐츠 등장·교체 */
  content: 200,
  /** stack 화면 전환 */
  screen: 260,
  /** bottom sheet / modal surface */
  sheet: 250,
  /** intro 처럼 의미를 전달하는 큰 동작 */
  major: 700,
} as const;

/** easing 은 3개로 제한한다. */
export const easing = {
  /** 등장. 빠르게 나와 부드럽게 멈춘다. */
  enter: Easing.bezier(0.16, 1, 0.3, 1),
  /** 퇴장. */
  exit: Easing.bezier(0.4, 0, 1, 1),
  /** 값 변화처럼 양방향. */
  standard: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

/** 순차 등장 간격. 카드가 줄줄이 튀지 않도록 항목 수를 제한해서 쓴다. */
export const stagger = { short: 60, normal: 120 } as const;

/** 등장 시 기본 이동 거리. */
export const travel = { sm: 8, md: 14, content: 6, screen: 5, stack: 10 } as const;

/** 눌림 상태 크기. 화면별로 임의 숫자를 만들지 않는다. */
export const scale = { pressed: 0.98, selection: 0.94, tabIdle: 0.94 } as const;

/** RN Web 에는 native animated module 이 없어 경고가 난다. transform/opacity 도 web 은 JS driver 로 돈다. */
export const useNative = Platform.OS !== 'web';
