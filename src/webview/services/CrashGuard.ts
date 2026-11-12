import { HistoryService } from './HistoryService.js';
import type { INotifier } from '../engine/guard/INotifier.js';

export interface CrashGuardContext {
  historyService: HistoryService;
  render: () => void;
  notifier?: INotifier;
  reportStatusError?: (msg: string) => void;
  resetInteractionFlags?: () => void;
  releasePointerCapture?: () => void;
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
 * 3. Guaranteed Interaction Recovery:
 *    Immediately forces pointer capture release and resets interaction flags (isDragging)
 *    to prevent the canvas or input loop from freezing.
 *
 * 4. Inverted Notification Port:
 *    Decoupled from VsCodeBridge via INotifier port injection, keeping L3 independent of L4.
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

      // 1. Liberación garantizada de captura de puntero y reseteo forzado de interacción
      try {
        this.ctx.releasePointerCapture?.();
      } catch (_e) {}
      try {
        this.ctx.resetInteractionFlags?.();
      } catch (_e) {}

      // 2. Instant O(1) deterministic state rollback
      this.ctx.historyService.applyState(fallback);
      this.ctx.render();

      // 3. Notificación de error
      if (this.ctx.notifier) {
        this.ctx.notifier.showError(
          `AntiDraw: Se recuperó el lienzo tras un fallo en '${operationName}': ${errMsg}`
        );
      }
      this.ctx.reportStatusError?.(`Error en ${operationName} (revertido)`);
      return null;
    }
  }
}
