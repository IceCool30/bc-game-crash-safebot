# BC.Game Crash SafeBot Protocol

An autonomous, provably-fair BC.Game Crash betting engine executing an ultra-conservative 1.02× compounding protocol, discrete 5-round sequence blocks, symmetric dual-color guardrails, zero-token in-page DOM tracking, and disaster-recovery cold starts.

---

## Key Features

* **Extreme Capital Preservation**: Anchored to `1.02×` auto cash out (~97.06% statistical win probability).
* **Discrete Sequence Block Engine**: Evaluates non-sliding 5-round blocks (`1 of 5` $\to$ `5 of 5`).
* **Symmetric Dual-Color Guardrails**: Prevents the Overheating Trap (5 pure greens) and Stagnation Trap (5 pure ambers) by requiring both colors in every qualifying block.
* **Hard Sequence Resets**: Any sub-$1.50\times$ crash or failed block immediately terminates; next round resets cleanly to `1 of 5`.
* **Zero-Token Chromium Injection**: Runs directly in the browser DOM via `setInterval`, consuming 0 LLM credits.
* **Real-Time HUD**: Real-time on-screen HUD displaying active sequence progress, balance, dual-color counts, and hour quota.
* **Strict Cadence**: Strictly 1 bet per hour maximum (aligned to West African Time, UTC+1).

---

## Repository Structure

* `crash-agent/src/in-page-engine.js`: The self-contained browser engine.
* `crash-agent/src/hourly.js`: Standalone Node.js CLI controller.
* `crash-agent/data/hourly.jsonl`: Permanent ledger of all placed bets and balance progression.
* `PROJECT_CORE.md`: Master architectural blueprint and immutable protocol specification.
* `AGENTS.md`: AI agent governance contract and immutability lock.

---

## Cold Start & Deployment

In the browser console or via preview automation tools:
1. Navigate to `https://bc.game/game/crash`.
2. Ensure you are logged into your account with available balance.
3. Inject `crash-agent/src/in-page-engine.js`.
4. The HUD will immediately appear on the bottom-right and start tracking from millisecond 0 of the current hour.
