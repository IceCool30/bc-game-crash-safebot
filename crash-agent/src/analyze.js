// Statistical analysis of collected Crash rounds.
// Answers one question honestly: does the recent history predict the next round?
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(ROOT, 'data', 'rounds.jsonl');

function load() {
  if (!fs.existsSync(DATA)) return [];
  const byRound = new Map();
  for (const line of fs.readFileSync(DATA, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (Number.isFinite(r.round) && Number.isFinite(r.mult)) byRound.set(r.round, r);
    } catch {}
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1 || 1));
};
const corr = (a, b) => {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
};

// Two-sided permutation p-value for a statistic.
function permTest(xs, ys, stat, iters = 5000) {
  const observed = Math.abs(stat(xs, ys));
  let hits = 0;
  const y = ys.slice();
  for (let i = 0; i < iters; i++) {
    for (let j = y.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [y[j], y[k]] = [y[k], y[j]];
    }
    if (Math.abs(stat(xs, y)) >= observed) hits++;
  }
  return (hits + 1) / (iters + 1);
}

function main() {
  const rows = load();
  const n = rows.length;
  if (n < 20) {
    console.log(`Only ${n} rounds collected. Need at least ~20 for a first look, 200+ for anything meaningful.`);
  }
  const m = rows.map((r) => r.mult);
  console.log('=== COLLECTED DATA ===');
  console.log('rounds:', n);
  if (!n) return;
  console.log('first round:', rows[0].round, ' last round:', rows[n - 1].round);
  console.log('mean multiplier:', mean(m).toFixed(3), ' median:', [...m].sort((a, b) => a - b)[Math.floor(n / 2)]);
  console.log('min:', Math.min(...m), ' max:', Math.max(...m));
  console.log('share >= 2.00x:', (m.filter((x) => x >= 2).length / n).toFixed(3), '(fair-game expectation 0.495)');
  console.log('share >= 10x:', (m.filter((x) => x >= 10).length / n).toFixed(3), '(expectation 0.099)');

  // Theoretical check: P(X >= x) = 0.99 / x
  console.log('\n=== DISTRIBUTION vs THEORY (P(crash >= x) = 0.99/x) ===');
  for (const x of [1.5, 2, 3, 5, 10]) {
    const emp = m.filter((v) => v >= x).length / n;
    console.log(`x=${x}: observed ${emp.toFixed(3)}  theory ${(0.99 / x).toFixed(3)}`);
  }

  if (n < 30) {
    console.log('\n(Too few rounds for predictive tests. Let the collector run longer.)');
    return;
  }

  console.log('\n=== AUTOCORRELATION (does this round depend on earlier ones?) ===');
  for (let lag = 1; lag <= Math.min(10, Math.floor(n / 5)); lag++) {
    const a = m.slice(0, n - lag);
    const b = m.slice(lag);
    console.log(`lag ${lag}: r = ${corr(a, b).toFixed(4)}`);
  }

  console.log('\n=== CONDITIONAL TEST: P(next >= 2.00x | last k rounds < 1.50x) ===');
  const base = m.filter((v) => v >= 2).length / n;
  console.log('base rate P(>=2.00x):', base.toFixed(3));
  for (const k of [1, 2, 3, 4, 5]) {
    const hits = [];
    for (let i = k; i < n; i++) {
      const prev = m.slice(i - k, i);
      if (prev.every((v) => v < 1.5)) hits.push(m[i] >= 2 ? 1 : 0);
    }
    if (!hits.length) continue;
    const p = mean(hits);
    console.log(`after ${k} low round(s): n=${hits.length}  P(>=2.00x)=${p.toFixed(3)}  (base ${base.toFixed(3)})`);
  }

  console.log('\n=== CONDITIONAL TEST: P(next >= 2.00x | last k rounds >= 2.00x) ===');
  for (const k of [1, 2, 3]) {
    const hits = [];
    for (let i = k; i < n; i++) {
      const prev = m.slice(i - k, i);
      if (prev.every((v) => v >= 2)) hits.push(m[i] >= 2 ? 1 : 0);
    }
    if (!hits.length) continue;
    console.log(`after ${k} high round(s): n=${hits.length}  P(>=2.00x)=${mean(hits).toFixed(3)}  (base ${base.toFixed(3)})`);
  }

  console.log('\n=== PERMUTATION TEST: is lag-1 correlation real? ===');
  const a1 = m.slice(0, n - 1);
  const b1 = m.slice(1);
  const p = permTest(a1, b1, corr);
  console.log('lag-1 |r| =', Math.abs(corr(a1, b1)).toFixed(4), ' permutation p =', p.toFixed(4));
  console.log(p < 0.05 ? '  -> statistically notable (but check multiple testing)' : '  -> indistinguishable from random noise');

  console.log('\n=== WHAT THE HOUSE EDGE MEANS ===');
  console.log('For any fixed auto-cashout c, EV per 1 unit staked = 0.99 - 1 = -0.01 (-1%).');
  console.log('Changing c changes variance, not expectation. Compounding more rounds loses faster.');
}

main();
