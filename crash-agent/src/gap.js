#!/usr/bin/env node
// Builds gap.html — the per-bet vs per-session gap, and ruin by stake size.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'experiment.json'), 'utf8'));
const allin = d.results[0];

// ---- ruin-vs-fraction chart -------------------------------------------------
const W = 800, H = 230, PL = 58, PR = 22, PT = 16, PB = 40;
const fracs = d.results.map((r) => r.f);
const xOf = (i) => PL + (i / (fracs.length - 1)) * (W - PL - PR);
const yOf = (p) => PT + (1 - p) * (H - PT - PB);
const pts = d.results.map((r, i) => [xOf(i), yOf(r.ruinRate)]);
const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const area = `${pts[0][0].toFixed(1)},${yOf(0).toFixed(1)} ${line} ${pts[pts.length - 1][0].toFixed(1)},${yOf(0).toFixed(1)}`;

const yGrid = [0, 0.25, 0.5, 0.75, 1]
  .map((p) => {
    const y = yOf(p);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="#2a3540" stroke-width="1" opacity=".7"/>
      <text x="${PL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8b98a5">${(p * 100).toFixed(0)}%</text>`;
  })
  .join('');

const xLabels = d.results
  .map((r, i) => `<text x="${xOf(i).toFixed(1)}" y="${H - PB + 15}" text-anchor="middle" font-size="9.5" fill="#8b98a5">${r.label.replace(' (all-in)', '')}</text>`)
  .join('');
const dots = d.results
  .map((r, i) => {
    const x = xOf(i), y = yOf(r.ruinRate);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="#f87171"/>
      <text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#e6edf3">${(r.ruinRate * 100).toFixed(r.ruinRate < 0.01 ? 2 : 1)}%</text>`;
  })
  .join('');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #0b0f14; }
  body { font-family: var(--font-sans, system-ui, sans-serif); color: #e6edf3; font-size: 13px; }
  h2 { font-size: 15px; margin: 0 0 3px; font-weight: 650; }
  .sub { color: #8b98a5; margin: 0 0 16px; font-size: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi { border: 1px solid #2a3540; border-radius: 10px; padding: 10px 12px; }
  .k { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #8b98a5; }
  .v { font-size: 18px; font-weight: 650; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card { border: 1px solid #2a3540; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8b98a5; margin: 0 0 12px; font-weight: 600; }
  .barrow { margin-bottom: 14px; }
  .barlabel { display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 5px; }
  .track { position: relative; height: 16px; background: #131b24; border-radius: 4px; overflow: hidden; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; }
  .tiny { min-width: 2px; }
  .green { background: #4ade80; } .red { background: #f87171; }
  svg { display: block; width: 100%; height: 230px; }
  .note { font-size: 12px; line-height: 1.55; color: #8b98a5; }
  .note b { color: #e6edf3; }
</style></head><body>
  <h2>Per-bet success vs session success</h2>
  <p class="sub">${d.totalBets} bets at ${d.cashout.toFixed(2)}×, stake = 100% of balance, ${d.sessions.toLocaleString()} simulated sessions.</p>

  <div class="kpis">
    <div class="kpi"><div class="k">bets won</div><div class="v" style="color:#4ade80">${(allin.betWinRate * 100).toFixed(2)}%</div></div>
    <div class="kpi"><div class="k">sessions in profit</div><div class="v" style="color:#f87171">${(allin.profitRate * 100).toFixed(2)}%</div></div>
    <div class="kpi"><div class="k">sessions ruined</div><div class="v" style="color:#f87171">${(allin.ruinRate * 100).toFixed(2)}%</div></div>
    <div class="kpi"><div class="k">median final balance</div><div class="v">${allin.medianFinal.toFixed(4)}×</div></div>
  </div>

  <div class="card">
    <h3>Same experiment, two different success rates</h3>
    <div class="barrow">
      <div class="barlabel"><span>Individual bets won</span><span style="color:#4ade80">${(allin.betWinRate * 100).toFixed(2)}%</span></div>
      <div class="track"><div class="fill green" style="width:${(allin.betWinRate * 100).toFixed(2)}%"></div></div>
    </div>
    <div class="barrow" style="margin-bottom:0">
      <div class="barlabel"><span>Sessions that ended in profit</span><span style="color:#f87171">${(allin.profitRate * 100).toFixed(2)}%</span></div>
      <div class="track"><div class="fill red tiny" style="width:${(allin.profitRate * 100).toFixed(2)}%"></div></div>
    </div>
    <p class="note" style="margin-bottom:0;margin-top:12px">The second bar is almost invisible. It is not a rounding error — it is the result.</p>
  </div>

  <div class="card">
    <h3>Ruin probability by stake fraction</h3>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${yGrid}
      ${xLabels}
      <polygon points="${area}" fill="rgba(248,113,113,.10)" />
      <polyline points="${line}" fill="none" stroke="#f87171" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      ${dots}
    </svg>
    <p class="note" style="margin-bottom:0">All-in is the only arm that reliably reaches zero. Smaller stakes reduce ruin but do not create an edge — the expected loss simply scales with the amount wagered.</p>
  </div>

  <div class="card">
    <h3>For the write-up</h3>
    <p class="note" style="margin-bottom:0">The protocol has one parameter that decides the outcome: <b>the fraction of balance staked per bet</b>. The cash-out, the spacing of the bets, and the win rate are all fixed by the game. Note also that <b>P(profit) stays near 14%</b> across every fractional arm while the all-in arm collapses to <b>${(allin.profitRate * 100).toFixed(2)}%</b> — a clean demonstration that stake sizing changes survival, not expectation.</p>
  </div>
</body></html>`;

fs.writeFileSync(path.join(ROOT, 'gap.html'), html);
console.log('gap.html written');
