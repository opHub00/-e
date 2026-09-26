import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_MENU, ADMIN_MENU_GROUPS, activeMenuHref } from './navigation.ts';
import { ADMIN_STATUS, countLabel, dateLabel, statusOf } from './status.ts';
import {
  buildAnnouncementRows, regionChoices, searchAnnouncementRows, selectAnnouncementRows,
} from './announcementRows.ts';
import type { LearningRow } from '../adminLearningStatus/domain.ts';

const row = (over: Partial<LearningRow> = {}): LearningRow => ({
  announcementId: 'a1', title: '가나 아파트', source: 'applyhome', publisher: 'LH', regionName: '경기',
  announcementDate: '2026-09-01', updatedAt: '2026-09-10T00:00:00Z', officialLabel: '공식 공고 기준',
  ruleSetId: 'rs1', version: 'v1', ruleCount: 10, approvedCount: 10, reviewObservable: true,
  lifecycleStatus: 'APPROVED', listingIds: ['l1'], stages: [], notes: [],
  ...over,
} as LearningRow);

test('메뉴는 운영자가 하는 일로 묶여 있고, 각 항목에 설명이 붙는다', () => {
  assert.ok(ADMIN_MENU_GROUPS.length >= 3, '묶음이 있어야 목록이 길어져도 읽힌다');
  for (const group of ADMIN_MENU_GROUPS) {
    assert.ok(group.title.trim(), '묶음에 이름이 있어야 한다');
    assert.ok(group.items.length, `${group.title}: 빈 묶음`);
  }
  for (const item of ADMIN_MENU) {
    assert.ok(item.label.trim(), '메뉴 이름이 있어야 한다');
    assert.ok(item.hint.trim(), `${item.label}: 무엇을 하는 화면인지 한 줄 설명이 있어야 한다`);
    assert.match(item.href, /^\/admin/, `${item.label}: 관리자 경로여야 한다`);
    assert.ok(item.icon, `${item.label}: 아이콘이 있어야 한다`);
  }
  assert.equal(new Set(ADMIN_MENU.map(item => item.href)).size, ADMIN_MENU.length, '같은 경로가 두 번 있으면 안 된다');
});

test('메뉴 이름에 내부 기술 용어를 쓰지 않는다', () => {
  // rule set·binding·extraction 같은 말은 운영자가 아니라 코드의 말이다.
  const jargon = /(rule\s?set|binding|extraction|revision|RPC|RLS|schema)/i;
  for (const item of ADMIN_MENU) {
    assert.doesNotMatch(item.label, jargon, `${item.label}: 메뉴 이름에 내부 용어`);
    assert.doesNotMatch(item.hint, jargon, `${item.label}: 설명에 내부 용어`);
  }
});

test('하위 화면에서도 부모 메뉴가 선택된 것으로 보인다', () => {
  assert.equal(activeMenuHref('/admin'), '/admin');
  assert.equal(activeMenuHref('/admin/scoring'), '/admin/scoring');
  assert.equal(activeMenuHref('/admin/scoring/general-private-standard'), '/admin/scoring');
  assert.equal(activeMenuHref('/admin/announcements'), '/admin/announcements');
  // `/admin` 은 모든 경로의 앞머리라서, 하위 화면에서 대시보드가 선택되면 안 된다.
  assert.notEqual(activeMenuHref('/admin/scoring/x'), '/admin');
  assert.equal(activeMenuHref('/admin/login'), null, '메뉴에 없는 화면은 아무것도 고르지 않는다');
});

test('상태 말과 색은 한 곳에서만 정한다', () => {
  for (const [key, status] of Object.entries(ADMIN_STATUS)) {
    assert.ok(status.label.trim(), `${key}: 표시할 말이 있어야 한다`);
    assert.ok(status.tone, `${key}: 색이 있어야 한다`);
  }
  assert.equal(statusOf('ANALYZABLE').label, '분석 가능');
  assert.equal(statusOf('UNKNOWN').label, '확인 불가', '값을 모를 때 0 이나 없음으로 적지 않는다');
  assert.equal(statusOf('NOT_CONNECTED').label, '연결 전');
  // 판단이 서는 상태만 초록을 쓴다. 분류일 뿐인 상태에 초록을 쓰면 잘 돌아간다고 읽힌다.
  assert.equal(statusOf('CLOSED').tone, 'neutral');
  assert.equal(statusOf('INACTIVE').tone, 'neutral');
});

test('숫자와 날짜는 같은 방식으로 적는다', () => {
  assert.equal(countLabel(1234), '1,234건');
  assert.equal(countLabel(3, '개'), '3개');
  assert.equal(countLabel(null), '확인 불가', '모르는 값을 0 으로 적지 않는다');
  assert.equal(dateLabel('2026-09-27T10:00:00Z'), '2026.09.27');
  assert.equal(dateLabel(null), null);
  assert.equal(dateLabel('이상한 값'), null);
});

test('공고 검색은 띄어쓰기를 무시하고 제목·지역·사업주체를 함께 본다', () => {
  const rows = buildAnnouncementRows([
    row({ announcementId: 'a1', title: '검암역 푸르지오 프라베뉴' }),
    row({ announcementId: 'a2', title: '광명 시티프라디움', regionName: '경기', publisher: 'SH' }),
  ]);
  assert.equal(searchAnnouncementRows(rows, '검암역푸르지오').length, 1);
  assert.equal(searchAnnouncementRows(rows, '  광명 ').length, 1);
  assert.equal(searchAnnouncementRows(rows, 'SH').length, 1, '사업주체로도 찾을 수 있다');
  assert.equal(searchAnnouncementRows(rows, '').length, 2, '빈 검색어는 아무것도 거르지 않는다');
  assert.equal(searchAnnouncementRows(rows, '없는단지').length, 0);
});

test('검색·상태·지역 필터가 함께 걸린다', () => {
  const rows = buildAnnouncementRows([
    row({ announcementId: 'a1', title: '가 단지', regionName: '경기' }),
    row({ announcementId: 'a2', title: '나 단지', regionName: '서울', ruleSetId: null, listingIds: [] }),
    row({ announcementId: 'a3', title: '다 단지', regionName: '경기', listingIds: [] }),
  ]);
  assert.deepEqual(regionChoices(rows), ['경기', '서울']);
  assert.equal(selectAnnouncementRows(rows, { query: '', status: 'ALL', region: 'ALL' }).length, 3);
  assert.equal(selectAnnouncementRows(rows, { query: '', status: 'ANALYZABLE', region: 'ALL' }).length, 1);
  assert.equal(selectAnnouncementRows(rows, { query: '', status: 'ALL', region: '경기' }).length, 2);
  assert.equal(selectAnnouncementRows(rows, { query: '단지', status: 'NO_ACTIVE_RULES', region: '서울' }).length, 1);
  assert.equal(selectAnnouncementRows(rows, { query: '가', status: 'ALL', region: '서울' }).length, 0, '조건은 함께 걸린다');
});

test('분석 가능한 공고가 목록 맨 위로 온다', () => {
  const rows = buildAnnouncementRows([
    row({ announcementId: 'a1', title: '규칙 없음', ruleSetId: null, listingIds: [] }),
    row({ announcementId: 'a2', title: '분석 가능' }),
  ]);
  const sorted = selectAnnouncementRows(rows, { query: '', status: 'ALL', region: 'ALL' });
  assert.equal(sorted[0].title, '분석 가능', '운영자가 먼저 볼 것이 위에 있어야 한다');
});
