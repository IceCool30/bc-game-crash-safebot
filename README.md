# BC.Game Crash SafeBot (Red ➔ Moon Protocol)

An autonomous, client-side browser automation engine for BC.Game Crash executing an ultra-conservative **`1.02×`** compounding protocol, real-time animation-frame lag detection, and emergency fail-safe aborts.

> [!NOTE]
> **No Developer Tools, AI Agents, or Coding Experience Needed.**
> This engine runs 100% inside your standard web browser (Chrome, Brave, Edge, etc.) as standalone JavaScript. You do not need to install Node.js, Python, or depend on an AI assistant to run it.

---

## 📖 How It Works

* **The Cashout Target**: Hardcoded to **`1.02×`** Auto Cash Out (~97.06% baseline statistical win probability).
* **The Trigger Pattern**:
  * **Round $N-1$**: Any **Red** multiplier (`1.00× – 1.99×`). Prior rounds do not matter.
  * **Round $N$**: Any **Moon** multiplier (`≥ 10.00×`).
  * **Round $N+1$**: The bot automatically places the bet on the immediate round following the Moon crash.
* **Capital Compounding**: 100% All-In of the liquid active balance detected on screen.
* **Continuous Hunting**: Scans rounds 24/7 continuously (no hourly quota limit).
* **Pre-Flight Lag & Motion Sentinel**:
  * Continuously measures browser frame rates via `requestAnimationFrame`.
  * If a frame drop or animation stutter exceeds `200ms`, betting is immediately locked until the game runs smoothly for at least 3 seconds.
* **Emergency Bet Abort**:
  * If a bet is queued during the 6-second pre-round countdown and a lag spike occurs or the connection drops, the bot automatically clicks **`Cancel`** and zeroes the stake.

---

## 🚀 Beginner's Manual Setup Guide (No Technical Skills Required)

Follow either of the two methods below to run the bot on any computer.

### Method 1: The Quick Console Method (Zero Installation — 30 Seconds)

This is the fastest way to run the bot without installing anything.

1. **Open BC.Game Crash**:
   * Open your browser (Google Chrome, Brave, or Microsoft Edge recommended).
   * Go to [https://bc.game/game/crash](https://bc.game/game/crash) and log in.
2. **Open the Developer Console**:
   * **Windows / Linux**: Press `F12` (or press `Ctrl + Shift + I`).
   * **Mac**: Press `Cmd + Option + I`.
   * A side panel or bottom panel will open. Click on the **Console** tab at the top of that panel.
3. **Allow Pasting (If prompted by Chrome)**:
   * If you see a warning saying *"Warning: Don't paste code that you don't understand..."*, simply type:
     ```text
     allow pasting
     ```
     and press `Enter`.
4. **Copy the Bot Code**:
   * Open the engine script: [`crash-agent/src/in-page-engine.js`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/crash-agent/src/in-page-engine.js) (or view it on GitHub).
   * Copy the entire code (select all and copy: `Ctrl + A`, then `Ctrl + C`).
5. **Paste and Run**:
   * Click inside the Console, paste the code (`Ctrl + V` or `Cmd + V`), and press **`Enter`**.
6. **Verify It Is Running**:
   * Look at the bottom-right corner of your browser screen.
   * You will see a dark floating HUD card titled:
     ```text
     RED ➔ MOON PROTOCOL (1.02×)       CONTINUOUS
     ```
   * As long as this HUD is visible, the bot is actively scanning rounds.
7. **How to Stop the Bot**:
   * Simply refresh your webpage (`F5` or `Ctrl + R`). Once refreshed, the bot stops completely.

---

### Method 2: Automatic 1-Click Launch with Tampermonkey (Permanent)

If you do not want to open the console and paste code every time, you can have it load automatically whenever you visit the Crash page.

1. **Install a Userscript Manager**:
   * Install the free [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) browser extension for Chrome, Edge, Brave, or Firefox.
2. **Create a New Script**:
   * Click the Tampermonkey icon in your browser toolbar and click **Create a new script...**.
3. **Paste the Script**:
   * Replace whatever template text appears with the following header:
     ```javascript
     // ==UserScript==
     // @name         BC.Game Crash SafeBot (Red -> Moon 1.02x)
     // @namespace    https://bc.game/
     // @version      1.0
     // @description  Autonomous Red -> Moon 1.02x SafeBot for BC.Game Crash
     // @match        https://bc.game/game/crash*
     // @grant        none
     // ==/UserScript==
     ```
   * Directly below the header, paste the entire contents of [`crash-agent/src/in-page-engine.js`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/crash-agent/src/in-page-engine.js).
4. **Save**:
   * Click **File** ➔ **Save** (or press `Ctrl + S`).
5. **Done**:
   * Visit [https://bc.game/game/crash](https://bc.game/game/crash). The SafeBot HUD will now automatically appear in the bottom-right corner every time.

---

## 🖥️ Understanding the On-Screen HUD

When the bot is running, the on-screen dashboard provides live feedback:

| HUD Section | What It Displays | What It Means |
| :--- | :--- | :--- |
| **Header** | `RED ➔ MOON PROTOCOL (1.02×)` | The active strategy and cashout target. |
| **Capital & Pre-stage** | Current detected balance (`100%`) | The amount staged into the bet box. |
| **Last 2 Rounds** | `Round N-1: [Value]` & `Round N: [Value]` | Live tracking of recent multipliers. Highlights when `Red ➔ Moon` occurs. |
| **Lag Sentinel** | `🟢 Smooth (60 FPS)` | Connection and graphics are smooth and safe for betting. |
| **Lag Sentinel** | `⚠️ HOLD (LAG DETECTED)` | Frame jitter or lag detected. Bets are temporarily locked until 3 seconds of clean motion elapse. |
| **Phase** | `HUNTING` / `QUEUED` / `IN FLIGHT` | Current operational state. |

---

## ❓ Frequently Asked Questions (FAQ)

### Why might an AI agent refuse to set this up?
Different AI platforms (such as Claude, ChatGPT, or specialized coding agents) have rigid automated safety filters against gambling, casino URLs, or betting automation. These filters are hardcoded into the AI provider's models and cannot be overridden by configuration files. **You do not need an AI agent to run this bot**; simply use the manual steps above.

### Can I test this with play/demo money?
Yes. The script interacts with whatever currency mode is currently active on your BC.Game screen. Switch your wallet to demo/fun play mode before pasting the script if you wish to observe it risk-free.

### Why did the bot cancel my bet during countdown?
The built-in **Lag & Motion Sentinel** protects your capital. If your internet stutters, your browser drops frames, or the site delays during the 6-second countdown, the bot triggers an **Emergency Abort** by clicking `Cancel` so you are not trapped in a desynchronized round.

### How do I stop or reset the bot?
Just reload the tab (`F5` or `Ctrl + R`). Because the script lives only in temporary browser memory, refreshing the page clears it instantly.

---

## 📂 Project Architecture

* [`crash-agent/src/in-page-engine.js`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/crash-agent/src/in-page-engine.js): The self-contained browser DOM engine.
* [`PROJECT_CORE.md`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/PROJECT_CORE.md): Master technical specifications and architecture.
* [`AGENTS.md`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/AGENTS.md): AI agent immutability contract and policy guidelines.
* [`skills/bc-game-crash-safebot/SKILL.md`](file:///C:/Users/john.bisong/.t3/scratch/2026-11-22-is-it-possible-um-agent-0c738edb/skills/bc-game-crash-safebot/SKILL.md): System operational skill definition.
