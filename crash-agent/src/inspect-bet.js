// Dump the panel controls so we can build reliable selectors.
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const userDataDir = path.resolve(__dirname, '..', '.profile-inspect');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 1000 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://bc.game/game/crash', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(15000);

  console.log('iframes:', page.frames().map((f) => f.url().slice(0, 120)));

  const controls = await page.evaluate(() => {
    const pick = (el) => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder'),
      value: el.value,
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      text: (el.innerText || '').trim().slice(0, 40),
      cls: (el.className && el.className.toString().slice(0, 100)) || '',
      id: el.id || '',
      name: el.getAttribute('name'),
      dataTest: el.getAttribute('data-testid') || el.getAttribute('data-test'),
    });
    const inputs = Array.from(document.querySelectorAll('input, textarea')).map(pick);
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).map(pick);
    return { inputs, buttons };
  });

  console.log('--- INPUTS ---');
  console.log(JSON.stringify(controls.inputs, null, 2));
  console.log('--- BUTTONS ---');
  console.log(JSON.stringify(controls.buttons.slice(0, 40), null, 2));

  await page.screenshot({ path: path.resolve(__dirname, '..', 'shots', 'betpanel.png') });
  await ctx.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
