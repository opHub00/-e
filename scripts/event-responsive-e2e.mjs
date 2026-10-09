// 반응형 밀도 점검: desktop(compact) · iPad(comfortable) · mobile(touch).
//   EVENT_RC_BASE_URL=http://127.0.0.1:4173 node scripts/event-responsive-e2e.mjs
// 첫 화면에 보이는 결과 카드 수, 누르는 영역 최소 크기(44px), 가로 넘침, Summary V2 구조를 확인한다.
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOT = process.env.SHOT_DIR ?? '.cache/event-responsive';
/** 결과 화면 수치만 잰다(V2 이전 빌드와 비교할 때). */
const RESULTS_ONLY = process.env.RESULTS_ONLY === '1';
await mkdir(SHOT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const tid = (page, id) => page.getByTestId(id).filter({ visible: true });
const choice = (page, id, label) => tid(page, id).getByRole('radio', { name: label, exact: true }).click();
const next = page => page.getByRole('button', { name: /^(다음|분석 시작하기)$/ }).filter({ visible: true }).click();

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, density: 'compact' },
  { name: 'laptop-1280', width: 1280, height: 800, density: 'compact' },
  { name: 'ipad-landscape-1024', width: 1024, height: 768, density: 'comfortable' },
  { name: 'ipad-portrait-768', width: 768, height: 1024, density: 'comfortable' },
  { name: 'mobile-390', width: 390, height: 844, density: 'touch' },
];

async function enter(page) {
  await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
  await tid(page, 'event-start').click();
  await tid(page, 'intro-next').click();
  await tid(page, 'household-withChildren').click();
  await next(page);
  await tid(page, 'input-birthDate').fill('19910410');
  await choice(page, 'q-applicant-isHouseholdHead', '예');
  await choice(page, 'q-applicant-livesInEventRegion', '예');
  await choice(page, 'q-applicant-residenceMonths', '5년 이상');
  await choice(page, 'q-applicant-longOverseasStay', '없어요');
  await choice(page, 'q-applicant-specialException', '없어요');
  await next(page);
  await choice(page, 'q-household-marriageRegistered', '했어요');
  await tid(page, 'input-marriageDate').fill('20240501');
  await tid(page, 'q-household-childrenCount').getByRole('button', { name: '자녀 수 늘리기' }).click();
  await tid(page, 'input-childBirthDate-0').fill('20250115');
  await next(page);
  await tid(page, 'input-monthlyIncome').fill('260');
  await choice(page, 'q-applicant-taxPaymentYears', '5년 이상');
  await choice(page, 'q-household-dualIncome', '맞벌이예요');
  for (let i = 0; i < 3; i += 1) await tid(page, 'q-household-householdSize').getByRole('button', { name: '세대원 수 늘리기' }).click();
  await tid(page, 'input-householdIncome').fill('470');
  await tid(page, 'input-totalAssets').fill('13000');
  await next(page);
  await choice(page, 'q-applicant-householdNoHome', '모두 없어요');
  await choice(page, 'q-applicant-neverOwnedHome', '가진 적 없어요');
  await choice(page, 'q-applicant-winningHistory', '없어요');
  await choice(page, 'q-subscription-accountKind', '주택청약종합저축');
  await tid(page, 'input-openedAt').fill('20180101');
  await tid(page, 'input-paymentCount').fill('36');
  await tid(page, 'input-depositAmount').fill('600');
  await choice(page, 'q-subscription-firstRank', '채웠어요');
  await next(page);
  const values = { eligibleResident: ['c', '예'], currentProgramTenant: ['c', '아니요'], collegeStudent: ['c', '아니요'], jobSeekerWithinTwoYears: ['c', '아니요'], benefitCategory: ['c', '해당 없음'], youthStudyStatus: ['c', '해당 없음'], vehicleValueKrw: ['i', '1500'], applicantTotalAssetsKrw: ['i', '8000'], parentMonthlyIncomeKrw: ['i', '200'], parentVehicleValueKrw: ['i', '800'], workHistoryMonths: ['i', '36'] };
  for (let round = 0; round < 4; round += 1) {
    const where = await Promise.race([
      tid(page, 'adaptive-assessment').waitFor({ timeout: 20000 }).then(() => 'adaptive'),
      tid(page, 'results-title').waitFor({ timeout: 20000 }).then(() => 'results'),
    ]);
    if (where === 'results') return;
    await page.waitForTimeout(600);
    for (const [id, [kind, value]] of Object.entries(values)) {
      if (!(await tid(page, `adaptive-question-${id}`).count())) continue;
      if (kind === 'c') {
        const radio = tid(page, `q-adaptive-${id}`).getByRole('radio', { name: value, exact: true });
        if (await radio.count()) await radio.click(); else await tid(page, `q-adaptive-${id}`).getByRole('radio').first().click();
      } else await tid(page, `input-adaptive-${id}`).fill(value);
    }
    await tid(page, 'adaptive-submit').click();
  }
}

