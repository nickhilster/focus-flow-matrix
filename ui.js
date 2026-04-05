import { queuePersistAppState } from './state.js';

const VALID_PANELS = new Set(['tasks', 'timer', 'settings']);
let activePanel = 'tasks';
let previousPanel = 'tasks';
let isTopMenuCollapsed = false;
let densityMode = 'default';
let reducedMotionEnabled = false;
let saveState = () => {};
let toggleMatrix = () => {};

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}

export function getUiSnapshot() {
  return {
    activePanel,
    menuCollapsed: isTopMenuCollapsed,
    densityMode,
    reducedMotion: reducedMotionEnabled,
  };
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

  if (persist) saveState();
}

export function setActivePanel(panel, persist = true) {
  if (!VALID_PANELS.has(panel)) panel = 'tasks';
  if (panel === activePanel) return;

  previousPanel = activePanel;
  activePanel = panel;

  const timerPanel = $('#viewTimer');
  const tasksPanel = $('#viewTasks');
  const settingsEl = $('#settingsPanel');

  if (timerPanel) {
    timerPanel.classList.toggle('hidden', panel === 'tasks');
    timerPanel.classList.toggle('open', panel === 'timer' || panel === 'settings');
  }
  if (tasksPanel) {
    tasksPanel.classList.toggle('active', panel === 'tasks');
  }
  if (settingsEl) {
    settingsEl.classList.toggle('hidden', panel !== 'settings');
  }

  document.body.classList.toggle('panel-tasks', panel === 'tasks');
  document.body.classList.toggle('panel-timer', panel === 'timer');
  document.body.classList.toggle('panel-settings', panel === 'settings');

  $$('.view-tab').forEach((tab) => {
    const view = tab.dataset.view;
    tab.classList.toggle('active', view === panel || (view === 'timer' && panel === 'settings'));
  });

  updateViewIndicator();
  const timerToggleBtn = $('#btnToggleTimerTool');
  if (timerToggleBtn) {
    const timerActive = panel === 'timer' || panel === 'settings';
    timerToggleBtn.classList.toggle('active', timerActive);
    timerToggleBtn.setAttribute('aria-pressed', String(timerActive));
  }

  if (panel !== 'timer') {
    const titles = { tasks: 'FlowBoard | Tasks', settings: 'FlowBoard | Settings' };
    document.title = titles[panel] || 'FlowBoard';
  }

  if (persist) saveState();
}

export function setDensityMode(mode, persist = true) {
  const resolvedMode = mode === 'compact' ? 'compact' : 'default';
  densityMode = resolvedMode;
  const compact = resolvedMode === 'compact';
  document.body.classList.toggle('density-compact', compact);
  const toggle = $('#btnDensityMode');
  if (toggle) {
    toggle.classList.toggle('active', compact);
    toggle.textContent = compact ? 'Default' : 'Compact';
    toggle.title = compact ? 'Switch to Default mode' : 'Switch to Compact mode';
    toggle.setAttribute('aria-pressed', String(compact));
  }
  if (persist) saveState();
}

export function setReducedMotion(enabled, persist = true) {
  reducedMotionEnabled = !!enabled;
  document.body.classList.toggle('reduced-motion', reducedMotionEnabled);
  const toggle = $('#reducedMotionToggle');
  if (toggle) {
    toggle.classList.toggle('active', reducedMotionEnabled);
    toggle.textContent = reducedMotionEnabled ? 'On' : 'Off';
  }
  if (persist) saveState();
}

export function initViewSwitcher({ onStateChange, setMatrixEnabled, defaultPanel = 'tasks' }) {
  saveState = onStateChange;
  toggleMatrix = setMatrixEnabled;

  $$('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      if (view === 'matrix') {
        toggleMatrix();
      } else {
        setActivePanel(view);
      }
    });
  });

  const topMenuToggle = $('#btnToggleTopMenu');
  if (topMenuToggle) {
    topMenuToggle.onclick = () => {
      setTopMenuCollapsed(!isTopMenuCollapsed);
      if (!isTopMenuCollapsed) updateViewIndicator();
    };
  }

  const densityToggle = $('#btnDensityMode');
  if (densityToggle) {
    densityToggle.onclick = () => {
      setDensityMode(densityMode === 'compact' ? 'default' : 'compact');
    };
  }

  const matrixFxToggle = $('#btnToggleMatrixFx');
  if (matrixFxToggle) {
    matrixFxToggle.addEventListener('click', () => {
      toggleMatrix();
    });
  }

  const timerToolToggle = $('#btnToggleTimerTool');
  if (timerToolToggle) {
    timerToolToggle.addEventListener('click', () => {
      setActivePanel(activePanel === 'timer' ? 'tasks' : 'timer');
    });
  }

  try {
    setDensityMode(localStorage.getItem('focus-flow-density-mode') || 'default', false);
  } catch (e) {
    setDensityMode('default', false);
  }

  setReducedMotion(reducedMotionEnabled, false);
  window.addEventListener('resize', updateViewIndicator);
  setTopMenuCollapsed(false, false);
  updateViewIndicator();
  activePanel = '';
  setActivePanel(defaultPanel, false);
}
