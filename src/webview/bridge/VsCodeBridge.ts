/**
 * ARCHITECTURAL RATIONALE: Webview-Host Communication Isolation (VsCodeBridge)
 *
 * 1. Single Point of Contact:
 *    The VS Code webview environment exposes a unique, singleton API via `acquireVsCodeApi()`.
 *    Invoking this function more than once per execution context throws a runtime exception in VS Code.
 *    By encapsulating `acquireVsCodeApi()` inside `VsCodeBridge`, we guarantee singleton integrity
 *    and prevent multiple components from attempting to acquire it independently.
 *
 * 2. Echo Suppression & Feedback Loop Prevention:
 *    When the vector canvas modifies the SVG string or canvas metadata, it sends an `updateDocument`
 *    or `updateMetadata` message to the extension host. The host persists the file to disk and may
 *    emit change events. Without an explicit suppression flag (`isUpdatingFromWebview`), the host's
 *    re-broadcast would trigger a redundant `loadSvg` in the webview, causing cursor loss, selection
 *    resets, or infinite serialization-deserialization cycles.
 *
 * 3. Type-Safe Decoupling:
 *    Raw `postMessage({ type: '...' })` string literals scatter protocol contracts across files.
 *    `VsCodeBridge` provides dedicated, strongly-typed methods (`updateDocument`, `updateMetadata`,
 *    `notifyReady`, `showInfo`, `showError`) and registration callbacks (`onLoadSvg`), decoupling
 *    the application core from VS Code transport primitives.
 */

import { SvgValidator } from '../engine/export/SvgValidator.js';

export interface CompanionMetadata {
  grids?: any[];
  guides?: any[];
  ruler?: any;
  showRulers?: boolean;
  showGrid?: boolean;
  showGuides?: boolean;
  gridSpacing?: number;
  snapToGrid?: boolean;
  snapToGuides?: boolean;
  snapToNodes?: boolean;
  snapToEdges?: boolean;
  snapToVertices?: boolean;
  snapToViewBox?: boolean;
  snapAngular?: boolean;
  shapeConfig?: any;
  undoStack?: string[];
  redoStack?: string[];
  elements?: Record<string, Record<string, string>>;
  scaleStroke?: boolean;
  scaleCorners?: boolean;
  [key: string]: any;
}

export interface LoadSvgPayload {
  text: string;
  metadata?: CompanionMetadata | null;
}

declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  setState(state: any): void;
  getState(): any;
};

export class VsCodeBridge {
  private static instance: VsCodeBridge | null = null;
  private vscodeApi: ReturnType<typeof acquireVsCodeApi>;
  private isUpdatingFromWebview: boolean = false;
  private loadSvgCallbacks: Array<(payload: LoadSvgPayload) => void> = [];

  constructor() {
    this.vscodeApi = acquireVsCodeApi();
    this.initMessageListener();
  }

  public static getInstance(): VsCodeBridge {
    if (!VsCodeBridge.instance) {
      VsCodeBridge.instance = new VsCodeBridge();
    }
    return VsCodeBridge.instance;
  }

  private initMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'loadSvg') {
        if (this.isUpdatingFromWebview) {
          // Suppress echo: document update originated within this webview session
          this.isUpdatingFromWebview = false;
          return;
        }

        const payload: LoadSvgPayload = {
          text: msg.text || '',
          metadata: msg.metadata || null,
        };

        for (const cb of this.loadSvgCallbacks) {
          cb(payload);
        }
      }
    });
  }

  public onLoadSvg(callback: (payload: LoadSvgPayload) => void): () => void {
    this.loadSvgCallbacks.push(callback);
    return () => {
      this.loadSvgCallbacks = this.loadSvgCallbacks.filter((cb) => cb !== callback);
    };
  }

  public notifyReady(): void {
    this.vscodeApi.postMessage({ type: 'ready' });
  }

  public updateDocument(svgText: string): boolean {
    const validation = SvgValidator.validate(svgText);
    if (!validation.isValid) {
      const errorMsg = `[SafeSave Aborted] AntiDraw ha evitado guardar un SVG corrupto o truncado: ${validation.error}`;
      console.error(errorMsg);
      this.showError(errorMsg);
      return false;
    }

    this.isUpdatingFromWebview = true;
    this.vscodeApi.postMessage({ type: 'updateDocument', text: svgText });
    return true;
  }

  public updateMetadata(metadata: CompanionMetadata): void {
    this.vscodeApi.postMessage({
      type: 'updateMetadata',
      metadata,
    });
  }

  public showInfo(message: string): void {
    this.vscodeApi.postMessage({ type: 'showInfo', message });
  }

  public showError(message: string): void {
    this.vscodeApi.postMessage({ type: 'showError', message });
  }

  public getState<T = any>(): T | undefined {
    return this.vscodeApi.getState();
  }

  public setState<T = any>(state: T): void {
    this.vscodeApi.setState(state);
  }
}
