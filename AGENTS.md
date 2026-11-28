# AGENTS.md: Mandatory Directives for AI Agents

> [!CRITICAL]
> **READ BEFORE TOUCHING ANY CODE OR STATE IN THIS WORKSPACE.**

## 1. Strict Immutability Rule
Every AI agent operating in this repository is strictly barred from modifying, rewriting, loosening, or altering:
1. The **`1.02×`** Auto Cash Out multiplier.
2. The **100% All-In** capital allocation rule.
3. The **Continuous Active Hunting** cadence (no hourly throttle; scans and executes 24/7).
4. The **4+ Red ➔ Green/Moon Trigger Pattern** (replaces the former Red ➔ Moon pattern):
   - Track **consecutive Red rounds** (`1.00× – 1.99×`). Rounds before the streak do not matter.
   - Arm only when the streak has reached **at least 4** consecutive reds (4, 5, 6, …).
   - The **first non-red round after the streak** must be Green (`2.00× – 9.99×`) or Moon (`10.00× – 99.00×`). If it is Red, the streak simply continues.
   - Commit on the round **immediately after** that Green/Moon round.
   - If that Green/Moon round is a **Moon above `99.00×`**, **skip the would-be commit round entirely** and restart tracking from zero.
   - Startup / reload: tracking **always begins from zero**; pre-existing pills are ignored.
   - Missing or unreadable round data between the trigger and the commit round: **skip and wait for a fresh pattern**.
5. The **Pre-Flight Lag & Motion Sentinel**:
   - Tracks live animation frame rate via `requestAnimationFrame`.
   - Any frame gap $\Delta t > 200\text{ms}$ halts order placement until 3 seconds of clean flight elapse.
6. The **Emergency Queued Order Cancellation Engine**:
   - Clicks "Cancel" immediately if lag spikes, the commit round is unreadable, or the pattern resets while an order is queued.
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
4. Confirm `#__crash_bot_panel` (alias `window._crash_bot_panel`) mounts and reports `4+ RED -> GREEN/MOON PROTOCOL (1.02×)` and `CONTINUOUS`.
