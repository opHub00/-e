// One bounded retry for provider B. This process must never read the human oracle.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GeminiStructuredProvider } from '../features/ruleExtraction/server/geminiProvider.ts';
import {
  createStructuredBenchmarkProvider,
  verifyFrozenBenchmarkPack,
} from '../features/ruleExtraction/server/v4_1/benchmarkPack.ts';

const EXPECTED_HASH = '90936b302840fc046a4fe70f5b3845eb8121b365066f5845482adeff5b9c889b';
const ROOT = '.ingestion/announcements/990b2823e0ddc98fe7222815b6c844131bda6e9c1deac50c6de253eb0dbe524f';
const sourceDir = resolve(ROOT, 'extraction', 'samdo-v4-1-offline');
const outDir = resolve(ROOT, 'extraction', 'model-comparison-small');
const readJson = async (name) => JSON.parse(await readFile(resolve(outDir, name), 'utf8'));
const writeJson = async (name, value) => writeFile(resolve(outDir, name), `${JSON.stringify(value, null, 2)}\n`);

if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY_REQUIRED');
const [pack, completion, providerA, providerB, priorUsage] = await Promise.all([
  JSON.parse(await readFile(resolve(sourceDir, 'samdo-v4-1-frozen-pack.json'), 'utf8')),
  readJson('providers-complete.json'),
  readJson('provider-a-results.json'),
  readJson('provider-b-results.json'),
  readJson('provider-b-usage.json'),
]);
if (pack.hash !== EXPECTED_HASH || !verifyFrozenBenchmarkPack(pack)) throw new Error('FROZEN_PACK_HASH_MISMATCH');
if (completion.packHash !== EXPECTED_HASH || completion.oracleRead !== false) throw new Error('ORACLE_ISOLATION_VIOLATION');
if (completion.calls !== 13 || providerB.usageSummary.retries !== 0 || priorUsage.calls.length !== 6) {
  throw new Error('BOUNDED_RETRY_NOT_AVAILABLE');
}
if (providerB.results.some((row) => row.status === 'SUCCESS')) throw new Error('PROVIDER_B_ALREADY_HAS_SAMPLE');
const task = pack.tasks.find((row) => row.taskId === pack.profiles.SMALL[0]);
if (!task) throw new Error('SMALL_RETRY_TASK_MISSING');

const retryRows = [];
const rawProvider = new GeminiStructuredProvider({
  model: providerB.provider.model,
  apiKey: process.env.GEMINI_API_KEY,
  maxCalls: 1,
  maxRetryCalls: 0,
  maxOutputTokens: 2048,
  thinkingBudget: 1024,
  timeoutMs: 180000,
  inputUsdPerMillion: 2,
  outputUsdPerMillion: 12,
  maxEstimatedUsd: Math.max(0.01, 2 - completion.estimatedUsd),
  transientCircuitThreshold: 1,
}, fetch, async (rows) => {
  retryRows.splice(0, retryRows.length, ...structuredClone(rows));
});
const provider = createStructuredBenchmarkProvider(providerB.provider.id, providerB.provider.model, rawProvider);
let retryResult;
try {
  retryResult = { taskId: task.taskId, status: 'SUCCESS', response: await provider.bind(structuredClone(task)), error: null };
} catch (error) {
  retryResult = { taskId: task.taskId, status: 'FAILED', response: null, error: error instanceof Error ? error.message : 'PROVIDER_ERROR' };
}
if (retryRows.length !== 1) throw new Error('RETRY_CALL_ACCOUNTING_MISMATCH');
const calls = [...priorUsage.calls, { ...retryRows[0], attempt: 1 }];
const summarize = () => ({
  calls: calls.length,
  retries: 1,
  errors: Object.fromEntries([...new Set(calls.filter((row) => row.status !== 'OK').map((row) => row.status))]
    .map((status) => [status, calls.filter((row) => row.status === status).length])),
  inputTokens: calls.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
  outputTokens: calls.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
  thinkingTokens: calls.reduce((sum, row) => sum + (row.thinkingTokens ?? 0), 0),
  totalTokens: calls.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
  estimatedUsd: calls.reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0),
});
if (retryResult.status === 'SUCCESS') {
  const index = providerB.results.findIndex((row) => row.taskId === retryResult.taskId);
  providerB.results[index] = retryResult;
  providerB.compatibility = 'COMPATIBLE';
}
providerB.retryAttempts = [retryResult];
providerB.usageSummary = summarize();
const totalCalls = providerA.usageSummary.calls + providerB.usageSummary.calls;
const totalCost = providerA.usageSummary.estimatedUsd + providerB.usageSummary.estimatedUsd;
if (totalCalls !== 14 || totalCost > 2) throw new Error('GLOBAL_BUDGET_EXCEEDED');
await writeJson('provider-b-usage.json', { ...priorUsage, calls });
await writeJson('provider-b-results.json', providerB);
await writeJson('usage.json', {
  hardCaps: { semanticTasksPerProvider: 6, retriesPerProvider: 1, totalNetworkCalls: 14, totalEstimatedUsd: 2 },
  providerA: providerA.usageSummary,
  providerB: providerB.usageSummary,
  totals: { calls: totalCalls, estimatedUsd: totalCost },
});
await writeJson('providers-complete.json', {
  ...completion,
  completedAt: new Date().toISOString(),
  providerB: { model: providerB.provider.model, compatibility: providerB.compatibility },
  calls: totalCalls,
  estimatedUsd: totalCost,
  retryBudgetExhausted: true,
});
console.log(JSON.stringify({
  packHash: pack.hash,
  model: providerB.provider.model,
  retry: { taskId: retryResult.taskId, status: retryResult.status, error: retryResult.error },
  totals: { calls: totalCalls, estimatedUsd: totalCost },
  oracleRead: false,
  remoteWrites: false,
}, null, 2));
