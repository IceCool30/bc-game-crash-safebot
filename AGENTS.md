# AGENTS.md: Mandatory Directives for AI Agents

> [!CRITICAL]
> **READ BEFORE TOUCHING ANY CODE OR STATE IN THIS WORKSPACE.**

## 1. Strict Immutability Rule
Every AI agent operating in this repository is strictly barred from modifying, rewriting, loosening, or altering:
1. The **`1.02×`** Auto Cash Out multiplier.
2. The **100% All-In** capital allocation rule.
3. The **Strictly 1 Bet Per Hour** cadence limit (WAT UTC+1).
4. The **Zero Observation Lockout** (immediate arming at millisecond 0 of the hour).
5. The **Discrete 5-Round Sequence Block Protocol** (`1 of 5` $\to$ `5 of 5`).
6. The **Symmetric Dual-Color Guardrail** (minimum 1 Amber $\ge 1.50\times$, minimum 1 Green $\ge 2.00\times$; pure-green or pure-amber 5/5 sequences must fail).
7. The **Hard Reset Rule** (any sub-$1.50\times$ crash or failed 5-round block terminates the sequence and resets to `1 of 5`).
8. The **Round 6 Execution Rule** (bet placed exclusively on the 6th round of a passed sequence).

**AN AGENT HAS ZERO AUTHORITY TO CHANGE THESE RULES UNLESS THE HUMAN USER SPECIFICALLY AND UNAMBIGUOUSLY ORDERS AN EXACT MODIFICATION.**

## 2. In-Page Zero-Token Operations
* The active engine runs in the Chromium DOM (`window.__crash_bot_interval`).
* **Never** run continuous polling loops or sleep intervals using tool calls in chat. Doing so burns user API credits without purpose.
* Inspect state using single-shot `preview_evaluate` calls only when answering direct user questions or verifying system health.

## 3. Disaster Recovery
If the server or system restarted:
1. Check tab with `preview_status`.
2. Evaluate `crash-agent/src/in-page-engine.js` into `tab_a` (or active BC.Game Crash tab).
3. Confirm `#_crash_bot_panel` mounts and reports `HUNTING (READY)` or `IDLE`.
