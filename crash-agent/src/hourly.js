#!/usr/bin/env node
// HOURLY BOT - protocol H1.02 with Browser Automation Wiring
//
//   stake       : 100% of the paper balance (or configured UI stake)
//   cash-out    : 1.02x
//   cadence     : 1 order per hour
//   timezone    : West African Time (UTC+1), no DST
//   cycle       : aligned to the top of the hour, exactly HH:00:00 WAT
//   observe     : HH:00 -> HH:10, settled rounds only, no execution
//   decide      : HH:10 -> HH:15. Decision is evaluated and logged.
//                 When safe (decision === 'BET'), the bot sets the cashout (1.02x),
//                 optionally fills stake, and CLICKS THE BET BUTTON on the live page.
//   document    : outcome, ledgers, next cycle
//   idle        : dormant until the next hour mark
//
// Ledgers:
//   ALLIN   - the protocol as specified (all-in, gated by the rule)
//   CONTROL - all-in, always bets (isolates the value of the rule)
//   FLAT    - 1 unit per bet (clean edge estimator)
//
// Usage:
//   node src/hourly.js                  # run aligned to top of next hour
//   node src/hourly.js --start now      # begin observation immediately
//   node src/hourly.js --headed         # show the Chrome browser window
//   node src/hourly.js --dry-run        # simulate click without pressing button
//   node src/hourly.js --force-bet      # force BET decision on next decision window

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cfg = require(path.join(ROOT, 'config.json'));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

// ---- Timezone & Formatting (WAT = UTC+1) -----------------------------------
const WAT_OFFSET = 3600e3;
const HOUR = 3600e3;
const pad = (n) => String(n).padStart(2, '0');

