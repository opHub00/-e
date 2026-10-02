import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const url = process.env.SUPABASE_STAGING_URL!;
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY!;
const serviceKey = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY!;
const ids: string[] = [];
const password = `Staging-${Date.now()}-aA1!`;
const emails = [
  `portfolio-a-${Date.now()}@example.invalid`,
  `portfolio-b-${Date.now()}@example.invalid`,
  `portfolio-flow-${Date.now()}@example.invalid`,
];

async function admin(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers: {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}),
  } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`STAGING_ADMIN_REQUEST_FAILED:${response.status}`);
  return payload;
}

async function login(page: Page, email: string) {
  await page.goto('/auth');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).last().click();
  await expect(page).toHaveURL(/\/home|\/(?:\(tabs\))?$/i, { timeout: 30_000 });
}

async function logout(page: Page) {
  await page.goto('/more');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByText('로그인하고 이어보기', { exact: true })).toBeVisible();
}

async function saveBasicProfile(page: Page, name: string, birthDate: string, waitForV3Write = false) {
  await page.goto('/profile?bundle=BASIC');
  const inputs = page.getByRole('textbox');
  await inputs.first().fill(name);
  await page.getByLabel('생년월일').fill(birthDate.replaceAll('-', ''));
  await page.getByRole('button', { name: '직장인' }).click();
  const persisted = waitForV3Write
    ? page.waitForResponse(response =>
      response.url().includes('/rest/v1/rpc/save_applicant_profile_v3') && response.request().method() === 'POST',
    )
    : null;
  await page.getByRole('button', { name: '입력한 정보 저장하기' }).click();
  await expect(page.getByText('내 청약 프로필', { exact: true })).toBeVisible({ timeout: 30_000 });
  if (persisted) expect((await persisted).ok()).toBe(true);
}

async function firstAssessmentTarget() {
  const sets = await admin('/rest/v1/assessment_rule_sets?select=id,announcement_id&is_active=eq.true&is_public=eq.true&approved_at=not.is.null&limit=1') as Array<
    { id: string; announcement_id: string }
  >;
  if (!sets[0]?.id) throw new Error('STAGING_ASSESSMENT_TARGET_REQUIRED');
  const bindings = await admin(`/rest/v1/announcement_listing_bindings?select=listing_id&announcement_id=eq.${sets[0].announcement_id}&or=(bound_rule_set_id.is.null,bound_rule_set_id.eq.${sets[0].id})&limit=1`) as Array<
    { listing_id: string }
  >;
  return bindings[0]?.listing_id ?? `announcement:${sets[0].announcement_id}`;
}

async function submitAssessment(page: Page, listingId: string) {
  await page.goto(`/assessment?listingId=${encodeURIComponent(listingId)}`);
  await page.getByRole('button', { name: '내 정보 확인하기' }).click();
  await page.getByRole('button', { name: '추가 정보 입력하기' }).click();
  let responsePromise: ReturnType<Page['waitForResponse']> | null = null;
  for (let step = 0; step < 10; step += 1) {
    const submit = page.getByRole('button', { name: '내 조건으로 판정하기' });
    if (await submit.isVisible().catch(() => false)) {
      responsePromise = page.waitForResponse(response => response.url().includes('/functions/v1/user-assessment'));
      await submit.click();
      break;
    }
    const next = page.getByRole('button', { name: '다음', exact: true });
    if (!(await next.isVisible().catch(() => false))) throw new Error('QUESTIONNAIRE_DID_NOT_ADVANCE');
    await next.click();
  }
  await expect(page.getByRole('heading', { name: '내 조건으로 확인한 결과' })).toBeVisible({ timeout: 60_000 });
  const response = responsePromise ? await responsePromise : null;
  if (response && !response.ok()) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`TRUSTED_ASSESSMENT_HTTP_${response.status()}:${String(payload.code ?? 'UNKNOWN')}`);
  }
  await expect(page.getByRole('heading', { name: /신청 가능한 조건이에요|현재 조건으로는 신청하기 어려워요|확인할 정보가 더 있어요/ })).toBeVisible();
}

async function currentResults(userId: string) {
  return admin(`/rest/v1/user_assessment_results?select=id,profile_revision,stale_at,superseded_at&user_id=eq.${userId}&order=calculated_at.desc`) as Promise<
    Array<{ id: string; profile_revision: number; stale_at: string | null; superseded_at: string | null }>
  >;
}

async function profileRevision(userId: string) {
  const rows = await admin(`/rest/v1/applicant_profiles_v3?select=revision&user_id=eq.${userId}`) as Array<{ revision: number }>;
  return rows[0]?.revision ?? 0;
}

async function completeInitialPortfolioProfile(page: Page) {
  await page.goto('/assessment');
  await expect(page).toHaveURL(/profile-onboarding/, { timeout: 30_000 });
  await page.getByLabel('생년월일').fill('19950101');
  await page.getByRole('button', { name: '저장하고 다음' }).click();
  await page.getByRole('radio', { name: '제주' }).click();
  await page.getByRole('radio', { name: '예' }).click();
  await page.getByRole('radio', { name: '미혼' }).click();
  await page.getByRole('radio', { name: '무주택' }).click();
  await expect(page).toHaveURL(/assessment/, { timeout: 30_000 });
  await expect(page.getByText('청약 Portfolio', { exact: true })).toBeVisible();
  const intro = page.getByRole('button', { name: '내 공고 분석 보기' });
  if (await intro.isVisible().catch(() => false)) await intro.click();
  await expect(page.getByText('현재 분석 상태', { exact: true })).toBeVisible({ timeout: 60_000 });
}

