import * as vscode from 'vscode';
import { AdrwProjectService, AdrwContainer } from '../webview/engine/project/AdrwContainer.js';
import { IpcValidator } from '../shared/ipc/IpcContracts.js';
import { HostSaveValidator } from '../shared/validation/HostSaveValidator.js';
import { AtomicFileWriter } from './AtomicFileWriter.js';
import { AntiDrawCustomDocument } from './AntiDrawCustomDocument.js';

/**
 * ARCHITECTURAL RATIONALE: Native CustomEditorProvider Lifecycle with Hot Exit & Dirty State Governance
 *
 * 1. Native CustomEditorProvider Contract:
 *    Migrated from CustomTextEditorProvider (which relied on synthetic WorkspaceEdit text buffer replacements)
 *    to vscode.CustomEditorProvider<AntiDrawCustomDocument>. This provides first-class custom document
 *    lifecycle management, eliminating race conditions, serialization churn, and document position calculation bugs.
 *
 * 2. Hot Exit & Crash Recovery (backupCustomDocument & openCustomDocument from backupId):
 *    Full implementation of `backupCustomDocument` writing current in-memory project snapshots to the VS Code
 *    backup directory. On startup or window reload, `openCustomDocument` detects `openContext.backupId` and
 *    restores unsaved work with zero data loss.
 *
 * 3. Revert & External Sync Coordination (revertCustomDocument):
 *    Implements `revertCustomDocument` to discard transient dirty state, reload the committed disk version,
 *    and broadcast clean `loadSvg` synchronization messages to all connected webview panels.
 *
 * 4. Dirty State Governance (onDidChangeCustomDocument):
 *    Emits `CustomDocumentContentChangeEvent` whenever the webview dispatches `updateDocument` or `updateMetadata`,
 *    allowing VS Code to accurately display dirty status (the tab dot indicator) and govern save/auto-save timing.
 */
export class AntiDrawEditorProvider implements vscode.CustomEditorProvider<AntiDrawCustomDocument> {
  public static readonly viewType = 'antidraw.svgEditor';
  public static readonly projectEditorViewType = 'antidraw.projectEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<AntiDrawCustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

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

  /**
   * Helper to resolve the companion sidecar JSON URI for an SVG document.
   */
  public getSidecarUri(svgUri: vscode.Uri): vscode.Uri {
    const jsonPath = svgUri.path.replace(/\.svg$/i, '.json');
    return svgUri.with({ path: jsonPath });
  }

  /**
   * Reads companion sidecar metadata if available on disk.
   */
  public async readSidecarMetadata(svgUri: vscode.Uri): Promise<any> {
    try {
      const sidecarUri = this.getSidecarUri(svgUri);
      const data = await vscode.workspace.fs.readFile(sidecarUri);
      const text = new TextDecoder('utf-8').decode(data);
      return JSON.parse(text);
    } catch (_e) {
      return null;
    }
  }

