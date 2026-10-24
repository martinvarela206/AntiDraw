import { EraserToolHandler } from '../../tools/EraserToolHandler.js';
import { EraserTipShape } from '../../engine/boolean/EraserEngine.js';
import { I18nService } from '../../i18n/index.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Eraser Inspector (EraserInspector)
 *
 * Provides micro-precision parameter adjustment for the vector eraser:
 * 1. Brush footprint size regulation via slider and synced numeric input.
 * 2. Footprint tip shape toggle (Circle vs Square).
 * 3. Alt-preservation carving explanation and keyboard shortcut hints.
 */
export class EraserInspector {
  public static render(
    container: HTMLElement,
    handler: EraserToolHandler,
    onChanged?: () => void
  ): void {
    const config = handler.getConfig();

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('eraserInspector.title')}</div>

        <div class="prop-row">
          <span class="prop-label">${I18nService.t('eraserInspector.shape')}</span>
          <div style="display:flex; gap:6px; width:130px;">
            <button type="button" class="tool-btn ${config.shape === 'circle' ? 'active' : ''}" id="eraser-shape-circle" style="flex:1; height:26px; padding:0; justify-content:center;">
              ${I18nService.t('eraserInspector.circle')}
            </button>
            <button type="button" class="tool-btn ${config.shape === 'square' ? 'active' : ''}" id="eraser-shape-square" style="flex:1; height:26px; padding:0; justify-content:center;">
              ${I18nService.t('eraserInspector.square')}
            </button>
          </div>
        </div>

        <div class="prop-row">
          <span class="prop-label">${I18nService.t('eraserInspector.size')}</span>
          <div style="display:flex; gap:6px; width:130px; align-items:center;">
            <input type="range" id="eraser-size-slider" min="2" max="120" value="${config.size}" style="flex:1; cursor:pointer;" />
            <input type="number" class="prop-input" id="eraser-size-num" min="2" max="150" value="${config.size}" style="width:45px; text-align:center;" />
          </div>
        </div>

        <div style="margin-top:12px; padding:8px; border-radius:4px; background:var(--figma-bg-subtle, rgba(0,0,0,0.04)); font-size:11px; color:var(--figma-text-secondary, #666); line-height:1.4;">
          <div style="font-weight:600; margin-bottom:4px; color:var(--figma-text-primary, inherit);">${I18nService.t('eraserInspector.shortcutsTitle')}</div>
          <div>• <kbd>[</kbd> / <kbd>]</kbd>: ${I18nService.t('eraserInspector.shortcutResize')}</div>
          <div>• <kbd>Alt</kbd>: ${I18nService.t('eraserInspector.shortcutAlt')}</div>
          <div>• ${I18nService.t('eraserInspector.scopeHint')}</div>
        </div>
      </div>
    `;

    // Event listeners
    const slider = container.querySelector('#eraser-size-slider') as HTMLInputElement | null;
    const numInput = container.querySelector('#eraser-size-num') as HTMLInputElement | null;
    const btnCircle = container.querySelector('#eraser-shape-circle') as HTMLButtonElement | null;
    const btnSquare = container.querySelector('#eraser-shape-square') as HTMLButtonElement | null;

    const updateSize = (newVal: number) => {
      handler.setSize(newVal);
      if (slider) slider.value = String(handler.size);
      if (numInput) numInput.value = String(handler.size);
      onChanged?.();
    };

    slider?.addEventListener('input', () => updateSize(Number(slider.value)));
    numInput?.addEventListener('change', () => updateSize(Number(numInput.value)));

    btnCircle?.addEventListener('click', () => {
      handler.setShape('circle');
      btnCircle.classList.add('active');
      btnSquare?.classList.remove('active');
      onChanged?.();
    });

    btnSquare?.addEventListener('click', () => {
      handler.setShape('square');
      btnSquare.classList.add('active');
      btnCircle?.classList.remove('active');
      onChanged?.();
    });
  }
}