function fmtWAT(ms) {
  const d = new Date(ms + WAT_OFFSET);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function stampWAT(ms) {
  const d = new Date(ms + WAT_OFFSET);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${fmtWAT(ms)}+01:00`;
}

const CASHOUT = Number(arg('cashout', 1.02));
const OBSERVE_MIN = Number(arg('observe', 0)); // 0 = zero observation lockout, active immediately from millisecond 0
const DECIDE_MIN = Number(arg('decide', 60)); // Active throughout the entire hour until a bet is placed
const OBS_MS = OBSERVE_MIN * 60e3;
const DEC_MS = DECIDE_MIN * 60e3;
const MAX_CYCLES = Number(arg('cycles', 72));
const START_MODE = String(arg('start', 'next-hour'));
const HEADED = process.argv.includes('--headed') || process.env.HEADED === '1';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_BET = process.argv.includes('--force-bet');
const MIN_ROUNDS = Number(arg('min-rounds', 5));
const STAKE_UI = arg('stake', null); // Stake to input into UI if specified

const ROUNDS_FILE = path.join(ROOT, cfg.collect.outFile || 'data/rounds.jsonl');
const LOG_FILE = path.join(ROOT, 'data', 'hourly.jsonl');
const ARCHIVE_DIR = path.join(ROOT, 'data', 'weeks');
const WEEK_MS = 7 * 24 * 3600e3;
const POLL_MS = Number(arg('poll', 250));
const P_WIN = 0.99 / CASHOUT;

const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : String(x));
const f4 = (x) => (typeof x === 'number' ? x.toFixed(4) : String(x));

// ---- Regex for live Crash parsing -----------------------------------------
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
  const maxRound = Math.max(...out.map((r) => r.round));
  return out
    .filter((r) => r.round >= maxRound - 50 && r.round <= maxRound + 5)
    .sort((a, b) => a.round - b.round);
}

// ---- Ledgers --------------------------------------------------------------
const L = {
  allin: 1, allinBet: 0, allinWin: 0, allinRuined: false,
  control: 1, controlBet: 0, controlWin: 0, controlRuined: false,
  flat: 0, flatBet: 0, flatWin: 0, flatStaked: 0,
  ruleBets: 0, ruleWins: 0,
};

// ---- State ----------------------------------------------------------------
const now0 = Date.now();
let cycleStart = START_MODE === 'now' ? now0 : Math.ceil(now0 / HOUR) * HOUR;
let cycleIndex = -1;
let phase = 'pre'; // pre | observe | decide | wait | idle
let windowRounds = [];
let rule = null;
let pendingBet = null; // { placedAt, cashout, stake, buttonClicked }
let seen = new Set();
let weekIndex = 0;
let weekStart = null;
let logPath = LOG_FILE;
let latency = { last: null, max: 0, sum: 0, n: 0 };

let browserCtx = null;
let page = null;

function computeRule() {
  const busts = windowRounds.filter((r) => r.mult < CASHOUT).length;
  const recentMults = windowRounds.map((r) => r.mult);
  const mean = windowRounds.length ? windowRounds.reduce((a, b) => a + b.mult, 0) / windowRounds.length : 0;
  
  if (FORCE_BET) {
    return {
      decision: 'BET',
      reason: 'manual override: --force-bet active',
      busts, mean, last5: recentMults.slice(-5), observed: windowRounds.length, insufficient: false,
    };
  }

  // 1. Mandatory minimum observed rounds
  if (windowRounds.length < 5) {
    return {
      decision: 'SKIP',
      reason: `only ${windowRounds.length} rounds observed (minimum required: 5) - waiting for 5 full rounds`,
      busts, mean, last5: recentMults.slice(-5), observed: windowRounds.length, insufficient: true,
    };
  }

  // 2. The 5-Round Amber-Flow Rule (User Rule)
  // Look at the last 5 completed consecutive rounds
  const last5 = recentMults.slice(-5);
  const allAbove150 = last5.every((m) => m >= 1.50);
  const amberCount = last5.filter((m) => m >= 1.50 && m < 2.00).length;
  const greenCount = last5.filter((m) => m >= 2.00).length;
  const endedWithGreen = last5[last5.length - 1] >= 2.00;

  if (!allAbove150) {
    const brokenIndex = last5.findIndex((m) => m < 1.50);
    const brokenVal = last5[brokenIndex];
    return {
      decision: 'SKIP',
      reason: `Streak broken: round ${brokenIndex + 1} of last 5 was ${f2(brokenVal)}x (must be >= 1.50x). Sequence: [${last5.map(f2).join(', ')}]`,
      busts, mean, last5, observed: windowRounds.length, insufficient: false,
    };
  }

  // Symmetric Dual-Color Rule:
  // Must have at least 1 Amber (cannot be pure Green)
  if (amberCount === 0) {
    return {
      decision: 'SKIP',
      reason: `5/5 pure Green (no Amber 1.50x-1.99x). Overheating trap guard active. Sequence: [${last5.map(f2).join(', ')}]`,
      busts, mean, last5, observed: windowRounds.length, insufficient: false,
    };
  }

  // Must have at least 1 Green (cannot be pure Amber)
  if (greenCount === 0) {
    return {
      decision: 'SKIP',
      reason: `5/5 pure Amber (no Green >= 2.00x). Stagnation trap guard active. Sequence: [${last5.map(f2).join(', ')}]`,
      busts, mean, last5, observed: windowRounds.length, insufficient: false,
    };
  }

  return {
    decision: 'BET',
    reason: `5-round sequence passed: ${amberCount} Amber and ${greenCount} Green [${last5.map(f2).join(', ')}]. Safe to stake on round 6!`,
    busts, mean, last5, amberCount, greenCount, observed: windowRounds.length, insufficient: false,
  };
}

function writeRow(row) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify({ week: weekIndex + 1, ...row }) + '\n');
}

function newCycle() {
  cycleIndex++;
  if (weekStart == null) weekStart = cycleStart;
  phase = 'decide'; // Zero observation delay: active and hunting immediately from millisecond 0
  windowRounds = [];
  rule = null;
  pendingBet = null;
  console.log('');
  console.log(`========================================================================`);
  console.log(`--- WEEK ${weekIndex + 1} | HOUR ${cycleIndex + 1}/${MAX_CYCLES} | ${fmtWAT(cycleStart)} WAT ---`);
  console.log(`    Active tracking from millisecond 0: ready to execute on 6th round upon Option A trigger.`);
  console.log(`========================================================================`);
}

// ---- The Decision -> Wire Bet Button Click ---------------------------------
async function decideAndPlace() {
  rule = computeRule();
  const at = Date.now();

  // 1. Log Decision
  writeRow({
    ts: stampWAT(at),
    wat: fmtWAT(at),
    hour: cycleIndex,
    cycleStart: stampWAT(cycleStart),
    phase: 'decision',
    rule,
    target: null,
    bet: null,
    ledgers: { allin: L.allin, control: L.control, flat: L.flat, flatBets: L.flatBet },
  });

  const last5 = (rule.last5 || []).map(f2).join(', ') || 'n/a';
  console.log(`[${fmtWAT(at)}] OBSERVE  ${rule.observed} rounds | mean ${f2(rule.mean)}x | busts(<${CASHOUT.toFixed(2)}) ${rule.busts} | last5 [${last5}]`);
  console.log(`[${fmtWAT(at)}] DECISION ${rule.decision} - ${rule.reason}`);

  // 2. Action: If safe (BET), wire and click the Bet button
  if (rule.decision === 'BET') {
    const stake = L.allin;
    let buttonClicked = false;
    let clickError = null;
    let dialogInfo = null;

    if (page && !DRY_RUN) {
      try {
        console.log(`[${fmtWAT(Date.now())}] ACTUATOR Setting auto-cashout to ${CASHOUT.toFixed(2)}x in browser...`);
        const inputs = page.locator('input');
        if (await inputs.count() >= 2) {
          const cashoutInput = inputs.nth(1);
          await cashoutInput.click();
          await cashoutInput.fill(CASHOUT.toFixed(2));

          if (STAKE_UI) {
            const amountInput = inputs.nth(0);
            await amountInput.click();
            await amountInput.fill(String(STAKE_UI));
          }
        }

        const betBtn = page.locator('button:has-text("Bet"), div.button:has-text("Bet")').first();
        if (await betBtn.count() > 0 && (await betBtn.isVisible())) {
          const btnText = (await betBtn.innerText()).replace(/\n/g, ' ');
          console.log(`[${fmtWAT(Date.now())}] ACTUATOR Pressing action button (current label: "${btnText}")...`);
          await betBtn.click();
          buttonClicked = true;

          // Check if modal or dialog triggered
          await page.waitForTimeout(1000);
          dialogInfo = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"], .dialog, .modal');
            return dialog ? dialog.innerText.slice(0, 150).replace(/\n/g, ' ') : null;
          });

          if (dialogInfo) {
            console.log(`[${fmtWAT(Date.now())}] NOTICE   Dialog detected after click: "${dialogInfo}"`);
          }
          console.log(`[${fmtWAT(Date.now())}] ACTUATOR action button clicked successfully.`);
        } else {
          clickError = 'Bet button not found or not visible';
          console.log(`[${fmtWAT(Date.now())}] WARNING  ${clickError}`);
        }
      } catch (err) {
        clickError = err.message;
        console.error(`[${fmtWAT(Date.now())}] ERROR    Failed to click action button: ${err.message}`);
      }
    } else if (DRY_RUN) {
      console.log(`[${fmtWAT(Date.now())}] DRY-RUN  Simulated click on action button at 1.02x`);
      buttonClicked = true;
    }

    pendingBet = { placedAt: at, cashout: CASHOUT, stake, buttonClicked, dialogInfo, clickError };

    writeRow({
      ts: stampWAT(at),
      wat: fmtWAT(at),
      hour: cycleIndex,
      cycleStart: stampWAT(cycleStart),
      phase: 'bet_placed',
      rule,
      target: null,
      bet: { stake, cashout: CASHOUT, buttonClicked, dialogInfo, clickError },
      ledgers: { allin: L.allin, control: L.control, flat: L.flat, flatBets: L.flatBet },
    });
  } else {
    pendingBet = null;
    console.log(`[${fmtWAT(at)}] BET      none - rule decision was SKIP`);
  }
}

function settleTarget(r) {
  const detectedAt = Date.now();
  const detectLatencyMs = r.ts ? detectedAt - Date.parse(r.ts) : null;
  if (detectLatencyMs != null) {
    latency.last = detectLatencyMs;
    latency.sum += detectLatencyMs;
    latency.n++;
    latency.max = Math.max(latency.max, detectLatencyMs);
  }
  const won = r.mult >= CASHOUT;
  let allinPnl = 0, ctrlPnl = 0;

  if (pendingBet) {
    const stake = L.allin;
    if (won) {
      L.allin += stake * (CASHOUT - 1);
      L.allinWin++;
      allinPnl = stake * (CASHOUT - 1);
    } else {
      L.allin = 0;
      L.allinRuined = true;
      allinPnl = -stake;
    }
    L.allinBet++;
    L.ruleBets++;
    if (won) L.ruleWins++;
  }

  if (!L.controlRuined && L.control > 0) {
    const stake = L.control;
    if (won) {
      L.control += stake * (CASHOUT - 1);
      L.controlWin++;
      ctrlPnl = stake * (CASHOUT - 1);
    } else {
      L.control = 0;
      L.controlRuined = true;
      ctrlPnl = -stake;
    }
    L.controlBet++;
  }

  const flatPnl = won ? CASHOUT - 1 : -1;
  L.flat += flatPnl;
  L.flatStaked += 1;
  L.flatBet++;
  if (won) L.flatWin++;

  const at = Date.now();
  console.log(`[${fmtWAT(at)}] SETTLE   round ${r.round}  crash ${f2(r.mult)}x  -> ${won ? 'WIN ' : 'LOSS'}${detectLatencyMs != null ? ` (latency ${detectLatencyMs}ms)` : ''}`);
  console.log(`           all-in: ${f4(L.allin)} | control: ${f4(L.control)} | flat: ${L.flat >= 0 ? '+' : ''}${f2(L.flat)} over ${L.flatBet} bets`);
  if (L.allinRuined) console.log(`           *** ALL-IN RUINED on round ${r.round} (crashed at ${f2(r.mult)}x) ***`);

  writeRow({
    ts: stampWAT(at),
    wat: fmtWAT(at),
    hour: cycleIndex,
    cycleStart: stampWAT(cycleStart),
    phase: 'settled',
    rule,
    target: { round: r.round, mult: r.mult },
    bet: pendingBet ? { stake: pendingBet.stake, cashout: CASHOUT, buttonClicked: pendingBet.buttonClicked } : null,
    won,
    pnl: { allinPnl, ctrlPnl, flatPnl },
    detectLatencyMs,
    ledgers: { allin: L.allin, control: L.control, flat: L.flat, flatBets: L.flatBet },
  });

  pendingBet = null;
  phase = 'idle';
  console.log(`[${fmtWAT(at)}] IDLE     Cycle complete. Dormant until next hour boundary.`);
}

function rotateWeek(at) {
  writeRow({
    ts: stampWAT(at),
    wat: fmtWAT(at),
    hour: cycleIndex,
    cycleStart: stampWAT(cycleStart),
    phase: 'week_end',
    weekStart: stampWAT(weekStart),
    weekEnd: stampWAT(at),
    rule: null, target: null, bet: null,
    ledgers: { allin: L.allin, control: L.control, flat: L.flat, flatBets: L.flatBet },
    summary: {
      ruleBets: L.ruleBets, ruleWins: L.ruleWins,
      flat: L.flat, flatBets: L.flatBet, flatStaked: L.flatStaked,
      allin: L.allin, allinRuined: L.allinRuined,
      control: L.control, controlRuined: L.controlRuined,
      latency: { last: latency.last, max: latency.max, mean: latency.n ? latency.sum / latency.n : null, n: latency.n },
    },
  });

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const dest = path.join(ARCHIVE_DIR, `week-${String(weekIndex + 1).padStart(2, '0')}.jsonl`);
  if (fs.existsSync(logPath)) {
    try { fs.renameSync(logPath, dest); } catch (e) { console.log(`  Archive failed: ${e.message}`); }
  }

  console.log('');
  console.log('========================================================================');
  console.log(`  WEEK ${weekIndex + 1} CLOSED -> ${path.relative(ROOT, dest)}`);
  console.log(`  bets ${L.ruleBets} | won ${L.ruleWins} | flat ${L.flat >= 0 ? '+' : ''}${f2(L.flat)} | all-in ${f4(L.allin)}`);
  console.log(`  WEEK ${weekIndex + 2} begins with a reset ledger`);
  console.log('========================================================================');
  console.log('');

  weekIndex++;
  weekStart += WEEK_MS;
  logPath = LOG_FILE;

  L.allin = 1; L.allinBet = 0; L.allinWin = 0; L.allinRuined = false;
  L.control = 1; L.controlBet = 0; L.controlWin = 0; L.controlRuined = false;
  L.flat = 0; L.flatBet = 0; L.flatWin = 0; L.flatStaked = 0;
  L.ruleBets = 0; L.ruleWins = 0;
  latency = { last: null, max: 0, sum: 0, n: 0 };
}

async function tick() {
  const now = Date.now();

  if (weekStart != null && now >= weekStart + WEEK_MS) rotateWeek(now);

  // If in idle state from a 'start now' run, check if we reached the top of the next hour
  if (START_MODE === 'now' && cycleIndex === 0 && phase === 'idle') {
    const nextHour = Math.ceil(now0 / HOUR) * HOUR;
    if (now >= nextHour) {
      cycleStart = nextHour;
      newCycle();
    }
  }

  while (now >= cycleStart + HOUR) {
    if (phase !== 'pre' && pendingBet) {
      writeRow({
        ts: stampWAT(now), wat: fmtWAT(now), hour: cycleIndex,
        cycleStart: stampWAT(cycleStart), phase: 'missed',
        rule, target: null, bet: null,
        ledgers: { allin: L.allin, control: L.control, flat: L.flat, flatBets: L.flatBet },
      });
      console.log(`[${fmtWAT(now)}] MISSED   Hour closed with the order unresolved`);
    }
    if (cycleIndex + 1 >= MAX_CYCLES) {
      summary();
      if (browserCtx) await browserCtx.close();
      process.exit(0);
    }
    cycleStart += HOUR;
    newCycle();
  }

  if (now < cycleStart) return;
  if (phase === 'idle') return;

  const elapsed = now - cycleStart;

  if (phase === 'pre') {
    newCycle();
  }

  if (phase === 'decide' && !pendingBet) {
    const check = computeRule();
    if (check.decision === 'BET') {
      await decideAndPlace();
    }
  }

  if (phase === 'decide' && elapsed >= DEC_MS) {
    phase = 'wait';
    if (pendingBet) {
      const at = Date.now();
      writeRow({
        ts: stampWAT(at), wat: fmtWAT(at), hour: cycleIndex,
        cycleStart: stampWAT(cycleStart), phase: 'missed',
        rule, target: null,
        bet: { stake: pendingBet.stake, cashout: CASHOUT },
        ledgers: { allin: L.allin, control: L.control, flat: L.flat, flatBets: L.flatBet },
      });
      console.log(`[${fmtWAT(at)}] MISSED   Decide window closed with no resolution`);
      pendingBet = null;
    }
  }

  // Poll live rounds directly from the page
  if (page) {
    try {
      const text = await page.evaluate(() => document.body.innerText);
      const rounds = parseRounds(text);
      for (const r of rounds) {
        if (seen.has(r.round)) continue;
        seen.add(r.round);

        const rec = { round: r.round, mult: r.mult, ts: new Date().toISOString() };
        fs.appendFileSync(ROUNDS_FILE, JSON.stringify(rec) + '\n');

        if (phase === 'observe') {
          windowRounds.push(r);
          console.log(`[${fmtWAT(Date.now())}] ROUND    #${r.round} settled at ${f2(r.mult)}x (observed ${windowRounds.length})`);
        } else if (pendingBet) {
          settleTarget(r);
        }
      }
    } catch (e) {
      // transient page read error
    }
  }
}

