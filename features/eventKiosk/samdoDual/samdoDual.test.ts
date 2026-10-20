import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import district2Package from '../../../data/assessment-rules/samdo-2-2026-v1.8.json' with { type: 'json' };
import ragData from '../../../data/event/samdo-dual-v2-rag.json' with { type: 'json' };
import { validateImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import { buildSamdoRecommendation } from '../samdo/evaluate.ts';
import { SAMDO_PERSONAS } from '../samdo/personas.test-data.ts';
import { doesNotKnowPersona, evaluatePhase4Personas } from '../phase4Personas.ts';
import { kioskEvent } from '../kioskEvent.ts';
import { sendChat, startSamdoDualChat } from '../consult.ts';
import { handleEventChat } from '../server/eventChat.ts';
import { samdoInputFromAnswers } from '../samdoResult/samdoInput.ts';
import { samdoRules } from '../samdoResult/samdoEvaluate.ts';
import { answerSamdoDualDeterministically, buildSamdoDualChatContext, resolveSamdoDualConversation } from './chat.ts';
import { SAMDO_DISTRICTS } from './config.ts';
import { buildSamdoDualAssessment } from './evaluate.ts';
import { classifySamdoRagIntent, retrieveSamdoEvidence } from './rag.ts';
import { SAMDO_DISTRICT2_DEEP_RULE_PACKAGE } from './rulePackages.ts';
import { getUnresolvedAssessmentFacts } from './unresolved.ts';

test('district 1 and district 2 final 1.8 configs stay independently bound', () => {
  const d1 = SAMDO_DISTRICTS['samdo-1'];
  const d2 = SAMDO_DISTRICTS['samdo-2'];
  assert.deepEqual([d1.managementNumber, d1.inventory.total, d1.inventory.special, d1.inventory.general], ['2026000434', 32, 26, 6]);
  assert.deepEqual([d2.managementNumber, d2.inventory.total, d2.inventory.special, d2.inventory.general], ['2026000435', 40, 32, 8]);
  assert.deepEqual(d1.inventory.bySupplyType, { YOUTH: 5, NEWLYWED: 5, NEWBORN: 11, FIRST_HOME: 5, GENERAL: 6 });
  assert.deepEqual(d2.inventory.bySupplyType, { YOUTH: 6, NEWLYWED: 6, NEWBORN: 14, FIRST_HOME: 6, GENERAL: 8 });
  assert.deepEqual(d1.units.find(item => item.unitType === '49A'), {
    unitType: '49A', supplyCount: 8,
    prices: [{ floor: '2층', priceKrw: 242_256_000 }, { floor: '3층', priceKrw: 247_303_000 }, { floor: '4~9층', priceKrw: 252_350_000 }],
    monthlyLandRentKrw: 247_050,
  });
  assert.deepEqual(d2.units.find(item => item.unitType === '49A'), {
    unitType: '49A', supplyCount: 8,
    prices: [{ floor: '2층', priceKrw: 241_927_000 }, { floor: '3층', priceKrw: 246_967_000 }, { floor: '4~9층', priceKrw: 252_007_000 }],
    monthlyLandRentKrw: 283_920,
  });
  assert.deepEqual(d1.units.find(item => item.unitType === '59A'), {
    unitType: '59A', supplyCount: 24,
    prices: [{ floor: '2층', priceKrw: 290_240_000 }, { floor: '3층', priceKrw: 296_287_000 }, { floor: '4~9층', priceKrw: 302_334_000 }],
    monthlyLandRentKrw: 298_840,
  });
  assert.deepEqual(d2.units.find(item => item.unitType === '59A'), {
    unitType: '59A', supplyCount: 32,
    prices: [{ floor: '2층', priceKrw: 289_898_000 }, { floor: '3층', priceKrw: 295_937_000 }, { floor: '4~9층', priceKrw: 301_977_000 }],
    monthlyLandRentKrw: 343_440,
  });
  assert.equal(d1.schedule.winnerAnnouncement, '2026-11-24');
  assert.equal(d2.schedule.winnerAnnouncement, '2026-11-25');
  assert.deepEqual(
    { special: d1.schedule.special, first: d1.schedule.generalFirst, second: d1.schedule.generalSecond, documents: d1.schedule.documentSubmission, contract: d1.schedule.contract },
    { special: '2026-11-16', first: '2026-11-17', second: '2026-11-18', documents: { start: '2026-11-30', end: '2026-12-04' }, contract: { start: '2027-01-25', end: '2027-01-29' } },
  );
  assert.deepEqual(
    { special: d2.schedule.special, first: d2.schedule.generalFirst, second: d2.schedule.generalSecond, documents: d2.schedule.documentSubmission, contract: d2.schedule.contract },
    { special: '2026-11-16', first: '2026-11-17', second: '2026-11-18', documents: { start: '2026-11-30', end: '2026-12-04' }, contract: { start: '2027-01-25', end: '2027-01-29' } },
  );
  assert.notEqual(d1.document.sha256, d2.document.sha256);
});

test('district 2 Rule Package validates and has zero district 1 provenance leakage', () => {
  const validated = validateImportPackage(district2Package);
  assert.equal(validated.rules.id, SAMDO_DISTRICT2_DEEP_RULE_PACKAGE.baseRuleSetId);
  assert.equal(validated.package.announcement.housingManagementNumber, '2026000435');
  assert.equal(validated.package.document.sha256, SAMDO_DISTRICTS['samdo-2'].document.sha256);
  for (const rule of validated.package.rules) {
    assert.equal(rule.evidence.documentId, validated.package.document.id);
    assert.equal(rule.evidence.locator.sha256, validated.package.document.sha256);
    assert.ok(!rule.evidence.source.includes('1지구'), rule.ruleKey);
    assert.ok(!rule.evidence.textExcerpt?.includes('2026000434'), rule.ruleKey);
    assert.ok(Array.isArray(rule.evidence.locator.paragraphs) && rule.evidence.locator.paragraphs.length > 0, rule.ruleKey);
  }
  for (const supply of SAMDO_DISTRICT2_DEEP_RULE_PACKAGE.supplies) for (const rule of supply.rules) {
    assert.equal(rule.evidence.documentId, validated.package.document.id);
    assert.equal(rule.evidence.locator?.sha256, validated.package.document.sha256);
    assert.ok(!rule.evidence.source.includes('1지구'));
  }
});

test('one input evaluates both districts while preserving the nine district 1 persona snapshots', () => {
  for (const persona of SAMDO_PERSONAS) {
    const baseline = buildSamdoRecommendation(samdoRules(), persona.input);
    const dual = buildSamdoDualAssessment(persona.input);
    const [district1, district2] = dual.districts;
    assert.deepEqual(district1.recommendation, baseline, `${persona.id}: district 1 regression`);
    assert.equal(district1.recommendation.listingId, 'samdo-1-2026-final-1.8');
    assert.equal(district2.recommendation.listingId, 'samdo-2-2026-final-1.8');
    for (const first of district1.recommendation.evaluations) {
      const second = district2.recommendation.evaluations.find(item => item.supplyType === first.supplyType)!;
      assert.equal(second.eligibility, first.eligibility, `${persona.id}:${first.supplyType}:eligibility`);
      assert.equal(second.stage, first.stage, `${persona.id}:${first.supplyType}:stage`);
      assert.equal(second.officialScore.status, first.officialScore.status, `${persona.id}:${first.supplyType}:score status`);
      if (second.officialScore.status === 'AVAILABLE' && first.officialScore.status === 'AVAILABLE') {
        assert.deepEqual(
          { total: second.officialScore.total, max: second.officialScore.max, breakdown: second.officialScore.breakdown.map(({ evidenceId: _evidenceId, ...item }) => item) },
          { total: first.officialScore.total, max: first.officialScore.max, breakdown: first.officialScore.breakdown.map(({ evidenceId: _evidenceId, ...item }) => item) },
          `${persona.id}:${first.supplyType}:score`,
        );
        assert.ok(second.officialScore.breakdown.every(item => item.evidenceId.includes('.d2.')), `${persona.id}:${first.supplyType}:district 2 evidence`);
      }
      assert.equal(second.supplyCount, district2.district.inventory.bySupplyType[first.supplyType as keyof typeof district2.district.inventory.bySupplyType]);
      for (const evidence of second.evidence) assert.equal(evidence.locator?.sha256, district2.district.document.sha256);
    }
    assert.equal(/당첨확률(?:이|은|가)?\s*(?:높|낮)|경쟁률\s*\d/.test(dual.comparison.reasons.join(' ')), false);
    assert.match(dual.comparison.disclaimer, /경쟁률이나 당첨확률을 추정하지 않아요/);
  }
});

test('RAG chunks preserve district, section, table and exact source locator', () => {
  assert.equal(ragData.chunks.length, 28);
  assert.match(ragData.fingerprint, /^[a-f0-9]{64}$/);
  for (const chunk of ragData.chunks) {
    const district = SAMDO_DISTRICTS[chunk.districtId as keyof typeof SAMDO_DISTRICTS];
    assert.equal(chunk.locator.sha256, district.document.sha256, chunk.id);
    assert.ok(chunk.locator.paragraphs.length > 0, chunk.id);
    assert.ok(chunk.section && chunk.textExcerpt, chunk.id);
  }
  const newborn = retrieveSamdoEvidence('2지구 신생아 특별공급 몇 세대야?');
  assert.deepEqual(newborn.districtIds, ['samdo-2']);
  assert.equal(newborn.intent, 'SUPPLY_COUNT');
  assert.ok(newborn.chunks.every(chunk => chunk.districtId === 'samdo-2'));
  const lease = retrieveSamdoEvidence('토지임대부가 뭐야?');
  assert.equal(lease.intent, 'LAND_LEASE');
  assert.ok(lease.chunks.some(chunk => chunk.section === '토지임대부 분양주택 안내'));
});

test('deterministic dual chat answers structured facts exactly', () => {
  const assessment = buildSamdoDualAssessment(SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input);
  const cases: Array<[string, RegExp]> = [
    ['2지구 신생아 특별공급 몇 세대야?', /14세대/],
    ['59㎡ 토지임대료 차이는?', /1지구 59㎡ 월 토지임대료는 298,840원.*2지구 59㎡ 월 토지임대료는 343,440원/],
    ['1지구 분양가는 얼마야?', /1지구 59㎡ 분양가격은 2층 290,240,000원, 3층 296,287,000원, 4~9층 302,334,000원/],
    ['특별공급 언제 신청해?', /특별공급.*2026\.11\.16/],
    ['1지구 당첨자 발표 언제야?', /1지구 당첨자 발표는 2026\.11\.24/],
    ['2지구 당첨자 발표 언제야?', /2지구 당첨자 발표는 2026\.11\.25/],
    ['토지임대부가 뭐야?', /토지는 공공이 소유하고 건물은 수분양자가 소유/],
    ['해외체류가 있으면 어떻게 돼?', /제주 거주기간 산정과 지역 우선공급 인정 여부/],
    ['준비서류 뭐가 필요해?', /주민등록표등본·초본/],
  ];
  for (const [question, expected] of cases) assert.match(answerSamdoDualDeterministically(assessment, question).text, expected, question);
  const both = answerSamdoDualDeterministically(assessment, '나는 둘 다 신청 가능해?');
  assert.ok((both.detail ?? []).some(item => item.startsWith('1지구:')));
  assert.ok((both.detail ?? []).some(item => item.startsWith('2지구:')));
});

test('dual browser LLM context is presentation-safe and cannot author RAG evidence', () => {
  const input = SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input;
  const context = buildSamdoDualChatContext(buildSamdoDualAssessment(input), '2지구 신생아 특별공급 몇 세대야?');
  const serialized = JSON.stringify(context);
  assert.equal(context.schemaVersion, 2);
  assert.equal(context.scope, 'SAMDO_DUAL');
  assert.deepEqual(context.retrievedEvidence, []);
  for (const forbidden of ['birthDate', 'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets', 'factKey', 'rulePackage', 'qrToken', 'personId']) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});

test('assessment-aware chat resolves continuous follow-ups from only real unresolved facts', () => {
  const assessment = buildSamdoDualAssessment(samdoInputFromAnswers(doesNotKnowPersona.answers));
  const facts = getUnresolvedAssessmentFacts(assessment, doesNotKnowPersona.answerStates);
  assert.ok(facts.length > 0);
  assert.ok(facts.some(item => item.state === 'DOES_NOT_KNOW'));

  const first = resolveSamdoDualConversation(assessment, '내가 둘 다 신청 가능한지', [], facts);
  const history1 = [{ role: 'user' as const, text: '내가 둘 다 신청 가능한지' }, { role: 'assistant' as const, text: first.answer.text }];
  const second = resolveSamdoDualConversation(assessment, '그럼 어떤 정보를 입력해야 확정적으로 추천해줄 수 있어?', history1, facts);
  const history2 = [...history1, { role: 'user' as const, text: '그럼 어떤 정보를 입력해야 확정적으로 추천해줄 수 있어?' }, { role: 'assistant' as const, text: second.answer.text }];
  const third = resolveSamdoDualConversation(assessment, '그중 제일 먼저 확인할 건?', history2, facts);

  assert.equal(first.resolution, 'ASSESSMENT_AWARE');
  assert.match(second.answer.text, new RegExp(`${facts.length}가지`));
  assert.ok((second.answer.detail ?? []).every(line => !/(?:applicant|household|fact|input)\./.test(line)));
  assert.match(third.answer.text, new RegExp(facts[0].label));

  const unknown = resolveSamdoDualConversation(assessment, '내가 모르는 것만 알려줘', [], facts);
  const unknownLabels = facts.filter(item => item.state === 'DOES_NOT_KNOW' || item.state === 'UNKNOWN').map(item => item.label);
  assert.ok((unknown.answer.detail ?? []).every(line => unknownLabels.some(label => line.includes(label))));

  const context = buildSamdoDualChatContext(assessment, '뭘 더 입력해야 해?', facts);
  const serialized = JSON.stringify(context);
  assert.ok(context.unresolvedFacts.length > 0);
  assert.ok(!serialized.includes('factKey'));
  assert.ok(!serialized.includes('parentAssets'));
});

test('comparison conversations answer objective differences before personal assessment', () => {
  const assessment = buildSamdoDualAssessment(SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input);
  const objective = resolveSamdoDualConversation(assessment, '1지구와 2지구의 차이점은 뭐야?');
  assert.match(objective.answer.text, /공급 규모, 분양가격·월 토지임대료, 당첨자 발표일/);
  assert.doesNotMatch(objective.answer.text, /먼저 정렬|더 유리/);
  assert.ok((objective.answer.detail ?? []).some(line => /1지구 32세대.*2지구 40세대/.test(line)));

  const history = [{ role: 'user' as const, text: '1지구와 2지구의 차이점은 뭐야?' }, { role: 'assistant' as const, text: objective.answer.text }];
  const personal = resolveSamdoDualConversation(assessment, '그러면 나한테는 어디가 더 맞아?', history);
  const why = resolveSamdoDualConversation(assessment, '왜?', [...history, { role: 'user' as const, text: '그러면 나한테는 어디가 더 맞아?' }, { role: 'assistant' as const, text: personal.answer.text }]);
  assert.equal(personal.resolution, 'ASSESSMENT_AWARE');
  assert.doesNotMatch(personal.answer.text, /당첨확률.*높/);
  assert.ok(why.answer.detail?.length);
});

test('six-turn qualification and recommendation conversation uses assessment, not repeated clarification', async () => {
  const loaded = kioskEvent();
  if (!loaded.ok) throw new Error(loaded.error);
  const assessment = buildSamdoDualAssessment(samdoInputFromAnswers(doesNotKnowPersona.answers));
  const facts = getUnresolvedAssessmentFacts(assessment, doesNotKnowPersona.answerStates);
  let chat = startSamdoDualChat(loaded.event, assessment, doesNotKnowPersona.answerStates);
  const questions = [
    '내가 어떤걸 더 준비하면 좋을까?',
    '내가 대비하거나, 더 채워야하는 조건은 없어?',
    '그니까 자격 조건?',
    '내가 지금 어떤 지구를 신청하는게 유리할까?',
    '내가 지금 신청하면 좋은 공고는 어떤거야?',
    '왜 그게 나한테 더 나아?',
  ];
  const replies: string[] = [];
  const histories: Array<Array<{ role: string; text: string }>> = [];
  for (const question of questions) {
    chat = await sendChat(loaded.event, chat, question, {
      allowNetwork: true,
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        histories.push(body.history);
        const result = await handleEventChat({ method: 'POST', body, headers: {} }, { env: {} });
        return new Response(JSON.stringify(result.body), { status: result.status });
      },
    });
    const reply = chat.messages.at(-1)!;
    assert.equal(reply.role, 'assistant');
    assert.equal(reply.response?.mode, 'deterministic');
    assert.doesNotMatch(reply.text, /질문의 의미를 두 가지|신청 준비사항을 말씀/);
    assert.doesNotMatch(JSON.stringify(reply), /(?:applicant|household|score)\.[A-Za-z]+|당첨확률이 높/);
    replies.push(reply.text);
  }
  assert.ok(facts.length > 0);
  assert.match(replies[0], /확정 판정|확인/);
  assert.ok(chat.messages[2].detail?.some(line => facts.some(fact => line.includes(fact.label))));
  assert.match(replies[3], /지구|판정/);
  assert.match(replies[4], /지구|공고/);
  assert.match(replies[5], /기준|판정/);
  assert.equal(classifySamdoRagIntent(questions[4]), 'UNKNOWN');
  assert.equal(histories[5].length, 6);
  assert.ok(histories[5].some(turn => turn.role === 'user' && turn.text === questions[4]));
});

