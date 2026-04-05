const vscode = (() => {
  try {
    return require("vscode");
  } catch (e) {
    return globalThis.__MOCK_VSCODE__ || {};
  }
})();
const path = require("path");
const fs = require("fs");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // Register the sidebar/panel WebviewView provider
  const viewProvider = new FocusFlowViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      FocusFlowViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  const openTimerCommand = vscode.commands.registerCommand(
    "focusFlow.openTimer",
    () => {
      // Reveal the sidebar view; fall back to a panel if unavailable
      vscode.commands.executeCommand('focusFlowView.focus').then(undefined, () => {
        FocusFlowPanel.createOrShow(context.extensionUri);
      });
    },
  );

  const quickAddSelection = vscode.commands.registerCommand(
    "focusFlow.quickAddTaskFromSelection",
    () => {
      const editor = vscode.window.activeTextEditor;
      const selected = editor?.document.getText(editor.selection).trim();
      if (!selected) {
        vscode.window.showInformationMessage(
          'Select text in the editor to capture a FlowBoard task.',
        );
        return;
      }
      const msg = { type: 'focusFlow/quickAddTask', payload: { text: selected } };
      viewProvider.postMessage(msg);
      FocusFlowPanel.currentPanel?.postMessage(msg);
    },
  );

  const quickAddActiveFile = vscode.commands.registerCommand(
    "focusFlow.quickAddTaskFromActiveFile",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          'Open a file to capture its context as a FlowBoard task.',
        );
        return;
      }
      const fileName = editor.document.fileName.split(/[/\\\\]/).pop() || 'Active File';
      const msg = { type: 'focusFlow/quickAddTask', payload: { text: `Review ${fileName}` } };
      viewProvider.postMessage(msg);
      FocusFlowPanel.currentPanel?.postMessage(msg);
    },
  );

  context.subscriptions.push(openTimerCommand, quickAddSelection, quickAddActiveFile);
}

function deactivate() {}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function _getHtmlForWebview(webview, extensionUri) {
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "style.css"),
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "app.js"),
  );
  const htmlPath = vscode.Uri.joinPath(extensionUri, "media", "index.html").fsPath;
  let htmlContent = fs.readFileSync(htmlPath, "utf8");

  const nonce = getNonce();
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">`;
  htmlContent = htmlContent.replace("<head>", `<head>\n  ${cspTag}`);
  htmlContent = htmlContent.replace('href="style.css"', `href="${styleUri}"`);
  htmlContent = htmlContent.replace(
    /<script\b[^>]*\bsrc="app\.js"[^>]*><\/script>/,
    `<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`,
  );
  return htmlContent;
}

function _handleWebviewMessage(message) {
  if (!message || typeof message.type !== 'string') return;
  // Future contract events handled here
}

// ─── Sidebar / panel WebviewView provider ────────────────────────────────────

class FocusFlowViewProvider {
  static viewType = "focusFlowView";

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = undefined;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "media")],
    };
    webviewView.webview.html = _getHtmlForWebview(webviewView.webview, this._extensionUri);
    webviewView.webview.onDidReceiveMessage((message) => _handleWebviewMessage(message));
  }

  postMessage(message) {
    this._view?.webview.postMessage(message);
  }
}

// ─── Editor-tab panel (legacy / command fallback) ────────────────────────────

class FocusFlowPanel {
  static currentPanel = undefined;
  static viewType = "focusFlowTimer";

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
      "FlowBoard",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      },
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
    this._panel.webview.html = _getHtmlForWebview(this._panel.webview, this._extensionUri);

    // Set panel icon
    this._panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, "media", "icon-light.svg"),
      dark: vscode.Uri.joinPath(extensionUri, "media", "icon-dark.svg"),
    };

    this._panel.webview.onDidReceiveMessage(
      (message) => _handleWebviewMessage(message),
      null,
    );

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null);
  }

  dispose() {
    FocusFlowPanel.currentPanel = undefined;
    this._panel.dispose();
  }

  postMessage(message) {
    this._panel.webview.postMessage(message);
  }

}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = { activate, deactivate };

