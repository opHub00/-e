import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAMDO_PERSONAS } from '../eventKiosk/samdo/personas.test-data.ts';
import { buildSamdoDualAssessment } from '../eventKiosk/samdoDual/evaluate.ts';
import { NoticePlatform } from './platform.ts';
import { createSamdoNoticeAdapter, noticePlatform } from '../eventKiosk/noticePlatform/index.ts';
import type { NoticeAdapter } from './types.ts';

test('generic platform preserves all nine Samdo persona semantics', () => {
  for (const persona of SAMDO_PERSONAS) {
    const legacy = buildSamdoDualAssessment(persona.input);
    const generic = noticePlatform.assessNotices(persona.input, ['samdo-1', 'samdo-2']);
    assert.equal(generic.length, 2);
    for (const result of generic) {
      const district = legacy.districts.find(item => item.district.id === result.noticeId)!;
      assert.deepEqual(result.evaluations.map(item => ({ type: item.supplyTypeId, eligibility: item.eligibility, stage: item.priorityStage, score: item.officialScore })),
        district.recommendation.evaluations.map(item => ({ type: item.supplyType, eligibility: item.eligibility, stage: item.stage, score: item.officialScore })), persona.id);
      assert.equal(result.recommendation.recommended?.supplyTypeId ?? null, district.recommendation.recommendedType?.supplyType ?? null);
    }
  }
});

test('notice registry supports N notices without cross-notice contamination', () => {
  const base = createSamdoNoticeAdapter('samdo-1');
  const synthetic: NoticeAdapter = structuredClone({ ...base, assess: undefined }) as unknown as NoticeAdapter;
  synthetic.notice.id = 'synthetic-3'; synthetic.notice.title = '합성 검증 공고'; synthetic.notice.listing.id = 'synthetic-listing-3';
  synthetic.rulePackage.noticeId = 'synthetic-3'; synthetic.rulePackage.id = 'synthetic-rule-3';
  synthetic.ragSource.noticeId = 'synthetic-3'; synthetic.ragSource.id = 'synthetic-rag-3';
  synthetic.assess = input => {
    const result = base.assess(input);
    return { ...result, noticeId: 'synthetic-3', listingId: 'synthetic-listing-3', rulePackageId: 'synthetic-rule-3' };
  };
  const platform = new NoticePlatform([createSamdoNoticeAdapter('samdo-1'), createSamdoNoticeAdapter('samdo-2'), synthetic]);
  const results = platform.assessNotices(SAMDO_PERSONAS[0].input, ['samdo-1', 'samdo-2', 'synthetic-3']);
  assert.deepEqual(results.map(item => item.noticeId), ['samdo-1', 'samdo-2', 'synthetic-3']);
  assert.equal(new Set(results.map(item => item.listingId)).size, 3);
  assert.deepEqual(platform.compareAssessmentResults(results).orderedNoticeIds.sort(), ['samdo-1', 'samdo-2', 'synthetic-3']);
  assert.throws(() => new NoticePlatform([base, base]), /DUPLICATE_NOTICE_ID/);
});

test('generic presentation and RAG remain notice-scoped', () => {
  const active = noticePlatform.getActiveNotices();
  assert.deepEqual(active.map(item => item.id), ['samdo-1', 'samdo-2']);
  assert.equal(noticePlatform.getNoticePresentation('samdo-2').managementNumber, '2026000435');
  const evidence = noticePlatform.retrieveNoticeEvidence('samdo-2', '토지임대료 59㎡');
  assert.ok(evidence.length > 0);
  assert.ok(evidence.every(item => !JSON.stringify(item).includes('5834b996f9d49ea7dc6e45fc36312b2fba1b4d5fa3b5d1bcd3a7d8e9189b90d2')));
  assert.throws(() => noticePlatform.assessNotice(SAMDO_PERSONAS[0].input, 'missing'), /NOTICE_NOT_FOUND/);
});
