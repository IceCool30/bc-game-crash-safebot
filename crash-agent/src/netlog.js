// Capture the network traffic the Crash page uses (REST + WebSocket), to find the history feed.
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

  const seen = new Set();
  page.on('request', (r) => {
    const u = r.url();
    if (!/crash|history|round|bet|game|ws|socket|api/i.test(u)) return;
    if (seen.has(u)) return;
    seen.add(u);
    console.log('REQ', r.method(), u.slice(0, 220));
  });

  page.on('websocket', (ws) => {
    console.log('WS OPEN', ws.url().slice(0, 220));
    ws.on('framereceived', (f) => {
      const p = typeof f.payload === 'string' ? f.payload : f.payload.toString('utf8');
      if (/crash|round|multiplier|history|"h"|"m"/i.test(p)) {
        console.log('WS FRAME', p.slice(0, 400));
      }
    });
  });

  await page.goto('https://bc.game/game/crash', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(25000);
  console.log('done waiting');
  await ctx.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
