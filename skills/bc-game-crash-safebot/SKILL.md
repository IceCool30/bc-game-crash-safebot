---
name: bc-game-crash-safebot
description: Autonomous BC.Game Crash engine executing the continuous Red -> Moon 1.02x protocol with in-page animation frame lag detection, emergency queued order abort, and zero-token DOM operations. Automatically inspects the browser, injects the in-page engine, and confirms active hunting immediately upon skill invocation, even without any user prompt.
---

# BC.Game Crash SafeBot: Red ➔ Moon Protocol

> [!CAUTION]
> **CRITICAL ARCHITECTURAL DIRECTIVE FOR ALL AGENTS**
> Every AI agent operating in this project is strictly barred from modifying the `1.02×` cashout target, the 100% All-In stake allocation, the `Red -> Moon` trigger pattern, the lag motion sentinel, or the emergency queued order cancellation engine. Only the human user has authority to order alterations.

---

## ⚡ Immediate Autonomous Action Directive

> [!IMPORTANT]
> **TRIGGER-AND-EXECUTE BEHAVIOR (NO PROMPT REQUIRED):**
> When this skill is invoked—whether accompanied by a user prompt or sent as a blank/standalone skill invocation—the AI agent must NOT pause to ask questions, explain background theory, or wait for further input.
> 
> The agent must **immediately and autonomously execute the 3-step activation workflow**:
> 
> 1. **Inspect / Open Browser Tab**:
>    * Call `preview_status` to inspect current browser tabs.
>    * If no active tab is at `https://bc.game/game/crash`, call `preview_open` with `url: "https://bc.game/game/crash"`, `profileId: "default"`.
> 
> 2. **Inject the Autonomous In-Page Engine**:
>    * Read the engine script: [`crash-agent/src/in-page-engine.js`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/crash-agent/src/in-page-engine.js) (or [`skills/bc-game-crash-safebot/scripts/in-page-engine.js`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/skills/bc-game-crash-safebot/scripts/in-page-engine.js)).
>    * Evaluate the full script into the BC.Game Crash page using `preview_evaluate`.
> 
> 3. **Verify and Confirm Active Hunting**:
>    * Call `preview_evaluate` with expression `document.getElementById('__crash_bot_panel')?.innerText` to verify that the floating HUD card mounted.
>    * Verify that the HUD confirms:
>      * `RED ➔ MOON PROTOCOL (1.02×)`
>      * `CONTINUOUS`
>      * `Phase: HUNTING`
>      * Smooth frame rate (`🟢 Smooth`)
>    * Deliver a concise confirmation message to the user that the engine is live in the browser DOM, actively hunting 24/7, and consuming zero API tokens.

---

## 1. Executive Summary

The engine executes an aggressive compounding model anchored by high mathematical win rates and real-time network/motion protection:
1. **The Target Multiplier**: **`1.02×`** Auto Cash Out (baseline win probability $\approx 97.06\%$).
2. **The Trigger Pattern**:
   * **Round $N-1$**: Any Red multiplier (**`1.00× – 1.99×`**). Prior rounds do not matter.
   * **Round $N$**: Any Moon multiplier (**`≥ 10.00×`**).
   * **Round $N+1$**: Executed immediately on the next round following the Moon crash.
3. **Continuous Active Hunting**: No hourly limits. Hunts 24/7 across all market hours.
4. **Pre-Flight Lag & Motion Sentinel**:
   * Measures `requestAnimationFrame` frame deltas in real time.
   * If frame jitter exceeds $200\text{ms}$ or the animation stutters, holding mode is engaged.
   * Requires 3 continuous seconds of smooth 60 FPS animation before permitting an execution.
5. **Emergency Queued Order Abort**:
   * Active during the 6-second countdown window after an order is queued.
   * If lag spikes occur or pattern verification fails, clicks **`Cancel`** immediately, zeros the stake, and reverts to standby.

---

## 2. Operational Specification

| Rule | Parameter | Implementation |
| :--- | :--- | :--- |
| **Auto Cash Out** | **`1.02×`** | Hardcoded into the execution panel. |
| **Stake Allocation** | **100% All-In** | Available balance extracted from `.rr-mask` and pre-staged continuously. |
| **Cadence** | **Continuous Hunting** | Uncapped 24/7 scanning. |
| **Pattern Setup** | **`Red (< 2.00×)` ➔ `Moon (≥ 10.00×)`** | Verified against top live pills (`pills[1] < 2.00 && pills[0] >= 10.00`). |
| **Execution Point** | **Immediate Next Round** | Clicks `Next Round` / primary action button right after the Moon crashes. |
| **Lag Detection** | **Animation Frame Delta Monitor** | `requestAnimationFrame` tracking. Halts if $\Delta t > 200\text{ms}$. |
| **Emergency Abort** | **Instant Queued Order Cancel** | Clicks `Cancel` before round start if jitter spikes or pattern invalidates. |

---

## 3. State Machine Flowchart

```mermaid
flowchart TD
    Hunt["🔍 Phase: HUNTING (Active 24/7)<br/>Scanning Live History Pills"] --> Check{"Evaluate Last 2 Rounds"}
    
    Check -- "Round N-1: Red (< 2.00x)<br/>AND Round N: Moon (>= 10.00x)" --> LagCheck{"Lag Sentinel Check<br/>Smooth Frame Rate for 3s?"}
    Check -- "Other Pattern" --> Hunt
    
    LagCheck -- "Lag Spike / Stutter (dt > 200ms)" --> LagHold["⚠️ HOLD (LAG DETECTED)<br/>Stake = 0, Waiting for Smooth Flight"]
    LagHold --> LagCheck
    
    LagCheck -- "Smooth Flight (60 FPS)" --> QueueBet["🚀 QUEUE ORDER (Next Round)<br/>100% All-In @ 1.02x Auto Cash Out"]
    
    QueueBet --> CountdownWindow{"Countdown Window (6.0s ➔ 0.0s)"}
    
    CountdownWindow -- "Lag Spike Detected" --> Abort["🚨 EMERGENCY CANCEL<br/>Click Cancel, Zero Stake, Hold"]
    CountdownWindow -- "Pattern Invalidated" --> Abort
    Abort --> Hunt
    
    CountdownWindow -- "Round Launches Cleanly" --> Flight["🛸 Round In Flight<br/>Waiting for Auto Cash Out @ 1.02x"]
    
    Flight -- "Multiplier >= 1.02x" --> Win["🏆 WIN (+2% Compounding)<br/>Balance Updated, Return to Hunting"]
    Flight -- "Instant Bust < 1.02x" --> Loss["💥 LOSS<br/>Audit Logged, Return to Hunting"]
    
    Win --> Hunt
    Loss --> Hunt
```

---

## 4. Disaster Recovery & Injection Runbook

If the system or browser restarted:
1. Open BC.Game Crash tab: `preview_open` with `url: "https://bc.game/game/crash"`, `profileId: "default"`.
2. Evaluate `crash-agent/src/in-page-engine.js` into the tab via `preview_evaluate`.
3. Verify that the HUD mounts on the lower right showing:
   * `RED ➔ MOON PROTOCOL (1.02×)`
   * `CONTINUOUS`
   * `🟢 Smooth (60 FPS)`
   * `Phase: HUNTING`
