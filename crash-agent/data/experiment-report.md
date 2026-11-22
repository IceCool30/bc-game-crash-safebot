# Experiment report — fixed-cash-out staking protocol

Generated: 2026-11-22T14:48:01.997Z

## Protocol

| Parameter | Value |
| --- | --- |
| Game | BC.Game Crash |
| Auto cash-out | 1.01x |
| P(win one bet) | 98.0198% — from 0.99 / 1.01 |
| P(lose one bet) | 1.9802% |
| Edge per bet | -1.00% |
| Bets per hour | 2 |
| Session length | 5 days = 240 bets |
| Sessions simulated | 20,000 |
| Ruin definition | final balance below 1% of starting balance |

## Results

| Stake fraction | Per-bet win rate | Ruin (<1%) | Below 10% | In profit | Median final | Mean final | 5th pct | 95th pct | Avg max drawdown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100% (all-in) | 98.04% | **99.08%** | 99.08% | 0.92% | 0.0000x | 0.1008x | 0.0000x | 0.0000x | 99.1% |
| 50% | 98.02% | **5.04%** | 34.24% | 4.81% | 0.1009x | 0.3021x | 0.0062x | 0.8193x | 85.7% |
| 25% | 98.02% | **0.00%** | 1.00% | 14.17% | 0.4267x | 0.5471x | 0.1337x | 1.0191x | 59.5% |
| 10% | 98.02% | **0.00%** | 0.00% | 14.37% | 0.7468x | 0.7866x | 0.5428x | 1.0275x | 29.5% |
| 5% | 98.01% | **0.00%** | 0.00% | 14.19% | 0.8702x | 0.8858x | 0.7074x | 1.0165x | 15.9% |
| 1% | 98.02% | **0.00%** | 0.00% | 14.25% | 0.9736x | 0.9764x | 0.9444x | 1.0037x | 3.4% |

## The finding that matters

The per-bet success rate is **98.04%** in every arm — it is a property of the game, not of the stake size.
But the session success rate in the all-in arm is **0.92%**.

That gap is the whole experiment. A report that records "98% of bets won" and stops there
will describe a strategy that actually ends in profit 0.92% of the time.
Both numbers are true. Only the second one describes what happens to the bankroll.

## Why stake size changes the result but not the edge

Every arm has the same edge per bet (-1.00%). What changes is how much is wagered,
and the house edge is charged on the amount wagered, not on the balance.

| Stake fraction | Mean total wagered | Mean final balance | Expected loss |
| --- | --- | --- | --- |
| 100% (all-in) | 93.04x | 0.1008x | 89.9% |
| 50% | 69.90x | 0.3021x | 69.8% |
| 25% | 45.21x | 0.5471x | 45.3% |
| 10% | 21.35x | 0.7866x | 21.3% |
| 5% | 11.30x | 0.8858x | 11.4% |
| 1% | 2.37x | 0.9764x | 2.4% |

All-in maximizes the amount wagered in every session, which is why it maximizes the expected loss.
Reducing the stake fraction lowers ruin probability but does not create an edge:
there is no fraction at which the expected value turns positive.

## Control-arm note

Fractional staking cannot reach a zero balance, so "ruin" is defined as dropping below 1% of
the starting balance. The all-in arm does reach zero, and does so quickly:
the median session in that arm ends at 0.0000x.

---

Simulation runtime: 1.0s. Deterministic inputs, seeded from Math.random.