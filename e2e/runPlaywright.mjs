/** Cross-platform clean E2E build/server/test lifecycle used by npm scripts. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const PORT = 4321;
const require = createRequire(import.meta.url);
const expoCli = require.resolve('expo/bin/cli');
const playwrightCli = require.resolve('@playwright/test/cli');
const env = {
  ...process.env,
  EXPO_PUBLIC_WANPANE_ENV: 'test',
  EXPO_PUBLIC_SUPABASE_URL: 'https://e2e-fixture.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-e2e-placeholder',
  WANPANE_E2E_EXTERNAL_SERVER: '1',
};

const waitForExit = child => new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve({ code, signal }));
});

const run = (entry, args, options = {}) => {
  const child = spawn(process.execPath, [entry, ...args], {
    env,
    stdio: 'inherit',
    ...options,
  });
  return waitForExit(child);
};

const endpointReady = async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/assessment`);
    return response.ok;
  } catch {
    return false;
  }
};

const build = await run(expoCli, ['export', '--platform', 'web', '--clear']);
if (build.code !== 0) throw new Error(`E2E_WEB_EXPORT_FAILED:${build.code ?? build.signal}`);
if (await endpointReady()) throw new Error('E2E_PORT_ALREADY_IN_USE');

const server = spawn(process.execPath, ['e2e/staticServer.mjs', 'dist', String(PORT)], {
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
