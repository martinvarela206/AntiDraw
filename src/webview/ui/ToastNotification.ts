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
    icon.textContent = type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️';

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
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        if (container.children.length === 0 && container.parentNode) {
          container.parentNode.removeChild(container);
          ToastNotification.container = null;
        }
      }, 300);
    }, duration);

    return toast;
  }
}
