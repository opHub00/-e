import { execFileSync, spawn } from 'node:child_process';
import { createEventQaBuildEnvironment } from './web-build.mjs';

const commit = process.env.EVENT_QA_BUILD_COMMIT?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const builtAt = process.env.EVENT_QA_BUILD_TIME?.trim() || new Date().toISOString();
const outputDir = process.env.EVENT_QA_OUTPUT_DIR?.trim() || '.cache/event-qa/dist';
const env = createEventQaBuildEnvironment(process.env, { commit, builtAt });

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/export-web.mjs', 'production', '--out', outputDir], {
    env,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`EVENT_QA_EXPORT_FAILED:${code ?? signal ?? 'unknown'}`));
  });
});

console.log(`Event QA bundle ready: commit ${commit}, output ${outputDir}`);
