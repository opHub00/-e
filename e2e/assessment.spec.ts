import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  ANNOUNCEMENT_ID, LISTING_ID, PROFILE_STORAGE_KEY, SCENARIOS, SUPPLY_TAB,
  NEEDS_PROFILE, catalogPayload, profileSeed, ruleSetPayload, type Scenario,
} from './fixtures.ts';
import { STAGE_LABELS } from '../features/applicationAssessment/labels.ts';
import { FORM_FIELDS } from '../features/applicationAssessment/form.ts';

const SHOTS = 'e2e/.artifacts/screenshots';
const STATUS_TEXT = {
  ELIGIBLE: '신청 가능한 조건이에요',
  INELIGIBLE: '현재 조건으로는 신청하기 어려워요',
  NEEDS_MORE_INFORMATION: '확인할 정보가 더 있어요',
} as const;

/**
 * Every supabase request is answered locally or aborted, so a smoke run never
 * reaches the real project. Only the two read RPCs are served.
 */
async function stubDatabase(page: Page) {
  await page.route('**/*.supabase.co/**', async route => {
    const url = route.request().url();
    if (url.includes('/rpc/read_assessment_rule_set')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ruleSetPayload()) });
    }
    if (url.includes('/rpc/list_assessment_announcements')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalogPayload()) });
    }
    return route.abort();
  });
}

async function openResult(page: Page, scenario: Scenario) {
  await stubDatabase(page);
  await page.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
  }, [PROFILE_STORAGE_KEY, JSON.stringify(scenario.profile)] as const);

  await page.goto(`/assessment?listingId=${encodeURIComponent(LISTING_ID)}`);
  await page.getByRole('button', { name: '내 정보 확인하기' }).click();
  await page.getByRole('radio', { name: SUPPLY_TAB[scenario.supply], exact: true }).click();
  await page.getByRole('button', { name: '추가 정보 입력하기' }).click();
  await expect(page.getByRole('heading', { name: '공고에 필요한 추가 정보' })).toBeVisible();
  await fillAnswers(page, scenario.answers);
  await page.getByRole('button', { name: '내 조건으로 판정하기' }).click();
  await expect(page.getByRole('heading', { name: '내 조건으로 확인한 결과' })).toBeVisible();
}

/** Fields hidden for a supply type are skipped, so one answer map drives every scenario. */
async function fillAnswers(page: Page, answers: Record<string, string>) {
  const choice = async (name: string) => {
    const radio = page.getByRole('radio', { name, exact: true });
    if (await radio.count()) await radio.first().click();
  };
  if (answers.currentResidence) await choice(answers.currentResidence);
  if (answers.familyCategory === 'married') await choice('신혼부부');

  for (const [key, value] of Object.entries(answers)) {
    if (['currentResidence', 'familyCategory', 'overseas', 'exceptions'].includes(key)) continue;
    const input = page.getByLabel(labelFor(key), { exact: true });
    if (await input.count()) { await input.first().fill(value); continue; }
    if (value === 'yes' || value === 'no') await booleanCard(page, labelFor(key), value === 'yes' ? '예' : '아니요');
  }

  if (answers.overseas) await booleanCard(page, /거주기간 중 해외 체류 이력이 있나요/, answers.overseas === 'yes' ? '예' : '아니요');
  if (answers.exceptions) await booleanCard(page, /특례를 적용해야 하나요/, answers.exceptions === 'yes' ? '예' : '아니요');
}

async function booleanCard(page: Page, label: string | RegExp, answer: '예' | '아니요') {
  const heading = page.getByText(label, { exact: typeof label === 'string' });
  if (!(await heading.count())) return;
  const card = heading.first().locator('xpath=..');
  const radio = card.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.first().click();
}

/** Reuse the product's own labels: a copy change fails the test instead of silently skipping a field. */
function labelFor(key: string): string {
  const field = FORM_FIELDS.find(f => f.key === key);
  if (!field) throw new Error(`unknown answer key: ${key}`);
  return field.label;
}
/**
 * react-native-web scrolls an inner container, not the document, so `fullPage` would
 * only ever capture the first screen. The width is what drives layout, so the viewport
 * is grown vertically for the capture and restored afterwards.
 */
