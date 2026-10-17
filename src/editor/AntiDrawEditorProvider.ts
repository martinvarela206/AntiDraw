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

    // Helper to get sidecar JSON URI for an SVG document
    const getSidecarUri = (svgUri: vscode.Uri): vscode.Uri => {
      const jsonPath = svgUri.path.replace(/\.svg$/i, '.json');
      return svgUri.with({ path: jsonPath });
    };

    const readSidecarMetadata = async (): Promise<any> => {
      try {
        const sidecarUri = getSidecarUri(document.uri);
        const data = await vscode.workspace.fs.readFile(sidecarUri);
        const text = new TextDecoder('utf-8').decode(data);
        return JSON.parse(text);
      } catch (_e) {
        return null;
      }
    };

    const writeSidecarMetadata = async (metadata: any): Promise<void> => {
      try {
        const sidecarUri = getSidecarUri(document.uri);
        const jsonString = JSON.stringify(metadata, null, 2);
        const data = new TextEncoder().encode(jsonString);
        await vscode.workspace.fs.writeFile(sidecarUri, data);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to save metadata: ${err?.message || err}`);
      }
    };

    // Send initial content and metadata when webview notifies it is ready or on load
    const updateWebview = async () => {
      if (pendingWebviewEdits === 0) {
        const metadata = await readSidecarMetadata();
        webviewPanel.webview.postMessage({
          type: 'loadSvg',
          text: document.getText(),
          metadata: metadata || null,
          locale: vscode.env.language,
        });
      }
    };

    let lastSavedSvgText: string = document.getText();

    // Receive messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          await updateWebview();
          break;

        case 'updateDocument': {
          if (message.text !== undefined && message.text !== document.getText()) {
            if (
              typeof message.text !== 'string' ||
              message.text.trim().length < 20 ||
              !message.text.toLowerCase().includes('<svg') ||
              !message.text.toLowerCase().includes('</svg>')
            ) {
              vscode.window.showErrorMessage('[AntiDraw] SafeSave: Se rechazó la sobreescritura del archivo con un SVG inválido o truncado.');
              break;
            }

            pendingWebviewEdits++;
            lastSavedSvgText = message.text;
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            );
            edit.replace(document.uri, fullRange, message.text);
            await vscode.workspace.applyEdit(edit);
            setTimeout(() => { pendingWebviewEdits = Math.max(0, pendingWebviewEdits - 1); }, 150);
          }
          break;
        }

        case 'updateMetadata': {
          if (message.metadata !== undefined) {
            await writeSidecarMetadata(message.metadata);
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
          if (pendingWebviewEdits === 0 && e.document.getText() !== lastSavedSvgText) {
            lastSavedSvgText = e.document.getText();
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

    const userLocale = vscode.env.language || 'en';
    const langAttr = userLocale.toLowerCase().startsWith('es') ? 'es' : 'en';

    return /* html */ `<!DOCTYPE html>
<html lang="${langAttr}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} https://fonts.gstatic.com;">
  <title>AntiDraw SVG Vector Editor</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body data-vscode-language="${userLocale}">
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
