import { authorizeProductV3Admin, handleProductV3ConsoleRequest } from '../../features/adminConsole/server/consoleApi.ts';

type ApiRequest = { method?: string; headers: Record<string, string | string[] | undefined> };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const result = await handleProductV3ConsoleRequest(
    { method: request.method, headers: request.headers },
    { authorize: token => authorizeProductV3Admin(token, process.env) },
  );
  response.setHeader('Cache-Control', 'no-store');
  response.status(result.status).json(result.body);
}
