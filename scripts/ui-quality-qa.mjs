// UI 품질 회귀 점검(반응형). Demo Mode 빌드를 event-rc-server 로 띄운 뒤 실행한다.
//   EVENT_RC_BASE_URL=http://127.0.0.1:4173 node scripts/ui-quality-qa.mjs [tag]
//
// 11개 viewport × 대표 화면마다 잰다.
//  - hOverflow: 문서 가로 넘침(px). 0 이 아니면 실패.
//  - vScroll: 스크롤이 생긴 영역에서 '실제 내용은 다 보이는데' 남는 스크롤 길이(px). 0 이 아니면 실패.
//    (내용이 정말 길어 생긴 스크롤은 실패가 아니다.)
//  - clipped: overflow 로 잘린 글자 요소 수(말줄임 표시는 제외).
//  - obstructed: 화면 맨 아래까지 내렸을 때 고정/sticky 요소에 가려진 버튼 수.
//  - small: 44px 보다 작은 누르는 영역 수.
//  - keyboard: 입력창에 초점을 두고 화면 높이를 줄였을 때(가상 키보드) 입력창이 보이지 않으면 1.
//  - modal: 모달이 화면 밖으로 넘치면 1.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const TAG = process.argv[2] ?? 'run';
const OUT = process.env.SHOT_DIR ?? '.cache/ui-quality';
const SHOT_VIEWPORTS = new Set((process.env.SHOT_VIEWPORTS ?? '320x568,390x844,768x1024,1366x768,1920x1080').split(','));
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
await mkdir(OUT, { recursive: true });

export const VIEWPORTS = [
  [320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [820, 1180],
  [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080],
];

/** 화면 측정 스크립트(브라우저 안에서 실행). */
const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01; };
  const contentEls = [...document.querySelectorAll('body *')].filter(el => {
    if (!visible(el)) return false;
    if (['IMG', 'INPUT', 'TEXTAREA', 'BUTTON', 'svg', 'CANVAS'].includes(el.tagName)) return true;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') return true;
    // 배경·테두리가 있는 상자(카드)도 내용이다. 화면 전체를 덮는 바탕은 제외한다.
    const cs = getComputedStyle(el);
    const boxed = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderBottomWidth) > 0;
    if (boxed && el.getBoundingClientRect().height < vh * 0.9) return true;
    return [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
  });
  // 스크롤 영역: 문서 + overflow auto/scroll 인 요소
  const scrollers = [document.scrollingElement, ...[...document.querySelectorAll('body *')].filter(el => {
    const s = getComputedStyle(el);
    return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && visible(el);
  })];
  let vScroll = 0;
  const vScrollAt = [];
  for (const sc of scrollers) {
    if (!sc || sc.scrollHeight <= sc.clientHeight + 1) continue;
    const isDoc = sc === document.scrollingElement;
    const top = isDoc ? 0 : sc.getBoundingClientRect().top;
    const scrollTop = isDoc ? window.scrollY : sc.scrollTop;
    const inside = contentEls.filter(el => isDoc || sc.contains(el));
    if (!inside.length) continue;
    const contentBottom = Math.max(...inside.map(el => el.getBoundingClientRect().bottom - top + scrollTop));
    const viewportOf = isDoc ? vh : sc.clientHeight;
    if (contentBottom <= viewportOf + 1) {
      const excess = sc.scrollHeight - sc.clientHeight;
      vScroll += excess;
      vScrollAt.push(`${isDoc ? 'document' : (sc.getAttribute('data-testid') ?? sc.tagName.toLowerCase())}:+${excess}px`);
    }
  }
  const clipped = [...document.querySelectorAll('body *')].filter(el => {
    if (!visible(el) || !el.textContent.trim() || el.children.length) return false;
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && s.webkitLineClamp) return false;
    return (s.overflowX === 'hidden' || s.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2;
  }).length;
  const small = [...document.querySelectorAll('[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="tab"],button,a[href],input,textarea,select')]
    .filter(visible).map(el => el.getBoundingClientRect()).filter(r => r.height < 43.5 || r.width < 43.5).length;
  return { hOverflow: Math.max(0, document.documentElement.scrollWidth - vw), vScroll, vScrollAt: vScrollAt.join(' '), clipped, small };
};

