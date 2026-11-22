# PROJECT CORE: BC.Game Crash SafeBot Protocol

> [!CAUTION]
> ### STRICT IMMUTABILITY DIRECTIVE
> **NO AGENT IS PERMITTED TO ALTER, REWRITE, LOOSEN, OR BYPASS ANY CORE RULE, THRESHOLD, OR CADENCE IN THIS PROJECT FOR ANY REASON.**
> Every agent inspecting or operating this repository is strictly barred from making changes to the core rules of this project or the underlying execution engines unless the human user explicitly and unambiguously commands an exact change.
> Regardless of personal judgment, theoretical optimization, simulated edge, or perceived urgency, an agent possesses **ZERO AUTHORITY** to modify these rules.

---

## 1. System Overview & Genesis

**BC.Game Crash SafeBot** is an institutional-grade, capital-preservation betting system specifically engineered for **BC.Game Crash** (`https://bc.game/game/crash`).

The project was created to solve the fundamental vulnerability of Crash games: **variance traps**. While the house edge is mathematically static (1%), multiplier distributions fluctuate wildly through heat cycles and stagnation cycles.

### The Strategic Edge:
* By anchoring our cashout to **`1.02×`**, the baseline probability of winning any single round is **`97.06%`** ($99 / 102$).
* By enforcing a **Discrete Sequence Block Protocol**, the engine enters only during verified momentum windows and filters out both the **Overheating Trap** (runs of pure green multipliers heading into a sub-1.10x crash) and the **Stagnation Trap** (runs of weak ambers with zero upward thrust).
* By enforcing a **Strict 1 Bet Per Hour Cadence**, the system limits exposure to 24 discrete events per day, yielding compound growth while minimizing drawdowns.

---

## 2. Immutable Operational Rules

| Rule | Specification | Guardrail Enforcement |
| :--- | :--- | :--- |
| **Auto Cash Out** | **`1.02×`** | Hardcoded. Never increased for "extra profit" or decreased below 1.02x. |
| **Stake Allocation** | **100% All-In Compounding** | Entire liquid balance is pre-staged continuously into `input[0]`. |
| **Cadence Limit** | **Maximum 1 Bet Per Hour** | Aligned to West African Time (`UTC+1`). Once 1 bet is settled, state locks in `IDLE` until top of next hour. |
| **Top-of-Hour Arming** | **Zero Observation Delay (0 min)** | Arms into `HUNTING (READY)` mode from millisecond 0 (`HH:00:00.000` WAT). |
| **Sequence Architecture** | **Discrete 5-Round Block** | Non-sliding block. Tracks strictly from `Round 1 of 5` to `Round 5 of 5`. |
| **Threshold Minimum** | **$\ge 1.50\times$ on All 5 Rounds** | Any crash $< 1.50\times$ immediately terminates the sequence; next round resets to `1 of 5`. |
| **Dual-Color Guardrail** | **Symmetric (Amber + Green)** | Must contain at least **1 Amber** ($1.50\times - 1.99\times$) AND at least **1 Green** ($\ge 2.00\times$). |
| **Trap Disqualification** | **$5/5$ Greens or $5/5$ Ambers** | If Round 5 completes with all pure Greens or all pure Ambers, sequence **FAILS & TERMINATES**. Reset to `1 of 5`. |
| **Execution Trigger** | **Round 6 Only** | Bet is placed exclusively on the **6th round** following a validated 5-round block. |

---

## 3. System Architecture & Components

```
bc-game-crash-safebot/
├── crash-agent/
│   ├── config.json              # Platform & logging configuration
│   ├── data/
│   │   ├── hourly.jsonl         # Permanent audit ledger of bets, balances, and PnL
│   │   └── rounds.jsonl         # Raw multiplier stream for historical distribution modeling
│   └── src/
│       ├── in-page-engine.js    # Self-contained in-page DOM Chromium engine (0 token burn)
│       └── hourly.js            # Node.js Playwright CLI controller for external automation
├── AGENTS.md                    # Agent governance contract and immutable rule enforcement
├── PROJECT_CORE.md              # Master architectural blueprint and protocol specifications
└── README.md                    # Project documentation, mathematical model, and quickstart
```

### In-Page DOM Engine (`in-page-engine.js`):
* Injected into the live game tab via `preview_evaluate`.
* Operates on an internal 1-second interval (`setInterval`).
* Consumes **zero LLM tokens / zero API credits** while continuously tracking and managing state in the background.
* Extracts crash history pills (`span.whitespace-nowrap.font-extrabold`) sorted descending by horizontal screen position (`b.x - a.x`), ensuring index 0 is always the newest round.
* Automatically syncs and pre-stages 100% of detected liquid NGN balance into the amount input.
* Mounts a real-time HUD (`#__crash_bot_panel`) displaying the active sequence progress (`X of 5`), sequence status, dual-color counts, and hour quota.

---

## 4. Disaster Recovery Runbook (Cold Restart)

When a host restarts, browser crashes, or the background session is severed:

1. **Verify Preview Tab**:
   Check active tabs with `preview_status`. If missing, open `https://bc.game/game/crash`.
2. **Verify Account Session**:
   Confirm user is logged in and liquid balance is displayed.
3. **Inject Engine**:
   Execute `crash-agent/src/in-page-engine.js` via `preview_evaluate`.
4. **Inspect HUD Panel**:
   Confirm `#_crash_bot_panel` mounts with active WAT clock, balance, and sequence counter.
5. **No Token Polling**:
   Do NOT run polling loops in chat. The in-page engine handles 100% of round tracking, sequence evaluation, bet execution, and settlement locally in Chromium.
