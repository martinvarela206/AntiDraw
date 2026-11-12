import { VsCodeBridge } from '../bridge/VsCodeBridge.js';

/**
 * ARCHITECTURAL RATIONALE: High-Efficiency Webview State Persistence (getState / setState)
 *
 * 1. Radical RAM & Process Optimization:
 *    Replacing `retainContextWhenHidden: true` with VS Code's native `getState()` / `setState()`
 *    eliminates persistent background Chromium render processes and DOM retention for hidden tabs.
 *
 * 2. Instant Zero-Latency Tab Restoration:
 *    When switching back to a previously hidden AntiDraw tab, `restoreState()` synchronously
 *    retrieves the cached document markup, viewport camera, zoom level, and active tool,
 *    rendering the vector workspace immediately without waiting for host IPC round-trip latency.
 *
 * 3. Compact Serialization & Debounced Writes:
 *    Throttles state persistence during high-frequency camera pan/zoom operations to prevent
 *    serialization overhead while ensuring zero data loss on abrupt tab backgrounding.
 */

export interface IWebviewPersistentState {
  version: 1;
  svgText: string;
  metadata?: any;
  zoom?: number;
  cameraOffset?: { x: number; y: number };
  activeToolId?: string;
  selectedElementIds?: string[];
  fileName?: string;
  timestamp: number;
}

export class WebviewStateManager {
  private static saveTimeout: any = null;

  /**
   * Persists current webview state into vscode.setState.
   */
  public static saveState(
    state: Partial<IWebviewPersistentState>,
    immediate: boolean = false
  ): void {
    const doSave = () => {
      try {
        const bridge = VsCodeBridge.getInstance();
        const existing = (bridge.getState<IWebviewPersistentState>()) || {
          version: 1,
          svgText: '',
          timestamp: 0,
        };
        const updated: IWebviewPersistentState = {
          ...existing,
          ...state,
          version: 1,
          timestamp: Date.now(),
        };
        bridge.setState(updated);
      } catch (err) {
        console.warn('[AntiDraw:WebviewStateManager] Failed to save state:', err);
      }
    };

    if (immediate) {
      if (this.saveTimeout !== null) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      doSave();
    } else {
      if (this.saveTimeout !== null) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(() => {
        doSave();
        this.saveTimeout = null;
      }, 150);
    }
  }

  /**
   * Restores cached state from vscode.getState() on webview mount.
   */
  public static restoreState(): IWebviewPersistentState | null {
    try {
      const bridge = VsCodeBridge.getInstance();
      const state = bridge.getState<IWebviewPersistentState>();
      if (state && state.version === 1 && typeof state.svgText === 'string') {
        return state;
      }
      return null;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Clears saved state.
   */
  public static clearState(): void {
    try {
      VsCodeBridge.getInstance().setState(null);
    } catch (_err) {}
  }
}
