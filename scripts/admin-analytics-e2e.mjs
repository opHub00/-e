// 운영 지표(Analytics) 화면 브라우저 QA.
//   EVENT_RC_BASE_URL=http://127.0.0.1:4411 node scripts/admin-analytics-e2e.mjs
// 예시 상황(?demo=1&analytics=…) × desktop/tablet/mobile 에서:
//   상태 표지, 가로 넘침 0, 잘림 0, 터치 영역 44px 미만 0, raw JSON 0, 사람 수 표현 0, 색만으로 된 상태 0.
// 흐름: 개시 전 → QA 데이터 보기, 기간·직접 선택·공고 필터, 좁은 화면 조건 열기, 운영 데이터로 돌아가기.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOT = process.env.SHOT_DIR ?? '.cache/admin-analytics-e2e';
mkdirSync(SHOT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
];
// [예시 상황, 반드시 보일 표지, 보이면 안 되는 표지]
const SCENARIOS = [
  ['prelaunch', 'analytics-collection-pre_launch', 'analytics-kpis'],
  ['ready', 'analytics-collection-ready_not_started', 'analytics-kpis'],
  ['live', 'analytics-report', 'analytics-qa-banner'],
  ['live0', 'analytics-empty', 'analytics-kpis'],
  ['live500', 'analytics-report', 'analytics-qa-banner'],
  ['paused', 'analytics-collection-paused', 'analytics-collection-pre_launch'],
  ['misconfigured', 'analytics-collection-misconfigured', 'analytics-kpis'],
  ['stale', 'analytics-stale', 'analytics-last-event'],
  ['aiwarn', 'analytics-ai-warnings', 'analytics-qa-banner'],
  ['qa0', 'analytics-no-events', 'analytics-kpis'],
  ['qa20', 'analytics-report', 'analytics-collection-pre_launch'],
  ['qa100', 'analytics-report', 'analytics-collection-pre_launch'],
  ['qa500', 'analytics-report', 'analytics-collection-pre_launch'],
  ['schema', 'analytics-error-analytics_schema_not_ready', 'analytics-kpis'],
  ['readfail', 'analytics-error-analytics_read_failed', 'analytics-kpis'],
  ['authunavail', 'analytics-error-analytics_auth_unavailable', 'analytics-kpis'],
  ['timeout', 'analytics-error-analytics_timeout', 'analytics-kpis'],
  ['network', 'analytics-error-network', 'analytics-kpis'],
  ['forbidden', 'analytics-error-forbidden', 'analytics-kpis'],
  ['unauthorized', 'analytics-error-auth_required', 'analytics-kpis'],
];
const ERROR_TITLES = {
  schema: '운영 지표 저장소가 아직 준비되지 않았어요', readfail: '운영 데이터를 읽는 중 문제가 발생했어요',
  authunavail: '관리자 권한 확인 경로가 응답하지 않아요', timeout: '운영 데이터 조회가 지연되고 있어요',
};
const QA = ['qa0', 'qa20', 'qa100', 'qa500'];
const BANNED = ['사용자 수', '방문자 수', '신청자 수', '이용자 수', '당첨 가능성', '당첨 확률'];

const browser = await chromium.launch();
let checks = 0;
const report = [];
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

