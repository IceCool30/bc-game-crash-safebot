// In-Page Crash Bot Engine
// Implements:
// 1. Aligned to top-of-hour WAT (UTC+1).
// 2. ZERO 10-minute observation lockout: immediately as the hour strikes (from millisecond 0),
//    starts tracking and is armed/ready to bet at ANY point in the hour that the sequence clears.
// 3. Strict Discrete Sequence Block Protocol:
//    - Tracks a strict 5-round sequence block: Round 1 of 5 -> Round 5 of 5.
//    - Every round in the block must be >= 1.50x.
//    - Symmetric Dual-Color Rule:
//      * Must contain AT LEAST ONE Amber (1.50x - 1.99x). (Pure green streak 5/5 fails).
//      * Must contain AT LEAST ONE Green (>= 2.00x). (Pure amber streak 5/5 fails).
//    - Hard Sequence Termination / Reset:
//      * If ANY round crashes below 1.50x, sequence is terminated immediately; next round starts at 1 of 5.
//      * If a 5-round sequence is pure greens (0 amber) or pure ambers (0 green), it FAILS and TERMINATES.
//      * Next round starts as Round 1 of a brand-new 5-round sequence. No sliding window borrowing.
//    - Bet Placement:
//      * Only when all 5 rounds pass the check does the bot stake on the 6th round of that sequence.
// 4. Auto Cash Out: 1.02x
// 5. Stake: 100% of available balance (All-In pre-staged continuously)
// 6. Cadence: strictly 1 bet per hour maximum

