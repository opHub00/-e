import { router } from 'expo-router';
import { inputSteps, type HouseholdType, type InputStep } from '../model';
import { useKioskStore } from '../useKioskStore';

/**
 * 행사 화면 주소. 공고 상세·상담은 동적 경로 대신 쿼리(?id=)를 쓴다.
 * 정적 배포에서 동적 경로는 서버 rewrite 가 따로 필요하지만, 쿼리는 같은 페이지로 그대로 열린다.
 */
export const EVENT_HOME = '/event';
export const stepPath = (step: InputStep) => `/event/${step}` as const;

export function nextAfter(type: HouseholdType | null, step: InputStep): string {
  const steps = inputSteps(type);
  const index = steps.indexOf(step);
  return index >= 0 && index < steps.length - 1 ? stepPath(steps[index + 1]) : '/event/analysis';
}

export const listingPath = (outcomeId: string) => `/event/listing?id=${encodeURIComponent(outcomeId)}`;
export const chatPath = (outcomeId: string | null) => (outcomeId ? `/event/chat?id=${encodeURIComponent(outcomeId)}` : '/event/chat');

/** 뒤로 갈 곳이 없으면(주소로 바로 열었을 때) 지정한 곳으로 간다. */
export function goBack(fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

/**
 * 처음 화면으로. 저장소를 비우고, 쌓인 화면도 모두 내린다.
 * 화면을 남겨 두면 그 화면이 들고 있던 입력 중 글자가 다음 방문자에게 보일 수 있다.
 */
export function resetToHome() {
  useKioskStore.getState().reset();
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch {
    // 내릴 화면이 없으면 그대로 둔다.
  }
  router.replace(EVENT_HOME as never);
}
