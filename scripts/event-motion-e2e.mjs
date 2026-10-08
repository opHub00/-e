// 행사 motion · Demo Mode 점검. dist 를 event-rc-server 로 띄운 상태에서 실행한다.
//   EVENT_RC_BASE_URL=http://127.0.0.1:4173 node scripts/event-motion-e2e.mjs            (일반 행사 빌드)
//   EVENT_DEMO_EXPECTED=1 EVENT_RC_BASE_URL=... node scripts/event-motion-e2e.mjs       (EXPO_PUBLIC_EVENT_DEMO_MODE=1 빌드)
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const DEMO_EXPECTED = process.env.EVENT_DEMO_EXPECTED === '1';
const SHOT = process.env.SHOT_DIR ?? '.cache/event-motion';
const MIN_ANALYSIS_MS = 1600;
await mkdir(SHOT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const tid = (page, id) => page.getByTestId(id).filter({ visible: true });
const choice = (page, id, label) => tid(page, id).getByRole('radio', { name: label, exact: true }).click();
const next = page => page.getByRole('button', { name: /^(다음|분석 시작하기)$/ }).filter({ visible: true }).click();

async function open(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  return { context, page, errors };
}

/** 신혼 + 자녀 1명. 실제 입력 화면을 거친다. 분석 시작부터 다음 화면까지 걸린 시간을 돌려준다. */
async function enter(page) {
  await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
  await tid(page, 'event-start').click();
  await tid(page, 'intro-next').click();
  await tid(page, 'household-withChildren').click();
  await next(page);
  await tid(page, 'kiosk-progress-fill').waitFor();
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
  const started = Date.now();
  await next(page);
  await tid(page, 'analysis-steps').waitFor();
  const firstLeg = await Promise.race([
    tid(page, 'adaptive-assessment').waitFor({ timeout: 20000 }).then(() => 'adaptive'),
    tid(page, 'results-title').waitFor({ timeout: 20000 }).then(() => 'results'),
  ]);
  const analysisMs = Date.now() - started;
  const values = { eligibleResident: ['c', '예'], currentProgramTenant: ['c', '아니요'], collegeStudent: ['c', '아니요'], jobSeekerWithinTwoYears: ['c', '아니요'], benefitCategory: ['c', '해당 없음'], youthStudyStatus: ['c', '해당 없음'], vehicleValueKrw: ['i', '1500'], applicantTotalAssetsKrw: ['i', '8000'], parentMonthlyIncomeKrw: ['i', '200'], parentVehicleValueKrw: ['i', '800'], workHistoryMonths: ['i', '36'] };
  let where = firstLeg;
  for (let round = 0; round < 4 && where === 'adaptive'; round += 1) {
    await page.waitForTimeout(700);
    for (const [id, [kind, value]] of Object.entries(values)) {
      if (!(await tid(page, `adaptive-question-${id}`).count())) continue;
      if (kind === 'c') {
        const radio = tid(page, `q-adaptive-${id}`).getByRole('radio', { name: value, exact: true });
        if (await radio.count()) await radio.click();
        else await tid(page, `q-adaptive-${id}`).getByRole('radio').first().click();
      } else await tid(page, `input-adaptive-${id}`).fill(value);
    }
    await tid(page, 'adaptive-submit').click();
    where = await Promise.race([
      tid(page, 'adaptive-assessment').waitFor({ timeout: 20000 }).then(() => 'adaptive'),
      tid(page, 'results-title').waitFor({ timeout: 20000 }).then(() => 'results'),
    ]);
  }
  return { analysisMs, firstLeg };
}

/** 카드가 겹치지 않는지. 등장 motion 이 끝난 뒤의 실제 상자를 본다. */
async function cardsOverlap(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="listing-card-"]')]
      .map(el => el.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i]; const b = cards[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return `${i}/${j}`;
      }
    }
    return null;
  });
}