  /**
   * Opens or creates an AntiDrawCustomDocument for a given resource URI.
   * Handles Hot Exit restoration when backupId is present.
   */
  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<AntiDrawCustomDocument> {
    const docDir = vscode.Uri.joinPath(uri, '..');
    const isAdrwDocument = uri.path.toLowerCase().endsWith('.adrw');
    const baseFileName = uri.path.split('/').pop() || (isAdrwDocument ? 'untitled.adrw' : 'untitled.svg');
    const adrwUri = isAdrwDocument
      ? uri
      : uri.with({ path: uri.path.replace(/\.svg$/i, '.adrw') });

    let container: AdrwContainer;

    // 1. Hot Exit Recovery: Restore uncommitted draft from backup if provided
    if (openContext.backupId) {
      try {
        const backupUri = vscode.Uri.parse(openContext.backupId);
        const backupData = await vscode.workspace.fs.readFile(backupUri);
        const backupText = new TextDecoder('utf-8').decode(backupData);
        container = AdrwProjectService.parseContainer(backupText, baseFileName);
        vscode.window.showInformationMessage(
          `[AntiDraw] Restaurado documento no guardado desde copia de seguridad Hot Exit (${baseFileName}).`
        );
        const doc = new AntiDrawCustomDocument(uri, container, isAdrwDocument, baseFileName, adrwUri, docDir);
        doc.setDirty(true);
        return doc;
      } catch (err) {
        console.warn('[AntiDraw] Falló la restauración de backup Hot Exit, cargando desde archivo de origen:', err);
      }
    }

    // 2. Normal Document Loading
    if (isAdrwDocument) {
      const data = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder('utf-8').decode(data);
      container = AdrwProjectService.parseContainer(text, baseFileName);
    } else {
      // SVG opened: check if companion .adrw already exists
      try {
        const adrwBytes = await vscode.workspace.fs.readFile(adrwUri);
        const adrwText = new TextDecoder('utf-8').decode(adrwBytes);
        container = AdrwProjectService.parseContainer(adrwText, baseFileName);
      } catch (_e) {
        // Generate new .adrw container from SVG
        const svgBytes = await vscode.workspace.fs.readFile(uri);
        const svgText = new TextDecoder('utf-8').decode(svgBytes);
        const sidecarMeta = await this.readSidecarMetadata(uri);
        container = AdrwProjectService.createFromSvg(svgText, baseFileName, sidecarMeta);
        const serialized = AdrwProjectService.serializeContainer(container);
        await AtomicFileWriter.write(vscode.workspace.fs, adrwUri, new TextEncoder().encode(serialized));
        vscode.window.showInformationMessage(
          `[AntiDraw] Contenedor .adrw generado (${adrwUri.path.split('/').pop()}). Los cambios se guardan exclusivamente en el contenedor .adrw; el SVG original permanece protegido.`
        );
      }
    }

    return new AntiDrawCustomDocument(uri, container, isAdrwDocument, baseFileName, adrwUri, docDir);
  }

