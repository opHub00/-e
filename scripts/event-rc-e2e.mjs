import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';

const personas = [
  { id: 'YOUNG_SINGLE', label: '20대 미혼 청년', household: 'single', birth: '20010410', income: '250', assets: '6000', parentAssets: '6000', viewport: { width: 1440, height: 900 } },
  { id: 'ENGAGED_COUPLE', label: '예비신혼부부', household: 'couple', engaged: true, birth: '19920410', income: '280', householdIncome: '490', assets: '13000', parentAssets: '6000', size: 2, viewport: { width: 768, height: 1024 } },
  { id: 'NEWLYWED_COUPLE', label: '신혼부부', household: 'couple', birth: '19910410', income: '280', householdIncome: '490', assets: '13000', size: 2, viewport: { width: 1024, height: 768 } },
  { id: 'NEWLYWED_ONE_CHILD', label: '신혼 + 자녀 1명', household: 'withChildren', birth: '19910410', income: '260', householdIncome: '470', assets: '13000', size: 3, children: ['20250115'], viewport: { width: 1440, height: 900 } },
  { id: 'FIRST_HOME_COUPLE', label: '생애최초 부부', household: 'couple', birth: '19900410', income: '270', householdIncome: '480', assets: '12000', size: 2, viewport: { width: 768, height: 1024 } },
  { id: 'MULTI_CHILD', label: '다자녀 가구', household: 'withChildren', birth: '19880410', income: '220', householdIncome: '430', assets: '12000', size: 5, children: ['20180101', '20210101', '20250101'], viewport: { width: 1024, height: 768 } },
  { id: 'GENERAL_NO_HOME', label: '일반 무주택 가구', household: 'couple', birth: '19800410', income: '200', householdIncome: '390', assets: '12000', size: 2, marriageDate: '20100501', viewport: { width: 1440, height: 900 } },
  { id: 'CLEARLY_INELIGIBLE', label: '명확한 자격 미달 가구', household: 'single', birth: '19750410', income: '1500', assets: '90000', parentAssets: '90000', ownsHome: true, winning: true, noAccount: true, viewport: { width: 768, height: 1024 } },
];

const choice = async (page, testId, label) => {
  await page.getByTestId(testId).getByRole('radio', { name: label, exact: true }).click();
};

const next = page => page.getByRole('button', { name: /^(다음|분석 시작하기)$/ }).click();

