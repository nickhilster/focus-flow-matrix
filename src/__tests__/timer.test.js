import { describe, expect, it } from 'vitest';
import { formatTime, getDuration, resolveNextTimerMode, switchTimerMode } from '../../timer.js';

describe('timer helpers', () => {
  it('formats seconds to mm:ss', () => {
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(9)).toBe('00:09');
  });

  it('returns duration based on mode and configuration', () => {
    expect(getDuration('focus', { focusDuration: 30 })).toBe(1800);
    expect(getDuration('short-break', { shortBreakDuration: 7 })).toBe(420);
    expect(getDuration('long-break', { longBreakDuration: 20 })).toBe(1200);
  });

  it('cycles focus mode to short break until long break threshold', () => {
    expect(resolveNextTimerMode('focus', 1, 4)).toBe('short-break');
    expect(resolveNextTimerMode('focus', 4, 4)).toBe('long-break');
  });

  it('returns focus after a break', () => {
    expect(resolveNextTimerMode('short-break', 2, 4)).toBe('focus');
    expect(resolveNextTimerMode('long-break', 4, 4)).toBe('focus');
  });

  it('preserves existing body classes when switching timer mode', () => {
    const originalDocument = global.document;
    const classNames = new Set(['panel-timer', 'matrix-enabled', 'density-compact']);
    global.document = {
      body: {
        className: 'panel-timer matrix-enabled density-compact',
        classList: {
          add: (name) => classNames.add(name),
          remove: (...names) => names.forEach((name) => classNames.delete(name)),
          contains: (name) => classNames.has(name),
        },
      },
    };

    try {
      switchTimerMode('short-break');
      expect(classNames.has('panel-timer')).toBe(true);
      expect(classNames.has('matrix-enabled')).toBe(true);
      expect(classNames.has('density-compact')).toBe(true);
      expect(classNames.has('theme-short-break')).toBe(true);
    } finally {
      global.document = originalDocument;
    }
  });
});
