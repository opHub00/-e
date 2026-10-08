import type { AdaptiveInfo, KioskAnswers } from '../model.ts';
import { phase4Personas, type Phase4PersonaId } from '../phase4Personas.ts';
import { useKioskStore } from '../useKioskStore.ts';

/**
 * 행사 운영·개발용 Demo Mode.
 *
 * 켜지는 조건은 둘뿐이다.
 *  - 개발 빌드(__DEV__)
 *  - 빌드할 때 EXPO_PUBLIC_EVENT_DEMO_MODE=1 을 준 행사 운영용 빌드
 * 일반 행사 빌드에서는 꺼져 있고, 어떤 방문자 화면에서도 이 기능으로 가는 링크를 두지 않는다.
 *
 * 판정은 흉내 내지 않는다. persona 의 '답'만 넣고, 분석 화면으로 보내 실제 엔진이 계산하게 한다.
 */
declare const __DEV__: boolean | undefined;

/**
 * Expo 는 `process.env.EXPO_PUBLIC_이름` 을 글자 그대로 쓴 곳만 빌드 때 값으로 바꾼다.
 * process.env 를 통째로 넘기면 웹 빌드에서는 빈 값이 되므로 여기서 하나씩 읽어 둔다.
 */
const BUILD_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_EVENT_DEMO_MODE: process.env.EXPO_PUBLIC_EVENT_DEMO_MODE,
  EXPO_PUBLIC_BUILD_COMMIT: process.env.EXPO_PUBLIC_BUILD_COMMIT,
  EXPO_PUBLIC_BUILD_TIME: process.env.EXPO_PUBLIC_BUILD_TIME,
};

export function isDemoModeEnabled(env: Record<string, string | undefined> = BUILD_ENV): boolean {
  const dev = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  return dev || env.EXPO_PUBLIC_EVENT_DEMO_MODE === '1';
}

export type BuildInfo = { commit: string; builtAt: string; mode: 'development' | 'demo-flag' | 'off' };

export function buildInfo(env: Record<string, string | undefined> = BUILD_ENV): BuildInfo {
  const dev = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  return {
    commit: env.EXPO_PUBLIC_BUILD_COMMIT || (dev ? '개발 서버' : '기록 없음'),
    builtAt: env.EXPO_PUBLIC_BUILD_TIME || (dev ? '개발 서버' : '기록 없음'),
    mode: dev ? 'development' : env.EXPO_PUBLIC_EVENT_DEMO_MODE === '1' ? 'demo-flag' : 'off',
  };
}

export type InjectMode = 'inputs' | 'withAdaptive';

/** persona 의 답을 새 세션에 넣는다. 이전 세션은 reset 과 같은 경로로 모두 지운다. */
export function injectPersona(id: Phase4PersonaId, mode: InjectMode): KioskAnswers {
  const persona = phase4Personas.find(item => item.id === id);
  if (!persona) throw new Error(`DEMO_PERSONA_UNKNOWN:${id}`);
  const answers = structuredClone(persona.initialAnswers);
  const answered: string[] = [];
  if (mode === 'withAdaptive') {
    answers.adaptive = { ...answers.adaptive, ...persona.adaptiveAnswers } as AdaptiveInfo;
    for (const key of Object.keys(persona.adaptiveAnswers)) answered.push(`adaptive.${key}`);
  }
  const store = useKioskStore.getState();
  store.reset();
  // 공개 setState 로 답만 넣는다. 결과(evaluation)는 비워 둔 채라 분석 화면이 실제로 계산한다.
  useKioskStore.setState({ answers, answered });
  return answers;
}

export const DEMO_PERSONAS = phase4Personas.map(persona => ({ id: persona.id, label: persona.label }));

/** 빠른 이동. 결과가 있어야 열리는 화면은 needsResult 로 표시한다. */
export const DEMO_ROUTES = [
  { key: 'landing', label: 'Landing', path: '/event', needsResult: false },
  { key: 'adaptive', label: 'Adaptive', path: '/event/adaptive', needsResult: true },
  { key: 'dashboard', label: 'Dashboard', path: '/event/results', needsResult: true },
  { key: 'detail', label: 'Detail (1순위 결과)', path: 'detail', needsResult: true },
  { key: 'qr', label: 'QR / Summary', path: '/event/summary', needsResult: true },
] as const;
