#!/usr/bin/env node
// Models the exact strategy that was described:
//
//   - 2 bets per hour
//   - auto cash-out 1.01x
//   - stake = 100% of the current balance ("maximum amount in balance")
//   - run for N days
//
// This is a simulation only. It never touches the site, never reads a balance,
// never clicks Bet. It answers one question: what does this stake sizing do to
// a bankroll over time?
//
//   node src/allin.js
//   node src/allin.js --balance 1000 --days 5 --paths 200000
//   node src/allin.js --real        # what the collected rounds actually did
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

const CASHOUT = Number(arg('cashout', 1.01));
// P(crash >= x) = 0.99 / x for this game. At 1.01 that is 98.02%.
const P_WIN = 0.99 / CASHOUT;
const P_LOSS = 1 - P_WIN;

const BALANCE = Number(arg('balance', 1000));
const DAYS = Number(arg('days', 5));
const BETS_PER_HOUR = Number(arg('betsPerHour', 2));
const PATHS = Number(arg('paths', 200000));
const TOTAL_BETS = Math.round(DAYS * 24 * BETS_PER_HOUR);

function pct(x, d = 2) { return `${(x * 100).toFixed(d)}%`; }

// ---------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------
function simulate() {
  const finals = new Float64Array(PATHS);
  const ruinBet = new Int32Array(PATHS).fill(-1);
  let ruined = 0;
  let profitable = 0;
  let sum = 0;

  for (let p = 0; p < PATHS; p++) {
    let bal = 1; // start at 1x, report multipliers
    let ruinedAt = -1;
    for (let b = 0; b < TOTAL_BETS; b++) {
      if (Math.random() < P_WIN) {
        bal *= CASHOUT;
      } else {
        bal = 0;
        ruinedAt = b;
        break;
      }
    }
    finals[p] = bal;
    ruinBet[p] = ruinedAt;
    if (ruinedAt >= 0) ruined++;
    else if (bal > 1) profitable++;
    sum += bal;
  }

  finals.sort();
  const q = (f) => finals[Math.min(PATHS - 1, Math.floor(f * PATHS))];

  // Survival at the end of each day (closed form, for the chart)
  const survivalByDay = [];
  for (let d = 0; d <= DAYS; d++) {
    const n = Math.round(d * 24 * BETS_PER_HOUR);
    survivalByDay.push({ day: d, p: Math.pow(P_WIN, n) });
  }

  return {
    paths: PATHS,
    totalBets: TOTAL_BETS,
    pWin: P_WIN,
    pLoss: P_LOSS,
    ruinRate: ruined / PATHS,
    profitableRate: profitable / PATHS,
    meanFinal: sum / PATHS,
    medianFinal: q(0.5),
    p05: q(0.05),
    p95: q(0.95),
    survivalByDay,
    ruinBet,
  };
}

// ---------------------------------------------------------------------------
// Empirical check on the collected rounds
// ---------------------------------------------------------------------------
function realRounds() {
  const file = path.join(ROOT, cfg.collect.outFile || 'data/rounds.jsonl');
  if (!fs.existsSync(file)) return null;
  const by = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!(r.round >= 9_000_000 && r.round < 10_000_000)) continue;
    if (!(r.mult >= 1 && r.mult < 100_000)) continue;
    if (!by.has(r.round)) by.set(r.round, r);
  }
  const rows = [...by.values()].sort((a, b) => a.round - b.round);
  if (!rows.length) return null;
  const losses = rows.filter((r) => r.mult < CASHOUT);
  return {
    n: rows.length,
    losses: losses.length,
    lossRate: losses.length / rows.length,
    examples: losses.slice(0, 10).map((r) => ({ round: r.round, mult: r.mult })),
  };
}

// ---------------------------------------------------------------------------
function main() {
  const res = simulate();
  const real = realRounds();

  console.log('');
  console.log('=== ALL-IN AT 1.01x ===');
  console.log(`  cash-out                 ${CASHOUT.toFixed(2)}x`);
  console.log(`  P(win a bet)             ${pct(res.pWin)}   (0.99 / ${CASHOUT})`);
  console.log(`  P(lose a bet)            ${pct(res.pLoss)}`);
  console.log(`  EV per bet               ${pct(res.pWin * CASHOUT - 1)}`);
  console.log('');
  console.log(`  schedule                 ${BETS_PER_HOUR} bets/hour for ${DAYS} days = ${res.totalBets} bets`);
  console.log('');
  console.log(`  P(ruin by the end)       ${pct(res.ruinRate)}`);
  console.log(`  P(finish in profit)      ${pct(res.profitableRate)}`);
  console.log(`  mean final balance       ${res.meanFinal.toFixed(4)}x`);
  console.log(`  median final balance     ${res.medianFinal.toFixed(4)}x`);
  console.log(`  5th / 95th percentile    ${res.p05.toFixed(4)}x / ${res.p95.toFixed(2)}x`);
  console.log('');
  console.log('  survival curve (probability the run is still alive):');
  for (const s of res.survivalByDay) {
    const n = Math.round(s.day * 24 * BETS_PER_HOUR);
    const bar = '#'.repeat(Math.round(s.p * 40));
    console.log(`    day ${String(s.day).padStart(2)}  ${pct(s.p, 3).padStart(8)}  ${bar}`);
  }

  if (real) {
    console.log('');
    console.log('=== WHAT THE COLLECTED ROUNDS ACTUALLY DID ===');
    console.log(`  rounds observed          ${real.n}`);
    console.log(`  crashed below ${CASHOUT.toFixed(2)}x     ${real.losses}  (${pct(real.lossRate)})`);
    if (real.examples.length) {
      console.log(`  examples                 ${real.examples.map((e) => e.mult.toFixed(2)).join(', ')}`);
    }
    console.log(`  verdict                  ${real.losses > 0 ? 'an all-in 1.01x bet would already have been wiped out' : 'no loss in this sample — which is why 2% feels safe until it is not'}`);
  }

  // machine-readable for the chart
  const out = {
    generatedAt: new Date().toISOString(),
    cashout: CASHOUT,
    pWin: res.pWin,
    pLoss: res.pLoss,
    betsPerHour: BETS_PER_HOUR,
    days: DAYS,
    totalBets: res.totalBets,
    paths: res.paths,
    ruinRate: res.ruinRate,
    profitableRate: res.profitableRate,
    meanFinal: res.meanFinal,
    medianFinal: res.medianFinal,
    p05: res.p05,
    p95: res.p95,
    survivalByDay: res.survivalByDay,
    real,
  };
  fs.writeFileSync(path.join(ROOT, 'data', 'allin-summary.json'), JSON.stringify(out, null, 2));
  console.log(`\n  -> data/allin-summary.json`);
}

main();
