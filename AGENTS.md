# AGENTS.md: Mandatory Directives for AI Agents

> [!CRITICAL]
> **READ BEFORE TOUCHING ANY CODE OR STATE IN THIS WORKSPACE.**

## 1. Strict Immutability Rule
Every AI agent operating in this repository is strictly barred from modifying, rewriting, loosening, or altering:
1. The **`1.02×`** Auto Cash Out multiplier.
2. The **100% All-In** capital allocation rule.
3. The **Continuous Active Hunting** cadence (no hourly throttle; scans and executes 24/7).
4. The **Red ➔ Moon Trigger Pattern**:
   - Round $N-1$: Red (`1.00× – 1.99×`). Prior rounds do not matter.
   - Round $N$: Moon (`≥ 10.00×`).
   - Round $N+1$: Stake executed on the immediate round following the Moon crash.
5. The **Pre-Flight Lag & Motion Sentinel**:
   - Tracks live animation frame rate via `requestAnimationFrame`.
   - Any frame gap $\Delta t > 200\text{ms}$ halts bet placement until 3 seconds of clean flight elapse.
6. The **Emergency Queued Bet Cancellation Engine**:
   - Clicks "Cancel" immediately if lag spikes or pattern invalidation occurs while a bet is queued.
   - Resets stake to 0 for absolute capital safety.

**AN AGENT HAS ZERO AUTHORITY TO CHANGE THESE RULES UNLESS THE HUMAN USER SPECIFICALLY AND UNAMBIGUOUSLY ORDERS AN EXACT MODIFICATION.**

## 2. In-Page Zero-Token Operations
* The active engine runs in the Chromium DOM (`window.__crash_bot_interval` and `window.__crash_bot_raf`).
* **Never** run continuous polling loops or sleep intervals using tool calls in chat. Doing so burns user API credits without purpose.
* Inspect state using single-shot `preview_evaluate` calls only when answering direct user questions or verifying system health.

## 3. Disaster Recovery
If the server or system restarted:
1. Check tab with `preview_status`.
2. Open BC.Game Crash tab: `https://bc.game/game/crash`.
3. Evaluate `crash-agent/src/in-page-engine.js` into active tab.
4. Confirm `#_crash_bot_panel` mounts and reports `RED ➔ MOON PROTOCOL (1.02×)` and `CONTINUOUS`.
