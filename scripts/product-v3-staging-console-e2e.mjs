import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import adminApi from '../api/admin-api/product-v3.ts';

if (process.env.WANPANE_ENV !== 'staging' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.SUPABASE_STAGING_PROJECT_REF !== 'krkeiytshxpqojrlrmsx' ||
    process.env.SUPABASE_PRODUCTION_PROJECT_REF !== 'ypdreeipoxcztbxtiklt' ||
    !process.env.STAGING_QA_EMAIL || !process.env.STAGING_QA_PASSWORD) {
  throw new Error('STAGING_E2E_IDENTITY_REQUIRED');
}

const root = resolve('.staging/dist');
if (!existsSync(join(root, 'index.html'))) throw new Error('STAGING_BUILD_REQUIRED');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    if (pathname === '/admin-api/product-v3') {
      return adminApi({ method: request.method, headers: request.headers }, {
        setHeader: (name, value) => response.setHeader(name, value),
        status: status => ({ json: body => { response.statusCode = status; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(body)); } }),
      });
    }
    const candidate = resolve(root, pathname.replace(/^[/\\]+/, ''));
    if (candidate !== root && !candidate.startsWith(root + sep)) { response.writeHead(400).end(); return; }
    const files = pathname === '/' ? [join(root, 'index.html')] :
      [candidate, candidate + '.html', join(candidate, 'index.html'), join(root, 'index.html')];
    for (const file of files) {
      if (!existsSync(file) || !(await stat(file)).isFile()) continue;
      response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(file).pipe(response);
      return;
    }
    response.writeHead(404).end();
  } catch {
    response.writeHead(500).end();
  }
});

await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const address = server.address();
const base = 'http://127.0.0.1:' + address.port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const apiStatuses = [];
page.on('response', response => {
  if (response.url().includes('/admin-api/product-v3')) apiStatuses.push(response.status());
});
const report = { login: false, connected: false, routes: {}, apiStatuses, firstRouteState: null };
try {
  await page.goto(base + '/admin/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('관리자 이메일').fill(process.env.STAGING_QA_EMAIL);
  await page.getByLabel('관리자 비밀번호').fill(process.env.STAGING_QA_PASSWORD);
  await page.getByRole('button', { name: '관리자 로그인' }).click();
  await page.waitForURL(/\/admin(?:\?|$)/, { timeout: 20000 });
  report.login = true;
  for (const route of ['', '/notices', '/notice', '/rules', '/assessments', '/ai', '/audit']) {
    const url = base + '/admin/console' + route;
    const response = page.waitForResponse(item => item.url().includes('/admin-api/product-v3'), { timeout: 15000 }).catch(() => null);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const apiResponse = await response;
    const body = await page.locator('body').innerText();
    if (route === '') report.firstRouteState = {
      loginRequired: body.includes('관리자 권한이 필요해요'),
      authPending: body.includes('권한을 확인하는 중이에요'),
      dataPending: body.includes('데이터 연결 중'),
      unavailable: body.includes('운영 데이터 서버에 연결하지 못했어요.'),
    };
    report.routes[route || '/'] = apiResponse?.status() === 200 &&
      !body.includes('운영 데이터 서버에 연결하지 못했어요.') && !body.includes('관리자 권한이 필요해요');
    if (!apiResponse) break;
  }
  report.connected = apiStatuses.includes(200) && Object.values(report.routes).every(Boolean);
  console.log(JSON.stringify(report));
  if (!report.connected) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolveServer => server.close(resolveServer));
}
