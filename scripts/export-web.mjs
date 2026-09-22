import {
  RELEASE_OUTPUT_DIR,
  STAGING_OUTPUT_DIR,
  assertWebBuildProfile,
  createProductionBuildEnvironment,
  createStagingBuildEnvironment,
  readStagingIdentity,
  runWebExport,
} from './web-build.mjs';

// export-web.mjs <production|staging> [--require-target] [--out DIR]
const [target = 'production', ...flags] = process.argv.slice(2);
if (target !== 'production' && target !== 'staging') throw new Error('INVALID_WEB_BUILD_TARGET');
const requireTarget = flags.includes('--require-target');
const outIndex = flags.indexOf('--out');
if (flags.some((flag, i) => flag !== '--require-target' && flag !== '--out' && flags[i - 1] !== '--out')) throw new Error('UNKNOWN_WEB_BUILD_FLAG');
const identity = readStagingIdentity(process.env);
const env = target === 'staging'
  ? createStagingBuildEnvironment(process.env, identity)
  : createProductionBuildEnvironment(process.env, identity, { requireTarget });
const outputDir = outIndex >= 0 ? flags[outIndex + 1] : target === 'staging' ? STAGING_OUTPUT_DIR : RELEASE_OUTPUT_DIR;
if (!outputDir) throw new Error('--out needs a directory');
const productionRef = env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF ?? identity.SUPABASE_PRODUCTION_PROJECT_REF?.toLowerCase();
const targetLine = target === 'staging'
  ? `Staging target: ${identity.SUPABASE_STAGING_PROJECT_REF} (production ${identity.SUPABASE_PRODUCTION_PROJECT_REF} refused)`
  : env.EXPO_PUBLIC_SUPABASE_URL ? `Production target: ${env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF}` : 'Production target: none (unconfigured bundle; the app fails closed)';
console.log(`${targetLine}, cache namespace ${env.WANPANE_METRO_CACHE_NAMESPACE}, output ${outputDir}`);
await runWebExport({ env, outputDir, clear: true });
const v = await assertWebBuildProfile({
  outputDir,
  profile: target,
  stagingProjectRef: identity.SUPABASE_STAGING_PROJECT_REF?.toLowerCase(),
  productionProjectRef: productionRef,
  requireTarget,
});
console.log(`Verified ${v.profile} web bundle: E2E fixture=0, service-role marker=0, local seed/fault plan guard=${v.profile}, `
  + (target === 'staging'
    ? `staging host=${v.stagingHostCount}, production host=0`
    : `production host=${v.productionHostCount}, staging ref=0${identity.SUPABASE_STAGING_PROJECT_REF ? '' : ' (staging identity not available to check)'}`));
