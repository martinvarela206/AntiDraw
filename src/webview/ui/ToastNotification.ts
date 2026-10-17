/**
 * ARCHITECTURAL RATIONALE: Lightweight Non-Intrusive Toast Notifications (FEAT-08)
 *
 * 1. Non-Blocking Overlay:
 *    Renders notifications with `pointer-events: none` so that active drawing, zooming,
 *    and canvas gestures are never obstructed or intercepted by status toasts.
 *
 * 2. Self-Cleaning Lifecycle:
 *    Toasts automatically slide into view, linger for a configurable duration (default: 3500ms),
 *    fade out gracefully, and clean up their DOM nodes.
 */

export type ToastType = 'info' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  durationMs?: number;
}

export class ToastNotification {
  private static container: HTMLElement | null = null;

  private static ensureContainer(): HTMLElement | null {
    if (typeof document === 'undefined') return null;

    if (!this.container || !this.container.isConnected) {
      this.container = document.querySelector('.ad-toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.className = 'ad-toast-container';
        document.body.appendChild(this.container);
      }
    }
    return this.container;
  }

  public static show(options: ToastOptions): HTMLElement | null {
    const container = this.ensureContainer();
    if (!container || typeof document === 'undefined') return null;

    const type = options.type || 'info';
    const duration = options.durationMs ?? 3500;

    const toast = document.createElement('div');
    toast.className = `ad-toast ${type}`;

    const icon = document.createElement('span');
    icon.className = 'ad-toast-icon';
    icon.innerHTML =
      type === 'warning'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        : type === 'error'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    const msg = document.createElement('span');
    msg.className = 'ad-toast-msg';
    msg.textContent = options.message;

    toast.appendChild(icon);
    toast.appendChild(msg);
    container.appendChild(toast);

    // Auto dismiss timer
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (typeof toast.remove === 'function') {
          toast.remove();
        } else if (toast.parentNode && typeof toast.parentNode.removeChild === 'function') {
          toast.parentNode.removeChild(toast);
        }
        if (container.children.length === 0) {
          if (typeof container.remove === 'function') {
            container.remove();
          } else if (container.parentNode && typeof container.parentNode.removeChild === 'function') {
            container.parentNode.removeChild(container);
          }
          ToastNotification.container = null;
        }
      }, 300);
    }, duration);

    return toast;
  }
}
