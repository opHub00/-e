import assert from 'node:assert/strict';
import { handleNewlywedAi } from '../../supabase/functions/ai-newlywed/handler.ts';
import { createMinimalApplicantProfile } from '../profile/domain.ts';
import { evaluateNewlywedEligibility } from './newlywed.ts';
import { buildNewlywedAiContext } from './newlywedAi.ts';

const context = buildNewlywedAiContext(evaluateNewlywedEligibility(createMinimalApplicantProfile({ name: 'secret-name', age: 30, currentRegion: '', preferredRegions: [] })));
const request = (body: unknown) => new Request('https://preview.test', { method: 'POST', body: JSON.stringify(body) });
let calls = 0;
const model = (output: unknown): typeof fetch => async (_url, init) => {
  calls++;
  assert.ok(!String(init?.body).includes('secret-name'));
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }));
};
assert.equal((await handleNewlywedAi(new Request('https://preview.test'), undefined)).status, 405);
assert.equal((await handleNewlywedAi(new Request('https://preview.test', { method: 'OPTIONS' }), undefined)).status, 200);
for (const bad of [{ newlywed: context, profile: {} }, { profile: {} }, { newlywed: { ...context, raw: {} } }, null]) {
  assert.equal((await handleNewlywedAi(request(bad), 'fake', model({}))).status, 400);
}
assert.equal(calls, 0);
assert.equal((await handleNewlywedAi(request('x'.repeat(17000)), 'fake')).status, 413);
assert.deepEqual(await (await handleNewlywedAi(request({ newlywed: context }), undefined)).json(), { selection: null, fallback: true });
const accepted = await (await handleNewlywedAi(request({ newlywed: context }), 'fake', model({ checkKeys: ['income'] }))).json();
assert.deepEqual(accepted, { selection: { checkKeys: ['income'] }, fallback: false });
for (const unsafe of [{ answer: '당첨 확률 99%' }, { checkKeys: ['income'], score: 99 }, { checkKeys: ['income'], status: 'likely_eligible' }, { checkKeys: ['invented'] }]) {
  assert.deepEqual(await (await handleNewlywedAi(request({ newlywed: context }), 'fake', model(unsafe))).json(), { selection: null, fallback: true });
}
const offline: typeof fetch = async () => { throw new Error('offline'); };
assert.deepEqual(await (await handleNewlywedAi(request({ newlywed: context }), 'fake', offline)).json(), { selection: null, fallback: true });
assert.deepEqual(await (await handleNewlywedAi(request({ newlywed: context }), 'fake', async () => new Response('', { status: 429 }))).json(), { selection: null, fallback: true });
for (const candidate of [
  { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"checkKeys":["income"' }] } },
  { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"checkKeys":["income"]}' }] } },
  { finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } },
  { finishReason: 'SAFETY' },
]) {
  const truncated: typeof fetch = async () => new Response(JSON.stringify({ candidates: [candidate] }));
  assert.deepEqual(await (await handleNewlywedAi(request({ newlywed: context }), 'fake', truncated)).json(), { selection: null, fallback: true });
}
console.log('newlywed Edge: request validation, model selection, unsafe output, privacy and offline fallback passed');