  /**
   * Resolves the webview panel for the custom document.
   */
  public async resolveCustomEditor(
    document: AntiDrawCustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    document.registerPanel(webviewPanel);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.context.extensionUri,
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        document.docDir,
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) || []),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.docDir);

    const updateWebview = () => {
      const docDirWebviewUri = webviewPanel.webview.asWebviewUri(document.docDir).toString().replace(/\/+$/, '');
      webviewPanel.webview.postMessage({
        type: 'loadSvg',
        text: document.container.svgContent,
        metadata: document.container.companionMetadata || null,
        locale: vscode.env.language,
        documentUri: document.isAdrw ? document.uri.toString() : document.adrwUri.toString(),
        documentDirUri: document.docDir.toString(),
        documentDirWebviewUri: docDirWebviewUri,
        fileName: document.baseFileName,
      });
    };

    // Receive messages from the webview with strict schema validation
    webviewPanel.webview.onDidReceiveMessage(async (rawMessage) => {
      const validation = IpcValidator.validateWebviewToHost(rawMessage);
      if (!validation.isValid || !validation.message) {
        console.warn('[AntiDraw:HostIPC] Mensaje de Webview inválido rechazado:', validation.error, rawMessage);
        return;
      }
      const message = validation.message;
      switch (message.type) {
        case 'ready':
          updateWebview();
          break;

        case 'updateDocument': {
          if (message.text !== undefined) {
            const validation = HostSaveValidator.validateSvgIntegrity(message.text, document.container.svgContent);
            if (!validation.isValid) {
              vscode.window.showErrorMessage(`[AntiDraw] SafeSave: ${validation.error}`);
              break;
            }

            document.container.svgContent = message.text;
            document.container.metadata.modified = Date.now();
            document.setDirty(true);
            this._onDidChangeCustomDocument.fire({ document });
          }
          break;
        }

        case 'updateMetadata': {
          if (message.metadata !== undefined) {
            document.container.companionMetadata = message.metadata;
            document.container.metadata.modified = Date.now();
            document.setDirty(true);
            this._onDidChangeCustomDocument.fire({ document });
          }
          break;
        }

        case 'exportFile': {
          try {
            const { filename, content } = message;
            const targetFileName = filename || (document.baseFileName.replace(/\.(adrw|svg)$/i, '') + '.svg');
            if (targetFileName.toLowerCase().endsWith('.svg')) {
              const validation = HostSaveValidator.validateSvgIntegrity(content, undefined, { allowEmpty: true });
              if (!validation.isValid) {
                vscode.window.showErrorMessage(`[AntiDraw] SafeSave: Exportación rechazada: ${validation.error}`);
                break;
              }
            }
            const targetUri = vscode.Uri.joinPath(document.docDir, targetFileName);
            await AtomicFileWriter.write(vscode.workspace.fs, targetUri, new TextEncoder().encode(content));
            vscode.window.showInformationMessage(`[AntiDraw] Archivo SVG exportado con éxito: ${targetFileName}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`[AntiDraw] Error al exportar archivo SVG: ${err?.message || err}`);
          }
          break;
        }

        case 'saveLinkedImage': {
          try {
            const { imageId, extension, base64Data, requestId } = message;
            const cleanBase = document.baseFileName.replace(/\.(adrw|svg)$/i, '');
            const cleanExt = (extension || 'png').replace(/^\./, '').toLowerCase();
            const cleanId = (imageId || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, '_');
            const targetFileName = `${cleanBase}_${cleanId}_img.${cleanExt}`;
            const targetUri = vscode.Uri.joinPath(document.docDir, targetFileName);

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

    // Send initial content
    updateWebview();
  }

  /**
   * Persists the custom document to disk (Save command / Ctrl+S).
   */
  public async saveCustomDocument(
    document: AntiDrawCustomDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    const serialized = AdrwProjectService.serializeContainer(document.container);
    const targetUri = document.isAdrw ? document.uri : document.adrwUri;
    await AtomicFileWriter.write(vscode.workspace.fs, targetUri, new TextEncoder().encode(serialized));
    document.setDirty(false);
  }

  /**
   * Persists the custom document to a new target destination (Save As command).
   */
  public async saveCustomDocumentAs(
    document: AntiDrawCustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    const serialized = AdrwProjectService.serializeContainer(document.container);
    await AtomicFileWriter.write(vscode.workspace.fs, destination, new TextEncoder().encode(serialized));
  }

  /**
   * Discards uncommitted changes, reloads from disk, and notifies webviews (Revert command).
   */
  public async revertCustomDocument(
    document: AntiDrawCustomDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    const sourceUri = document.isAdrw ? document.uri : document.adrwUri;
    const data = await vscode.workspace.fs.readFile(sourceUri);
    const text = new TextDecoder('utf-8').decode(data);
    document.container = AdrwProjectService.parseContainer(text, document.baseFileName);
    document.setDirty(false);

    document.broadcastMessage({
      type: 'loadSvg',
      text: document.container.svgContent,
      metadata: document.container.companionMetadata || null,
      locale: vscode.env.language,
      documentUri: document.isAdrw ? document.uri.toString() : document.adrwUri.toString(),
      documentDirUri: document.docDir.toString(),
      fileName: document.baseFileName,
    });
  }

  /**
   * Hot Exit Backup implementation: persists uncommitted state to the destination provided by VS Code.
   */
  public async backupCustomDocument(
    document: AntiDrawCustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    const serialized = AdrwProjectService.serializeContainer(document.container);
    const buffer = new TextEncoder().encode(serialized);

    await vscode.workspace.fs.writeFile(context.destination, buffer);

    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination, { useTrash: false });
        } catch (_err) {
          // Suppress deletion errors on temp cleanup
        }
      },
    };
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} https://fonts.gstatic.com; connect-src 'none'; object-src 'none'; form-action 'none';">
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