async function shoot(page: Page, name: string, project: string) {
  await mkdir(SHOTS, { recursive: true });
  const size = page.viewportSize();
  const content = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('div')].filter(el => el.scrollHeight > el.clientHeight + 4);
    return Math.max(document.documentElement.scrollHeight, ...scrollers.map(el => el.scrollHeight));
  });
  const tall = Math.min(Math.max(content + 80, size?.height ?? 844), 6000);
  if (size) await page.setViewportSize({ width: size.width, height: tall });
  // Let brand/appear animations settle after the resize, otherwise they re-enter mid-capture.
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${project}__${name}.png` });
  if (size) await page.setViewportSize(size);
}

/**
 * The document itself rarely overflows here — an inner scroll container does — so a plain
 * `document.scrollWidth` check is not enough: every laid-out box is measured against the
 * viewport's right edge. Small clipped boxes (tab-bar icon slots) are not page overflow and
 * are deliberately not flagged.
 */
async function expectNoHorizontalOverflow(page: Page) {
  const report = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('*')]
      .map(el => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > limit + 1)
      .map(({ el, box }) => `${el.tagName} right=${Math.round(box.right)} > ${limit}: ${(el.textContent ?? '').slice(0, 30)}`);
    return { documentScroll: document.documentElement.scrollWidth, limit, wide: wide.slice(0, 5) };
  });
  expect(report.documentScroll, 'document must not scroll sideways').toBeLessThanOrEqual(report.limit + 1);
  expect(report.wide, 'no element may extend past the viewport').toEqual([]);
}

for (const scenario of SCENARIOS) {
  test(`${scenario.name} renders its result`, async ({ page }, testInfo) => {
    await openResult(page, scenario);
    const expected = scenario.expected;

    // 1. Status wording — a sentence, never the internal enum.
    await expect(page.getByRole('heading', { name: STATUS_TEXT[expected.status] })).toBeVisible();
    await expect(page.getByText(expected.status, { exact: true })).toHaveCount(0);

    // 2. Supply type / stage / score hierarchy.
    await expect(page.getByText(SUPPLY_TAB[scenario.supply], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(expected.stage ? STAGE_LABELS[expected.stage] : '공급단계 확인 전', { exact: true })).toBeVisible();

    // 3. Draft-source badge, never a confidence percentage.
    await expect(page.getByText('검토본 기준', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/신뢰도|confidence|\d+% 확신/i)).toHaveCount(0);

    // 4. Scoring: a scoreless supply must never read as zero points.
    if (expected.scoring === 'NOT_APPLICABLE') {
      await expect(page.getByText(/가점 대신 공급단계와 추첨으로 선정|가점 없이 추첨으로 선정/)).toBeVisible();
      await expect(page.getByText(/예상 0 \/ 0점|0점/)).toHaveCount(0);
    } else if (expected.score) {
      await expect(page.getByText(`예상 ${expected.score.total} / ${expected.score.max}점`, { exact: true })).toBeVisible();
    }

    // 5. "이 결과가 나온 이유" leads with what blocks, not with what passed.
    await expect(page.getByRole('heading', { name: '이 결과가 나온 이유' })).toBeVisible();
    if (expected.failedConditions.length) {
      await expect(page.getByText(`충족하지 못한 조건 ${expected.failedConditions.length}개`, { exact: true })).toBeVisible();
      await expect(page.getByText(`• ${expected.failedConditions[0].label}`, { exact: true }).first()).toBeVisible();
    }

    await expectNoHorizontalOverflow(page);
    await shoot(page, scenario.name, testInfo.project.name);
  });
}

test('통과 조건·증빙서류·판정근거·공고 원문이 단계적으로 열린다', async ({ page }) => {
  const scenario = SCENARIOS[0];
  await openResult(page, scenario);
  const expected = scenario.expected;

  // Satisfied conditions start collapsed.
  const satisfied = page.getByRole('button', { name: `충족한 조건 ${expected.satisfiedConditions.length}개` });
  await expect(satisfied).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(`• ${expected.satisfiedConditions[0].label}`, { exact: true })).toHaveCount(0);
  await satisfied.click();
  await expect(satisfied).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(`• ${expected.satisfiedConditions[0].label}`, { exact: true }).first()).toBeVisible();

  // Documents: count first, list behind a toggle.
  await expect(page.getByRole('heading', { name: `준비할 증빙서류 ${expected.requiredDocuments.length}개` })).toBeVisible();
  await expect(page.getByText(`• ${expected.requiredDocuments[0]}`, { exact: true })).toHaveCount(0);
  const documents = page.getByRole('button', { name: '서류 목록 보기' });
  await expect(documents).toHaveAttribute('aria-expanded', 'false');
  await documents.click();
  await expect(page.getByText(`• ${expected.requiredDocuments[0]}`, { exact: true }).first()).toBeVisible();

  // Evidence: internal ids stay hidden until the second level is opened.
  const evidenceId = expected.evidence[0].id;
  await expect(page.getByText(evidenceId, { exact: false })).toHaveCount(0);
  const evidence = page.getByRole('button', { name: '판정근거와 사용한 입력값 보기' });
  await expect(evidence).toHaveAttribute('aria-expanded', 'false');
  await evidence.click();
  await expect(page.getByText(expected.evidence[0].label, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`근거 ID: ${evidenceId}`, { exact: true })).toHaveCount(0);

  // Third level: the announcement excerpt itself. The label flips to 접기 once open,
  // so the opened toggle has to be re-located by its new name.
  const excerpt = page.getByRole('button', { name: '공고 원문 보기' }).first();
  await expect(excerpt).toHaveAttribute('aria-expanded', 'false');
  await excerpt.click();
  const opened = page.getByRole('button', { name: '공고 원문 접기' });
  await expect(opened).toHaveCount(1);
  await expect(opened).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(`근거 ID: ${evidenceId}`, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('판정 결과에서 상담으로 이어가면 결과와 입력을 다시 묻지 않고 재사용한다', async ({ page }) => {
  const scenario = SCENARIOS[0];
  await openResult(page, scenario);
  await page.getByRole('button', { name: '이 결과에 대해 물어보기' }).click();
  await expect(page).toHaveURL(/\/consultation\?.*seedId=/);
  await expect(page.getByText(/판정 결과와 입력한 정보를 그대로 이어받았어요/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '신청 가능한 조건이에요' })).toBeVisible();
  await expect(page.getByText('9 / 9점', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '왜 9점이에요?' }).click();
  await expect(page.getByText(/본인 월평균소득.*3점/).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /공고 근거 \d+건 보기/ })).toBeVisible();
});

test('NEEDS_MORE_INFORMATION은 해결 위치별로 나뉘고 공고 항목에는 CTA가 없다', async ({ page }, testInfo) => {
  // Answers are empty and the profile is complete, so only the answer bucket has entries.
  await openResult(page, SCENARIOS[4]);
  await expect(page.getByText('탈락이나 오류가 아니에요.', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '내가 채우면 되는 정보' })).toBeVisible();
  await expect(page.getByText('추가 질문에서 입력', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '추가 질문 수정하기' })).toBeVisible();
  // A complete profile must not render an empty "fix your profile" section.
  await expect(page.getByText('프로필에서 입력', { exact: true })).toHaveCount(0);

  // The announcement-side group explains itself and offers no action the user cannot take.
  const announcement = page.getByRole('heading', { name: '공고 쪽에서 확인 중인 기준' });
  if (await announcement.count()) {
    await expect(page.getByText('입력으로 채울 수 있는 항목이 아니에요.', { exact: false })).toBeVisible();
    const card = announcement.locator('xpath=..');
    await expect(card.getByRole('button')).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'needs-info-answers', testInfo.project.name);
});

test('프로필에 빈칸이 있으면 프로필 수정 CTA가 따로 나온다', async ({ page }, testInfo) => {
  await openResult(page, NEEDS_PROFILE);
  await expect(page.getByRole('heading', { name: STATUS_TEXT.NEEDS_MORE_INFORMATION })).toBeVisible();
  await expect(page.getByText('프로필에서 입력', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '프로필에서 입력하기' })).toBeVisible();
  await expect(page.getByText('추가 질문에서 입력', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'needs-info-profile', testInfo.project.name);
});

test('추가 질문은 묶음으로 나뉘고 금액은 억·만 단위로 되읽는다', async ({ page }, testInfo) => {
  await stubDatabase(page);
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value),
    [PROFILE_STORAGE_KEY, JSON.stringify(profileSeed('youth'))] as const);
  await page.goto(`/assessment?listingId=${encodeURIComponent(LISTING_ID)}`);
  await page.getByRole('button', { name: '내 정보 확인하기' }).click();
  await page.getByRole('radio', { name: SUPPLY_TAB.youth, exact: true }).click();
  await page.getByRole('button', { name: '추가 정보 입력하기' }).click();

  for (const group of ['기본정보', '거주', '혼인·자녀', '주택·당첨 이력', '청약통장', '소득', '자산', '해외체류·특례']) {
    await expect(page.getByRole('heading', { name: group, exact: true })).toBeVisible();
  }

  const income = page.getByLabel('본인 월평균소득(원)', { exact: true });
  await expect(page.getByText(/입력한 금액:/)).toHaveCount(0);
  await income.fill('2669354');
  await expect(page.getByText('입력한 금액: 266만 9,354원', { exact: true })).toBeVisible();
  await page.getByLabel('자산 총액(원, 청년은 본인 / 그 외 세대)', { exact: true }).fill('100000000');
  await expect(page.getByText('입력한 금액: 1억원', { exact: true })).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await shoot(page, 'question-groups', testInfo.project.name);
});

test('접근성 스모크: heading 역할, 키보드 포커스, 색상만으로 구분하지 않음', async ({ page }) => {
  await openResult(page, SCENARIOS[3]);

  // Headings are real headings, not styled text.
  await expect(page.getByRole('heading', { name: STATUS_TEXT.INELIGIBLE })).toBeVisible();
  expect(await page.getByRole('heading').count()).toBeGreaterThan(3);

  // Every disclosure exposes its state.
  const toggles = page.getByRole('button', { name: /^(?:서류 목록|판정근거와 사용한 입력값|공고 원문) (?:보기|접기)$|^충족한 조건 \d+개$/ });
  const count = await toggles.count();
  expect(count, 'result screen must expose disclosures').toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', /^(true|false)$/);
  }

  // The primary next step is reachable and focusable from the keyboard.
  const cta = page.getByRole('button', { name: '준비 단계로 이어가기' });
  await cta.focus();
  await expect(cta).toBeFocused();

  // Status and provenance carry text, so colour is never the only signal.
  await expect(page.getByRole('heading', { name: STATUS_TEXT.INELIGIBLE })).toHaveText(STATUS_TEXT.INELIGIBLE);
  await expect(page.getByText('검토본 기준', { exact: true }).first()).toHaveText('검토본 기준');
});

test('긴 공고명과 긴 근거문이 가로 스크롤을 만들지 않는다', async ({ page }) => {
  const longTitle = '제주특별자치도 삼도이동 토지임대부 국민임대주택 예비입주자 모집공고 검토본 제1지구 제2지구 통합 공고문 '.repeat(2);
  await page.route('**/*.supabase.co/**', async route => {
    const url = route.request().url();
    if (url.includes('/rpc/read_assessment_rule_set')) {
      const payload = ruleSetPayload();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...payload, title: longTitle }) });
    }
    if (url.includes('/rpc/list_assessment_announcements')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: ANNOUNCEMENT_ID, title: longTitle, source_status: 'DRAFT_SOURCE_VERIFIED' }]) });
    }
    return route.abort();
  });
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value),
    [PROFILE_STORAGE_KEY, JSON.stringify(profileSeed('youth'))] as const);

  await page.goto(`/assessment?listingId=${encodeURIComponent(LISTING_ID)}`);
  await page.getByRole('button', { name: '내 정보 확인하기' }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('radio', { name: SUPPLY_TAB.youth, exact: true }).click();
  await page.getByRole('button', { name: '추가 정보 입력하기' }).click();
  await fillAnswers(page, SCENARIOS[0].answers);
  await page.getByRole('button', { name: '내 조건으로 판정하기' }).click();
  await expect(page.getByRole('heading', { name: STATUS_TEXT.ELIGIBLE })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Open every disclosure: the longest excerpts in the package must stay inside the page.
  await page.getByRole('button', { name: '판정근거와 사용한 입력값 보기' }).click();
  // Each click renames its own toggle, so always take the first still-collapsed one.
  const collapsed = page.getByRole('button', { name: '공고 원문 보기' });
  for (let i = 0; i < 5 && await collapsed.count(); i += 1) await collapsed.first().click();
  await expectNoHorizontalOverflow(page);
});

test('모바일에서 마지막 버튼이 하단 탭바에 가리지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x844', 'mobile layout only');
  await openResult(page, SCENARIOS[2]);
  const last = page.getByRole('button', { name: '다른 공급유형 확인하기' });
  await last.scrollIntoViewIfNeeded();
  const tabTop = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('*')]
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 300 && r.height > 40 && r.height < 120 && Math.abs(r.bottom - window.innerHeight) < 2);
    return bar.length ? bar[bar.length - 1].top : window.innerHeight;
  });
  const box = await last.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height, 'last action must clear the bottom tab bar').toBeLessThanOrEqual(tabTop);
});

test('데스크톱 본문은 중앙 정렬 최대폭을 넘지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440x900', 'desktop layout only');
  await openResult(page, SCENARIOS[0]);
  const heading = page.getByRole('heading', { name: '이 결과가 나온 이유' });
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  // contentContainerStyle: maxWidth 720, centred, 20px screen padding.
  expect(box!.width).toBeLessThanOrEqual(720);
  expect(Math.abs((box!.x + box!.width / 2) - 1440 / 2)).toBeLessThan(40);
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'desktop-layout', testInfo.project.name);
});
