/* ============================================
   FOCUS FLOW — Pomodoro Timer & Matrix
   Application Logic
   ============================================ */

(() => {
  'use strict';

  // ============================================================
  //  SHARED UTILITIES
  // ============================================================

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const isTypingContext = (target) => (
    !!target &&
    (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    )
  );
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const APP_STATE_VERSION = 1;
  const APP_STORAGE_KEY = 'focus-flow-app-state-v1';
  const VALID_PANELS = new Set(['tasks', 'timer', 'settings']);
  const vscodeStateApi = (() => {
    try {
      if (typeof acquireVsCodeApi === 'function') return acquireVsCodeApi();
    } catch (e) {
      // no-op when not running inside VS Code webview
    }
    return null;
  })();

  function parseJsonSafe(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function readStoredState() {
    let stored = null;
    if (vscodeStateApi) {
      try {
        stored = vscodeStateApi.getState();
      } catch (e) {
        stored = null;
      }
    }
    if (!stored) {
      try {
        stored = parseJsonSafe(localStorage.getItem(APP_STORAGE_KEY));
      } catch (e) {
        stored = null;
      }
    }
    if (!stored || typeof stored !== 'object') return null;
    return stored;
  }

  const bootState = readStoredState();
  let persistStateTimer = null;

  // --- Audio ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(frequency, duration, type = 'sine') {
    if (!TIMER_CONFIG.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration);
    } catch (e) { /* audio not available */ }
  }
  function playCompletionSound() {
    playTone(523.25, 0.15);
    setTimeout(() => playTone(659.25, 0.15), 150);
    setTimeout(() => playTone(783.99, 0.3), 300);
  }
  function playClickSound() { playTone(800, 0.05, 'square'); }


  // ============================================================
  //  VIEW SWITCHING
  // ============================================================

  const _restoredPanel = bootState?.ui?.activePanel;
  let activePanel = (VALID_PANELS.has(_restoredPanel) && _restoredPanel !== 'settings') ? _restoredPanel : 'tasks';
  let previousPanel = 'tasks';
  let isTopMenuCollapsed = bootState?.ui?.menuCollapsed === true;
  let densityMode = bootState?.ui?.densityMode === 'compact' ? 'compact' : 'default'; // 'default' | 'compact'
  let reducedMotionEnabled = typeof bootState?.ui?.reducedMotion === 'boolean'
    ? bootState.ui.reducedMotion
    : !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let matrixEnabled = bootState?.matrix?.enabled === true;

  function setActivePanel(panel, persist = true) {
    if (!VALID_PANELS.has(panel)) panel = 'tasks';
    if (panel === activePanel) return;

    previousPanel = activePanel;
    activePanel = panel;

    const timerPanel   = $('#viewTimer');
    const tasksPanel   = $('#viewTasks');
    const settingsEl   = $('#settingsPanel');

    // Timer panel visible for 'timer' and 'settings' (settings is a fixed child inside it)
    if (timerPanel) {
      timerPanel.classList.toggle('hidden', panel === 'tasks');
      timerPanel.classList.toggle('open',   panel === 'timer' || panel === 'settings');
    }
    // Tasks panel
    if (tasksPanel) {
      tasksPanel.classList.toggle('active', panel === 'tasks');
    }
    // Settings panel
    if (settingsEl) {
      settingsEl.classList.toggle('hidden', panel !== 'settings');
    }

    // Body panel class for CSS scoping
    document.body.classList.toggle('panel-tasks',    panel === 'tasks');
    document.body.classList.toggle('panel-timer',    panel === 'timer');
    document.body.classList.toggle('panel-settings', panel === 'settings');

    // Nav tab active state — 'settings' highlights the timer tab (settings is a sub-panel)
    $$('.view-tab').forEach(t => {
      const v = t.dataset.view;
      t.classList.toggle('active', v === panel || (v === 'timer' && panel === 'settings'));
    });
    updateViewIndicator();

    // Timer button in tasks header active state
    const timerToggleBtn = $('#btnToggleTimerTool');
    if (timerToggleBtn) {
      const timerActive = panel === 'timer' || panel === 'settings';
      timerToggleBtn.classList.toggle('active', timerActive);
      timerToggleBtn.setAttribute('aria-pressed', String(timerActive));
    }

    updateMiniCounter();

    if (panel !== 'timer') {
      const titles = { tasks: 'FlowBoard | Tasks', settings: 'FlowBoard | Settings' };
      document.title = titles[panel] || 'FlowBoard';
    }

    if (persist) queuePersistAppState();
  }

  function updateViewIndicator() {
    const activeTab = $('.view-tab.active');
    if (!activeTab) return;
    const container = $('#viewSwitcher');
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const tRect = activeTab.getBoundingClientRect();
    const ind = $('#viewIndicator');
    if (!ind) return;
    ind.style.width = `${tRect.width}px`;
    ind.style.left = `${tRect.left - cRect.left}px`;
  }

  function setTopMenuCollapsed(collapsed, persist = true) {
    const switcher = $('#viewSwitcher');
    const toggle = $('#btnToggleTopMenu');
    if (!switcher || !toggle) return;
    isTopMenuCollapsed = collapsed;
    switcher.classList.toggle('collapsed', collapsed);
    toggle.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.title = collapsed ? 'Show Tabs' : 'Hide Tabs';
    document.body.classList.toggle('menu-collapsed', collapsed);
    if (persist) queuePersistAppState();
  }

  function setDensityMode(mode, persist = true) {
    const resolvedMode = mode === 'compact' ? 'compact' : 'default';
    densityMode = resolvedMode;
    const toggle = $('#btnDensityMode');
    const isCompact = resolvedMode === 'compact';
    document.body.classList.toggle('density-compact', isCompact);
    if (toggle) {
      toggle.classList.toggle('active', isCompact);
      toggle.textContent = isCompact ? 'Default' : 'Compact';
      toggle.title = isCompact ? 'Switch to Default mode' : 'Switch to Compact mode';
      toggle.setAttribute('aria-pressed', String(isCompact));
    }
    if (persist) {
      try {
        localStorage.setItem('focus-flow-density-mode', resolvedMode);
      } catch (e) {
        // no-op if storage is unavailable
      }
      queuePersistAppState();
    }
  }

  function setReducedMotion(enabled, persist = true) {
    reducedMotionEnabled = !!enabled;
    document.body.classList.toggle('reduced-motion', reducedMotionEnabled);
    const toggle = $('#reducedMotionToggle');
    if (toggle) {
      toggle.classList.toggle('active', reducedMotionEnabled);
      toggle.textContent = reducedMotionEnabled ? 'On' : 'Off';
    }
    if (persist) queuePersistAppState();
  }

function setMatrixEnabled(enabled, persist = true) {
    matrixEnabled = !!enabled;
    const matrixToggleBtn = $('#btnToggleMatrixFx');
    const matrixControls = $('#matrixControls');
    const viewMatrix = $('#viewMatrix');
    document.body.classList.toggle('matrix-enabled', matrixEnabled);
    document.body.classList.toggle('matrix-active', matrixEnabled);
    if (matrixToggleBtn) {
      matrixToggleBtn.classList.toggle('active', matrixEnabled);
      matrixToggleBtn.setAttribute('aria-pressed', String(matrixEnabled));
    }
    if (!matrixEnabled) {
      matrixStop();
      if (matrixControls) matrixControls.classList.add('collapsed');
      if (viewMatrix) viewMatrix.classList.remove('palette-open');
    } else {
      matrixStart();
    }
    if (persist) queuePersistAppState();
  }

  function initViewSwitcher() {
    $$('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        if (view === 'matrix') {
          setMatrixEnabled(!matrixEnabled);
        } else {
          setActivePanel(view);
        }
        playClickSound();
      });
    });
    const topMenuToggle = $('#btnToggleTopMenu');
    if (topMenuToggle) {
      topMenuToggle.onclick = () => {
        setTopMenuCollapsed(!isTopMenuCollapsed);
        if (!isTopMenuCollapsed) updateViewIndicator();
        playClickSound();
      };
    }
    const densityToggle = $('#btnDensityMode');
    if (densityToggle) {
      densityToggle.onclick = () => {
        setDensityMode(densityMode === 'compact' ? 'default' : 'compact');
        playClickSound();
      };
    }
    const matrixFxToggle = $('#btnToggleMatrixFx');
    if (matrixFxToggle) {
      matrixFxToggle.addEventListener('click', () => {
        setMatrixEnabled(!matrixEnabled);
        playClickSound();
      });
    }
    const timerToolToggle = $('#btnToggleTimerTool');
    if (timerToolToggle) {
      timerToolToggle.addEventListener('click', () => {
        setActivePanel(activePanel === 'timer' ? 'tasks' : 'timer');
        playClickSound();
      });
    }
    const preferredDensity = (() => {
      if (bootState?.ui?.densityMode === 'compact') return 'compact';
      if (bootState?.ui?.densityMode === 'default') return 'default';
      try {
        return localStorage.getItem('focus-flow-density-mode') || 'default';
      } catch (e) {
        return 'default';
      }
    })();
    try {
      setDensityMode(preferredDensity, false);
    } catch (e) {
      setDensityMode('default', false);
    }
    setReducedMotion(reducedMotionEnabled, false);
    window.addEventListener('resize', () => {
      updateModeIndicator();
      if (matrixEnabled) scheduleMatrixResize();
    });
    setTopMenuCollapsed(false, false);
    setMatrixEnabled(matrixEnabled, false);
    updateViewIndicator();
  }


  // ============================================================
  //  TIMER MODULE
  // ============================================================

  const TIMER_CONFIG = {
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLong: 4,
    soundEnabled: true,
  };
  if (bootState?.timer?.config && typeof bootState.timer.config === 'object') {
    const cfg = bootState.timer.config;
    if (Number.isFinite(cfg.focusDuration)) TIMER_CONFIG.focusDuration = clamp(Math.round(cfg.focusDuration), 1, 90);
    if (Number.isFinite(cfg.shortBreakDuration)) TIMER_CONFIG.shortBreakDuration = clamp(Math.round(cfg.shortBreakDuration), 1, 30);
    if (Number.isFinite(cfg.longBreakDuration)) TIMER_CONFIG.longBreakDuration = clamp(Math.round(cfg.longBreakDuration), 1, 60);
    if (Number.isFinite(cfg.sessionsBeforeLong)) TIMER_CONFIG.sessionsBeforeLong = clamp(Math.round(cfg.sessionsBeforeLong), 1, 10);
    if (typeof cfg.soundEnabled === 'boolean') TIMER_CONFIG.soundEnabled = cfg.soundEnabled;
  }

  const CIRCUMFERENCE = 2 * Math.PI * 115;

  const QUOTES = [
    { text: '"The secret of getting ahead is getting started."', author: '— Mark Twain' },
    { text: '"Focus on being productive instead of busy."', author: '— Tim Ferriss' },
    { text: '"It\'s not that I\'m so smart, it\'s just that I stay with problems longer."', author: '— Albert Einstein' },
    { text: '"Do the hard jobs first. The easy jobs will take care of themselves."', author: '— Dale Carnegie' },
    { text: '"The way to get started is to quit talking and begin doing."', author: '— Walt Disney' },
    { text: '"You don\'t have to be great to start, but you have to start to be great."', author: '— Zig Ziglar' },
    { text: '"Starve your distractions. Feed your focus."', author: '— Daniel Goleman' },
    { text: '"Concentrate all your thoughts upon the work at hand."', author: '— Alexander Graham Bell' },
    { text: '"Work hard in silence, let your success be your noise."', author: '— Frank Ocean' },
    { text: '"Small daily improvements are the key to staggering long-term results."', author: '— Robin Sharma' },
    { text: '"Deep work is the ability to focus without distraction on a cognitively demanding task."', author: '— Cal Newport' },
    { text: '"The only way to do great work is to love what you do."', author: '— Steve Jobs' },
  ];

  const LABELS = { focus: 'FOCUS TIME', 'short-break': 'SHORT BREAK', 'long-break': 'LONG BREAK' };

  let timerState = {
    mode: 'focus',
    running: false,
    totalSeconds: TIMER_CONFIG.focusDuration * 60,
    remainingSeconds: TIMER_CONFIG.focusDuration * 60,
    completedSessions: 0,
    intervalId: null,
  };
  let shouldResumeTimerOnInit = false;

  const timerEls = {};

  function cacheTimerEls() {
    timerEls.timerTime = $('#timerTime');
    timerEls.timerLabel = $('#timerLabel');
    timerEls.timerProgress = $('#timerProgress');
    timerEls.timerContainer = $('#timerContainer');
    timerEls.btnStartPause = $('#btnStartPause');
    timerEls.btnReset = $('#btnReset');
    timerEls.btnSkip = $('#btnSkip');
    timerEls.iconPlay = $('#iconPlay');
    timerEls.iconPause = $('#iconPause');
    timerEls.modeSelector = $('#modeSelector');
    timerEls.modeIndicator = $('#modeIndicator');
    timerEls.sessionCounter = $('#sessionCounter');
    timerEls.quote = $('#quote');
    timerEls.quoteAuthor = $('#quoteAuthor');
    timerEls.btnSettings = $('#btnSettings');
    timerEls.btnCloseTimerTool = $('#btnCloseTimerTool');
    timerEls.settingsPanel = $('#settingsPanel');
    timerEls.settingsBackdrop = $('#settingsBackdrop');
    timerEls.btnCloseSettings = $('#btnCloseSettings');
    timerEls.soundToggle = $('#soundToggle');
    timerEls.reducedMotionToggle = $('#reducedMotionToggle');
    timerEls.tickMarks = $('#tickMarks');
    timerEls.particleRing = $('#particleRing');
  }

  // Tick marks
  function createTickMarks() {
    timerEls.tickMarks.innerHTML = '';
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * 360;
      const rad = (angle * Math.PI) / 180;
      const isMajor = i % 5 === 0;
      const innerR = isMajor ? 106 : 109;
      const outerR = 113;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 130 + innerR * Math.cos(rad));
      line.setAttribute('y1', 130 + innerR * Math.sin(rad));
      line.setAttribute('x2', 130 + outerR * Math.cos(rad));
      line.setAttribute('y2', 130 + outerR * Math.sin(rad));
      if (isMajor) line.classList.add('major');
      timerEls.tickMarks.appendChild(line);
    }
  }

  // Particles
  let particleInterval = null;
  function spawnParticle() {
    if (!timerState.running) return;
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = Math.random() * Math.PI * 2, r = 135;
    p.style.left = `${r + r * Math.cos(angle)}px`;
    p.style.top = `${r + r * Math.sin(angle)}px`;
    p.style.background = 'var(--primary)';
    timerEls.particleRing.appendChild(p);
    requestAnimationFrame(() => p.classList.add('visible'));
    setTimeout(() => p.remove(), 2000);
  }
  function startParticles() { stopParticles(); particleInterval = setInterval(spawnParticle, 600); }
  function stopParticles() { if (particleInterval) { clearInterval(particleInterval); particleInterval = null; } }

  // Timer
  function getDuration(mode) {
    switch (mode) {
      case 'focus': return TIMER_CONFIG.focusDuration * 60;
      case 'short-break': return TIMER_CONFIG.shortBreakDuration * 60;
      case 'long-break': return TIMER_CONFIG.longBreakDuration * 60;
    }
  }

  function getPersistableTimerRemainingSeconds() {
    if (!timerState.running) return timerState.remainingSeconds;
    const updatedAt = Number.isFinite(timerState.updatedAt) ? timerState.updatedAt : Date.now();
    const elapsed = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
    return Math.max(0, timerState.remainingSeconds - elapsed);
  }

  function restoreTimerStateFromBoot() {
    const savedTimer = bootState?.timer;
    if (!savedTimer || typeof savedTimer !== 'object') return;
    const mode = ['focus', 'short-break', 'long-break'].includes(savedTimer.mode) ? savedTimer.mode : 'focus';
    timerState.mode = mode;
    timerState.totalSeconds = getDuration(mode);
    timerState.completedSessions = Number.isFinite(savedTimer.completedSessions)
      ? clamp(Math.round(savedTimer.completedSessions), 0, 1000)
      : 0;
    const savedRemaining = Number.isFinite(savedTimer.remainingSeconds)
      ? clamp(Math.round(savedTimer.remainingSeconds), 0, timerState.totalSeconds)
      : timerState.totalSeconds;
    let resolvedRemaining = savedRemaining;
    const wasRunning = savedTimer.running === true;
    if (wasRunning && Number.isFinite(savedTimer.updatedAt)) {
      const elapsed = Math.max(0, Math.floor((Date.now() - savedTimer.updatedAt) / 1000));
      resolvedRemaining = Math.max(0, savedRemaining - elapsed);
      shouldResumeTimerOnInit = resolvedRemaining > 0;
    }
    timerState.remainingSeconds = resolvedRemaining;
    timerState.running = false;
    timerState.intervalId = null;
    timerState.updatedAt = Date.now();
  }

  restoreTimerStateFromBoot();

  function formatTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function updateMiniCounter() {
    const el = $('#timerMiniCounter');
    if (!el) return;
    const active = timerState.running && activePanel !== 'timer';
    el.classList.toggle('visible', active);
    if (active) el.textContent = formatTime(timerState.remainingSeconds);
  }

  function updateDisplay() {
    timerEls.timerTime.textContent = formatTime(timerState.remainingSeconds);
    const progress = 1 - timerState.remainingSeconds / timerState.totalSeconds;
    timerEls.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    timerEls.timerProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
    document.title = `${formatTime(timerState.remainingSeconds)} — ${LABELS[timerState.mode]} | FlowBoard`;
    updateMiniCounter();
  }

  function tick() {
    if (timerState.remainingSeconds <= 0) { completeSession(); return; }
    timerState.remainingSeconds--;
    timerState.updatedAt = Date.now();
    updateDisplay();
    timerEls.timerTime.classList.add('tick');
    setTimeout(() => timerEls.timerTime.classList.remove('tick'), 200);
    if (timerState.remainingSeconds % 5 === 0) queuePersistAppState();
  }

  function startTimer() {
    if (timerState.running) return;
    timerState.updatedAt = Date.now();
    timerState.running = true;
    timerState.intervalId = setInterval(tick, 1000);
    timerEls.iconPlay.classList.add('hidden');
    timerEls.iconPause.classList.remove('hidden');
    document.body.classList.add('is-running');
    startParticles(); updateSessionDots(); updateMiniCounter();
    queuePersistAppState();
  }
  function pauseTimer() {
    if (!timerState.running) return;
    timerState.remainingSeconds = getPersistableTimerRemainingSeconds();
    timerState.updatedAt = Date.now();
    timerState.running = false;
    clearInterval(timerState.intervalId); timerState.intervalId = null;
    timerEls.iconPlay.classList.remove('hidden');
    timerEls.iconPause.classList.add('hidden');
    document.body.classList.remove('is-running');
    stopParticles(); updateSessionDots(); updateMiniCounter();
    queuePersistAppState();
  }
  function resetTimer() {
    pauseTimer();
    timerState.totalSeconds = getDuration(timerState.mode);
    timerState.remainingSeconds = timerState.totalSeconds;
    timerState.updatedAt = Date.now();
    updateDisplay();
    queuePersistAppState();
  }
  function completeSession() {
    pauseTimer(); playCompletionSound();
    timerEls.timerContainer.classList.add('completed');
    setTimeout(() => timerEls.timerContainer.classList.remove('completed'), 600);
    if (timerState.mode === 'focus') {
      timerState.completedSessions++; updateSessionDots();
      switchTimerMode(timerState.completedSessions % TIMER_CONFIG.sessionsBeforeLong === 0 ? 'long-break' : 'short-break');
    } else {
      switchTimerMode('focus');
    }
    showNewQuote();
    queuePersistAppState();
  }
  function skipSession() {
    pauseTimer();
    switchTimerMode(timerState.mode === 'focus' ? 'short-break' : 'focus');
    showNewQuote();
    queuePersistAppState();
  }
  function switchTimerMode(mode) {
    pauseTimer();
    timerState.mode = mode;
    timerState.totalSeconds = getDuration(mode);
    timerState.remainingSeconds = timerState.totalSeconds;
    $$('.mode-btn').forEach(b => b.classList.remove('active'));
    const ab = $(`[data-mode="${mode}"]`);
    if (ab) ab.classList.add('active');
    // Preserve helper classes while changing theme
    const isMatrix = document.body.classList.contains('matrix-active');
    const isMenuCollapsed = document.body.classList.contains('menu-collapsed');
    const isCompactDensity = document.body.classList.contains('density-compact');
    document.body.className = `theme-${mode}`;
    if (isMatrix) document.body.classList.add('matrix-active', 'matrix-enabled');
    if (isMenuCollapsed) document.body.classList.add('menu-collapsed');
    if (isCompactDensity) document.body.classList.add('density-compact');
    if (reducedMotionEnabled) document.body.classList.add('reduced-motion');
    document.body.classList.add(`panel-${activePanel}`);
    timerEls.timerLabel.textContent = LABELS[mode];
    updateModeIndicator(); updateDisplay(); updateSessionDots();
    queuePersistAppState();
  }

  function updateModeIndicator() {
    const ab = $('.mode-btn.active');
    if (!ab) return;
    const cRect = timerEls.modeSelector.getBoundingClientRect();
    const bRect = ab.getBoundingClientRect();
    timerEls.modeIndicator.style.width = `${bRect.width}px`;
    timerEls.modeIndicator.style.left = `${bRect.left - cRect.left}px`;
  }

  function updateSessionDots() {
    const c = timerEls.sessionCounter; c.innerHTML = '';
    for (let i = 0; i < TIMER_CONFIG.sessionsBeforeLong; i++) {
      const dot = document.createElement('span');
      dot.className = 'session-dot';
      if (i < timerState.completedSessions % TIMER_CONFIG.sessionsBeforeLong) dot.classList.add('completed');
      else if (i === timerState.completedSessions % TIMER_CONFIG.sessionsBeforeLong && timerState.mode === 'focus') dot.classList.add('active');
      c.appendChild(dot);
    }
    if (timerState.completedSessions > 0 && timerState.completedSessions % TIMER_CONFIG.sessionsBeforeLong === 0 && timerState.mode === 'long-break') {
      c.querySelectorAll('.session-dot').forEach(d => { d.classList.add('completed'); d.classList.remove('active'); });
    }
  }

  function showNewQuote() {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    timerEls.quote.style.opacity = '0';
    timerEls.quoteAuthor.style.opacity = '0';
    setTimeout(() => {
      timerEls.quote.textContent = q.text;
      timerEls.quoteAuthor.textContent = q.author;
      timerEls.quote.style.opacity = '1';
      timerEls.quoteAuthor.style.opacity = '1';
    }, 300);
  }

  // Settings
  function openSettings() {
    $('#focusDuration').textContent = TIMER_CONFIG.focusDuration;
    $('#shortBreakDuration').textContent = TIMER_CONFIG.shortBreakDuration;
    $('#longBreakDuration').textContent = TIMER_CONFIG.longBreakDuration;
    $('#sessionsBeforeLong').textContent = TIMER_CONFIG.sessionsBeforeLong;
    timerEls.soundToggle.classList.toggle('active', TIMER_CONFIG.soundEnabled);
    timerEls.soundToggle.textContent = TIMER_CONFIG.soundEnabled ? 'On' : 'Off';
    if (timerEls.reducedMotionToggle) {
      timerEls.reducedMotionToggle.classList.toggle('active', reducedMotionEnabled);
      timerEls.reducedMotionToggle.textContent = reducedMotionEnabled ? 'On' : 'Off';
    }
    setActivePanel('settings');
  }
  function closeSettings() {
    resetTimer(); updateSessionDots();
    const dest = (previousPanel === 'settings' || !VALID_PANELS.has(previousPanel)) ? 'tasks' : previousPanel;
    setActivePanel(dest);
  }
  function handleStepper(target, action) {
    const limits = {
      focusDuration: { min: 1, max: 90 },
      shortBreakDuration: { min: 1, max: 30 },
      longBreakDuration: { min: 1, max: 60 },
      sessionsBeforeLong: { min: 1, max: 10 },
    };
    const l = limits[target]; if (!l) return;
    let v = TIMER_CONFIG[target];
    if (action === 'inc' && v < l.max) v++;
    if (action === 'dec' && v > l.min) v--;
    TIMER_CONFIG[target] = v;
    $(`#${target}`).textContent = v;
    playClickSound();
    queuePersistAppState();
  }

  function bindTimerEvents() {
    timerEls.btnStartPause.addEventListener('click', () => { timerState.running ? pauseTimer() : startTimer(); playClickSound(); });
    timerEls.btnReset.addEventListener('click', () => { resetTimer(); playClickSound(); });
    timerEls.btnSkip.addEventListener('click', () => { skipSession(); playClickSound(); });
    $$('.mode-btn').forEach(btn => btn.addEventListener('click', () => { switchTimerMode(btn.dataset.mode); playClickSound(); }));
    if (timerEls.btnSettings) {
      timerEls.btnSettings.addEventListener('click', () => { openSettings(); playClickSound(); });
    }
    const btnSettingsLegacy = $('#btnSettingsLegacy');
    if (btnSettingsLegacy) {
      btnSettingsLegacy.addEventListener('click', () => { openSettings(); playClickSound(); });
    }
    if (timerEls.btnCloseTimerTool) {
      timerEls.btnCloseTimerTool.addEventListener('click', () => {
        setActivePanel('tasks');
        playClickSound();
      });
    }
    timerEls.btnCloseSettings.addEventListener('click', closeSettings);
    timerEls.settingsBackdrop.addEventListener('click', closeSettings);
    $$('.stepper-btn').forEach(btn => btn.addEventListener('click', () => handleStepper(btn.dataset.target, btn.dataset.action)));
    timerEls.soundToggle.addEventListener('click', () => {
      TIMER_CONFIG.soundEnabled = !TIMER_CONFIG.soundEnabled;
      timerEls.soundToggle.classList.toggle('active', TIMER_CONFIG.soundEnabled);
      timerEls.soundToggle.textContent = TIMER_CONFIG.soundEnabled ? 'On' : 'Off';
      playClickSound();
      queuePersistAppState();
    });
    if (timerEls.reducedMotionToggle) {
      timerEls.reducedMotionToggle.addEventListener('click', () => {
        setReducedMotion(!reducedMotionEnabled);
        playClickSound();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (isTypingContext(e.target)) return;
      if (e.code === 'Escape' && activePanel === 'settings') { closeSettings(); playClickSound(); return; }
      if (activePanel !== 'timer') return;
      if (e.code === 'Space') { e.preventDefault(); timerState.running ? pauseTimer() : startTimer(); playClickSound(); }
      if (e.code === 'KeyR') { resetTimer(); playClickSound(); }
      if (e.code === 'KeyS') { skipSession(); playClickSound(); }
    });
  }

  function initTimer() {
    cacheTimerEls();
    document.body.classList.add(`theme-${timerState.mode}`);
    $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === timerState.mode));
    timerEls.timerLabel.textContent = LABELS[timerState.mode];
    createTickMarks(); updateDisplay(); updateSessionDots();
    updateModeIndicator(); showNewQuote(); bindTimerEvents();
    if (shouldResumeTimerOnInit && timerState.remainingSeconds > 0) startTimer();
    requestAnimationFrame(() => requestAnimationFrame(updateModeIndicator));
  }


  // ============================================================
  //  TASKS MODULE
  // ============================================================

  const TASK_AGENTS = {
    codex: { label: 'Codex' },
    claude: { label: 'Claude' },
    copilot: { label: 'Copilot' },
    gemini: { label: 'Gemini' },
  };

  const TASK_STATUSES = {
    waiting: { label: 'Waiting' },
    'in-progress': { label: 'In Progress' },
    done: { label: 'Done' },
    blocked: { label: 'Blocked' },
  };
  const TASK_STATUS_ORDER = ['waiting', 'in-progress', 'done', 'blocked'];
  const VALID_TASK_AGENTS = Object.keys(TASK_AGENTS);
  const VALID_TASK_STATUSES = Object.keys(TASK_STATUSES);

  function sanitizeTaskList(rawTasks) {
    if (!Array.isArray(rawTasks)) return [];
    return rawTasks
      .filter(task => task && typeof task === 'object' && typeof task.text === 'string')
      .map(task => {
        const id = typeof task.id === 'string' && task.id.length > 0
          ? task.id
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const agent = VALID_TASK_AGENTS.includes(task.agent) ? task.agent : 'codex';
        const status = VALID_TASK_STATUSES.includes(task.status) ? task.status : 'waiting';
        const text = task.text.trim().slice(0, 140);
        return { id, agent, status, text };
      })
      .filter(task => task.text.length > 0)
      .slice(0, 100);
  }

  const taskState = {
    selectedAgent: VALID_TASK_AGENTS.includes(bootState?.tasks?.selectedAgent) ? bootState.tasks.selectedAgent : 'codex',
    selectedStatus: VALID_TASK_STATUSES.includes(bootState?.tasks?.selectedStatus) ? bootState.tasks.selectedStatus : 'waiting',
    tasks: sanitizeTaskList(bootState?.tasks?.tasks),
  };

  const taskEls = {};

  function cacheTaskEls() {
    taskEls.taskInput = $('#taskInput');
    taskEls.btnAddTask = $('#btnAddTask');
    taskEls.tasksList = $('#tasksList');
    taskEls.tasksCount = $('#tasksCount');
    taskEls.agentButtons = $$('.agent-btn');
    taskEls.statusButtons = $$('.status-btn');
  }

  function syncTaskButtonSelection() {
    taskEls.agentButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.agent === taskState.selectedAgent);
    });
    taskEls.statusButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.status === taskState.selectedStatus);
    });
  }

  function getAgentOptionMarkup(agent) {
    const selectedButton = $(`.agent-btn[data-agent="${agent}"] .option-main`);
    if (selectedButton) return selectedButton.innerHTML;
    return `<span>${TASK_AGENTS[agent]?.label || agent}</span>`;
  }

  function getNextTaskStatus(currentStatus) {
    const statusIndex = TASK_STATUS_ORDER.indexOf(currentStatus);
    if (statusIndex < 0) return TASK_STATUS_ORDER[0];
    return TASK_STATUS_ORDER[(statusIndex + 1) % TASK_STATUS_ORDER.length];
  }

  function updateTaskStatus(taskId, nextStatus) {
    const taskIndex = taskState.tasks.findIndex(task => task.id === taskId);
    if (taskIndex < 0) return;
    taskState.tasks[taskIndex].status = nextStatus;
    renderTasks();
    queuePersistAppState();
  }

  function renderTasks() {
    if (!taskEls.tasksList || !taskEls.tasksCount) return;
    taskEls.tasksCount.textContent = String(taskState.tasks.length);
    taskEls.tasksList.innerHTML = '';

    if (taskState.tasks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tasks-empty';
      empty.textContent = 'No tasks yet.';
      taskEls.tasksList.appendChild(empty);
      return;
    }

    taskState.tasks.forEach(task => {
      const item = document.createElement('article');
      item.className = 'task-item';

      const title = document.createElement('p');
      title.className = 'task-item-title';
      title.textContent = task.text;

      const meta = document.createElement('div');
      meta.className = 'task-item-meta';

      const agentChip = document.createElement('span');
      agentChip.className = 'task-agent-chip';
      agentChip.innerHTML = getAgentOptionMarkup(task.agent);

      const statusChip = document.createElement('button');
      statusChip.type = 'button';
      statusChip.className = 'task-status-chip task-status-btn';
      statusChip.dataset.action = 'cycle-status';
      statusChip.dataset.taskId = task.id;
      statusChip.setAttribute('aria-label', `Change status for task: ${task.text}`);
      statusChip.title = 'Change status';
      const statusDot = document.createElement('span');
      statusDot.className = `status-dot status-${task.status}`;
      const statusText = document.createElement('span');
      statusText.textContent = TASK_STATUSES[task.status]?.label || task.status;
      statusChip.append(statusDot, statusText);

      const actions = document.createElement('div');
      actions.className = 'task-item-actions';

      const archiveBtn = document.createElement('button');
      archiveBtn.type = 'button';
      archiveBtn.className = 'task-action-btn task-archive-btn';
      archiveBtn.dataset.action = 'archive-task';
      archiveBtn.dataset.taskId = task.id;
      archiveBtn.title = 'Archive task';
      archiveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/></svg>';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'task-action-btn task-delete-btn';
      deleteBtn.dataset.action = 'delete-task';
      deleteBtn.dataset.taskId = task.id;
      deleteBtn.title = 'Delete task';
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';

      actions.append(archiveBtn, deleteBtn);
      meta.append(agentChip, statusChip);
      item.append(title, meta, actions);
      taskEls.tasksList.appendChild(item);
    });
  }

  const ARCHIVE_STORAGE_KEY = 'focus-flow-archived-tasks';

  function loadArchivedTasks() {
    try {
      return JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveArchivedTasks(archived) {
    try {
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archived));
    } catch (e) { /* no-op */ }
    if (vscodeStateApi) {
      try {
        vscodeStateApi.postMessage({ type: 'archiveTasks', payload: archived });
      } catch (e) { /* no-op */ }
    }
  }

  function archiveTask(taskId) {
    const idx = taskState.tasks.findIndex(t => t.id === taskId);
    if (idx < 0) return;
    const [task] = taskState.tasks.splice(idx, 1);
    const archived = loadArchivedTasks();
    archived.unshift({ ...task, archivedAt: Date.now() });
    saveArchivedTasks(archived);
    renderTasks();
    queuePersistAppState();
  }

  function deleteTask(taskId) {
    const idx = taskState.tasks.findIndex(t => t.id === taskId);
    if (idx < 0) return;
    taskState.tasks.splice(idx, 1);
    renderTasks();
    queuePersistAppState();
  }

  function addTask() {
    if (!taskEls.taskInput) return;
    const text = taskEls.taskInput.value.trim();
    if (!text) return;

    taskState.tasks.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      agent: taskState.selectedAgent,
      status: taskState.selectedStatus,
    });

    taskEls.taskInput.value = '';
    renderTasks();
    queuePersistAppState();
  }

  function bindTaskEvents() {
    if (!taskEls.taskInput || !taskEls.btnAddTask) return;

    taskEls.agentButtons.forEach(button => {
      button.addEventListener('click', () => {
        taskState.selectedAgent = button.dataset.agent;
        syncTaskButtonSelection();
        playClickSound();
        queuePersistAppState();
      });
    });

    taskEls.statusButtons.forEach(button => {
      button.addEventListener('click', () => {
        taskState.selectedStatus = button.dataset.status;
        syncTaskButtonSelection();
        playClickSound();
        queuePersistAppState();
      });
    });

    taskEls.btnAddTask.addEventListener('click', () => {
      addTask();
      playClickSound();
    });

    taskEls.taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTask();
        playClickSound();
      }
    });

    if (taskEls.tasksList) {
      taskEls.tasksList.addEventListener('click', (e) => {
        const statusBtn = e.target.closest('[data-action="cycle-status"]');
        if (statusBtn) {
          const taskId = statusBtn.dataset.taskId;
          if (!taskId) return;
          const task = taskState.tasks.find(t => t.id === taskId);
          if (!task) return;
          updateTaskStatus(taskId, getNextTaskStatus(task.status));
          playClickSound();
          return;
        }
        const archiveBtn = e.target.closest('[data-action="archive-task"]');
        if (archiveBtn) {
          archiveTask(archiveBtn.dataset.taskId);
          playClickSound();
          return;
        }
        const deleteBtn = e.target.closest('[data-action="delete-task"]');
        if (deleteBtn) {
          deleteTask(deleteBtn.dataset.taskId);
          playClickSound();
        }
      });
    }
  }

  function initTasks() {
    cacheTaskEls();
    if (!taskEls.taskInput) return;
    if (!VALID_TASK_AGENTS.includes(taskState.selectedAgent)) taskState.selectedAgent = 'codex';
    if (!VALID_TASK_STATUSES.includes(taskState.selectedStatus)) taskState.selectedStatus = 'waiting';
    syncTaskButtonSelection();
    bindTaskEvents();
    renderTasks();
  }


  // ============================================================
  //  MATRIX MODULE
  // ============================================================

  const PALETTES = {
    classic: {
      chars: 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789ABCDEFZ',
      colors: ['#00FF41', '#00CC33', '#009922', '#006611', '#003308'],
      headColor: '#FFFFFF',
      bg: 'rgba(0, 0, 0, 0.25)',
    },
    cyan: {
      chars: '01アイウエオカキクケコ∞∑∏∆λΩξψ<>{}[]|/\\',
      colors: ['#00FFFF', '#00CCDD', '#0099BB', '#006688', '#003344'],
      headColor: '#E0FFFF',
      bg: 'rgba(0, 0, 0, 0.25)',
    },
    amber: {
      chars: '0123456789ABCDEFabcdef:;.,!?@#$%&*(){}[]|/\\~`',
      colors: ['#FFB000', '#DD9500', '#BB7700', '#885500', '#553300'],
      headColor: '#FFEECC',
      bg: 'rgba(0, 0, 0, 0.25)',
    },
    purple: {
      chars: '◆◇○●□■△▽☆★♠♣♥♦∞≈≠±√∫ΣΠΔΛΞΨΩαβγδ',
      colors: ['#BF40FF', '#9933CC', '#7722AA', '#551188', '#330066'],
      headColor: '#E8CCFF',
      bg: 'rgba(0, 0, 0, 0.25)',
    },
    red: {
      chars: '01ＲＥＤＰＩＬＬ真実覚醒自由解放⚡☠✧✦❖◈',
      colors: ['#FF3333', '#DD2222', '#BB1111', '#880808', '#550404'],
      headColor: '#FFCCCC',
      bg: 'rgba(0, 0, 0, 0.25)',
    },
    rainbow: {
      chars: '★☆♠♣♥♦♪♫▲▼◆◇○●0123456789ABCDEF',
      colors: ['#FF0000', '#FF7700', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF', '#FF1493'],
      headColor: '#FFFFFF',
      bg: 'rgba(0, 0, 0, 0.25)',
      isRainbow: true,
    },
    pink: {
      chars: '桜花咲春風夢愛光星月雪舞散♡♥✿❀✾❁✧✦',
      colors: ['#FF69B4', '#FF1493', '#CC1177', '#991166', '#660044'],
      headColor: '#FFE0F0',
      bg: 'rgba(0, 0, 0, 0.25)',
    },
    ice: {
      chars: '❄❅❆✧✦◇◆▽△○●∴∵∶∷※☆★░▒▓█',
      colors: ['#E0FFFF', '#87CEEB', '#6BB3D9', '#4A99C0', '#2A7FA7'],
      headColor: '#FFFFFF',
      bg: 'rgba(0, 0, 0, 0.25)',
    },
  };

  let matrixCanvas, matrixCtx;
  let matrixColumns = [];
  let matrixAnimId = null;
  let matrixRunning = false;
  let currentPalette = 'classic';
  let matrixSpeedFactor = 3;
  let matrixDensityFactor = 3;
  let lastFrameTime = 0;
  let lastRenderedAt = 0;
  let matrixResizeDebounceId = null;

  if (bootState?.matrix && typeof bootState.matrix === 'object') {
    if (typeof bootState.matrix.palette === 'string' && PALETTES[bootState.matrix.palette]) {
      currentPalette = bootState.matrix.palette;
    }
    if (Number.isFinite(bootState.matrix.speed)) {
      matrixSpeedFactor = clamp(Math.round(bootState.matrix.speed), 1, 5);
    }
    if (Number.isFinite(bootState.matrix.density)) {
      matrixDensityFactor = clamp(Math.round(bootState.matrix.density), 1, 5);
    }
  }

  function matrixInit() {
    matrixCanvas = $('#matrixCanvas');
    matrixCtx = matrixCanvas.getContext('2d');

    // Palette buttons
    $$('.palette-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.palette === currentPalette);
      btn.addEventListener('click', () => {
        $$('.palette-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPalette = btn.dataset.palette;
        matrixReset();
        queuePersistAppState();
      });
    });

    // Speed slider
    const matrixSpeedInput = $('#matrixSpeed');
    if (matrixSpeedInput) {
      matrixSpeedInput.value = String(matrixSpeedFactor);
      matrixSpeedInput.addEventListener('input', (e) => {
        matrixSpeedFactor = clamp(parseInt(e.target.value, 10) || 3, 1, 5);
        queuePersistAppState();
      });
    }

    // Density slider
    const matrixDensityInput = $('#matrixDensity');
    if (matrixDensityInput) {
      matrixDensityInput.value = String(matrixDensityFactor);
      matrixDensityInput.addEventListener('input', (e) => {
        matrixDensityFactor = clamp(parseInt(e.target.value, 10) || 3, 1, 5);
        matrixReset();
        queuePersistAppState();
      });
    }

    // Palette Toggle
    const btnToggle = $('#btnToggleMatrixControls');
    const btnClose = $('#btnCloseMatrixControls');
    const matrixControls = $('#matrixControls');
    const viewMatrix = $('#viewMatrix');
    const startPaletteOpen = bootState?.matrix?.paletteOpen === true;
    
    if (btnToggle && btnClose && matrixControls) {
      const setPaletteOpen = (open) => {
        matrixControls.classList.toggle('collapsed', !open);
        if (viewMatrix) viewMatrix.classList.toggle('palette-open', open);
      };
      setPaletteOpen(matrixEnabled && startPaletteOpen);

      btnToggle.addEventListener('click', () => {
        if (!matrixEnabled) return;
        setPaletteOpen(matrixControls.classList.contains('collapsed'));
        queuePersistAppState();
      });
      btnClose.addEventListener('click', () => {
        setPaletteOpen(false);
        queuePersistAppState();
      });
    }
  }

  function matrixResize() {
    if (!matrixCanvas) return;
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;
    matrixReset();
  }

  function scheduleMatrixResize() {
    if (matrixResizeDebounceId) clearTimeout(matrixResizeDebounceId);
    matrixResizeDebounceId = setTimeout(() => {
      matrixResizeDebounceId = null;
      if (matrixEnabled) matrixResize();
    }, 120);
  }

  function getMatrixFrameInterval() {
    return reducedMotionEnabled ? 1000 / 18 : 1000 / 30;
  }

  function matrixReset() {
    if (!matrixCanvas) return;
    const fontSize = 18;
    // Lower end for density needs lower values (wider spacing).
    // Factor 1 -> 40px spacing (very sparse), Factor 5 -> 8px spacing
    const colSpacing = Math.max(2, 48 - (matrixDensityFactor * 8));
    const colWidth = fontSize + colSpacing;
    const numCols = Math.ceil(matrixCanvas.width / colWidth);

    matrixColumns = [];
    for (let i = 0; i < numCols; i++) {
      matrixColumns.push({
        x: i * colWidth + colWidth / 2,
        y: Math.random() * -matrixCanvas.height * 2, // stagger start
        speed: 15 + Math.random() * 20, // base speed pixels
        lastDrawnY: -100, // tracks our grid cell
        opacity: 0.5 + Math.random() * 0.5,
      });
    }
  }

  function matrixDraw(time) {
    if (!matrixRunning) return;
    matrixAnimId = requestAnimationFrame(matrixDraw);

    if (time - lastRenderedAt < getMatrixFrameInterval()) return;
    lastRenderedAt = time;

    // Delta time cap to avoid jumps when tab is inactive
    const deltaTime = Math.min((time - lastFrameTime) || 16.6, 50);
    lastFrameTime = time;

    const palette = PALETTES[currentPalette];
    const w = matrixCanvas.width, h = matrixCanvas.height;

    // Apply global fade effect (highly performant compared to rendering full trails)
    matrixCtx.fillStyle = palette.bg;
    matrixCtx.fillRect(0, 0, w, h);

    const fontSize = 18;
    matrixCtx.font = `${fontSize}px "JetBrains Mono", "MS Gothic", monospace`;

    // Speed curve adjustment for super slow at lower bounds
    // Factor 1 -> ~0.05 (extremely slow), Factor 5 -> 1.05 (fast)
    const speedMult = 0.01 + (matrixSpeedFactor * matrixSpeedFactor * 0.04); 

    for (let col of matrixColumns) {
      col.y += col.speed * speedMult * deltaTime * 0.1;
      const currentGridY = Math.floor(col.y / fontSize) * fontSize;

      if (currentGridY > col.lastDrawnY) {
        const charSet = palette.chars;

        // Overwrite the previous "head" character with a regular trailing color
        if (col.lastDrawnY >= 0) {
          const colColor = palette.isRainbow 
            ? palette.colors[(Math.floor(Date.now() / 200) + col.x) % palette.colors.length] 
            : palette.colors[Math.floor(Math.random() * palette.colors.length)];
          
          matrixCtx.fillStyle = colColor;
          matrixCtx.globalAlpha = col.opacity;
          matrixCtx.fillText(charSet[Math.floor(Math.random() * charSet.length)], col.x, col.lastDrawnY);
        }

        // Draw the new bright head character
        const headChar = charSet[Math.floor(Math.random() * charSet.length)];
        matrixCtx.fillStyle = palette.headColor;
        matrixCtx.globalAlpha = col.opacity;
        matrixCtx.fillText(headChar, col.x, currentGridY);

        col.lastDrawnY = currentGridY;

        // Reset column if totally off screen
        if (currentGridY > h && Math.random() > 0.95) {
          col.y = -fontSize - (Math.random() * 200);
          col.lastDrawnY = -100;
          col.speed = 15 + Math.random() * 20;
          col.opacity = 0.5 + Math.random() * 0.5;
        }
      }
    }
    matrixCtx.globalAlpha = 1;
  }

  function matrixStart() {
    if (!matrixEnabled) return;
    if (matrixRunning) return;
    matrixRunning = true;
    lastFrameTime = performance.now();
    lastRenderedAt = 0;
    matrixResize();
    // Clear canvas to black first
    matrixCtx.fillStyle = '#000';
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    matrixAnimId = requestAnimationFrame(matrixDraw);
  }

  function matrixStop() {
    matrixRunning = false;
    if (matrixAnimId) { cancelAnimationFrame(matrixAnimId); matrixAnimId = null; }
    if (matrixResizeDebounceId) {
      clearTimeout(matrixResizeDebounceId);
      matrixResizeDebounceId = null;
    }
  }

  function buildAppStateSnapshot() {
    const timerRemaining = getPersistableTimerRemainingSeconds();
    const matrixControls = $('#matrixControls');
    return {
      version: APP_STATE_VERSION,
      ui: {
        activePanel,
        menuCollapsed: isTopMenuCollapsed,
        densityMode,
        reducedMotion: reducedMotionEnabled,
      },
      timer: {
        mode: timerState.mode,
        remainingSeconds: timerRemaining,
        running: timerState.running && timerRemaining > 0,
        completedSessions: timerState.completedSessions,
        updatedAt: Date.now(),
        config: {
          focusDuration: TIMER_CONFIG.focusDuration,
          shortBreakDuration: TIMER_CONFIG.shortBreakDuration,
          longBreakDuration: TIMER_CONFIG.longBreakDuration,
          sessionsBeforeLong: TIMER_CONFIG.sessionsBeforeLong,
          soundEnabled: TIMER_CONFIG.soundEnabled,
        },
      },
      tasks: {
        selectedAgent: taskState.selectedAgent,
        selectedStatus: taskState.selectedStatus,
        tasks: taskState.tasks.map(task => ({
          id: task.id,
          text: task.text,
          agent: task.agent,
          status: task.status,
        })),
      },
      matrix: {
        enabled: matrixEnabled,
        palette: currentPalette,
        speed: matrixSpeedFactor,
        density: matrixDensityFactor,
        paletteOpen: matrixControls ? !matrixControls.classList.contains('collapsed') : false,
      },
    };
  }

  function persistAppStateNow() {
    const snapshot = buildAppStateSnapshot();
    if (vscodeStateApi) {
      try {
        vscodeStateApi.setState(snapshot);
      } catch (e) {
        // no-op if VS Code state storage is unavailable
      }
    }
    try {
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      // no-op if storage is unavailable
    }
  }

  function queuePersistAppState() {
    if (persistStateTimer) return;
    persistStateTimer = setTimeout(() => {
      persistStateTimer = null;
      persistAppStateNow();
    }, 120);
  }


  // ============================================================
  //  BOOT
  // ============================================================

  function init() {
    initTimer();
    initTasks();
    matrixInit();
    initViewSwitcher();
    const initialPanel = activePanel;
    activePanel = '';
    setActivePanel(initialPanel, false);

    // Keyboard: press M for matrix background, P for timer panel
    document.addEventListener('keydown', (e) => {
      if (isTypingContext(e.target)) return;
      if (e.code === 'KeyM') {
        setMatrixEnabled(!matrixEnabled);
        playClickSound();
      }
      if (e.code === 'KeyP') {
        setActivePanel(activePanel === 'timer' ? 'tasks' : 'timer');
        playClickSound();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (matrixEnabled) matrixStop();
        queuePersistAppState();
      } else if (matrixEnabled) {
        matrixStart();
      }
    });

    window.addEventListener('beforeunload', persistAppStateNow);
    queuePersistAppState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

