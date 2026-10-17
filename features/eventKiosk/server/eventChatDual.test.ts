import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SAMDO_PERSONAS } from '../samdo/personas.test-data.ts';
import { answerSamdoDualDeterministically, buildSamdoDualAssessment, buildSamdoDualChatContext, retrieveSamdoEvidence } from '../samdoDual/index.ts';
import type { EventChatRequest } from '../chat/contract.ts';
import { handleEventChat, resetEventChatRateLimitForTests } from './eventChat.ts';

const assessment = buildSamdoDualAssessment(SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input);

function request(question: string): EventChatRequest {
  return { question, history: [], context: buildSamdoDualChatContext(assessment, question), fallback: answerSamdoDualDeterministically(assessment, question), resolution: 'FREEFORM_RAG' };
}

function gemini(answer: unknown): Response {
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('dual chat sends structured districts and retrieved evidence to Gemini without profile facts', async () => {
  resetEventChatRateLimitForTests();
  let providerBody = '';
  const chatRequest = request('토지임대부 분양주택에서 토지와 건물의 소유 관계를 공고문 근거로 설명해줘');
  const evidence = retrieveSamdoEvidence(chatRequest.question).chunks[0];
  const result = await handleEventChat({ method: 'POST', body: chatRequest, headers: {}, ip: 'dual-success' }, {
    env: { GEMINI_API_KEY: 'server-secret' },
    requestId: () => 'dual-request',
    fetcher: async (_url, init) => {
      providerBody = String(init?.body ?? '');
      return gemini({
        text: '토지는 공공이 소유하고 건물은 수분양자가 소유하며, 월 토지임대료를 납부하는 방식이에요.',
        anchorSupplyType: chatRequest.context.focus.supplyType,
        anchorEligibility: chatRequest.context.focus.eligibility,
        anchorRecommendedType: chatRequest.context.recommendation.recommendedType ?? '없음',
        evidenceAnchors: [`${evidence.districtId}|${evidence.section}`],
      });
    },
  });
  assert.equal(result.status, 200);
  assert.equal('mode' in result.body && result.body.mode, 'llm');
  if ('evidence' in result.body) {
    assert.equal(result.body.evidence?.[0]?.noticeId, evidence.districtId);
    assert.equal(result.body.evidence?.[0]?.section, evidence.section);
    assert.ok(result.body.evidence?.[0]?.locator, 'admin locator remains available');
    assert.ok(!result.body.detail?.some(line => line.includes('공고문 근거 ·')), 'answer details and evidence are separate');
  } else assert.fail('grounded response must have evidence');
  assert.ok(providerBody.includes('2026000434'));
  assert.ok(providerBody.includes('2026000435'));
  assert.ok(providerBody.includes('retrievedEvidence'));
  for (const forbidden of ['birthDate', 'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets', 'qrToken']) assert.ok(!providerBody.includes(forbidden), forbidden);
});

test('exact and assessment-aware routes do not ask Gemini to recalculate a deterministic answer', async () => {
  for (const [question, resolution] of [['2지구 신생아 특별공급 몇 세대야?', 'EXACT_STRUCTURED'], ['내가 둘 다 신청 가능한지', 'ASSESSMENT_AWARE']] as const) {
    resetEventChatRateLimitForTests();
    const chatRequest = request(question);
    chatRequest.resolution = resolution;
    let providerCalls = 0;
    const result = await handleEventChat({ method: 'POST', body: chatRequest, headers: {}, ip: question }, {
      env: { GEMINI_API_KEY: 'server-secret' },
      fetcher: async () => { providerCalls += 1; throw new Error('must not call provider'); },
    });
    assert.equal(result.status, 200);
    assert.equal('mode' in result.body && result.body.mode, 'deterministic');
    assert.equal(providerCalls, 0);
  }
});

test('dual chat provider unavailable uses exact structured fallback', async () => {
  for (const question of ['2지구 신생아 특별공급 몇 세대야?', '59㎡ 토지임대료 차이는?', '2지구 당첨자 발표 언제야?']) {
    resetEventChatRateLimitForTests();
    const expected = answerSamdoDualDeterministically(assessment, question);
    const result = await handleEventChat({ method: 'POST', body: request(question), headers: {}, ip: question }, { env: {}, requestId: () => 'fallback' });
    assert.equal(result.status, 200);
    assert.equal('mode' in result.body && result.body.mode, 'fallback');
    assert.equal('text' in result.body && result.body.text, expected.text);
  }
});

test('dual context rejects raw PII and a Gemini probability claim', async () => {
  const privateRequest: any = request('질문');
  privateRequest.context.profile = { birthDate: '1990-01-01' };
  assert.equal((await handleEventChat({ method: 'POST', body: privateRequest, headers: {}, ip: 'private' })).status, 400);

  resetEventChatRateLimitForTests();
  const safeRequest = request('어느 지구가 좋아?');
  const result = await handleEventChat({ method: 'POST', body: safeRequest, headers: {}, ip: 'unsafe' }, {
    env: { GEMINI_API_KEY: 'x' },
    fetcher: async () => gemini({
      text: '2지구 당첨확률은 80%예요.',
      anchorSupplyType: safeRequest.context.focus.supplyType,
      anchorEligibility: safeRequest.context.focus.eligibility,
      anchorRecommendedType: safeRequest.context.recommendation.recommendedType ?? '없음',
    }),
  });
  assert.equal('mode' in result.body && result.body.mode, 'fallback');
});
