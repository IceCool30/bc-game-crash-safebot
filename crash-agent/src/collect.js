// Round collector: watches the BC.Game Crash page and appends every new round to JSONL.
// Works without login (spectator mode) — no orders are placed.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const config = require(path.join(ROOT, 'config.json'));
const DATA = path.resolve(ROOT, config.collect.outFile);
fs.mkdirSync(path.dirname(DATA), { recursive: true });

const RE = /(\d{6,})\s*\n\s*([\d.]+)\s*[×x]/g;

function parseRounds(text) {
  const out = [];
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(text))) {
    const round = Number(m[1]);
    const mult = Number(m[2]);
    if (Number.isFinite(round) && Number.isFinite(mult)) out.push({ round, mult });
  }
  if (!out.length) return out;
  // The history strip is a short contiguous run ending at the newest round.
  // Drop stray numbers elsewhere on the page (tickers, counters, etc.).
  const maxRound = Math.max(...out.map((r) => r.round));
  return out
    .filter((r) => r.round >= maxRound - 50 && r.round <= maxRound + 5)
    .sort((a, b) => a.round - b.round);
}

function loadSeen() {
  const seen = new Set();
  if (!fs.existsSync(DATA)) return seen;
  for (const line of fs.readFileSync(DATA, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      seen.add(JSON.parse(line).round);
    } catch {}
  }
  return seen;
}

(async () => {
  const HEADED = process.env.HEADED === '1';
  const userDataDir = path.resolve(ROOT, HEADED ? '.profile-headed' : config.site.userDataDir);
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: HEADED ? false : config.site.headless,
    viewport: config.site.viewport,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  console.log('opening', config.site.crashUrl);
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await page.goto(config.site.crashUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      break;
    } catch (e) {
      console.log(`goto attempt ${attempt} failed: ${e.message.slice(0, 100)}`);
      if (attempt === 6) throw e;
      await page.waitForTimeout(5000 * attempt);
    }
  }
  await page.waitForTimeout(12000);

  const seen = loadSeen();
  console.log('already have', seen.size, 'rounds');

  const minutes = Number(process.argv[2] || config.collect.durationMinutes);
  console.log('collecting for', minutes, 'minute(s)');
  const deadline = Date.now() + minutes * 60 * 1000;
  let lastRound = 0;

  while (Date.now() < deadline) {
    try {
      const text = await page.evaluate(() => document.body.innerText);
      const rounds = parseRounds(text);
      for (const r of rounds) {
        if (seen.has(r.round)) continue;
        seen.add(r.round);
        const rec = { round: r.round, mult: r.mult, ts: new Date().toISOString() };
        fs.appendFileSync(DATA, JSON.stringify(rec) + '\n');
        console.log('NEW', rec.round, rec.mult + 'x', rec.ts);
      }
      if (rounds.length && rounds[0].round !== lastRound) {
        lastRound = rounds[0].round;
      }
    } catch (e) {
      console.log('poll error:', e.message.slice(0, 120));
    }
    await page.waitForTimeout(config.collect.pollMs);
  }

  console.log('done. total rounds:', seen.size);
  await ctx.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