/** 화면 안 검사: 가로 넘침, 잘림, 작은 터치 영역, raw JSON, 금지어, 상태의 글자 동반. */
const audit = page => page.evaluate(({ banned }) => {
  const root = document.querySelector('[data-testid="console-analytics"]');
  const vw = window.innerWidth;
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const all = [...root.querySelectorAll('*')].filter(visible);
  const overflowX = document.documentElement.scrollWidth - vw;
  const offscreen = all.filter(el => el.getBoundingClientRect().right > vw + 1).map(el => el.textContent?.slice(0, 40));
  const clipped = all.filter(el => {
    const s = getComputedStyle(el);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') return false;
    if (el.childElementCount === 0 && !el.textContent?.trim()) return false; // 막대(장식)
    return el.scrollWidth > el.clientWidth + 1 || (el.textContent?.trim() && el.scrollHeight > el.clientHeight + 2 && s.overflowY !== 'auto' && s.overflowY !== 'scroll');
  }).map(el => el.textContent?.slice(0, 40));
  const interactive = [...document.querySelectorAll('[role="button"],[role="tab"],[role="link"],[role="switch"],input,button')].filter(visible);
  const small = interactive.filter(el => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
    .map(el => `${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
  const text = root.innerText;
  const rawJson = /[{[]\s*"[A-Za-z_]+"\s*:/.test(text) || /\b(undefined|NaN|\[object Object\])\b/.test(text);
  const bannedHits = banned.filter(term => text.includes(term));
  // 판정 상태 행: 아이콘 + 한국어 이름표 + 원시 enum(보조)
  const status = document.querySelector('[data-testid="analytics-status"]');
  const statusOk = !status || ['판정 완료', '추가 확인 필요', '신청 어려움', '판정 불가'].every(label => status.innerText.includes(label));
  return { overflowX, offscreen, clipped, small, rawJson, bannedHits, statusOk };
}, { banned: BANNED });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 600 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const tid = id => page.getByTestId(id).filter({ visible: true });

  for (const [scenario, must, mustNot] of SCENARIOS) {
    const started = Date.now();
    await page.goto(`${BASE}/admin/console/analytics?demo=1&analytics=${scenario}`, { waitUntil: 'networkidle' });
    await tid(must).first().waitFor({ timeout: 20000 });
    const renderMs = Date.now() - started;
    ok(await tid(mustNot).count() === 0, `${vp.name} ${scenario}: ${mustNot} hidden`);
    ok(await tid('console-demo-banner').count() === 1, `${vp.name} ${scenario}: demo banner`);
    const result = await audit(page);
    ok(result.overflowX <= 0 && result.offscreen.length === 0, `${vp.name} ${scenario}: horizontal overflow ${result.overflowX} ${result.offscreen.slice(0, 3)}`);
    ok(result.clipped.length === 0, `${vp.name} ${scenario}: clipped ${JSON.stringify(result.clipped.slice(0, 3))}`);
    ok(result.small.length === 0, `${vp.name} ${scenario}: touch < 44 ${JSON.stringify(result.small.slice(0, 5))}`);
    ok(!result.rawJson, `${vp.name} ${scenario}: raw JSON / undefined in UI`);
    ok(result.bannedHits.length === 0, `${vp.name} ${scenario}: banned wording ${result.bannedHits}`);
    ok(result.statusOk, `${vp.name} ${scenario}: status rows carry text labels`);
    // QA·비운영 기록이면 항상 표시, 운영 개시 전이면 공식 상태 표시
    const text = await tid('console-analytics').innerText();
    ok(!text.includes('UTC'), `${vp.name} ${scenario}: no UTC wording`);
    ok(!text.includes('운영 데이터 서버에 문제가 있어요'), `${vp.name} ${scenario}: no generic 503 copy`);
    if (QA.includes(scenario)) {
      ok(await tid('analytics-qa-banner').count() === 1, `${vp.name} ${scenario}: QA banner`);
      ok(await tid('analytics-official-banner').count() === 1, `${vp.name} ${scenario}: official status (server) banner`);
    }
    if (QA.includes(scenario) && scenario !== 'qa0') ok(await tid('analytics-qa-tag').count() === 4, `${vp.name} ${scenario}: every KPI tile tagged QA`);
    if (ERROR_TITLES[scenario]) ok(text.includes(ERROR_TITLES[scenario]), `${vp.name} ${scenario}: stable code copy`);
    if (['live', 'live500', 'qa100', 'paused'].includes(scenario)) {
      for (const step of ['session', 'started', 'completed', 'viewed', 'saved', 'qr']) ok(await tid(`analytics-funnel-${step}`).count() === 1, `${vp.name} ${scenario}: funnel ${step}`);
      for (const supply of ['YOUTH', 'NEWLYWED', 'NEWBORN', 'FIRST_HOME', 'GENERAL']) ok(await tid(`analytics-supply-${supply}`).count() === 1, `${vp.name} ${scenario}: supply ${supply}`);
      ok(await tid('analytics-generated').count() === 1 && await tid('analytics-last-event').count() + await tid('analytics-stale').count() === 1, `${vp.name} ${scenario}: freshness lines`);
    }
    if (scenario === 'paused') ok(await tid('analytics-report').count() === 1, `${vp.name} paused keeps recorded numbers`);
    report.push({ viewport: vp.name, scenario, renderMs, ...result });
    await page.screenshot({ path: `${SHOT}/${vp.name}-${scenario}.png`, fullPage: true });
  }

  // 콘솔 공통 상태(로그인 필요·권한 없음)도 운영 지표 화면에서 그대로 동작
  for (const [state, marker] of [['unauthorized', 'console-state-unauthorized'], ['forbidden', 'console-state-forbidden'], ['loading', 'console-state-loading']]) {
    await page.goto(`${BASE}/admin/console/analytics?demo=1&state=${state}`, { waitUntil: 'networkidle' });
    ok(await tid(marker).count() >= 1 || await page.getByTestId(marker).count() >= 1, `${vp.name} shell ${state}`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `${vp.name} shell ${state}: no overflow`);
  }

  // 흐름: 개시 전 → QA 데이터 보기 → 기간 · 공고 → 운영 데이터로 돌아가기
  await page.goto(`${BASE}/admin/console/analytics?demo=1&analytics=prelaunch`, { waitUntil: 'networkidle' });
  await tid('analytics-collection-pre_launch').waitFor();
  ok(await page.getByText('아직 운영 집계가 시작되지 않았어요').filter({ visible: true }).count() === 1, `${vp.name} prelaunch copy`);
  await page.getByRole('button', { name: 'QA 데이터 보기' }).filter({ visible: true }).click();
  await tid('analytics-report').waitFor();
  ok(await tid('analytics-qa-banner').count() === 1, `${vp.name} QA view is labelled`);
  await page.getByRole('button', { name: '조건 바꾸기' }).filter({ visible: true }).click();
  await tid('analytics-filters').waitFor();
  for (const key of ['today', '30d', '7d']) {
    await tid(`analytics-period-${key}`).click();
    ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `${vp.name} period ${key}`);
  }
  // 공고 이름은 쓰지 않는다: 공고 필터의 두 번째 칩(첫 공고)을 고르고 그 이름이 범위에 보이는지 본다.
  const noticeTab = page.locator('[data-testid^="analytics-notice-"][role="tab"]').filter({ visible: true }).nth(1);
  const noticeName = (await noticeTab.innerText()).trim();
  await noticeTab.click();
  ok((await tid('analytics-scope-label').innerText()).includes(noticeName), `${vp.name} notice filter shown in scope`);
  await tid('analytics-period-custom').click();
  await tid('analytics-from').fill('2026-10-30');
  await tid('analytics-to').fill('2026-10-01');
  ok(await tid('analytics-range-error').count() === 1, `${vp.name} custom range validation`);
  await tid('analytics-to').fill('2026-10-21');
  await tid('analytics-from').fill('2026-10-01');
  await page.getByRole('button', { name: '적용' }).filter({ visible: true }).click();
  ok((await tid('analytics-scope-label').innerText()).includes('2026-10-01 ~ 2026-10-21 (KST)'), `${vp.name} custom range applied`);
  await page.screenshot({ path: `${SHOT}/${vp.name}-flow-filters.png`, fullPage: true });
  await page.getByRole('button', { name: '운영 데이터 보기' }).filter({ visible: true }).click();
  await tid('analytics-collection-pre_launch').waitFor();
  ok(await tid('analytics-qa-banner').count() === 0, `${vp.name} back to operational view`);

  // 대시보드 카드 → 운영 지표, 메뉴에 운영 지표
  await page.goto(`${BASE}/admin/console?demo=1`, { waitUntil: 'networkidle' });
  await tid('console-dashboard').waitFor();
  ok(await tid('console-nav-analytics').count() === 1, `${vp.name} nav has 운영 지표`);
  await tid('console-nav-analytics').click();
  await tid('console-analytics').waitFor();
  ok(true, `${vp.name} nav opens analytics`);

  // Production 저장소 미연결: production·qa 는 0건이 아니라 '저장소 미연결'
  await page.goto(`${BASE}/admin/console/analytics?demo=1&analytics=prelaunch`, { waitUntil: 'networkidle' });
  await tid('analytics-collection-pre_launch').waitFor();
  await page.getByRole('button', { name: '조건 바꾸기' }).filter({ visible: true }).click();
  await tid('analytics-traffic-qa').click();
  await tid('analytics-store-unavailable').waitFor();
  ok(await tid('analytics-kpis').count() === 0 && await tid('analytics-qa-banner').count() === 1, `${vp.name} production store unavailable is not shown as numbers`);

  // 예시 격리: ?demo=1 없이는 예시 숫자가 없다
  await page.goto(`${BASE}/admin/console/analytics`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok(await tid('console-demo-banner').count() === 0 && await tid('analytics-report').count() === 0, `${vp.name} no demo data without ?demo=1`);

  ok(errors.length === 0, `${vp.name}: page errors ${errors.slice(0, 2)}`);
  await context.close();
}

await browser.close();
writeFileSync(`${SHOT}/report.json`, JSON.stringify(report.map(({ viewport, scenario, renderMs, overflowX, clipped, small }) => ({ viewport, scenario, renderMs, overflowX, clipped: clipped.length, small: small.length })), null, 1));
console.log(`admin analytics e2e: ${checks} checks passed · screenshots ${SHOT}`);