async function completeSuggestedProfileFact(page: Page) {
  const action = page.getByRole('button', { name: /입력하기$/ }).first();
  await expect(action).toBeVisible({ timeout: 60_000 });
  await action.click();
  await expect(page).toHaveURL(/profile-onboarding/);
  const textbox = page.getByRole('textbox');
  if (await textbox.count()) {
    const label = await textbox.first().getAttribute('aria-label');
    const value = label?.includes('시작일') || label?.includes('가입일') ? '20200101'
      : label?.includes('금액') || label?.includes('소득') || label?.includes('자산') || label?.includes('가액') ? '1000000'
        : '2';
    await textbox.first().fill(value);
    await page.getByRole('button', { name: '저장하고 계속하기' }).click();
  } else {
    const preferred = page.getByRole('radio', { name: /아니요|예|주택청약종합저축/ }).first();
    await preferred.click();
  }
  await expect(page).toHaveURL(/assessment/, { timeout: 30_000 });
  await expect(page.getByText('현재 분석 상태', { exact: true })).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(async () => {
  if (process.env.WANPANE_STAGING_BROWSER_CONFIRMED !== '1') throw new Error('STAGING_BROWSER_CONFIRMATION_REQUIRED');
  for (const email of emails) {
    const user = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) }) as { id: string };
    ids.push(user.id);
  }
});

test.beforeEach(async ({ page }) => {
  const base = new URL(process.env.WANPANE_STAGING_WEB_URL!);
  const bypass = process.env.WANPANE_VERCEL_PROTECTION_BYPASS;
  if (!bypass) return;
  await page.route(`${base.origin}/**`, route => route.continue({
    headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass },
  }));
});

test.afterAll(async () => {
  for (const id of ids) await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => undefined);
});

test('deployed staging browser keeps profile and trusted results isolated across reload, login and account switch', async ({ page }) => {
  const target = await firstAssessmentTarget();
  await login(page, emails[0]);
  await saveBasicProfile(page, '브라우저사용자A', '1995-01-01');
  await page.reload();
  await page.goto('/profile?bundle=BASIC');
  await expect(page.getByRole('textbox').first()).toHaveValue('브라우저사용자A');
  await expect(page.getByLabel('생년월일')).toHaveValue('1995-01-01');

  await submitAssessment(page, target);
  const first = (await currentResults(ids[0])).find(row => !row.superseded_at);
  expect(first?.id).toBeTruthy();

  await logout(page);
  await login(page, emails[0]);
  await submitAssessment(page, target);
  const reused = (await currentResults(ids[0])).find(row => !row.superseded_at);
  expect(reused?.id).toBe(first?.id);

  await saveBasicProfile(page, '브라우저사용자A', '1994-01-01', true);
  const stale = (await currentResults(ids[0])).find(row => row.id === first?.id);
  expect(stale?.stale_at).toBeTruthy();
  await submitAssessment(page, target);
  const recalculated = (await currentResults(ids[0])).find(row => !row.superseded_at);
  expect(recalculated?.id).not.toBe(first?.id);
  expect(recalculated?.profile_revision).toBeGreaterThan(first?.profile_revision ?? 0);

  await logout(page);
  await login(page, emails[1]);
  await page.goto('/profile?bundle=BASIC');
  await expect(page.getByRole('textbox').first()).not.toHaveValue('브라우저사용자A');
  expect(await currentResults(ids[1])).toEqual([]);
  const draftKeys = await page.evaluate(() => Object.keys(localStorage).filter(key => /questionnaire|assessment.*draft/i.test(key)));
  expect(draftKeys.every(key => key.includes(ids[1]))).toBe(true);
});

test('new member completes onboarding, Portfolio progressive input and result restore', async ({ page }) => {
  await login(page, emails[2]);
  await completeInitialPortfolioProfile(page);
  const initialRevision = await profileRevision(ids[2]);
  expect(initialRevision).toBeGreaterThan(0);
  await expect(page.getByText(/추가 정보 필요|계산 가능|자격조건 미충족|분석 불가/).first()).toBeVisible();

  await completeSuggestedProfileFact(page);
  const nextRevision = await profileRevision(ids[2]);
  expect(nextRevision).toBeGreaterThan(initialRevision);
  await expect.poll(async () => {
    const current = (await currentResults(ids[2])).find(row => !row.superseded_at);
    return current?.profile_revision ?? 0;
  }, { timeout: 60_000 }).toBe(nextRevision);

  await logout(page);
  await login(page, emails[2]);
  await page.goto('/assessment');
  await expect(page.getByText('청약 Portfolio', { exact: true })).toBeVisible();
  await expect(page.getByText('현재 분석 상태', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: '내 공고 분석 보기' })).toHaveCount(0);
});
