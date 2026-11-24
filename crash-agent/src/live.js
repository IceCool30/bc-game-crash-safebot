#!/usr/bin/env node
// Live paper-trading loop. Tails data/rounds.jsonl (written by the collector),
// makes a decision BEFORE each new round using only past rounds, settles it
// against the real crash value, and prints a running scoreboard.
//
// Two modes:
//   node src/live.js                      # every round, fixed 1-unit stake
//   node src/live.js --allin --cashout 1.01 --betsPerHour 2
//                                         # stake = whole paper balance, 2 bets/hour
//
// The --allin mode is the exact schedule that was asked for, with a paper
// balance instead of a real one. Zero interaction with the site.
const fs = require('fs');
const path = require('path');
const { STRATEGIES } = require('./strategy');

const ROOT = path.resolve(__dirname, '..');
const cfg = require(path.join(ROOT, 'config.json'));
const ROUNDS_FILE = path.join(ROOT, cfg.collect.outFile || 'data/rounds.jsonl');

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const ALLIN = !!arg('allin', false);
const strategyName = arg('strategy', null);
const cashout = Number(arg('cashout', ALLIN ? 1.01 : (cfg.order || cfg.bet || {}).autoCashout || 2));
const BETS_PER_HOUR = Number(arg('betsPerHour', 2));
const BET_INTERVAL = 3600000 / BETS_PER_HOUR;
let stake = Number(arg('stake', 1));
let balance = Number(arg('balance', 1));
const decideFn = strategyName ? STRATEGIES[strategyName] : null;

function readRounds() {
  if (!fs.existsSync(ROUNDS_FILE)) return [];
  const by = new Map();
  for (const line of fs.readFileSync(ROUNDS_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!(r.round >= 9_000_000 && r.round < 10_000_000)) continue;
    if (!(r.mult >= 1 && r.mult < 100_000)) continue;
    if (!by.has(r.round)) by.set(r.round, r);
  }
  return [...by.values()].sort((a, b) => a.round - b.round);
}

function settle(signal, mult, thisStake) {
  if (signal === 'long') return mult >= cashout ? { won: true, pnl: thisStake * (cashout - 1) } : { won: false, pnl: -thisStake };
  if (signal === 'short') return mult < cashout ? { won: true, pnl: thisStake * (0.98 * cashout - 1) } : { won: false, pnl: -thisStake };
  return null;
}

const time = () => new Date().toISOString().slice(11, 19);
const signed = (x, d = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;

const history = [];
let equity = 0;
let bets = 0;
let wins = 0;
let staked = 0;
let peak = 0;
let maxDD = 0;
let lastBetAt = 0;
let lastRound = Number(arg('from', 0)) || 0;
const seen = new Set();

// Prime history without settling.
const all = readRounds();
for (const r of all) {
  if (lastRound && r.round > lastRound) break;
  history.push(r.mult);
  seen.add(r.round);
}
if (!lastRound && all.length) lastRound = all[all.length - 1].round;

console.log('');
if (ALLIN) {
  console.log(`=== LIVE ALL-IN @ ${cashout.toFixed(2)}x — ${BETS_PER_HOUR} bets/hour (paper balance) ===`);
  console.log(`    starting balance ${balance} units, stake = 100% of balance`);
} else {
  console.log(`=== LIVE PAPER TRADING - ${strategyName || cfg.strategy.name} @ ${cashout.toFixed(2)}x, stake ${stake} ===`);
}
console.log(`    warm history: ${history.length} rounds, last ${lastRound}`);
console.log(`    waiting for new rounds...`);
console.log('');

const started = Date.now();
let ruined = false;

function tick() {
  const rounds = readRounds();
  const fresh = rounds.filter((r) => !seen.has(r.round) && r.round > lastRound);

  for (const r of fresh) {
    if (ruined) { seen.add(r.round); lastRound = Math.max(lastRound, r.round); continue; }

    // In all-in mode, only fire when the schedule says so.
    if (ALLIN && Date.now() - lastBetAt < BET_INTERVAL) {
      seen.add(r.round);
      lastRound = Math.max(lastRound, r.round);
      history.push(r.mult);
      continue;
    }

    let signal;
    let reason;
    if (decideFn) {
      const d = decideFn(history.slice());
      signal = d.signal;
      reason = d.reason;
    } else if (ALLIN) {
      signal = 'long'; // always bet that it reaches 1.01x
      reason = 'schedule';
    } else {
      const d = STRATEGIES[cfg.strategy.name](history.slice());
      signal = d.signal;
      reason = d.reason;
    }

    const thisStake = ALLIN ? balance : stake;
    const s = settle(signal, r.mult, thisStake);

    let line = `[${time()}] ${r.round}  crash ${r.mult.toFixed(2).padStart(7)}x`;
    if (s) {
      bets++;
      staked += thisStake;
      if (s.won) wins++;
      if (ALLIN) {
        balance = balance + s.pnl;
        equity = balance - Number(arg('balance', 1));
      } else {
        equity += s.pnl;
      }
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, peak - equity);
      line += `   ${signal.toUpperCase().padEnd(5)} ${s.won ? 'WIN ' : 'LOSS'} ${signed(s.pnl).padStart(9)}`;
      line += ALLIN ? `   balance ${balance.toFixed(6)}` : `   equity ${signed(equity).padStart(8)}`;
      lastBetAt = Date.now();
      if (ALLIN && balance <= 1e-12) {
        ruined = true;
        console.log(line);
        console.log('');
        console.log(`  *** RUINED on bet ${bets} (round ${r.round}) after ${Math.round((Date.now() - started) / 60000)} min ***`);
        console.log(`  the balance is gone. this is the 1.98% event.`);
        process.exit(0);
      }
    } else {
      line += `   skip  (${reason})`;
    }
    console.log(line);
    history.push(r.mult);
    seen.add(r.round);
    lastRound = Math.max(lastRound, r.round);
  }

  if (fresh.length && bets > 0) {
    const wr = (wins / bets) * 100;
    const roi = (equity / staked) * 100;
    const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
    const balTxt = ALLIN ? `  balance ${balance.toFixed(6)}` : '';
    console.log(`         -- bets ${bets}  win ${wr.toFixed(1)}%  net ${signed(equity)}${balTxt}  maxDD ${maxDD.toFixed(2)}  (${mins}m)`);
  }
}

tick();
setInterval(tick, 2000);
