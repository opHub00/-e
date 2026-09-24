import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearningRows, summarizeLearningRows, NOT_OBSERVABLE_RULE_NOTE, type LearningStatusInput } from './domain.ts';
import { LearningStatusRepository, type LearningStatusClient } from './repository.ts';

const GODEOK = '11111111-1111-4111-8111-111111111111';
const SAMDO = '22222222-2222-4222-8222-222222222222';
const GODEOK_SET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const godeokAnnouncement = {
  id: GODEOK, title: '힐스테이트 고덕엘리스트 A65BL 공공분양주택', source: 'LH', publisher: '한국토지주택공사',
  announcementDate: '2026-09-11', regionName: '경기도 평택시', updatedAt: '2026-09-23T10:00:00Z', createdAt: '2026-09-11T00:00:00Z',
};
const samdoAnnouncement = {
  id: SAMDO, title: '삼도이동 1지구 토지임대부 공공분양주택', source: 'LH', publisher: '한국토지주택공사',
  announcementDate: '2026-08-01', regionName: '경기도 평택시', updatedAt: '2026-09-01T10:00:00Z', createdAt: '2026-08-01T00:00:00Z',
};
const godeokRuleSet = {
  id: GODEOK_SET, announcementId: GODEOK, version: 'OFFICIAL-2026-09-11-transcription-1',
  sourceStatus: 'OFFICIAL_VERIFIED' as const, approvedAt: '2026-09-23T09:00:00Z', effectiveDate: '2026-09-11', isActive: true,
};
const godeokReview = {
  ruleSetId: GODEOK_SET, observable: true as const, totalRules: 46, approved: 46, edited: 0,
  pending: 0, held: 0, rejected: 0, lifecycleStatus: 'IN_REVIEW', documentChanged: false,
};

const input = (over: Partial<LearningStatusInput> = {}): LearningStatusInput => ({
  announcements: [godeokAnnouncement, samdoAnnouncement],
  ruleSets: [godeokRuleSet],
  bindings: [{ listingId: 'apt-2026000438-2026000438', announcementId: GODEOK, boundRuleSetId: GODEOK_SET, updatedAt: '2026-09-23T09:30:00Z' }],
  reviews: [godeokReview],
  ...over,
});
const rowFor = (id: string, over: Partial<LearningStatusInput> = {}) => buildLearningRows(input(over)).find(row => row.announcementId === id)!;

test('1~5. 고덕 A65BL 은 규칙 46개·승인 46개·활성·연결까지 관측된 대로 표시한다', () => {
  const row = rowFor(GODEOK);
  assert.equal(row.title, '힐스테이트 고덕엘리스트 A65BL 공공분양주택');
  assert.equal(row.ruleCount, 46);
  assert.equal(row.approvedCount, 46);
  assert.equal(row.reviewObservable, true);
  assert.equal(row.version, 'OFFICIAL-2026-09-11-transcription-1');
  assert.equal(row.officialLabel, '공식 공고 기준');
  assert.deepEqual(row.listingIds, ['apt-2026000438-2026000438']);
  const byKey = Object.fromEntries(row.stages.map(stage => [stage.key, stage]));
  assert.equal(byKey.collected.state, 'OBSERVED');
  assert.equal(byKey.ruleSet.state, 'OBSERVED');
  assert.equal(byKey.review.state, 'OBSERVED');
  assert.equal(byKey.active.state, 'OBSERVED');
  assert.equal(byKey.binding.state, 'OBSERVED');
  assert.match(byKey.review.detail, /검수 상태 확인 가능 · 승인 46\/46/);
  assert.deepEqual(row.notes, [], '모두 승인·연결된 공고에는 경고가 없다');
});

test('6. 검수 콘솔로 갈 수 있도록 활성 rule set id 를 준다', () => {
  assert.equal(rowFor(GODEOK).ruleSetId, GODEOK_SET);
  assert.equal(rowFor(SAMDO).ruleSetId, null, '활성 규칙이 없으면 콘솔 링크도 없다');
});

test('7. 데이터가 없으면 빈 목록과 0 요약을 준다', () => {
  const rows = buildLearningRows({ announcements: [], ruleSets: [], bindings: [], reviews: [] });
  assert.deepEqual(rows, []);
  assert.deepEqual(summarizeLearningRows(rows), { announcements: 0, withActiveRules: 0, reviewObservable: 0, bound: 0, needsAttention: 0 });
});

test('8. 권한이 없으면 아무것도 읽지 않고 FORBIDDEN 을 돌려준다', async () => {
  const calls: string[] = [];
  const client: LearningStatusClient = {
    from: table => { calls.push(`from:${table}`); return { select: () => Promise.resolve({ data: [], error: null }) }; },
    rpc: fn => { calls.push(`rpc:${fn}`); return Promise.resolve({ data: { role: null }, error: null }); },
  };
  const result = await new LearningStatusRepository(client).load();
  assert.deepEqual(result, { status: 'FAILED', code: 'FORBIDDEN' });
  assert.deepEqual(calls, ['rpc:get_assessment_review_access'], '권한 확인 외에는 질의하지 않는다');
});

