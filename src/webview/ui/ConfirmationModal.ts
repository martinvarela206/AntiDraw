/**
 * ARCHITECTURAL RATIONALE: Reusable Confirmation Modal System (FEAT-09)
 *
 * 1. Explicit Designer Consent:
 *    Native SVG primitives (<rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>) carry
 *    semantic geometric data and high-level inspector editing tools. Converting them to freeform
 *    Bézier paths (<path>) is an irreversible structural transformation that destroys canonical
 *    shape parameters.
 *    Rather than performing automatic, silent conversions, AntiDraw requires explicit approval
 *    via this modal, explaining the technical consequence and offering immediate Cancel or Confirm.
 *
 * 2. Hardware-Accelerated Glassmorphic Dialog:
 *    Styled with backdrop-filter blur, dark-mode design system tokens, and full keyboard accessibility
 *    (Enter to confirm, Escape to cancel).
 *    Provides a clean Promise<boolean> lifecycle for non-blocking asynchronous integration across
 *    menus, tool handlers, and shortcut dispatchers.
 */

import { ConfirmOptions } from '../tools/IToolHandler.js';

export type ConfirmationModalOptions = ConfirmOptions;

export class ConfirmationModal {
  private static activeModal: HTMLElement | null = null;

  public static confirm(options: ConfirmationModalOptions): Promise<boolean> {
    return new Promise((resolve) => {
      // Dismiss any existing modal
      if (this.activeModal) {
        this.activeModal.remove();
        this.activeModal = null;
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'ad-modal-backdrop';

      const container = document.createElement('div');
      container.className = 'ad-modal-container';

      const titleEl = document.createElement('div');
      titleEl.className = 'ad-modal-title';
      titleEl.textContent = options.title;

      const messageEl = document.createElement('div');
      messageEl.className = 'ad-modal-message';
      messageEl.textContent = options.message;

      container.appendChild(titleEl);
      container.appendChild(messageEl);

      if (options.details) {
        const detailsEl = document.createElement('div');
        detailsEl.className = 'ad-modal-details';
        detailsEl.textContent = options.details;
        container.appendChild(detailsEl);
      }

      const actionsEl = document.createElement('div');
      actionsEl.className = 'ad-modal-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'ad-modal-btn ad-modal-btn-cancel';
      cancelBtn.textContent = options.cancelText || 'Cancelar (Esc)';

      const confirmBtn = document.createElement('button');
      confirmBtn.className = `ad-modal-btn ad-modal-btn-confirm ${options.confirmButtonClass === 'danger' ? 'danger' : 'accent'}`;
      confirmBtn.textContent = options.confirmText || 'Convertir a Curvas';

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(confirmBtn);
      container.appendChild(actionsEl);

      backdrop.appendChild(container);
      document.body.appendChild(backdrop);
      this.activeModal = backdrop;

      // Focus confirm button by default for instant keyboard confirmation
      confirmBtn.focus();

      const cleanup = (result: boolean) => {
        window.removeEventListener('keydown', handleKeyDown);
        if (backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
        this.activeModal = null;
        resolve(result);
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cleanup(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          cleanup(true);
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup(false);
      });

      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup(true);
      });

      backdrop.addEventListener('pointerdown', (e) => {
        if (e.target === backdrop) {
          e.stopPropagation();
          cleanup(false);
        }
      });
    });
  }
}