async function metrics(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const cards = [...document.querySelectorAll('[data-testid^="listing-card-"]')].map(el => el.getBoundingClientRect()).filter(r => r.width > 0);
    const fullyVisible = cards.filter(r => r.top >= 0 && r.bottom <= vh).length;
    const startedInView = cards.filter(r => r.top < vh).length;
    const perRow = cards.length ? cards.filter(r => Math.abs(r.top - cards[0].top) < 2).length : 0;
    const buttons = [...document.querySelectorAll('[role="button"],[role="radio"],[role="link"],[role="checkbox"]')]
      .map(el => ({ el, r: el.getBoundingClientRect(), label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20) }))
      .filter(({ r, el }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden');
    const small = buttons.filter(({ r }) => r.height < 44 - 0.5 || r.width < 44 - 0.5).map(({ r, label }) => `${label}:${Math.round(r.width)}x${Math.round(r.height)}`);
    return { cards: cards.length, fullyVisible, startedInView, perRow, small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

const table = [];
for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  await enter(page);
  await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector('[data-testid="results-list"]')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  const m = await metrics(page);
  table.push({ viewport: viewport.name, density: viewport.density, ...m });
  await page.screenshot({ path: `${SHOT}/${viewport.name}-results.png` });
  check(`${viewport.name}: 9 cards, no horizontal overflow`, m.cards === 9 && m.overflow <= 1, `${m.cards} cards, overflow ${m.overflow}`);
  check(`${viewport.name}: every touch target ≥ 44px`, m.small.length === 0, m.small.slice(0, 4).join(', '));
  if (RESULTS_ONLY) { await context.close(); continue; }
  // 상세
  await tid(page, 'detail-1').click();
  await tid(page, 'listing-detail').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/${viewport.name}-detail.png` });
  const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${viewport.name}: detail has no horizontal overflow`, detailOverflow <= 1, `${detailOverflow}`);
  check(`${viewport.name}: V2 place/highlight sections stay hidden without Codex data`, (await page.getByTestId('listing-place').count()) === 0 && (await page.getByTestId('listing-highlights').count()) === 0);
  await page.getByRole('button', { name: '관심 공고에 담기' }).filter({ visible: true }).last().click();
  await tid(page, 'detail-back').click();
  await tid(page, 'results-title').waitFor();
  // 요약
  await tid(page, 'open-summary').click();
  await tid(page, 'summary-v2').waitFor();
  const order = await page.evaluate(() => ['summary-v2-top', 'summary-v2-favorites', 'summary-v2-also', 'summary-v2-schedule', 'summary-v2-why', 'summary-v2-cautions', 'summary-v2-profile']
    .map(id => document.querySelector(`[data-testid="${id}"]`)).filter(Boolean).length);
  check(`${viewport.name}: Summary V2 sections rendered`, order >= 6, `${order}/7`);
  check(`${viewport.name}: profile is collapsed by default`, (await page.getByTestId('summary-v2-profile-details').count()) === 0);
  await tid(page, 'summary-v2-profile-toggle').click();
  check(`${viewport.name}: profile expands on demand`, (await tid(page, 'summary-v2-profile-details').count()) === 1);
  check(`${viewport.name}: favorites keep the selected-listing details`, (await page.locator('[data-testid="summary-selected-item"]').filter({ visible: true }).count()) === 1);
  await page.screenshot({ path: `${SHOT}/${viewport.name}-summary.png` });
  const summaryOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${viewport.name}: summary has no horizontal overflow`, summaryOverflow <= 1, `${summaryOverflow}`);
  check(`${viewport.name}: no runtime errors`, errors.length === 0, errors[0] ?? '');
  await context.close();
}

// 밀도 효과: desktop 은 iPad 보다 한 줄에 더 많은 카드가 들어가야 한다.
const desk = table.find(row => row.viewport === 'desktop-1440');
const pad = table.find(row => row.viewport === 'ipad-landscape-1024');
check('desktop shows more cards per row than iPad', desk.perRow > pad.perRow, `${desk.perRow} vs ${pad.perRow}`);

await browser.close();
console.table(table.map(({ small, ...row }) => row));
const failed = results.filter(item => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