test('9. 삼도는 활성 규칙이 없다는 사실만 말하고, 규칙이 없다고 단정하지 않는다', () => {
  const row = rowFor(SAMDO);
  assert.equal(row.ruleSetId, null);
  assert.equal(row.ruleCount, null, '0개가 아니라 확인 불가다');
  assert.equal(row.approvedCount, null);
  assert.equal(row.reviewObservable, false);
  assert.equal(row.officialLabel, '확인 불가');
  const byKey = Object.fromEntries(row.stages.map(stage => [stage.key, stage]));
  assert.equal(byKey.ruleSet.state, 'NOT_OBSERVABLE');
  assert.equal(byKey.ruleSet.detail, '활성화된 규칙 없음');
  assert.equal(byKey.review.detail, '검수 상태 확인 불가');
  assert.ok(row.notes.includes(NOT_OBSERVABLE_RULE_NOTE), '비활성·검수 중 규칙은 볼 수 없다는 사실을 함께 적는다');
  for (const note of row.notes) assert.doesNotMatch(note, /추출 중|학습 중|진행 중/, '진행 상태를 추정하지 않는다');
});

test('10. 이 화면은 읽기만 한다. 쓰기 RPC 를 호출하지 않는다', async () => {
  const calls: string[] = [];
  const client: LearningStatusClient = {
    from: table => { calls.push(`from:${table}`); return { select: () => Promise.resolve({ data: [], error: null }) }; },
    rpc: (fn, args) => {
      calls.push(`rpc:${fn}`);
      if (fn === 'get_assessment_review_access') return Promise.resolve({ data: { role: 'admin' }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
  const result = await new LearningStatusRepository(client).load();
  assert.equal(result.status, 'READY');
  const forbidden = ['mutate_assessment_rule_review', 'activate_assessment_rule_set', 'activate_reviewed_assessment_rule_set',
    'approve_assessment_rule_set', 'bind_listing_to_assessment_rule_set', 'unbind_listing_from_assessment_rule_set',
    'import_assessment_rule_package', 'seed_assessment_rule_review', 'set_assessment_review_member'];
  for (const call of calls) {
    assert.ok(!forbidden.some(name => call.includes(name)), `${call} 은 이 화면에서 호출되면 안 된다`);
    assert.ok(call.startsWith('from:') || ['rpc:get_assessment_review_access', 'rpc:load_assessment_rule_review_workspace'].includes(call), `${call} 은 허용된 읽기 호출이 아니다`);
  }
});

test('검수 상태를 못 읽으면 확인 불가로 남기고 화면은 계속 뜬다', async () => {
  const client: LearningStatusClient = {
    from: table => ({
      select: () => Promise.resolve({
        data: table === 'announcements' ? [{ id: GODEOK, title: '고덕', source: 'LH', publisher: 'LH', announcement_date: '2026-09-11', region_name: '평택', created_at: 'c', updated_at: 'u' }]
          : table === 'assessment_rule_sets' ? [{ id: GODEOK_SET, announcement_id: GODEOK, version: 'v1', source_status: 'OFFICIAL_VERIFIED', approved_at: 'a', effective_date: 'e', is_active: true }]
            : [{ listing_id: 'apt-1', announcement_id: GODEOK, bound_rule_set_id: GODEOK_SET, updated_at: 'u' }],
        error: null,
      }),
    }),
    rpc: fn => Promise.resolve(fn === 'get_assessment_review_access'
      ? { data: { role: 'reviewer' }, error: null }
      : { data: null, error: { message: 'boom', code: 'PGRST' } }),
  };
  const result = await new LearningStatusRepository(client).load();
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  const row = buildLearningRows(result.input)[0];
  assert.equal(row.ruleSetId, GODEOK_SET, '활성 규칙 자체는 관측된다');
  assert.equal(row.reviewObservable, false);
  assert.equal(row.ruleCount, null);
  assert.ok(row.notes.some(note => note.startsWith('검수 상태 확인 불가')));
});

test('승인이 덜 됐거나 원문이 바뀌면 관측된 사실로 경고한다', () => {
  const partial = rowFor(GODEOK, { reviews: [{ ...godeokReview, approved: 40, pending: 4, held: 2, rejected: 1, documentChanged: true }] });
  assert.equal(partial.approvedCount, 40);
  assert.ok(partial.notes.some(note => note.includes('재검수가 필요해요')));
  assert.ok(partial.notes.some(note => note.includes('아직 승인되지 않은 규칙 6개')));
  assert.ok(partial.notes.some(note => note.includes('반려된 규칙 1개')));
});

test('연결된 listing 이 없으면 사용자 판정에 쓰이지 않는다는 사실을 알린다', () => {
  const row = rowFor(GODEOK, { bindings: [] });
  assert.deepEqual(row.listingIds, []);
  assert.ok(row.notes.some(note => note.includes('연결된 listing 이 없어')));
  assert.equal(row.stages.find(stage => stage.key === 'binding')!.state, 'NOT_OBSERVED');
});

test('요약은 관측된 것만 센다', () => {
  assert.deepEqual(summarizeLearningRows(buildLearningRows(input())), {
    announcements: 2, withActiveRules: 1, reviewObservable: 1, bound: 1, needsAttention: 1,
  });
});
