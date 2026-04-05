const APP_STATE_VERSION = 1;
const APP_STORAGE_KEY = 'focus-flow-app-state-v1';

const vscodeStateApi = (() => {
  try {
    if (typeof acquireVsCodeApi === 'function') return acquireVsCodeApi();
  } catch (e) {
    // ignore unavailable API outside of VS Code webviews
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

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUiState(raw) {
  return {
    activePanel: typeof raw?.activePanel === 'string' ? raw.activePanel : 'tasks',
    menuCollapsed: raw?.menuCollapsed === true,
    densityMode: raw?.densityMode === 'compact' ? 'compact' : 'default',
    reducedMotion: raw?.reducedMotion === true,
  };
}

function normalizeTimerState(raw) {
  const config = typeof raw?.config === 'object' ? raw.config : {};
  return {
    mode: ['focus', 'short-break', 'long-break'].includes(raw?.mode) ? raw.mode : 'focus',
    remainingSeconds: Number.isFinite(raw?.remainingSeconds) ? Math.max(0, Math.round(raw.remainingSeconds)) : 1500,
    running: raw?.running === true,
    completedSessions: Number.isFinite(raw?.completedSessions) ? Math.max(0, Math.round(raw.completedSessions)) : 0,
    updatedAt: Number.isFinite(raw?.updatedAt) ? Math.round(raw.updatedAt) : Date.now(),
    config: {
      focusDuration: Number.isFinite(config?.focusDuration) ? Math.max(1, Math.round(config.focusDuration)) : 25,
      shortBreakDuration: Number.isFinite(config?.shortBreakDuration) ? Math.max(1, Math.round(config.shortBreakDuration)) : 5,
      longBreakDuration: Number.isFinite(config?.longBreakDuration) ? Math.max(1, Math.round(config.longBreakDuration)) : 15,
      sessionsBeforeLong: Number.isFinite(config?.sessionsBeforeLong) ? Math.max(1, Math.round(config.sessionsBeforeLong)) : 4,
      soundEnabled: typeof config?.soundEnabled === 'boolean' ? config.soundEnabled : true,
    },
  };
}

function normalizeTaskState(raw) {
  const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
  return {
    selectedAgent: typeof raw?.selectedAgent === 'string' ? raw.selectedAgent : 'codex',
    selectedStatus: typeof raw?.selectedStatus === 'string' ? raw.selectedStatus : 'waiting',
    tasks: Array.isArray(tasks) ? tasks.slice(0, 100) : [],
  };
}

function normalizeMatrixState(raw) {
  return {
    enabled: raw?.enabled === true,
    palette: typeof raw?.palette === 'string' ? raw.palette : 'classic',
    speed: Number.isFinite(raw?.speed) ? Math.max(1, Math.min(5, Math.round(raw.speed))) : 3,
    density: Number.isFinite(raw?.density) ? Math.max(1, Math.min(5, Math.round(raw.density))) : 3,
    paletteOpen: raw?.paletteOpen === true,
  };
}

function getDefaultState() {
  return {
    version: APP_STATE_VERSION,
    ui: {
      activePanel: 'tasks',
      menuCollapsed: false,
      densityMode: 'default',
      reducedMotion: false,
    },
    timer: {
      mode: 'focus',
      remainingSeconds: 25 * 60,
      running: false,
      completedSessions: 0,
      updatedAt: Date.now(),
      config: {
        focusDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLong: 4,
        soundEnabled: true,
      },
    },
    tasks: {
      selectedAgent: 'codex',
      selectedStatus: 'waiting',
      tasks: [],
    },
    matrix: {
      enabled: false,
      palette: 'classic',
      speed: 3,
      density: 3,
      paletteOpen: false,
    },
  };
}

function validateV1State(state) {
  if (!isObject(state)) return null;
  return {
    version: APP_STATE_VERSION,
    ui: normalizeUiState(state.ui),
    timer: normalizeTimerState(state.timer),
    tasks: normalizeTaskState(state.tasks),
    matrix: normalizeMatrixState(state.matrix),
  };
}

function migrateFromLegacyState(raw) {
  if (!isObject(raw)) return getDefaultState();
  return {
    version: APP_STATE_VERSION,
    ui: normalizeUiState(raw.ui || raw),
    timer: normalizeTimerState(raw.timer || raw),
    tasks: normalizeTaskState(raw.tasks || raw),
    matrix: normalizeMatrixState(raw.matrix || raw),
  };
}

function migrateStoredState(raw) {
  if (!isObject(raw)) return getDefaultState();
  if (raw.version === APP_STATE_VERSION) {
    return validateV1State(raw) || getDefaultState();
  }
  return migrateFromLegacyState(raw);
}

function readStateFromStorage() {
  let stored = null;
  if (vscodeStateApi) {
    try {
      stored = vscodeStateApi.getState();
    } catch (e) {
      stored = null;
    }
  }
  if (!stored && typeof localStorage !== 'undefined') {
    try {
      stored = parseJsonSafe(localStorage.getItem(APP_STORAGE_KEY));
    } catch (e) {
      stored = null;
    }
  }
  return stored;
}

function getBootState() {
  return migrateStoredState(readStateFromStorage());
}

function persistAppStateNow(snapshot) {
  if (!isObject(snapshot)) return;
  if (vscodeStateApi) {
    try {
      vscodeStateApi.setState(snapshot);
    } catch (e) {
      // ignore
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      // ignore
    }
  }
}

let persistStateTimer = null;

function queuePersistAppState(getSnapshot) {
  if (persistStateTimer) return;
  persistStateTimer = setTimeout(() => {
    persistStateTimer = null;
    const snapshot = getSnapshot();
    persistAppStateNow(snapshot);
  }, 120);
}

function createStatePersister(getSnapshot) {
  return {
    persistAppStateNow: () => persistAppStateNow(getSnapshot()),
    queuePersistAppState: () => queuePersistAppState(getSnapshot),
  };
}

export {
  APP_STATE_VERSION,
  getBootState,
  migrateStoredState,
  validateV1State,
  getDefaultState,
  createStatePersister,
  persistAppStateNow,
  queuePersistAppState,
  vscodeStateApi,
};
