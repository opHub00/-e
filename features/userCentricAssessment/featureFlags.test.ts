import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUserCentricFeatureFlags } from './featureFlags.ts';

const on = {
  EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3: 'true',
  EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS: 'true',
};

test('user-centric rollout is explicit and staging-only', () => {
  assert.deepEqual(resolveUserCentricFeatureFlags({ ...on, EXPO_PUBLIC_WANPANE_ENV: 'staging' }), {
    userCentricProfileV3: true, userCentricAssessmentResults: true,
  });
  for (const environment of [undefined, '', 'production', 'test', 'development']) {
    assert.deepEqual(resolveUserCentricFeatureFlags({ ...on, EXPO_PUBLIC_WANPANE_ENV: environment }), {
      userCentricProfileV3: false, userCentricAssessmentResults: false,
    });
  }
  assert.deepEqual(resolveUserCentricFeatureFlags({
    ...on, EXPO_PUBLIC_WANPANE_ENV: 'staging', EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3: 'false',
  }), { userCentricProfileV3: false, userCentricAssessmentResults: false });
});
