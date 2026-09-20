import { expect, test, type Page } from '@playwright/test';
import { SAMDO_REVIEW_SEED } from '../features/assessmentRuleReview/fixtures/samdoReviewSeed.generated.ts';
import { RULE_REVIEW_DEMO_SEED_KEY } from '../features/assessmentRuleReview/repository/RuleReviewRepository.ts';

const ROUTE = '/admin/rule-review';
const rule = (page: Page, label: string) => page.getByRole('button').filter({ hasText: label }).first();

/**
 * The edit form sits well below the fold on a 390px viewport. Playwright cannot hold a
 * scroll position inside react-native-web's ScrollView while its Animated styles keep
 * mutating, so controls down there are not drivable from the harness even though they
 * are tappable in a real browser. The console is desktop-first by design, so the
 * editing scenarios run there and mobile keeps its own layout coverage below.
 */
const desktopOnly = (info: { project: { name: string } }) =>
  test.skip(info.project.name !== 'desktop-1440x900', 'editing scenarios are desktop-first');
const bodyText = async (page: Page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');

/** The console receives the dev repository seed explicitly; any database call would be a defect. */
async function open(page: Page, { start = true } = {}) {
  const db: string[] = [];
  page.on('request', request => { if (/supabase\.co|\/rest\/v1\//.test(request.url())) db.push(request.url()); });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(([key, seed]) => sessionStorage.setItem(key, seed), [RULE_REVIEW_DEMO_SEED_KEY, JSON.stringify(SAMDO_REVIEW_SEED)] as const);
  await page.goto(ROUTE);
  await expect(page.getByRole('heading', { name: '삼도이동 1지구 토지임대부 공공분양주택' })).toBeVisible();
  if (start) await page.getByRole('button', { name: '검수 시작하기' }).click();
  return { db, errors };
}

test('progress is counted by kind, not as a single percentage', async ({ page }) => {
  await open(page, { start: false });
  await expect(page.getByRole('heading', { name: /검수 완료 0 \/ 7/ })).toBeVisible();
  await expect(page.getByText(/남은 검수 7건 · 반드시 확인 \d+건 · 활성화 blocker \d+건/)).toBeVisible();
  await expect(page.getByText(/승인 0 · 수정 후 승인 0 · 보류 0 · 제외 0/)).toBeVisible();
});

test('typed editor edits value and operator, previews the change, then approves', async ({ page }, info) => {
  desktopOnly(info);
  const { errors } = await open(page);
  await rule(page, '본인 소득 140%').click();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await expect(page.getByText('근거를 유효로 표시했어요.')).toBeVisible();
  await page.getByRole('button', { name: '값 고치기' }).click();

  // Money is typed in won and echoed back in 억/만 so a stray zero is visible.
  const value = page.getByLabel('조건 값');
  await value.fill('4000000');
  await expect(page.getByText('400만원', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: '미만' }).click();

  await expect(page.getByRole('heading', { name: '저장하면 이렇게 바뀌어요' })).toBeVisible();
  await expect(page.getByText('5338708', { exact: true })).toBeVisible();
  await expect(page.getByText('4000000', { exact: true })).toBeVisible();
  await expect(page.getByText(/최종 조건: 4000000 미만/)).toBeVisible();

  await page.getByRole('button', { name: '이 수정으로 승인' }).click();
  await expect(page.getByText(/수정한 내용으로 승인했어요/)).toBeVisible();
  await expect(page.getByText(/수정 후 승인됨 · 원본과 \d+개 항목이 달라요/)).toBeVisible();
  await expect(page.getByText(/조건 값: 5338708 → 4000000/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('an unchanged draft cannot be saved as an edit', async ({ page }, info) => {
  desktopOnly(info);
  await open(page);
  await rule(page, '세대 총자산').click();
  await page.getByRole('button', { name: '값 고치기' }).click();
  await expect(page.getByText(/아직 바뀐 항목이 없어요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '이 수정으로 승인' })).toBeDisabled();
});

test('unresolved items need a written note before they can be cleared', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: '공고에서 확정되지 않은 항목' })).toBeVisible();
  await expect(page.getByText(/검토 메모를 적어야 처리할 수 있어요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '확인 완료로 처리' })).toBeDisabled();

  await page.getByLabel(/검토 메모/).first().fill('부동산원 제출본에서 1지구 매핑 확인함');
  await page.getByRole('button', { name: '확인 완료로 처리' }).click();
  await expect(page.getByText(/처리 내용: 부동산원 제출본에서 1지구 매핑 확인함/)).toBeVisible();
  await expect(page.getByText(/미해결 항목을 처리했어요/)).toBeVisible();
});

test('custom conflict resolution requires both a value and an evidence choice', async ({ page }) => {
  await open(page);
  await rule(page, '공고일 제주 거주').click();
  await expect(page.getByText('현재: 선택 없음')).toBeVisible();
  await expect(page.getByRole('button', { name: '직접 입력한 기준으로 확정' })).toBeDisabled();

  await page.getByLabel('직접 입력할 기준').fill('공고일 기준 1년 이상 계속 거주');
  await expect(page.getByRole('button', { name: '직접 입력한 기준으로 확정' })).toBeDisabled();
  await page.getByRole('radio').filter({ hasText: '공고일 제주 거주' }).first().click();
  await page.getByRole('button', { name: '직접 입력한 기준으로 확정' }).click();
  await expect(page.getByText(/현재: 직접 입력 · 공고일 기준 1년 이상 계속 거주/)).toBeVisible();
});

test('evidence can be replaced with another source from the same document', async ({ page }) => {
  await open(page);
  await rule(page, '만 19~39세').click();
  await page.getByRole('button', { name: '다른 근거로 교체' }).click();
  await expect(page.getByText('바꿀 근거 고르기')).toBeVisible();
  await page.getByRole('button', { name: '이 근거로 교체' }).first().click();
  await expect(page.getByText('근거 교체됨').first()).toBeVisible();
  await expect(page.getByText(/교체됨 → /)).toBeVisible();
  // A replaced evidence satisfies the critical-rule guard.
  await expect(page.getByRole('button', { name: '승인', exact: true })).toBeEnabled();
});

test('orphan exception is linked by choosing a base rule, never by typing an id', async ({ page }) => {
  await open(page);
  await rule(page, '해외체류').click();
  await expect(page.getByText('연결된 기본 규칙 없음').first()).toBeVisible();
  await expect(page.getByText('어떤 기본 규칙을 한정하나요?')).toBeVisible();
  // Relation buttons stay disabled until a base rule is picked.
  await expect(page.getByRole('button', { name: '이 규칙을 제한함' })).toBeDisabled();
  await page.getByRole('radio').filter({ hasText: '공고일 제주 거주' }).first().click();
  await page.getByRole('button', { name: '이 규칙을 제한함' }).click();
  await expect(page.getByText('기본 규칙에 연결됨').first()).toBeVisible();
});

test('a concurrent save is explained instead of overwriting the reviewer', async ({ page }, info) => {
  desktopOnly(info);
  await open(page);
  await rule(page, '만 19~39세').click();
  await page.getByRole('button', { name: '값 고치기' }).click();
  await page.getByLabel(/이상 기준 값/).fill('21');

  await page.getByRole('button', { name: '다른 검수자가 먼저 저장한 상황' }).click();
  await expect(page.getByText(/다른 검수자가 먼저 수정했습니다/)).toBeVisible();
  await expect(page.getByText(/입력하던 내용은 그대로 두었으니/)).toBeVisible();
  // The typed value survives the refused save.
  await expect(page.getByLabel(/이상 기준 값/)).toHaveValue('21');
});

test('leaving a dirty edit asks before discarding it', async ({ page }, info) => {
  desktopOnly(info);
  await open(page);
  await rule(page, '만 19~39세').click();
  await page.getByRole('button', { name: '값 고치기' }).click();
  await page.getByLabel(/이상 기준 값/).fill('22');

  await rule(page, '세대 총자산').click();
  await expect(page.getByRole('heading', { name: '저장되지 않은 변경이 있어요' })).toBeVisible();
  await page.getByRole('button', { name: '여기 남기' }).click();
  await expect(page.getByRole('heading', { name: '만 19~39세' })).toBeVisible();

  await rule(page, '세대 총자산').click();
  await page.getByRole('button', { name: '변경 버리고 이동' }).click();
  await expect(page.getByRole('heading', { name: '세대 총자산 362백만원 이하' })).toBeVisible();
});

test('a changed announcement invalidates the review instead of looking approved', async ({ page }) => {
  await open(page);
  await rule(page, '만 19~39세').click();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await expect(page.getByText(/^승인했어요\.$/)).toBeVisible();

  await page.getByRole('button', { name: '공고문이 바뀐 상황' }).click();
  await expect(page.getByRole('heading', { name: '공고문이 변경되어 기존 검수를 다시 확인해야 합니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /활성화할 수 없음 · 재검수 필요/ })).toBeVisible();
  // Decisions are locked until a new rule version is reviewed.
  await rule(page, '세대 총자산').click();
  // The unresolved row also has a 보류 control, so the detail panel's own one is taken last.
  await expect(page.getByRole('button', { name: '보류', exact: true }).last()).toBeDisabled();
});

test('a complete review reaches activation eligible with the button still disabled', async ({ page }, info) => {
  desktopOnly(info);
  const { db, errors } = await open(page);

  await page.getByLabel(/검토 메모/).first().fill('부동산원 제출본에서 1지구 매핑 확인함');
  await page.getByRole('button', { name: '확인 완료로 처리' }).click();

  await rule(page, '공고일 제주 거주').click();
  await page.getByRole('button', { name: '이 근거 채택' }).first().click();

  await rule(page, '해외체류').click();
  await page.getByRole('radio').filter({ hasText: '공고일 제주 거주' }).first().click();
  await page.getByRole('button', { name: '이 규칙을 제한함' }).click();

  for (const label of ['만 19~39세', '본인 소득 140%', '세대 총자산', '공고일 제주 거주', '해외체류', '특별공급 제한 없음']) {
    await rule(page, label).click();
    const valid = page.getByRole('button', { name: '유효', exact: true }).first();
    if (await valid.count()) await valid.click();
    await page.getByRole('button', { name: '승인', exact: true }).click();
  }

  // This rule carries SEMANTIC_EVIDENCE_MISMATCH, so it only clears through an edit.
  await rule(page, '선납 포함 저축액').click();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await expect(page.getByText('근거를 유효로 표시했어요.')).toBeVisible();
  await page.getByRole('button', { name: '값 고치기' }).click();
  await page.getByLabel('조건 값').fill('6500000');
  await page.getByRole('button', { name: '이 수정으로 승인' }).click();

  await expect(page.getByRole('heading', { name: '활성화 가능' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /검수 완료 7 \/ 7/ })).toBeVisible();
  await expect(page.getByText('운영 DB 연결 후 활성화할 수 있어요.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'rule version 활성화' })).toBeDisabled();
  expect(await bodyText(page)).not.toContain('남은 차단 사유');
  expect(db).toEqual([]);
  expect(errors).toEqual([]);
});

test('keyboard reaches the review controls and no single key approves', async ({ page }) => {
  await open(page);
  await rule(page, '만 19~39세').click();
  const hold = page.getByRole('button', { name: '보류', exact: true }).last();
  await hold.focus();
  await expect(hold).toBeFocused();

  // A bare keypress on the page must not decide anything.
  const before = await bodyText(page);
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  expect(await bodyText(page)).toContain('검수 대기');
  expect(before.includes('검수 완료 0 / 7')).toBe(true);
});

test('no horizontal overflow while editing', async ({ page }, info) => {
  desktopOnly(info);
  await open(page);
  await rule(page, '만 19~39세').click();
  await page.getByRole('button', { name: '값 고치기' }).click();
  const wide = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll('*')].map(el => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > limit + 1)
      .map(({ el, box }) => `${el.tagName} ${Math.round(box.right)}>${limit}`).slice(0, 4);
  });
  expect(wide).toEqual([]);
  await page.screenshot({ path: `e2e/.artifacts/screenshots/rule-review-edit-${info.project.name}.png` });
});

test('mobile stacks the console without breaking or overflowing', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390x844', 'mobile layout only');
  await open(page);
  await rule(page, '만 19~39세').click();

  // Source text sits above the AI reading rather than beside it.
  const order = await page.evaluate(() => {
    const find = (text: string) => [...document.querySelectorAll('[role="heading"], div[dir="auto"]')]
      .find(el => (el.textContent ?? '').trim() === text)?.getBoundingClientRect();
    const source = find('공고 원문');
    const reading = find('AI 원본 candidate');
    return source && reading ? { stacked: reading.top > source.top, sameColumn: Math.abs(reading.left - source.left) < 4 } : null;
  });
  expect(order?.stacked).toBe(true);
  expect(order?.sameColumn).toBe(true);

  const wide = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll('*')].map(el => el.getBoundingClientRect())
      .filter(box => box.width > 0 && box.right > limit + 1).length;
  });
  expect(wide).toBe(0);
  await page.screenshot({ path: `e2e/.artifacts/screenshots/rule-review-mobile-${info.project.name}.png` });
});
