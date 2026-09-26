import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_ROLE_LABEL, adminAccessMessage, resolveAdminAccess } from './access.ts';
import { ADMIN_LOGIN_ROUTE, ADMIN_MENU } from './navigation.ts';

const session = (email: string | null = 'ops@example.com') => ({ user: { email } });

test('1. 비로그인 상태는 로그인 화면으로 보낸다', () => {
  assert.deepEqual(resolveAdminAccess({ authHydrated: true, session: null }), { status: 'SIGNED_OUT' });
  assert.equal(ADMIN_LOGIN_ROUTE, '/admin/login');
});

test('세션을 아직 모르면 아무 판단도 하지 않는다', () => {
  assert.deepEqual(resolveAdminAccess({ authHydrated: false, session: null }), { status: 'LOADING' });
  assert.deepEqual(resolveAdminAccess({ authHydrated: true, session: session(), role: undefined }), { status: 'LOADING' }, '권한 조회 전에는 거부하지 않는다');
});

test('2~3. admin 과 reviewer 는 모두 운영 화면에 들어간다', () => {
  assert.deepEqual(resolveAdminAccess({ authHydrated: true, session: session(), role: 'admin' }), { status: 'ALLOWED', role: 'admin', email: 'ops@example.com' });
  assert.deepEqual(resolveAdminAccess({ authHydrated: true, session: session('rev@example.com'), role: 'reviewer' }), { status: 'ALLOWED', role: 'reviewer', email: 'rev@example.com' });
  assert.equal(ADMIN_ROLE_LABEL.admin, '관리자');
  assert.equal(ADMIN_ROLE_LABEL.reviewer, '검수자');
});

test('4. 일반 사용자 계정은 거부하되 일반 로그인으로 되돌리지 않는다', () => {
  const access = resolveAdminAccess({ authHydrated: true, session: session('user@example.com'), role: null });
  assert.deepEqual(access, { status: 'FORBIDDEN', email: 'user@example.com' });
  assert.equal(adminAccessMessage('FORBIDDEN'), '관리자 권한이 없는 계정입니다.');
});

test('권한 조회가 실패하면 권한 없음으로 단정하지 않는다', () => {
  const access = resolveAdminAccess({ authHydrated: true, session: session(), error: 'REVIEW_CONNECTION_REQUIRED' });
  assert.equal(access.status, 'ERROR');
  assert.equal(adminAccessMessage('REVIEW_CONNECTION_REQUIRED'), '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  assert.match(adminAccessMessage('SOMETHING_ELSE'), /권한을 확인하지 못했어요/);
});

test('5. 로그아웃하면 다시 로그인 화면 상태가 된다', () => {
  // 로그아웃 = 세션 없음. 화면은 ADMIN_LOGIN_ROUTE 로 보낸다.
  assert.deepEqual(resolveAdminAccess({ authHydrated: true, session: null, role: 'admin' }), { status: 'SIGNED_OUT' }, '세션이 없으면 이전 role 은 의미가 없다');
});

test('관리자 메뉴는 기존 화면을 그대로 가리킨다', () => {
  assert.deepEqual(ADMIN_MENU.map(item => item.href), [
    '/admin', '/admin/announcements', '/admin/learning-status', '/admin/rule-review', '/admin/listing-bindings',
  ]);
  assert.deepEqual(ADMIN_MENU.map(item => item.label), ['대시보드', '공고 관리', '학습·규칙 현황', 'Rule 검수', 'Listing 연결']);
});
