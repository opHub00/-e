import { chromium } from '@playwright/test';

const baseUrl = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const OTHER_LISTINGS = [
  '제주 일도·삼도 행복주택',
  'JPDC 청년 매입임대',
  'JPDC 신혼·신생아 매입임대Ⅰ',
  'JPDC 다자녀 매입임대',
  'JPDC 일반 매입임대',
  '제주지역본부 제주시 청년 매입임대주택 예비입주자 모집',
  '제주시 든든전세주택 전환형 예비입주자 모집',
  '서귀포시 든든전세주택 비전환형 예비입주자 모집',
  '2026년 신혼·신생아 매입임대주택Ⅱ 입주자 모집',
  '2026년 제주시 통합공공임대주택 입주자 모집',
];
const FORBIDDEN_MULTI_COPY = ['분석하는 공고', '다른 공고 결과 보기', '공고 바꾸기', '관심 공고', '청약 공고 모음'];

const choice = async (page, testId, label) => page.getByTestId(testId).getByRole('radio', { name: label, exact: true }).click();
const next = page => page.getByRole('button', { name: /^(다음|분석 시작하기)$/ }).click();

async function noOverflow(page, step) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(350);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyWidth: document.body.getBoundingClientRect().width,
    bodyMargin: getComputedStyle(document.body).margin,
    rootScrollWidth: document.querySelector('#root')?.scrollWidth ?? null,
  }));
  if (metrics.scrollWidth > metrics.clientWidth + 1) {
    const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].map(element => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, testId: element.getAttribute('data-testid'), text: (element.textContent ?? '').trim().slice(0, 60), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: getComputedStyle(element).overflowX };
    }).filter(item => item.right > document.documentElement.clientWidth + 1 || item.left < -1 || item.scrollWidth > item.clientWidth + 1).sort((a, b) => (b.scrollWidth - b.clientWidth) - (a.scrollWidth - a.clientWidth)).slice(0, 12));
    throw new Error(`${step}: horizontal overflow ${metrics.scrollWidth}/${metrics.clientWidth} metrics=${JSON.stringify(metrics)} offenders=${JSON.stringify(offenders)}`);
  }
}

async function touchTargets(page, step) {
  const tooSmall = await page.getByRole('button').evaluateAll(buttons => buttons
    .filter(button => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    })
    .map(button => {
      const rect = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label') ?? button.textContent ?? '', width: rect.width, height: rect.height };
    })
    .filter(item => item.width < 44 || item.height < 44));
  if (tooSmall.length) throw new Error(`${step}: small touch targets ${JSON.stringify(tooSmall.slice(0, 5))}`);
}

async function samdoOnly(page, step) {
  const text = await page.locator('body').innerText();
  for (const title of OTHER_LISTINGS) if (text.includes(title)) throw new Error(`${step}: other listing exposed: ${title}`);
  for (const phrase of FORBIDDEN_MULTI_COPY) if (text.includes(phrase)) throw new Error(`${step}: multi-listing copy exposed: ${phrase}`);
  if (/\b(?:applicant|spouse|household|family|profile|event|score)\.[A-Za-z0-9_.-]+/.test(text)) throw new Error(`${step}: raw domain key exposed`);
}

async function setStepper(page, testId, label, value) {
  for (let index = 0; index < value; index += 1) await page.getByTestId(testId).getByRole('button', { name: `${label} 늘리기` }).click();
}

const adaptiveValues = {
  eligibleResident: { type: 'choice', label: '예' },
  currentProgramTenant: { type: 'choice', label: '아니요' },
  collegeStudent: { type: 'choice', label: '아니요' },
  jobSeekerWithinTwoYears: { type: 'choice', label: '아니요' },
  youthStudyStatus: { type: 'choice', label: '둘 다 해당 없음' },
  benefitCategory: { type: 'choice', label: '해당 없음' },
  vehicleValueKrw: { type: 'input', value: '1500' },
  applicantTotalAssetsKrw: { type: 'input', value: '8000' },
  parentMonthlyIncomeKrw: { type: 'input', value: '200' },
  parentVehicleValueKrw: { type: 'input', value: '800' },
  workHistoryMonths: { type: 'input', value: '36' },
};

const waitForAssessmentDestination = page => Promise.race([
  page.getByTestId('adaptive-assessment').waitFor().then(() => 'adaptive'),
  page.getByTestId('samdo-hero').waitFor().then(() => 'samdo'),
]);