(() => {
  if (window.__crash_bot_interval) {
    clearInterval(window.__crash_bot_interval);
    window.__crash_bot_interval = null;
  }

  const prevLogs = window.__CRASH_BOT__?.logs || [];
  const prevHistory = window.__CRASH_BOT__?.history || [];
  const now = new Date();
  const currentHourWAT = (now.getUTCHours() + 1) % 24;
  const prevHourWAT = window.__CRASH_BOT__?.currentHourWAT ?? currentHourWAT;
  
  // If we are in the same hour, preserve hourlyBetsPlaced, otherwise reset to 0
  const isSameHour = prevHourWAT === currentHourWAT;
  const currentBets = isSameHour ? (window.__CRASH_BOT__?.hourlyBetsPlaced || 0) : 0;
  const initialPhase = currentBets >= 1 ? 'idle' : 'ready';

  window.__CRASH_BOT__ = {
    active: true,
    autoBetEnabled: true,
    targetCashout: 1.02,
    currentHourWAT,
    phase: initialPhase, // 'ready' | 'bet_placed' | 'idle'
    hourlyBetsPlaced: currentBets,
    maxBetsPerHour: 1,
    cycleStart: Date.now(),
    history: prevHistory,
    lastLoggedMult: null,
    
    // Strict Discrete Sequence State
    currentSequence: [], // Array of rounds in current 5-round block [m1, m2, ...]
    sequenceStatus: 'Initial tracking: waiting for Round 1 of 5',
    lastFailedReason: null,
    readyToBetOnRound6: false,
    
    stats: window.__CRASH_BOT__?.stats || {
      totalTracked: prevHistory.length,
      burgundyCount: 0,
      brightRedCount: 0,
      lowAmberCount: 0,
      safeAmberCount: 0,
      greenCount: 0,
      current150Streak: 0,
      currentSub110Gap: 0
    },
    ruleConfig: {
      mode: 'DISCRETE_BLOCK_SEQUENCE',
      blockSize: 5,
      threshold: 1.50,
      requireAmber: true,
      requireGreen: true,
      amberMin: 1.50,
      amberMax: 1.99,
      amberMaxCount: 2,
      greenMin: 2.00,
      autoCashout: 1.02,
      maxBetsPerHour: 1
    },
    liveBalance: window.__CRASH_BOT__?.liveBalance || 1082.95,
    logs: prevLogs
  };

  // Helper to extract and sort live pills by screen position (newest first)
  function getLivePills() {
    const elements = Array.from(document.querySelectorAll('span.whitespace-nowrap.font-extrabold, span[class*="whitespace-nowrap"][class*="font-extrabold"]'))
      .filter(el => /^\d+(\.\d+)?[×x]$/.test(el.innerText.trim()));

    const positioned = elements.map(el => {
      const rect = el.getBoundingClientRect();
      const mult = parseFloat(el.innerText.trim().replace(/[^0-9.]/g, ''));
      return { mult, x: rect.x };
    }).filter(p => Number.isFinite(p.mult));

    // Descending x: newest round is rightmost on screen
    positioned.sort((a, b) => b.x - a.x);
    return positioned.map(p => p.mult);
  }

  // Discrete Sequence Processor
  function processRoundInSequence(mult) {
    const b = window.__CRASH_BOT__;

    // Rule 1: Every round in sequence must be >= 1.50x
    if (mult < 1.50) {
      b.currentSequence = [];
      b.readyToBetOnRound6 = false;
      b.lastFailedReason = `Round crashed at ${mult.toFixed(2)}× (< 1.50×). Sequence terminated.`;
      b.sequenceStatus = `⛔ Streak broken: ${mult.toFixed(2)}× is < 1.50×. Next round is 1 of 5.`;
      return;
    }

    // mult is >= 1.50x: Add to current sequence block
    b.currentSequence.push(mult);
    const count = b.currentSequence.length;

    if (count < 5) {
      b.readyToBetOnRound6 = false;
      b.lastFailedReason = null;
      b.sequenceStatus = `⏳ Sequence building: ${count} of 5 rounds completed (all >= 1.50×).`;
      return;
    }

    // count === 5: Evaluate the complete 5-round block!
    if (count === 5) {
      const seq = b.currentSequence;
      const amberCount = seq.filter(m => m >= 1.50 && m < 2.00).length;
      const greenCount = seq.filter(m => m >= 2.00).length;

      // Fail condition A: 5/5 pure Greens (no Amber)
      if (amberCount === 0) {
        b.currentSequence = []; // Hard reset! Next round is 1 of 5!
        b.readyToBetOnRound6 = false;
        b.lastFailedReason = `5/5 pure Greens (${greenCount} greens, 0 amber). Overheating trap. Sequence terminated.`;
        b.sequenceStatus = `⛔ FAILED: 5/5 pure Greens (0 Amber). Terminated! Next round is 1 of 5.`;
        b.logs.push(`[Sequence] Block failed: 5/5 pure Greens [${seq.join(', ')}]. Discarded.`);
        return;
      }

      // Fail condition B: 5/5 pure Ambers (no Green)
      if (greenCount === 0) {
        b.currentSequence = []; // Hard reset! Next round is 1 of 5!
        b.readyToBetOnRound6 = false;
        b.lastFailedReason = `5/5 pure Ambers (${amberCount} ambers, 0 green). Stagnation trap. Sequence terminated.`;
        b.sequenceStatus = `⛔ FAILED: 5/5 pure Ambers (0 Green). Terminated! Next round is 1 of 5.`;
        b.logs.push(`[Sequence] Block failed: 5/5 pure Ambers [${seq.join(', ')}]. Discarded.`);
        return;
      }

      // Fail condition C: More than 2 Ambers (User Rule: Max 2 Ambers allowed, amberCount > 2 fails)
      if (amberCount > 2) {
        b.currentSequence = []; // Hard reset! Next round is 1 of 5!
        b.readyToBetOnRound6 = false;
        b.lastFailedReason = `Block contains ${amberCount} Ambers (max 2 allowed). Amber saturation trap. Terminated!`;
        b.sequenceStatus = `⛔ FAILED: ${amberCount} Ambers (Max 2 allowed). Terminated! Next round is 1 of 5.`;
        b.logs.push(`[Sequence] Block failed: ${amberCount} Ambers (> 2 max) [${seq.join(', ')}]. Discarded.`);
        return;
      }

      // Passed condition: Amber is 1 or 2, Green is >= 1!
      b.readyToBetOnRound6 = true;
      b.lastFailedReason = null;
      b.sequenceStatus = `✅ SEQUENCE PASSED: 5/5 (${amberCount} Amber, ${greenCount} Green). CLEAR TO STAKE ON ROUND 6!`;
      b.logs.push(`[Sequence] Block PASSED: [${seq.join(', ')}] with ${amberCount} Amber and ${greenCount} Green. Ready for round 6!`);
    }
  }

  // Live round tracker: updates history, stats, and sequence engine
  function trackLiveRounds() {
    const pills = getLivePills();
    if (pills.length === 0) return;

    const newest = pills[0];
    if (newest !== window.__CRASH_BOT__.lastLoggedMult) {
      window.__CRASH_BOT__.lastLoggedMult = newest;

      // Add to beginning of history if not duplicate
      if (window.__CRASH_BOT__.history[0] !== newest) {
        window.__CRASH_BOT__.history.unshift(newest);
        if (window.__CRASH_BOT__.history.length > 1000) {
          window.__CRASH_BOT__.history.pop();
        }
      }

      // Check settlement if bet was placed
      if (window.__CRASH_BOT__.phase === 'bet_placed') {
        const won = newest >= 1.02;
        const pnl = won ? (window.__CRASH_BOT__.liveBalance * 0.02) : -window.__CRASH_BOT__.liveBalance;
        window.__CRASH_BOT__.phase = 'idle'; // Finished for the hour
        window.__CRASH_BOT__.readyToBetOnRound6 = false;
        window.__CRASH_BOT__.currentSequence = []; // Reset sequence for next cycle
        window.__CRASH_BOT__.logs.push({
          ts: new Date().toISOString(),
          event: 'bet_settled',
          targetMult: newest,
          won,
          pnl
        });
        console.log(`[Crash Bot] BET SETTLED! Round ended at ${newest.toFixed(2)}x -> ${won ? 'WIN (+1.02x)' : 'LOSS'}. Bot now IDLE until next hour.`);
      }

      // Process this new round through the discrete sequence state machine
      processRoundInSequence(newest);

      // Recompute stats
      const s = window.__CRASH_BOT__.stats;
      s.totalTracked = window.__CRASH_BOT__.history.length;
      
      const sub110Idx = window.__CRASH_BOT__.history.findIndex(m => m < 1.10);
      s.currentSub110Gap = sub110Idx === -1 ? window.__CRASH_BOT__.history.length : sub110Idx;

      let streak = 0;
      for (const m of window.__CRASH_BOT__.history) {
        if (m >= 1.50) streak++;
        else break;
      }
      s.current150Streak = streak;

      s.burgundyCount = window.__CRASH_BOT__.history.filter(m => m < 1.10).length;
      s.brightRedCount = window.__CRASH_BOT__.history.filter(m => m >= 1.10 && m < 1.20).length;
      s.lowAmberCount = window.__CRASH_BOT__.history.filter(m => m >= 1.20 && m < 1.50).length;
      s.safeAmberCount = window.__CRASH_BOT__.history.filter(m => m >= 1.50 && m < 2.00).length;
      s.greenCount = window.__CRASH_BOT__.history.filter(m => m >= 2.00).length;
    }
  }

  // Pre-staging helper
  function updatePreStaging() {
    const walletEl = document.querySelector('.rr-mask');
    if (walletEl) {
      const match = walletEl.innerText.match(/NGN\s*([\d,]+\.?\d*)/);
      if (match) {
        const bal = parseFloat(match[1].replace(/,/g, ''));
        if (bal > 0) {
          window.__CRASH_BOT__.liveBalance = bal;
        }
      }
    } else {
      const textNodes = Array.from(document.querySelectorAll('header span, nav span, span, div')).filter(e => e.innerText && e.innerText.includes('NGN'));
      for (const node of textNodes) {
        const match = node.innerText.match(/NGN\s*([\d,]+\.?\d*)/);
        if (match) {
          const bal = parseFloat(match[1].replace(/,/g, ''));
          if (bal > 0 && bal < 500000) {
            window.__CRASH_BOT__.liveBalance = bal;
            break;
          }
        }
      }
    }

    const inputs = Array.from(document.querySelectorAll('input'));
    if (inputs.length >= 2) {
      const amountInput = inputs[0];
      const cashoutInput = inputs[1];

      // Auto cash out target
      if (cashoutInput.value !== '1.02') {
        cashoutInput.value = '1.02';
        cashoutInput.dispatchEvent(new Event('input', { bubbles: true }));
        cashoutInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Pre-stage full balance
      const maxStake = (Math.floor(window.__CRASH_BOT__.liveBalance * 100) / 100).toFixed(2);
      if (amountInput.value !== maxStake && window.__CRASH_BOT__.liveBalance > 0) {
        amountInput.value = maxStake;
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        amountInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // Execute Bet on 6th Round
  function executeBet(reason) {
    const betBtn = Array.from(document.querySelectorAll('button, div.button')).find(b => {
      const t = (b.innerText || '').trim();
      return t.startsWith('Bet') || t.includes('Bet\n') || t.includes('Next Round');
    });

    if (betBtn && !betBtn.disabled) {
      console.log(`[Crash Bot] EXECUTING BET on 6th Round! Reason: ${reason}`);
      betBtn.click();
      window.__CRASH_BOT__.hourlyBetsPlaced++;
      window.__CRASH_BOT__.phase = 'bet_placed';
      window.__CRASH_BOT__.readyToBetOnRound6 = false;
      window.__CRASH_BOT__.currentSequence = []; // Reset sequence
      window.__CRASH_BOT__.logs.push({
        ts: new Date().toISOString(),
        event: 'bet_placed',
        cashout: 1.02,
        stake: window.__CRASH_BOT__.liveBalance,
        reason
      });
      return true;
    }
    return false;
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
    const s = b.stats;
    const nowWAT = new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos' });
    const seq = b.currentSequence || [];
    const ambers = seq.filter(m => m >= 1.50 && m < 2.00).length;
    const greens = seq.filter(m => m >= 2.00).length;

    const seqPills = seq.length > 0 ? seq.map((m, idx) => {
      const isAmber = m >= 1.50 && m < 2.00;
      const bg = isAmber ? '#b08800' : '#238636';
      const label = isAmber ? 'A' : 'G';
      return `<span style="background:${bg}; color:#fff; padding:2px 5px; border-radius:4px; font-weight:bold; margin-right:4px;">#${idx+1}: ${m.toFixed(2)}× (${label})</span>`;
    }).join('') : '<span style="color:#8b949e; font-style:italic;">Empty (waiting for Round 1 of 5)</span>';

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2a3540; padding-bottom:6px;">
        <div style="font-weight:bold; font-size:12px; color:#58a6ff;">DISCRETE SEQUENCE BLOCK (1.02×)</div>
        <div style="color:#7ee787; font-weight:bold;">${nowWAT}</div>
      </div>

      <div style="margin-bottom:8px; background:#161b22; padding:6px 8px; border-radius:6px;">
        <div style="color:#8b949e; font-size:10px;">BALANCE & PRE-STAGE (ALL-IN)</div>
        <div style="display:flex; justify-content:space-between; margin-top:2px;">
          <span>NGN <b>${b.liveBalance.toFixed(2)}</b> (100%)</span>
          <span style="color:#58a6ff; font-weight:bold;">Auto Cash: 1.02×</span>
        </div>
      </div>

      <div style="margin-bottom:8px; background:#161b22; padding:6px 8px; border-radius:6px;">
        <div style="display:flex; justify-content:space-between; color:#8b949e; font-size:10px; margin-bottom:4px;">
          <span>ACTIVE BLOCK SEQUENCE</span>
          <span style="color:#58a6ff; font-weight:bold;">${seq.length} of 5</span>
        </div>
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:3px; min-height:22px;">${seqPills}</div>
      </div>

      <div style="margin-bottom:8px; background:#161b22; padding:6px 8px; border-radius:6px;">
        <div style="color:#8b949e; font-size:10px;">SEQUENCE STATUS & GUARDRAILS</div>
        <div style="font-weight:bold; color:${b.readyToBetOnRound6 ? '#3fb950' : (b.lastFailedReason ? '#f85149' : '#e6edf3')}; margin-top:3px;">
          ${b.sequenceStatus}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#8b949e; margin-top:4px;">
          <span>Amber (1-2): <b style="color:${ambers >= 1 && ambers <= 2 ? '#3fb950' : (ambers > 2 ? '#f85149' : '#8b949e')};">${ambers}/2</b></span>
          <span>Green (>=1): <b style="color:${greens >= 1 ? '#3fb950' : '#8b949e'};">${greens}</b></span>
          <span>Block Valid: <b style="color:${b.readyToBetOnRound6 ? '#3fb950' : '#f85149'};">${b.readyToBetOnRound6 ? 'YES' : 'NO'}</b></span>
        </div>
      </div>

      <div style="background:#161b22; padding:6px 8px; border-radius:6px; margin-bottom:8px; font-size:10px;">
        <div style="color:#8b949e; margin-bottom:2px;">LIVE MULTI-ROUND TRACKER</div>
        <div style="display:flex; justify-content:space-between; color:#c9d1d9;">
          <span>Tracked: <b>${s.totalTracked}</b></span>
          <span>Sub-1.10 Gap: <b style="color:${s.currentSub110Gap >= 4 ? '#3fb950' : '#f85149'};">${s.currentSub110Gap} rds</b></span>
          <span>1.50+ Streak: <b>${s.current150Streak}</b></span>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#8b949e;">
        <span>Hour Bet: <b>${b.hourlyBetsPlaced}/${b.maxBetsPerHour}</b></span>
        <span>Phase: <b style="color:${b.phase === 'ready' ? '#3fb950' : '#58a6ff'};">${b.phase === 'ready' ? 'HUNTING (READY)' : b.phase.toUpperCase()}</b></span>
      </div>
    `;
  }

  // Master 1-second interval loop
  window.__crash_bot_interval = setInterval(() => {
    trackLiveRounds();
    updatePreStaging();
    updatePanelUI();

    const now = new Date();
    const currentHourWAT = (now.getUTCHours() + 1) % 24;

    // Top-of-hour rollover: The very millisecond the hour strikes, reset and start hunting immediately
    if (window.__CRASH_BOT__.currentHourWAT !== currentHourWAT) {
      window.__CRASH_BOT__.currentHourWAT = currentHourWAT;
      window.__CRASH_BOT__.hourlyBetsPlaced = 0;
      window.__CRASH_BOT__.phase = 'ready'; // Immediately active from millisecond 0!
      window.__CRASH_BOT__.currentSequence = []; // Clean slate for new hour
      window.__CRASH_BOT__.readyToBetOnRound6 = false;
      window.__CRASH_BOT__.cycleStart = Date.now();
      window.__CRASH_BOT__.logs.push(`[${now.toLocaleTimeString()}] Hour ${currentHourWAT}:00 WAT struck! Zero observation delay - discrete sequence tracking active.`);
      console.log(`[Crash Bot] Top of hour ${currentHourWAT}:00 WAT struck! Zero observation delay - discrete sequence tracking active.`);
    }

    // Automated trigger on 6th round as soon as a 5-round sequence passes at ANY time within the hour
    if (window.__CRASH_BOT__.autoBetEnabled &&
        window.__CRASH_BOT__.phase === 'ready' &&
        window.__CRASH_BOT__.hourlyBetsPlaced < window.__CRASH_BOT__.maxBetsPerHour &&
        window.__CRASH_BOT__.readyToBetOnRound6) {
      executeBet(window.__CRASH_BOT__.sequenceStatus);
    }
  }, 1000);

  return "Discrete Sequence Block Protocol Installed & Active!";
})();
