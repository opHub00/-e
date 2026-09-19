import { expect, test, type Page } from '@playwright/test';
import { ANNOUNCEMENT_ID, LISTING_ID, PROFILE_STORAGE_KEY, profileSeed, ruleSetPayload } from './fixtures.ts';

const PROVIDER_URL = /(?:generativelanguage\.googleapis|api\.openai|api\.anthropic)/i;

async function stubDatabase(page: Page, options: { rules?: boolean; listingId?: string } = {}) {
  const externalAiRequests: string[] = [];
  page.on('request', request => { if (PROVIDER_URL.test(request.url())) externalAiRequests.push(request.url()); });
  await page.route('**/*.supabase.co/**', async route => {
    const url = route.request().url();
    if (url.includes('/rpc/read_assessment_rule_set')) {
      const payload = { ...ruleSetPayload(), listing_id: options.listingId ?? LISTING_ID };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(options.rules === false ? [] : payload) });
    }
    if (url.includes('/rpc/list_assessment_announcements')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.abort();
  });
  return externalAiRequests;
}

async function openConsultation(page: Page, supply: 'youth' | 'newlywed' | 'firstHome' = 'youth') {
  const externalAiRequests = await stubDatabase(page);
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value),
    [PROFILE_STORAGE_KEY, JSON.stringify(profileSeed(supply))] as const);
  await page.goto(`/consultation?listingId=${encodeURIComponent(LISTING_ID)}&supplyType=${supply}`);
  await expect(page.getByText('삼도이동 1지구 토지임대부 공공분양주택', { exact: true })).toBeVisible();
  await expect(page.getByText('검토본 기준', { exact: true })).toBeVisible();
  return externalAiRequests;
}

async function ask(page: Page, message: string) {
  await page.getByLabel('상담 질문 입력').fill(message);
  await page.getByRole('button', { name: '질문 보내기' }).click();
}

async function completeYouth(page: Page) {
  await ask(page, '나 이거 넣을 수 있어?');
  await ask(page, '1995년 9월 14일에 태어났고 미혼이에요.');
  await ask(page, '39살까지 가능한가요?');
  await ask(page, '제주 산 지 2년이고 통장 2년 됐고 25번 넣었어.');
  await ask(page, '24회 이상이면 몇 점이야?');
  await ask(page, '월소득 2,669,354원, 총자산 100,000,000원, 부모 자산 200,000,000원이에요.');
  await ask(page, '주택청약종합저축이고 특별공급 당첨 이력 없어. 재당첨 제한도 없고 해외체류도 없어. 특례도 없어. 자녀 없어.');
}

test('actual engine starts with the selected draft announcement and no provider request', async ({ page }) => {
  const externalAiRequests = await openConsultation(page);
  await expect(page.getByText(/최종 공고에서 조건이 바뀔 수 있어요/)).toHaveCount(1);
  await expect(page.getByRole('button', { name: '내가 신청 가능해?' })).toBeVisible();
  await expect(page.getByText(/미리보기|preview/i)).toHaveCount(0);
  expect(externalAiRequests).toEqual([]);
});

test('missing information is presented as an answer prompt, not a question-sending chip', async ({ page }) => {
  await openConsultation(page);
  await page.getByRole('button', { name: '내가 신청 가능해?' }).click();
  const prompt = page.getByText(/생년월일을 알려주세요/).last();
  await expect(prompt).toBeVisible();
  await expect(page.getByRole('button', { name: /생년월일을 알려주세요/ })).toHaveCount(0);
  await page.getByRole('button', { name: '답변 입력' }).first().click();
  await expect(page.getByLabel('상담 질문 입력')).toBeFocused();
});

