import { APP_STATE_VERSION, createStatePersister, getBootState } from './state.js';
import { initViewSwitcher, setActivePanel, setDensityMode, setReducedMotion, getUiSnapshot } from './ui.js';
import { initTimer, getTimerSnapshot } from './timer.js';
import { initTasks, addTaskFromQuickCapture, getTaskSnapshot } from './tasks.js';
import { initMatrix, setMatrixEnabled, getMatrixSnapshot } from './matrix.js';
import { initMessageBridge } from './messages.js';

const bootState = getBootState();
const persister = createStatePersister(buildAppStateSnapshot);

function buildAppStateSnapshot() {
  return {
    version: APP_STATE_VERSION,
    ui: getUiSnapshot(),
    timer: getTimerSnapshot(),
    tasks: getTaskSnapshot(),
    matrix: getMatrixSnapshot(),
  };
}

function saveAppState() {
  persister.queuePersistAppState();
}

function init() {
  initTimer(bootState.timer, {
    saveState: saveAppState,
    onPanelChange: (panel) => setActivePanel(panel),
    onReducedMotionChange: (value) => setReducedMotion(value),
  });

  initTasks(bootState.tasks, {
    saveState: saveAppState,
  });

  initMatrix(bootState.matrix, bootState.ui?.reducedMotion === true, {
    saveState: saveAppState,
  });

  initViewSwitcher({
    onStateChange: saveAppState,
    setMatrixEnabled: () => setMatrixEnabled(!getMatrixSnapshot().enabled),
    defaultPanel: bootState.ui?.activePanel || 'tasks',
  });

  initMessageBridge({
    addTaskFromQuickCapture,
    activatePanel: setActivePanel,
  });

  const initialPanel = bootState.ui?.activePanel || 'tasks';
  setActivePanel(initialPanel, false);

  window.addEventListener('beforeunload', () => {
    persister.persistAppStateNow();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
