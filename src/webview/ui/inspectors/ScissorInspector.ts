import { ScissorKnifeToolHandler } from '../../tools/ScissorKnifeToolHandler.js';
import { ScissorMode } from '../../engine/boolean/ScissorKnifeEngine.js';
import { I18nService } from '../../i18n/index.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Scissors & Knife Inspector (ScissorInspector)
 *
 * Provides micro-precision parameters for the unified vector cutting tool:
 * 1. Operational Mode Selector: Auto, Two-Clicks (Mode 1), and Freehand Drag (Mode 2).
 * 2. Curve Smoothing regulation via slider and synced numeric input (Douglas-Peucker + Schneider Bézier).
 * 3. Interaction guidance and shortcut hints.
 */
export class ScissorInspector {
  public static render(
    container: HTMLElement,
    handler: ScissorKnifeToolHandler,
    onChanged?: () => void
  ): void {
    const config = handler.getConfig();

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('scissorInspector.title')}</div>

        <div class="prop-row">
          <span class="prop-label">${I18nService.t('scissorInspector.mode')}</span>
          <div style="display:flex; gap:4px; width:140px;">
            <button type="button" class="tool-btn ${config.mode === 'auto' ? 'active' : ''}" id="scissor-mode-auto" style="flex:1; height:24px; padding:0; justify-content:center; font-size:11px;">
              ${I18nService.t('scissorInspector.modeAuto')}
            </button>
            <button type="button" class="tool-btn ${config.mode === 'two_clicks' ? 'active' : ''}" id="scissor-mode-two-clicks" style="flex:1; height:24px; padding:0; justify-content:center; font-size:11px;">
              ${I18nService.t('scissorInspector.modeTwoClicks')}
            </button>
            <button type="button" class="tool-btn ${config.mode === 'freehand' ? 'active' : ''}" id="scissor-mode-freehand" style="flex:1; height:24px; padding:0; justify-content:center; font-size:11px;">
              ${I18nService.t('scissorInspector.modeFreehand')}
            </button>
          </div>
        </div>

        <div class="prop-row">
          <span class="prop-label">${I18nService.t('scissorInspector.smoothing')}</span>
          <div style="display:flex; gap:6px; width:140px; align-items:center;">
            <input type="range" id="scissor-smoothing-slider" min="0" max="100" value="${config.smoothing}" style="flex:1; cursor:pointer;" />
            <input type="number" class="prop-input" id="scissor-smoothing-num" min="0" max="100" value="${config.smoothing}" style="width:42px; text-align:center;" />
          </div>
        </div>

        <div style="margin-top:12px; padding:8px; border-radius:4px; background:var(--figma-bg-subtle, rgba(0,0,0,0.04)); font-size:11px; color:var(--figma-text-secondary, #666); line-height:1.4;">
          <div style="font-weight:600; margin-bottom:4px; color:var(--figma-text-primary, inherit);">${I18nService.t('scissorInspector.shortcutsTitle')}</div>
          <div>• <strong>${I18nService.t('scissorInspector.modeTwoClicks')}:</strong> ${I18nService.t('scissorInspector.mode1Hint')}</div>
          <div>• <strong>${I18nService.t('scissorInspector.modeFreehand')}:</strong> ${I18nService.t('scissorInspector.mode2Hint')}</div>
          <div>• <kbd>Esc</kbd>: ${I18nService.t('scissorInspector.cancelHint')}</div>
          <div>• ${I18nService.t('scissorInspector.scopeHint')}</div>
        </div>
      </div>
    `;

    const slider = container.querySelector('#scissor-smoothing-slider') as HTMLInputElement | null;
    const numInput = container.querySelector('#scissor-smoothing-num') as HTMLInputElement | null;
    const btnAuto = container.querySelector('#scissor-mode-auto') as HTMLButtonElement | null;
    const btnTwoClicks = container.querySelector('#scissor-mode-two-clicks') as HTMLButtonElement | null;
    const btnFreehand = container.querySelector('#scissor-mode-freehand') as HTMLButtonElement | null;

    const updateSmoothing = (newVal: number) => {
      handler.setSmoothing(newVal);
      if (slider) slider.value = String(handler.smoothing);
      if (numInput) numInput.value = String(handler.smoothing);
      onChanged?.();
    };

    slider?.addEventListener('input', () => updateSmoothing(Number(slider.value)));
    numInput?.addEventListener('change', () => updateSmoothing(Number(numInput.value)));

    const setMode = (mode: ScissorMode) => {
      handler.setMode(mode);
      btnAuto?.classList.toggle('active', mode === 'auto');
      btnTwoClicks?.classList.toggle('active', mode === 'two_clicks');
      btnFreehand?.classList.toggle('active', mode === 'freehand');
      onChanged?.();
    };

    btnAuto?.addEventListener('click', () => setMode('auto'));
    btnTwoClicks?.addEventListener('click', () => setMode('two_clicks'));
    btnFreehand?.addEventListener('click', () => setMode('freehand'));
  }
}
