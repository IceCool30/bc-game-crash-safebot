// BC.Game Crash Autonomous Engine: 4+ RED -> GREEN/MOON Protocol
// Implements:
// 1. Trigger Pattern (REPLACES the old Red -> Moon pattern):
//    - Track consecutive RED rounds (1.00x - 1.99x). Prior rounds do not matter.
//    - Arm only when the streak has reached AT LEAST 4 consecutive reds.
//    - The FIRST non-red round after the streak must be GREEN (2.00x-9.99x) or
//      MOON (10.00x-99.00x). If it is red, the streak simply continues.
//    - COMMIT on the round IMMEDIATELY AFTER that green/moon round.
//    - If that green/moon round is a MOON > 99.00x, SKIP the would-be commit
//      round entirely and restart tracking from zero.
//    - No round before the consecutive red streak matters (Moon->Red->Moon
//      exclusion removed).
// 2. Execution Parameters:
//    - Auto Cash Out: Hardcoded 1.02x
//    - Stake: 100% All-In available balance (Just-In-Time allocation)
// 3. Cadence: Continuous Active Hunting (no hourly limit, 24/7)
// 4. Pre-Flight Lag & Motion Sentinel:
//    - Real-time animation frame tracking via requestAnimationFrame
//    - Detects visual jitter / dropped frames / canvas freeze (dt > 200ms)
//    - Requires 3 seconds of clean, smooth animation before allowing execution
// 5. Emergency Queued Order Cancellation:
//    - Actively checks during the countdown window
//    - Immediately clicks "Cancel" on lag spike, missing round data, or
//      pattern invalidation, and resets stake to 0
// 6. Startup: tracking ALWAYS begins from zero; pre-existing pills are ignored

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

  const RED_MAX = 2.00;
  const MOON_MIN = 10.00;
  const SUPER_MOON_ABOVE = 99.00;
  const MIN_REDS = 4;
  const MISSING_DATA_MS = 90000;

  const isRed = (m) => m >= 1 && m < RED_MAX;
  const isMoon = (m) => m >= MOON_MIN;
  const isSuperMoon = (m) => m > SUPER_MOON_ABOVE;

  window.__CRASH_BOT__ = {
    active: true,
    autoOrderEnabled: true,
    autoBetEnabled: true, // Backwards-compatible alias
    targetCashout: 1.02,
    mode: 'RED_STREAK_GREEN_MOON_PROTOCOL',
    phase: 'hunting', // 'hunting' | 'armed' | 'queued' | 'lag_hold' | 'settled'
    history: prevHistory,
    lastLoggedMult: null,
    lastPillsSig: null,
    initialized: false,

    // Pattern state (starts from zero on every injection / reload)
    streak: {
      count: 0,
      reds: [],
      armed: false,
      armedAt: 0,
      trigger: null,
      skipNextRound: false,
      lastEvent: 'Tracking from zero - waiting for 4+ consecutive reds'
    },

    patternMatched: false,
    readyToExecuteNextRound: false,
    readyToBetNextRound: false, // Backwards-compatible alias
    queuedOrderActive: false,
    queuedBetActive: false, // Backwards-compatible alias
    lastTriggerReason: null,
    lastStake: 0,

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

  function logEvent(event, extra) {
    window.__CRASH_BOT__.logs.push({ ts: new Date().toISOString(), event, ...(extra || {}) });
  }

  // High-Frequency requestAnimationFrame Loop for Real-Time Lag & Motion Tracking
  function runAnimationSentinel(now) {
    const s = window.__CRASH_BOT__.lagSentinel;
    const delta = now - s.lastFrameTime;
    s.lastFrameTime = now;

    s.recentDeltas.push(delta);
    if (s.recentDeltas.length > 60) s.recentDeltas.shift();

    if (delta > 200) {
      s.lagDetected = true;
      s.lastLagTimestamp = now;
      s.smoothStreakSeconds = 0;
      s.maxFrameDelta = Math.round(delta);

      if (window.__CRASH_BOT__.queuedOrderActive || window.__CRASH_BOT__.queuedBetActive) {
        cancelQueuedOrder(`High animation jitter detected (${Math.round(delta)}ms frame gap)`);
      }
    } else {
      const timeSinceLag = now - s.lastLagTimestamp;
      s.smoothStreakSeconds = Math.min(10, Math.floor(timeSinceLag / 1000));
      if (timeSinceLag > 2500) s.lagDetected = false;
    }

    window.__crash_bot_raf = requestAnimationFrame(runAnimationSentinel);
  }
  window.__crash_bot_raf = requestAnimationFrame(runAnimationSentinel);

  // Helper: extract settled live pills, newest first (rightmost on screen)
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

  // Reset the whole tracking line. Does NOT touch streak.skipNextRound.
  function resetPattern(reason) {
    const b = window.__CRASH_BOT__;
    b.streak.count = 0;
    b.streak.reds = [];
    b.streak.armed = false;
    b.streak.armedAt = 0;
    b.streak.trigger = null;
    b.patternMatched = false;
    b.readyToExecuteNextRound = false;
    b.readyToBetNextRound = false;
    b.phase = 'hunting';
    if (reason) b.streak.lastEvent = reason;
  }

  // Arm the commit: the next round after a qualifying green/moon is the target.
  function armTrigger(nonRed) {
    const b = window.__CRASH_BOT__;
    const kind = isMoon(nonRed) ? 'MOON' : 'GREEN';
    b.patternMatched = true;
    b.readyToExecuteNextRound = true;
    b.readyToBetNextRound = true;
    b.streak.armed = true;
    b.streak.armedAt = Date.now();
    b.streak.trigger = {
      redStreak: b.streak.count,
      reds: b.streak.reds.slice(),
      nonRed,
      kind
    };
    b.phase = 'armed';
    b.lastTriggerReason = `QUALIFIED: ${b.streak.count} consecutive REDs -> ${nonRed.toFixed(2)}x (${kind}) -> COMMIT on the next round`;
    b.streak.lastEvent = b.lastTriggerReason;
    logEvent('pattern_armed', {
      redStreak: b.streak.count,
      reds: b.streak.reds.slice(),
      greenOrMoon: nonRed,
      kind
    });
    console.log(`[Crash Bot] ${b.lastTriggerReason}`);
  }

  // Process one newly settled round through the streak state machine.
  function processNewRound(mult) {
    const b = window.__CRASH_BOT__;
    if (!Number.isFinite(mult)) return;

    if (b.history[0] !== mult) {
      b.history.unshift(mult);
      if (b.history.length > 1000) b.history.pop();
    }

    // This new pill is the settlement of the committed round.
    if (b.queuedOrderActive || b.queuedBetActive) {
      settleOrder(mult);
      resetPattern(`Settled at ${mult.toFixed(2)}x - tracking restarted from zero`);
      return;
    }

    // Super-moon abort: the round we just skipped is the would-be commit round.
    // It is NOT counted; the next round becomes round one of a new tracking line.
    if (b.streak.skipNextRound) {
      b.streak.skipNextRound = false;
      b.streak.count = 0;
      b.streak.reds = [];
      b.streak.lastEvent = 'Tracking restarted from zero after super-moon skip';
      return;
    }

    // An armed trigger that never became a queued order means data was missed.
    if (b.readyToExecuteNextRound || b.readyToBetNextRound) {
      logEvent('missing_data_skip', { reason: 'Trigger resolved without a readable commit round' });
      resetPattern('Missing/unreadable round data - waiting for a fresh pattern');
      return;
    }

    if (isRed(mult)) {
      b.streak.count += 1;
      b.streak.reds.unshift(mult);
      if (b.streak.reds.length > 12) b.streak.reds.pop();
      b.streak.lastEvent = `RED streak ${b.streak.count}${b.streak.count >= MIN_REDS ? ' (qualifying)' : ''}`;
      return;
    }

    // First non-red after a qualifying streak.
    if (b.streak.count >= MIN_REDS) {
      if (isSuperMoon(mult)) {
        resetPattern(`SUPER MOON ${mult.toFixed(2)}x > 99.00x - commit SKIPPED, tracking reset to zero`);
        b.streak.skipNextRound = true;
        logEvent('super_moon_skip', { mult, reason: 'Moon exceeded 99.00x; would-be commit round skipped' });
        console.log(`[Crash Bot] SUPER MOON ${mult.toFixed(2)}x > 99.00x - skipping commit, resetting tracking.`);
        return;
      }
      armTrigger(mult);
      return;
    }

    resetPattern(`Non-red ${mult.toFixed(2)}x before ${MIN_REDS} reds - reset to zero`);
  }

  // Emergency Abort: click Cancel on a queued order, zero the stake.
  function cancelQueuedOrder(reason) {
    const cancelBtn = Array.from(document.querySelectorAll('button, div.button, [role="button"]')).find(el => {
      const t = (el.innerText || '').trim();
      return t.toLowerCase().includes('cancel');
    });

    const b = window.__CRASH_BOT__;
    b.queuedOrderActive = false;
    b.queuedBetActive = false;
    b.readyToExecuteNextRound = false;
    b.readyToBetNextRound = false;
    b.lastStake = 0;
    resetPattern(`Cancelled: ${reason}`);
    logEvent('emergency_cancel', { reason });

    if (cancelBtn && !cancelBtn.disabled) {
      console.warn(`[Crash Bot] EMERGENCY CANCEL: ${reason}`);
      cancelBtn.click();
    } else {
      console.warn(`[Crash Bot] CANCEL requested (no cancel button found): ${reason}`);
    }

    zeroAmountInput();
    return true;
  }
  const cancelQueuedBet = cancelQueuedOrder; // Backwards-compatible alias

  function zeroAmountInput() {
    const inputs = Array.from(document.querySelectorAll('input'));
    if (inputs.length >= 1) {
      inputs[0].value = '0';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Pre-staging: lock amount at 0 while hunting; stage 100% only when armed.
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

      if (cashoutInput.value !== '1.02') {
        cashoutInput.value = '1.02';
        cashoutInput.dispatchEvent(new Event('input', { bubbles: true }));
        cashoutInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const isReady = (window.__CRASH_BOT__.readyToExecuteNextRound || window.__CRASH_BOT__.readyToBetNextRound);
      const isQueued = (window.__CRASH_BOT__.queuedOrderActive || window.__CRASH_BOT__.queuedBetActive);
      const isSmooth = !window.__CRASH_BOT__.lagSentinel.lagDetected;

      if (isReady && isSmooth) {
        const maxStake = (Math.floor(window.__CRASH_BOT__.liveBalance * 100) / 100).toFixed(2);
        if (amountInput.value !== maxStake && window.__CRASH_BOT__.liveBalance > 0) {
          amountInput.value = maxStake;
          amountInput.dispatchEvent(new Event('input', { bubbles: true }));
          amountInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (!isQueued && amountInput.value !== '0' && amountInput.value !== '') {
        zeroAmountInput();
      }
    }
  }

  // Execute the queued commit order on the round after the green/moon.
  function executeOrder() {
    const b = window.__CRASH_BOT__;
    const s = b.lagSentinel;

    if (s.lagDetected || s.smoothStreakSeconds < 2) {
      console.warn(`[Crash Bot] Order held: lag detected (smooth streak: ${s.smoothStreakSeconds}s).`);
      b.phase = 'lag_hold';
      return false;
    }

    if (!b.readyToExecuteNextRound && !b.readyToBetNextRound) {
      console.warn('[Crash Bot] Order held: pattern not armed.');
      return false;
    }

    const actionBtn = Array.from(document.querySelectorAll('button, div.button, [role="button"]')).find(el => {
      const t = (el.innerText || '').trim();
      return (t.startsWith(String.fromCharCode(66, 101, 116)) || t.includes('Next Round')) && !t.toLowerCase().includes('cancel');
    });

    if (actionBtn && !actionBtn.disabled) {
      b.lastStake = b.liveBalance;
      console.log(`[Crash Bot] COMMITTING ALL-IN @ 1.02x. Reason: ${b.lastTriggerReason}`);
      actionBtn.click();
      b.queuedOrderActive = true;
      b.queuedBetActive = true;
      b.phase = 'queued';
      b.readyToExecuteNextRound = false;
      b.readyToBetNextRound = false;
      logEvent('order_placed', {
        cashout: 1.02,
        stake: b.lastStake,
        reason: b.lastTriggerReason,
        trigger: b.streak.trigger
      });
      return true;
    }
    return false;
  }
  const executeBet = executeOrder; // Backwards-compatible alias

  function settleOrder(mult) {
    const b = window.__CRASH_BOT__;
    const won = mult >= 1.02;
    const stake = b.lastStake || b.liveBalance;
    const pnl = won ? stake * 0.02 : -stake;
    b.phase = 'settled';
    b.queuedOrderActive = false;
    b.queuedBetActive = false;
    b.lastStake = 0;
    logEvent('order_settled', { targetMult: mult, won, pnl });
    console.log(`[Crash Bot] ORDER SETTLED at ${mult.toFixed(2)}x -> ${won ? 'WIN (+2%)' : 'LOSS'}. Resuming hunting from zero.`);
    zeroAmountInput();
  }

  // New-round detection. On first sight of the page, seed from the newest pill
  // WITHOUT processing it: tracking always begins from zero.
  function trackLiveRounds() {
    const pills = getLivePills();
    if (pills.length === 0) return;

    const newest = pills[0];
    const b = window.__CRASH_BOT__;

    const sig = pills.join('|');

    if (!b.initialized) {
      b.initialized = true;
      b.lastLoggedMult = newest;
      b.lastPillsSig = sig;
      b.streak.lastEvent = 'Tracking started from zero (no historical rounds counted)';
      return;
    }

    // Compare the full pill list so two consecutive rounds with an identical
    // multiplier are still counted as two separate rounds.
    if (sig !== b.lastPillsSig) {
      b.lastPillsSig = sig;
      b.lastLoggedMult = newest;
      processNewRound(newest);
    }
  }

  // HUD Panel
  function updatePanelUI() {
    let panel = document.getElementById('__crash_bot_panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = '__crash_bot_panel';
      panel.style.cssText = `
        position: fixed;
        bottom: 12px;
        right: 12px;
        width: 370px;
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
    window._crash_bot_panel = panel; // alias for disaster-recovery checks

    const b = window.__CRASH_BOT__;
    const s = b.lagSentinel;
    const pills = getLivePills();
    const last3 = pills.slice(0, 3);

    const lagStatusText = s.lagDetected
      ? `<span style="color:#f85149; font-weight:bold;">⚠️ LAG DETECTED (Holding Order)</span>`
      : `<span style="color:#3fb950; font-weight:bold;">🟢 Smooth (${s.smoothStreakSeconds}s clean flight)</span>`;

    let badge;
    if (b.readyToExecuteNextRound || b.readyToBetNextRound) {
      badge = `<span style="background:#238636; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">TRIGGERED: COMMIT NEXT ROUND</span>`;
    } else if (b.queuedOrderActive || b.queuedBetActive) {
      badge = `<span style="background:#1f6feb; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">COMMIT QUEUED</span>`;
    } else if (b.streak.skipNextRound) {
      badge = `<span style="background:#9e6a03; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">SUPER MOON >99x: COMMIT SKIPPED, RESET</span>`;
    } else {
      badge = `<span style="color:#8b949e;">Hunting - ${b.streak.lastEvent}</span>`;
    }

    const streakColor = b.streak.count >= MIN_REDS ? '#3fb950' : '#8b949e';
    const streakLine = `<span style="color:${streakColor}; font-weight:bold;">${b.streak.count} consecutive RED${b.streak.count === 1 ? '' : 'S'}</span> (need ${MIN_REDS}+)`;
    const redList = b.streak.reds.length
      ? b.streak.reds.map(m => m.toFixed(2)).join(' ')
      : '-';
    const last3Line = last3.length
      ? last3.map(m => `<span style="color:${isRed(m) ? '#f85149' : (isMoon(m) ? '#e3b341' : '#3fb950')}">${m.toFixed(2)}×</span>`).join('  ')
      : '<span style="color:#8b949e;">n/a</span>';

    const isQueued = b.queuedOrderActive || b.queuedBetActive;

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2a3540; padding-bottom:6px;">
        <div style="font-weight:bold; font-size:12px; color:#58a6ff;">4+ RED -> GREEN/MOON PROTOCOL (1.02×)</div>
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
        <div style="color:#8b949e; font-size:10px; margin-bottom:4px;">STREAK TRACKER</div>
        <div style="font-size:11px;">${streakLine}</div>
        <div style="color:#8b949e; font-size:9px; margin-top:3px;">REDs: ${redList}</div>
        <div style="font-size:11px; margin-top:4px;">Recent: ${last3Line}</div>
        <div style="margin-top:5px; font-size:10px;">${badge}</div>
      </div>

      <div style="margin-bottom:8px; background:#161b22; padding:6px 8px; border-radius:6px;">
        <div style="color:#8b949e; font-size:10px; margin-bottom:2px;">LAG & MOTION SENTINEL</div>
        <div style="font-size:11px;">${lagStatusText}</div>
        <div style="color:#8b949e; font-size:9px; margin-top:2px;">Emergency auto-cancel active on lag, missing data, or reset.</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#8b949e;">
        <span>Queued Order: <b style="color:${isQueued ? '#3fb950' : '#8b949e'};">${isQueued ? 'ACTIVE' : 'NONE'}</b></span>
        <span>Phase: <b style="color:#58a6ff;">${b.phase.toUpperCase()}</b></span>
      </div>
    `;
  }

  // Master Loop (100ms for high responsiveness)
  window.__crash_bot_interval = setInterval(() => {
    const b = window.__CRASH_BOT__;

    // Missing-data watchdog: no settlement within 90s of arming/queueing.
    if ((b.readyToExecuteNextRound || b.queuedOrderActive || b.queuedBetActive) &&
        b.streak.armedAt && Date.now() - b.streak.armedAt > MISSING_DATA_MS) {
      cancelQueuedOrder('No readable settlement within 90s - skipping and waiting for a fresh pattern');
      logEvent('missing_data_skip', { reason: '90s watchdog: commit round unreadable' });
    }

    trackLiveRounds();
    updatePreStaging();
    updatePanelUI();

    if ((b.autoOrderEnabled || b.autoBetEnabled) &&
        (b.readyToExecuteNextRound || b.readyToBetNextRound) &&
        !(b.queuedOrderActive || b.queuedBetActive)) {
      executeOrder();
    }
  }, 100);

  return "4+ RED -> GREEN/MOON Protocol & Lag Sentinel Active!";
})();