async function completeAdaptive(page) {
  const asked = new Set();
  for (let round = 0; round < 4; round += 1) {
    const destination = await waitForAssessmentDestination(page);
    if (destination === 'samdo') return [...asked];
    for (const [id, response] of Object.entries(adaptiveValues)) {
      const question = page.getByTestId(`adaptive-question-${id}`);
      if (!(await question.count())) continue;
      asked.add(id);
      if (response.type === 'choice') await page.getByTestId(`q-adaptive-${id}`).getByRole('radio', { name: response.label, exact: true }).click();
      else await page.getByTestId(`input-adaptive-${id}`).fill(response.value);
    }
    await samdoOnly(page, `adaptive-${round}`);
    await page.getByTestId('adaptive-submit').click();
  }
  throw new Error('adaptive assessment did not converge to Samdo result');
}

async function enterNewbornPersona(page) {
  await page.goto(`${baseUrl}/event`);
  await page.getByTestId('event-landing').waitFor();
  await samdoOnly(page, 'landing');
  if (!(await page.locator('body').innerText()).includes('총 32세대')) throw new Error('landing official inventory missing');

  await page.getByTestId('landing-story').click();
  for (let index = 0; index < 5; index += 1) {
    await page.getByTestId(`story-segment-${index}`).click();
    await samdoOnly(page, `story-${index}`);
  }
  if (!(await page.getByTestId('story-message').innerText()).includes('나에게 맞는 선택지와')) throw new Error('Samdo story final message missing');
  await page.getByTestId('story-skip').click();

  await page.getByTestId('event-start').click();
  await page.getByTestId('intro-next').click();
  await samdoOnly(page, 'intro');
  await page.getByTestId('household-withChildren').click();
  await next(page);

  await page.getByTestId('input-birthDate').fill('19910410');
  await choice(page, 'q-applicant-isHouseholdHead', '예');
  await choice(page, 'q-applicant-livesInEventRegion', '예');
  await choice(page, 'q-applicant-residenceMonths', '5년 이상');
  await choice(page, 'q-household-childExpectationStatus', '없어요');
  await next(page);

  await choice(page, 'q-household-marriageRegistered', '했어요');
  await page.getByTestId('input-marriageDate').fill('20240501');
  await setStepper(page, 'q-household-childrenCount', '자녀 수', 1);
  await page.getByTestId('input-childBirthDate-0').fill('20250115');
  await next(page);

  await choice(page, 'q-applicant-householdNoHome', '모두 없어요');
  await choice(page, 'q-applicant-neverOwnedHome', '가진 적 없어요');
  await choice(page, 'q-subscription-accountKind', '주택청약종합저축');
  await page.getByTestId('input-openedAt').fill('20180101');
  await page.getByTestId('input-paymentCount').fill('36');
  await page.getByTestId('input-depositAmount').fill('600');
  await next(page);

  await page.getByTestId('input-monthlyIncome').fill('260');
  await choice(page, 'q-applicant-taxPaymentYears', '5년 이상');
  await choice(page, 'q-household-dualIncome', '맞벌이예요');
  await setStepper(page, 'q-household-householdSize', '세대원 수', 3);
  await page.getByTestId('input-householdIncome').fill('470');
  await page.getByTestId('input-totalAssets').fill('13000');
  await choice(page, 'q-applicant-specialSupplyHistory', '없어요');
  await choice(page, 'q-applicant-reWinningRestriction', '표시되지 않아요');
  await choice(page, 'q-applicant-householdNoWinningFiveYears', '모두 없어요');
  await choice(page, 'q-applicant-longOverseasStay', '없어요');
  await choice(page, 'q-applicant-specialException', '해당 없어요');
  await next(page);
  const adaptive = await completeAdaptive(page);
  return adaptive;
}

async function verifyResult(page) {
  await page.getByTestId('samdo-result').waitFor();
  await samdoOnly(page, 'samdo-result');
  for (const id of ['samdo-hero', 'samdo-official-criteria', 'samdo-why', 'samdo-schedule', 'samdo-refinement', 'samdo-simulator']) {
    if (!(await page.getByTestId(id).count())) throw new Error(`${id} missing`);
  }
  const resultText = await page.getByTestId('samdo-result').innerText();
  for (const term of ['입주자격', '소득기준', '자산기준', '청약통장', '가입 6개월', '월 납입 6회 이상']) {
    if (!resultText.includes(term)) throw new Error(`official criterion missing: ${term}`);
  }
  if (resultText.includes('기관추천 특별공급')) throw new Error('final 1.8 does not allocate institutional recommendation supply');
  if (/당첨\s*확률(?:이|은)?\s*(?:높|낮)|경쟁률\s*\d/.test(resultText)) throw new Error('winning probability or competition was invented');
}