test('multi-turn input reaches deterministic youth priority 9/9 and evidence', async ({ page }) => {
  const externalAiRequests = await openConsultation(page);
  await completeYouth(page);
  await expect(page.getByRole('heading', { name: '신청 가능한 조건이에요' }).last()).toBeVisible();
  await expect(page.getByText('청년 특별공급', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('1단계 우선공급', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('9 / 9점', { exact: true }).last()).toBeVisible();
  const profileFacts = page.getByRole('button', { name: '사용 중인 내 정보 보기' }).last();
  await expect(profileFacts).toHaveAttribute('aria-expanded', 'false');
  await profileFacts.click();
  await expect(page.getByRole('button', { name: '사용 중인 내 정보 접기' }).last()).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('• 현재 주택 상태: 무주택', { exact: true }).last()).toBeVisible();
  await ask(page, '왜 9점이에요? 공고 근거 보여줘');
  const evidence = page.getByRole('button', { name: /공고 근거 \d+건 보기/ }).last();
  await expect(evidence).toBeVisible();
  await evidence.click();
  await expect(page.getByText('본인 월평균소득(원)', { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/근거 ID:/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /공고 근거 [1-5]건 접기/ })).toBeVisible();
  expect(externalAiRequests).toEqual([]);
});

test('explicit age failure returns ineligible without waiting for every remaining field', async ({ page }) => {
  await openConsultation(page);
  await ask(page, '2008년 9월 15일생이고 미혼이에요. 신청 가능해요?');
  await expect(page.getByRole('heading', { name: '현재 조건으로는 신청하기 어려워요' })).toBeVisible();
  await expect(page.getByText(/만 19~39세/).first()).toBeVisible();
  await ask(page, '왜 안돼?');
  await expect(page.getByText(/만 19~39세: 미충족/).last()).toBeVisible();
});

test('first-home score question remains scoreless and does not invent zero points', async ({ page }) => {
  await openConsultation(page, 'firstHome');
  await ask(page, '생애최초는 몇 점이에요?');
  await expect(page.getByText('생애최초 특별공급', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('가점제 아님 · 공급단계/추첨', { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/^0점$|^0 \/ 0점$/)).toHaveCount(0);
});

test('unresolved spouse exception is review-required instead of guessed', async ({ page }) => {
  await openConsultation(page, 'firstHome');
  await ask(page, '배우자가 결혼 전에 집이 있었는데 괜찮아?');
  await expect(page.getByText('공고 기준을 추가로 확인해야 하는 항목', { exact: true })).toBeVisible();
  await expect(page.getByText(/임의 판정하지 않습니다|추가로 대조/)).toBeVisible();
});

test('unknown answer advances and positive overseas duration stays unresolved', async ({ page }) => {
  await openConsultation(page);
  await ask(page, '나 이거 넣을 수 있어?');
  await expect(page.getByText(/생년월일을 알려주세요/).last()).toBeVisible();
  await ask(page, '잘 모르겠어');
  await expect(page.getByText('공고 기준을 추가로 확인해야 하는 항목', { exact: true })).toBeVisible();
  await expect(page.getByText('• 생년월일', { exact: true })).toBeVisible();
  await expect(page.getByText(/청약통장 가입일 또는 공고일 기준 가입기간을 알려주세요/).last()).toBeVisible();
  await ask(page, '해외에 6개월 있었어');
  await expect(page.getByText(/추가로 확인|확인할 정보가 더 있어요/).last()).toBeVisible();
});

test('supply context changes visibly and first-home stays scoreless', async ({ page }) => {
  await openConsultation(page);
  await ask(page, '생애최초는 몇 점이야?');
  await expect(page.getByText('생애최초 특별공급 상담', { exact: true })).toBeVisible();
  await expect(page.getByText(/생애최초 특별공급 기준으로 볼게요/)).toBeVisible();
  await expect(page.getByText('가점제 아님 · 공급단계/추첨', { exact: true }).last()).toBeVisible();
});

test('unsupported announcement has no dead conversation input', async ({ page }) => {
  await stubDatabase(page, { rules: false });
  await page.goto(`/consultation?listingId=announcement%3A${ANNOUNCEMENT_ID}`);
  await expect(page.getByRole('heading', { name: '이 공고의 상담은 준비 중이에요' })).toBeVisible();
  await expect(page.getByLabel('상담 질문 입력')).toHaveCount(0);
});

test('listing detail exposes consultation only when the listing has rules', async ({ page }) => {
  await stubDatabase(page, { listingId: 'mapo-riverline' });
  await page.goto('/discovery/mapo-riverline');
  await expect(page.getByRole('button', { name: '이 공고 AI에게 물어보기' })).toBeVisible();
});
