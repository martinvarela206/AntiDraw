import * as vscode from 'vscode';

export class AntiDrawEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'antidraw.svgEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new AntiDrawEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      AntiDrawEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
    return providerRegistration;
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    let pendingWebviewEdits = 0;

    // Send initial content when webview notifies it is ready or on load
    const updateWebview = () => {
      if (pendingWebviewEdits === 0) {
        webviewPanel.webview.postMessage({
          type: 'loadSvg',
          text: document.getText(),
        });
      }
    };

    // Receive messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          updateWebview();
          break;

        case 'updateDocument': {
          if (message.text !== undefined && message.text !== document.getText()) {
            pendingWebviewEdits++;
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            );
            edit.replace(document.uri, fullRange, message.text);
            await vscode.workspace.applyEdit(edit);
            // Decrement AFTER a microtask tick so onDidChangeTextDocument fires first
            setTimeout(() => { pendingWebviewEdits = Math.max(0, pendingWebviewEdits - 1); }, 0);
          }
          break;
        }

        case 'showInfo':
          vscode.window.showInformationMessage(message.message);
          break;

        case 'showError':
          vscode.window.showErrorMessage(message.message);
          break;
      }
    });

    // Listen to document changes from external edits only
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          if (pendingWebviewEdits === 0) {
            updateWebview();
          }
        }
      }
    );

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    // Initial load push
    updateWebview();
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} https://fonts.gstatic.com;">
  <title>AntiDraw SVG Vector Editor</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