async function noOverflow(page, step) {
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  if (metrics.scrollWidth > metrics.clientWidth + 1) throw new Error(`${step}: horizontal overflow ${metrics.scrollWidth}/${metrics.clientWidth}`);
  return metrics;
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

async function visibleListingCardCount(page) {
  return page.locator('[data-testid^="listing-card-"]').evaluateAll(cards => cards.filter(card => {
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }).length);
}

async function setStepper(page, testId, label, value) {
  for (let index = 0; index < value; index += 1) await page.getByTestId(testId).getByRole('button', { name: `${label} 늘리기` }).click();
}

const adaptiveValues = {
  eligibleResident: { type: 'choice', label: '예' },
  currentProgramTenant: { type: 'choice', label: '아니요' },
  collegeStudent: { type: 'choice', label: '아니요' },
  jobSeekerWithinTwoYears: { type: 'choice', label: '아니요' },
  benefitCategory: { type: 'choice', label: '해당 없음' },
  vehicleValueKrw: { type: 'input', value: '1500' },
  applicantTotalAssetsKrw: { type: 'input', value: '8000' },
  parentMonthlyIncomeKrw: { type: 'input', value: '200' },
  parentVehicleValueKrw: { type: 'input', value: '800' },
  workHistoryMonths: { type: 'input', value: '36' },
};

const waitForAdaptiveDestination = page => Promise.race([
  page.getByTestId('adaptive-assessment').waitFor().then(() => 'adaptive'),
  page.getByTestId('results-title').waitFor().then(() => 'results'),
]);

async function completeAdaptive(page, verifyBackNavigation = false) {
  const asked = new Set();
  let backVerified = false;
  for (let round = 0; round < 4; round += 1) {
    const destination = await waitForAdaptiveDestination(page);
    if (destination === 'results') return [...asked];
    const currentRound = [];
    for (const [id, response] of Object.entries(adaptiveValues)) {
      const question = page.getByTestId(`adaptive-question-${id}`);
      if (!(await question.count())) continue;
      asked.add(id);
      currentRound.push(id);
      if (response.type === 'choice') await page.getByTestId(`q-adaptive-${id}`).getByRole('radio', { name: response.label, exact: true }).click();
      else await page.getByTestId(`input-adaptive-${id}`).fill(response.value);
    }
    if (verifyBackNavigation && !backVerified) {
      await page.getByRole('button', { name: '이전', exact: true }).click();
      await page.getByTestId('input-paymentCount').last().waitFor();
      await page.getByRole('button', { name: /^(다음|분석 시작하기)$/ }).last().click();
      const nextDestination = await waitForAdaptiveDestination(page);
      if (nextDestination === 'results') return [...asked];
      for (const id of currentRound) {
        if (await page.getByTestId(`adaptive-question-${id}`).count()) throw new Error(`adaptive back navigation lost ${id}`);
      }
      backVerified = true;
      continue;
    }
    await page.getByTestId('adaptive-submit').click();
  }
  throw new Error('adaptive assessment did not converge');
}

async function enterPersona(page, persona, verifyBack) {
  await page.goto(`${baseUrl}/event`);
  await page.getByTestId('event-start').click();
  await page.getByTestId('intro-next').click();
  await page.getByTestId(`household-${persona.household}`).click();
  await next(page);

  await page.getByTestId('input-birthDate').fill(persona.birth);
  await choice(page, 'q-applicant-isHouseholdHead', '예');
  await choice(page, 'q-applicant-livesInEventRegion', '예');
  await choice(page, 'q-applicant-residenceMonths', '5년 이상');
  await choice(page, 'q-applicant-longOverseasStay', '없어요');
  await choice(page, 'q-applicant-specialException', '없어요');
  if (verifyBack) {
    await page.getByRole('button', { name: '이전', exact: true }).click();
    await next(page);
    if (await page.getByTestId('input-birthDate').inputValue() !== `${persona.birth.slice(0, 4)}-${persona.birth.slice(4, 6)}-${persona.birth.slice(6)}`) {
      throw new Error('back navigation lost birth date');
    }
  }
  await next(page);

  if (persona.household === 'couple' || persona.household === 'withChildren') {
    await choice(page, 'q-household-marriageRegistered', persona.engaged ? '아직이에요' : '했어요');
    if (persona.engaged) await choice(page, 'q-household-plannedMarriageWithinDeadline', '할 수 있어요');
    else await page.getByTestId('input-marriageDate').fill(persona.marriageDate ?? '20240501');
    if (persona.household === 'withChildren') {
      await setStepper(page, 'q-household-childrenCount', '자녀 수', persona.children.length);
      for (let index = 0; index < persona.children.length; index += 1) await page.getByTestId(`input-childBirthDate-${index}`).fill(String(persona.children[index]));
    }
    await next(page);
  }

  await page.getByTestId('input-monthlyIncome').fill(persona.income);
  await choice(page, 'q-applicant-taxPaymentYears', '5년 이상');
  if (persona.household === 'couple' || persona.household === 'withChildren') {
    await choice(page, 'q-household-dualIncome', '맞벌이예요');
    await setStepper(page, 'q-household-householdSize', '세대원 수', persona.size);
    await page.getByTestId('input-householdIncome').fill(persona.householdIncome);
  }
  await page.getByTestId('input-totalAssets').fill(persona.assets);
  if (await page.getByTestId('input-parentAssets').count()) await page.getByTestId('input-parentAssets').fill(persona.parentAssets ?? '6000');
  await next(page);

  await choice(page, 'q-applicant-householdNoHome', persona.ownsHome ? '있어요' : '모두 없어요');
  await choice(page, 'q-applicant-neverOwnedHome', persona.ownsHome ? '가진 적 있어요' : '가진 적 없어요');
  await choice(page, 'q-applicant-winningHistory', persona.winning ? '있어요' : '없어요');
  await choice(page, 'q-subscription-accountKind', persona.noAccount ? '없어요' : '주택청약종합저축');
  if (!persona.noAccount) {
    await page.getByTestId('input-openedAt').fill('20180101');
    await page.getByTestId('input-paymentCount').fill('36');
    await page.getByTestId('input-depositAmount').fill('600');
    await choice(page, 'q-subscription-firstRank', '채웠어요');
  }
  const started = Date.now();
  await next(page);
  const adaptiveQuestions = await completeAdaptive(page, persona.id === 'YOUNG_SINGLE');
  return { analysisMs: Date.now() - started, adaptiveQuestions };
}

async function verifyFullFlow(page, persona, browser) {
  const { analysisMs, adaptiveQuestions } = await enterPersona(page, persona, persona.id === 'YOUNG_SINGLE');
  await noOverflow(page, `${persona.id}:results`);
  await touchTargets(page, `${persona.id}:results`);
  const title = await page.getByTestId('results-title').innerText();
  if (!title.includes('공고 5개, 공급 9건')) throw new Error(`${persona.id}: wrong inventory ${title}`);
  if (await visibleListingCardCount(page) !== 9) throw new Error(`${persona.id}: expected 9 visible cards`);
  const body = await page.locator('body').innerText();
  if (/공고 배점\s*0\s*(?:\/|점)/.test(body)) throw new Error(`${persona.id}: NOT_APPLICABLE rendered as zero`);
  if (!body.includes('완판e 추천도') || !['적극 검토', '검토 가능', '조건 확인 필요', '신청 어려움'].some(label => body.includes(label))) throw new Error(`${persona.id}: qualitative wanpan label missing`);

  const distribution = {};
  for (const bucket of ['eligible', 'review', 'difficult']) {
    const text = await page.getByTestId(`bucket-${bucket}`).innerText();
    distribution[bucket] = Number(text.match(/(\d+)개/)?.[1] ?? -1);
  }
  if (persona.id !== 'CLEARLY_INELIGIBLE' && distribution.eligible < 1) throw new Error(`${persona.id}: adaptive answers produced no COMPLETE result`);
  if (persona.id === 'CLEARLY_INELIGIBLE' && distribution.eligible !== 0) throw new Error(`${persona.id}: ineligible persona was relaxed`);

  await page.getByTestId('detail-1').click();
  await page.getByTestId('listing-detail').waitFor();
  await page.getByTestId('detail-evidence').waitFor();
  if (!(await page.getByTestId('detail-evidence').innerText()).includes('공고 원문 근거')) throw new Error(`${persona.id}: evidence missing`);
  await noOverflow(page, `${persona.id}:detail`);

  await page.getByRole('button', { name: '이 공고 AI에게 묻기' }).click();
  await page.getByTestId('chat-context').waitFor();
  await page.getByTestId('chat-input').fill('근거가 된 공고문 항목은 무엇인가요?');
  await page.getByTestId('chat-send').click();
  await page.getByTestId('chat-message-assistant').nth(1).waitFor();
  if (!(await page.getByTestId('chat-context').innerText()).includes('상담 기준')) throw new Error(`${persona.id}: chat context missing`);
  await noOverflow(page, `${persona.id}:chat`);
  await page.goBack();
  await page.getByTestId('listing-detail').waitFor();
  await page.getByRole('button', { name: '관심 공고에 담기' }).click();
  await page.getByTestId('detail-back').click();
  await page.getByTestId('results-title').waitFor();

  await page.getByTestId('open-favorites').click();
  await page.getByTestId('favorites-list').waitFor();
  if (await visibleListingCardCount(page) !== 1) throw new Error(`${persona.id}: favorite not retained`);
  await page.getByTestId('favorites-summary').click();
  await page.getByTestId('summary').waitFor();
  await page.getByTestId('summary-qr').click();
  await page.getByTestId('summary-qr-panel').waitFor();
  const link = await page.getByTestId('summary-qr-code').locator('..').getAttribute('data-link');
  if (!link || !/^http:\/\/[^/]+\/event\/take\?token=[a-f0-9]{64}$/.test(link)) throw new Error(`${persona.id}: QR is not opaque ${link}`);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto(link);
  await mobile.getByTestId('take-summary').waitFor();
  await noOverflow(mobile, `${persona.id}:mobile-qr`);
  await touchTargets(mobile, `${persona.id}:mobile-qr`);
  await mobileContext.close();

  await page.getByTestId('summary-reset').click();
  await page.getByTestId('event-landing').waitFor();
  return { personaId: persona.id, label: persona.label, viewport: persona.viewport, distribution, adaptiveQuestions, analysisMs, qrTokenOnly: true };
}

async function edgeCases(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/event/take?token=${'f'.repeat(64)}`);
  await page.getByTestId('take-invalid').waitFor();
  await noOverflow(page, 'invalid-token');

  await page.goto(`${baseUrl}/event/results`);
  await page.getByTestId('kiosk-empty').waitFor();
  await noOverflow(page, 'empty-results');

  await page.goto(`${baseUrl}/event`);
  await page.getByTestId('event-start').click();
  await page.getByTestId('intro-next').click();
  await page.getByTestId('household-single').click();
  await next(page);
  await page.getByTestId('input-birthDate').fill('19950410');
  await page.reload();
  await page.getByTestId('input-birthDate').waitFor();
  if (await page.getByTestId('input-birthDate').inputValue()) throw new Error('refresh retained private input');

  await page.setViewportSize({ width: 768, height: 480 });
  await page.getByTestId('input-birthDate').focus();
  await page.getByTestId('input-birthDate').scrollIntoViewIfNeeded();
  const keyboardLayout = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="input-birthDate"]')?.getBoundingClientRect();
    const footer = document.querySelector('[data-testid="kiosk-footer"]')?.getBoundingClientRect();
    return input && footer ? { inputBottom: input.bottom, footerTop: footer.top } : null;
  });
  if (!keyboardLayout || keyboardLayout.inputBottom > keyboardLayout.footerTop) throw new Error(`reduced viewport hides input behind CTA: ${JSON.stringify(keyboardLayout)}`);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${baseUrl}/event/household`);
  await page.getByTestId('household-single').click();
  await page.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() + 151_000;
  });
  await page.waitForTimeout(800);
  await page.getByTestId('event-landing').waitFor();
  await context.close();
  return { invalidToken: 'PASS', emptyResults: 'PASS', refreshPrivacy: 'PASS', reducedViewportKeyboardCta: 'PASS', idleReset: 'PASS', adaptiveBackNavigation: 'PASS' };
}

const browser = await chromium.launch({ headless: true });
const personaResults = [];
try {
  for (const persona of personas) {
    const context = await browser.newContext({ viewport: persona.viewport });
    const page = await context.newPage();
    personaResults.push(await verifyFullFlow(page, persona, browser));
    await context.close();
  }
  const edges = await edgeCases(browser);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    browsers: ['Chromium'],
    personas: personaResults,
    edges,
    maxAnalysisMs: Math.max(...personaResults.map(item => item.analysisMs)),
    result: 'PASS',
  };
  await writeFile('.cache/event-rc-qa.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
