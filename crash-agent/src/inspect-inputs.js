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
  await page.goto('https://bc.game/game/crash', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const inputDetails = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map((inp, idx) => {
      let parentText = '';
      let cur = inp.parentElement;
      for (let i = 0; i < 4 && cur; i++) {
        if (cur.innerText && cur.innerText.length < 100) {
          parentText = cur.innerText.replace(/\n/g, ' ');
          break;
        }
        cur = cur.parentElement;
      }
      return {
        idx,
        type: inp.type,
        value: inp.value,
        id: inp.id,
        className: inp.className,
        parentText
      };
    });
  });

  console.log('INPUT DETAILS:', JSON.stringify(inputDetails, null, 2));
  await ctx.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
