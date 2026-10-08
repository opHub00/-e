import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { activeEventDataset } from '../../data/events/activeEvent.ts';
import { buildRuleFactInventory } from './adaptiveAssessment.ts';
import { sendChat, startChat } from './consult.ts';
import { evaluateEvent } from './evaluate.ts';
import { loadEvent } from './eventConfig.ts';
import { phase4Personas } from './phase4Personas.ts';
import {
  EVIDENCE_STATUS_LABELS,
  FACT_LABELS,
  KIOSK_STATUS_LABELS,
  OFFICIAL_SCORE_STATUS_LABELS,
  containsRawDomainKey,
  isRawDomainKey,
  userFacingFactLabel,
  userFacingLabels,
} from './presentation.ts';

const event = loadEvent(activeEventDataset);
const REF = new Date('2026-10-29T09:00:00+09:00');

test('every frozen event fact has a user-facing label and raw keys never fall through', () => {
  const inventory = buildRuleFactInventory(event.dataset);
  assert.equal(inventory.length, 46);
  for (const row of inventory) {
    assert.ok(FACT_LABELS[row.factKey], row.factKey);
    const label = userFacingFactLabel(row.factKey);
    assert.notEqual(label, row.factKey);
    assert.equal(isRawDomainKey(label), false, `${row.factKey} -> ${label}`);
  }
  assert.equal(userFacingFactLabel('score.applicantDisabled'), '신청자 등록장애인 여부');
  assert.equal(userFacingFactLabel('event.futureUnknownFact'), '추가 자격 정보');
  assert.equal(userFacingFactLabel('확인 필요 · score.applicantDisabled'), `확인 필요 · ${FACT_LABELS['score.applicantDisabled']}`);
  assert.deepEqual(userFacingLabels(['score.applicantDisabled', 'score.applicantDisabled']), ['신청자 등록장애인 여부']);
});

test('domain enums and user-facing status copy stay separated in one contract', () => {
  assert.deepEqual(KIOSK_STATUS_LABELS, {
    COMPLETE: '신청 가능', NEEDS_USER_INPUT: '추가 확인 필요', INELIGIBLE: '신청 어려움', UNAVAILABLE: '현재 분석 불가',
  });
  assert.deepEqual(OFFICIAL_SCORE_STATUS_LABELS, {
    AVAILABLE: '공식 배점', NOT_APPLICABLE: '해당 없음', PENDING: '정보·서류 확인 필요',
  });
  assert.deepEqual(EVIDENCE_STATUS_LABELS, { PENDING: '서류 확인 필요', REVIEW_REQUIRED: '서류 확인 필요' });
});

test('all display-ready outcome fields are free of raw fact and rule keys', () => {
  for (const persona of phase4Personas) {
    const evaluation = evaluateEvent(event, persona.initialAnswers, REF);
    for (const outcome of evaluation.outcomes) {
      const visible = [
        ...outcome.advantages, ...outcome.cautions, ...outcome.satisfied, ...outcome.failed,
        ...outcome.missing, ...outcome.warnings, ...outcome.wanpan.factors.map(item => item.label),
        ...(outcome.officialScore?.items.map(item => item.label) ?? []),
        ...(outcome.officialScoreState.reason ? [outcome.officialScoreState.reason] : []),
        ...(outcome.stageLabel ? [outcome.stageLabel] : []),
        ...(outcome.stageExplanation ? [outcome.stageExplanation] : []),
        ...outcome.evidence.flatMap(item => [item.label, item.section]),
      ];
      for (const value of visible) assert.equal(containsRawDomainKey(value), false, `${persona.id}: ${value}`);
      assert.ok(!JSON.stringify(visible).includes('score.applicantDisabled'), persona.id);
    }
  }
});

test('AI consultation maps pending official-score facts before returning display detail', async () => {
  const evaluation = evaluateEvent(event, phase4Personas[0]!.initialAnswers, REF);
  const outcome = structuredClone(evaluation.outcomes.find(item => item.result)!);
  assert.ok(outcome.result);
  outcome.result.officialScore = {
    status: 'PENDING', reason: '공식 점수 계산에 필요한 정보가 부족합니다.', missingInformation: ['score.applicantDisabled'],
  };
  const answered = await sendChat(event, startChat(event, evaluation, outcome), '공식 배점은 어떻게 계산되나요?');
  const detail = answered.messages.at(-1)?.detail ?? [];
  assert.ok(detail.length > 0);
  assert.ok(detail.every(value => !containsRawDomainKey(value)));
  assert.ok(detail.includes(FACT_LABELS['score.applicantDisabled']!));
});
