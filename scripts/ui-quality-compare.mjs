// ui-quality-qa 의 before/after 스크린샷을 화면별 비교 시트로 묶는다.
//   node scripts/ui-quality-compare.mjs  → .cache/ui-quality/compare-<screen>.{html,png}
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const DIR = '.cache/ui-quality';
const SCREENS = ['landing', 'story', 'questionnaire', 'modal', 'result', 'copilot', 'take', 'home', 'discovery', 'notice-detail'];
const VPS = ['320x568', '390x844', '768x1024', '1366x768', '1920x1080'];
const img = f => existsSync(`${DIR}/${f}`) ? `<img src="data:image/png;base64,${readFileSync(`${DIR}/${f}`).toString('base64')}">` : '<div class="na">없음</div>';
const b = await chromium.launch();
for (const s of SCREENS) {
  const rows = VPS.map(v => `<tr><th>${v}</th><td>${img(`before-${s}-${v}.png`)}</td><td>${img(`after-${s}-${v}.png`)}</td></tr>`).join('');
  const html = `<html><body style="font-family:sans-serif;margin:16px"><h2>${s} · before / after</h2><table border=1 cellpadding=6 style="border-collapse:collapse"><tr><th></th><th>before</th><th>after</th></tr>${rows}</table><style>img{max-width:520px;max-height:420px}.na{color:#999}</style></body></html>`;
  writeFileSync(`${DIR}/compare-${s}.html`, html);
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  await p.setContent(html); await p.screenshot({ path: `${DIR}/compare-${s}.png`, fullPage: true }); await p.close();
}
await b.close();
console.log('ok');
