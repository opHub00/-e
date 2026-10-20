import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type ConsoleModule = typeof import('../../features/adminConsole/server/consoleApi.ts');
type CandidateModule = typeof import('../../features/assessmentRuleReview/fixtures/jejuV2CandidateView.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

async function loadConsoleModule(): Promise<ConsoleModule> {
  return nativeImport(pathToFileURL(join(process.cwd(), 'features/adminConsole/server/consoleApi.ts')).href) as Promise<ConsoleModule>;
}
async function loadCandidateModule(): Promise<CandidateModule> {
  return nativeImport(pathToFileURL(join(process.cwd(), 'features/assessmentRuleReview/fixtures/jejuV2CandidateView.ts')).href) as Promise<CandidateModule>;
}

type ApiRequest = { method?: string; headers: Record<string, string | string[] | undefined>; query?: Record<string, unknown> };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const { authorizeProductV3Admin, handleProductV3ConsoleRequest, loadProductV3StagingSnapshot } = await loadConsoleModule();
  const result = await handleProductV3ConsoleRequest(
    { method: request.method, headers: request.headers, query: request.query },
    { authorize: token => authorizeProductV3Admin(token, process.env), loadSnapshot: window => loadProductV3StagingSnapshot(process.env, fetch, () => new Date().toISOString(), window),
      loadJejuCandidate: async () => (await loadCandidateModule()).buildJejuV2CandidateView() },
  );
  response.setHeader('Cache-Control', 'no-store');
  response.status(result.status).json(result.body);
}
