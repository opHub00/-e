import { hasSeenStory } from './storyPreference.ts';

/**
 * 이번 진입에서 Product Story 가 첫 화면을 맡는가.
 *
 * 첫 화면(/event)에서 아직 소개를 보지 않은 브라우저, 또는 소개 화면(/event/story)을 바로 연 경우.
 * 이때는 앱 공통 브랜드 인트로가 따로 돌지 않고, 문서의 브랜드 표지가 Story 로 바로 이어진다(중복 인트로 없음).
 * 자동화 브라우저(회귀 점검)는 기존 흐름을 검사하도록 자동 재생하지 않는다.
 */
export function storyOwnsEntrance(pathname: string | null = currentPath()): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/event/story') return true;
  if (path !== '/event') return false;
  if (typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver) return false;
  return !hasSeenStory();
}

function currentPath(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.location.pathname;
  } catch {
    return null;
  }
}