for (const viewport of [{ width: 768, height: 1024, name: 'portrait' }, { width: 1024, height: 768, name: 'landscape' }, { width: 1440, height: 900, name: 'desktop' }]) {
  const { context, page, errors } = await open(viewport);
  const { analysisMs, firstLeg } = await enter(page);
  // 분석 화면이 최소 시간보다 지나치게 오래 붙잡지 않는다(실제 계산 + 화면 전환 여유 1.5초).
  check(`${viewport.name}: analysis does not add delay (${analysisMs}ms → ${firstLeg})`, analysisMs < MIN_ANALYSIS_MS + 1500);
  await page.waitForTimeout(1200);
  check(`${viewport.name}: 9 cards`, (await page.locator('[data-testid^="listing-card-"]').filter({ visible: true }).count()) === 9);
  const overlap = await cardsOverlap(page);
  check(`${viewport.name}: result cards never overlap`, !overlap, overlap ?? '');
  await tid(page, 'detail-1').click();
  await tid(page, 'listing-detail').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/${viewport.name}-detail.png` });
  await page.getByRole('button', { name: '관심 공고에 담기' }).filter({ visible: true }).last().click();
  await page.getByRole('button', { name: '이 공고 AI에게 묻기' }).filter({ visible: true }).click();
  await tid(page, 'chat-context').waitFor();
  await tid(page, 'chat-suggestions').getByRole('button').first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="chat-message-assistant"]')].filter(el => el.getBoundingClientRect().width > 0).length >= 2);
  await page.goBack();
  await tid(page, 'listing-detail').waitFor();
  await tid(page, 'detail-back').click();
  await tid(page, 'open-favorites').click();
  await tid(page, 'favorites-summary').click();
  await tid(page, 'summary').waitFor();
  await tid(page, 'summary-qr').click();
  await tid(page, 'summary-qr-emphasis').waitFor();
  await page.waitForTimeout(900);
  check(`${viewport.name}: QR panel emphasised and code shown`, (await tid(page, 'summary-qr-code').count()) === 1);
  await page.screenshot({ path: `${SHOT}/${viewport.name}-qr.png` });
  await tid(page, 'summary-reset').click();
  await tid(page, 'event-landing').waitFor();
  check(`${viewport.name}: no runtime errors`, errors.length === 0, errors[0] ?? '');
  await context.close();
}

// reduced motion: 같은 흐름이 그대로 끝나고, 등장 요소에 이동(transform)이 남지 않는다.
{
  const { context, page, errors } = await open({ width: 768, height: 1024 }, { reducedMotion: 'reduce' });
  await enter(page);
  await page.waitForTimeout(600);
  const moved = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="listing-card-"]')]
    .map(el => { let node = el; while (node && node !== document.body) { const t = getComputedStyle(node).transform; if (t && t !== 'none' && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(t)) return t; node = node.parentElement; } return null; })
    .find(Boolean) ?? null);
  check('reduced motion: flow completes and cards carry no travel transform', !moved, moved ?? '');
  check('reduced motion: no runtime errors', errors.length === 0, errors[0] ?? '');
  await context.close();
}

// Demo Mode
{
  const { context, page, errors } = await open({ width: 1024, height: 768 });
  await page.goto(`${BASE}/event/demo`, { waitUntil: 'networkidle' });
  if (!DEMO_EXPECTED) {
    await tid(page, 'event-demo-disabled').waitFor();
    check('Demo Mode is off in the regular event build', (await tid(page, 'event-demo').count()) === 0);
    await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
    check('no link to Demo Mode on the landing', !(await page.content()).includes('/event/demo'));
  } else {
    await tid(page, 'event-demo').waitFor();
    const version = await tid(page, 'demo-version').innerText();
    check('Demo Mode shows dataset version and build commit', /2026\.10/.test(version) && !/기록 없음/.test(version.split('Build commit')[1]?.split('\n')[1] ?? ''), version.replace(/\s+/g, ' ').slice(0, 160));
    check('quick routes needing results are disabled before analysis', (await tid(page, 'demo-go-dashboard').getAttribute('aria-disabled')) === 'true');
    await tid(page, 'demo-inject-full-NEWLYWED_ONE_CHILD').click();
    await tid(page, 'analysis-steps').waitFor();
    await tid(page, 'results-title').waitFor({ timeout: 20000 });
    check('persona injection runs the real analysis and lands on results', (await page.locator('[data-testid^="listing-card-"]').filter({ visible: true }).count()) === 9);
    await page.goto(`${BASE}/event/demo`, { waitUntil: 'load' });
    // 주소로 다시 열면 메모리 세션이 비어 있다(새로고침 = 새 방문자). 화면 안에서 이동해야 한다.
    await tid(page, 'demo-inject-NEWLYWED_ONE_CHILD').click();
    await Promise.race([tid(page, 'adaptive-assessment').waitFor({ timeout: 20000 }), tid(page, 'results-title').waitFor({ timeout: 20000 })]);
    check('input-only injection stops at adaptive questions', (await tid(page, 'adaptive-assessment').count()) === 1);
    check('Demo Mode: no runtime errors', errors.length === 0, errors[0] ?? '');
  }
  await context.close();
}

await browser.close();
const failed = results.filter(item => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