async function verifySimulation(page) {
  const baseline = await page.getByTestId('samdo-hero-title').innerText();
  await page.getByTestId('samdo-simulation-open').click();
  await page.getByTestId('samdo-simulation-fact-residenceMonths').click();
  await page.getByTestId('samdo-refinement-input').fill('24');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  if (!(await page.getByTestId('samdo-simulator').innerText()).includes('가정 중')) throw new Error('simulation badge missing');
  await page.getByTestId('samdo-simulation-reset').click();
  if (await page.getByTestId('samdo-hero-title').innerText() !== baseline) throw new Error('simulation changed baseline result');
}

async function verifyChat(page) {
  await page.getByTestId('samdo-ask-ai').click();
  await page.getByTestId('chat-context').waitFor();
  await samdoOnly(page, 'chat');
  const context = await page.getByTestId('chat-context').innerText();
  if (!context.includes('삼도이동 1지구') || !context.includes('삼도 전용 판정')) throw new Error(`wrong chat context: ${context}`);
  await page.getByTestId('chat-input').fill('신청은 언제부터 할 수 있어?');
  await page.getByTestId('chat-send').click();
  await page.getByTestId('chat-message-assistant').nth(1).waitFor();
  const scheduleAnswer = await page.getByTestId('chat-message-assistant').nth(1).innerText();
  for (const date of ['2026.11.16', '2026.11.17', '2026.11.18']) {
    if (!scheduleAnswer.includes(date)) throw new Error(`chat schedule answer missing ${date}: ${scheduleAnswer}`);
  }
  await page.getByTestId('chat-input').fill('당첨 확률 몇 퍼센트야?');
  await page.getByTestId('chat-send').click();
  await page.getByTestId('chat-message-assistant').nth(2).waitFor();
  const answer = await page.getByTestId('chat-message-assistant').nth(2).innerText();
  if (/(?:당첨\s*확률|경쟁률)[^\n]{0,20}\d+\s*%/.test(answer)) throw new Error(`chat invented probability: ${answer}`);
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  await page.getByTestId('samdo-result').waitFor();
}

async function verifyQr(page, browser) {
  await page.getByTestId('samdo-save-qr').click();
  await page.getByTestId('samdo-qr-panel').waitFor();
  const link = await page.getByTestId('samdo-qr-code').locator('..').getAttribute('data-link');
  const url = link ? new URL(link) : null;
  if (!url || url.pathname !== '/event/take' || url.searchParams.size !== 1 || !/^[a-f0-9]{64}$/.test(url.searchParams.get('token') ?? '')) throw new Error(`QR URL is not opaque: ${link}`);
  for (const pii of ['1991', '2025', '260', '470', '13000']) if (link.includes(pii)) throw new Error(`QR URL contains personal value: ${pii}`);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto(link);
  await mobile.getByTestId('take-samdo-summary').waitFor();
  await samdoOnly(mobile, 'mobile-qr');
  const text = await mobile.getByTestId('take-samdo-summary').innerText();
  for (const required of ['삼도이동 1지구 분석 결과', '추천 공급유형', '공식 가점', '접수 일정', '추천 이유']) if (!text.includes(required)) throw new Error(`mobile QR missing ${required}`);
  await noOverflow(mobile, 'mobile-qr');
  await touchTargets(mobile, 'mobile-qr');
  await mobileContext.close();
  return url.searchParams.get('token');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await context.newPage();
    const adaptive = await enterNewbornPersona(page);
    await verifyResult(page);
    await verifySimulation(page);

    const viewports = [
      ['desktop', 1440, 900],
      ['laptop', 1280, 800],
      ['iPad landscape', 1024, 768],
      ['iPad portrait', 768, 1024],
      ['mobile', 390, 844],
    ];
    for (const [label, width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await noOverflow(page, label);
      await touchTargets(page, label);
      await samdoOnly(page, label);
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await verifyChat(page);
    const token = await verifyQr(page, browser);
    await context.close();

    const invalidContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const invalid = await invalidContext.newPage();
    await invalid.goto(`${baseUrl}/event/take?token=${'f'.repeat(64)}`);
    await invalid.getByTestId('take-invalid').waitFor();
    await noOverflow(invalid, 'invalid-token');
    await invalidContext.close();

    process.stdout.write(`${JSON.stringify({ status: 'PASS', adaptiveQuestions: adaptive, viewports: viewports.map(([label]) => label), opaqueTokenLength: token?.length ?? 0, otherListingExposure: 0 }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

await main();
