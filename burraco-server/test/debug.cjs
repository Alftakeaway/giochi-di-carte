const { chromium } = require('playwright-core');
const EXE = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(BASE + '/');
  console.log('typeof crea =', await page.evaluate(() => typeof crea));
  console.log('typeof open =', await page.evaluate(() => typeof open));
  await page.evaluate(() => crea());
  await page.waitForTimeout(2500);
  console.log('status =', await page.textContent('#status'));
  console.log('json len =', (await page.textContent('#json')).length);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