/** 맨 아래로 내린 뒤 고정·sticky 요소에 가려진 버튼 수. */
const OBSTRUCTION = () => {
  // 모달이 떠 있으면 뒤 화면은 의도적으로 덮인다. 모달 안 버튼만 본다.
  const dialog = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].find(el => el.getBoundingClientRect().height > 0);
  const fixed = [...document.querySelectorAll('body *')].filter(el => /(fixed|sticky)/.test(getComputedStyle(el).position) && el.getBoundingClientRect().height > 0);
  const targets = [...document.querySelectorAll('[role="button"],button,input,textarea')].filter(el => el.getBoundingClientRect().height > 0 && (!dialog || dialog.contains(el)));
  let hidden = 0;
  for (const t of targets) {
    const r = t.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy < 0 || cy > window.innerHeight || cx < 0 || cx > window.innerWidth) continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || t.contains(top) || top.contains(t)) continue;
    if (fixed.some(f => f.contains(top) && !f.contains(t))) hidden += 1;
  }
  return hidden;
};

const tid = (page, id) => page.getByTestId(id).filter({ visible: true });

/** 대표 화면과 여는 방법. 열지 못하면 skip 으로 남긴다. */
const SCREENS = [
  { id: 'landing', open: async p => { await p.goto(`${BASE}/event`, { waitUntil: 'networkidle' }); await tid(p, 'event-landing').waitFor(); } },
  { id: 'story', open: async p => { await p.goto(`${BASE}/event/story`, { waitUntil: 'networkidle' }); await tid(p, 'event-story-route').waitFor(); await p.waitForTimeout(1200); } },
  { id: 'questionnaire', open: async p => { await p.goto(`${BASE}/event/household`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500); } },
  { id: 'modal', open: async p => { await p.goto(`${BASE}/event/household`, { waitUntil: 'networkidle' }); await tid(p, 'kiosk-home-button').click(); await p.waitForTimeout(400); }, modal: true },
  { id: 'result', open: async p => { await p.goto(`${BASE}/event/samdo?persona=NEWLYWED_ONE_CHILD`, { waitUntil: 'networkidle' }); await tid(p, 'district-comparison').or(tid(p, 'samdo-result')).first().waitFor({ timeout: 20000 }); } },
  { id: 'copilot', open: async p => {
    // 입력 상태는 메모리에만 있어 새로 불러오면 사라진다. 결과 화면의 'AI에게 질문하기'로 들어간다.
    await p.goto(`${BASE}/event/samdo?persona=NEWLYWED_ONE_CHILD`, { waitUntil: 'networkidle' });
    await tid(p, 'district-comparison').or(tid(p, 'samdo-result')).first().waitFor({ timeout: 20000 });
    if (!(await tid(p, 'samdo-ask-ai').count())) { const t = tid(p, 'district-detail-toggle'); if (await t.count()) await t.click(); }
    await tid(p, 'samdo-ask-ai').click();
    await tid(p, 'chat-context').waitFor({ timeout: 20000 });
    await p.waitForTimeout(600);
  }, keyboard: 'chat-input' },
  { id: 'take', open: async p => {
    await p.goto(`${BASE}/event/samdo?persona=NEWLYWED_ONE_CHILD`, { waitUntil: 'networkidle' });
    const save = tid(p, 'samdo-save-qr');
    if (!(await save.count())) { const t = tid(p, 'district-detail-toggle'); if (await t.count()) await t.click(); }
    await tid(p, 'samdo-save-qr').click();
    await tid(p, 'samdo-qr-code').waitFor({ timeout: 15000 });
    const link = await p.evaluate(() => document.querySelector('[data-link]')?.getAttribute('data-link'));
    await p.goto(link, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
  } },
  { id: 'home', open: async p => { await p.goto(`${BASE}/home`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); } },
  { id: 'discovery', open: async p => { await p.goto(`${BASE}/discovery`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); } },
  { id: 'notice-detail', open: async p => {
    await p.goto(`${BASE}/discovery`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    // 목록 카드(넓은 화면) 또는 지도 핀 → 시트의 '상세 보기'(좁은 화면)로 연다.
    const detail = p.locator('[aria-label$=" 상세 보기"]').filter({ visible: true });
    if (!(await detail.count())) { await p.locator('[aria-label$=" 지도 핀"]').filter({ visible: true }).first().click(); await p.waitForTimeout(500); }
    if (!(await detail.count())) throw new Error('no notice opener');
    await detail.first().click();
    await p.waitForURL(/\/discovery\/[^/?]+/, { timeout: 15000 }); await p.waitForTimeout(1500);
  } },
  { id: 'admin-dashboard', open: async p => { await p.goto(`${BASE}/admin/console?demo=1`, { waitUntil: 'networkidle' }); await tid(p, 'console-dashboard').waitFor({ timeout: 15000 }); } },
  { id: 'admin-notices', open: async p => { await p.goto(`${BASE}/admin/console/notices?demo=1`, { waitUntil: 'networkidle' }); await tid(p, 'console-notices').waitFor({ timeout: 15000 }); } },
  { id: 'admin-notice-detail', open: async p => { await p.goto(`${BASE}/admin/console/notice?demo=1&id=demo-notice-a`, { waitUntil: 'networkidle' }); await tid(p, 'console-notice-detail').waitFor({ timeout: 15000 }); } },
  { id: 'admin-rules', open: async p => { await p.goto(`${BASE}/admin/console/rules?demo=1`, { waitUntil: 'networkidle' }); await tid(p, 'console-rules').waitFor({ timeout: 15000 }); } },
  { id: 'admin-assessments', open: async p => { await p.goto(`${BASE}/admin/console/assessments?demo=1`, { waitUntil: 'networkidle' }); await tid(p, 'console-assessments').waitFor({ timeout: 15000 }); } },
  { id: 'admin-ai', open: async p => { await p.goto(`${BASE}/admin/console/ai?demo=1`, { waitUntil: 'networkidle' }); await tid(p, 'console-ai').waitFor({ timeout: 15000 }); } },
  { id: 'admin-audit', open: async p => { await p.goto(`${BASE}/admin/console/audit?demo=1`, { waitUntil: 'networkidle' }); await tid(p, 'console-audit').waitFor({ timeout: 15000 }); } },
];

const browser = await chromium.launch();
const rows = [];
for (const [w, h] of VIEWPORTS) {
  const vp = `${w}x${h}`;
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 768, isMobile: w < 768 });
  // 첫 방문 Story 자동 재생·브랜드 인트로가 측정을 가리지 않게(일반 브라우저처럼 보이되 이미 본 상태)
  await context.addInitScript(() => { try { localStorage.setItem('wanpan.event.productStory.v1', 'seen'); sessionStorage.setItem('wanpane:brand-entrance', 'done'); } catch { /* ignore */ } });
  const page = await context.newPage();
  for (const screen of SCREENS) {
    if (ONLY && !ONLY.has(screen.id)) continue;
    const row = { vp, screen: screen.id };
    try {
      await screen.open(page);
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(400);
      Object.assign(row, await page.evaluate(MEASURE));
      if (SHOT_VIEWPORTS.has(vp)) await page.screenshot({ path: `${OUT}/${TAG}-${screen.id}-${vp}.png` });
      // 맨 아래로 내려 가림 확인
      await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); for (const el of document.querySelectorAll('body *')) if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(250);
      row.obstructed = await page.evaluate(OBSTRUCTION);
      if (screen.modal) {
        row.modal = await page.evaluate(() => {
          const dialog = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].find(el => el.getBoundingClientRect().height > 0);
          if (!dialog) return 'none';
          const r = dialog.getBoundingClientRect();
          return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1 ? 1 : 0;
        });
      }
      if (screen.keyboard) {
        const input = tid(page, screen.keyboard);
        if (await input.count()) {
          await input.focus();
          await page.setViewportSize({ width: w, height: Math.round(h * 0.55) });
          await page.waitForTimeout(400);
          row.keyboard = await page.evaluate(id => {
            const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find(e => e.getBoundingClientRect().height > 0);
            if (!el) return 1;
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight + 1 ? 0 : 1;
          }, screen.keyboard);
          await page.setViewportSize({ width: w, height: h });
        }
      }
    } catch (error) {
      row.skip = String(error.message ?? error).split('\n')[0].slice(0, 80);
    }
    rows.push(row);
  }
  await context.close();
}
await browser.close();
await writeFile(`${OUT}/${TAG}-metrics.json`, JSON.stringify(rows, null, 1));
const fails = rows.filter(r => !r.skip && (r.hOverflow > 0 || r.vScroll > 0 || r.small > 0 || r.clipped > 0 || r.obstructed > 0 || r.keyboard === 1 || r.modal === 1));
const skipped = rows.filter(r => r.skip);
console.log(`measured ${rows.length - skipped.length} cells, skipped ${skipped.length}, failing ${fails.length}`);
for (const r of fails) console.log(`FAIL ${r.vp} ${r.screen} h=${r.hOverflow} v=${r.vScroll}${r.vScrollAt ? `(${r.vScrollAt})` : ''} small=${r.small} clip=${r.clipped} obst=${r.obstructed ?? '-'} kb=${r.keyboard ?? '-'} modal=${r.modal ?? '-'}`);
const skipSummary = {};
for (const r of skipped) skipSummary[r.screen] = r.skip;
if (skipped.length) console.log('skipped:', JSON.stringify(skipSummary));
process.exit(process.env.QA_STRICT === '1' && fails.length ? 1 : 0);
