// Local browser UX only. Contact POST is intercepted; this never writes Staging data.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let contactPosts = 0;
    await page.route('**/event-api/result-sessions', async route => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, contactClaim: 'b'.repeat(64) } });
    });
    await page.route('**/event-api/consultation-contacts', async route => {
      contactPosts += 1;
      const body = route.request().postDataJSON();
      assert.equal(body.consent, true);
      assert.match(body.token, /^[a-f0-9]{64}$/);
      assert.match(body.claim, /^[a-f0-9]{64}$/);
      assert.equal(body.name, 'QA');
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ deliveryStatus: 'PROVIDER_UNCONFIGURED', smsSent: false }) });
    });
    await page.goto(`${base}/event/samdo?persona=YOUNG_SINGLE`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('district-detail').waitFor({ timeout: 15_000 });
    const detailToggle = page.getByTestId('district-detail-toggle');
    if (await detailToggle.count() && await detailToggle.getAttribute('aria-expanded') !== 'true') await detailToggle.click();
    try { await page.getByTestId('samdo-save-qr').waitFor({ timeout: 8_000 }); }
    catch { const text = await page.locator('body').innerText();
      throw new Error(`result UI unavailable at ${page.url()}: tail=${text.slice(-900)}; toggle=${await detailToggle.count()}; detail=${await page.getByTestId('district-detail').count()}; pageErrors=${errors.slice(0, 2).join('|')}`); }
    await page.getByTestId('samdo-save-qr').click();
    await page.getByTestId('event-contact-capture').waitFor();
    assert.equal(contactPosts, 0);
    await page.getByTestId('event-contact-name').fill('QA');
    await page.getByTestId('event-contact-phone').fill('010-1234-5678');
    await page.getByTestId('event-contact-submit').click();
    assert.equal(contactPosts, 0, 'without consent, the browser must not submit PII');
    await page.getByTestId('event-contact-consent').click();
    await page.getByTestId('event-contact-submit').click();
    await page.getByTestId('event-contact-saved').waitFor();
    assert.equal(contactPosts, 1);
    assert.match(await page.getByTestId('event-contact-saved').innerText(), /SMS 발송은 아직 연결되지/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false, `${viewport.width}px: no horizontal overflow`);
    await page.goto(`${base}/admin/console/contacts?demo=1`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('console-contacts').waitFor();
    assert.match(await page.locator('body').innerText(), /연락처 예시 데이터는 제공하지 않습니다/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
    await page.close();
  }
  console.log('Local contact browser UX: desktop/iPad and mobile consent/QR flow passed (contact POST mocked; no remote DB write)');
} finally { await browser.close(); }
