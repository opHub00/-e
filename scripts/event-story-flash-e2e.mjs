// Product Story 첫 paint 점검: 완성/중간 프레임이 0% 프레임보다 먼저 보이면 실패.
//   EVENT_RC_BASE_URL=http://127.0.0.1:4173 node scripts/event-story-flash-e2e.mjs   (REPEAT=10 기본)
//
// 페이지 스크립트보다 먼저 심는 기록기(addInitScript)가 매 animation frame 마다
// 장면 문구 상자·무대의 누적 opacity 와 첫 공고 카드 opacity 를 적는다. 첫 프레임은 정적 HTML 이 그린 그대로다.
// 판정:
//  1. 문구·무대가 처음 보이는 프레임은 opacity ≈ 0 (0% 프레임).
//  2. 같은 장면 안에서 opacity 가 크게 떨어지지 않는다(완성 → 처음 → 재생 패턴 없음).
//  3. 장면이 바뀐 첫 프레임도 0% (이전 장면 마지막 값이 남지 않음).
// navigation 직후 0·50·100·200ms 스크린샷도 남긴다.
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOT = process.env.SHOT_DIR ?? '.cache/event-story-flash';
const REPEAT = Number(process.env.REPEAT ?? 10);
await mkdir(SHOT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });

const RECORDER = () => {
  window.__storyFrames = [];
  const t0 = performance.now();
  const chain = (el, stop) => { let o = 1; while (el && el !== stop) { o *= parseFloat(getComputedStyle(el).opacity || '1'); el = el.parentElement; } return o; };
  const sample = () => {
    const msg = document.querySelector('[data-testid="story-message"]');
    const sceneEl = document.querySelector('[data-testid^="story-scene-"]');
    const stage = sceneEl?.firstElementChild ?? null;
    const card = stage?.querySelector('div div div div') ?? null; // 첫 장면 카드(무대 > 변환 > 장면 > 카드)
    window.__storyFrames.push({
      t: Math.round(performance.now() - t0),
      scene: sceneEl?.getAttribute('data-testid') ?? null,
      msg: msg ? chain(msg, document.body) : null,
      stage: stage ? chain(stage, document.body) : null,
      card: card ? chain(card, document.body) : null,
    });
    if (window.__storyFrames.length < 2000) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/** 기록된 프레임으로 깜빡임을 찾는다. */
function analyse(frames, { reduced = false } = {}) {
  const problems = [];
  const firstMsg = frames.find(frame => frame.msg !== null);
  if (!firstMsg) problems.push('story message never rendered');
  else if (!reduced && firstMsg.msg > 0.05) problems.push(`first painted message opacity ${firstMsg.msg.toFixed(2)} at ${firstMsg.t}ms`);
  const firstStage = frames.find(frame => frame.stage !== null);
  if (firstStage && !reduced && firstStage.stage > 0.05) problems.push(`stage first appears at opacity ${firstStage.stage.toFixed(2)}`);
  if (firstStage && !reduced && firstStage.card !== null && firstStage.card > 0.05) problems.push(`first card first appears at opacity ${firstStage.card.toFixed(2)}`);
  let peak = 0;
  let scene = null;
  for (const frame of frames) {
    if (frame.msg === null) continue;
    if (frame.scene !== scene) {
      // 장면이 바뀐 첫 프레임: 0% 여야 한다(reduced 는 바로 완성).
      if (scene !== null && !reduced && frame.msg > 0.05) problems.push(`scene ${frame.scene} first frame message opacity ${frame.msg.toFixed(2)}`);
      scene = frame.scene;
      peak = frame.msg;
      continue;
    }
    if (peak > 0.5 && frame.msg < peak - 0.3) problems.push(`opacity dropped ${peak.toFixed(2)}→${frame.msg.toFixed(2)} at ${frame.t}ms in ${scene}`);
    peak = Math.max(peak, frame.msg);
  }
  return problems;
}

async function shots(page, label) {
  for (const at of [0, 50, 100, 200]) {
    if (at) await page.waitForTimeout(at === 50 ? 50 : 50 * (at / 100));
    await page.screenshot({ path: `${SHOT}/${label}-${at}ms.png` }).catch(() => undefined);
  }
}

const browser = await chromium.launch();
const SCENARIOS = [
  { name: 'desktop direct', viewport: { width: 1440, height: 900 }, mode: 'direct' },
  { name: 'desktop normal reload', viewport: { width: 1440, height: 900 }, mode: 'reload' },
  { name: 'desktop hard reload', viewport: { width: 1440, height: 900 }, mode: 'hard' },
  { name: 'mobile direct', viewport: { width: 390, height: 844 }, mode: 'direct', mobile: true },
  { name: 'mobile hard reload', viewport: { width: 390, height: 844 }, mode: 'hard', mobile: true },
  { name: 'desktop from /event landing', viewport: { width: 1440, height: 900 }, mode: 'landing' },
  { name: 'mobile from /event landing', viewport: { width: 390, height: 844 }, mode: 'landing', mobile: true },
];

const summary = [];
for (const scenario of SCENARIOS) {
  let flashes = 0;
  const details = [];
  for (let run = 0; run < REPEAT; run += 1) {
    const context = await browser.newContext({ viewport: scenario.viewport, isMobile: !!scenario.mobile, hasTouch: !!scenario.mobile });
    await context.addInitScript(RECORDER);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error).slice(0, 160)));
    const label = `${scenario.name.replace(/[^a-z0-9]+/gi, '-')}-${run}`;
    if (scenario.mode === 'landing') {
      await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.__storyFrames = []; });
      await page.getByTestId('landing-story').filter({ visible: true }).click();
      if (run === 0) await shots(page, label);
    } else {
      await page.goto(`${BASE}/event/story`, { waitUntil: scenario.mode === 'direct' ? 'commit' : 'networkidle' });
      if (scenario.mode !== 'direct') {
        if (scenario.mode === 'hard') {
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        }
        await page.reload({ waitUntil: 'commit' });
      }
      if (run === 0) await shots(page, label);
    }
    await page.getByTestId('story-message').filter({ visible: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    const frames = await page.evaluate(() => window.__storyFrames);
    const problems = analyse(frames);
    if (errors.length) problems.push(`runtime error: ${errors[0]}`);
    if (problems.length) { flashes += 1; details.push(`run ${run}: ${problems[0]}`); }
    await context.close();
  }
  summary.push({ scenario: scenario.name, runs: REPEAT, flashes });
  check(`${scenario.name}: 0 flashes in ${REPEAT} runs`, flashes === 0, details.slice(0, 2).join(' | '));
}

