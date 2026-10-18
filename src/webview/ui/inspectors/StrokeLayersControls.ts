import { VectorElement } from '../../engine/VectorModel.js';
import { AppearanceStackManager, StrokeLayer } from '../../engine/appearance/AppearanceStackManager.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import { I18nService } from '../../i18n/index.js';
import { ColorPickerPopover } from '../ColorPickerPopover.js';

/**
 * ARCHITECTURAL RATIONALE: Modular Multi-Stroke Layer Controls (StrokeLayersControls)
 *
 * 1. Single Responsibility & Rule 6 File Size Compliance:
 *    Decoupled from StrokeInspector to preserve cohesive responsibilities and maintain file sizes
 *    well under 500 lines.
 *
 * 2. Multi-Stroke Management:
 *    Allows adding, customizing, reordering (below vs above), and deleting secondary stroke layers.
 *    Enables road-casing, double-borders, glowing halos, and complex vector borders in a single mathematical shape.
 */
export class StrokeLayersControls {
  public static renderHtml(el: VectorElement): string {
    const stack = AppearanceStackManager.getStack(el);
    const layers = stack.strokes;

    return `
      <div class="panel-section" style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px;">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>${I18nService.t('inspector.strokeLayersTitle')}</span>
            <span class="badge" style="font-size:10px; color:#94a3b8; font-weight:normal;">${layers.length}</span>
          </div>
          <button type="button" class="prop-input" id="btn-add-stroke-layer" style="cursor:pointer; width:auto; padding:1px 6px; font-size:10.5px; color:#10b981; font-weight:600;" title="${I18nService.t('inspector.addLayer')}">${I18nService.t('inspector.addLayer')}</button>
        </div>

        ${layers.length === 0 ? `
          <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; padding:4px 0;">
            ${I18nService.t('inspector.emptyLayersHint')}
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
            ${layers.map((l, idx) => `
              <div class="stroke-layer-item" data-layer-id="${l.id}" style="padding:6px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:4px; display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:10.5px; font-weight:600; color:var(--text-main);">${I18nService.t('inspector.layerLabel', { idx: idx + 1, pos: l.position === 'below' ? I18nService.t('inspector.layerBelow') : I18nService.t('inspector.layerAbove') })}</span>
                  <div style="display:flex; gap:4px; align-items:center;">
                    <select class="prop-input select-layer-pos" data-layer-id="${l.id}" style="font-size:9.5px; padding:1px 4px; height:20px; cursor:pointer;">
                      <option value="below" ${l.position === 'below' ? 'selected' : ''}>${I18nService.t('inspector.layerBelow')}</option>
                      <option value="above" ${l.position === 'above' ? 'selected' : ''}>${I18nService.t('inspector.layerAbove')}</option>
                    </select>
                    <button type="button" class="btn-remove-stroke-layer" data-layer-id="${l.id}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:11px; padding:0 3px; display:inline-flex; align-items:center;" title="${I18nService.t('inspector.deleteLayerTooltip')}">${ToolIcons.close}</button>
                  </div>
                </div>

                <div style="display:flex; gap:4px; align-items:center;">
                  <!-- Color -->
                  <button type="button" class="color-swatch input-layer-color" data-layer-id="${l.id}" style="width:24px; height:24px; background-color: ${l.stroke.startsWith('#') ? l.stroke : '#000000'};" title="Color del trazo secundario"></button>
                  <input type="text" class="prop-input input-layer-hex" data-layer-id="${l.id}" value="${l.stroke}" style="flex:1; font-size:10.5px;" />
                  <!-- Width -->
                  <div style="display:flex; align-items:center; gap:2px; width:60px;">
                    <input type="number" class="prop-input input-layer-width" data-layer-id="${l.id}" value="${l.strokeWidth}" min="0.5" step="0.5" style="width:45px; font-size:10.5px;" title="Grosor en px" />
                    <span style="font-size:10px; color:var(--text-muted);">px</span>
                  </div>
                </div>

                <div style="display:flex; gap:4px; align-items:center;">
                  <span style="font-size:10px; color:var(--text-muted); width:45px;">Guiones:</span>
                  <input type="text" class="prop-input input-layer-dash" data-layer-id="${l.id}" value="${l.strokeDash || ''}" placeholder="e.g. 4 2 (opcional)" style="flex:1; font-size:10.5px;" />
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    el: VectorElement,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const btnAddLayer = container.querySelector<HTMLButtonElement>('#btn-add-stroke-layer');
    if (btnAddLayer) {
      btnAddLayer.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        AppearanceStackManager.addStrokeLayer(el);
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    container.querySelectorAll<HTMLButtonElement>('.btn-remove-stroke-layer').forEach((btn) => {
      btn.addEventListener('click', () => {
        const layerId = btn.getAttribute('data-layer-id');
        if (!layerId) return;
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        AppearanceStackManager.removeStrokeLayer(el, layerId);
        callbacks.onUpdateElement(el);
        onReRender();
      });
    });

    container.querySelectorAll<HTMLSelectElement>('.select-layer-pos').forEach((sel) => {
      sel.addEventListener('change', () => {
        const layerId = sel.getAttribute('data-layer-id');
        if (!layerId) return;
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        AppearanceStackManager.updateStrokeLayer(el, layerId, { position: sel.value as 'below' | 'above' });
        callbacks.onUpdateElement(el);
        onReRender();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('.input-layer-color').forEach((colorBtn) => {
      colorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const layerId = colorBtn.getAttribute('data-layer-id');
        if (!layerId) return;
        const initial = colorBtn.style.backgroundColor || '#000000';
        ColorPickerPopover.show({
          anchorEl: colorBtn,
          initialColor: initial.startsWith('#') ? initial : '#000000',
          showAlpha: true,
          onChange: ({ hex }) => {
            AppearanceStackManager.updateStrokeLayer(el, layerId, { stroke: hex });
            colorBtn.style.backgroundColor = hex;
            const hexInput = container.querySelector<HTMLInputElement>(`.input-layer-hex[data-layer-id="${layerId}"]`);
            if (hexInput) hexInput.value = hex;
            callbacks.onUpdateElement(el);
          },
          onCommit: ({ hex }) => {
            if (callbacks.onPushUndo) callbacks.onPushUndo();
            AppearanceStackManager.updateStrokeLayer(el, layerId, { stroke: hex });
            colorBtn.style.backgroundColor = hex;
            const hexInput = container.querySelector<HTMLInputElement>(`.input-layer-hex[data-layer-id="${layerId}"]`);
            if (hexInput) hexInput.value = hex;
            callbacks.onUpdateElement(el);
          }
        });
      });
    });

    container.querySelectorAll<HTMLInputElement>('.input-layer-hex').forEach((hexInput) => {
      hexInput.addEventListener('change', () => {
        const layerId = hexInput.getAttribute('data-layer-id');
        if (!layerId) return;
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const val = hexInput.value.trim();
        const hex = val.startsWith('#') ? val : `#${val}`;
        AppearanceStackManager.updateStrokeLayer(el, layerId, { stroke: hex });
        const colorBtn = container.querySelector<HTMLButtonElement>(`.input-layer-color[data-layer-id="${layerId}"]`);
        if (colorBtn) colorBtn.style.backgroundColor = hex;
        callbacks.onUpdateElement(el);
      });
    });

    container.querySelectorAll<HTMLInputElement>('.input-layer-width').forEach((widthInput) => {
      widthInput.addEventListener('change', () => {
        const layerId = widthInput.getAttribute('data-layer-id');
        if (!layerId) return;
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const w = Math.max(0.1, parseFloat(widthInput.value) || 1);
        AppearanceStackManager.updateStrokeLayer(el, layerId, { strokeWidth: w });
        callbacks.onUpdateElement(el);
      });
    });

    container.querySelectorAll<HTMLInputElement>('.input-layer-dash').forEach((dashInput) => {
      dashInput.addEventListener('change', () => {
        const layerId = dashInput.getAttribute('data-layer-id');
        if (!layerId) return;
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        AppearanceStackManager.updateStrokeLayer(el, layerId, { strokeDash: dashInput.value.trim() });
        callbacks.onUpdateElement(el);
      });
    });
  }
}