function summary() {
  console.log('');
  console.log('========================================================================');
  console.log('  HOURLY SUMMARY (WAT)');
  console.log('========================================================================');
  console.log(`  bets placed              ${L.ruleBets}`);
  console.log(`  won                      ${L.ruleWins} (${L.ruleBets ? ((L.ruleWins / L.ruleBets) * 100).toFixed(2) : '0.00'}%)`);
  console.log(`  theoretical win rate     ${(P_WIN * 100).toFixed(2)}%`);
  console.log(`  ALL-IN balance           ${f4(L.allin)}${L.allinRuined ? ' (RUINED)' : ''}`);
  console.log(`  CONTROL balance          ${f4(L.control)}${L.controlRuined ? ' (RUINED)' : ''}`);
  console.log(`  FLAT PnL                 ${L.flat >= 0 ? '+' : ''}${f2(L.flat)} units over ${L.flatBet} bets`);
  if (latency.n) {
    console.log(`  latency                  mean ${(latency.sum / latency.n).toFixed(0)}ms | max ${latency.max}ms (n=${latency.n})`);
  }
  console.log('========================================================================');
}

// ---- Main Launch -----------------------------------------------------------
(async () => {
  console.log('');
  console.log('========================================================================');
  console.log('  HOURLY BOT - PROTOCOL H1.02 (LIVE ORDER-BUTTON WIRED)');
  console.log('========================================================================');
  console.log(`  Timezone         West African Time (UTC+1)`);
  console.log(`  Cycle            Hourly, HH:00:00 WAT`);
  console.log(`  Observation      HH:00 -> HH:${pad(OBSERVE_MIN)} (window: ${OBSERVE_MIN} min)`);
  console.log(`  Cash-Out Target  ${CASHOUT.toFixed(2)}x`);
  console.log(`  Action on Safe   FILL CASHOUT (${CASHOUT.toFixed(2)}x) & CLICK ACTION BUTTON`);
  console.log(`  Mode             ${HEADED ? 'Headed (visible Chrome)' : 'Headless (background Chrome)'}`);
  console.log('------------------------------------------------------------------------');

  // Load existing rounds to populate seen
  if (fs.existsSync(ROUNDS_FILE)) {
    for (const line of fs.readFileSync(ROUNDS_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { seen.add(JSON.parse(line).round); } catch {}
    }
  }

  // Launch Playwright persistent browser
  const userDataDir = path.resolve(ROOT, HEADED ? '.profile-headed' : cfg.site.userDataDir);
  console.log(`  Browser Profile  ${path.relative(ROOT, userDataDir)}`);
  console.log(`  Connecting to    ${cfg.site.crashUrl} ...`);

  browserCtx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: !HEADED,
    viewport: cfg.site.viewport,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  page = browserCtx.pages()[0] || (await browserCtx.newPage());

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await page.goto(cfg.site.crashUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      break;
    } catch (e) {
      console.log(`  goto attempt ${attempt} failed: ${e.message.slice(0, 80)}`);
      if (attempt === 5) throw e;
      await page.waitForTimeout(4000);
    }
  }

  await page.waitForTimeout(6000);
  console.log('  Live page ready. Monitoring live rounds.');

  if (now0 < cycleStart) {
    const waitS = Math.round((cycleStart - now0) / 1000);
    console.log(`  First cycle      ${fmtWAT(cycleStart)} WAT (in ${Math.floor(waitS / 60)}m ${waitS % 60}s)`);
  } else {
    console.log(`  First cycle      ${fmtWAT(cycleStart)} WAT (starting immediately)`);
  }
  console.log('========================================================================\n');

  // Run initial tick and start loop
  await tick();
  setInterval(async () => {
    try {
      await tick();
    } catch (err) {
      console.error('Tick error:', err.message);
    }
  }, POLL_MS);
})().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
