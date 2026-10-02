import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const url = process.env.SUPABASE_STAGING_URL!;
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY!;
const serviceKey = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY!;
const ids: string[] = [];
const password = `Staging-${Date.now()}-aA1!`;
const emails = [`portfolio-a-${Date.now()}@example.invalid`, `portfolio-b-${Date.now()}@example.invalid`];

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
