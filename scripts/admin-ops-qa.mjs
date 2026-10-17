// 운영 콘솔(V3) 실제 데이터 상태 QA.
//   EVENT_RC_BASE_URL=http://127.0.0.1:4420 node scripts/admin-ops-qa.mjs
// 7개 화면 × 상태(populated·loading·empty·partial·stale·large·error·timeout·unauthorized·forbidden) × desktop/tablet/mobile:
//   가로 넘침 · 잘림 · 44px 미만 터치 · 읽기 어려운 JSON · 색만으로 된 상태 표시 → 모두 0 이어야 한다.
// 많은 데이터(100건)에서 필터·검색·더 보기 흐름과 반응 시간을 잰다.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = process.env.SHOT_DIR ?? '.cache/admin-ops-qa';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
];
const SCREENS = [
  ['dashboard', '/admin/console', 'console-dashboard'],
  ['notices', '/admin/console/notices', 'console-notices'],
  ['notice-detail', '/admin/console/notice', 'console-notice-detail'],
  ['rules', '/admin/console/rules', 'console-rules'],
  ['assessments', '/admin/console/assessments', 'console-assessments'],
  ['ai', '/admin/console/ai', 'console-ai'],
  ['audit', '/admin/console/audit', 'console-audit'],
];
const STATES = (process.env.STATES ?? 'populated,loading,empty,partial,stale,large,error,timeout,unauthorized,forbidden').split(',');
const SHOT_STATES = new Set(['populated', 'large', 'partial', 'empty', 'loading', 'error', 'unauthorized', 'forbidden', 'stale', 'timeout']);

const urlOf = (path, state) => {
  const params = new URLSearchParams({ demo: '1' });
  if (state !== 'populated') params.set('state', state);
  if (path.endsWith('/notice')) params.set('id', state === 'large' ? 'demo-large-1' : 'demo-notice-a');
  return `${BASE}${path}?${params}`;
};

/** 화면 측정. 숫자가 0이 아니면 해당 요소 설명을 함께 돌려준다. */
const MEASURE = () => {
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const describe = el => `${el.tagName}${el.getAttribute('data-testid') ? `#${el.getAttribute('data-testid')}` : ''} "${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 40)}"`;
  const hOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const leaves = [...document.querySelectorAll('body *')].filter(el => visible(el) && el.textContent.trim() && !el.children.length);
  const clipped = leaves.filter(el => {
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) return false;
    return (s.overflowX === 'hidden' || s.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2;
  });
  // 가로로 화면 밖에 걸친 글자(잘림의 다른 형태)
  const offscreen = leaves.filter(el => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; });
  const small = [...document.querySelectorAll('[role="button"],[role="link"],[role="tab"],[role="switch"],button,a[href],input,textarea,select')]
    .filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; });
  const text = document.body.innerText;
  const json = (text.match(/[{[]\s*"[^"\n]{1,40}"\s*:/g) ?? []);
  // 색만으로 된 상태 표시: 글자도 아이콘 글리프도 없는 작은 색 덩어리(점·칩)
  const colorOnly = [...document.querySelectorAll('body *')].filter(el => {
    if (!visible(el) || el.textContent.trim() || el.getAttribute('aria-label')) return false;
    const r = el.getBoundingClientRect();
    if (r.width > 16 || r.height > 16 || r.width < 4 || r.height < 4) return false;
    const bg = getComputedStyle(el).backgroundColor;
    const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(bg);
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.2)) return false;
    const [rr, gg, bb] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const saturated = Math.max(rr, gg, bb) - Math.min(rr, gg, bb) > 40;
    if (!saturated) return false;
    // 같은 줄(가까운 조상 3단계 안)에 글자 설명이 있으면 색만으로 된 표시가 아니다(예: 막대 + 라벨 + 건수).
    let node = el.parentElement;
    for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) if (node.textContent.trim()) return false;
    return true;
  });
  const badges = [...document.querySelectorAll('[data-testid^="level-"]')].filter(visible);
  const badgeNoText = badges.filter(el => !/오류|조치 필요|주의|안내/.test(el.innerText));
  return {
    hOverflow, clipped: clipped.length + offscreen.length, small: small.length, json: json.length, colorOnly: colorOnly.length, badgeNoText: badgeNoText.length,
    details: [...clipped, ...offscreen].slice(0, 3).map(describe).concat(small.slice(0, 3).map(el => `small ${describe(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`), json.slice(0, 2), colorOnly.slice(0, 2).map(describe)),
  };
};

