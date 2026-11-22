// Pattern strategies. Each takes the list of recent multipliers (oldest -> newest)
// and returns a signal for the NEXT round. None of these can beat a 99% RTP game
// on average; they exist so the experiment can measure that honestly.
const config = require('path').resolve(__dirname, '..', 'config.json');
const cfg = require(config);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function streakReversal(history) {
  const { lookback, lowThreshold, highThreshold } = cfg.strategy;
  const window = history.slice(-lookback);
  if (window.length < lookback) return { signal: 'skip', reason: 'not enough history' };
  const lows = window.filter((x) => x < lowThreshold).length;
  const highs = window.filter((x) => x >= highThreshold).length;
  if (lows === lookback) return { signal: 'long', reason: `${lookback} lows in a row -> expect rebound` };
  if (highs === lookback) return { signal: 'short', reason: `${lookback} highs in a row -> expect regression` };
  return { signal: 'skip', reason: 'no clean streak' };
}

function movingAverage(history) {
  const { lookback, lowThreshold, highThreshold } = cfg.strategy;
  const window = history.slice(-lookback);
  if (window.length < lookback) return { signal: 'skip', reason: 'not enough history' };
  const avg = mean(window);
  if (avg < lowThreshold) return { signal: 'long', reason: `avg ${avg.toFixed(2)} < ${lowThreshold}` };
  if (avg >= highThreshold) return { signal: 'short', reason: `avg ${avg.toFixed(2)} >= ${highThreshold}` };
  return { signal: 'skip', reason: `avg ${avg.toFixed(2)} neutral` };
}

function lastFollow(history) {
  const last = history[history.length - 1];
  if (last == null) return { signal: 'skip', reason: 'no history' };
  return last >= 2 ? { signal: 'long', reason: 'last was high -> follow' } : { signal: 'short', reason: 'last was low -> follow' };
}

function lastReverse(history) {
  const last = history[history.length - 1];
  if (last == null) return { signal: 'skip', reason: 'no history' };
  return last >= 2 ? { signal: 'short', reason: 'last was high -> reverse' } : { signal: 'long', reason: 'last was low -> reverse' };
}

function alwaysLong() {
  return { signal: 'long', reason: 'baseline: always bet high' };
}

const STRATEGIES = { 'streak-reversal': streakReversal, 'moving-average': movingAverage, 'last-follow': lastFollow, 'last-reverse': lastReverse, 'always-long': alwaysLong };

function decide(history) {
  const fn = STRATEGIES[cfg.strategy.name] || streakReversal;
  const out = fn(history);
  return { ...out, strategy: cfg.strategy.name };
}

module.exports = { decide, STRATEGIES };
