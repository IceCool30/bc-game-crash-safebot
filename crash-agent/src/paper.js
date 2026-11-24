#!/usr/bin/env node
// Paper-trading simulator.
//
// Replays every collected round through a strategy and settles each hypothetical
// round against the real crash value. Nothing is sent to the site, no account is
// touched. This is the observable version of the loop: same decision logic, same
// stake rules, same cash-out, but the money is imaginary.
//
//   node src/paper.js                        # all strategies, default cash-out
//   node src/paper.js --cashout 2 --stake 1  # single run, custom terms
//   node src/paper.js --strategy moving-average --verbose
//
const fs = require('fs');
const path = require('path');
const { STRATEGIES } = require('./strategy');

const ROOT = path.resolve(__dirname, '..');
const cfg = require(path.join(ROOT, 'config.json'));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const ROUNDS_FILE = path.join(ROOT, cfg.collect.outFile || 'data/rounds.jsonl');
const OUT_FILE = path.join(ROOT, 'data', 'paper.jsonl');

function loadRounds() {
  if (!fs.existsSync(ROUNDS_FILE)) return [];
  const byRound = new Map();
  for (const line of fs.readFileSync(ROUNDS_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!(r.round >= 9_000_000 && r.round < 10_000_000)) continue;
    if (!(r.mult >= 1 && r.mult < 100_000)) continue;
    if (!byRound.has(r.round)) byRound.set(r.round, r);
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

// Settle one hypothetical round.
//   long  = "crash will reach the cash-out"   -> pays cashout, loses stake otherwise
//   short = "crash will stay below the cash-out" -> pays 0.98*cashout (BC's Red
//           ladder is priced 2% under fair), loses stake otherwise
function settle(signal, mult, cashout, stake) {
  if (signal === 'long') {
    return mult >= cashout ? { won: true, pnl: stake * (cashout - 1) } : { won: false, pnl: -stake };
  }
  if (signal === 'short') {
    return mult < cashout ? { won: true, pnl: stake * (0.98 * cashout - 1) } : { won: false, pnl: -stake };
  }
  return null;
}

function simulate(rounds, opts) {
  const { strategyName, cashout, stake, minHistory } = opts;
  const decideFn = STRATEGIES[strategyName];
  const history = [];
  const executedOrders = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (history.length >= minHistory) {
      const d = decideFn(history.slice());
      if (d.signal === 'long' || d.signal === 'short') {
        const s = settle(d.signal, r.mult, cashout, stake);
        equity += s.pnl;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.max(maxDrawdown, peak - equity);
        executedOrders.push({
          round: r.round,
          signal: d.signal,
          reason: d.reason,
          mult: r.mult,
          won: s.won,
          pnl: +s.pnl.toFixed(6),
          equity: +equity.toFixed(6),
          ts: r.ts,
        });
      }
    }
    history.push(r.mult);
  }

  const wins = executedOrders.filter((b) => b.won).length;
  const losses = executedOrders.length - wins;
  const staked = executedOrders.length * stake;
  return {
    strategy: strategyName,
    cashout,
    stake,
    orders: executedOrders.length,
    wins,
    losses,
    winRate: executedOrders.length ? wins / executedOrders.length : 0,
    staked,
    net: +equity.toFixed(6),
    roi: staked ? equity / staked : 0,
    roiCI: bootstrapROI(executedOrders, stake),
    maxDrawdown: +maxDrawdown.toFixed(6),
    rounds: executedOrders.length,
    detail: executedOrders,
  };
}

// Resample the settled rounds 4,000 times to get a 95% interval on ROI.
// With a few hundred rounds the interval is wide enough to swallow the entire
// "edge" a lucky streak appears to show.
function bootstrapROI(rounds, stake) {
  if (rounds.length < 5) return null;
  const pnls = rounds.map((b) => b.pnl / stake);
  const n = pnls.length;
  const out = [];
  for (let k = 0; k < 4000; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += pnls[(Math.random() * n) | 0];
    out.push(s / n);
  }
  out.sort((a, b) => a - b);
  const lo = out[Math.floor(out.length * 0.025)];
  const hi = out[Math.floor(out.length * 0.975)];
  return [+lo.toFixed(6), +hi.toFixed(6)];
}

function pct(x, d = 2) { return `${(x * 100).toFixed(d)}%`; }
function signed(x, d = 2) { return `${x >= 0 ? '+' : ''}${x.toFixed(d)}`; }

function printRun(res) {
  const edge = res.roi;
  console.log('');
  console.log(`  strategy            ${res.strategy}`);
  console.log(`  cash-out            ${res.cashout.toFixed(2)}x    stake ${res.stake}`);
  console.log(`  rounds replayed     ${res.rounds}`);
  console.log(`  rounds placed         ${res.rounds}`);
  console.log(`  won / lost          ${res.wins} / ${res.losses}`);
  console.log(`  win rate            ${pct(res.winRate)}`);
  console.log(`  total staked        ${res.staked.toFixed(2)}`);
  console.log(`  net                 ${signed(res.net)}`);
  console.log(`  ROI                 ${signed(edge * 100)}%${res.roiCI ? `   95% CI ${signed(res.roiCI[0] * 100)}% .. ${signed(res.roiCI[1] * 100)}%` : ''}`);
  console.log(`  max drawdown        ${res.maxDrawdown.toFixed(2)}`);
  console.log('');
}

function main() {
  const rounds = loadRounds();
  if (rounds.length < 20) {
    console.error(`Only ${rounds.length} usable rounds in ${ROUNDS_FILE}. Collect more first.`);
    process.exit(1);
  }

  const cashout = Number(arg('cashout', (cfg.order || cfg.round || {}).autoCashout || 2));
  const stake = Number(arg('stake', 1));
  const minHistory = Number(arg('minHistory', cfg.strategy.lookback || 6));
  const verbose = !!arg('verbose', false);
  const only = arg('strategy', null);
  const lookback = arg('lookback', null);
  if (lookback != null) cfg.strategy.lookback = Number(lookback);

  console.log('');
  console.log('=== PAPER TRADING (no site interaction) ===');
  console.log(`rounds ${rounds[0].round} -> ${rounds[rounds.length - 1].round}`);

  const names = only ? [String(only)] : Object.keys(STRATEGIES);
  const results = names.map((n) => simulate(rounds, { strategyName: n, cashout, stake, minHistory }));

  if (only) {
    const res = results[0];
    printRun(res);
    if (verbose) {
      console.log('  round      signal  mult     result   pnl      equity');
      for (const b of res.detail) {
        console.log(
          `  ${String(b.round).padEnd(10)} ${b.signal.padEnd(7)} ${b.mult.toFixed(2).padStart(7)}x ${(b.won ? 'win ' : 'loss').padEnd(8)} ${signed(b.pnl, 2).padStart(8)} ${b.equity.toFixed(2).padStart(9)}`
        );
      }
    }
  } else {
    console.log('');
    console.log('  strategy            rounds   wins  win%    net       ROI     95% CI (ROI)');
    console.log('  ------------------  -----  ----  ------  --------  -------  --------------------');
    for (const r of results) {
      const ci = r.roiCI ? `${signed(r.roiCI[0] * 100, 1)}% .. ${signed(r.roiCI[1] * 100, 1)}%` : 'n/a';
      console.log(
        `  ${r.strategy.padEnd(20)}${String(r.rounds).padStart(5)}  ${String(r.wins).padStart(4)}  ${pct(r.winRate, 1).padStart(6)}  ${signed(r.net, 2).padStart(8)}  ${(signed(r.roi * 100, 2) + '%').padStart(7)}  ${ci}`
      );
    }
    console.log('');
    console.log('  Every row converges on the same number: the house edge.');
  }

  // Append the full ledger so the scoreboard survives restarts.
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const stamp = new Date().toISOString();
  const lines = results.map((r) =>
    JSON.stringify({
      ts: stamp,
      strategy: r.strategy,
      cashout: r.cashout,
      stake: r.stake,
      rounds: r.rounds,
      rounds: r.rounds,
      wins: r.wins,
      losses: r.losses,
      winRate: +r.winRate.toFixed(6),
      net: r.net,
      roi: +r.roi.toFixed(6),
      maxDrawdown: r.maxDrawdown,
    })
  );
  fs.appendFileSync(OUT_FILE, lines.join('\n') + '\n');

  // Machine-readable dump of the last run for the scoreboard page.
  const summary = { generatedAt: stamp, rounds: rounds.length, cashout, stake, results: results.map(({ detail, ...rest }) => rest) };
  fs.writeFileSync(path.join(ROOT, 'data', 'paper-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n  ledger appended -> ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`  summary written -> data/paper-summary.json`);
}

if (require.main === module) main();

module.exports = { simulate, loadRounds, settle, bootstrapROI };
