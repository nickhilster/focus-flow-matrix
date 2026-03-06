const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const openTimerCommand = vscode.commands.registerCommand('focusFlow.openTimer', () => {
    FocusFlowPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(openTimerCommand);
}

function deactivate() {}

class FocusFlowPanel {
  static currentPanel = undefined;
  static viewType = 'focusFlowTimer';

  /**
   * @param {vscode.Uri} extensionUri
   */
  static createOrShow(extensionUri) {
    const column = vscode.ViewColumn.One;

    // If we already have a panel, show it
    if (FocusFlowPanel.currentPanel) {
      FocusFlowPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      FocusFlowPanel.viewType,
      'Focus Flow',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,  // Keep timer running when panel is hidden
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );

    FocusFlowPanel.currentPanel = new FocusFlowPanel(panel, extensionUri);
  }

  /**
   * @param {vscode.WebviewPanel} panel
   * @param {vscode.Uri} extensionUri
   */
  constructor(panel, extensionUri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's HTML content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Set panel icon
    this._panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'media', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'media', 'icon-dark.svg'),
    };

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null);
  }

  dispose() {
    FocusFlowPanel.currentPanel = undefined;
    this._panel.dispose();
  }

  /**
   * @param {vscode.Webview} webview
   */
  _getHtmlForWebview(webview) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'app.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}';">
  <title>Focus Flow</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <!-- Ambient background -->
  <div class="ambient-bg">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <div class="app" id="app">
    <!-- Header -->
    <header class="header">
      <h1 class="logo">
        <span class="logo-icon">◉</span>
        Focus Flow
      </h1>
      <div class="session-counter" id="sessionCounter">
        <span class="session-dot completed"></span>
        <span class="session-dot"></span>
        <span class="session-dot"></span>
        <span class="session-dot"></span>
      </div>
    </header>

    <!-- Mode Selector -->
    <nav class="mode-selector" id="modeSelector">
      <button class="mode-btn active" data-mode="focus" id="btnFocus">Focus</button>
      <button class="mode-btn" data-mode="short-break" id="btnShortBreak">Short Break</button>
      <button class="mode-btn" data-mode="long-break" id="btnLongBreak">Long Break</button>
      <div class="mode-indicator" id="modeIndicator"></div>
    </nav>

    <!-- Timer Display -->
    <div class="timer-container" id="timerContainer">
      <svg class="timer-ring" viewBox="0 0 260 260" id="timerRing">
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" class="gradient-stop-1"/>
            <stop offset="100%" class="gradient-stop-2"/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle class="timer-track" cx="130" cy="130" r="115"/>
        <circle class="timer-progress" cx="130" cy="130" r="115" id="timerProgress"
                stroke="url(#progressGradient)" filter="url(#glow)"/>
        <g class="tick-marks" id="tickMarks"></g>
      </svg>

      <div class="timer-display">
        <div class="timer-time" id="timerTime">25:00</div>
        <div class="timer-label" id="timerLabel">FOCUS TIME</div>
      </div>

      <div class="particle-ring" id="particleRing"></div>
    </div>

    <!-- Controls -->
    <div class="controls">
      <button class="control-btn secondary" id="btnReset" title="Reset (R)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6"/>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
        </svg>
      </button>
      <button class="control-btn primary" id="btnStartPause">
        <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" id="iconPlay">
          <polygon points="6,3 20,12 6,21"/>
        </svg>
        <svg class="icon-pause hidden" viewBox="0 0 24 24" fill="currentColor" id="iconPause">
          <rect x="5" y="3" width="4" height="18"/>
          <rect x="15" y="3" width="4" height="18"/>
        </svg>
      </button>
      <button class="control-btn secondary" id="btnSkip" title="Skip (S)">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 15,12 5,21"/>
          <rect x="17" y="3" width="3" height="18"/>
        </svg>
      </button>
    </div>

    <!-- Quote -->
    <div class="quote-container" id="quoteContainer">
      <p class="quote" id="quote">"The secret of getting ahead is getting started."</p>
      <span class="quote-author" id="quoteAuthor">— Mark Twain</span>
    </div>

    <!-- Settings toggle -->
    <button class="settings-toggle" id="btnSettings" title="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
    </button>

    <!-- Settings Panel -->
    <div class="settings-panel hidden" id="settingsPanel">
      <div class="settings-backdrop" id="settingsBackdrop"></div>
      <div class="settings-content">
        <h2 class="settings-title">Settings</h2>
        <div class="setting-group">
          <label class="setting-label">Focus Duration</label>
          <div class="setting-control">
            <button class="stepper-btn" data-target="focusDuration" data-action="dec">−</button>
            <span class="setting-value" id="focusDuration">25</span>
            <span class="setting-unit">min</span>
            <button class="stepper-btn" data-target="focusDuration" data-action="inc">+</button>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">Short Break</label>
          <div class="setting-control">
            <button class="stepper-btn" data-target="shortBreakDuration" data-action="dec">−</button>
            <span class="setting-value" id="shortBreakDuration">5</span>
            <span class="setting-unit">min</span>
            <button class="stepper-btn" data-target="shortBreakDuration" data-action="inc">+</button>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">Long Break</label>
          <div class="setting-control">
            <button class="stepper-btn" data-target="longBreakDuration" data-action="dec">−</button>
            <span class="setting-value" id="longBreakDuration">15</span>
            <span class="setting-unit">min</span>
            <button class="stepper-btn" data-target="longBreakDuration" data-action="inc">+</button>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">Sessions before long break</label>
          <div class="setting-control">
            <button class="stepper-btn" data-target="sessionsBeforeLong" data-action="dec">−</button>
            <span class="setting-value" id="sessionsBeforeLong">4</span>
            <button class="stepper-btn" data-target="sessionsBeforeLong" data-action="inc">+</button>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">Sound</label>
          <div class="setting-control">
            <button class="toggle-btn active" id="soundToggle">On</button>
          </div>
        </div>
        <button class="settings-close" id="btnCloseSettings">Done</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = { activate, deactivate };