test('qualification, comparison and recommendation paraphrases use real assessment facts', () => {
  const assessment = buildSamdoDualAssessment(samdoInputFromAnswers(doesNotKnowPersona.answers));
  const facts = getUnresolvedAssessmentFacts(assessment, doesNotKnowPersona.answerStates);
  const cases = [
    ['어디 넣는 게 나아?', 'COMPARE'],
    ['둘 중 뭐가 더 좋아?', 'COMPARE'],
    ['내 조건에서 뭐가 부족해?', 'UNRESOLVED'],
    ['내가 뭘 더 갖춰야 해?', 'UNRESOLVED'],
    ['지금 지원하면 어디가 제일 맞아?', 'COMPARE'],
    ['나한테 제일 맞는 공고 알려줘', 'RECOMMEND'],
  ] as const;
  for (const [question, expected] of cases) {
    const result = resolveSamdoDualConversation(assessment, question, [], facts);
    assert.equal(result.resolution, 'ASSESSMENT_AWARE', question);
    assert.doesNotMatch(result.answer.text, /질문의 의미를 두 가지|당첨확률이 높/);
    assert.doesNotMatch(JSON.stringify(result.answer), /(?:applicant|household|score)\.[A-Za-z]+/);
    if (expected === 'UNRESOLVED') {
      assert.ok((result.answer.detail ?? []).some(line => facts.some(fact => line.includes(fact.label))), question);
    } else if (expected === 'COMPARE') assert.match(result.answer.text, /지구|판정/, question);
    else assert.match(result.answer.text, /추천|검토|지구/, question);
  }
});

