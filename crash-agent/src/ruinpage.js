#!/usr/bin/env node
// Builds ruin.html from data/allin-summary.json — the survival curve for
// "all-in at 1.01x, twice an hour, for five days".
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'allin-summary.json'), 'utf8'));

const W = 800, H = 280;
const PL = 52, PR = 16, PT = 14, PB = 30;
const DAYS = s.days;
const LOG_MIN = -3; // 0.1%
const xOf = (d) => PL + (d / DAYS) * (W - PL - PR);
const yOf = (p) => PT + (1 - (Math.log10(Math.max(p, 1e-6)) - LOG_MIN) / (0 - LOG_MIN)) * (H - PT - PB);

// fine-grained survival points
const pts = [];
for (let d = 0; d <= DAYS; d += 0.125) {
  const n = d * 24 * s.betsPerHour;
  pts.push([d, Math.pow(s.pWin, n)]);
}
const line = pts.map(([d, p]) => `${xOf(d).toFixed(1)},${yOf(p).toFixed(1)}`).join(' ');
const area = `${PL},${yOf(0).toFixed(1)} ` + line + ` ${xOf(DAYS).toFixed(1)},${yOf(0).toFixed(1)}`;

const grid = [1, 0.1, 0.01, 0.001]
  .map((p) => {
    const y = yOf(p);
    const label = p === 1 ? '100%' : `${(p * 100).toFixed(p < 0.01 ? 1 : 0)}%`;
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="var(--border,#2a3540)" stroke-width="1" opacity=".7"/>
      <text x="${PL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--muted-foreground,#8b98a5)">${label}</text>`;
  })
  .join('');

const xTicks = [];
for (let d = 0; d <= DAYS; d++) {
  xTicks.push(`<line x1="${xOf(d).toFixed(1)}" y1="${PT}" x2="${xOf(d).toFixed(1)}" y2="${H - PB}" stroke="var(--border,#2a3540)" stroke-width="1" opacity=".45"/>
    <text x="${xOf(d).toFixed(1)}" y="${H - PB + 14}" text-anchor="middle" font-size="9.5" fill="var(--muted-foreground,#8b98a5)">day ${d}</text>`);
}

const marks = s.survivalByDay
  .filter((d) => d.day > 0)
  .map((d, i, arr) => {
    const x = xOf(d.day), y = yOf(d.p);
    const last = i === arr.length - 1;
    const lx = last ? x - 7 : x + 6;
    const anchor = last ? 'end' : 'start';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--chart-1,#4ade80)"/>
      <text x="${lx.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="${anchor}" font-size="9.5" fill="var(--foreground,#e6edf3)">${(d.p * 100).toFixed(d.p < 0.01 ? 2 : 1)}%</text>`;
  })
  .join('');

const surviveAll = Math.pow(s.pWin, s.totalBets);
const jackpot = Math.pow(s.cashout, s.totalBets);
const ruinExact = 1 - surviveAll;
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #0b0f14; }
  body { font-family: var(--font-sans, system-ui, sans-serif); color: #e6edf3; font-size: 13px; padding: 0; }
  h2 { font-size: 15px; margin: 0 0 3px; font-weight: 650; }
  .sub { color: #8b98a5; margin: 0 0 16px; font-size: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi { border: 1px solid #2a3540; border-radius: 10px; padding: 10px 12px; }
  .k { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #8b98a5; }
  .v { font-size: 18px; font-weight: 650; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card { border: 1px solid #2a3540; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8b98a5; margin: 0 0 10px; font-weight: 600; }
  svg { display: block; width: 100%; height: 280px; }
  .trade { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .trade > div { border: 1px solid #2a3540; border-radius: 8px; padding: 10px 12px; }
  .trade .big { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 2px 0; }
  .red { color: #f87171; } .green { color: #4ade80; }
  .note { font-size: 12px; line-height: 1.55; color: #8b98a5; }
  .note b { color: #e6edf3; }
</style></head><body>
  <h2>All-in at 1.01× — 2 bets/hour for 5 days</h2>
  <p class="sub">Stake = 100% of balance. ${s.totalBets} bets. ${(s.pWin * 100).toFixed(2)}% chance of winning each one.</p>

  <div class="kpis">
    <div class="kpi"><div class="k">ruin by day 5</div><div class="v red">${(ruinExact * 100).toFixed(2)}%</div></div>
    <div class="kpi"><div class="k">finish in profit</div><div class="v green">${(surviveAll * 100).toFixed(2)}%</div></div>
    <div class="kpi"><div class="k">EV per bet</div><div class="v">−1.00%</div></div>
    <div class="kpi"><div class="k">expected final</div><div class="v">${s.meanFinal.toFixed(3)}×</div></div>
  </div>

  <div class="card">
    <h3>Probability the run is still alive</h3>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${grid}
      ${xTicks.join('')}
      <polygon points="${area}" fill="rgba(74,222,128,.10)" />
      <polyline points="${line}" fill="none" stroke="var(--chart-1,#4ade80)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      ${marks}
    </svg>
  </div>

  <div class="card">
    <h3>The trade</h3>
    <div class="trade">
      <div><div class="k">if you survive all ${s.totalBets} bets</div><div class="big green">${jackpot.toFixed(2)}×</div><div class="k">probability ${(surviveAll * 100).toFixed(2)}%</div></div>
      <div><div class="k">expected outcome across all paths</div><div class="big red">${s.meanFinal.toFixed(3)}×</div><div class="k">i.e. you lose ${((1 - s.meanFinal) * 100).toFixed(0)}% in expectation</div></div>
    </div>
  </div>

  <div class="card">
    <h3>Why it feels safe</h3>
    <p class="note">At 1.01× the bet wins <b>${(s.pWin * 100).toFixed(2)}%</b> of the time, so the first ten bets look like free money — and they are, until the one round that crashes at <b>1.00×</b>. All-in staking means a single 1.98% event is terminal. The collected rounds already contain <b>${s.real ? s.real.losses : 0}</b> such rounds in ${s.real ? s.real.n : 0}: the strategy would have been wiped out during data collection alone. The house edge is only 1% per bet, but compounding it over ${s.totalBets} all-in bets leaves you with <b>${s.meanFinal.toFixed(3)}×</b> of what you started.</p>
  </div>
</body></html>`;

fs.writeFileSync(path.join(ROOT, 'ruin.html'), html);
console.log('ruin.html written');
