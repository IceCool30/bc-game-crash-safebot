# PROJECT_CORE.md: BC.Game Crash SafeBot Core Architecture

> [!CRITICAL]
> **IMMUTABLE CORE SPECIFICATION FOR BC.GAME CRASH SAFEBOT**
> This document defines the exact architecture, rules, pattern detection, lag sentinels, and emergency fail-safes.
> No agent may alter these rules unless explicitly ordered by the user.

---

## 1. Executive Summary & Purpose

The BC.Game Crash SafeBot is an autonomous, zero-token in-browser engine designed to capture high-probability compounding growth while guarding against the two most lethal vulnerabilities in Crash multiplier environments:
1. **Lag & Desynchronization Traps**: Executing orders during browser frame drops, packet loss, or canvas freezes where cashout requests fail to register.
2. **Timing & Stagnation Traps**: Staking during unverified market phases without clear momentum signals.

The engine executes the **4+ Red ➔ Green/Moon Protocol**:
* **The Mathematical Edge**: At **`1.02×`**, the baseline mathematical win probability of any individual round is **`97.06%`** ($99 / 102$).
* **The Streak Signal**: Track **consecutive Red rounds** ($1.00\times - 1.99\times$). Once the streak reaches **at least 4**, the **first non-red** round (Green $2.00\times-9.99\times$, or Moon $10.00\times-99.00\times$) arms the engine, and the stake is committed on the **immediately following round**. Rounds preceding the streak are irrelevant.
* **Super-Moon Abort**: If the arming round is a Moon **above $99.00\times$**, the would-be commit round is **skipped** and tracking restarts from zero.
* **Zero-Based Startup**: Tracking always begins from zero; pre-existing history pills are never counted.
* **Continuous Active Hunting**: Uncapped hourly limits allow the bot to actively hunt 24/7 whenever the trigger pattern presents itself.
* **Pre-Flight Lag & Motion Sentinel**: Uses real-time `requestAnimationFrame` delta tracking to hold execution whenever the Crash curve/countdown stutters.
* **Emergency Abort**: Automatically clicks "Cancel" on a queued order if lag strikes or pattern invalidates before the round starts.

---

## 2. Immutable Operational Rules

| Rule | Specification | Guardrail Enforcement |
| :--- | :--- | :--- |
| **Auto Cash Out** | **`1.02×`** | Hardcoded. Never increased for "extra profit" or reduced below 1.02x. |
| **Stake Allocation** | **100% All-In Compounding (Just-In-Time)** | Amount input is strictly zeroed (`0`) during hunting, populated with 100% balance when the streak trigger arms, and wiped back to `0` immediately upon settlement. |
| **Cadence Limit** | **Continuous Active Hunting** | No hourly restriction. Hunts 24/7 across all market cycles. |
| **Pattern Trigger** | **`4+ Red` ➔ `Green/Moon`** | Track consecutive Reds ($1.00\times - 1.99\times$). Arm when streak $\ge 4$ and the next round is Green ($2.00\times - 9.99\times$) or Moon ($10.00\times - 99.00\times$). If that round is Red, the streak continues. Prior rounds do not matter. |
| **Super-Moon Abort** | **Moon $> 99.00\times$** | Skip the would-be commit round entirely; reset tracking to zero. |
| **Execution Point** | **Immediate Next Round** | Order executed for the round immediately following the Green/Moon trigger round. |
| **Startup / Missing Data** | **Zero-based, skip-on-ambiguity** | Tracking begins from zero on every injection. Unreadable rounds between trigger and commit abort the pattern and wait for a fresh one. |
| **Lag & Motion Sentinel** | **Real-Time Frame Rate Monitor** | Tracks frame deltas via `requestAnimationFrame`. If $\Delta t > 200\text{ms}$, flags lag and holds orders. Requires 3s clean flight to clear. |
| **Emergency Abort** | **Queued Order Cancellation** | If an order is queued and lag strikes or pattern verification fails, clicks **`Cancel`** immediately before the round launches. |

---

## 3. System Architecture & Components

```
bc-game-crash-safebot/
├── crash-agent/
│   ├── config.json              # Platform & logging configuration
│   ├── data/
│   │   └── hourly.jsonl         # Compounding audit ledger & execution records
│   └── src/
│       └── in-page-engine.js    # Master in-browser DOM automation engine
├── skills/
│   └── bc-game-crash-safebot/
│       └── SKILL.md             # Autonomous operational runbook & skills spec
├── PROJECT_CORE.md              # Project architectural blueprint (this file)
└── AGENTS.md                    # Immutable directives for all AI agents
```

---

## 4. State Machine Diagram

```mermaid
flowchart TD
    Hunt["🔍 Phase: HUNTING (Active 24/7)<br/>Streak starts at 0 on boot"] --> Check{"New settled round"}
    
    Check -- "Red (1.00-1.99x)" --> Streak["Count consecutive REDs<br/>Arm eligible at 4+"]
    Streak --> Hunt
    Check -- "Non-red with streak < 4" --> Reset["Reset to 0"] --> Hunt
    Check -- "Green/Moon with streak >= 4<br/>AND Moon <= 99.00x" --> LagCheck{"Lag Sentinel Check<br/>Smooth Frame Rate for 3s?"}
    Check -- "Moon > 99.00x" --> SuperSkip["SKIP would-be commit round<br/>Reset to 0"] --> Hunt
    
    LagCheck -- "Lag Spike / Stutter (dt > 200ms)" --> LagHold["⚠️ HOLD (LAG DETECTED)<br/>Stake = 0, Waiting for Smooth Flight"]
    LagHold --> LagCheck
    
    LagCheck -- "Smooth Flight (60 FPS)" --> QueueBet["🚀 QUEUE ORDER (Next Round)<br/>100% All-In @ 1.02x Auto Cash Out"]
    
    QueueBet --> CountdownWindow{"Countdown Window (6.0s ➔ 0.0s)"}
    
    CountdownWindow -- "Lag Spike Detected" --> Abort["🚨 EMERGENCY CANCEL<br/>Click Cancel, Zero Stake, Hold"]
    CountdownWindow -- "Unreadable round / pattern reset" --> Abort
    CountdownWindow -- "No settlement within 90s" --> Abort
    Abort --> Hunt
    
    CountdownWindow -- "Round Launches Cleanly" --> Flight["🛸 Round In Flight<br/>Waiting for Auto Cash Out @ 1.02x"]
    
    Flight -- "Multiplier >= 1.02x" --> Win["🏆 WIN (+2% Compounding)<br/>Balance Updated, Return to Hunting"]
    Flight -- "Instant Bust < 1.02x" --> Loss["💥 LOSS<br/>Audit Logged, Return to Hunting"]
    
    Win --> Hunt
    Loss --> Hunt
```

---

## 5. In-Page Zero-Token Operations & Disaster Recovery

* **Zero Token Burn**: The engine operates purely inside the Chromium DOM via `setInterval` and `requestAnimationFrame`. No background LLM tool polling loops.
* **Disaster Recovery**:
  1. Open BC.Game Crash tab: `https://bc.game/game/crash`.
  2. Inject `crash-agent/src/in-page-engine.js` via `preview_evaluate`.
  3. Confirm `#__crash_bot_panel` mounts and displays `4+ RED -> GREEN/MOON PROTOCOL (1.02×)` and `CONTINUOUS`.
