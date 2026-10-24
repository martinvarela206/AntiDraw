import * as vscode from 'vscode';
import { AdrwProjectService, AdrwContainer } from '../webview/engine/project/AdrwContainer.js';

export class AntiDrawEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'antidraw.svgEditor';
  public static readonly projectEditorViewType = 'antidraw.projectEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new AntiDrawEditorProvider(context);
    const svgRegistration = vscode.window.registerCustomEditorProvider(
      AntiDrawEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
    const projectRegistration = vscode.window.registerCustomEditorProvider(
      AntiDrawEditorProvider.projectEditorViewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
    return vscode.Disposable.from(svgRegistration, projectRegistration);
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docDir = vscode.Uri.joinPath(document.uri, '..');
    const isAdrwDocument = document.uri.path.toLowerCase().endsWith('.adrw');
    const baseFileName = document.uri.path.split('/').pop() || (isAdrwDocument ? 'untitled.adrw' : 'untitled.svg');
    const adrwUri = isAdrwDocument
      ? document.uri
      : document.uri.with({ path: document.uri.path.replace(/\.svg$/i, '.adrw') });

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.context.extensionUri,
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        docDir,
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) || []),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, docDir);

    let pendingWebviewEdits = 0;
    let container: AdrwContainer;

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

    // Initialize or load container
    if (isAdrwDocument) {
      container = AdrwProjectService.parseContainer(document.getText(), baseFileName);
    } else {
      // SVG opened: check if companion .adrw already exists
      try {
        const adrwBytes = await vscode.workspace.fs.readFile(adrwUri);
        const adrwText = new TextDecoder('utf-8').decode(adrwBytes);
        container = AdrwProjectService.parseContainer(adrwText, baseFileName);
      } catch (_e) {
        // Generate new .adrw container from SVG
        const sidecarMeta = await readSidecarMetadata();
        container = AdrwProjectService.createFromSvg(document.getText(), baseFileName, sidecarMeta);
        const serialized = AdrwProjectService.serializeContainer(container);
        await vscode.workspace.fs.writeFile(adrwUri, new TextEncoder().encode(serialized));
        vscode.window.showInformationMessage(
          `[AntiDraw] Contenedor .adrw generado (${adrwUri.path.split('/').pop()}). Los cambios se guardan exclusivamente en el contenedor .adrw; el SVG original permanece protegido.`
        );
      }
    }

    let lastSavedText: string = isAdrwDocument ? document.getText() : AdrwProjectService.serializeContainer(container);

    // Send initial content and metadata when webview notifies it is ready or on load
    const updateWebview = async () => {
      if (pendingWebviewEdits === 0) {
        const docDirWebviewUri = webviewPanel.webview.asWebviewUri(docDir).toString().replace(/\/+$/, '');
        webviewPanel.webview.postMessage({
          type: 'loadSvg',
          text: container.svgContent,
          metadata: container.companionMetadata || null,
          locale: vscode.env.language,
          documentUri: isAdrwDocument ? document.uri.toString() : adrwUri.toString(),
          documentDirUri: docDir.toString(),
          documentDirWebviewUri: docDirWebviewUri,
          fileName: baseFileName,
        });
      }
    };

    // Receive messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          await updateWebview();
          break;

        case 'updateDocument': {
          if (message.text !== undefined) {
            if (
              typeof message.text !== 'string' ||
              message.text.trim().length < 20 ||
              !message.text.toLowerCase().includes('<svg') ||
              !message.text.toLowerCase().includes('</svg>')
            ) {
              vscode.window.showErrorMessage('[AntiDraw] SafeSave: Se rechazó la sobreescritura del archivo con un SVG inválido o truncado.');
              break;
            }

            container.svgContent = message.text;
            container.metadata.modified = Date.now();
            const serialized = AdrwProjectService.serializeContainer(container);

            if (isAdrwDocument) {
              if (serialized !== document.getText()) {
                pendingWebviewEdits++;
                lastSavedText = serialized;
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                  document.positionAt(0),
                  document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, serialized);
                await vscode.workspace.applyEdit(edit);
                setTimeout(() => { pendingWebviewEdits = Math.max(0, pendingWebviewEdits - 1); }, 150);
              }
            } else {
              // Direct writes to companion .adrw, SVG is untouched
              lastSavedText = serialized;
              await vscode.workspace.fs.writeFile(adrwUri, new TextEncoder().encode(serialized));
            }
          }
          break;
        }

        case 'updateMetadata': {
          if (message.metadata !== undefined) {
            container.companionMetadata = message.metadata;
            container.metadata.modified = Date.now();
            const serialized = AdrwProjectService.serializeContainer(container);

            if (isAdrwDocument) {
              if (serialized !== document.getText()) {
                pendingWebviewEdits++;
                lastSavedText = serialized;
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                  document.positionAt(0),
                  document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, serialized);
                await vscode.workspace.applyEdit(edit);
                setTimeout(() => { pendingWebviewEdits = Math.max(0, pendingWebviewEdits - 1); }, 150);
              }
            } else {
              lastSavedText = serialized;
              await vscode.workspace.fs.writeFile(adrwUri, new TextEncoder().encode(serialized));
            }
          }
          break;
        }

        case 'exportFile': {
          try {
            const { filename, content } = message;
            const targetFileName = filename || (baseFileName.replace(/\.(adrw|svg)$/i, '') + '.svg');
            const targetUri = vscode.Uri.joinPath(docDir, targetFileName);
            await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(content));
            vscode.window.showInformationMessage(`[AntiDraw] Archivo SVG exportado con éxito: ${targetFileName}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`[AntiDraw] Error al exportar archivo SVG: ${err?.message || err}`);
          }
          break;
        }

        case 'saveLinkedImage': {
          try {
            const { imageId, extension, base64Data, requestId } = message;
            const baseFileName = (document.uri.path.split('/').pop() || 'drawing.svg').replace(/\.svg$/i, '');
            const cleanExt = (extension || 'png').replace(/^\./, '').toLowerCase();
            const cleanId = (imageId || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, '_');
            const targetFileName = `${baseFileName}_${cleanId}_img.${cleanExt}`;
            const targetUri = vscode.Uri.joinPath(docDir, targetFileName);

            const rawBase64 = (base64Data || '').replace(/^data:[^;]+;base64,/, '');
            const buffer = Buffer.from(rawBase64, 'base64');
            await vscode.workspace.fs.writeFile(targetUri, buffer);

            const relativePath = `./${targetFileName}`;
            const webviewUri = webviewPanel.webview.asWebviewUri(targetUri).toString();

            webviewPanel.webview.postMessage({
              type: 'saveLinkedImageResponse',
              requestId,
              success: true,
              relativePath,
              webviewUri,
              fileName: targetFileName,
            });
          } catch (err: any) {
            vscode.window.showErrorMessage(`[AntiDraw] Error al guardar imagen asociada: ${err?.message || err}`);
            if (message.requestId) {
              webviewPanel.webview.postMessage({
                type: 'saveLinkedImageResponse',
                requestId: message.requestId,
                success: false,
                error: err?.message || String(err),
              });
            }
          }
          break;
        }

        case 'openImageFileDialog': {
          try {
            const uris = await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectFolders: false,
              canSelectMany: false,
              filters: {
                Images: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'],
              },
              title: 'Seleccionar imagen para AntiDraw',
            });
            if (uris && uris.length > 0) {
              const selectedUri = uris[0];
              const fileData = await vscode.workspace.fs.readFile(selectedUri);
              const ext = selectedUri.path.split('.').pop()?.toLowerCase() || 'png';
              const mime =
                ext === 'jpg' || ext === 'jpeg'
                  ? 'image/jpeg'
                  : ext === 'webp'
                  ? 'image/webp'
                  : ext === 'gif'
                  ? 'image/gif'
                  : ext === 'svg'
                  ? 'image/svg+xml'
                  : 'image/png';
              const base64 = `data:${mime};base64,${Buffer.from(fileData).toString('base64')}`;
              const fileName = selectedUri.path.split('/').pop() || 'image.png';

              webviewPanel.webview.postMessage({
                type: 'imageFileSelected',
                requestId: message.requestId,
                base64,
                fileName,
                sizeBytes: fileData.byteLength,
                sourceUri: selectedUri.toString(),
              });
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`[AntiDraw] Error al abrir imagen: ${err?.message || err}`);
          }
          break;
        }

        case 'readImageUri': {
          try {
            const uriStr = message.uri;
            const targetUri = uriStr.startsWith('file:')
              ? vscode.Uri.parse(uriStr)
              : vscode.Uri.file(uriStr);
            const fileData = await vscode.workspace.fs.readFile(targetUri);
            const ext = targetUri.path.split('.').pop()?.toLowerCase() || 'png';
            const mime =
              ext === 'jpg' || ext === 'jpeg'
                ? 'image/jpeg'
                : ext === 'webp'
                ? 'image/webp'
                : ext === 'gif'
                ? 'image/gif'
                : ext === 'svg'
                ? 'image/svg+xml'
                : 'image/png';
            const base64 = `data:${mime};base64,${Buffer.from(fileData).toString('base64')}`;
            const fileName = targetUri.path.split('/').pop() || 'image.png';

            webviewPanel.webview.postMessage({
              type: 'readImageUriResponse',
              requestId: message.requestId,
              success: true,
              base64,
              fileName,
              sizeBytes: fileData.byteLength,
            });
          } catch (err: any) {
            webviewPanel.webview.postMessage({
              type: 'readImageUriResponse',
              requestId: message.requestId,
              success: false,
              error: err?.message || String(err),
            });
          }
          break;
        }

        case 'showInfo':
          vscode.window.showInformationMessage(message.message);
          break;

        case 'showError':
          vscode.window.showErrorMessage(message.message);
          break;

        case 'openExternal':
          if (message.url) {
            try {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            } catch (err: any) {
              vscode.window.showErrorMessage(`[AntiDraw] Error al abrir enlace externo: ${err?.message || err}`);
            }
          }
          break;
      }
    });

    // Listen to document changes from external edits only
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          if (pendingWebviewEdits === 0 && e.document.getText() !== lastSavedText) {
            lastSavedText = e.document.getText();
            if (isAdrwDocument) {
              container = AdrwProjectService.parseContainer(lastSavedText, baseFileName);
            }
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

  private getHtmlForWebview(webview: vscode.Webview, docDir?: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    );
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'icon.png')
    );
    const extensionVersion = this.context.extension?.packageJSON?.version || '0.97.2';

    const nonce = getNonce();

    const userLocale = vscode.env.language || 'en';
    const lowerLocale = userLocale.toLowerCase();
    let langAttr = 'en';
    if (lowerLocale.startsWith('es')) langAttr = 'es';
    else if (lowerLocale.startsWith('zh')) langAttr = 'zh-cn';
    else if (lowerLocale.startsWith('de')) langAttr = 'de';
    else if (lowerLocale.startsWith('fr')) langAttr = 'fr';
    else if (lowerLocale.startsWith('ru')) langAttr = 'ru';
    else if (lowerLocale.startsWith('ja')) langAttr = 'ja';
    const baseTag = docDir
      ? `<base href="${webview.asWebviewUri(docDir).toString().replace(/\/+$/, '')}/">`
      : '';

    return /* html */ `<!DOCTYPE html>
<html lang="${langAttr}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseTag}
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} https://fonts.gstatic.com;">
  <title>AntiDraw SVG Vector Editor</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body data-vscode-language="${userLocale}" data-extension-version="${extensionVersion}" data-extension-date="2026-10-22" data-icon-uri="${iconUri}">
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
