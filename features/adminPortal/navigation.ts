import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';

/** 관리자 화면 경로. 기존 화면을 그대로 가리키고, 새 화면만 더한다. */
export const ADMIN_LOGIN_ROUTE = '/admin/login' as const;
export const ADMIN_HOME_ROUTE = '/admin' as const;

export type AdminMenuItem = {
  label: string;
  /** 운영자가 이 화면에서 무엇을 하는지 한 줄로. 사이드바에서 메뉴명 아래에 붙는다. */
  hint: string;
  href: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
};

export type AdminMenuGroup = { title: string; items: AdminMenuItem[] };

/**
 * 관리자 메뉴.
 *
 * 묶음은 운영자가 하는 일 기준이다. 내부 구조(rule set·binding·extraction)로 나누지 않는다.
 * 메뉴명도 화면에서 하는 일로 적는다. 경로는 기존 것을 그대로 두어 링크가 깨지지 않게 했다.
 */
export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
  {
    title: '운영 현황',
    items: [
      { label: '대시보드', hint: '오늘의 운영 상태 한눈에', href: '/admin', icon: 'dashboard' },
    ],
  },
  {
    title: '공고',
    items: [
      { label: '공고 관리', hint: '수집된 공고와 대표 이미지', href: '/admin/announcements', icon: 'campaign' },
    ],
  },
  {
    title: '분석',
    items: [
      { label: '분석 현황', hint: '공고별 분석 준비 단계', href: '/admin/learning-status', icon: 'insights' },
      { label: '규칙 검수', hint: '추출된 규칙 확인·승인', href: '/admin/rule-review', icon: 'fact-check' },
      { label: '공고-규칙 연결', hint: '어떤 공고에 어떤 규칙을 쓸지', href: '/admin/listing-bindings', icon: 'link' },
      { label: '가점 계산식', hint: '청약가점 배점표와 시뮬레이터', href: '/admin/scoring', icon: 'calculate' },
    ],
  },
  {
    title: '서비스',
    items: [
      { label: '지식베이스', hint: 'AI 가 참고하는 문서', href: '/admin/knowledge', icon: 'library-books' },
      { label: '사용자', hint: '가입자 현황', href: '/admin/users', icon: 'group' },
      { label: '관리자 계정', hint: '운영 권한 관리', href: '/admin/admins', icon: 'admin-panel-settings' },
    ],
  },
];

export const ADMIN_MENU: AdminMenuItem[] = ADMIN_MENU_GROUPS.flatMap(group => group.items);

/**
 * 지금 열린 화면에 해당하는 메뉴.
 *
 * 하위 경로(`/admin/scoring/xxx`)에서도 부모 메뉴가 선택된 것으로 보여야 한다.
 * 단 `/admin` 은 모든 경로의 앞머리라서 정확히 같을 때만 고른다.
 */
export function activeMenuHref(pathname: string): string | null {
  const exact = ADMIN_MENU.find(item => item.href === pathname);
  if (exact) return exact.href;
  const nested = ADMIN_MENU
    .filter(item => item.href !== ADMIN_HOME_ROUTE && pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];
  return nested?.href ?? null;
}
