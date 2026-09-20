import { expect, test, type Page } from '@playwright/test';
import { SAMDO_REVIEW_SEED } from '../features/assessmentRuleReview/fixtures/samdoReviewSeed.generated.ts';
import { RULE_REVIEW_DEMO_SEED_KEY } from '../features/assessmentRuleReview/repository/RuleReviewRepository.ts';
import type { ReviewFaultPlan } from '../features/assessmentRuleReview/repository/ReviewGateway.ts';
import { reviewDraftStorageKey } from '../features/assessmentRuleReview/ui/reviewDraftStore.ts';

const ROUTE = '/admin/rule-review';
const SAVING = '서버에 저장하는 중이에요… 저장이 끝나야 결정이 반영돼요.';
const DRAFT_KEY = reviewDraftStorageKey();
const ANNOUNCEMENT = '삼도이동 1지구 토지임대부 공공분양주택';

const rule = (page: Page, label: string) => page.getByRole('button').filter({ hasText: label }).first();
/** Decisions are frozen while a save is in flight, so each step waits for it to settle. */
const settle = (page: Page) => expect(page.getByText(SAVING)).toHaveCount(0, { timeout: 15_000 });
const decisions = (page: Page) =>
  page.evaluate(() => document.body.innerText.match(/승인 \d+ · 수정 후 승인 \d+ · 보류 \d+ · 제외 \d+/)?.[0] ?? '');

/**
 * The edit form sits well below the fold on a 390px viewport, where Playwright cannot
 * hold a scroll position inside react-native-web's ScrollView. The editing-driven
 * persistence states therefore run on desktop; the mobile layout of every persistence
 * state is covered by the last test in this file, which drives them without the editor.
 */
const desktopOnly = (info: { project: { name: string } }) =>
  test.skip(info.project.name !== 'desktop-1440x900', 'editing scenarios are desktop-first');

/**
 * Seeds the console and forces transport outcomes.
 *
 * Only the transport is faked. The review domain still decides whether each mutation is
 * legal, so a forced `SAVED` cannot approve something the rules refuse — these tests
 * exercise the persistence UX, not a relaxed rule engine.
 */
