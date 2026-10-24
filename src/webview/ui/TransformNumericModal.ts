/**
 * ARCHITECTURAL RATIONALE: TransformNumericModal (09.2)
 *
 * 1. Ergonomic Numeric Transformation Dialog:
 *    Triggered by double-clicking the Selection Tool button in the primary toolbar.
 *    Provides immediate, hardware-accelerated access to exact numeric coordinates (X, Y)
 *    and relative displacements (ΔX, ΔY), with optional duplicate-on-transform support.
 *
 * 2. Non-blocking Glassmorphic Modal with Keyboard Accessibility:
 *    Styled with standard AntiDraw dark-mode tokens, with full Enter/Escape keyboard handling
 *    and input auto-focus.
 */

import { I18nService } from '../i18n/index.js';

export interface TransformNumericOptions {
  currentBox: { x: number; y: number; width: number; height: number } | null;
  selectedCount: number;
  onApply: (dx: number, dy: number, duplicate: boolean) => void;
}

export class TransformNumericModal {
  private static activeModal: HTMLElement | null = null;

  public static show(options: TransformNumericOptions): void {
    // Dismiss any existing modal
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'ad-modal-backdrop';

    const container = document.createElement('div');
    container.className = 'ad-modal-container';
    container.style.maxWidth = '380px';

    const titleEl = document.createElement('div');
    titleEl.className = 'ad-modal-title';
    titleEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="5 9 2 12 5 15"></polyline>
        <polyline points="9 5 12 2 15 5"></polyline>
        <polyline points="15 19 12 22 9 19"></polyline>
        <polyline points="19 9 22 12 19 15"></polyline>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <line x1="12" y1="2" x2="12" y2="22"></line>
      </svg>
      <span>${I18nService.t('transformNumeric.title')}</span>
    `;

    container.appendChild(titleEl);

    if (options.selectedCount === 0 || !options.currentBox) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'ad-modal-message';
      emptyMsg.textContent = I18nService.t('transformNumeric.noSelectionMsg');

      const actionsEl = document.createElement('div');
      actionsEl.className = 'ad-modal-actions';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'ad-modal-btn ad-modal-btn-confirm accent';
      closeBtn.textContent = I18nService.t('transformNumeric.gotIt');

      actionsEl.appendChild(closeBtn);
      container.appendChild(emptyMsg);
      container.appendChild(actionsEl);

      backdrop.appendChild(container);
      document.body.appendChild(backdrop);
      this.activeModal = backdrop;

      closeBtn.focus();

      const close = () => {
        backdrop.remove();
        this.activeModal = null;
        window.removeEventListener('keydown', onKeyDown);
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          close();
        }
      };

      closeBtn.addEventListener('click', close);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
      });
      window.addEventListener('keydown', onKeyDown);
      return;
    }

    const box = options.currentBox;
    const initialX = Math.round(box.x * 100) / 100;
    const initialY = Math.round(box.y * 100) / 100;

    const countLabel =
      options.selectedCount === 1
        ? I18nService.t('transformNumeric.singleSelected')
        : I18nService.t('transformNumeric.multipleSelected', { count: options.selectedCount });

    const subDetails = document.createElement('div');
    subDetails.className = 'ad-modal-details';
    subDetails.textContent = I18nService.t('transformNumeric.sizeDetails', {
      count: countLabel,
      w: Math.round(box.width),
      h: Math.round(box.height),
    });
    container.appendChild(subDetails);

    // Form content
    const formEl = document.createElement('div');
    formEl.style.display = 'flex';
    formEl.style.flexDirection = 'column';
    formEl.style.gap = '10px';
    formEl.style.marginTop = '4px';

    formEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">${I18nService.t('transformNumeric.relativeDisplacement')}</span>
        <div style="display:flex; gap:8px;">
          <div style="flex:1; display:flex; align-items:center; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); border-radius:4px; padding:2px 8px;">
            <span style="font-size:11px; color:var(--text-muted); font-weight:600; width:20px;">ΔX</span>
            <input type="number" step="any" id="modal-transform-dx" value="0" style="flex:1; background:transparent; border:none; color:var(--text-main); font-size:12px; padding:4px 0; outline:none;" />
            <span style="font-size:10px; color:var(--text-muted);">px</span>
          </div>
          <div style="flex:1; display:flex; align-items:center; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); border-radius:4px; padding:2px 8px;">
            <span style="font-size:11px; color:var(--text-muted); font-weight:600; width:20px;">ΔY</span>
            <input type="number" step="any" id="modal-transform-dy" value="0" style="flex:1; background:transparent; border:none; color:var(--text-main); font-size:12px; padding:4px 0; outline:none;" />
            <span style="font-size:10px; color:var(--text-muted);">px</span>
          </div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:6px; margin-top:2px;">
        <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">${I18nService.t('transformNumeric.absolutePosition')}</span>
        <div style="display:flex; gap:8px;">
          <div style="flex:1; display:flex; align-items:center; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); border-radius:4px; padding:2px 8px;">
            <span style="font-size:11px; color:var(--text-muted); font-weight:600; width:20px;">X</span>
            <input type="number" step="any" id="modal-transform-abs-x" value="${initialX}" style="flex:1; background:transparent; border:none; color:var(--text-main); font-size:12px; padding:4px 0; outline:none;" />
            <span style="font-size:10px; color:var(--text-muted);">px</span>
          </div>
          <div style="flex:1; display:flex; align-items:center; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); border-radius:4px; padding:2px 8px;">
            <span style="font-size:11px; color:var(--text-muted); font-weight:600; width:20px;">Y</span>
            <input type="number" step="any" id="modal-transform-abs-y" value="${initialY}" style="flex:1; background:transparent; border:none; color:var(--text-main); font-size:12px; padding:4px 0; outline:none;" />
            <span style="font-size:10px; color:var(--text-muted);">px</span>
          </div>
        </div>
      </div>

      <label style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-main); cursor:pointer; margin-top:4px; user-select:none;">
        <input type="checkbox" id="modal-transform-duplicate" style="accent-color:var(--accent-color); cursor:pointer;" />
        <span>${I18nService.t('transformNumeric.createDuplicate')}</span>
      </label>
    `;

    container.appendChild(formEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'ad-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ad-modal-btn ad-modal-btn-cancel';
    cancelBtn.textContent = I18nService.t('transformNumeric.cancel');

    const applyBtn = document.createElement('button');
    applyBtn.className = 'ad-modal-btn ad-modal-btn-confirm accent';
    applyBtn.textContent = I18nService.t('transformNumeric.apply');

    actionsEl.appendChild(cancelBtn);
    actionsEl.appendChild(applyBtn);
    container.appendChild(actionsEl);

    backdrop.appendChild(container);
    document.body.appendChild(backdrop);
    this.activeModal = backdrop;

    const dxInput = formEl.querySelector<HTMLInputElement>('#modal-transform-dx')!;
    const dyInput = formEl.querySelector<HTMLInputElement>('#modal-transform-dy')!;
    const absXInput = formEl.querySelector<HTMLInputElement>('#modal-transform-abs-x')!;
    const absYInput = formEl.querySelector<HTMLInputElement>('#modal-transform-abs-y')!;
    const dupCheck = formEl.querySelector<HTMLInputElement>('#modal-transform-duplicate')!;

    // Two-way synchronization between relative deltas and absolute positions
    let updatingSync = false;
    const syncFromDelta = () => {
      if (updatingSync) return;
      updatingSync = true;
      const dx = parseFloat(dxInput.value) || 0;
      const dy = parseFloat(dyInput.value) || 0;
      absXInput.value = (Math.round((initialX + dx) * 100) / 100).toString();
      absYInput.value = (Math.round((initialY + dy) * 100) / 100).toString();
      updatingSync = false;
    };

    const syncFromAbs = () => {
      if (updatingSync) return;
      updatingSync = true;
      const targetX = parseFloat(absXInput.value);
      const targetY = parseFloat(absYInput.value);
      const dx = isNaN(targetX) ? 0 : targetX - initialX;
      const dy = isNaN(targetY) ? 0 : targetY - initialY;
      dxInput.value = (Math.round(dx * 100) / 100).toString();
      dyInput.value = (Math.round(dy * 100) / 100).toString();
      updatingSync = false;
    };

    dxInput.addEventListener('input', syncFromDelta);
    dyInput.addEventListener('input', syncFromDelta);
    absXInput.addEventListener('input', syncFromAbs);
    absYInput.addEventListener('input', syncFromAbs);

    dxInput.focus();
    dxInput.select();

    const close = () => {
      backdrop.remove();
      this.activeModal = null;
      window.removeEventListener('keydown', onKeyDown);
    };

    const submit = () => {
      const dx = parseFloat(dxInput.value) || 0;
      const dy = parseFloat(dyInput.value) || 0;
      const duplicate = dupCheck.checked;
      close();
      if (dx !== 0 || dy !== 0 || duplicate) {
        options.onApply(dx, dy, duplicate);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };

    cancelBtn.addEventListener('click', close);
    applyBtn.addEventListener('click', submit);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    window.addEventListener('keydown', onKeyDown);
  }
}
