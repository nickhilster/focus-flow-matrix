/* ============================================
   FOCUS FLOW — Pomodoro Timer
   Application Logic
   ============================================ */

(() => {
  "use strict";

  // --- Configuration ---
  const CONFIG = {
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLong: 4,
    soundEnabled: true,
  };

  const CIRCUMFERENCE = 2 * Math.PI * 115; // matches SVG circle r="115"

  const QUOTES = [
    {
      text: '"The secret of getting ahead is getting started."',
      author: "— Mark Twain",
    },
    {
      text: '"Focus on being productive instead of busy."',
      author: "— Tim Ferriss",
    },
    {
      text: "\"It's not that I'm so smart, it's just that I stay with problems longer.\"",
      author: "— Albert Einstein",
    },
    {
      text: '"Do the hard jobs first. The easy jobs will take care of themselves."',
      author: "— Dale Carnegie",
    },
    {
      text: '"The way to get started is to quit talking and begin doing."',
      author: "— Walt Disney",
    },
    {
      text: '"You don\'t have to be great to start, but you have to start to be great."',
      author: "— Zig Ziglar",
    },
    {
      text: '"Starve your distractions. Feed your focus."',
      author: "— Daniel Goleman",
    },
    {
      text: '"Concentrate all your thoughts upon the work at hand."',
      author: "— Alexander Graham Bell",
    },
    {
      text: '"Work hard in silence, let your success be your noise."',
      author: "— Frank Ocean",
    },
    {
      text: '"Small daily improvements are the key to staggering long-term results."',
      author: "— Robin Sharma",
    },
    {
      text: '"Deep work is the ability to focus without distraction on a cognitively demanding task."',
      author: "— Cal Newport",
    },
    {
      text: '"The only way to do great work is to love what you do."',
      author: "— Steve Jobs",
    },
  ];

  const LABELS = {
    focus: "FOCUS TIME",
    "short-break": "SHORT BREAK",
    "long-break": "LONG BREAK",
  };

  // --- State ---
  let state = {
    mode: "focus", // 'focus' | 'short-break' | 'long-break'
    running: false,
    totalSeconds: CONFIG.focusDuration * 60,
    remainingSeconds: CONFIG.focusDuration * 60,
    completedSessions: 0,
    intervalId: null,
  };

  // --- DOM References ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    timerTime: $("#timerTime"),
    timerLabel: $("#timerLabel"),
    timerProgress: $("#timerProgress"),
    timerContainer: $("#timerContainer"),
    btnStartPause: $("#btnStartPause"),
    btnReset: $("#btnReset"),
    btnSkip: $("#btnSkip"),
    iconPlay: $("#iconPlay"),
    iconPause: $("#iconPause"),
    modeSelector: $("#modeSelector"),
    modeIndicator: $("#modeIndicator"),
    sessionCounter: $("#sessionCounter"),
    quote: $("#quote"),
    quoteAuthor: $("#quoteAuthor"),
    btnSettings: $("#btnSettings"),
    settingsPanel: $("#settingsPanel"),
    settingsBackdrop: $("#settingsBackdrop"),
    btnCloseSettings: $("#btnCloseSettings"),
    soundToggle: $("#soundToggle"),
    tickMarks: $("#tickMarks"),
    particleRing: $("#particleRing"),
  };

  // --- Audio Context ---
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playTone(frequency, duration, type = "sine") {
    if (!CONFIG.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // silently fail if audio not available
    }
  }

  function playCompletionSound() {
    playTone(523.25, 0.15); // C5
    setTimeout(() => playTone(659.25, 0.15), 150); // E5
    setTimeout(() => playTone(783.99, 0.3), 300); // G5
  }

  function playClickSound() {
    playTone(800, 0.05, "square");
  }

  // --- Tick Marks ---
  function createTickMarks() {
    els.tickMarks.innerHTML = "";
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * 360;
      const rad = (angle * Math.PI) / 180;
      const isMajor = i % 5 === 0;
      const innerR = isMajor ? 106 : 109;
      const outerR = 113;
      const x1 = 130 + innerR * Math.cos(rad);
      const y1 = 130 + innerR * Math.sin(rad);
      const x2 = 130 + outerR * Math.cos(rad);
      const y2 = 130 + outerR * Math.sin(rad);
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      if (isMajor) line.classList.add("major");
      els.tickMarks.appendChild(line);
    }
  }

  // --- Particles ---
  function spawnParticle() {
    if (!state.running) return;
    const particle = document.createElement("div");
    particle.className = "particle";
    const angle = Math.random() * Math.PI * 2;
    const radius = 135;
    const x = radius + radius * Math.cos(angle);
    const y = radius + radius * Math.sin(angle);
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.background = `var(--primary)`;
    els.particleRing.appendChild(particle);
    requestAnimationFrame(() => particle.classList.add("visible"));
    setTimeout(() => particle.remove(), 2000);
  }

  let particleInterval = null;

  function startParticles() {
    stopParticles();
    particleInterval = setInterval(spawnParticle, 600);
  }

  function stopParticles() {
    if (particleInterval) {
      clearInterval(particleInterval);
      particleInterval = null;
    }
  }

  // --- Timer Logic ---
  function getDuration(mode) {
    switch (mode) {
      case "focus":
        return CONFIG.focusDuration * 60;
      case "short-break":
        return CONFIG.shortBreakDuration * 60;
      case "long-break":
        return CONFIG.longBreakDuration * 60;
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateDisplay() {
    els.timerTime.textContent = formatTime(state.remainingSeconds);

    // Progress ring
    const progress = 1 - state.remainingSeconds / state.totalSeconds;
    const offset = CIRCUMFERENCE * (1 - progress);
    els.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    els.timerProgress.style.strokeDashoffset = offset;

    // Update document title
    document.title = `${formatTime(state.remainingSeconds)} — ${LABELS[state.mode]} | Focus Flow`;
  }

  function tick() {
    if (state.remainingSeconds <= 0) {
      completeSession();
      return;
    }
    state.remainingSeconds--;
    updateDisplay();

    // Subtle tick animation every second
    els.timerTime.classList.add("tick");
    setTimeout(() => els.timerTime.classList.remove("tick"), 200);
  }

  function startTimer() {
    if (state.running) return;
    state.running = true;
    state.intervalId = setInterval(tick, 1000);
    els.iconPlay.classList.add("hidden");
    els.iconPause.classList.remove("hidden");
    document.body.classList.add("is-running");
    startParticles();
    updateSessionDots();
  }

  function pauseTimer() {
    if (!state.running) return;
    state.running = false;
    clearInterval(state.intervalId);
    state.intervalId = null;
    els.iconPlay.classList.remove("hidden");
    els.iconPause.classList.add("hidden");
    document.body.classList.remove("is-running");
    stopParticles();
    updateSessionDots();
  }

  function resetTimer() {
    pauseTimer();
    state.totalSeconds = getDuration(state.mode);
    state.remainingSeconds = state.totalSeconds;
    updateDisplay();
  }

  function completeSession() {
    pauseTimer();
    playCompletionSound();

    // Flash animation
    els.timerContainer.classList.add("completed");
    setTimeout(() => els.timerContainer.classList.remove("completed"), 600);

    if (state.mode === "focus") {
      state.completedSessions++;
      updateSessionDots();

      // Auto-switch to break
      if (state.completedSessions % CONFIG.sessionsBeforeLong === 0) {
        switchMode("long-break");
      } else {
        switchMode("short-break");
      }
    } else {
      // Break completed, switch back to focus
      switchMode("focus");
    }

    showNewQuote();
  }

  function skipSession() {
    pauseTimer();
    if (state.mode === "focus") {
      switchMode("short-break");
    } else {
      switchMode("focus");
    }
    showNewQuote();
  }

  // --- Mode Switching ---
  function switchMode(mode) {
    pauseTimer();
    state.mode = mode;
    state.totalSeconds = getDuration(mode);
    state.remainingSeconds = state.totalSeconds;

    // Update active button
    $$(".mode-btn").forEach((btn) => btn.classList.remove("active"));
    const activeBtn = $(`[data-mode="${mode}"]`);
    if (activeBtn) activeBtn.classList.add("active");

    // Update theme
    document.body.className = `theme-${mode}`;

    // Label
    els.timerLabel.textContent = LABELS[mode];

    // Update indicator position
    updateModeIndicator();
    updateDisplay();
    updateSessionDots();
  }

  function updateModeIndicator() {
    const activeBtn = $(".mode-btn.active");
    if (!activeBtn) return;
    const container = els.modeSelector;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    els.modeIndicator.style.width = `${btnRect.width}px`;
    els.modeIndicator.style.left = `${btnRect.left - containerRect.left}px`;
  }

  // --- Session Dots ---
  function updateSessionDots() {
    const dotsContainer = els.sessionCounter;
    dotsContainer.innerHTML = "";
    for (let i = 0; i < CONFIG.sessionsBeforeLong; i++) {
      const dot = document.createElement("span");
      dot.className = "session-dot";
      if (i < state.completedSessions % CONFIG.sessionsBeforeLong) {
        dot.classList.add("completed");
      } else if (
        i === state.completedSessions % CONFIG.sessionsBeforeLong &&
        state.mode === "focus"
      ) {
        dot.classList.add("active");
      }
      dotsContainer.appendChild(dot);
    }
    // If all sessions in the set completed, show all as completed
    if (
      state.completedSessions > 0 &&
      state.completedSessions % CONFIG.sessionsBeforeLong === 0 &&
      state.mode === "long-break"
    ) {
      dotsContainer.querySelectorAll(".session-dot").forEach((d) => {
        d.classList.add("completed");
        d.classList.remove("active");
      });
    }
  }

  // --- Quotes ---
  function showNewQuote() {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    els.quote.style.opacity = "0";
    els.quoteAuthor.style.opacity = "0";
    setTimeout(() => {
      els.quote.textContent = q.text;
      els.quoteAuthor.textContent = q.author;
      els.quote.style.opacity = "1";
      els.quoteAuthor.style.opacity = "1";
    }, 300);
  }

  // --- Settings ---
  function openSettings() {
    els.settingsPanel.classList.remove("hidden");
    // Sync display
    $("#focusDuration").textContent = CONFIG.focusDuration;
    $("#shortBreakDuration").textContent = CONFIG.shortBreakDuration;
    $("#longBreakDuration").textContent = CONFIG.longBreakDuration;
    $("#sessionsBeforeLong").textContent = CONFIG.sessionsBeforeLong;
    els.soundToggle.classList.toggle("active", CONFIG.soundEnabled);
    els.soundToggle.textContent = CONFIG.soundEnabled ? "On" : "Off";
  }

  function closeSettings() {
    els.settingsPanel.classList.add("hidden");
    // Apply updated config
    resetTimer();
    updateSessionDots();
  }

  function handleStepper(target, action) {
    const limits = {
      focusDuration: { min: 1, max: 90 },
      shortBreakDuration: { min: 1, max: 30 },
      longBreakDuration: { min: 1, max: 60 },
      sessionsBeforeLong: { min: 1, max: 10 },
    };
    const limit = limits[target];
    if (!limit) return;

    let value = CONFIG[target];
    if (action === "inc" && value < limit.max) value++;
    if (action === "dec" && value > limit.min) value--;
    CONFIG[target] = value;
    $(`#${target}`).textContent = value;
    playClickSound();
  }

  // --- Event Listeners ---
  function bindEvents() {
    // Start / Pause
    els.btnStartPause.addEventListener("click", () => {
      if (state.running) {
        pauseTimer();
      } else {
        startTimer();
      }
      playClickSound();
    });

    // Reset
    els.btnReset.addEventListener("click", () => {
      resetTimer();
      playClickSound();
    });

    // Skip
    els.btnSkip.addEventListener("click", () => {
      skipSession();
      playClickSound();
    });

    // Mode buttons
    $$(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchMode(btn.dataset.mode);
        playClickSound();
      });
    });

    // Settings
    els.btnSettings.addEventListener("click", () => {
      openSettings();
      playClickSound();
    });
    els.btnCloseSettings.addEventListener("click", closeSettings);
    els.settingsBackdrop.addEventListener("click", closeSettings);

    // Steppers
    $$(".stepper-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleStepper(btn.dataset.target, btn.dataset.action);
      });
    });

    // Sound toggle
    els.soundToggle.addEventListener("click", () => {
      CONFIG.soundEnabled = !CONFIG.soundEnabled;
      els.soundToggle.classList.toggle("active", CONFIG.soundEnabled);
      els.soundToggle.textContent = CONFIG.soundEnabled ? "On" : "Off";
      playClickSound();
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (els.settingsPanel && !els.settingsPanel.classList.contains("hidden"))
        return;
      if (e.code === "Space") {
        e.preventDefault();
        if (state.running) pauseTimer();
        else startTimer();
        playClickSound();
      }
      if (e.code === "KeyR") {
        resetTimer();
        playClickSound();
      }
      if (e.code === "KeyS") {
        skipSession();
        playClickSound();
      }
    });

    // Recalc mode indicator on resize
    window.addEventListener("resize", updateModeIndicator);
  }

  // --- Init ---
  function init() {
    document.body.classList.add("theme-focus");
    createTickMarks();
    updateDisplay();
    updateSessionDots();
    updateModeIndicator();
    showNewQuote();
    bindEvents();

    // Small delay to allow CSS to render before positioning indicator
    requestAnimationFrame(() => {
      requestAnimationFrame(updateModeIndicator);
    });
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