// 정적 HTML 자체가 0% 상태인지: 문구 상자 opacity 0.
{
  const html = await (await fetch(`${BASE}/event/story`)).text();
  const box = /<div[^>]*style="[^"]*opacity:\s*([0-9.]+)[^"]*"[^>]*>\s*<[a-z0-9]+[^>]*data-testid="story-message"/.exec(html);
  check('static HTML renders the story message at opacity 0', box && Number(box[1]) === 0, box ? `opacity ${box[1]}` : 'message box not found');
}

// 장면 전환·막대 이동·다시 보기·건너뛰기·시작
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(RECORDER);
  const page = await context.newPage();
  await page.goto(`${BASE}/event/story`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4200); // 장면 1 → 2 자동 전환
  await page.getByTestId('story-segment-3').filter({ visible: true }).click();
  await page.waitForTimeout(600);
  await page.getByTestId('story-segment-4').filter({ visible: true }).click();
  await page.getByTestId('story-replay').filter({ visible: true }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(2000);
  await page.getByTestId('story-replay').filter({ visible: true }).click();
  await page.waitForTimeout(600);
  const frames = await page.evaluate(() => window.__storyFrames);
  const scenes = [...new Set(frames.map(frame => frame.scene).filter(Boolean))];
  const problems = analyse(frames);
  check('auto advance, segment jump and replay start every scene at 0%', problems.length === 0, problems.slice(0, 3).join(' | '));
  check('transitions visited the expected scenes', ['story-scene-supplies', 'story-scene-conditions', 'story-scene-compare', 'story-scene-result'].every(id => scenes.includes(id)), scenes.join(','));
  check('replay goes back to scene 1', (await page.getByTestId('story-scene-supplies').count()) === 1);
  await page.getByTestId('story-start-now').filter({ visible: true }).click();
  await page.waitForURL(/\/event\/intro/, { timeout: 8000 });
  check('start leaves the story to the intro', /\/event\/intro/.test(page.url()));
  await page.goto(`${BASE}/event/story`, { waitUntil: 'networkidle' });
  await page.getByTestId('story-skip').filter({ visible: true }).click();
  await page.waitForURL(url => /\/event\/?$/.test(new URL(url).pathname), { timeout: 8000 });
  check('skip returns to the landing', /\/event\/?$/.test(new URL(page.url()).pathname));
  await context.close();
}

// reduced motion: 움직임 없이 완성된 그림, 사라졌다 나타나는 깜빡임도 없음.
{
  let flashes = 0;
  const details = [];
  for (let run = 0; run < REPEAT; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(RECORDER);
    const page = await context.newPage();
    await page.goto(`${BASE}/event/story`, { waitUntil: 'commit' });
    await page.getByTestId('story-message').filter({ visible: true }).waitFor({ timeout: 15000 });
    // A remote Preview can hydrate later than the local 900ms baseline. Wait for the
    // reduced-motion completed frame, while the recorder still verifies no in-between frame.
    await page.waitForFunction(() => {
      const message = document.querySelector('[data-testid="story-message"]');
      const scene = document.querySelector('[data-testid^="story-scene-"]');
      return message?.parentElement
        && Number.parseFloat(getComputedStyle(message.parentElement).opacity || '0') >= 0.99
        && scene?.firstElementChild;
    }, null, { timeout: 15000 });
    await page.waitForTimeout(100);
    const frames = await page.evaluate(() => window.__storyFrames);
    const problems = analyse(frames, { reduced: true });
    const lastFrame = frames.at(-1);
    if (!lastFrame || lastFrame.msg < 0.99 || (lastFrame.card ?? 1) < 0.99) problems.push(`reduced motion not complete: msg ${lastFrame?.msg} card ${lastFrame?.card}`);
    const stageFrames = frames.filter(frame => frame.stage !== null);
    if (stageFrames.some(frame => frame.card !== null && frame.card > 0.01 && frame.card < 0.99)) problems.push('reduced motion shows an in-between frame');
    if (problems.length) { flashes += 1; details.push(`run ${run}: ${problems[0]}`); }
    await context.close();
  }
  summary.push({ scenario: 'reduced motion direct', runs: REPEAT, flashes });
  check(`reduced motion: complete picture, no in-between frames in ${REPEAT} runs`, flashes === 0, details.slice(0, 2).join(' | '));
}

await browser.close();
console.table(summary);
const failed = results.filter(item => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
