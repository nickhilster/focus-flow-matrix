import { queuePersistAppState } from './state.js';

const TIMER_CONFIG = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLong: 4,
  soundEnabled: true,
};

const CIRCUMFERENCE = 2 * Math.PI * 115;
const LABELS = { focus: 'FOCUS TIME', 'short-break': 'SHORT BREAK', 'long-break': 'LONG BREAK' };

let timerState = {
  mode: 'focus',
  running: false,
  totalSeconds: TIMER_CONFIG.focusDuration * 60,
  remainingSeconds: TIMER_CONFIG.focusDuration * 60,
  completedSessions: 0,
  intervalId: null,
  updatedAt: Date.now(),
};

let saveState = () => {};
let onPanelChange = () => {};
let onReducedMotionChange = () => {};
let timerEls = {};

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}

export function getDuration(mode, config = TIMER_CONFIG) {
  switch (mode) {
    case 'focus':
      return config.focusDuration * 60;
    case 'short-break':
      return config.shortBreakDuration * 60;
    case 'long-break':
      return config.longBreakDuration * 60;
    default:
      return config.focusDuration * 60;
  }
}

export function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function resolveNextTimerMode(mode, completedSessions, sessionsBeforeLong = 4) {
  if (mode === 'focus') {
    return completedSessions % sessionsBeforeLong === 0 ? 'long-break' : 'short-break';
  }
  return 'focus';
}

export function getPersistableTimerRemainingSeconds() {
  if (!timerState.running) return timerState.remainingSeconds;
  const updatedAt = Number.isFinite(timerState.updatedAt) ? timerState.updatedAt : Date.now();
  const elapsed = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  return Math.max(0, timerState.remainingSeconds - elapsed);
}

function playTone(frequency, duration, type = 'sine') {
  if (!TIMER_CONFIG.soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    // audio unavailable
  }
}

function playCompletionSound() {
  playTone(523.25, 0.15);
  setTimeout(() => playTone(659.25, 0.15), 150);
  setTimeout(() => playTone(783.99, 0.3), 300);
}

function playClickSound() {
  playTone(800, 0.05, 'square');
}

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
  timerEls.timerStatusMessage = $('#timerStatusMessage');
}

function updateAccessibilityStatus(message) {
  if (timerEls.timerStatusMessage) {
    timerEls.timerStatusMessage.textContent = message;
  }
}

function updateDisplay() {
  if (!timerEls.timerTime || !timerEls.timerLabel || !timerEls.timerProgress) return;
  timerEls.timerTime.textContent = formatTime(timerState.remainingSeconds);
  const progress = 1 - timerState.remainingSeconds / timerState.totalSeconds;
  timerEls.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
  timerEls.timerProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  timerEls.timerLabel.textContent = LABELS[timerState.mode];
  updateAccessibilityStatus(`${LABELS[timerState.mode]} � ${timerState.running ? 'running' : 'paused'}, ${formatTime(timerState.remainingSeconds)} remaining.`);
}

function updateSessionDots() {
  if (!timerEls.sessionCounter) return;
  const c = timerEls.sessionCounter;
  c.innerHTML = '';
  for (let i = 0; i < TIMER_CONFIG.sessionsBeforeLong; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'session-dot';
    if (i < timerState.completedSessions % TIMER_CONFIG.sessionsBeforeLong) dot.classList.add('completed');
    else if (i === timerState.completedSessions % TIMER_CONFIG.sessionsBeforeLong && timerState.mode === 'focus') dot.classList.add('active');
    c.appendChild(dot);
  }
  if (timerState.completedSessions > 0 && timerState.completedSessions % TIMER_CONFIG.sessionsBeforeLong === 0 && timerState.mode === 'long-break') {
    c.querySelectorAll('.session-dot').forEach((d) => {
      d.classList.add('completed');
      d.classList.remove('active');
    });
  }
}

function createTickMarks() {
  if (!timerEls.tickMarks) return;
  timerEls.tickMarks.innerHTML = '';
  for (let i = 0; i < 60; i += 1) {
    const angle = (i / 60) * 360;
    const rad = (angle * Math.PI) / 180;
    const isMajor = i % 5 === 0;
    const innerR = isMajor ? 106 : 109;
    const outerR = 113;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(130 + innerR * Math.cos(rad)));
    line.setAttribute('y1', String(130 + innerR * Math.sin(rad)));
    line.setAttribute('x2', String(130 + outerR * Math.cos(rad)));
    line.setAttribute('y2', String(130 + outerR * Math.sin(rad)));
    if (isMajor) line.classList.add('major');
    timerEls.tickMarks.appendChild(line);
  }
}

