// Reconnaissance: open BC.Game in a real (headed) Chrome profile, let the SPA render,
// and dump what we can see. Persistent profile so a manual login survives.
const { chromium } = require('playwright-core');
const path = require('path');

const URL = process.argv[2] || 'https://bc.game';
const HEADLESS = process.env.HEADLESS === '1';

(async () => {
  const userDataDir = path.resolve(__dirname, '..', '.profile');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: HEADLESS,
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });

  const page = ctx.pages()[0] || (await ctx.newPage());

  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300));
  });
  page.on('requestfailed', (r) => {
    console.log('[reqfailed]', r.url().slice(0, 160), r.failure() && r.failure().errorText);
  });

  console.log('navigating to', URL);
  const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  console.log('HTTP status:', resp && resp.status());
  await page.waitForTimeout(15000);
  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());

  const text = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 5000) : ''));
  console.log('--- BODY TEXT ---');
  console.log(text || '(empty)');

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .map((a) => ({ text: (a.innerText || '').trim().slice(0, 60), href: a.href }))
      .filter((x) => /crash|trenball/i.test(x.text + x.href))
  );
  console.log('--- CRASH LINKS ---');
  console.log(JSON.stringify(links.slice(0, 20), null, 2));

  await page.screenshot({ path: path.resolve(__dirname, '..', 'shots', 'home2.png') });
  console.log('screenshot saved');

  if (HEADLESS) await ctx.close();
  else console.log('headed browser left open; close it manually when done');
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
