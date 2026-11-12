import * as vscode from 'vscode';
import { AdrwContainer } from '../webview/engine/project/AdrwContainer.js';

/**
 * ARCHITECTURAL RATIONALE: Native Custom Document Model (AntiDrawCustomDocument)
 *
 * 1. Native VS Code Custom Document Abstraction:
 *    Implements vscode.CustomDocument to integrate natively into VS Code's CustomEditorProvider lifecycle.
 *    Eliminates reliance on synthetic TextDocument buffer replacements (WorkspaceEdit.replace), avoiding
 *    heavy re-serialization churn, text position calculation overhead, and race conditions.
 *
 * 2. Multi-Panel & Multi-Editor Coordination:
 *    Tracks active WebviewPanel instances for the document, facilitating real-time state synchronization,
 *    coordinated hot-exit backups, and programmatic reload upon external disk/git changes.
 *
 * 3. Hot Exit & Dirty State Governance:
 *    Coordinated with vscode.CustomEditorProvider.onDidChangeCustomDocument, maintaining accurate dirty flags
 *    and clean separation between committed disk state and in-memory transient edits.
 */
export class AntiDrawCustomDocument implements vscode.CustomDocument {
  private readonly _uri: vscode.Uri;
  private _container: AdrwContainer;
  private readonly _isAdrw: boolean;
  private readonly _baseFileName: string;
  private readonly _adrwUri: vscode.Uri;
  private readonly _docDir: vscode.Uri;
  private _isDirty: boolean = false;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  public readonly onDidDispose = this._onDidDispose.event;

  private readonly _panels = new Set<vscode.WebviewPanel>();

  constructor(
    uri: vscode.Uri,
    initialContainer: AdrwContainer,
    isAdrw: boolean,
    baseFileName: string,
    adrwUri: vscode.Uri,
    docDir: vscode.Uri
  ) {
    this._uri = uri;
    this._container = initialContainer;
    this._isAdrw = isAdrw;
    this._baseFileName = baseFileName;
    this._adrwUri = adrwUri;
    this._docDir = docDir;
  }

  public get uri(): vscode.Uri {
    return this._uri;
  }

  public get container(): AdrwContainer {
    return this._container;
  }

  public set container(val: AdrwContainer) {
    this._container = val;
  }

  public get isAdrw(): boolean {
    return this._isAdrw;
  }

  public get baseFileName(): string {
    return this._baseFileName;
  }

  public get adrwUri(): vscode.Uri {
    return this._adrwUri;
  }

  public get docDir(): vscode.Uri {
    return this._docDir;
  }

  public get isDirty(): boolean {
    return this._isDirty;
  }

  public setDirty(dirty: boolean): void {
    this._isDirty = dirty;
  }

  public registerPanel(panel: vscode.WebviewPanel): void {
    this._panels.add(panel);
    panel.onDidDispose(() => {
      this._panels.delete(panel);
    });
  }

  public unregisterPanel(panel: vscode.WebviewPanel): void {
    this._panels.delete(panel);
  }

  public get registeredPanels(): vscode.WebviewPanel[] {
    return Array.from(this._panels);
  }

  public broadcastMessage(message: any): void {
    for (const panel of this._panels) {
      try {
        panel.webview.postMessage(message);
      } catch (_err) {
        // Suppress messaging exceptions on closing panels
      }
    }
  }

  public dispose(): void {
    this._panels.clear();
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}
