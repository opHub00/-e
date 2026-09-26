/** 관리자 화면 경로. 기존 화면을 그대로 가리키고, 새 화면만 더한다. */
export const ADMIN_LOGIN_ROUTE = '/admin/login' as const;
export const ADMIN_HOME_ROUTE = '/admin' as const;

export type AdminMenuItem = { label: string; href: string };

export const ADMIN_MENU: AdminMenuItem[] = [
  { label: '대시보드', href: '/admin' },
  { label: '공고 관리', href: '/admin/announcements' },
  { label: '학습·규칙 현황', href: '/admin/learning-status' },
  { label: 'Rule 검수', href: '/admin/rule-review' },
  { label: 'Listing 연결', href: '/admin/listing-bindings' },
];
