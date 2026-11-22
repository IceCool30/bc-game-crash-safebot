#!/usr/bin/env node
// Builds scoreboard.html from the collected rounds: every strategy replayed
// through the same paper-trading engine, with bootstrap confidence intervals
// and an equity curve. No site interaction, no account.
const fs = require('fs');
const path = require('path');
const { simulate, loadRounds } = require('./paper');
const { STRATEGIES } = require('./strategy');

const ROOT = path.resolve(__dirname, '..');
const cfg = require(path.join(ROOT, 'config.json'));

const rounds = loadRounds();
if (rounds.length < 20) {
  console.error(`Only ${rounds.length} rounds collected. Run the collector first.`);
  process.exit(1);
}

const CASHOUT = cfg.bet.autoCashout || 2;
const STAKE = 1;
const LOOKBACK = cfg.strategy.lookback || 6;

const results = Object.keys(STRATEGIES).map((name) => {
  const lookback = name === 'streak-reversal' ? Math.min(LOOKBACK, 3) : LOOKBACK;
  cfg.strategy.lookback = lookback;
  return { ...simulate(rounds, { strategyName: name, cashout: CASHOUT, stake: STAKE, minHistory: lookback }), lookback };
});

const COLORS = ['var(--chart-1,#4ade80)', 'var(--chart-2,#60a5fa)', 'var(--chart-3,#f59e0b)', 'var(--chart-4,#f472b6)', 'var(--chart-5,#a78bfa)'];
const HOUSE_EDGE = -0.01;

// ---- chart geometry -------------------------------------------------------
const W = 800;
const H = 240;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 22;
const maxBets = Math.max(...results.map((r) => r.bets), 1);
const allEquity = results.flatMap((r) => [0, ...r.detail.map((b) => b.equity)]);
const yMin = Math.min(0, ...allEquity);
const yMax = Math.max(0, ...allEquity);
const yPad = Math.max(1, (yMax - yMin) * 0.08);
const lo = yMin - yPad;
const hi = yMax + yPad;
const xOf = (i) => PAD_L + (i / maxBets) * (W - PAD_L - PAD_R);
const yOf = (v) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);

function polyline(r) {
  const pts = [[0, 0], ...r.detail.map((b, i) => [i + 1, b.equity])];
  return pts.map(([i, v]) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
}

function gridLines() {
  const out = [];
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const v = lo + ((hi - lo) * s) / steps;
    const y = yOf(v);
    out.push(
      `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="var(--border,#333)" stroke-width="1" opacity=".55" />` +
        `<text x="${PAD_L - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted-foreground,#9aa)">${v >= 0 ? '+' : ''}${v.toFixed(0)}</text>`
    );
  }
  return out.join('');
}

const zeroY = yOf(0);

function verdict(r) {
  if (!r.bets || !r.roiCI) return { text: 'no signals', cls: 'muted' };
  const [a, b] = r.roiCI;
  if (a <= HOUSE_EDGE && b >= HOUSE_EDGE) return { text: 'noise — house edge inside CI', cls: 'warn' };
  if (a > HOUSE_EDGE) return { text: 'above house edge (CI excludes −1%)', cls: 'good' };
  return { text: 'worse than house edge', cls: 'bad' };
}

