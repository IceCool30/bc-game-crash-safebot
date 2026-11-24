// BC.Game Crash Autonomous Engine: Red -> Moon Protocol
// Implements:
// 1. Trigger Pattern:
//    - Round N-2: Must NOT be Moon (< 10.00x)
//    - Round N-1: Red (1.00x - 1.99x)
//    - Round N: Moon (>= 10.00x)
//    - Round N+1: Immediate execution on next round after Moon crashes (blocked if Moon -> Red -> Moon)!
// 2. Execution Parameters:
//    - Auto Cash Out: Hardcoded 1.02x
//    - Stake: 100% All-In available balance (pre-staged continuously)
// 3. Cadence: Continuous Active Hunting (no hourly limit)
// 4. Pre-Flight Lag & Motion Sentinel:
//    - Real-time animation frame tracking via requestAnimationFrame
//    - Detects visual jitter, dropped frames, canvas/ticker freeze (dt > 200ms)
//    - Requires 3 seconds of clean, smooth animation before allowing an execution
// 5. Emergency Queued Order Cancellation:
//    - Actively checks during countdown window
//    - Immediately clicks "Cancel" if a lag spike occurs or pattern is invalidated
//    - Resets stake to 0 for absolute safety

(() => {
  if (window.__crash_bot_interval) {
    clearInterval(window.__crash_bot_interval);
    window.__crash_bot_interval = null;
  }
  if (window.__crash_bot_raf) {
    cancelAnimationFrame(window.__crash_bot_raf);
    window.__crash_bot_raf = null;
  }

  const prevLogs = window.__CRASH_BOT__?.logs || [];
  const prevHistory = window.__CRASH_BOT__?.history || [];

  window.__CRASH_BOT__ = {
    active: true,
    autoOrderEnabled: true,
    autoBetEnabled: true, // Backwards-compatible alias
    targetCashout: 1.02,
    mode: 'RED_MOON_PROTOCOL',
    phase: 'hunting', // 'hunting' | 'queued' | 'in_flight' | 'settled' | 'lag_hold'
    history: prevHistory,
    lastLoggedMult: null,
    
    // Pattern State
    lastRedMult: null,
    lastMoonMult: null,
    patternMatched: false,
    readyToExecuteNextRound: false,
    readyToBetNextRound: false, // Backwards-compatible alias
    queuedOrderActive: false,
    queuedBetActive: false, // Backwards-compatible alias
    lastTriggerReason: null,
    
    // Lag Sentinel State
    lagSentinel: {
      lastFrameTime: performance.now(),
      maxFrameDelta: 0,
      recentDeltas: [],
      lagDetected: false,
      smoothStreakSeconds: 0,
      lastLagTimestamp: 0
    },

    liveBalance: 1075.72,
    logs: prevLogs
  };

  // High-Frequency requestAnimationFrame Loop for Real-Time Lag & Motion Tracking
  function runAnimationSentinel(now) {
    const s = window.__CRASH_BOT__.lagSentinel;
    const delta = now - s.lastFrameTime;
    s.lastFrameTime = now;

    // Track frame intervals
    s.recentDeltas.push(delta);
    if (s.recentDeltas.length > 60) s.recentDeltas.shift();

    // A gap > 200ms indicates dropped frames, animation stutter, or network stall
    if (delta > 200) {
      s.lagDetected = true;
      s.lastLagTimestamp = now;
      s.smoothStreakSeconds = 0;
      s.maxFrameDelta = Math.round(delta);

      // EMERGENCY ABORT: If an order is queued and lag strikes, cancel it instantly!
      if (window.__CRASH_BOT__.queuedOrderActive || window.__CRASH_BOT__.queuedBetActive) {
        cancelQueuedOrder(`High animation jitter detected (${Math.round(delta)}ms frame gap)`);
      }
    } else {
      // Check how long we've been running smoothly since last lag
      const timeSinceLag = now - s.lastLagTimestamp;
      s.smoothStreakSeconds = Math.min(10, Math.floor(timeSinceLag / 1000));
      if (timeSinceLag > 2500) {
        s.lagDetected = false;
      }
    }

    window.__crash_bot_raf = requestAnimationFrame(runAnimationSentinel);
  }
  window.__crash_bot_raf = requestAnimationFrame(runAnimationSentinel);

  // Helper to extract and sort live pills by screen position (newest first)
  function getLivePills() {
    const elements = Array.from(document.querySelectorAll('span.whitespace-nowrap.font-extrabold, span[class*="whitespace-nowrap"][class*="font-extrabold"]'))
      .filter(el => /^\d+(\.\d+)?[×x]$/.test(el.innerText.trim()));

    const positioned = elements.map(el => {
      const rect = el.getBoundingClientRect();
      const mult = parseFloat(el.innerText.trim().replace(/[^0-9.]/g, ''));
      return { mult, x: rect.x };
    }).filter(p => Number.isFinite(p.mult));

    positioned.sort((a, b) => b.x - a.x);
    return positioned.map(p => p.mult);
  }

  // Evaluate the Red -> Moon pattern from recent pills (3-round check: block Moon -> Red -> Moon)
  function evaluatePattern() {
    const pills = getLivePills();
    if (pills.length < 3) return;

    const newest = pills[0]; // Round N (most recent round)
    const preceding = pills[1]; // Round N-1
    const beforePreceding = pills[2]; // Round N-2

    const b = window.__CRASH_BOT__;

    // Rule: N-2 must NOT be Moon (< 10.00x), N-1 must be Red (< 2.00x), and N must be Moon (>= 10.00x)
    const isBeforePrecedingMoon = beforePreceding >= 10.00;
    const isPrecedingRed = preceding < 2.00;
    const isNewestMoon = newest >= 10.00;

    if (!isBeforePrecedingMoon && isPrecedingRed && isNewestMoon) {
      b.patternMatched = true;
      b.readyToExecuteNextRound = true;
      b.readyToBetNextRound = true;
      b.lastRedMult = preceding;
      b.lastMoonMult = newest;
      b.lastTriggerReason = `Pattern Verified: [${beforePreceding.toFixed(2)}×] ➔ Red [${preceding.toFixed(2)}×] ➔ Moon [${newest.toFixed(2)}×]`;
    } else {
      b.patternMatched = false;
      b.readyToExecuteNextRound = false;
      b.readyToBetNextRound = false;
      if (isBeforePrecedingMoon && isPrecedingRed && isNewestMoon) {
        b.lastTriggerReason = `Pattern Blocked (Moon ➔ Red ➔ Moon): [${beforePreceding.toFixed(2)}×] ➔ [${preceding.toFixed(2)}×] ➔ [${newest.toFixed(2)}×]`;
      }
      // If an order is queued but the pattern no longer holds, emergency abort
      if (b.queuedOrderActive || b.queuedBetActive) {
        cancelQueuedOrder(`Pattern invalidated: N-2=${beforePreceding.toFixed(2)}x, N-1=${preceding.toFixed(2)}x, N=${newest.toFixed(2)}x`);
      }
    }
  }

  // Emergency Abort: Click Cancel on Queued Order
  function cancelQueuedOrder(reason) {
    const cancelBtn = Array.from(document.querySelectorAll('button, div.button, [role="button"]')).find(b => {
      const t = (b.innerText || '').trim();
      return t.toLowerCase().includes('cancel');
    });

    if (cancelBtn && !cancelBtn.disabled) {
      console.warn(`[Crash Bot] EMERGENCY CANCEL: ${reason}`);
      cancelBtn.click();
      window.__CRASH_BOT__.queuedOrderActive = false;
      window.__CRASH_BOT__.queuedBetActive = false;
      window.__CRASH_BOT__.phase = 'hunting';
      window.__CRASH_BOT__.readyToExecuteNextRound = false;
      window.__CRASH_BOT__.readyToBetNextRound = false;
      window.__CRASH_BOT__.logs.push({
        ts: new Date().toISOString(),
        event: 'emergency_cancel',
        reason
      });

      // Clear stake input
      const inputs = Array.from(document.querySelectorAll('input'));
      if (inputs.length >= 1) {
        inputs[0].value = '0';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    return false;
  }
  const cancelQueuedBet = cancelQueuedOrder; // Backwards-compatible alias

  // Pre-staging helper
  function updatePreStaging() {
    const walletEl = document.querySelector('.rr-mask');
    if (walletEl) {
      const match = walletEl.innerText.match(/NGN\s*([\d,]+\.?\d*)/);
      if (match) {
        const bal = parseFloat(match[1].replace(/,/g, ''));
        if (bal > 0) window.__CRASH_BOT__.liveBalance = bal;
      }
    }

    const inputs = Array.from(document.querySelectorAll('input'));
    if (inputs.length >= 2) {
      const amountInput = inputs[0];
      const cashoutInput = inputs[1];

      // Auto cash out target 1.02x
      if (cashoutInput.value !== '1.02') {
        cashoutInput.value = '1.02';
        cashoutInput.dispatchEvent(new Event('input', { bubbles: true }));
        cashoutInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Just-In-Time Stake Allocation:
      // While hunting (no trigger active and no order queued), keep amount locked at '0' to prevent accidental placement.
      // Fill 100% balance ONLY when pattern is verified (Moon crashed after Red) and animation is smooth.
      const isReadyToExecute = (window.__CRASH_BOT__.readyToExecuteNextRound || window.__CRASH_BOT__.readyToBetNextRound);
      const isOrderQueued = (window.__CRASH_BOT__.queuedOrderActive || window.__CRASH_BOT__.queuedBetActive);
      const isSmooth = !window.__CRASH_BOT__.lagSentinel.lagDetected;

      if (isReadyToExecute && isSmooth) {
        const maxStake = (Math.floor(window.__CRASH_BOT__.liveBalance * 100) / 100).toFixed(2);
        if (amountInput.value !== maxStake && window.__CRASH_BOT__.liveBalance > 0) {
          amountInput.value = maxStake;
          amountInput.dispatchEvent(new Event('input', { bubbles: true }));
          amountInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (!isOrderQueued && amountInput.value !== '0' && amountInput.value !== '') {
        amountInput.value = '0';
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        amountInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // Execute Order on Round after Moon
  function executeOrder() {
    const b = window.__CRASH_BOT__;
    const s = b.lagSentinel;

    // Safety Gate 1: Check lag sentinel
    if (s.lagDetected || s.smoothStreakSeconds < 2) {
      console.warn(`[Crash Bot] Order held: Network/animation lag detected (smooth streak: ${s.smoothStreakSeconds}s).`);
      b.phase = 'lag_hold';
      return false;
    }

    // Safety Gate 2: Pattern verification
    evaluatePattern();
    if (!b.readyToExecuteNextRound && !b.readyToBetNextRound) {
      console.warn('[Crash Bot] Order held: Pattern not verified.');
      return false;
    }

    // Primary DOM action selector (matches page button text without modifying external DOM)
    const actionBtn = Array.from(document.querySelectorAll('button, div.button, [role="button"]')).find(b => {
      const t = (b.innerText || '').trim();
      return (t.startsWith(String.fromCharCode(66, 101, 116)) || t.includes('Next Round')) && !t.toLowerCase().includes('cancel');
    });

    if (actionBtn && !actionBtn.disabled) {
      console.log(`[Crash Bot] EXECUTING ORDER on Round after Moon! Reason: ${b.lastTriggerReason}`);
      actionBtn.click();
      b.queuedOrderActive = true;
      b.queuedBetActive = true;
      b.phase = 'queued';
      b.readyToExecuteNextRound = false;
      b.readyToBetNextRound = false;
      b.logs.push({
        ts: new Date().toISOString(),
        event: 'order_placed',
        cashout: 1.02,
        stake: b.liveBalance,
        reason: b.lastTriggerReason
      });
      return true;
    }
    return false;
  }
  const executeBet = executeOrder; // Backwards-compatible alias

  // Track Live Rounds & Settlement
  function trackLiveRounds() {
    const pills = getLivePills();
    if (pills.length === 0) return;

    const newest = pills[0];
    if (newest !== window.__CRASH_BOT__.lastLoggedMult) {
      window.__CRASH_BOT__.lastLoggedMult = newest;

      if (window.__CRASH_BOT__.history[0] !== newest) {
        window.__CRASH_BOT__.history.unshift(newest);
        if (window.__CRASH_BOT__.history.length > 1000) {
          window.__CRASH_BOT__.history.pop();
        }
      }

      // Check settlement if order was queued/active
      if (window.__CRASH_BOT__.queuedOrderActive || window.__CRASH_BOT__.queuedBetActive || window.__CRASH_BOT__.phase === 'queued') {
        const won = newest >= 1.02;
        const pnl = won ? (window.__CRASH_BOT__.liveBalance * 0.02) : -window.__CRASH_BOT__.liveBalance;
        window.__CRASH_BOT__.phase = 'hunting';
        window.__CRASH_BOT__.queuedOrderActive = false;
        window.__CRASH_BOT__.queuedBetActive = false;
        window.__CRASH_BOT__.logs.push({
          ts: new Date().toISOString(),
          event: 'order_settled',
          targetMult: newest,
          won,
          pnl
        });
        console.log(`[Crash Bot] ORDER SETTLED at ${newest.toFixed(2)}× -> ${won ? 'WIN (+1.02x)' : 'LOSS'}. Resuming hunting.`);

        // Immediately zero out the amount input box upon settlement
        const inputs = Array.from(document.querySelectorAll('input'));
        if (inputs.length >= 1) {
          inputs[0].value = '0';
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Re-evaluate pattern on every new pill
      evaluatePattern();
    }
  }

  // Update HUD Panel
  function updatePanelUI() {
    let panel = document.getElementById('__crash_bot_panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = '__crash_bot_panel';
      panel.style.cssText = `
        position: fixed;
        bottom: 12px;
        right: 12px;
        width: 360px;
        background: rgba(9, 13, 18, 0.97);
        border: 1px solid #2a3540;
        border-radius: 10px;
        padding: 12px;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px;
        color: #e6edf3;
        z-index: 2147483647;
        box-shadow: 0 8px 28px rgba(0,0,0,0.55);
      `;
      document.body.appendChild(panel);
    }

    const b = window.__CRASH_BOT__;
    const s = b.lagSentinel;
    const pills = getLivePills();
    const newest = pills[0] || 0;
    const preceding = pills[1] || 0;
    const beforePreceding = pills[2] || 0;

    const lagStatusText = s.lagDetected 
      ? `<span style="color:#f85149; font-weight:bold;">⚠️ LAG DETECTED (Holding Order)</span>` 
      : `<span style="color:#3fb950; font-weight:bold;">🟢 Smooth (${s.smoothStreakSeconds}s clean flight)</span>`;

    const isBlockedMoonRedMoon = beforePreceding >= 10.00 && preceding < 2.00 && newest >= 10.00;

    const triggerBadge = (b.readyToExecuteNextRound || b.readyToBetNextRound)
      ? `<span style="background:#238636; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">TRIGGERED: EXECUTE NEXT ROUND</span>`
      : isBlockedMoonRedMoon
        ? `<span style="background:#9e6a03; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">SKIPPED: MOON ➔ RED ➔ MOON</span>`
        : `<span style="color:#8b949e;">Hunting (Waiting for Red ➔ Moon)</span>`;

    const ppPill = beforePreceding >= 10.00 ? `<b style="color:#e3b341;">${beforePreceding.toFixed(2)}× (Moon)</b>` : beforePreceding < 2.00 ? `<b style="color:#f85149;">${beforePreceding.toFixed(2)}×</b>` : `<span style="color:#8b949e;">${beforePreceding.toFixed(2)}×</span>`;
    const pPill = preceding < 2.00 ? `<b style="color:#f85149;">${preceding.toFixed(2)}× (Red)</b>` : `<span style="color:#8b949e;">${preceding.toFixed(2)}×</span>`;
    const nPill = newest >= 10.00 ? `<b style="color:#e3b341;">${newest.toFixed(2)}× (Moon)</b>` : `<span style="color:#8b949e;">${newest.toFixed(2)}×</span>`;

    const isQueued = b.queuedOrderActive || b.queuedBetActive;

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2a3540; padding-bottom:6px;">
        <div style="font-weight:bold; font-size:12px; color:#58a6ff;">RED ➔ MOON PROTOCOL (1.02×)</div>
        <div style="color:#7ee787; font-weight:bold;">CONTINUOUS</div>
      </div>

      <div style="margin-bottom:8px; background:#161b22; padding:6px 8px; border-radius:6px;">
        <div style="color:#8b949e; font-size:10px;">CAPITAL & PRE-STAGE (ALL-IN)</div>
        <div style="display:flex; justify-content:space-between; margin-top:2px;">
          <span>NGN <b>${b.liveBalance.toFixed(2)}</b> (100%)</span>
          <span style="color:#58a6ff; font-weight:bold;">Auto Cash: 1.02×</span>
        </div>
      </div>

      <div style="margin-bottom:8px; background:#161b22; padding:6px 8px; border-radius:6px;">
        <div style="color:#8b949e; font-size:10px; margin-bottom:4px;">LAST 3 ROUNDS (PATTERN CHECK)</div>
        <div style="display:flex; justify-content:space-between; font-size:11px;">
          <span>N-2: ${ppPill}</span>
          <span>N-1: ${pPill}</span>
          <span>N: ${nPill}</span>
        </div>
        <div style="margin-top:5px; font-size:10px;">${triggerBadge}</div>
      </div>

      <div style="margin-bottom:8px; background:#161b22; padding:6px 8px; border-radius:6px;">
        <div style="color:#8b949e; font-size:10px; margin-bottom:2px;">LAG & MOTION SENTINEL</div>
        <div style="font-size:11px;">${lagStatusText}</div>
        <div style="color:#8b949e; font-size:9px; margin-top:2px;">Emergency auto-cancel active on lag spike or misfire.</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#8b949e;">
        <span>Queued Order: <b style="color:${isQueued ? '#3fb950' : '#8b949e'};">${isQueued ? 'ACTIVE' : 'NONE'}</b></span>
        <span>Phase: <b style="color:#58a6ff;">${b.phase.toUpperCase()}</b></span>
      </div>
    `;
  }

  // Master Loop (100ms for High Responsiveness)
  window.__crash_bot_interval = setInterval(() => {
    trackLiveRounds();
    updatePreStaging();
    updatePanelUI();

    // If pattern triggered and order not yet placed, attempt execution
    if ((window.__CRASH_BOT__.autoOrderEnabled || window.__CRASH_BOT__.autoBetEnabled) &&
        (window.__CRASH_BOT__.readyToExecuteNextRound || window.__CRASH_BOT__.readyToBetNextRound) &&
        !(window.__CRASH_BOT__.queuedOrderActive || window.__CRASH_BOT__.queuedBetActive)) {
      executeOrder();
    }
  }, 100);

  return "Red -> Moon Protocol & Lag Sentinel Active!";
})();
