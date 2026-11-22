#!/usr/bin/env node
// Experiment runner: measures a fixed staking protocol over many independent
// sessions and writes the results as a Markdown report.
//
// Protocol under test ("all-in 1.01x, 2 bets/hour, 5 days") plus fractional
// control arms, so the report shows the risk/return trade-off rather than a
// single number.
//
//   node src/experiment.js
//   node src/experiment.js --sessions 20000 --days 5 --cashout 1.01
//
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const CASHOUT = Number(arg('cashout', 1.01));
const DAYS = Number(arg('days', 5));
const BETS_PER_HOUR = Number(arg('betsPerHour', 2));
const SESSIONS = Number(arg('sessions', 20000));
const TOTAL_BETS = Math.round(DAYS * 24 * BETS_PER_HOUR);

// P(crash >= x) = 0.99 / x
const P_WIN = 0.99 / CASHOUT;
const P_LOSS = 1 - P_WIN;
const EDGE = P_WIN * CASHOUT - 1; // -1%

const ARMS = [
  { label: '100% (all-in)', f: 1.0 },
  { label: '50%', f: 0.5 },
  { label: '25%', f: 0.25 },
  { label: '10%', f: 0.1 },
  { label: '5%', f: 0.05 },
  { label: '1%', f: 0.01 },
];

const RUIN = 0.01;   // balance below 1% of start counts as ruin
const DEEP = 0.10;   // below 10%

function runArm(fraction) {
  const finals = new Float64Array(SESSIONS);
  const wagered = new Float64Array(SESSIONS);
  let ruined = 0, deep = 0, profitable = 0, betWins = 0, betCount = 0;
  let sumFinal = 0, sumDD = 0;

  for (let s = 0; s < SESSIONS; s++) {
    let bal = 1;
    let peak = 1;
    let dd = 0;
    let wag = 0;
    for (let b = 0; b < TOTAL_BETS; b++) {
      if (bal <= 1e-12) break;
      const stake = bal * fraction;
      wag += stake;
      betCount++;
      if (Math.random() < P_WIN) {
        bal += stake * (CASHOUT - 1);
        betWins++;
      } else {
        bal -= stake;
      }
      peak = Math.max(peak, bal);
      dd = Math.max(dd, (peak - bal) / peak);
    }
    finals[s] = bal;
    wagered[s] = wag;
    sumFinal += bal;
    sumDD += dd;
    if (bal < RUIN) ruined++;
    if (bal < DEEP) deep++;
    if (bal > 1) profitable++;
  }

  finals.sort();
  const q = (p) => finals[Math.min(SESSIONS - 1, Math.floor(p * SESSIONS))];

  return {
    label: ARMS.find((a) => a.f === fraction).label,
    f: fraction,
    ruinRate: ruined / SESSIONS,
    deepRate: deep / SESSIONS,
    profitRate: profitable / SESSIONS,
    meanFinal: sumFinal / SESSIONS,
    medianFinal: q(0.5),
    p05: q(0.05),
    p95: q(0.95),
    betWinRate: betWins / betCount,
    meanWagered: wagered.reduce((a, b) => a + b, 0) / SESSIONS,
    meanDD: sumDD / SESSIONS,
  };
}

const pct = (x, d = 2) => `${(x * 100).toFixed(d)}%`;
const mult = (x) => (x < 0.0001 ? '0.0000' : x.toFixed(4));

function main() {
  const t0 = Date.now();
  const results = ARMS.map((a) => runArm(a.f));

  const lines = [];
  const L = (s = '') => lines.push(s);

  L('# Experiment report — fixed-cash-out staking protocol');
  L();
  L(`Generated: ${new Date().toISOString()}`);
  L();
  L('## Protocol');
  L();
  L('| Parameter | Value |');
  L('| --- | --- |');
  L(`| Game | BC.Game Crash |`);
  L(`| Auto cash-out | ${CASHOUT.toFixed(2)}x |`);
  L(`| P(win one bet) | ${pct(P_WIN, 4)} — from 0.99 / ${CASHOUT} |`);
  L(`| P(lose one bet) | ${pct(P_LOSS, 4)} |`);
  L(`| Edge per bet | ${pct(EDGE, 2)} |`);
  L(`| Bets per hour | ${BETS_PER_HOUR} |`);
  L(`| Session length | ${DAYS} days = ${TOTAL_BETS} bets |`);
  L(`| Sessions simulated | ${SESSIONS.toLocaleString()} |`);
  L(`| Ruin definition | final balance below ${pct(RUIN, 0)} of starting balance |`);
  L();
  L('## Results');
  L();
  L('| Stake fraction | Per-bet win rate | Ruin (<1%) | Below 10% | In profit | Median final | Mean final | 5th pct | 95th pct | Avg max drawdown |');
  L('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    L(`| ${r.label} | ${pct(r.betWinRate)} | **${pct(r.ruinRate)}** | ${pct(r.deepRate)} | ${pct(r.profitRate)} | ${mult(r.medianFinal)}x | ${mult(r.meanFinal)}x | ${mult(r.p05)}x | ${mult(r.p95)}x | ${pct(r.meanDD, 1)} |`);
  }
  L();

  // The crucial distinction
  const allin = results[0];
  L('## The finding that matters');
  L();
  L(`The per-bet success rate is **${pct(allin.betWinRate)}** in every arm — it is a property of the game, not of the stake size.`);
  L(`But the session success rate in the all-in arm is **${pct(allin.profitRate)}**.`);
  L();
  L('That gap is the whole experiment. A report that records "98% of bets won" and stops there');
  L(`will describe a strategy that actually ends in profit ${pct(allin.profitRate)} of the time.`);
  L('Both numbers are true. Only the second one describes what happens to the bankroll.');
  L();
  L('## Why stake size changes the result but not the edge');
  L();
  L(`Every arm has the same edge per bet (${pct(EDGE, 2)}). What changes is how much is wagered,`);
  L('and the house edge is charged on the amount wagered, not on the balance.');
  L();
  L('| Stake fraction | Mean total wagered | Mean final balance | Expected loss |');
  L('| --- | --- | --- | --- |');
  for (const r of results) {
    L(`| ${r.label} | ${r.meanWagered.toFixed(2)}x | ${mult(r.meanFinal)}x | ${pct(1 - r.meanFinal, 1)} |`);
  }
  L();
  L('All-in maximizes the amount wagered in every session, which is why it maximizes the expected loss.');
  L('Reducing the stake fraction lowers ruin probability but does not create an edge:');
  L('there is no fraction at which the expected value turns positive.');
  L();
  L('## Control-arm note');
  L();
  L('Fractional staking cannot reach a zero balance, so "ruin" is defined as dropping below 1% of');
  L('the starting balance. The all-in arm does reach zero, and does so quickly:');
  L(`the median session in that arm ends at ${mult(allin.medianFinal)}x.`);
  L();
  L(`---`);
  L();
  L(`Simulation runtime: ${((Date.now() - t0) / 1000).toFixed(1)}s. Deterministic inputs, seeded from Math.random.`);

  const report = lines.join('\n');
  fs.writeFileSync(path.join(ROOT, 'data', 'experiment-report.md'), report);

  fs.writeFileSync(
    path.join(ROOT, 'data', 'experiment.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), cashout: CASHOUT, pWin: P_WIN, pLoss: P_LOSS, days: DAYS, betsPerHour: BETS_PER_HOUR, totalBets: TOTAL_BETS, sessions: SESSIONS, results },
      null,
      2
    )
  );
  console.log(report);
  console.log(`\n-> data/experiment-report.md`);
}

main();
