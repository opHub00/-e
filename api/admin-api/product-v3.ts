import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type ConsoleModule = typeof import('../../features/adminConsole/server/consoleApi.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

async function loadConsoleModule(): Promise<ConsoleModule> {
  return nativeImport(pathToFileURL(join(process.cwd(), 'features/adminConsole/server/consoleApi.ts')).href) as Promise<ConsoleModule>;
}

type ApiRequest = { method?: string; headers: Record<string, string | string[] | undefined> };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const { authorizeProductV3Admin, handleProductV3ConsoleRequest, loadProductV3StagingSnapshot } = await loadConsoleModule();
  const result = await handleProductV3ConsoleRequest(
    { method: request.method, headers: request.headers },
    { authorize: token => authorizeProductV3Admin(token, process.env), loadSnapshot: () => loadProductV3StagingSnapshot(process.env) },
  );
  response.setHeader('Cache-Control', 'no-store');
  response.status(result.status).json(result.body);
}
