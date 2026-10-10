import { HistoryService } from './HistoryService.js';
import { VsCodeBridge } from '../bridge/VsCodeBridge.js';

export interface CrashGuardContext {
  historyService: HistoryService;
  render: () => void;
  reportStatusError?: (msg: string) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Anti-Panic Exception Isolation (CrashGuard - L3)
 *
 * Direct parity with VectorCraft's `vectorcraft_engine::guard::catch_panic`:
 * 1. Zero Process Abort:
 *    Untrusted geometry operations, degenerate Bézier curves, or complex boolean clippings
 *    must never unmount the Webview or corrupt the active drawing state.
 *
 * 2. Deterministic State Restoration:
 *    Captures an O(1) immutable `DocumentState` snapshot immediately before executing high-risk
 *    operations. If an unhandled exception or geometric degeneracy occurs, it rolls back
 *    to the pre-operation snapshot in O(1).
 *
 * 3. Graceful User Notification:
 *    Emits a controlled warning to VS Code and the status bar while keeping the document
 *    interactive and ready to save.
 */
export class CrashGuard {
  constructor(private ctx: CrashGuardContext) {}

  public execute<T>(operationName: string, action: () => T): T | null {
    const fallback = this.ctx.historyService.createSnapshot();

    try {
      return action();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[AntiDraw:CrashGuard] Panic prevented during '${operationName}':`, err);

      // Instant O(1) deterministic state rollback
      this.ctx.historyService.applyState(fallback);
      this.ctx.render();

      VsCodeBridge.getInstance().showError(
        `AntiDraw: Se recuperó el lienzo tras un fallo en '${operationName}': ${errMsg}`
      );
      this.ctx.reportStatusError?.(`Error en ${operationName} (revertido)`);
      return null;
    }
  }
}
