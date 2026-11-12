import * as vscode from 'vscode';

/**
 * ARCHITECTURAL RATIONALE: Volatile Session State vs Persistent Companion Metadata
 *
 * 1. Git Cleanliness & Zero-Noise Commits:
 *    Local workstation session state (camera offset, zoom level, undo/redo stacks) fluctuates
 *    rapidly during navigation and editing. Persisting these directly into companion .svg.json
 *    pollutes Git repositories with transient workstation churn.
 *
 * 2. VS Code Session Storage (workspaceState / globalState):
 *    Transient session properties are offloaded to VS Code's native `workspaceState` memento,
 *    keyed by document URI.
 *
 * 3. Enriched Shape & Vector Metadata Preservation:
 *    The on-disk companion file strictly retains persistent document and vector configurations
 *    (grids, guides, custom appearance stacks, element pivots, swatches, and parametric attributes).
 *
 * 4. Transparent Hydration on Load:
 *    When documents are resolved, `SessionStateStorage` seamlessly merges persistent disk metadata
 *    with the user's volatile session state, ensuring camera position, zoom, and undo buffers
 *    are accurately restored without dirtying the file.
 */

export interface VolatileSessionState {
  zoom?: number;
  cameraOffset?: { x: number; y: number };
  undoStack?: string[];
  redoStack?: string[];
  [key: string]: any;
}

export class SessionStateStorage {
  public static readonly VOLATILE_KEYS = ['zoom', 'cameraOffset', 'undoStack', 'redoStack'] as const;

  /**
   * Generates a deterministic workspace state storage key for a document URI.
   */
  public static getSessionKey(uri: vscode.Uri): string {
    return `antidraw.sessionState:${uri.toString()}`;
  }

  /**
   * Separates companion metadata into persistent document configuration and volatile session state.
   */
  public static splitMetadata(metadata: any): {
    persistent: Record<string, any>;
    volatile: VolatileSessionState;
    hasVolatile: boolean;
  } {
    if (!metadata || typeof metadata !== 'object') {
      return { persistent: {}, volatile: {}, hasVolatile: false };
    }

    const persistent: Record<string, any> = { ...metadata };
    const volatile: VolatileSessionState = {};
    let hasVolatile = false;

    if (persistent.zoom !== undefined) {
      volatile.zoom = persistent.zoom;
      delete persistent.zoom;
      hasVolatile = true;
    }

    if (persistent.cameraOffset !== undefined) {
      volatile.cameraOffset = persistent.cameraOffset;
      delete persistent.cameraOffset;
      hasVolatile = true;
    }

    if (persistent.undoStack !== undefined) {
      volatile.undoStack = persistent.undoStack;
      delete persistent.undoStack;
      hasVolatile = true;
    }

    if (persistent.redoStack !== undefined) {
      volatile.redoStack = persistent.redoStack;
      delete persistent.redoStack;
      hasVolatile = true;
    }

    return { persistent, volatile, hasVolatile };
  }

  /**
   * Persists volatile session state to VS Code workspaceState.
   */
  public static async saveSessionState(
    workspaceState: vscode.Memento,
    uri: vscode.Uri,
    volatileState: VolatileSessionState
  ): Promise<void> {
    const key = this.getSessionKey(uri);
    const existing = workspaceState.get<VolatileSessionState>(key) || {};
    const merged = { ...existing, ...volatileState };
    await workspaceState.update(key, merged);
  }

  /**
   * Retrieves volatile session state from VS Code workspaceState.
   */
  public static getSessionState(
    workspaceState: vscode.Memento,
    uri: vscode.Uri
  ): VolatileSessionState | undefined {
    return workspaceState.get<VolatileSessionState>(this.getSessionKey(uri));
  }

  /**
   * Merges persistent companion metadata with volatile session state before dispatching to webview.
   */
  public static mergeMetadata(
    persistent: any,
    volatile: VolatileSessionState | undefined
  ): Record<string, any> {
    if (!volatile) return persistent || {};
    return {
      ...(persistent || {}),
      ...(volatile.zoom !== undefined ? { zoom: volatile.zoom } : {}),
      ...(volatile.cameraOffset !== undefined ? { cameraOffset: volatile.cameraOffset } : {}),
      ...(volatile.undoStack !== undefined ? { undoStack: volatile.undoStack } : {}),
      ...(volatile.redoStack !== undefined ? { redoStack: volatile.redoStack } : {}),
    };
  }
}
