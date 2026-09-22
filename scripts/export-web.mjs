import {
  RELEASE_OUTPUT_DIR,
  STAGING_OUTPUT_DIR,
  assertWebBuildProfile,
  createProductionBuildEnvironment,
  createStagingBuildEnvironment,
  readStagingIdentity,
  runWebExport,
} from './web-build.mjs';

const target = process.argv[2] ?? 'production';
if (target !== 'production' && target !== 'staging') throw new Error('INVALID_WEB_BUILD_TARGET');
const identity = readStagingIdentity(process.env);
const env = target === 'staging' ? createStagingBuildEnvironment(process.env, identity) : createProductionBuildEnvironment(process.env, identity);
const outputDir = target === 'staging' ? STAGING_OUTPUT_DIR : RELEASE_OUTPUT_DIR;
if (target === 'staging') console.log(`Staging target: ${identity.SUPABASE_STAGING_PROJECT_REF} (production ${identity.SUPABASE_PRODUCTION_PROJECT_REF} refused), cache namespace ${env.WANPANE_METRO_CACHE_NAMESPACE}, output ${outputDir}`);
await runWebExport({ env, outputDir, clear: true });
const v = await assertWebBuildProfile({
  outputDir,
  profile: target,
  stagingProjectRef: identity.SUPABASE_STAGING_PROJECT_REF?.toLowerCase(),
  productionProjectRef: identity.SUPABASE_PRODUCTION_PROJECT_REF?.toLowerCase(),
});
console.log(`Verified ${v.profile} web bundle: E2E fixture=0, service-role marker=0, local seed/fault plan guard=${v.profile}, `
  + (target === 'staging' ? `staging host=${v.stagingHostCount}, production host=0` : `staging ref=0${identity.SUPABASE_STAGING_PROJECT_REF ? '' : ' (staging identity not available to check)'}`));
