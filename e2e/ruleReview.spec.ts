import { expect, test, type Page } from '@playwright/test';

const ROUTE = '/admin/rule-review';

/** The console runs the review service in memory; any database call would be a defect. */
async function open(page: Page) {
  const db: string[] = [];
  page.on('request', request => { if (/supabase\.co|\/rest\/v1\//.test(request.url())) db.push(request.url()); });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(ROUTE);
  await expect(page.getByRole('heading', { name: '삼도이동 1지구 토지임대부 공공분양주택' })).toBeVisible();
  return { db, errors };
}
const rule = (page: Page, label: string) => page.getByRole('button').filter({ hasText: label }).first();
const start = (page: Page) => page.getByRole('button', { name: '검수 시작하기' }).click();

test('dashboard leads with risk counts and the activation gate, with no database call', async ({ page }) => {
  const { db, errors } = await open(page);
  for (const label of ['critical 검수 대기', '기준 충돌', '연결 안 된 예외', '미해결 항목', '검수 필요', '승인 완료']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: '활성화할 수 없음' })).toBeVisible();
  await expect(page.getByText(/\[REVIEW_NOT_STARTED\]/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'rule version 활성화' })).toBeDisabled();
  expect(db).toEqual([]);
  expect(errors).toEqual([]);
});

test('rules are grouped by supply type and priority is carried by text', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: /^청년 · \d+건$/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^특례 · \d+건$/ })).toBeVisible();
  await expect(page.getByText('반드시 확인').first()).toBeVisible();
});

test('filter narrows the list to blocking rules only', async ({ page }) => {
  await open(page);
  const before = await page.getByText('반드시 확인', { exact: true }).count();
  await page.getByRole('button', { name: '반드시 확인만 보기' }).click();
  await expect(page.getByRole('button', { name: '전체 rule 보기' })).toBeVisible();
  // The bulk button also carries the words 근거 명확, so only list badges are counted.
  await expect(page.getByText('근거 명확', { exact: true })).toHaveCount(0);
  expect(await page.getByText('반드시 확인', { exact: true }).count()).toBeLessThanOrEqual(before);
});

test('critical rule cannot be approved until its evidence is confirmed, with a stated reason', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '만 19~39세').click();
  await expect(page.getByRole('heading', { name: '지금은 승인할 수 없어요' })).toBeVisible();
  await expect(page.getByText(/critical 규칙은 유효한 근거를/)).toBeVisible();
  await expect(page.getByRole('button', { name: '승인', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '승인', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await expect(page.getByText('승인', { exact: true }).first()).toBeVisible();
});

test('a rule carrying a safety blocker states why approval is refused', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '선납 포함 저축액').click();
  await expect(page.getByText(/인용한 근거가 이 규칙의 의미를 뒷받침하지 않아요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '승인', exact: true })).toBeDisabled();
});

test('approve with edit records a readable diff against the immutable original', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '세대 총자산').click();
  await expect(page.getByText('읽기 전용 · 추출 당시 기록')).toBeVisible();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await page.getByRole('button', { name: '수정 후 승인' }).click();
  await expect(page.getByText(/수정 후 승인됨 · 원본과 \d+개 항목이 달라요/)).toBeVisible();
  await expect(page.getByText(/^scope: /)).toBeVisible();
});

test('hold and reject are always available and change the rule state', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '해외체류').click();
  await page.getByRole('button', { name: '보류' }).click();
  await expect(page.getByText('보류', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '제외' }).click();
  await expect(page.getByText('제외', { exact: true }).first()).toBeVisible();
});

test('conflict shows both candidates with no default selection', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '공고일 제주 거주').click();
  await expect(page.getByRole('heading', { name: /기준 충돌 · 지역우선 기준일/ })).toBeVisible();
  await expect(page.getByText('현재: 선택 없음')).toBeVisible();
  await expect(page.getByRole('button', { name: '이 근거 채택' })).toHaveCount(2);
  await page.getByRole('button', { name: '이 근거 채택' }).first().click();
  await expect(page.getByText(/현재: .* 채택/)).toBeVisible();
});

test('orphan exception is named and can be linked with a relation type', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '해외체류').click();
  await expect(page.getByText('연결된 기본 규칙 없음').first()).toBeVisible();
  await page.getByRole('button', { name: /이 규칙을 제한함/ }).click();
  await expect(page.getByText('기본 규칙에 연결됨').first()).toBeVisible();
});

test('evidence review states are shown and drive the approval guard', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '만 19~39세').click();
  await expect(page.getByText('근거 확인 필요').first()).toBeVisible();
  await page.getByRole('button', { name: '무효', exact: true }).first().click();
  await expect(page.getByText('근거 무효').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '승인', exact: true })).toBeDisabled();
});

test('bulk approval is refused while conflicts or critical rules remain, and says so', async ({ page }) => {
  await open(page); await start(page);
  await expect(page.getByText(/한 번에 승인할 수 없어요/)).toBeVisible();
  await expect(page.getByRole('button', { name: /한 번에 승인$/ })).toBeDisabled();
});

test('review history reads as lines, never a JSON dump', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '해외체류').click();
  await page.getByRole('button', { name: '보류' }).click();
  const toggle = page.getByRole('button', { name: /검수 이력 \d+건 보기/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByText(/보류 · 관리자 검수 콘솔에서 확인/)).toBeVisible();
  await expect(page.getByText(/"originalCandidateHash"/)).toHaveCount(0);
});

test('no horizontal overflow at either viewport', async ({ page }, info) => {
  await open(page); await start(page);
  await rule(page, '만 19~39세').click();
  const wide = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll('*')].map(el => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > limit + 1)
      .map(({ el, box }) => `${el.tagName} ${Math.round(box.right)}>${limit}`).slice(0, 4);
  });
  expect(wide).toEqual([]);
  await page.screenshot({ path: `e2e/.artifacts/screenshots/rule-review-${info.project.name}.png` });
});

test('accessibility: headings, named controls, disclosure state and keyboard focus', async ({ page }) => {
  await open(page); await start(page);
  await rule(page, '만 19~39세').click();
  const a11y = await page.evaluate(() => ({
    headings: document.querySelectorAll('[role="heading"]').length,
    unnamed: [...document.querySelectorAll('[role="button"]')].filter(b => !(b.textContent ?? '').trim() && !b.getAttribute('aria-label')).length,
    expandables: [...document.querySelectorAll('[role="button"]')].filter(b => b.hasAttribute('aria-expanded')).length,
  }));
  expect(a11y.headings).toBeGreaterThan(4);
  expect(a11y.unnamed).toBe(0);
  expect(a11y.expandables).toBeGreaterThan(0);
  const hold = page.getByRole('button', { name: '보류' });
  await hold.focus();
  await expect(hold).toBeFocused();
});

test('user routes are unaffected by the admin console', async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByText(/청약 준비도/).first()).toBeVisible();
  // Nothing in user navigation points at the admin console.
  await expect(page.getByRole('button', { name: /검수|admin/i })).toHaveCount(0);
});
