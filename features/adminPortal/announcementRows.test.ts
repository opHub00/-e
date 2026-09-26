import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearningRows, NOT_OBSERVABLE_RULE_NOTE, type LearningStatusInput } from '../adminLearningStatus/domain.ts';
import { buildAnnouncementRows, filterAnnouncementRows, sortAnnouncementRows } from './announcementRows.ts';
import { RLS_LIMIT_NOTE } from './dashboard.ts';
import { ADMIN_MENU } from './navigation.ts';

const GODEOK = '11111111-1111-4111-8111-111111111111';
const SAMDO = '22222222-2222-4222-8222-222222222222';
const SET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const input = (over: Partial<LearningStatusInput> = {}): LearningStatusInput => ({
  announcements: [
    { id: GODEOK, title: '힐스테이트 고덕엘리스트 A65BL 공공분양주택', source: 'LH', publisher: '한국토지주택공사', announcementDate: '2026-09-11', regionName: '경기도 평택시', updatedAt: '2026-09-23T10:00:00Z', createdAt: '2026-09-11T00:00:00Z' },
    { id: SAMDO, title: '삼도이동 1지구 토지임대부 공공분양주택', source: 'LH', publisher: '한국토지주택공사', announcementDate: '2026-08-01', regionName: '경기도 평택시', updatedAt: '2026-09-01T10:00:00Z', createdAt: '2026-08-01T00:00:00Z' },
  ],
  ruleSets: [{ id: SET, announcementId: GODEOK, version: 'OFFICIAL-2026-09-11-transcription-1', sourceStatus: 'OFFICIAL_VERIFIED', approvedAt: 'a', effectiveDate: '2026-09-11', isActive: true }],
  bindings: [{ listingId: 'apt-2026000438-2026000438', announcementId: GODEOK, boundRuleSetId: SET, updatedAt: 'u' }],
  reviews: [{ ruleSetId: SET, observable: true, totalRules: 46, approved: 46, edited: 0, pending: 0, held: 0, rejected: 0, lifecycleStatus: 'IN_REVIEW', documentChanged: false }],
  ...over,
});
const rows = (over: Partial<LearningStatusInput> = {}) => sortAnnouncementRows(buildAnnouncementRows(buildLearningRows(input(over))));

test('11. 관측 가능한 공고가 모두 목록에 나온다', () => {
  const list = rows();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(row => row.announcementId), [GODEOK, SAMDO], '분석 가능한 공고가 먼저 온다');
});

test('12. 고덕 행은 규칙·승인·연결·검증이 모두 관측값으로 찬다', () => {
  const godeok = rows()[0];
  assert.equal(godeok.title, '힐스테이트 고덕엘리스트 A65BL 공공분양주택');
  assert.equal(godeok.region, '경기도 평택시');
  assert.equal(godeok.publisher, '한국토지주택공사');
  assert.equal(godeok.announcementDate, '2026-09-11');
  assert.equal(godeok.officialLabel, '공식 공고 기준');
  assert.equal(godeok.ruleCount, '46개');
  assert.equal(godeok.approvedCount, '46개');
  assert.equal(godeok.bindingLabel, '1건');
  assert.equal(godeok.analyzable, true);
  assert.equal(godeok.updatedAt, '2026-09-23');
  assert.ok(godeok.statuses.some(status => status.key === 'ANALYZABLE' && status.label === '분석 가능'));
  assert.equal(godeok.ruleSetId, SET, '15. 검수 콘솔로 갈 수 있다');
});

test('13. 활성 규칙이 없는 공고 문구는 단정하지 않는다', () => {
  const samdo = rows().find(row => row.announcementId === SAMDO)!;
  assert.equal(samdo.analyzable, false);
  assert.equal(samdo.ruleCount, '확인 불가', '0개라고 쓰지 않는다');
  assert.equal(samdo.approvedCount, '확인 불가');
  assert.equal(samdo.bindingLabel, '없음');
  assert.equal(samdo.officialLabel, '확인 불가');
  const labels = samdo.statuses.map(status => status.label);
  assert.ok(labels.includes('활성 규칙 없음'));
  assert.ok(!labels.includes('분석 가능'));
  for (const label of labels) assert.doesNotMatch(label, /학습 중|추출 중|진행/, '근거 없는 상태를 쓰지 않는다');
  assert.ok(samdo.notes.includes(NOT_OBSERVABLE_RULE_NOTE));
  assert.match(RLS_LIMIT_NOTE, /검수 중 또는 비활성 규칙 세트는 현재 관리자 API에서 조회할 수 없습니다/);
});

test('활성 규칙은 있지만 연결이 없으면 분석 가능이 아니다', () => {
  const list = rows({ bindings: [] });
  const godeok = list.find(row => row.announcementId === GODEOK)!;
  assert.equal(godeok.analyzable, false);
  assert.ok(godeok.statuses.some(status => status.key === 'NOT_BOUND'));
  assert.ok(!godeok.statuses.some(status => status.key === 'ANALYZABLE'));
});

test('검수 상태를 못 읽으면 "검수 확인 필요"로 표시한다', () => {
  const godeok = rows({ reviews: [{ ruleSetId: SET, observable: false, reason: 'RULE_REVIEW_WORKSPACE_NOT_FOUND' }] })[0];
  assert.ok(godeok.statuses.some(status => status.key === 'REVIEW_UNKNOWN' && status.label === '검수 확인 필요'));
  assert.equal(godeok.approvedCount, '확인 불가');
});

test('필터는 관측값 기준으로만 나눈다', () => {
  const list = rows();
  assert.equal(filterAnnouncementRows(list, 'ALL').length, 2);
  assert.deepEqual(filterAnnouncementRows(list, 'ANALYZABLE').map(row => row.announcementId), [GODEOK]);
  assert.deepEqual(filterAnnouncementRows(list, 'NO_ACTIVE_RULES').map(row => row.announcementId), [SAMDO]);
});

test('14·16. 상세·검수·연결로 가는 경로가 관리자 메뉴와 같다', () => {
  const hrefs = ADMIN_MENU.map(item => item.href);
  assert.ok(hrefs.includes('/admin/learning-status'), '상세 상태는 학습 현황 화면을 재사용한다');
  assert.ok(hrefs.includes('/admin/rule-review'));
  assert.ok(hrefs.includes('/admin/listing-bindings'));
});
