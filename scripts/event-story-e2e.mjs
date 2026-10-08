// Product Story 점검. dist 를 event-rc-server 로 띄운 상태에서 실행한다.
//   EVENT_RC_BASE_URL=http://127.0.0.1:4173 node scripts/event-story-e2e.mjs
// Playwright 는 navigator.webdriver=true 라 첫 화면 자동 재생을 끄므로, 여기서는 일반 브라우저처럼 보이게 바꿔 검사한다.
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOT = process.env.SHOT_DIR ?? '.cache/event-story';
await mkdir(SHOT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const SCENES = ['complexity', 'profile', 'analysis', 'sorting', 'action'];
const VIEWPORTS = [
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function open(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  return { context, page, errors };
}
const tid = (page, id) => page.getByTestId(id).filter({ visible: true });
async function overflow(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="product-story"], [data-testid="event-story-route"]');
    const pageOver = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (!root) return { pageOver, clipped: [] };
    const box = root.getBoundingClientRect();
    // 무대 밖으로 삐져나와 잘리는 글자가 있는지(무대 영역은 overflow hidden 이라 잘림 = 정보 손실).
    const stage = root.querySelector('[data-testid^="story-scene-"]')?.getBoundingClientRect();
    const clipped = [...root.querySelectorAll('div[dir="auto"]')]
      .filter(el => el.textContent?.trim())
      .map(el => ({ text: el.textContent.trim().slice(0, 20), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1 || (stage && r.top >= stage.top && r.top < stage.bottom && r.bottom > stage.bottom + 1)))
      .map(({ text }) => text);
    return { pageOver, clipped };
  });
}

for (const viewport of VIEWPORTS) {
  const { context, page, errors } = await open(viewport);
  // 첫 진입: 앱 공통 브랜드 인트로가 Story 앞에 따로 돌지 않아야 한다.
  let sawBrandEntrance = false;
  await page.exposeFunction('__brandSeen', () => { sawBrandEntrance = true; });
  await context.addInitScript(() => {
    new MutationObserver(() => { if (document.querySelector('[data-testid="brand-entrance"]')) (window).__brandSeen?.(); })
      .observe(document, { childList: true, subtree: true });
  });
  await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
  const opened = await tid(page, 'product-story').waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  check(`${viewport.name}: first visit auto-plays the story`, opened);
  const started = Date.now();
  check(`${viewport.name}: brand cover lifted once the story is on screen`, !(await page.evaluate(() => document.documentElement.hasAttribute('data-entrance'))));
  // 장면별 '그림 완성' 시점 직후에 찍는다.
  const CAPTURE_AT = [1250, 1500, 3050, 2400, 1500];
  for (const [index, scene] of SCENES.entries()) {
    await tid(page, `story-scene-${scene}`).waitFor({ timeout: 8000 });
    const sceneStart = Date.now();
    await page.waitForTimeout(CAPTURE_AT[index]);
    await page.screenshot({ path: `${SHOT}/${viewport.name}-${index + 1}-${scene}.png` });
    if (index < SCENES.length - 1) await page.waitForTimeout(0);
    void sceneStart;
    const { pageOver, clipped } = await overflow(page);
    check(`${viewport.name} scene ${index + 1}: no overflow or clipped text`, pageOver <= 1 && clipped.length === 0, `${pageOver}px ${clipped.join('|')}`);
  }
  const reachedMs = Date.now() - started;
  // 자동 재생 11.7초 + 캡처·검사 시간 여유.
  check(`${viewport.name}: reaches the final CTA within 13s (+ capture overhead)`, reachedMs < 14_500, `${reachedMs}ms`);
  check(`${viewport.name}: no separate brand intro before the story`, !sawBrandEntrance);
  check(`${viewport.name}: final scene shows CTA and replay`, (await tid(page, 'story-start').count()) === 1 && (await tid(page, 'story-replay').count()) === 1);
  // 다시 보기
  await tid(page, 'story-replay').click();
  await tid(page, 'story-scene-complexity').waitFor();
  check(`${viewport.name}: replay returns to scene 1`, true);
  // 막대로 장면 이동
  await tid(page, 'story-segment-4').click();
  await tid(page, 'story-scene-action').waitFor();
  // CTA → 실제 Intro
  await tid(page, 'story-start').click();
  await tid(page, 'event-intro').waitFor({ timeout: 8000 });
  check(`${viewport.name}: CTA enters the real intro flow`, true);
  await tid(page, 'intro-next').click();
  await tid(page, 'household-single').waitFor();
  check(`${viewport.name}: intro continues into input`, true);
  // 재방문: 다시 자동 재생하지 않는다
  await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check(`${viewport.name}: revisit does not force the story`, (await tid(page, 'product-story').count()) === 0 && (await tid(page, 'event-start').count()) === 1);
  // 첫 화면의 다시 보기 버튼
  await tid(page, 'landing-story').click();
  await tid(page, 'product-story').waitFor();
  await tid(page, 'story-skip').click();
  await page.waitForTimeout(400);
  check(`${viewport.name}: skip closes the story back to the landing`, (await tid(page, 'product-story').count()) === 0 && (await tid(page, 'event-start').count()) === 1);
  check(`${viewport.name}: no runtime errors`, errors.length === 0, errors[0] ?? '');
  await context.close();
}

// 첫 장면에서 바로 건너뛰기 / 바로 시작하기
{
  const { context, page } = await open({ width: 768, height: 1024 });
  await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
  await tid(page, 'product-story').waitFor();
  await tid(page, 'story-start-now').click();
  await tid(page, 'event-intro').waitFor({ timeout: 8000 });
  check('start-now from scene 1 enters the intro immediately', true);
  await context.close();
}

// reduced motion: 장면마다 완성된 그림이 바로 보인다
{
  const { context, page, errors } = await open({ width: 768, height: 1024 }, { reducedMotion: 'reduce' });
  await page.goto(`${BASE}/event/story`, { waitUntil: 'networkidle' });
  await tid(page, 'event-story-route').waitFor();
  for (const [index, scene] of SCENES.entries()) {
    await tid(page, `story-segment-${index}`).click();
    await tid(page, `story-scene-${scene}`).waitFor();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT}/reduced-${index + 1}-${scene}.png` });
  }
  const transforms = await page.evaluate(() => [...document.querySelectorAll('[data-testid="story-scene-action"] div')].some(el => /matrix\(0\.8/.test(getComputedStyle(el).transform)));
  check('reduced motion: final scene is shown complete without mid-animation state', !transforms);
  check('reduced motion: no runtime errors', errors.length === 0, errors[0] ?? '');
  await context.close();
}

await browser.close();
const failed = results.filter(item => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