const browser = await chromium.launch();
const rows = [];
const timings = [];
const flows = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 600 });
  const page = await context.newPage();
  const tid = id => page.getByTestId(id).filter({ visible: true });
  for (const state of STATES) {
    for (const [name, path, testID] of SCREENS) {
      const started = Date.now();
      await page.goto(urlOf(path, state), { waitUntil: 'networkidle' });
      await tid(testID).waitFor({ timeout: 20000 });
      const marker = state === 'loading' ? 'console-state-loading'
        : ['error', 'timeout', 'unauthorized', 'forbidden'].includes(state) ? `console-state-${{ error: 'server', timeout: 'timeout', unauthorized: 'unauthorized', forbidden: 'forbidden' }[state]}`
          : 'console-stamp';
      await tid(marker).waitFor({ timeout: 20000 });
      if (state === 'large') timings.push({ vp: vp.name, screen: name, ms: Date.now() - started });
      await page.waitForTimeout(150);
      const m = await page.evaluate(MEASURE);
      rows.push({ vp: vp.name, state, screen: name, ...m });
      if (SHOT_STATES.has(state) && (vp.name !== 'tablet' || state === 'populated' || state === 'large')) {
        await page.screenshot({ path: `${OUT}/${vp.name}-${state}-${name}.png`, fullPage: vp.name !== 'desktop' ? false : true });
      }
    }
  }

  // 많은 데이터 흐름 + 반응 시간(클릭 → 화면 반영)
  const timed = async (label, action, done) => {
    const t0 = Date.now();
    await action();
    await done();
    const ms = Date.now() - t0;
    flows.push({ vp: vp.name, flow: label, ms });
  };
  await page.goto(urlOf('/admin/console/ai', 'large'), { waitUntil: 'networkidle' });
  await tid('console-ai').waitFor();
  await timed('AI 필터: 시간 초과', () => tid('console-ai-filter-timeout').click(), () => page.getByText(/질문 \d+건/).first().waitFor());
  const timeoutRows = await page.getByText('응답 시간 초과', { exact: true }).filter({ visible: true }).count();
  flows.push({ vp: vp.name, flow: 'AI 시간 초과 행에 사유 글자 표시', ok: timeoutRows > 0, value: timeoutRows });
  await tid('console-ai-filter-all').click();
  await timed('AI 더 보기(25→50)', () => page.getByRole('button', { name: /건 더 보기/ }).first().click(), () => page.getByText('50 / 100건').first().waitFor());
  await timed('AI 검색', () => tid('console-ai-search').fill('질문 7'), () => page.getByText(/질문 \d+건/).first().waitFor());
  await page.screenshot({ path: `${OUT}/${vp.name}-flow-ai-search.png` });

  await page.goto(urlOf('/admin/console/rules', 'large'), { waitUntil: 'networkidle' });
  await tid('console-rules').waitFor();
  await timed('규칙 공고 바꾸기(검색 선택)', async () => {
    await tid('console-rule-notice-toggle').click();
    await tid('console-rule-notice-search').fill('3블록');
    await tid('console-rule-notice-demo-large-3').click();
  }, () => page.getByText(/규칙 \d+건/).first().waitFor());
  if (await tid('console-rule-filter-toggle').count()) await tid('console-rule-filter-toggle').click();
  await timed('규칙 필터: 근거 없음', () => tid('console-rule-evidence-filter-MISSING').click(), () => page.getByText(/규칙 \d+건 \/ \d+/).first().waitFor());
  const noEvidence = await page.getByText('근거 없음', { exact: true }).filter({ visible: true }).count();
  flows.push({ vp: vp.name, flow: '근거 없음 필터 결과에 배지 표시', ok: noEvidence > 0, value: noEvidence });
  await tid('console-rule-evidence-filter-ALL').click();
  await timed('규칙: 바뀐 것만', () => tid('console-rule-changed').click(), () => page.getByText(/규칙 \d+건 \/ \d+/).first().waitFor());
  await timed('규칙 검색', () => tid('console-rule-search').fill('기준 1'), () => page.getByText(/규칙 \d+건 \/ \d+/).first().waitFor());
  await page.screenshot({ path: `${OUT}/${vp.name}-flow-rules-filter.png`, fullPage: vp.name === 'desktop' });

  await page.goto(urlOf('/admin/console/notices', 'large'), { waitUntil: 'networkidle' });
  await tid('console-notices').waitFor();
  await timed('공고 검색', () => tid('console-notice-search').fill('나래'), () => page.getByText(/공고 \d+건/).first().waitFor());
  await page.goto(urlOf('/admin/console/audit', 'large'), { waitUntil: 'networkidle' });
  await tid('console-audit').waitFor();
  await timed('감사 대상 필터(RAG)', () => tid('console-audit-filter-RAG').click(), () => page.getByText(/기록 \d+건/).first().waitFor());
  await page.screenshot({ path: `${OUT}/${vp.name}-flow-audit-rag.png` });

  // 승인은 확인 단계를 거친다(예시 데이터)
  await page.goto(urlOf('/admin/console/rules', 'populated'), { waitUntil: 'networkidle' });
  await tid('console-rule-notice-demo-notice-c').click();
  await tid('console-rule-r1').click();
  await page.getByRole('button', { name: '승인', exact: true }).filter({ visible: true }).first().click();
  const asked = await page.getByText('이 규칙을 승인할까요?').isVisible().catch(() => false);
  flows.push({ vp: vp.name, flow: '승인 전 확인 단계', ok: asked });
  await page.screenshot({ path: `${OUT}/${vp.name}-flow-approve-confirm.png` });
  await page.getByRole('button', { name: '취소', exact: true }).click();

  await context.close();
}
await browser.close();

const failing = rows.filter(row => row.hOverflow || row.clipped || row.small || row.json || row.colorOnly || row.badgeNoText);
const sum = key => rows.reduce((total, row) => total + (row[key] ? 1 : 0), 0);
const report = {
  cells: rows.length,
  failing: failing.length,
  totals: { hOverflow: sum('hOverflow'), clipped: sum('clipped'), small: sum('small'), json: sum('json'), colorOnly: sum('colorOnly'), badgeNoText: sum('badgeNoText') },
  largeRenderMs: { max: Math.max(...timings.map(item => item.ms)), avg: Math.round(timings.reduce((a, b) => a + b.ms, 0) / Math.max(1, timings.length)) },
  flows,
};
writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, rows, timings }, null, 2));
console.log(JSON.stringify(report, null, 2));
for (const row of failing.slice(0, 40)) console.log(`FAIL ${row.vp} ${row.state} ${row.screen} h=${row.hOverflow} clip=${row.clipped} small=${row.small} json=${row.json} color=${row.colorOnly} badge=${row.badgeNoText} :: ${row.details.join(' | ')}`);
if (failing.length || flows.some(flow => flow.ok === false)) process.exitCode = 1;
