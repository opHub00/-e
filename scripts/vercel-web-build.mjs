import { spawnSync } from 'node:child_process';

const staging = process.env.WANPANE_ENV === 'staging';
if (staging && process.env.VERCEL_ENV !== 'preview') throw new Error('STAGING_BUILD_REQUIRES_PREVIEW');
const args = staging
  ? ['scripts/export-web.mjs', 'staging', '--out', 'dist']
  : ['scripts/export-web.mjs', 'production', '--require-target'];
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
