import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.EVENT_RC_BASE_URL ?? 'http://127.0.0.1:4173';
const outputDir = process.env.SHOT_DIR ?? '.cache/samdo-final-captures';
const cases = [
  { id: 'YOUNG_SINGLE', file: '01-youth', supply: '청년 특별공급', terms: ['19~39세', '미혼', '주택 소유 이력 無(본인)', '월평균소득 140% 이하', '본인 276백만원 이하', '부모 1,035백만원 이하'] },
  { id: 'NEWLYWED_COUPLE', file: '02-newlywed', supply: '생애최초 특별공급', terms: ['주택 소유 이력 無(세대 전원)', '주택청약저축액 600만원 이상', '5년 이상 소득세 납부', '월평균소득 130% 이하'] },
  { id: 'NEWLYWED_ONE_CHILD', file: '03-newborn', supply: '신생아 특별공급', terms: ['2세 미만 자녀 有', '무주택세대구성원', '월평균소득 140% 이하', '맞벌이 200% 이하'] },
  { id: 'FIRST_HOME_COUPLE', file: '04-first-home', supply: '생애최초 특별공급', terms: ['주택 소유 이력 無(세대 전원)', '주택청약저축액 600만원 이상', '5년 이상 소득세 납부', '월평균소득 130% 이하'] },
  { id: 'GENERAL_NO_HOME', file: '05-general', supply: '생애최초 특별공급', terms: ['주택 소유 이력 無(세대 전원)', '주택청약저축액 600만원 이상', '5년 이상 소득세 납부', '월평균소득 130% 이하'] },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const item of cases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/event/samdo?persona=${item.id}`, { waitUntil: 'networkidle' });
    await page.getByTestId('samdo-official-criteria').waitFor({ timeout: 20_000 });
    const hero = await page.getByTestId('samdo-hero-title').innerText();
    if (!hero.includes(item.supply)) throw new Error(`${item.id}: expected ${item.supply}, got ${hero}`);
    const criteria = await page.getByTestId('samdo-official-criteria').innerText();
    for (const title of ['입주자격', '소득기준', '자산기준', '청약통장']) if (!criteria.includes(title)) throw new Error(`${item.id}: missing ${title}`);
    for (const term of item.terms) if (!criteria.includes(term)) throw new Error(`${item.id}: missing official term ${term}`);
    for (const id of ['eligibility', 'income', 'assets', 'subscription']) {
      const status = await page.getByTestId(`samdo-criterion-${id}-status`).innerText();
      if (!['PASS', '확인 필요', '미충족'].includes(status)) throw new Error(`${item.id}: invalid ${id} status ${status}`);
    }
    const brandText = (await page.getByTestId('brand-mark').innerText()).trim();
    const partnerText = (await page.getByTestId('partner-badge').innerText()).trim();
    if (brandText || partnerText) throw new Error(`${item.id}: legacy text brand exposed`);
    const body = await page.locator('body').innerText();
    if (body.includes('함께하는 곳')) throw new Error(`${item.id}: partner caption exposed`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`${item.id}: horizontal overflow ${overflow}`);
    const path = `${outputDir}/${item.file}-desktop.png`;
    await page.screenshot({ path, fullPage: true });
    report.push({ persona: item.id, supply: item.supply, capture: path, statuses: await Promise.all(['eligibility', 'income', 'assets', 'subscription'].map(async id => page.getByTestId(`samdo-criterion-${id}-status`).innerText())) });
    await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify({ status: 'PASS', captures: report }, null, 2)}\n`);
