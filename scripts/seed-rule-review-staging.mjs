// Explicit staging-only Samdo review bootstrap. Never imported by the app bundle.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { SAMDO_STAGING_REVIEW_SEED } from '../features/assessmentRuleReview/fixtures/samdoReviewSeed.generated.ts';
import { hashReviewCandidate } from '../features/assessmentRuleReview/server/service.ts';

const environment=process.env.WANPANE_ENV?.trim().toLowerCase(), url=process.env.SUPABASE_STAGING_URL?.trim();
const expected=process.env.SUPABASE_STAGING_PROJECT_REF?.trim().toLowerCase(), production=process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
const ref=(()=>{try{return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]??null;}catch{return null;}})();
assert.equal(environment,'staging','STAGING_ENV_REQUIRED'); assert.ok(expected&&ref===expected,'STAGING_PROJECT_REF_MISMATCH');
assert.ok(!production||ref!==production,'PRODUCTION_PROJECT_FORBIDDEN'); assert.equal(process.env.RULE_REVIEW_STAGING_ALLOW_WRITE,'true','STAGING_WRITE_OPT_IN_REQUIRED');
const key=process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim(), ruleSetId=process.env.RULE_REVIEW_STAGING_RULE_SET_ID?.trim();
assert.ok(key&&ruleSetId,'STAGING_SERVICE_CREDENTIALS_REQUIRED');
const seed={...SAMDO_STAGING_REVIEW_SEED,rules:SAMDO_STAGING_REVIEW_SEED.rules.map(rule=>({...rule,originalCandidateHash:hashReviewCandidate(rule.originalCandidate)}))};
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await client.rpc('seed_assessment_rule_review',{p_rule_set_id:ruleSetId,p_seed:seed});
if(error)throw new Error(`STAGING_SEED_FAILED:${error.message}`);
console.log(`Rule Review staging seed created for ${data.ruleSetId}; source status remains ${SAMDO_STAGING_REVIEW_SEED.sourceStatus}`);
