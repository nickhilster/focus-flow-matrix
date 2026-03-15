const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const openTimerCommand = vscode.commands.registerCommand(
    "focusFlow.openTimer",
    () => {
      FocusFlowPanel.createOrShow(context.extensionUri);
    },
  );

  context.subscriptions.push(openTimerCommand);
}

function deactivate() {}

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
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Set panel icon
    this._panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, "media", "icon-light.svg"),
      dark: vscode.Uri.joinPath(extensionUri, "media", "icon-dark.svg"),
    };

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null);
  }

  dispose() {
    FocusFlowPanel.currentPanel = undefined;
    this._panel.dispose();
  }

  _getHtmlForWebview(webview) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "style.css"),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "app.js"),
    );
    const htmlPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "index.html",
    ).fsPath;
    let htmlContent = fs.readFileSync(htmlPath, "utf8");

    const nonce = getNonce();

    // Inject CSP meta tag right after title, or head opening
    const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">`;
    htmlContent = htmlContent.replace("<head>", `<head>\n  ${cspTag}`);

    // Update stylesheet and script locations to webview URIs
    htmlContent = htmlContent.replace('href="style.css"', `href="${styleUri}"`);
    htmlContent = htmlContent.replace(
      '<script src="app.js"></script>',
      `<script nonce="${nonce}" src="${scriptUri}"></script>`,
    );

    return htmlContent;
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

