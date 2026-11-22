#!/usr/bin/env node
// Render a local HTML page to PNG using the system Chrome (no T3 browser needed).
//   node src/shoot.js scoreboard.html shots/scoreboard.png
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const page_ = process.argv[2] || 'scoreboard.html';
const out_ = process.argv[3] || 'shots/scoreboard.png';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
  const file = 'file:///' + path.join(ROOT, page_).replace(/\\/g, '/');
  await page.goto(file, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html,body{background:#0b0f14 !important}' });
  await page.waitForTimeout(300);
  const dims = await page.evaluate(() => {
    const w = document.querySelector('.wrap') || document.body;
    const r = w.getBoundingClientRect();
    return { w: Math.ceil(document.body.scrollWidth), h: Math.ceil(r.bottom + 8) };
  });
  await page.setViewportSize({ width: 900, height: Math.ceil(dims.h) });
  await page.waitForTimeout(150);
  const out = path.join(ROOT, out_);
  await page.screenshot({ path: out, fullPage: false });
  await browser.close();
  console.log(`wrote ${out} (${dims.w}x${dims.h})`);
})();
