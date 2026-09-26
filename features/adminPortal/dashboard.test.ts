import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearningRows, type LearningStatusInput } from '../adminLearningStatus/domain.ts';
import { AUTOMATION_STATUS_NOTE, RLS_LIMIT_NOTE, buildAdminDashboard } from './dashboard.ts';

const GODEOK = '11111111-1111-4111-8111-111111111111';
const SAMDO = '22222222-2222-4222-8222-222222222222';
const SET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const input = (over: Partial<LearningStatusInput> = {}): LearningStatusInput => ({
  announcements: [
    { id: GODEOK, title: '힐스테이트 고덕엘리스트 A65BL 공공분양주택', source: 'LH', publisher: '한국토지주택공사', announcementDate: '2026-09-11', regionName: '경기도 평택시', updatedAt: '2026-09-23T10:00:00Z', createdAt: '2026-09-11T00:00:00Z' },
    { id: SAMDO, title: '삼도이동 1지구 토지임대부 공공분양주택', source: 'LH', publisher: '한국토지주택공사', announcementDate: '2026-08-01', regionName: '경기도 평택시', updatedAt: '2026-09-01T10:00:00Z', createdAt: '2026-08-01T00:00:00Z' },
  ],
  ruleSets: [{ id: SET, announcementId: GODEOK, version: 'OFFICIAL-2026-09-11-transcription-1', sourceStatus: 'OFFICIAL_VERIFIED', approvedAt: '2026-09-23T09:00:00Z', effectiveDate: '2026-09-11', isActive: true }],
  bindings: [{ listingId: 'apt-2026000438-2026000438', announcementId: GODEOK, boundRuleSetId: SET, updatedAt: '2026-09-23T09:30:00Z' }],
  reviews: [{ ruleSetId: SET, observable: true, totalRules: 46, approved: 46, edited: 0, pending: 0, held: 0, rejected: 0, lifecycleStatus: 'IN_REVIEW', documentChanged: false }],
  ...over,
});
const dashboard = (over: Partial<LearningStatusInput> = {}) => buildAdminDashboard(buildLearningRows(input(over)));

test('6~9. 고덕 1건이 분석 가능 공고로 계산되고 46/46·활성·연결이 함께 나온다', () => {
  const summary = dashboard();
  assert.equal(summary.collectedAnnouncements, 2, '수집된 공고는 삼도까지 2건');
  assert.equal(summary.analyzableAnnouncements, 1, '판정이 열리는 공고는 고덕 1건');
  assert.equal(summary.activeRuleSets, 1);
  assert.equal(summary.approvedRules, 46);
  assert.equal(summary.listingBindings, 1);
  const godeok = summary.analyzable[0];
  assert.equal(godeok.title, '힐스테이트 고덕엘리스트 A65BL 공공분양주택');
  assert.equal(godeok.approvedCount, 46);
  assert.equal(godeok.ruleCount, 46);
  assert.equal(godeok.officialLabel, '공식 공고 기준');
  assert.deepEqual(godeok.listingIds, ['apt-2026000438-2026000438']);
  assert.equal(godeok.ruleSetId, SET, '검수 콘솔로 갈 수 있다');
});

test('10. 근거 없는 학습 중 표시를 만들지 않는다', () => {
  assert.equal(AUTOMATION_STATUS_NOTE, '자동 학습 상태: 현재 추적 데이터 없음');
  for (const text of [AUTOMATION_STATUS_NOTE, RLS_LIMIT_NOTE]) {
    assert.doesNotMatch(text, /학습 중|추출 중|진행률|\d+%/, '진행 상태를 지어내지 않는다');
  }
  const summary = dashboard();
  assert.equal(Object.keys(summary).includes('progress'), false, '진행률 필드 자체가 없다');
});

test('활성 규칙이 없는 공고는 분석 가능에 넣지 않는다', () => {
  const summary = dashboard({ ruleSets: [], reviews: [] });
  assert.equal(summary.collectedAnnouncements, 2);
  assert.equal(summary.analyzableAnnouncements, 0);
  assert.equal(summary.activeRuleSets, 0);
  assert.equal(summary.approvedRules, 0);
  assert.equal(summary.needsAttention, 2, '두 공고 모두 관측된 제약이 있다');
});

test('활성 규칙이 있어도 listing 연결이 없으면 분석 가능이 아니다', () => {
  const summary = dashboard({ bindings: [] });
  assert.equal(summary.activeRuleSets, 1);
  assert.equal(summary.analyzableAnnouncements, 0, '판정이 열리지 않는다');
  assert.equal(summary.listingBindings, 0);
});

test('승인 규칙 수를 못 읽으면 0 으로 세지 않고 확인 불가로 표시한다', () => {
  const summary = dashboard({ reviews: [{ ruleSetId: SET, observable: false, reason: 'RULE_REVIEW_WORKSPACE_NOT_FOUND' }] });
  assert.equal(summary.approvedRules, 0, '합계에 넣지 않는다');
  assert.equal(summary.approvedRulesUnknownFor, 1, '확인 불가인 공고 수를 따로 센다');
  assert.equal(summary.analyzable[0].approvedCount, null);
  assert.equal(summary.analyzable[0].ruleCount, null);
});

test('데이터가 없으면 전부 0 이다', () => {
  const summary = buildAdminDashboard(buildLearningRows({ announcements: [], ruleSets: [], bindings: [], reviews: [] }));
  assert.deepEqual(summary, {
    collectedAnnouncements: 0, analyzableAnnouncements: 0, activeRuleSets: 0,
    approvedRules: 0, approvedRulesUnknownFor: 0, listingBindings: 0, needsAttention: 0, analyzable: [],
  });
});