test('unresolved answer detail remains within the server presentation contract for nine personas', () => {
  for (const persona of SAMDO_PERSONAS) {
    const assessment = buildSamdoDualAssessment(persona.input);
    const facts = getUnresolvedAssessmentFacts(assessment);
    const answer = resolveSamdoDualConversation(assessment, '내가 뭘 더 갖춰야 해?', [], facts).answer;
    assert.ok((answer.detail ?? []).every(line => line.length <= 400), persona.id);
  }
});

test('known child birth date is not requested again when only childbirth evidence is pending', () => {
  const event = kioskEvent();
  if (!event.ok) throw new Error(event.error);
  const persona = evaluatePhase4Personas(event.event).find(item => item.personaId === 'NEWLYWED_ONE_CHILD');
  assert.ok(persona);
  assert.equal(persona.finalAnswers.household.childBirthDates[0], '2025-01-15');
  const assessment = buildSamdoDualAssessment(samdoInputFromAnswers(persona.finalAnswers));
  const facts = getUnresolvedAssessmentFacts(assessment, { 'household.childBirthDates.0': 'ANSWERED' });
  const childbirth = facts.find(item => item.factKey === 'childBirthDate');
  assert.ok(childbirth);
  assert.equal(childbirth.state, 'EVIDENCE_REQUIRED');
  assert.equal(childbirth.label, '출산특례·자녀 관계 증빙');
  assert.match(childbirth.evidenceNeeded, /가족관계증명서/);
  assert.doesNotMatch(childbirth.userFacingQuestion, /생년월일/);
});