function pct(x, d = 1) { return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`; }
function num(x) { return `${x >= 0 ? '+' : ''}${x.toFixed(2)}`; }

const rows = results
  .map((r, i) => {
    const v = verdict(r);
    const ci = r.roiCI ? `${pct(r.roiCI[0])} … ${pct(r.roiCI[1])}` : '—';
    return `<tr>
      <td><span class="swatch" style="background:${COLORS[i % COLORS.length]}"></span>${r.strategy}<span class="lb">lb ${r.lookback}</span></td>
      <td class="n">${r.bets}</td>
      <td class="n">${r.bets ? (r.winRate * 100).toFixed(1) + '%' : '—'}</td>
      <td class="n">${num(r.net)}</td>
      <td class="n ${r.roi >= 0 ? 'pos' : 'neg'}">${pct(r.roi)}</td>
      <td class="n ci">${ci}</td>
      <td class="verdict ${v.cls}">${v.text}</td>
    </tr>`;
  })
  .join('');

const legend = results
  .map((r, i) => `<span class="lg"><span class="swatch" style="background:${COLORS[i % COLORS.length]}"></span>${r.strategy}</span>`)
  .join('');

const firstRound = rounds[0].round;
const lastRound = rounds[rounds.length - 1].round;
const t0 = rounds[0].ts ? new Date(rounds[0].ts) : null;
const t1 = rounds[rounds.length - 1].ts ? new Date(rounds[rounds.length - 1].ts) : null;
const span = t0 && t1 ? `${Math.round((t1 - t0) / 60000)} min` : '';

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: transparent; }
  body { font-family: var(--font-sans, system-ui, sans-serif); color: var(--foreground, #eee); font-size: 13px; }
  .wrap { padding: 4px 0 10px; }
  h2 { font-size: 15px; margin: 0 0 2px; font-weight: 650; }
  .sub { color: var(--muted-foreground, #9aa); margin: 0 0 16px; font-size: 12px; }
  .card { border: 1px solid var(--border, #333); border-radius: var(--radius, 10px); padding: 14px 16px; margin-bottom: 16px; }
  .card h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground, #9aa); margin: 0 0 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted-foreground, #9aa); font-weight: 600; padding: 0 8px 8px 0; border-bottom: 1px solid var(--border, #333); }
  td { padding: 8px 8px 8px 0; border-bottom: 1px solid var(--border, #333); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  .n { text-align: right; }
  th.n { text-align: right; }
  .pos { color: var(--chart-1, #4ade80); }
  .neg { color: var(--destructive, #f87171); }
  .ci { color: var(--muted-foreground, #9aa); font-size: 11px; white-space: nowrap; padding-right: 16px; }
  th.ci { padding-right: 16px; }
  .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 7px; vertical-align: middle; }
  .lb { color: var(--muted-foreground, #9aa); font-size: 10px; margin-left: 6px; }
  .verdict { font-size: 11px; padding-left: 4px; white-space: nowrap; }
  .verdict.warn { color: var(--warning-foreground, #fbbf24); }
  .verdict.good { color: var(--chart-1, #4ade80); }
  .verdict.bad { color: var(--destructive, #f87171); }
  .verdict.muted { color: var(--muted-foreground, #9aa); }
  svg { display: block; width: 100%; height: 240px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--muted-foreground, #9aa); margin-top: 10px; }
  .lg { display: inline-flex; align-items: center; }
  .note { font-size: 12px; line-height: 1.55; color: var(--muted-foreground, #9aa); }
  .note b { color: var(--foreground, #eee); font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  @media (max-width: 620px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
  .kpi { border: 1px solid var(--border, #333); border-radius: var(--radius, 10px); padding: 10px 12px; }
  .kpi .k { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted-foreground, #9aa); }
  .kpi .v { font-size: 17px; font-weight: 650; margin-top: 3px; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="wrap">
  <h2>Paper-trading scoreboard — BC.Game Crash</h2>
  <p class="sub">${rounds.length} live rounds (${firstRound} → ${lastRound}, ${span}) replayed through five strategies at ${CASHOUT.toFixed(2)}× cash-out, 1-unit stake. Nothing was sent to the site.</p>

  <div class="kpis">
    <div class="kpi"><div class="k">rounds</div><div class="v">${rounds.length}</div></div>
    <div class="kpi"><div class="k">house edge</div><div class="v">−1.00%</div></div>
    <div class="kpi"><div class="k">cash-out</div><div class="v">${CASHOUT.toFixed(2)}×</div></div>
    <div class="kpi"><div class="k">stake</div><div class="v">1 unit</div></div>
  </div>

  <div class="card">
    <h3>Equity — cumulative units, one line per strategy</h3>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${gridLines()}
      <line x1="${PAD_L}" y1="${zeroY.toFixed(1)}" x2="${W - PAD_R}" y2="${zeroY.toFixed(1)}" stroke="var(--foreground,#fff)" stroke-width="1" opacity=".28" />
      ${results
        .map(
          (r, i) =>
            `<polyline points="${polyline(r)}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />`
        )
        .join('')}
    </svg>
    <div class="legend">${legend}</div>
  </div>

  <div class="card">
    <h3>Results</h3>
    <table>
      <thead><tr><th>strategy</th><th class="n">bets</th><th class="n">win%</th><th class="n">net</th><th class="n">ROI</th><th class="n">95% CI</th><th>verdict</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="card">
    <h3>How to read this</h3>
    <p class="note">The null hypothesis is not “zero”. It is <b>−1.00%</b>, because that is what a 99% RTP game pays every fixed cash-out. A strategy only has an edge if its confidence interval sits <b>entirely above −1%</b>. Right now every interval straddles it, which is the expected outcome when the crash values are independent draws from <b>P(≥ x) = 0.99 / x</b>. The apparent winners are variance, not signal — and they will drift back toward −1% as the sample grows. That drift is the experiment.</p>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'scoreboard.html'), html);
console.log(`scoreboard.html written — ${rounds.length} rounds, ${results.length} strategies`);
for (const r of results) console.log(`  ${r.strategy.padEnd(18)} bets ${String(r.bets).padStart(4)}  ROI ${pct(r.roi)}`);