function tick() {
  if (timerState.remainingSeconds <= 0) {
    completeSession();
    return;
  }
  timerState.remainingSeconds -= 1;
  timerState.updatedAt = Date.now();
  updateDisplay();
  timerEls.timerTime?.classList.add('tick');
  setTimeout(() => timerEls.timerTime?.classList.remove('tick'), 200);
  if (timerState.remainingSeconds % 5 === 0) saveState();
}

export function startTimer() {
  if (timerState.running) return;
  timerState.updatedAt = Date.now();
  timerState.running = true;
  timerState.intervalId = setInterval(tick, 1000);
  timerEls.iconPlay?.classList.add('hidden');
  timerEls.iconPause?.classList.remove('hidden');
  document.body.classList.add('is-running');
  saveState();
}

export function pauseTimer() {
  if (!timerState.running) return;
  timerState.remainingSeconds = getPersistableTimerRemainingSeconds();
  timerState.updatedAt = Date.now();
  timerState.running = false;
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;
  timerEls.iconPlay?.classList.remove('hidden');
  timerEls.iconPause?.classList.add('hidden');
  document.body.classList.remove('is-running');
  saveState();
}

export function resetTimer() {
  pauseTimer();
  timerState.totalSeconds = getDuration(timerState.mode);
  timerState.remainingSeconds = timerState.totalSeconds;
  timerState.updatedAt = Date.now();
  updateDisplay();
  saveState();
}

export function switchTimerMode(mode) {
  pauseTimer();
  timerState.mode = mode;
  timerState.totalSeconds = getDuration(mode);
  timerState.remainingSeconds = timerState.totalSeconds;
  timerState.updatedAt = Date.now();
  document.body.className = `theme-${mode}`;
  updateDisplay();
  updateSessionDots();
  saveState();
}

export function getTimerSnapshot() {
  return {
    mode: timerState.mode,
    remainingSeconds: getPersistableTimerRemainingSeconds(),
    running: timerState.running && timerState.remainingSeconds > 0,
    completedSessions: timerState.completedSessions,
    updatedAt: timerState.updatedAt,
    config: { ...TIMER_CONFIG },
  };
}

function updateModeIndicator() {
  const active = document.querySelector('.mode-btn.active');
  if (!active || !timerEls.modeSelector) return;
  const cRect = timerEls.modeSelector.getBoundingClientRect();
  const bRect = active.getBoundingClientRect();
  if (!timerEls.modeIndicator) return;
  timerEls.modeIndicator.style.width = `${bRect.width}px`;
  timerEls.modeIndicator.style.left = `${bRect.left - cRect.left}px`;
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
  let currentValue = TIMER_CONFIG[target];
  if (action === 'inc' && currentValue < limit.max) currentValue += 1;
  if (action === 'dec' && currentValue > limit.min) currentValue -= 1;
  TIMER_CONFIG[target] = currentValue;
  const element = document.getElementById(target);
  if (element) element.textContent = String(currentValue);
  saveState();
}

function completeSession() {
  pauseTimer();
  playCompletionSound();
  timerEls.timerContainer?.classList.add('completed');
  setTimeout(() => timerEls.timerContainer?.classList.remove('completed'), 600);
  if (timerState.mode === 'focus') {
    timerState.completedSessions += 1;
    const nextMode = resolveNextTimerMode(timerState.mode, timerState.completedSessions, TIMER_CONFIG.sessionsBeforeLong);
    switchTimerMode(nextMode);
  } else {
    switchTimerMode('focus');
  }
  saveState();
}

export function skipSession() {
  pauseTimer();
  const nextMode = timerState.mode === 'focus' ? 'short-break' : 'focus';
  switchTimerMode(nextMode);
  saveState();
}

export function updateMiniCounter() {
  const mini = $('#timerMiniCounter');
  if (!mini) return;
  const active = timerState.running && !document.body.classList.contains('panel-timer');
  mini.classList.toggle('visible', active);
  if (active) mini.textContent = formatTime(timerState.remainingSeconds);
}

