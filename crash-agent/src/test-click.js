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
  console.log('Navigating...');
  await page.goto('https://bc.game/game/crash', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const betBtn = page.locator('button:has-text("Bet"), div.button:has-text("Bet")').first();
  console.log('Bet button text before click:', (await betBtn.innerText()).replace(/\n/g, ' '));
  await betBtn.click();
  await page.waitForTimeout(2000);

  console.log('Bet button text after click:', (await betBtn.innerText()).replace(/\n/g, ' '));

  const info = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .dialog, .modal, [class*="modal"], [class*="dialog"]')).map(el => el.innerText.trim()).filter(Boolean);
    const overlays = Array.from(document.querySelectorAll('.fixed, [class*="overlay"]')).map(el => el.innerText.trim()).filter(Boolean);
    return { dialogs, overlays: overlays.slice(0, 5) };
  });

  console.log('After click dialogs/overlays:', JSON.stringify(info, null, 2));

  await ctx.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
