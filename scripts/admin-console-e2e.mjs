// 운영 콘솔(V3) 브라우저 회귀.
//   EVENT_RC_BASE_URL=http://127.0.0.1:4411 node scripts/admin-console-e2e.mjs
// 6개 화면 × desktop/tablet/mobile 에서: 렌더, 예시 배너, 가로 넘침 0.
// 흐름: 공고 상세 탭 5개, 규칙 승인 확인 단계, AI 필터, 예시 데이터 격리(?demo=1 없이는 예시가 보이지 않음).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOT = process.env.SHOT_DIR ?? '.cache/admin-console-e2e';
mkdirSync(SHOT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
];
const SCREENS = [
  ['dashboard', '/admin/console?demo=1', 'console-dashboard'],
  ['analytics', '/admin/console/analytics?demo=1&analytics=qa100', 'console-analytics'],
  ['notices', '/admin/console/notices?demo=1', 'console-notices'],
  ['notice-detail', '/admin/console/notice?demo=1&id=demo-notice-a', 'console-notice-detail'],
  ['rules', '/admin/console/rules?demo=1', 'console-rules'],
  ['assessments', '/admin/console/assessments?demo=1', 'console-assessments'],
  ['ai', '/admin/console/ai?demo=1', 'console-ai'],
  ['audit', '/admin/console/audit?demo=1', 'console-audit'],
];

const browser = await chromium.launch();
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 600 });
  const page = await context.newPage();
  const tid = id => page.getByTestId(id).filter({ visible: true });
  const hOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  for (const [name, path, testID] of SCREENS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await tid(testID).waitFor({ timeout: 20000 });
    ok(await tid('console-demo-banner').count() === 1, `${vp.name} ${name}: demo banner`);
    ok(await hOverflow() <= 0, `${vp.name} ${name}: no horizontal overflow`);
    ok(!(await page.getByText('admin/console', { exact: false }).filter({ visible: true }).count()), `${vp.name} ${name}: no router header`);
    await page.screenshot({ path: `${SHOT}/${vp.name}-${name}.png`, fullPage: true });
  }

  // 공고 상세: 탭 5개가 모두 열린다
  await page.goto(`${BASE}/admin/console/notice?demo=1&id=demo-notice-a`, { waitUntil: 'networkidle' });
  for (const key of ['overview', 'source', 'rules', 'rag', 'history']) {
    await tid(`console-notice-tabs-${key}`).click();
    ok(await tid('console-notice-detail').count() === 1 && await hOverflow() <= 0, `${vp.name} notice tab ${key}`);
  }

  // 규칙 검토: 승인은 확인 단계를 거친다
  await page.goto(`${BASE}/admin/console/rules?demo=1`, { waitUntil: 'networkidle' });
  await tid('console-rules').waitFor();
  await tid('console-rule-notice-demo-notice-c').click();
  await tid('console-rule-r1').click();
  await tid('console-rule-detail').waitFor();
  await page.getByRole('button', { name: '승인', exact: true }).filter({ visible: true }).first().click();
  await page.getByText('이 규칙을 승인할까요?').waitFor({ timeout: 5000 });
  ok(true, `${vp.name} approve asks for confirmation`);
  await page.screenshot({ path: `${SHOT}/${vp.name}-rules-confirm.png` });
  await page.getByRole('button', { name: '승인', exact: true }).filter({ visible: true }).last().click();
  await page.getByText('승인했어요', { exact: false }).first().waitFor({ timeout: 5000 });
  ok(true, `${vp.name} approve applied after confirm`);

  // AI 모니터링: 필터
  await page.goto(`${BASE}/admin/console/ai?demo=1`, { waitUntil: 'networkidle' });
  for (const key of ['fallback', 'grounding', 'provider', 'all']) {
    await tid(`console-ai-filter-${key}`).click();
    ok(await hOverflow() <= 0, `${vp.name} ai filter ${key}`);
  }

  // 예시 데이터 격리: ?demo=1 없이는 예시 배너·예시 데이터가 없다
  await page.goto(`${BASE}/admin/console`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok(await tid('console-demo-banner').count() === 0, `${vp.name} no demo banner without ?demo=1`);
  ok(!(await page.getByText('[예시]', { exact: false }).filter({ visible: true }).count()), `${vp.name} no demo rows without ?demo=1`);

  await context.close();
}

await browser.close();
console.log(`admin console e2e: ${checks} checks passed`);
