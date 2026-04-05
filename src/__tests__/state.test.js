import { beforeEach, describe, expect, it, vi } from 'vitest';

function setupLocalStorage() {
  globalThis.localStorage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  };
}

describe('state migration and hydration', () => {
  beforeEach(() => {
    vi.resetModules();
    delete globalThis.acquireVsCodeApi;
    setupLocalStorage();
  });

  it('returns default state when storage is empty', async () => {
    const { getBootState } = await import('../../state.js');
    const state = getBootState();
    expect(state.version).toBe(1);
    expect(state.ui.activePanel).toBe('tasks');
    expect(state.tasks.tasks).toEqual([]);
  });

  it('migrates legacy state into version 1 shape', async () => {
    const { migrateStoredState } = await import('../../state.js');
    const raw = {
      ui: { activePanel: 'timer', menuCollapsed: true, densityMode: 'compact', reducedMotion: true },
      timer: {
        mode: 'short-break',
        remainingSeconds: 300,
        running: false,
        completedSessions: 1,
        updatedAt: Date.now(),
        config: { focusDuration: 25, shortBreakDuration: 5, longBreakDuration: 15, sessionsBeforeLong: 4, soundEnabled: false },
      },
      tasks: { selectedAgent: 'copilot', selectedStatus: 'done', tasks: [{ id: '1', text: 'Legacy task', agent: 'copilot', status: 'done' }] },
      matrix: { enabled: true, palette: 'cyan', speed: 2, density: 2, paletteOpen: true },
    };
    const state = migrateStoredState(raw);
    expect(state.version).toBe(1);
    expect(state.ui.activePanel).toBe('timer');
    expect(state.matrix.enabled).toBe(true);
    expect(state.tasks.tasks[0].text).toBe('Legacy task');
  });

  it('loads boot state from VS Code state when available', async () => {
    globalThis.acquireVsCodeApi = () => ({
      getState: () => ({
        version: 1,
        ui: { activePanel: 'tasks', menuCollapsed: false, densityMode: 'default', reducedMotion: false },
        timer: { mode: 'focus', remainingSeconds: 1500, running: false, completedSessions: 0, updatedAt: Date.now(), config: { focusDuration: 25, shortBreakDuration: 5, longBreakDuration: 15, sessionsBeforeLong: 4, soundEnabled: true } },
        tasks: { selectedAgent: 'codex', selectedStatus: 'waiting', tasks: [] },
        matrix: { enabled: false, palette: 'classic', speed: 3, density: 3, paletteOpen: false },
      }),
    });

    const { getBootState } = await import('../../state.js');
    const state = getBootState();
    expect(state.ui.activePanel).toBe('tasks');
    expect(state.timer.mode).toBe('focus');
  });
});
