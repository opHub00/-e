import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMDO_REVIEW_SEED } from '../fixtures/samdoReviewSeed.generated.ts';
import { InMemoryRuleReviewRepository } from './RuleReviewRepository.ts';
import { SupabaseRuleReviewRepository, type RuleReviewRpcClient } from './SupabaseRuleReviewRepository.ts';

const workspace = new InMemoryRuleReviewRepository(SAMDO_REVIEW_SEED, 'fixture').snapshot();
function client(options: { role?: 'reviewer'|'admin'|null; error?: string } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const value = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'reviewer' } } }, error: null }) },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (options.error) return { data: null, error: { message: options.error } };
      if (name === 'get_assessment_review_access') return { data: { role: options.role ?? 'reviewer' }, error: null };
      if (name === 'load_assessment_rule_review_workspace') return { data: workspace, error: null };
      return { data: {}, error: null };
    },
  };
  return { value: value as unknown as RuleReviewRpcClient, calls };
}

test('loads the persisted workspace and maps review role', async () => {
  const mock=client(), repo=new SupabaseRuleReviewRepository(mock.value, workspace.ruleVersionId);
  assert.equal((await repo.access()).role,'reviewer');
  assert.equal((await repo.snapshot()).ruleVersionId,workspace.ruleVersionId);
});

test('fails closed before any review RPC when no auth session exists', async () => {
  let rpcCalls=0;
  const mock={auth:{getSession:async()=>({data:{session:null},error:null})},rpc:async()=>{rpcCalls++;return {data:null,error:null};}} as unknown as RuleReviewRpcClient;
  const repo=new SupabaseRuleReviewRepository(mock,workspace.ruleVersionId);
  assert.deepEqual(await repo.access(),{authenticated:false,role:null});
  assert.equal(rpcCalls,0);
});

test('sends expected revision and mutation payload only through RPC', async () => {
  const mock=client(), repo=new SupabaseRuleReviewRepository(mock.value, workspace.ruleVersionId);
  await repo.hold('rule-1',{expectedRevision:7,reason:'source mismatch'});
  const call=mock.calls.at(-1)!;
  assert.equal(call.name,'mutate_assessment_rule_review');
  assert.deepEqual(call.args,{p_rule_set_id:workspace.ruleVersionId,p_expected_revision:7,p_action:'HOLD_RULE',p_target_id:'rule-1',p_payload:{},p_reason:'source mismatch'});
});

test('normalizes stale revision without exposing credentials', async () => {
  const mock=client({error:'Stale review revision'}), repo=new SupabaseRuleReviewRepository(mock.value,workspace.ruleVersionId);
  await assert.rejects(()=>repo.reject('rule-1',{expectedRevision:1,reason:'bad'}),/STALE_REVIEW_REVISION/);
});
