import { expect, test } from '@playwright/test';

const ID = 'general-private-standard';

test('admin scoring list, detail and simulator use the explicit test repository', async ({ page }) => {
  const databaseRequests: string[] = [];
  page.on('request', request => {
    if (/supabase\.co|\/rest\/v1\/|\/rpc\//.test(request.url())) databaseRequests.push(request.url());
  });

  await page.goto('/admin/scoring');
  await expect(page.getByRole('heading', { name: '가점 계산식' }).first()).toBeVisible();
  await expect(page.getByText('민영주택 일반공급 가점제', { exact: true })).toBeVisible();
  await expect(page.getByText('검토 중', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/로컬 테스트용 메모리 저장소/)).toBeVisible();

  await page.goto(`/admin/scoring/${ID}`);
  await expect(page.getByRole('heading', { name: '민영주택 일반공급 가점제' })).toBeVisible();
  await expect(page.getByText('버전 1.0.0')).toBeVisible();
  await expect(page.getByText('최근 수정자', { exact: true })).toBeVisible();
  await expect(page.getByText('local-admin@example.test', { exact: true })).toBeVisible();

  await page.goto(`/admin/scoring/${ID}?tab=simulator`);
  await expect(page.getByRole('heading', { name: '값을 넣어 점수 확인하기' })).toBeVisible();
  await page.getByLabel('무주택 기간').fill('180');
  await page.getByLabel('부양가족 수').fill('6');
  await page.getByLabel('청약통장 가입기간').fill('180');
  await expect(page.getByText('84점', { exact: true }).first()).toBeVisible();
  expect(databaseRequests).toEqual([]);
});

test('admin can create a draft and return a review version to draft', async ({ page }) => {
  await page.goto('/admin/scoring/new');
  await page.getByPlaceholder('예: general-private-score').fill('custom-score');
  await page.getByPlaceholder('예: 1.0.0').fill('1.0.0');
  await page.getByPlaceholder('예: 민영주택 일반공급 가점').fill('운영 검증 산식');
  await page.getByPlaceholder('법령 또는 공식 공고 조항').fill('운영 검증 근거');
  await page.getByRole('button', { name: '초안 만들기' }).click();
  await expect(page.getByRole('heading', { name: '운영 검증 산식' })).toBeVisible();
  await expect(page.getByText('초안', { exact: true }).first()).toBeVisible();

  await page.goto(`/admin/scoring/${ID}`);
  await page.getByRole('button', { name: '초안', exact: true }).click();
  await expect(page.getByText('초안', { exact: true }).first()).toBeVisible();
});

test('admin publication toggle is server-snapshot driven and audited', async ({ page }) => {
  await page.goto(`/admin/scoring/${ID}`);
  await page.getByRole('button', { name: '활성', exact: true }).click();
  await expect(page.getByRole('button', { name: '사용자에게 공개하기' })).toBeEnabled();
  await page.getByRole('button', { name: '사용자에게 공개하기' }).click();
  await page.getByRole('button', { name: '공개하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '사용자에게 숨기기' })).toBeVisible();
  await page.getByText('변경 이력', { exact: true }).click();
  await expect(page.getByText('사용자에게 공개', { exact: true })).toBeVisible();
});
