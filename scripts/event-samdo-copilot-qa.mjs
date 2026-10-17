// Copilot 대화 QA: 7개 발화 + 나중에→다시 보기 + 키보드, 390x844 / 1440x900.
//   B=http://127.0.0.1:4411 node scripts/event-samdo-copilot-qa.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.env.B || 'http://127.0.0.1:4411';
const OUT = '.cache/ui-quality/copilot'; mkdirSync(OUT, { recursive: true });
const UTTER = ['나한테 맞는 청약 찾아줘', '내가 아직 안 알려준 것만 물어봐', '왜 이걸 먼저 물어봐?', '잘 모르겠어', '나중에 답할게', '청약통장이 6회가 되면?', '내가 지금 가장 먼저 해야 할 일은?'];
const b = await chromium.launch();
const report = [];
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600 });
  await ctx.addInitScript(() => { try { localStorage.setItem('wanpan.event.productStory.v1', 'seen'); sessionStorage.setItem('wanpane:brand-entrance', 'done'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/event/samdo?persona=NEWLYWED_ONE_CHILD`, { waitUntil: 'networkidle' });
  const tid = id => p.getByTestId(id).filter({ visible: true });
  await tid('district-comparison').or(tid('samdo-result')).first().waitFor({ timeout: 20000 });
  if (!(await tid('samdo-ask-ai').count())) { const t = tid('district-detail-toggle'); if (await t.count()) await t.click(); }
  await tid('samdo-ask-ai').click();
  await tid('chat-input').waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  const state = async () => p.evaluate(() => ({
    question: document.querySelector('[data-testid="copilot-question-title"]')?.textContent ?? null,
    progress: document.querySelector('[data-testid="copilot-progress"]')?.textContent ?? null,
    summary: document.querySelector('[data-testid="copilot-summary"]')?.textContent?.slice(0, 160) ?? null,
    whatif: document.querySelector('[data-testid="copilot-whatif-result"]')?.textContent?.slice(0, 200) ?? null,
    hasApply: /내 정보에 적용/.test(document.body.innerText),
    prob: /\d+%|가능성 높|당첨 가능성/.test(document.querySelector('[data-testid="chat-thread"]')?.innerText ?? ''),
    hOverflow: document.documentElement.scrollWidth - innerWidth,
  }));
  report.push({ vp: `${w}x${h}`, step: 'open', ...(await state()) });
  await p.screenshot({ path: `${OUT}/${w}x${h}-00-open.png` });
  let i = 0;
  for (const text of UTTER) {
    i += 1;
    const before = await p.getByTestId('chat-message-assistant').count();
    await tid('chat-input').fill(text);
    await tid('chat-send').click();
    await p.waitForFunction(n => document.querySelectorAll('[data-testid="chat-message-assistant"]').length > n, before, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600);
    const reply = await p.getByTestId('chat-message-assistant').last().innerText().catch(() => '(none)');
    report.push({ vp: `${w}x${h}`, step: text, reply: reply.replace(/\s+/g, ' ').slice(0, 260), ...(await state()) });
    await p.screenshot({ path: `${OUT}/${w}x${h}-${String(i).padStart(2, '0')}.png` });
    if (text.includes('6회')) { const card = tid('copilot-whatif'); if (await card.count()) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `${OUT}/${w}x${h}-whatif.png` }); } }
    if (i === 1) { const rec = tid('copilot-recommendations'); if (await rec.count()) { await rec.scrollIntoViewIfNeeded(); await rec.screenshot({ path: `${OUT}/${w}x${h}-recommendations.png` }); } }
  }
  // 별도 흐름: 처음부터 '나중에 답할게' → 미뤄 둔 질문 다시 보기
  {
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/event/samdo?persona=NEWLYWED_ONE_CHILD`, { waitUntil: 'networkidle' });
    const t2 = id => p2.getByTestId(id).filter({ visible: true });
    await t2('district-comparison').or(t2('samdo-result')).first().waitFor({ timeout: 20000 });
    if (!(await t2('samdo-ask-ai').count())) { const t = t2('district-detail-toggle'); if (await t.count()) await t.click(); }
    await t2('samdo-ask-ai').click(); await t2('chat-input').waitFor({ timeout: 15000 }); await p2.waitForTimeout(600);
    const q0 = await t2('copilot-question-title').innerText().catch(() => null);
    await t2('copilot-answer-later').click(); await p2.waitForTimeout(500);
    const resume = await t2('copilot-resume-deferred').count();
    const cardText = (await t2('copilot-question').innerText()).replace(/\s+/g, ' ');
    await p2.screenshot({ path: `${OUT}/${w}x${h}-deferred.png` });
    if (resume) { await t2('copilot-resume-deferred').click(); await p2.waitForTimeout(500); }
    const q1 = await t2('copilot-question-title').innerText().catch(() => null);
    report.push({ vp: `${w}x${h}`, step: 'later→resume', reply: `q0=${q0} | card=${cardText.slice(0, 90)} | resumeButton=${resume} | q1=${q1}` });
    await p2.close();
  }
  // 질문 카드: 예/모름 버튼 직접 누르기
  const unknown = tid('copilot-answer-unknown');
  if (await unknown.count()) {
    const label = await unknown.innerText();
    await unknown.click(); await p.waitForTimeout(600);
    report.push({ vp: `${w}x${h}`, step: `button:${label}`, ack: await tid('copilot-ack').innerText().catch(() => null), ...(await state()) });
  }
  // 키보드: 입력 포커스 후 높이 축소
  if (w < 600) {
    await tid('chat-input').focus();
    await p.setViewportSize({ width: w, height: Math.round(h * 0.55) }); await p.waitForTimeout(500);
    const kb = await p.evaluate(() => { const el = document.querySelector('[data-testid="chat-input"]'); const r = el.getBoundingClientRect(); const s = document.querySelector('[data-testid="chat-send"]').getBoundingClientRect(); return { inputVisible: r.bottom <= innerHeight && r.top >= 0, sendVisible: s.bottom <= innerHeight }; });
    report.push({ vp: `${w}x${h}`, step: 'keyboard', ...kb });
    await p.screenshot({ path: `${OUT}/${w}x${h}-keyboard.png` });
  }
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
for (const r of report) console.log(JSON.stringify(r));
