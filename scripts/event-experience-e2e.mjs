// 행사 경험 개선 점검: 결과 설명·AI 상담·관심 공고·요약·QR·예외 상황을 실제 브라우저로 끝까지 확인한다.
// 사용: EVENT_RC_BASE_URL=http://127.0.0.1:4173 node scripts/event-experience-e2e.mjs  (dist 를 event-rc-server 로 띄운 상태)
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOT = process.env.SHOT_DIR ?? '.cache/event-experience';
await mkdir(SHOT, { recursive: true });
const RAW = /\b(?:applicant|spouse|household|family|profile|event|score)\.[A-Za-z][A-Za-z0-9_.]*|\b(?:input|rule|fact|review):[A-Za-z]|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();

async function open(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  return { context, page, errors };
}
const tid = (page, id) => page.getByTestId(id).filter({ visible: true });
const choice = (page, id, label) => tid(page, id).getByRole('radio', { name: label, exact: true }).click();
const next = page => page.getByRole('button', { name: /^(다음|분석 시작하기)$/ }).filter({ visible: true }).click();
async function visibleText(page) {
  return page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      out.push(walker.currentNode.textContent);
    }
    return out.join('\n');
  });
}
async function noRaw(page, step) {
  const text = await visibleText(page);
  const hit = text.match(RAW);
  check(`${step}: no raw domain key`, !hit, hit?.[0] ?? '');
}
async function noOverflow(page, step) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${step}: no horizontal overflow`, over <= 1, `${over}px`);
}

/** 신혼 + 자녀 1명. 실제 입력 화면을 그대로 거친다. */
async function enterNewlywedOneChild(page) {
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
  const values = { eligibleResident: ['c', '예'], currentProgramTenant: ['c', '아니요'], collegeStudent: ['c', '아니요'], jobSeekerWithinTwoYears: ['c', '아니요'], benefitCategory: ['c', '해당 없음'], vehicleValueKrw: ['i', '1500'], applicantTotalAssetsKrw: ['i', '8000'], parentMonthlyIncomeKrw: ['i', '200'], parentVehicleValueKrw: ['i', '800'], workHistoryMonths: ['i', '36'] };
  let rounds = 0;
  for (; rounds < 4; rounds += 1) {
    const where = await Promise.race([
      tid(page, 'adaptive-assessment').waitFor({ timeout: 20000 }).then(() => 'adaptive'),
      tid(page, 'results-title').waitFor({ timeout: 20000 }).then(() => 'results'),
    ]);
    if (where === 'results') break;
    await noRaw(page, `adaptive round ${rounds + 1}`);
    for (const [id, [kind, value]] of Object.entries(values)) {
      if (!(await tid(page, `adaptive-question-${id}`).count())) continue;
      if (kind === 'c') await choice(page, `q-adaptive-${id}`, value);
      else await tid(page, `input-adaptive-${id}`).fill(value);
    }
    await tid(page, 'adaptive-submit').click();
  }
  check('adaptive question flow reached results', rounds >= 1, `${rounds} round(s)`);
  await tid(page, 'results-title').waitFor();
}

// ---------- 1. 전체 흐름 · iPad portrait ----------
{
  const { context, page, errors } = await open({ width: 768, height: 1024 });
  await enterNewlywedOneChild(page);
  const cards = page.locator('[data-testid^="listing-card-"]').filter({ visible: true });
  check('9 result cards', (await cards.count()) === 9, String(await cards.count()));
  await noRaw(page, 'results');
  await noOverflow(page, 'results portrait');
  await page.screenshot({ path: `${SHOT}/portrait-results.png` });

  // 관심 공고 상태가 카드에 글로 보인다.
  await tid(page, 'listing-card-2').getByRole('button', { name: '관심 공고에 담기' }).click();
  check('favorite toggle shows 담김 on card', (await tid(page, 'listing-card-2').innerText()).includes('담김'));

  // 9개 상세를 모두 열어 설명 블록과 raw key 를 확인한다.
  for (let rank = 1; rank <= 9; rank += 1) {
    await tid(page, `detail-${rank}`).click();
    await tid(page, 'listing-detail').waitFor();
    const present = await Promise.all(['detail-why', 'detail-conditions', 'detail-score', 'detail-order', 'detail-evidence'].map(id => tid(page, id).count()));
    check(`detail ${rank}: verdict/conditions/score/order/evidence blocks`, present.every(count => count === 1), present.join(','));
    const scoreText = await tid(page, 'detail-score').innerText();
    check(`detail ${rank}: official score state readable`, /해당 없음|확인 필요|공식 배점 \d+ \/ \d+점/.test(scoreText));
    await noRaw(page, `detail ${rank}`);
    if (rank === 1) {
      check('detail 1 explains why eligible', (await tid(page, 'detail-why').innerText()).includes('신청할 수 있는 이유'));
      await page.screenshot({ path: `${SHOT}/portrait-detail-1.png` });
    }
    if (rank === 2) {
      check('detail 2 lists documents to check', (await tid(page, 'detail-documents').count()) === 1);
      await page.screenshot({ path: `${SHOT}/portrait-detail-2.png` });
    }
    await tid(page, 'detail-back').click();
    await tid(page, 'results-title').waitFor();
  }

  // AI 상담: 네 가지 추천 질문
  await tid(page, 'detail-1').click();
  await tid(page, 'listing-detail').waitFor();
  await page.getByRole('button', { name: '관심 공고에 담기' }).filter({ visible: true }).last().click();
  await page.getByRole('button', { name: '이 공고 AI에게 묻기' }).filter({ visible: true }).click();
  await tid(page, 'chat-context').waitFor();
  check('chat shows the verdict it reasons from', (await tid(page, 'chat-context-verdict').innerText()).includes('내 판정'));
  const asks = ['왜 이 공고에 신청할 수 있나요?', '가장 중요한 조건은 무엇인가요?', '제가 확인해야 할 서류는 무엇인가요?', '다른 공급유형과 비교하면 어떤가요?'];
  for (const [index, question] of asks.entries()) {
    await tid(page, 'chat-suggestions').getByRole('button', { name: question }).click();
    await page.waitForFunction(count => [...document.querySelectorAll('[data-testid="chat-message-assistant"]')].filter(el => el.getBoundingClientRect().width > 0).length >= count, index + 2);
  }
  const answers = await page.locator('[data-testid="chat-message-assistant"]').filter({ visible: true }).allInnerTexts();
  check('chat: why-eligible answer is personal', answers[1].includes('신청 자격을 모두 확인'), answers[1].slice(0, 80));
  check('chat: compare answer covers all supplies', answers[4].includes('9개 공급'), answers[4].slice(0, 80));
  await noRaw(page, 'chat');
  await page.screenshot({ path: `${SHOT}/portrait-chat.png` });
  await page.goBack();
  await tid(page, 'listing-detail').waitFor();
  await tid(page, 'detail-back').click();

  // 관심 공고 → 요약
  await tid(page, 'open-favorites').click();
  await tid(page, 'favorites-list').waitFor();
  check('favorites list has 2', (await page.locator('[data-testid="favorites-list"] [data-testid^="listing-card-"]').filter({ visible: true }).count()) === 2);
  await tid(page, 'favorites-summary').click();
  await tid(page, 'summary').waitFor();
  const selected = await tid(page, 'summary-selected').innerText();
  check('summary: selected listings with status and check items', (await page.locator('[data-testid="summary-selected-item"]').filter({ visible: true }).count()) === 2 && /공식 점수/.test(selected));
  await noRaw(page, 'summary');
  await page.screenshot({ path: `${SHOT}/portrait-summary.png`, fullPage: false });

  // QR 실패 → 다시 시도 → 성공
  await page.route('**/event-api/result-sessions', route => route.abort());
  await tid(page, 'summary-qr').click();
  await tid(page, 'summary-qr-error').waitFor();
  check('QR failure shows friendly retry', (await tid(page, 'summary-qr').innerText()).includes('다시 시도하기'));
  await noRaw(page, 'qr error');
  await page.unroute('**/event-api/result-sessions');
  await tid(page, 'summary-qr').click();
  await tid(page, 'summary-qr-panel').waitFor();
  const link = await tid(page, 'summary-qr-code').locator('..').getAttribute('data-link');
  check('QR retry succeeds with opaque token link', /\/event\/take\?token=[a-f0-9]{64}$/.test(link ?? ''));
  await page.screenshot({ path: `${SHOT}/portrait-qr.png` });

  // 휴대폰 요약
  const phone = await open({ width: 390, height: 844 });
  await phone.page.goto(link, { waitUntil: 'networkidle' });
  await phone.page.getByTestId('take-summary').waitFor();
  await noRaw(phone.page, 'mobile QR result');
  await noOverflow(phone.page, 'mobile QR result');
  await phone.page.screenshot({ path: `${SHOT}/mobile-take.png`, fullPage: true });
  // 연결 실패 → 다시 시도
  await phone.page.route('**/event-api/result-sessions/*', route => route.abort());
  await phone.page.reload();
  await phone.page.getByTestId('take-unreachable').waitFor();
  check('mobile: network failure is retryable, not "invalid"', true);
  await phone.page.unroute('**/event-api/result-sessions/*');
  await phone.page.getByRole('button', { name: '다시 시도' }).click();
  await phone.page.getByTestId('take-summary').waitFor();
  check('mobile: retry loads the summary', true);
  // 모양이 이상한 요약 → 깨지지 않고 안내
  await phone.page.route('**/event-api/result-sessions/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: { v: 1, date: 'x', counts: {}, recommended: [{}] } }) }));
  await phone.page.reload();
  await phone.page.getByTestId('take-invalid').waitFor();
  check('mobile: malformed summary shows invalid state, no crash', phone.errors.length === 0, phone.errors[0] ?? '');
  await phone.page.unroute('**/event-api/result-sessions/*');
  await phone.page.goto(`${BASE}/event/take?token=${'f'.repeat(64)}`, { waitUntil: 'load' });
  await phone.page.getByTestId('take-invalid').waitFor();
  check('mobile: expired/unknown token shows invalid state without the word token', !(await visibleText(phone.page)).includes('token'));
  await phone.context.close();

  // 처음으로 → 흔적 없음
  await tid(page, 'summary-reset').click();
  await tid(page, 'event-landing').waitFor();
  await page.goto(`${BASE}/event/results`, { waitUntil: 'networkidle' });
  await tid(page, 'kiosk-empty').waitFor();
  check('reset leaves no results', true);
  check('portrait flow: no runtime errors', errors.length === 0, errors[0] ?? '');
  await context.close();
}

// ---------- 2. landscape / desktop: 결과·상세 ----------
for (const viewport of [{ width: 1024, height: 768, name: 'landscape' }, { width: 1440, height: 900, name: 'desktop' }]) {
  const { context, page, errors } = await open(viewport);
  await enterNewlywedOneChild(page);
  await noOverflow(page, `${viewport.name} results`);
  await noRaw(page, `${viewport.name} results`);
  await page.screenshot({ path: `${SHOT}/${viewport.name}-results.png` });
  await tid(page, 'detail-2').click();
  await tid(page, 'listing-detail').waitFor();
  await noOverflow(page, `${viewport.name} detail`);
  await page.screenshot({ path: `${SHOT}/${viewport.name}-detail.png` });
  await page.getByRole('button', { name: '이 공고 AI에게 묻기' }).filter({ visible: true }).click();
  await tid(page, 'chat-context').waitFor();
  await noOverflow(page, `${viewport.name} chat`);
  check(`${viewport.name}: no runtime errors`, errors.length === 0, errors[0] ?? '');
  await context.close();
}

// ---------- 3. QA 도우미는 행사용 빌드에서 동작하지 않는다 ----------
{
  const { context, page } = await open({ width: 768, height: 1024 });
  await page.goto(`${BASE}/event/qa`, { waitUntil: 'networkidle' });
  await tid(page, 'event-qa-disabled').waitFor();
  check('QA helper disabled in production build', (await tid(page, 'event-qa').count()) === 0);
  await page.goto(`${BASE}/event`, { waitUntil: 'networkidle' });
  check('landing has no QA link', !(await page.content()).includes('/event/qa'));
  await context.close();
}

await browser.close();
const failed = results.filter(item => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
