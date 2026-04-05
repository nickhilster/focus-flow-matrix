import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerCommand = vi.fn();
const showInformationMessage = vi.fn();
const createWebviewPanel = vi.fn(() => ({
  webview: {
    asWebviewUri: vi.fn((uri) => uri.path || 'uri'),
    postMessage: vi.fn(),
  },
  onDidDispose: vi.fn(),
  reveal: vi.fn(),
  dispose: vi.fn(),
}));

const mockedVscode = {
  commands: { registerCommand },
  window: {
    createWebviewPanel,
    activeTextEditor: null,
    showInformationMessage,
  },
  Uri: {
    joinPath: vi.fn((...segments) => ({ path: segments.join('/') })),
  },
  ViewColumn: { One: 1 },
};

globalThis.__MOCK_VSCODE__ = mockedVscode;
vi.mock('fs', () => ({ readFileSync: vi.fn(() => '<!doctype html><html><body></body></html>') }));

let activate;

beforeEach(async () => {
  registerCommand.mockClear();
  createWebviewPanel.mockClear();
  showInformationMessage.mockClear();
  const module = await import('../extension.js');
  activate = module.activate;
});

describe('extension activation', () => {
  it('registers the FlowBoard commands', () => {
    const context = { subscriptions: [] };
    activate(context);

    expect(registerCommand).toHaveBeenCalledWith('focusFlow.openTimer', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('focusFlow.quickAddTaskFromSelection', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('focusFlow.quickAddTaskFromActiveFile', expect.any(Function));
    expect(context.subscriptions.length).toBe(3);
  });
});