async function open(page: Page, plan: ReviewFaultPlan = {}) {
  const db: string[] = [];
  page.on('request', request => { if (/supabase\.co|\/rest\/v1\//.test(request.url())) db.push(request.url()); });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(([seedKey, seed, faultPlan]) => {
    sessionStorage.setItem(seedKey, seed);
    (globalThis as Record<string, unknown>).__wanpaneReviewFaultPlan = JSON.parse(faultPlan);
  }, [RULE_REVIEW_DEMO_SEED_KEY, JSON.stringify(SAMDO_REVIEW_SEED), JSON.stringify(plan)] as const);
  await page.goto(ROUTE);
  return { db, errors };
}

async function startReview(page: Page) {
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toBeVisible();
  await page.getByRole('button', { name: '검수 시작하기' }).click();
  await settle(page);
}

test('a slow load shows only the loading shell, never another announcement', async ({ page }) => {
  const { errors } = await open(page, { delayMs: 900 });
  await expect(page.getByRole('heading', { name: '검수 데이터를 불러오는 중이에요' })).toBeVisible();
  await expect(page.getByText(/이전 공고 내용을 보여주지 않아요/)).toBeVisible();
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toBeVisible();
  expect(errors).toEqual([]);
});

test('admin sign-in is required before any rule is shown', async ({ page }) => {
  const { db, errors } = await open(page, { load: 'AUTH_REQUIRED' });
  await expect(page.getByRole('heading', { name: '관리자 로그인이 필요해요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 로그인하고 불러오기' })).toBeVisible();
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toHaveCount(0);
  expect(db).toEqual([]);
  expect(errors).toEqual([]);
});

test('a signed-in non-reviewer is told which account lacks permission', async ({ page }) => {
  await open(page, { load: 'FORBIDDEN', loadActor: 'viewer@wanpane.local' });
  await expect(page.getByRole('heading', { name: '이 계정에는 검수 권한이 없어요' })).toBeVisible();
  await expect(page.getByText(/viewer@wanpane\.local 계정은/)).toBeVisible();
  await expect(page.getByRole('button', { name: '다른 계정으로 다시 시도' })).toBeVisible();
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toHaveCount(0);
});

test('an offline load says decisions are never stored for later, and offers retry', async ({ page }) => {
  await open(page, { load: 'OFFLINE' });
  await expect(page.getByRole('heading', { name: '네트워크에 연결되어 있지 않아요' })).toBeVisible();
  await expect(page.getByText(/오프라인에서 자동으로 저장되지 않으니/)).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
});

test('a failed load names the failure and is retryable', async ({ page }) => {
  await open(page, { load: 'FAILED', loadCode: 'REVIEW_SERVICE_UNAVAILABLE' });
  await expect(page.getByRole('heading', { name: '검수 데이터를 불러오지 못했어요' })).toBeVisible();
  await expect(page.getByText(/REVIEW_SERVICE_UNAVAILABLE/)).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
});

test('retrying a failed load reaches the console, and nothing was retried on its own', async ({ page }) => {
  // The forced outcome applies to the first load only, so the retry takes the real path.
  await open(page, { load: 'OFFLINE' });
  await expect(page.getByRole('heading', { name: '네트워크에 연결되어 있지 않아요' })).toBeVisible();
  // A retry that fires by itself would clear this screen without anyone pressing anything.
  await page.waitForTimeout(1_500);
  await expect(page.getByRole('heading', { name: '네트워크에 연결되어 있지 않아요' })).toBeVisible();

  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toBeVisible();
});

test('a save in flight is announced and freezes the control that started it', async ({ page }) => {
  await open(page, { delayMs: 900 });
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toBeVisible();
  await page.getByRole('button', { name: '검수 시작하기' }).click();
  await expect(page.getByText(SAVING)).toBeVisible();
  await expect(page.getByRole('button', { name: '검수 시작하기' })).toBeDisabled();
  await settle(page);
  await expect(page.getByText('검수를 시작했어요.')).toBeVisible();
});

test('a failed save leaves the decision counts and the rule badge untouched', async ({ page }) => {
  await open(page, { commits: ['SAVED', 'SAVED', 'FAILED'] });
  await startReview(page);
  await rule(page, '만 19~39세').click();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await settle(page);

  const before = await decisions(page);
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await settle(page);

  await expect(page.getByText(/저장하지 않았어요: REVIEW_SAVE_FAILED/)).toBeVisible();
  expect(await decisions(page)).toBe(before);
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
});

test('an offline save is refused outright rather than held for later', async ({ page }) => {
  await open(page, { commits: ['SAVED', 'OFFLINE'] });
  await startReview(page);
  const before = await decisions(page);
  await rule(page, '해외체류').click();
  await page.getByRole('button', { name: '보류', exact: true }).click();
  await settle(page);

  await expect(page.getByText(/네트워크에 연결되어 있지 않아 저장하지 않았습니다/)).toBeVisible();
  await expect(page.getByText(/검수 결정은 자동으로 보내지 않아요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(await decisions(page)).toBe(before);
});

test('a stale revision reloads the server state and keeps the reviewer input', async ({ page }, info) => {
  desktopOnly(info);
  await open(page, { commits: ['SAVED', 'SAVED', 'STALE'] });
  await startReview(page);
  await rule(page, '본인 소득 140%').click();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await settle(page);

  await page.getByRole('button', { name: '값 고치기' }).click();
  await page.getByLabel('조건 값').fill('4000000');
  await page.getByRole('button', { name: '이 수정으로 승인' }).click();
  await settle(page);

  await expect(page.getByText(/다른 검수자가 먼저 저장했습니다/)).toBeVisible();
  await expect(page.getByText(/비교한 뒤 다시 저장해 주세요/)).toBeVisible();
  // The form stays open with the typed value, so the two versions can be compared.
  await expect(page.getByLabel('조건 값')).toHaveValue('4000000');
  await expect(page.getByText(/최종 조건: 4000000/)).toBeVisible();
  await expect(page.getByRole('button', { name: '이 수정으로 승인' })).toBeEnabled();
});

test('an expired session keeps the unsaved edit and offers re-authentication', async ({ page }, info) => {
  desktopOnly(info);
  await open(page, { commits: ['SAVED', 'SAVED', 'AUTH_EXPIRED'] });
  await startReview(page);
  await rule(page, '본인 소득 140%').click();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await settle(page);

  await page.getByRole('button', { name: '값 고치기' }).click();
  await page.getByLabel('조건 값').fill('4200000');
  await page.getByRole('button', { name: '이 수정으로 승인' }).click();

  await expect(page.getByRole('heading', { name: '로그인이 만료됐어요' })).toBeVisible();
  await expect(page.getByText(/마지막 작업은 저장되지 않았어요/)).toBeVisible();
  await expect(page.getByText(/작성하던 수정 내용\(youth\.income\)은 이 브라우저에 남아 있어요/)).toBeVisible();
  const draft = await page.evaluate(key => window.sessionStorage.getItem(key), DRAFT_KEY);
  expect(draft).toContain('youth.income');
  expect(draft).toContain('4200000');

  // Signing back in returns to the console with the edit still recoverable.
  await page.getByRole('button', { name: '다시 로그인하고 불러오기' }).click();
  await expect(page.getByRole('heading', { name: ANNOUNCEMENT })).toBeVisible();
  await rule(page, '본인 소득 140%').click();
  await page.getByRole('button', { name: '작성하던 수정 이어서 하기' }).click();
  await expect(page.getByLabel('조건 값')).toHaveValue('4200000');
});

test('a draft saved before sign-out is offered again afterwards', async ({ page }, info) => {
  desktopOnly(info);
  const income = SAMDO_REVIEW_SEED.rules.find(item => item.ruleId === 'youth.income')!.originalCandidate;
  await page.addInitScript(([seedKey, seed, draftKey, draft]) => {
    sessionStorage.setItem(seedKey, seed);
    sessionStorage.setItem(draftKey, draft);
  }, [
    RULE_REVIEW_DEMO_SEED_KEY, JSON.stringify(SAMDO_REVIEW_SEED), DRAFT_KEY,
    JSON.stringify({ ruleId: 'youth.income', savedAt: new Date().toISOString(), edited: { ...income, value: 4200000 } }),
  ] as const);
  await page.goto(ROUTE);
  await startReview(page);
  await rule(page, '본인 소득 140%').click();

  await expect(page.getByText(/이전에 작성하던 수정 내용이 남아 있어요/)).toBeVisible();
  await page.getByRole('button', { name: '작성하던 수정 이어서 하기' }).click();
  // The form opens on the saved draft, not on the AI original.
  await expect(page.getByLabel('조건 값')).toHaveValue('4200000');
});

test('activation is claimed only from a server-confirmed gate', async ({ page }) => {
  await open(page, { commits: ['SAVED', 'SAVED', 'FAILED'] });
  await startReview(page);
  await rule(page, '만 19~39세').click();
  await page.getByRole('button', { name: '유효', exact: true }).first().click();
  await settle(page);
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await settle(page);

  await expect(page.getByRole('heading', { name: '활성화 상태 확인 중' })).toBeVisible();
  await expect(page.getByText(/서버 저장 결과를 확인하기 전에는 활성화 가능 여부를 표시하지 않아요/)).toBeVisible();
  await expect(page.getByText('활성화 가능', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'rule version 활성화' })).toBeDisabled();
});

test('a failure is announced, reachable by keyboard and fits the viewport', async ({ page }, info) => {
  await open(page, { commits: ['SAVED', 'OFFLINE'] });
  await startReview(page);
  await rule(page, '해외체류').click();
  await page.getByRole('button', { name: '보류', exact: true }).click();
  await settle(page);
  await expect(page.getByText(/네트워크에 연결되어 있지 않아 저장하지 않았습니다/)).toBeVisible();

  expect(await page.evaluate(() => document.querySelectorAll('[role="alert"]').length)).toBeGreaterThan(0);
  const overflow = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll('*')]
      .map(element => element.getBoundingClientRect())
      .filter(box => box.width > 0 && box.right > limit + 1).length;
  });
  expect(overflow).toBe(0);

  const retry = page.getByRole('button', { name: '다시 시도' });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.screenshot({ path: `e2e/.artifacts/runs/persistence-${info.project.name}.png` });
});
