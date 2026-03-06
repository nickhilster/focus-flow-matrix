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

  let activeView = 'timer'; // 'timer' | 'matrix'

  function switchView(view) {
    if (view === activeView) return;
    activeView = view;

    // Toggle view visibility
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    if (view === 'timer') {
      $('#viewTimer').classList.add('active');
      document.body.classList.remove('matrix-active');
      matrixStop();
    } else {
      $('#viewMatrix').classList.add('active');
      document.body.classList.add('matrix-active');
      matrixStart();
    }

    // Update tabs
    $$('.view-tab').forEach(t => t.classList.remove('active'));
    $(`[data-view="${view}"]`).classList.add('active');
    updateViewIndicator();
  }

  function updateViewIndicator() {
    const activeTab = $('.view-tab.active');
    if (!activeTab) return;
    const container = $('#viewSwitcher');
    const cRect = container.getBoundingClientRect();
    const tRect = activeTab.getBoundingClientRect();
    const ind = $('#viewIndicator');
    ind.style.width = `${tRect.width}px`;
    ind.style.left = `${tRect.left - cRect.left}px`;
  }

  function initViewSwitcher() {
    $$('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchView(tab.dataset.view);
        playClickSound();
      });
    });
    window.addEventListener('resize', () => {
      updateViewIndicator();
      updateModeIndicator();
      if (activeView === 'matrix') matrixResize();
    });
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
    timerEls.settingsPanel = $('#settingsPanel');
    timerEls.settingsBackdrop = $('#settingsBackdrop');
    timerEls.btnCloseSettings = $('#btnCloseSettings');
    timerEls.soundToggle = $('#soundToggle');
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
  function formatTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function updateDisplay() {
    timerEls.timerTime.textContent = formatTime(timerState.remainingSeconds);
    const progress = 1 - timerState.remainingSeconds / timerState.totalSeconds;
    timerEls.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    timerEls.timerProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
    document.title = `${formatTime(timerState.remainingSeconds)} — ${LABELS[timerState.mode]} | Focus Flow`;
  }

  function tick() {
    if (timerState.remainingSeconds <= 0) { completeSession(); return; }
    timerState.remainingSeconds--;
    updateDisplay();
    timerEls.timerTime.classList.add('tick');
    setTimeout(() => timerEls.timerTime.classList.remove('tick'), 200);
  }

  function startTimer() {
    if (timerState.running) return;
    timerState.running = true;
    timerState.intervalId = setInterval(tick, 1000);
    timerEls.iconPlay.classList.add('hidden');
    timerEls.iconPause.classList.remove('hidden');
    document.body.classList.add('is-running');
    startParticles(); updateSessionDots();
  }
  function pauseTimer() {
    if (!timerState.running) return;
    timerState.running = false;
    clearInterval(timerState.intervalId); timerState.intervalId = null;
    timerEls.iconPlay.classList.remove('hidden');
    timerEls.iconPause.classList.add('hidden');
    document.body.classList.remove('is-running');
    stopParticles(); updateSessionDots();
  }
  function resetTimer() {
    pauseTimer();
    timerState.totalSeconds = getDuration(timerState.mode);
    timerState.remainingSeconds = timerState.totalSeconds;
    updateDisplay();
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
  }
  function skipSession() {
    pauseTimer();
    switchTimerMode(timerState.mode === 'focus' ? 'short-break' : 'focus');
    showNewQuote();
  }
  function switchTimerMode(mode) {
    pauseTimer();
    timerState.mode = mode;
    timerState.totalSeconds = getDuration(mode);
    timerState.remainingSeconds = timerState.totalSeconds;
    $$('.mode-btn').forEach(b => b.classList.remove('active'));
    const ab = $(`[data-mode="${mode}"]`);
    if (ab) ab.classList.add('active');
    // Preserve matrix-active class if in matrix view
    const isMatrix = document.body.classList.contains('matrix-active');
    document.body.className = `theme-${mode}`;
    if (isMatrix) document.body.classList.add('matrix-active');
    timerEls.timerLabel.textContent = LABELS[mode];
    updateModeIndicator(); updateDisplay(); updateSessionDots();
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
    timerEls.settingsPanel.classList.remove('hidden');
    $('#focusDuration').textContent = TIMER_CONFIG.focusDuration;
    $('#shortBreakDuration').textContent = TIMER_CONFIG.shortBreakDuration;
    $('#longBreakDuration').textContent = TIMER_CONFIG.longBreakDuration;
    $('#sessionsBeforeLong').textContent = TIMER_CONFIG.sessionsBeforeLong;
    timerEls.soundToggle.classList.toggle('active', TIMER_CONFIG.soundEnabled);
    timerEls.soundToggle.textContent = TIMER_CONFIG.soundEnabled ? 'On' : 'Off';
  }
  function closeSettings() {
    timerEls.settingsPanel.classList.add('hidden');
    resetTimer(); updateSessionDots();
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
  }

  function bindTimerEvents() {
    timerEls.btnStartPause.addEventListener('click', () => { timerState.running ? pauseTimer() : startTimer(); playClickSound(); });
    timerEls.btnReset.addEventListener('click', () => { resetTimer(); playClickSound(); });
    timerEls.btnSkip.addEventListener('click', () => { skipSession(); playClickSound(); });
    $$('.mode-btn').forEach(btn => btn.addEventListener('click', () => { switchTimerMode(btn.dataset.mode); playClickSound(); }));
    timerEls.btnSettings.addEventListener('click', () => { openSettings(); playClickSound(); });
    timerEls.btnCloseSettings.addEventListener('click', closeSettings);
    timerEls.settingsBackdrop.addEventListener('click', closeSettings);
    $$('.stepper-btn').forEach(btn => btn.addEventListener('click', () => handleStepper(btn.dataset.target, btn.dataset.action)));
    timerEls.soundToggle.addEventListener('click', () => {
      TIMER_CONFIG.soundEnabled = !TIMER_CONFIG.soundEnabled;
      timerEls.soundToggle.classList.toggle('active', TIMER_CONFIG.soundEnabled);
      timerEls.soundToggle.textContent = TIMER_CONFIG.soundEnabled ? 'On' : 'Off';
      playClickSound();
    });

    document.addEventListener('keydown', (e) => {
      if (timerEls.settingsPanel && !timerEls.settingsPanel.classList.contains('hidden')) return;
      if (activeView !== 'timer') return;
      if (e.code === 'Space') { e.preventDefault(); timerState.running ? pauseTimer() : startTimer(); playClickSound(); }
      if (e.code === 'KeyR') { resetTimer(); playClickSound(); }
      if (e.code === 'KeyS') { skipSession(); playClickSound(); }
    });
  }

  function initTimer() {
    cacheTimerEls();
    document.body.classList.add('theme-focus');
    createTickMarks(); updateDisplay(); updateSessionDots();
    updateModeIndicator(); showNewQuote(); bindTimerEvents();
    requestAnimationFrame(() => requestAnimationFrame(updateModeIndicator));
  }


  // ============================================================
  //  MATRIX MODULE
  // ============================================================

  const PALETTES = {
    classic: {
      chars: 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789ABCDEFZ',
      colors: ['#00FF41', '#00CC33', '#009922', '#006611', '#003308'],
      headColor: '#FFFFFF',
      bg: 'rgba(0, 0, 0, 0.05)',
    },
    cyan: {
      chars: '01アイウエオカキクケコ∞∑∏∆λΩξψ<>{}[]|/\\',
      colors: ['#00FFFF', '#00CCDD', '#0099BB', '#006688', '#003344'],
      headColor: '#E0FFFF',
      bg: 'rgba(0, 5, 10, 0.05)',
    },
    amber: {
      chars: '0123456789ABCDEFabcdef:;.,!?@#$%&*(){}[]|/\\~`',
      colors: ['#FFB000', '#DD9500', '#BB7700', '#885500', '#553300'],
      headColor: '#FFEECC',
      bg: 'rgba(5, 3, 0, 0.05)',
    },
    purple: {
      chars: '◆◇○●□■△▽☆★♠♣♥♦∞≈≠±√∫ΣΠΔΛΞΨΩαβγδ',
      colors: ['#BF40FF', '#9933CC', '#7722AA', '#551188', '#330066'],
      headColor: '#E8CCFF',
      bg: 'rgba(5, 0, 8, 0.05)',
    },
    red: {
      chars: '01ＲＥＤＰＩＬＬ真実覚醒自由解放⚡☠✧✦❖◈',
      colors: ['#FF3333', '#DD2222', '#BB1111', '#880808', '#550404'],
      headColor: '#FFCCCC',
      bg: 'rgba(8, 0, 0, 0.05)',
    },
    rainbow: {
      chars: '★☆♠♣♥♦♪♫▲▼◆◇○●0123456789ABCDEF',
      colors: ['#FF0000', '#FF7700', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF', '#FF1493'],
      headColor: '#FFFFFF',
      bg: 'rgba(0, 0, 0, 0.05)',
      isRainbow: true,
    },
    pink: {
      chars: '桜花咲春風夢愛光星月雪舞散♡♥✿❀✾❁✧✦',
      colors: ['#FF69B4', '#FF1493', '#CC1177', '#991166', '#660044'],
      headColor: '#FFE0F0',
      bg: 'rgba(8, 0, 4, 0.05)',
    },
    ice: {
      chars: '❄❅❆✧✦◇◆▽△○●∴∵∶∷※☆★░▒▓█',
      colors: ['#E0FFFF', '#87CEEB', '#6BB3D9', '#4A99C0', '#2A7FA7'],
      headColor: '#FFFFFF',
      bg: 'rgba(0, 2, 5, 0.05)',
    },
  };

  let matrixCanvas, matrixCtx;
  let matrixColumns = [];
  let matrixAnimId = null;
  let matrixRunning = false;
  let currentPalette = 'classic';
  let matrixSpeedFactor = 3;
  let matrixDensityFactor = 3;

  function matrixInit() {
    matrixCanvas = $('#matrixCanvas');
    matrixCtx = matrixCanvas.getContext('2d');

    // Palette buttons
    $$('.palette-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.palette-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPalette = btn.dataset.palette;
        matrixReset();
      });
    });

    // Speed slider
    $('#matrixSpeed').addEventListener('input', (e) => {
      matrixSpeedFactor = parseInt(e.target.value);
    });

    // Density slider
    $('#matrixDensity').addEventListener('input', (e) => {
      matrixDensityFactor = parseInt(e.target.value);
      matrixReset();
    });
  }

  function matrixResize() {
    if (!matrixCanvas) return;
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;
    matrixReset();
  }

  function matrixReset() {
    if (!matrixCanvas) return;
    const fontSize = 14;
    const colSpacing = Math.max(6, 20 - matrixDensityFactor * 3); // More density = tighter spacing
    const colWidth = fontSize + colSpacing;
    const numCols = Math.ceil(matrixCanvas.width / colWidth);

    matrixColumns = [];
    for (let i = 0; i < numCols; i++) {
      matrixColumns.push({
        x: i * colWidth + colWidth / 2,
        y: Math.random() * -matrixCanvas.height * 2, // stagger start
        speed: 0.5 + Math.random() * 2,
        fontSize: fontSize + Math.floor(Math.random() * 4) - 2,
        chars: [],
        length: 8 + Math.floor(Math.random() * 25),
        opacity: 0.5 + Math.random() * 0.5,
      });
    }
  }

  function matrixDraw() {
    if (!matrixRunning) return;
    const palette = PALETTES[currentPalette];
    const w = matrixCanvas.width, h = matrixCanvas.height;

    // Fade effect
    matrixCtx.fillStyle = palette.bg;
    matrixCtx.fillRect(0, 0, w, h);

    const speedMult = 0.3 + matrixSpeedFactor * 0.5;

    for (let col of matrixColumns) {
      const charSet = palette.chars;
      const char = charSet[Math.floor(Math.random() * charSet.length)];
      const x = col.x;
      const y = col.y;

      matrixCtx.font = `${col.fontSize}px "JetBrains Mono", "MS Gothic", monospace`;

      // Draw the head (brightest)
      matrixCtx.fillStyle = palette.headColor;
      matrixCtx.globalAlpha = col.opacity;
      matrixCtx.fillText(char, x, y);

      // Draw the trail
      for (let t = 1; t < col.length; t++) {
        const trailY = y - t * (col.fontSize + 2);
        if (trailY < -col.fontSize) continue;

        const trailChar = charSet[Math.floor(Math.random() * charSet.length)];
        const fadeProgress = t / col.length;

        if (palette.isRainbow) {
          const colorIndex = (t + Math.floor(Date.now() / 200)) % palette.colors.length;
          matrixCtx.fillStyle = palette.colors[colorIndex];
        } else {
          const colorIndex = Math.min(Math.floor(fadeProgress * (palette.colors.length - 1)), palette.colors.length - 1);
          matrixCtx.fillStyle = palette.colors[colorIndex];
        }

        matrixCtx.globalAlpha = col.opacity * (1 - fadeProgress * 0.8);
        matrixCtx.fillText(trailChar, x, trailY);
      }

      // Move column down
      col.y += col.speed * speedMult * (col.fontSize + 2);

      // Reset when trail fully exits screen
      if (col.y - col.length * (col.fontSize + 2) > h) {
        col.y = Math.random() * -200 - 50;
        col.speed = 0.5 + Math.random() * 2;
        col.length = 8 + Math.floor(Math.random() * 25);
        col.opacity = 0.5 + Math.random() * 0.5;
      }
    }

    matrixCtx.globalAlpha = 1;
    matrixAnimId = requestAnimationFrame(matrixDraw);
  }

  function matrixStart() {
    if (matrixRunning) return;
    matrixRunning = true;
    matrixResize();
    // Clear canvas to black first
    matrixCtx.fillStyle = '#000';
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    matrixDraw();
  }

  function matrixStop() {
    matrixRunning = false;
    if (matrixAnimId) { cancelAnimationFrame(matrixAnimId); matrixAnimId = null; }
  }


  // ============================================================
  //  BOOT
  // ============================================================

  function init() {
    initTimer();
    matrixInit();
    initViewSwitcher();

    // Keyboard: press M to toggle to matrix, T for timer
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && activeView !== 'matrix') { switchView('matrix'); }
      if (e.code === 'KeyT' && activeView !== 'timer') { switchView('timer'); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
