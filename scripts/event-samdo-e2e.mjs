// 공고 전용 결과 화면 점검: desktop(compact) · iPad(comfortable) · mobile(touch).
//   EVENT_RC_BASE_URL=http://127.0.0.1:4173 node scripts/event-samdo-e2e.mjs   (Demo Mode 빌드 필요)
// 추천 → 이유 → 다른 유형 → 어려운 유형 → 다음 행동 구조, 첫 화면 정보량, 터치 영역, 가로 넘침, QR, 결과 화면 입구를 확인한다.
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOT = process.env.SHOT_DIR ?? '.cache/event-samdo';
await mkdir(SHOT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'ipad-landscape-1024', width: 1024, height: 768 },
  { name: 'ipad-portrait-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const rect = (page, id) => page.evaluate(id => {
  const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find(node => node.getBoundingClientRect().width > 0);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left, width: r.width, height: r.height };
}, id);

async function open(page, persona) {
  await page.goto(`${BASE}/event/samdo?persona=${persona}`, { waitUntil: 'networkidle' });
  await page.getByTestId('samdo-hero').filter({ visible: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
}

const table = [];
for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  await open(page, 'NEWLYWED_ONE_CHILD');
  await page.screenshot({ path: `${SHOT}/${viewport.name}-newborn.png` });
  await page.screenshot({ path: `${SHOT}/${viewport.name}-newborn-full.png`, fullPage: true });

  const ids = ['samdo-header', 'samdo-hero', 'samdo-why', 'samdo-alternatives', 'samdo-schedule', 'samdo-rejected', 'samdo-next'];
  const boxes = Object.fromEntries(await Promise.all(ids.map(async id => [id, await rect(page, id)])));
  check(`${viewport.name}: every section rendered`, ids.every(id => boxes[id]), ids.filter(id => !boxes[id]).join(','));
  check(`${viewport.name}: character and partner logo are the real assets`, (await page.getByTestId('brand-character').filter({ visible: true }).count()) === 1 && (await page.getByTestId('partner-logo').filter({ visible: true }).count()) === 1);
  const heroTitle = await page.getByTestId('samdo-hero-title').filter({ visible: true }).innerText();
  check(`${viewport.name}: hero recommends newborn priority`, heroTitle.includes('신생아 특별공급'), heroTitle);
  const altCards = await page.evaluate(vh => [...document.querySelectorAll('[data-testid^="samdo-alt-"]')].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.top < vh).length, viewport.height);
  const altTotal = await page.locator('[data-testid^="samdo-alt-"]').filter({ visible: true }).count();
  const heroInView = boxes['samdo-hero'] && boxes['samdo-hero'].top < viewport.height;
  const metrics = await page.evaluate(() => {
    const small = [...document.querySelectorAll('[role="button"],[role="link"]')]
      .map(el => ({ r: el.getBoundingClientRect(), label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20) }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5))
      .map(({ r, label }) => `${label}:${Math.round(r.width)}x${Math.round(r.height)}`);
    return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  table.push({ viewport: viewport.name, heroInView, altInFirstScreen: altCards, altTotal, overflow: metrics.overflow });
  check(`${viewport.name}: hero starts in the first screen`, heroInView);
  check(`${viewport.name}: no horizontal overflow`, metrics.overflow <= 1, String(metrics.overflow));
  check(`${viewport.name}: touch targets ≥ 44px`, metrics.small.length === 0, metrics.small.slice(0, 4).join(', '));

  // 순서: desktop 은 추천(왼쪽)과 다른 유형(오른쪽)이 나란히, 그 외에는 위에서 아래로.
  if (viewport.width >= 1200) {
    check(`${viewport.name}: alternatives sit beside the hero`, boxes['samdo-alternatives'].left > boxes['samdo-hero'].left + boxes['samdo-hero'].width - 1);
    check(`${viewport.name}: at least two alternative cards start in the first screen`, altCards >= 2, `${altCards}/${altTotal}`);
  } else {
    const order = ['samdo-hero', 'samdo-why', 'samdo-alternatives'].map(id => boxes[id].top);
    check(`${viewport.name}: hero → why → alternatives`, order[0] < order[1] && order[1] < order[2]);
    if (viewport.width < 744) check(`${viewport.name}: schedule comes right after the alternatives`, boxes['samdo-schedule'].top > boxes['samdo-alternatives'].top && boxes['samdo-schedule'].top < boxes['samdo-rejected'].top);
  }

  if (viewport.name === 'desktop-1440' || viewport.name === 'mobile-390') {
    await page.getByTestId('samdo-save-qr').filter({ visible: true }).click();
    await page.getByTestId('samdo-qr-code').filter({ visible: true }).waitFor({ timeout: 15000 });
    const link = await page.evaluate(() => document.querySelector('[data-link]')?.getAttribute('data-link'));
    check(`${viewport.name}: QR is created through the existing result session`, /\/event\/take\?t=|\/r\//.test(link ?? '') || /^https?:\/\//.test(link ?? ''), link ?? '');
    if (link) {
      const phone = await context.newPage();
      await phone.goto(link, { waitUntil: 'networkidle' });
      await phone.waitForTimeout(800);
      const body = await phone.evaluate(() => document.body.innerText);
      check(`${viewport.name}: phone page shows the recommended supply`, body.includes('신생아 특별공급'), body.slice(0, 120).replace(/\s+/g, ' '));
      await phone.close();
    }
  }

  if (viewport.name === 'desktop-1440') {
    await page.getByTestId('samdo-ask-ai').filter({ visible: true }).click();
    await page.getByTestId('chat-context').filter({ visible: true }).waitFor({ timeout: 15000 });
    const chatContext = await page.getByTestId('chat-context').filter({ visible: true }).innerText();
    check('Samdo result → AI carries the Samdo recommendation context', chatContext.includes('삼도이동 1지구') && chatContext.includes('삼도 전용 판정'), chatContext.replace(/\s+/g, ' '));
  }

  // 신청 가능한 유형이 없는 경우
  await open(page, 'CLEARLY_INELIGIBLE');
  const noneTitle = await page.getByTestId('samdo-hero-title').filter({ visible: true }).innerText();
  check(`${viewport.name}: no-eligible persona gets an honest hero`, noneTitle.includes('어려워요'), noneTitle);
  if (viewport.name === 'desktop-1440' || viewport.name === 'mobile-390') await page.screenshot({ path: `${SHOT}/${viewport.name}-ineligible.png`, fullPage: true });
  check(`${viewport.name}: no runtime errors`, errors.length === 0, errors[0] ?? '');
  await context.close();
}

// 결과 화면에서 들어가는 입구
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/event/demo`, { waitUntil: 'networkidle' });
  await page.getByTestId('demo-inject-full-FIRST_HOME_COUPLE').filter({ visible: true }).click();
  for (let i = 0; i < 4; i += 1) {
    const where = await Promise.race([
      page.getByTestId('results-title').filter({ visible: true }).waitFor({ timeout: 25000 }).then(() => 'results'),
      page.getByTestId('adaptive-submit').filter({ visible: true }).waitFor({ timeout: 25000 }).then(() => 'adaptive'),
    ]);
    if (where === 'results') break;
    await page.getByTestId('adaptive-submit').filter({ visible: true }).click();
  }
  await page.getByTestId('open-samdo-result').filter({ visible: true }).click();
  await page.getByTestId('samdo-hero').filter({ visible: true }).waitFor({ timeout: 15000 });
  const entryHero = await page.getByTestId('samdo-hero-title').filter({ visible: true }).innerText();
  check('results → 공고 전용 결과 entry works with the adapter-derived ranking', /먼저 검토|확인해 보세요|신청하기 어려워요/.test(entryHero), entryHero);
  await context.close();
}

await browser.close();
console.table(table);
const failed = results.filter(item => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
