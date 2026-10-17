import { ToolIcons } from '../icons/ToolIcons.js';

export interface SafeguardModalOptions {
  totalPoints: number;
  computationTimeMs: number;
  onContinueVisualOnly: () => void;
  onUndo: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Contextual Grid Performance Safeguard Modal (ContextualGridModal)
 *
 * VectorCraft / CAD Parity Protocol:
 * When a dense vector construction grid creates excessive snap targets (> 1,500 points or > 50ms compute),
 * this dialog prevents framerate collapse by presenting the user with two deterministic options:
 * 1. "Continuar como referencia visual sin snap": Preserves the full vector grid on screen,
 *    but disables magnetic calculation to maintain a locked 60 FPS.
 * 2. "Deshacer": Reverts the elements back to standard vectors immediately.
 */
export class ContextualGridModal {
  private static activeModal: HTMLElement | null = null;

  public static show(options: SafeguardModalOptions): void {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'ad-modal-backdrop';

    const container = document.createElement('div');
    container.className = 'ad-modal-container';
    container.style.maxWidth = '420px';

    const titleEl = document.createElement('div');
    titleEl.className = 'ad-modal-title';
    titleEl.innerHTML = `
      <span style="display:flex; align-items:center; gap:8px; color:#f59e0b; font-weight:600;">
        ${ToolIcons.warning} Rendimiento: Grilla Vectorial Densa
      </span>
    `;

    const bodyEl = document.createElement('div');
    bodyEl.style.fontSize = '12px';
    bodyEl.style.lineHeight = '1.6';
    bodyEl.style.color = 'var(--text-main, #cccccc)';
    bodyEl.style.margin = '14px 0 18px 0';
    bodyEl.innerHTML = `
      Se han pre-calculado <b>${options.totalPoints.toLocaleString()} puntos de snap e intersecciones</b> en <b>${options.computationTimeMs} ms</b>.<br/><br/>
      Para proteger la fluidez del lienzo a <b>60 FPS</b> y prevenir caídas de rendimiento durante el dibujo interactivo, elija cómo desea proceder:
    `;

    const actionsEl = document.createElement('div');
    actionsEl.style.display = 'flex';
    actionsEl.style.flexDirection = 'column';
    actionsEl.style.gap = '8px';

    const visualBtn = document.createElement('button');
    visualBtn.className = 'prop-input';
    visualBtn.style.cursor = 'pointer';
    visualBtn.style.background = 'var(--accent-primary, #007acc)';
    visualBtn.style.color = '#ffffff';
    visualBtn.style.fontWeight = '600';
    visualBtn.style.padding = '8px 12px';
    visualBtn.style.textAlign = 'center';
    visualBtn.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">${ToolIcons.eye} Continuar como referencia visual sin snap</span>`;
    visualBtn.onclick = () => {
      this.close();
      options.onContinueVisualOnly();
    };

    const undoBtn = document.createElement('button');
    undoBtn.className = 'prop-input';
    undoBtn.style.cursor = 'pointer';
    undoBtn.style.background = 'var(--bg-panel-hover, #2a2a2a)';
    undoBtn.style.color = 'var(--text-main, #ffffff)';
    undoBtn.style.fontWeight = '500';
    undoBtn.style.padding = '8px 12px';
    undoBtn.style.textAlign = 'center';
    undoBtn.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">${ToolIcons.undo} Deshacer conversión</span>`;
    undoBtn.onclick = () => {
      this.close();
      options.onUndo();
    };

    actionsEl.appendChild(visualBtn);
    actionsEl.appendChild(undoBtn);

    container.appendChild(titleEl);
    container.appendChild(bodyEl);
    container.appendChild(actionsEl);
    backdrop.appendChild(container);
    document.body.appendChild(backdrop);

    this.activeModal = backdrop;
  }

  public static close(): void {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }
  }
}
