// Find the Crash game card, inspect it, click it, and report where it goes.
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const userDataDir = path.resolve(__dirname, '..', '.profile');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 1000 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://bc.game', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(12000);

  // Inspect every element whose text is exactly "Crash"
  const info = await page.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const t = (el.innerText || '').trim();
      if (t === 'Crash' && el.children.length === 0) {
        const chain = [];
        let cur = el;
        for (let i = 0; i < 6 && cur; i++) {
          chain.push({
            tag: cur.tagName,
            cls: (cur.className && cur.className.toString().slice(0, 80)) || '',
            href: cur.getAttribute && cur.getAttribute('href'),
            data: cur.getAttribute && cur.getAttribute('data-url'),
            id: cur.id || '',
          });
          cur = cur.parentElement;
        }
        out.push(chain);
      }
    }
    return out;
  });
  console.log('CRASH ELEMENT CHAINS:');
  console.log(JSON.stringify(info.slice(0, 3), null, 2));

  // Try clicking the first one
  try {
    const el = page.getByText('Crash', { exact: true }).first();
    await el.click({ timeout: 10000 });
    await page.waitForTimeout(8000);
    console.log('AFTER CLICK URL:', page.url());
    const text = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log('--- TEXT AFTER CLICK ---');
    console.log(text);
    await page.screenshot({ path: path.resolve(__dirname, '..', 'shots', 'crash.png') });
    console.log('screenshot: shots/crash.png');
  } catch (e) {
    console.log('CLICK FAILED:', e.message.slice(0, 300));
  }

  await ctx.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
