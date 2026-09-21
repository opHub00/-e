/** Cross-platform clean E2E build/server/test lifecycle used by npm scripts. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  E2E_OUTPUT_DIR,
  assertWebBuildProfile,
  createE2EBuildEnvironment,
  runWebExport,
} from '../scripts/web-build.mjs';

const PORT = 4321;
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const env = {
  ...createE2EBuildEnvironment(),
  WANPANE_E2E_EXTERNAL_SERVER: '1',
};

const waitForExit = child => new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve({ code, signal }));
});

const endpointReady = async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/assessment`);
    return response.ok;
  } catch {
    return false;
  }
};

await runWebExport({ env, outputDir: E2E_OUTPUT_DIR, clear: true });
await assertWebBuildProfile({ outputDir: E2E_OUTPUT_DIR, profile: 'test' });
if (await endpointReady()) throw new Error('E2E_PORT_ALREADY_IN_USE');

const server = spawn(process.execPath, ['e2e/staticServer.mjs', E2E_OUTPUT_DIR, String(PORT)], {
  env,
  stdio: 'inherit',
});

const stopServer = () => {
  if (!server.killed) server.kill();
};
let testProcess;
const stopAll = exitCode => {
  if (testProcess && !testProcess.killed) testProcess.kill();
  stopServer();
  process.exit(exitCode);
};
const onInterrupt = () => stopAll(130);
const onTerminate = () => stopAll(143);
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);

try {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await endpointReady()) break;
    if (server.exitCode !== null) throw new Error(`E2E_STATIC_SERVER_EXITED:${server.exitCode}`);
    if (attempt === 119) throw new Error('E2E_STATIC_SERVER_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  testProcess = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
    env,
    stdio: 'inherit',
  });
  const result = await waitForExit(testProcess);
  process.exitCode = result.code ?? 1;
} finally {
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  stopServer();
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ]);
}
