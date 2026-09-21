/**
 * ARCHITECTURAL RATIONALE: Webview Context Menu System (ContextMenu)
 *
 * 1. Hardware-Accelerated Contextual Actions:
 *    Rather than relying on browser-native context menus (which are suppressed or inconsistent across
 *    VS Code webview environments on Windows, Linux, and macOS), this custom floating context menu
 *    provides standard desktop vector illustration workflow (Figma, Illustrator, CorelDraw).
 *
 * 2. Boundary Clamping & Dismissal Lifecycle:
 *    Calculates viewport geometry to prevent clipping against window edges. Automatically dismisses on
 *    click outside, tool activation, or Escape key.
 *
 * 3. Non-Accidental Workflow:
 *    Clearly indicates keyboard shortcuts (Ctrl+Q, Ctrl+X, Ctrl+C, Ctrl+V, etc.) and disabled states,
 *    preventing accidental destructive transformations.
 */

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: string;
  disabled?: boolean;
  action: () => void;
}

export class ContextMenu {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ad-context-menu';
    this.element.style.display = 'none';
    document.body.appendChild(this.element);

    /**
     * ARCHITECTURAL RATIONALE: Window Pointerdown Capture Phase for Menu Dismissal (FIX)
     *
     * 1. Child elements such as #canvas-wrapper invoke e.stopPropagation() in their pointerdown handlers
     *    to isolate canvas transformations and prevent viewport scrolling collisions.
     * 2. When listening in bubble phase, e.stopPropagation() halted event traversal before reaching window,
     *    preventing click-outside detection from firing when clicking the canvas.
     * 3. Registering this listener in the CAPTURE phase (useCapture = true) guarantees global interception
     *    at the root window before any descendant can halt event propagation, reliably dismissing the
     *    floating context menu on any outside pointer gesture.
     */
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (this.isVisible() && !this.element.contains(e.target as Node)) {
          this.hide();
        }
      },
      true
    );

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });
  }

  public show(x: number, y: number, items: ContextMenuItem[]): void {
    this.element.innerHTML = '';

    items.forEach((item) => {
      if (item.id === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'ad-context-divider';
        this.element.appendChild(sep);
        return;
      }

      const itemEl = document.createElement('div');
      itemEl.className = `ad-context-item ${item.disabled ? 'disabled' : ''}`;
      itemEl.innerHTML = `
        <span class="ad-context-label">
          ${item.icon ? `<span class="ad-context-icon">${item.icon}</span>` : ''}
          <span>${item.label}</span>
        </span>
        ${item.shortcut ? `<span class="ad-context-shortcut">${item.shortcut}</span>` : ''}
      `;

      if (!item.disabled) {
        itemEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hide();
          item.action();
        });
      }

      this.element.appendChild(itemEl);
    });

    this.element.style.display = 'block';

    // Clamping to screen boundaries so menu never overflows offscreen
    const rect = this.element.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    this.element.style.left = `${Math.max(8, clampedX)}px`;
    this.element.style.top = `${Math.max(8, clampedY)}px`;
  }

  public hide(): void {
    this.element.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.element.style.display !== 'none';
  }
}