function restoreTimerStateFromBoot(bootTimer) {
  if (!isObject(bootTimer)) return;
  const mode = ['focus', 'short-break', 'long-break'].includes(bootTimer.mode) ? bootTimer.mode : 'focus';
  timerState.mode = mode;
  timerState.totalSeconds = getDuration(mode);
  timerState.completedSessions = Number.isFinite(bootTimer.completedSessions) ? Math.max(0, Math.round(bootTimer.completedSessions)) : 0;
  const savedRemaining = Number.isFinite(bootTimer.remainingSeconds) ? Math.max(0, Math.round(bootTimer.remainingSeconds)) : timerState.totalSeconds;
  let resolvedRemaining = Math.min(savedRemaining, timerState.totalSeconds);
  if (bootTimer.running === true && Number.isFinite(bootTimer.updatedAt)) {
    const elapsed = Math.max(0, Math.floor((Date.now() - bootTimer.updatedAt) / 1000));
    resolvedRemaining = Math.max(0, resolvedRemaining - elapsed);
  }
  timerState.remainingSeconds = resolvedRemaining;
  timerState.running = false;
  timerState.intervalId = null;
  timerState.updatedAt = Date.now();
  const config = bootTimer.config || {};
  Object.assign(TIMER_CONFIG, {
    focusDuration: Number.isFinite(config.focusDuration) ? Math.max(1, Math.round(config.focusDuration)) : TIMER_CONFIG.focusDuration,
    shortBreakDuration: Number.isFinite(config.shortBreakDuration) ? Math.max(1, Math.round(config.shortBreakDuration)) : TIMER_CONFIG.shortBreakDuration,
    longBreakDuration: Number.isFinite(config.longBreakDuration) ? Math.max(1, Math.round(config.longBreakDuration)) : TIMER_CONFIG.longBreakDuration,
    sessionsBeforeLong: Number.isFinite(config.sessionsBeforeLong) ? Math.max(1, Math.round(config.sessionsBeforeLong)) : TIMER_CONFIG.sessionsBeforeLong,
    soundEnabled: typeof config.soundEnabled === 'boolean' ? config.soundEnabled : TIMER_CONFIG.soundEnabled,
  });
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function bindTimerEvents() {
  timerEls.btnStartPause?.addEventListener('click', () => {
    if (timerState.running) {
      pauseTimer();
    } else {
      startTimer();
    }
    playClickSound();
  });
  timerEls.btnReset?.addEventListener('click', () => {
    resetTimer();
    playClickSound();
  });
  timerEls.btnSkip?.addEventListener('click', () => {
    skipSession();
    playClickSound();
  });
  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTimerMode(btn.dataset.mode);
      playClickSound();
    });
  });
  timerEls.btnSettings?.addEventListener('click', () => {
    onPanelChange('settings');
    playClickSound();
  });
  document.querySelector('#btnSettingsLegacy')?.addEventListener('click', () => {
    onPanelChange('settings');
    playClickSound();
  });
  timerEls.btnCloseTimerTool?.addEventListener('click', () => {
    onPanelChange('tasks');
    playClickSound();
  });
  timerEls.btnCloseSettings?.addEventListener('click', () => onPanelChange('tasks'));
  timerEls.settingsBackdrop?.addEventListener('click', () => onPanelChange('tasks'));
  $$('.stepper-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleStepper(btn.dataset.target, btn.dataset.action);
      playClickSound();
    });
  });
  timerEls.soundToggle?.addEventListener('click', () => {
    TIMER_CONFIG.soundEnabled = !TIMER_CONFIG.soundEnabled;
    timerEls.soundToggle.classList.toggle('active', TIMER_CONFIG.soundEnabled);
    timerEls.soundToggle.textContent = TIMER_CONFIG.soundEnabled ? 'On' : 'Off';
    playClickSound();
    saveState();
  });
  timerEls.reducedMotionToggle?.addEventListener('click', () => {
    onReducedMotionChange(!document.body.classList.contains('reduced-motion'));
    playClickSound();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    if (e.code === 'Escape' && document.body.classList.contains('panel-settings')) {
      onPanelChange('tasks');
      playClickSound();
      return;
    }
    if (!document.body.classList.contains('panel-timer') && !document.body.classList.contains('panel-settings')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (timerState.running) pauseTimer(); else startTimer();
      playClickSound();
    }
    if (e.code === 'KeyR') {
      resetTimer();
      playClickSound();
    }
    if (e.code === 'KeyS') {
      skipSession();
      playClickSound();
    }
  });
}

export function initTimer(bootTimer, callbacks) {
  saveState = callbacks?.saveState || (() => {});
  onPanelChange = callbacks?.onPanelChange || (() => {});
  onReducedMotionChange = callbacks?.onReducedMotionChange || (() => {});
  cacheTimerEls();
  restoreTimerStateFromBoot(bootTimer);
  document.body.classList.add(`theme-${timerState.mode}`);
  $$('.mode-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === timerState.mode));
  if (timerEls.timerLabel) timerEls.timerLabel.textContent = LABELS[timerState.mode];
  createTickMarks();
  updateDisplay();
  updateSessionDots();
  updateModeIndicator();
  bindTimerEvents();
}
