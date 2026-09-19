import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const SHOTS = 'e2e/.artifacts/screenshots';
const PREVIEW = '/consultation?preview=1&listingId=announcement%3Abade0617-63c6-4f61-86bf-6cd5ae17b101';

async function shoot(page: Page, name: string, project: string) {
  await mkdir(SHOTS, { recursive: true });
  const size = page.viewportSize();
  const content = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('div')].filter(el => el.scrollHeight > el.clientHeight + 4);
    return Math.max(document.documentElement.scrollHeight, ...scrollers.map(el => el.scrollHeight));
  });
  if (size) await page.setViewportSize({ width: size.width, height: Math.min(Math.max(content + 80, size.height), 6000) });
  // Let brand/appear animations settle after the resize, otherwise they re-enter mid-capture.
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${project}__${name}.png` });
  if (size) await page.setViewportSize(size);
}

/** react-native-web scrolls an inner container, so every box is measured against the viewport. */
async function expectNoHorizontalOverflow(page: Page) {
  const report = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('*')]
      .map(el => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > limit + 1)
      .map(({ el, box }) => `${el.tagName} right=${Math.round(box.right)} > ${limit}: ${(el.textContent ?? '').slice(0, 30)}`);
    return { documentScroll: document.documentElement.scrollWidth, limit, wide: wide.slice(0, 5) };
  });
  expect(report.documentScroll).toBeLessThanOrEqual(report.limit + 1);
  expect(report.wide, 'no element may extend past the viewport').toEqual([]);
}

const ask = async (page: Page, text: string) => {
  await page.getByLabel('상담 질문 입력').fill(text);
  await page.getByRole('button', { name: '질문 보내기' }).click();
};

test('상담 진입: engine이 없으면 가짜 답변 대신 준비 중 상태를 보여준다', async ({ page }) => {
  await page.goto('/consultation');
  await expect(page.getByRole('heading', { name: '공고 기반 상담은 준비 중이에요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '맞춤판정으로 확인하기' })).toBeVisible();
  // No conversation surface at all without the preview flag.
  await expect(page.getByLabel('상담 질문 입력')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('상담 시작 화면: 공고·검토본 배지·미리보기 고지·추천 질문', async ({ page }, testInfo) => {
  await page.goto(PREVIEW);
  await expect(page.getByText('삼도이동 1지구 토지임대부 공공분양주택', { exact: true })).toBeVisible();
  await expect(page.getByText('검토본 기준', { exact: true })).toBeVisible();
  await expect(page.getByText(/최종 공고에서 조건이 바뀔 수 있어요/)).toBeVisible();
  await expect(page.getByText(/설계 검토용 미리보기/)).toBeVisible();
  // The route slug must never surface as a header; every screen registers headerShown: false.
  await expect(page.getByText('consultation', { exact: true })).toHaveCount(0);
  for (const q of ['내가 신청 가능해?', '필요한 서류는?', '예외조건 알려줘']) {
    await expect(page.getByRole('button', { name: q })).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'consultation-start', testInfo.project.name);
});

test('한 번에 다 묻지 않고 프로필 재사용을 알린 뒤 1~3개만 질문한다', async ({ page }, testInfo) => {
  await page.goto(PREVIEW);
  await page.getByRole('button', { name: '내가 신청 가능해?' }).click();

  await expect(page.getByText(/프로필의 .*을\(를\) 사용했어요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '프로필 정보 수정' })).toBeVisible();

  // NEEDS_MORE_INFORMATION card, not an error.
  await expect(page.getByRole('heading', { name: '확인할 정보가 더 있어요' })).toBeVisible();
  await expect(page.getByText(/확인이 필요한 항목 3개/)).toBeVisible();

  // Questions arrive as taps, capped at three.
  await expect(page.getByText('공고일 기준 나이가 어떻게 되세요?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '만 19~39세' })).toBeVisible();
  const prompts = page.locator('text=/\\?$/');
  expect(await prompts.count()).toBeLessThanOrEqual(8);
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'consultation-missing-info', testInfo.project.name);
});

test('칩으로 답하면 결과 카드와 다음 행동이 나온다', async ({ page }, testInfo) => {
  await page.goto(PREVIEW);
  await page.getByRole('button', { name: '내가 신청 가능해?' }).click();
  await page.getByRole('button', { name: '만 19~39세' }).click();

  // The earlier pending card stays in the transcript, so assert against the newest one.
  await expect(page.getByRole('heading', { name: '신청 가능한 조건이에요' })).toBeVisible();
  await expect(page.getByText('청년 특별공급', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('1단계 우선공급', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('9 / 9점', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: '맞춤판정 자세히 보기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '준비 단계로 이어가기' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'consultation-result-card', testInfo.project.name);
});

test('INELIGIBLE도 카드로 결론과 막는 조건을 먼저 말한다', async ({ page }, testInfo) => {
  await page.goto(PREVIEW);
  await page.getByRole('button', { name: '내가 신청 가능해?' }).click();
  await page.getByRole('button', { name: '만 40세 이상' }).click();

  await expect(page.getByRole('heading', { name: '현재 조건으로는 신청하기 어려워요' })).toBeVisible();
  await expect(page.getByText(/충족하지 못한 조건 1개 · 만 19~39세/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'consultation-ineligible', testInfo.project.name);
});

test('생애최초는 0점이 아니라 가점제 아님으로 보여준다', async ({ page }, testInfo) => {
  await page.goto(PREVIEW);
  await ask(page, '생애최초로 보면 어떤가요?');
  await expect(page.getByRole('heading', { name: '신청 가능한 조건이에요' })).toBeVisible();
  await expect(page.getByText('생애최초 특별공급', { exact: true })).toBeVisible();
  await expect(page.getByText('가점제 아님 · 공급단계/추첨', { exact: true })).toBeVisible();
  await expect(page.getByText(/^0 \/ 0점$|^0점$/)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'consultation-scoreless', testInfo.project.name);
});

test('왜 라고 물으면 결론·이유 뒤에 근거가 접힌 채로 온다', async ({ page }, testInfo) => {
  await page.goto(PREVIEW);
  await ask(page, '왜 9점이야?');

  await expect(page.getByRole('heading', { name: '신청 가능한 조건이에요' })).toBeVisible();
  await expect(page.getByText(/소득 구간 3점, 제주 연속거주 3점/)).toBeVisible();

  // Evidence is collapsed and internal ids stay hidden until opened.
  const toggle = page.getByRole('button', { name: '공고 근거 2건 보기' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(/근거 ID:/)).toHaveCount(0);
  await toggle.click();
  await expect(page.getByRole('button', { name: '공고 근거 2건 접기' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('청약 납입인정횟수 배점', { exact: true })).toBeVisible();
  await expect(page.getByText(/근거 ID: samdo\.v17/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'consultation-why-evidence', testInfo.project.name);
});

test('모르는 항목은 오류가 아니라 확인 필요로 말한다', async ({ page }, testInfo) => {
  await page.goto(PREVIEW);
  await page.getByRole('button', { name: '예외조건 알려줘' }).click();
  await expect(page.getByText('공고 기준을 추가로 확인해야 하는 항목', { exact: true })).toBeVisible();
  await expect(page.getByText(/배우자 혼인 전 주택소유 예외의 적용 범위/)).toBeVisible();
  // Nothing that reads as a failure.
  await expect(page.getByText(/오류|실패|error/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'consultation-unresolved', testInfo.project.name);
});

test('판정 결과에서 넘어오면 결론 카드를 이미 들고 시작한다', async ({ page }) => {
  await page.goto(`${PREVIEW}&seed=assessment`);
  await expect(page.getByText(/방금 본 판정 결과를 기준으로/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '신청 가능한 조건이에요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '왜 9점이야?' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('긴 답변도 가로 스크롤을 만들지 않는다', async ({ page }) => {
  await page.goto(PREVIEW);
  await ask(page, '청년 특별공급 조건을 자세히 설명해줘');
  await expect(page.getByText(/본인 자산 276백만원 이하와 부모 자산/)).toBeVisible();
  await page.getByRole('button', { name: '공고 근거 3건 보기' }).click();
  await expectNoHorizontalOverflow(page);
});

test('접근성: 입력창·전송·추천 질문이 키보드로 닿고 상태가 텍스트로 보인다', async ({ page }) => {
  await page.goto(PREVIEW);
  const input = page.getByLabel('상담 질문 입력');
  await input.focus();
  await expect(input).toBeFocused();

  // Send stays disabled until there is something to send.
  const send = page.getByRole('button', { name: '질문 보내기' });
  await expect(send).toBeDisabled();
  await input.fill('내가 신청 가능해?');
  await expect(send).toBeEnabled();

  const chip = page.getByRole('button', { name: '필요한 서류는?' });
  await chip.focus();
  await expect(chip).toBeFocused();

  // Source state carries text, never colour alone.
  await expect(page.getByText('검토본 기준', { exact: true })).toHaveText('검토본 기준');
});

test('입력창과 추천 질문은 대화가 길어져도 화면에 남는다', async ({ page }) => {
  await page.goto(PREVIEW);
  await ask(page, '청년 특별공급 조건을 자세히 설명해줘');
  await ask(page, '필요한 서류는?');
  const viewport = page.viewportSize()!;
  const input = await page.getByLabel('상담 질문 입력').boundingBox();
  expect(input).not.toBeNull();
  // The composer is pinned below the scroller, not pushed off-screen by the transcript.
  expect(input!.y + input!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(input!.y).toBeGreaterThan(0);
});
