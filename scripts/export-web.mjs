import {
  RELEASE_OUTPUT_DIR,
  STAGING_OUTPUT_DIR,
  assertWebBuildProfile,
  createReleaseBuildEnvironment,
  runWebExport,
} from './web-build.mjs';

const target = process.argv[2] ?? 'production';
const env = createReleaseBuildEnvironment(target);
const outputDir = target === 'staging' ? STAGING_OUTPUT_DIR : RELEASE_OUTPUT_DIR;
await runWebExport({ env, outputDir, clear: true });
const verification = await assertWebBuildProfile({ outputDir, profile: target });
console.log(`Verified ${verification.profile} web bundle: E2E fixture=0, service-role marker=0`);
