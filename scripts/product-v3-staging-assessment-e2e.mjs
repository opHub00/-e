import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { evaluateAndRecordAssessment } from '../features/productV3/admin/assessmentEvents.ts';
import { loadProductV3StagingSnapshot } from '../features/adminConsole/server/stagingSnapshot.ts';
import { SAMDO_PERSONAS } from '../features/eventKiosk/samdo/personas.test-data.ts';
import { doesNotKnowPersona } from '../features/eventKiosk/phase4Personas.ts';
import { samdoInputFromAnswers } from '../features/eventKiosk/samdoResult/samdoInput.ts';

const expected = { staging: 'krkeiytshxpqojrlrmsx', production: 'ypdreeipoxcztbxtiklt' };
assert.equal(process.env.WANPANE_ENV, 'staging');
assert.equal(process.env.SUPABASE_STAGING_PROJECT_REF, expected.staging);
assert.equal(process.env.SUPABASE_PRODUCTION_PROJECT_REF, expected.production);
assert.notEqual(process.env.VERCEL_ENV, 'production');
const persona = SAMDO_PERSONAS[0].input;
const input = { ...persona, profile: { ...persona.profile, basic: { ...persona.profile.basic, name: '' } } };
const requestId = randomUUID();
const response = await evaluateAndRecordAssessment({ requestId, input }, process.env);
assert.deepEqual(response, { status: 200, body: { result: 'ASSESSMENT_COMPLETED', recorded: true } });
const unknownId = randomUUID();
const unknownSource = samdoInputFromAnswers(doesNotKnowPersona.answers);
const unknownInput = { ...unknownSource, profile: { ...unknownSource.profile, basic: { ...unknownSource.profile.basic, name: '' } }, answerStates: doesNotKnowPersona.answerStates };
const unknownResponse = await evaluateAndRecordAssessment({ requestId: unknownId, input: unknownInput }, process.env);
assert.deepEqual(unknownResponse, { status: 200, body: { result: 'ASSESSMENT_COMPLETED', recorded: true } });
const snapshot = await loadProductV3StagingSnapshot(process.env);
const target = process.env.SUPABASE_STAGING_URL;
const read = await fetch(`${target}/rest/v1/product_v3_assessment_events?select=request_id,notice_id,supply_type,status,unresolved_categories,evidence_complete,rule_package_version,source_status&request_id=eq.${requestId}`, {
  headers: { apikey: process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY}` },
});
assert.equal(read.status, 200);
const rows = await read.json();
assert.equal(rows.length, 10);
assert.deepEqual([...new Set(rows.map(row => row.notice_id))], ['samdo-1', 'samdo-2']);
assert.ok(rows.every(row => typeof row.evidence_complete === 'boolean' && !!row.rule_package_version));
assert.ok(Object.values(snapshot.assessments.byStatus).reduce((a, b) => a + b, 0) >= 10);
assert.ok(snapshot.assessments.blockers.length > 0, 'unknown persona must produce safe unresolved categories');
const anonymous = await fetch(`${target}/rest/v1/product_v3_assessment_events?select=request_id&limit=1`, {
  headers: { apikey: process.env.SUPABASE_STAGING_ANON_KEY },
});
assert.equal(anonymous.status, 401);
console.log(JSON.stringify({ stagingRef: expected.staging, eventCount: rows.length, notices: [...new Set(rows.map(row => row.notice_id))],
  dashboardStatusCounts: snapshot.assessments.byStatus, blockers: snapshot.assessments.blockers, aiModeCounts: {
    deterministic: snapshot.ai.filter(row => row.mode === 'deterministic').length,
    llm: snapshot.ai.filter(row => row.mode === 'llm').length,
    fallback: snapshot.ai.filter(row => row.mode === 'fallback').length,
  }, anonStatus: anonymous.status, storedProfile: false }));
