import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import { GlobalSwatch, GlobalSwatchManager } from '../../engine/color/GlobalSwatchManager.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import { I18nService } from '../../i18n/index.js';
import { ColorPickerPopover } from '../ColorPickerPopover.js';

/**
 * ARCHITECTURAL RATIONALE: Modular Swatch Palette Inspector (SwatchPaletteInspector)
 *
 * 1. Reactive Color Management:
 *    Renders the document's global swatches palette. Selecting a swatch assigns it
 *    to the active element's fill or stroke (binding data-fill-swatch or data-stroke-swatch).
 *    Modifying a global swatch's color instantly updates every vector in the document that references it.
 *
 * 2. Cascading Tints:
 *    Allows quick selection of tint levels (100%, 80%, 60%, 40%, 20%) calculated towards white,
 *    preserving tonal consistency across design systems.
 *
 * 3. Document Color Discovery:
 *    Provides one-click automated extraction of all distinct colors present across SVG paths into
 *    structured global swatches.
 */
export class SwatchPaletteInspector {
  private static currentTarget: 'fill' | 'stroke' = 'fill';

  public static renderHtml(model: VectorModel, el?: VectorElement | null): string {
    const swatches = model.swatches || [];
    const activeFillSwatch = el?.attributes['data-fill-swatch'] || '';
    const activeStrokeSwatch = el?.attributes['data-stroke-swatch'] || '';
    const activeFillTint = parseFloat(el?.attributes['data-fill-tint'] || '100') || 100;
    const activeStrokeTint = parseFloat(el?.attributes['data-stroke-tint'] || '100') || 100;

    const currentChannel = this.currentTarget;
    const boundSwatchId = currentChannel === 'fill' ? activeFillSwatch : activeStrokeSwatch;
    const currentTint = currentChannel === 'fill' ? activeFillTint : activeStrokeTint;

    return `
      <div class="panel-section" id="section-swatches" style="margin-top: 8px;">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>${I18nService.t('inspector.globalSwatches')}</span>
            <span class="badge" style="font-size:10px; color:#94a3b8; font-weight:normal;">${swatches.length}</span>
          </div>
          <div style="display:flex; gap:4px; align-items:center;">
            <button class="prop-input" id="btn-swatch-extract" style="cursor:pointer; width:auto; padding:1px 6px; font-size:10px; display:inline-flex; align-items:center; gap:3px;" title="${I18nService.t('inspector.extractTooltip')}">${ToolIcons.lightning} ${I18nService.t('inspector.extract')}</button>
            <button class="prop-input" id="btn-swatch-add" style="cursor:pointer; width:auto; padding:1px 6px; font-size:10px; color:#10b981; font-weight:600;" title="${I18nService.t('inspector.newSwatchTooltip')}">${I18nService.t('inspector.newSwatch')}</button>
          </div>
        </div>

        ${el ? `
        <div class="prop-row" style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span class="prop-label">${I18nService.t('inspector.assignTo')}</span>
          <div style="display:flex; gap:4px; flex:1;">
            <button class="prop-input ${currentChannel === 'fill' ? 'active' : ''}" id="btn-swatch-target-fill" style="flex:1; cursor:pointer; font-size:11px; font-weight:${currentChannel === 'fill' ? '600' : 'normal'}; ${currentChannel === 'fill' ? 'background:var(--accent-color); color:#fff;' : ''}">${I18nService.t('inspector.fill')}</button>
            <button class="prop-input ${currentChannel === 'stroke' ? 'active' : ''}" id="btn-swatch-target-stroke" style="flex:1; cursor:pointer; font-size:11px; font-weight:${currentChannel === 'stroke' ? '600' : 'normal'}; ${currentChannel === 'stroke' ? 'background:var(--accent-color); color:#fff;' : ''}">${I18nService.t('inspector.strokeLabel')}</button>
          </div>
        </div>
        ` : ''}

        <!-- Swatch Grid -->
        <div class="swatches-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(28px, 1fr)); gap:6px; padding:4px 0;">
          ${swatches.map((s) => {
            const isBound = s.id === boundSwatchId;
            return `
              <div class="swatch-chip" data-swatch-id="${s.id}" style="position:relative; width:28px; height:28px; border-radius:6px; background:${s.color}; cursor:pointer; border:${isBound ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)'}; box-shadow:${isBound ? '0 0 8px rgba(56,189,248,0.5)' : 'none'}; transition:transform 0.1s ease;" title="${s.name} (${s.color})">
                ${isBound ? '<div style="position:absolute; top:2px; right:2px; width:6px; height:6px; border-radius:50%; background:#38bdf8;"></div>' : ''}
              </div>
            `;
          }).join('')}
        </div>

        ${el && boundSwatchId ? `
        <!-- Tint Selector -->
        <div class="prop-row" style="margin-top:8px; display:flex; align-items:center; gap:6px;">
          <span class="prop-label" style="font-size:11px;">${I18nService.t('inspector.tint')}</span>
          <div style="display:flex; gap:3px; flex:1;">
            ${[100, 80, 60, 40, 20].map((t) => `
              <button type="button" class="prop-input btn-tint-pill ${currentTint === t ? 'active' : ''}" data-tint="${t}" style="flex:1; cursor:pointer; font-size:10px; padding:2px 0; text-align:center; ${currentTint === t ? 'background:var(--accent-color); color:#fff; font-weight:600;' : ''}">${t}%</button>
            `).join('')}
          </div>
          <button type="button" class="prop-input" id="btn-swatch-unlink" style="width:auto; cursor:pointer; font-size:10px; color:#ef4444; padding:2px 6px;" title="${I18nService.t('inspector.unlinkTooltip')}">${I18nService.t('inspector.unlink')}</button>
        </div>
        ` : ''}

        <!-- Inline Swatch Editor Popover Container -->
        <div id="swatch-editor-container" style="display:none; margin-top:8px; padding:8px; background:rgba(255,255,255,0.04); border:1px solid var(--border-color); border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:11px; font-weight:600;" id="swatch-editor-title">${I18nService.t('inspector.editSwatchTitle')}</span>
            <button type="button" id="btn-close-swatch-editor" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:12px; display:inline-flex; align-items:center;">${ToolIcons.close}</button>
          </div>
          <div class="prop-row">
            <span class="prop-label">${I18nService.t('common.name')}</span>
            <input type="text" class="prop-input" id="swatch-edit-name" style="flex:1;" />
          </div>
          <div class="prop-row">
            <span class="prop-label">${I18nService.t('common.color')}</span>
            <div style="display:flex; gap:4px; flex:1; align-items:center;">
              <button type="button" class="color-swatch" id="swatch-edit-color" style="background-color: #3b82f6;" title="${I18nService.t('common.color')}"></button>
              <input type="text" class="prop-input" id="swatch-edit-hex" style="flex:1;" />
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:6px;">
            <button type="button" class="prop-input" id="btn-delete-swatch" style="cursor:pointer; color:#ef4444; width:auto; padding:2px 8px; font-size:10.5px;">${I18nService.t('inspector.deleteSwatch')}</button>
            <button type="button" class="prop-input" id="btn-save-swatch" style="cursor:pointer; background:var(--accent-color); color:#fff; font-weight:600; width:auto; padding:2px 10px; font-size:10.5px;">${I18nService.t('inspector.saveSwatch')}</button>
          </div>
        </div>
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    model: VectorModel,
    el: VectorElement | null,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    // Channel switcher
    const btnTargetFill = container.querySelector<HTMLButtonElement>('#btn-swatch-target-fill');
    if (btnTargetFill) {
      btnTargetFill.addEventListener('click', () => {
        this.currentTarget = 'fill';
        onReRender();
      });
    }

    const btnTargetStroke = container.querySelector<HTMLButtonElement>('#btn-swatch-target-stroke');
    if (btnTargetStroke) {
      btnTargetStroke.addEventListener('click', () => {
        this.currentTarget = 'stroke';
        onReRender();
      });
    }

    // Assign swatch on click
    container.querySelectorAll<HTMLElement>('.swatch-chip').forEach((chip) => {
      const swatchId = chip.getAttribute('data-swatch-id');
      if (!swatchId) return;

      chip.addEventListener('click', (e) => {
        const swatch = model.swatches.find((s) => s.id === swatchId);
        if (!swatch) return;

        if (el) {
          if (callbacks.onPushUndo) callbacks.onPushUndo();
          const target = e.shiftKey ? 'stroke' : this.currentTarget;
          GlobalSwatchManager.assignSwatch(el, swatch, target, 100);
          callbacks.onUpdateElement(el);
          onReRender();
        } else {
          // If no element selected, open inline editor for this swatch
          openEditor(swatch);
        }
      });

      chip.addEventListener('dblclick', () => {
        const swatch = model.swatches.find((s) => s.id === swatchId);
        if (swatch) openEditor(swatch);
      });
    });

    // Tint buttons
    container.querySelectorAll<HTMLButtonElement>('.btn-tint-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!el) return;
        const tint = parseFloat(btn.getAttribute('data-tint') || '100') || 100;
        const swatchId = this.currentTarget === 'fill' ? el.attributes['data-fill-swatch'] : el.attributes['data-stroke-swatch'];
        const swatch = model.swatches.find((s) => s.id === swatchId);
        if (swatch) {
          if (callbacks.onPushUndo) callbacks.onPushUndo();
          GlobalSwatchManager.assignSwatch(el, swatch, this.currentTarget, tint);
          callbacks.onUpdateElement(el);
          onReRender();
        }
      });
    });

    // Unlink button
    const btnUnlink = container.querySelector<HTMLButtonElement>('#btn-swatch-unlink');
    if (btnUnlink && el) {
      btnUnlink.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        GlobalSwatchManager.unlinkSwatch(el, this.currentTarget);
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    // Extract colors from document
    const btnExtract = container.querySelector<HTMLButtonElement>('#btn-swatch-extract');
    if (btnExtract) {
      btnExtract.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        GlobalSwatchManager.extractColorsFromDocument(model);
        callbacks.syncMetadataToHost?.();
        onReRender();
      });
    }

    // Add new swatch
    const btnAdd = container.querySelector<HTMLButtonElement>('#btn-swatch-add');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        let defaultColor = '#3b82f6';
        if (el) {
          const colorAttr = this.currentTarget === 'fill' ? el.attributes.fill : el.attributes.stroke;
          if (colorAttr && colorAttr.startsWith('#')) defaultColor = colorAttr;
        }
        const id = `swatch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
        const newSwatch: GlobalSwatch = {
          id,
          name: `Muestra ${model.swatches.length + 1}`,
          color: defaultColor,
        };
        model.swatches.push(newSwatch);
        if (el) {
          GlobalSwatchManager.assignSwatch(el, newSwatch, this.currentTarget, 100);
          callbacks.onUpdateElement(el);
        }
        callbacks.syncMetadataToHost?.();
        onReRender();
      });
    }

    // Editor Popover
    const editorContainer = container.querySelector<HTMLElement>('#swatch-editor-container');
    const editName = container.querySelector<HTMLInputElement>('#swatch-edit-name');
    const editColor = container.querySelector<HTMLButtonElement>('#swatch-edit-color');
    const editHex = container.querySelector<HTMLInputElement>('#swatch-edit-hex');
    const btnCloseEditor = container.querySelector<HTMLButtonElement>('#btn-close-swatch-editor');
    const btnSaveSwatch = container.querySelector<HTMLButtonElement>('#btn-save-swatch');
    const btnDeleteSwatch = container.querySelector<HTMLButtonElement>('#btn-delete-swatch');

    let activeEditingSwatchId: string | null = null;

    const openEditor = (swatch: GlobalSwatch) => {
      if (!editorContainer || !editName || !editColor || !editHex) return;
      activeEditingSwatchId = swatch.id;
      editName.value = swatch.name;
      editColor.style.backgroundColor = swatch.color;
      editHex.value = swatch.color;
      editorContainer.style.display = 'block';
    };

    if (btnCloseEditor && editorContainer) {
      btnCloseEditor.addEventListener('click', () => {
        editorContainer.style.display = 'none';
        activeEditingSwatchId = null;
      });
    }

    if (editColor && editHex) {
      editColor.addEventListener('click', (e) => {
        e.stopPropagation();
        const initial = editHex.value || '#3b82f6';
        ColorPickerPopover.show({
          anchorEl: editColor,
          initialColor: initial.startsWith('#') ? initial : '#3b82f6',
          showAlpha: false,
          onChange: ({ hex }) => {
            editHex.value = hex;
            editColor.style.backgroundColor = hex;
          },
          onCommit: ({ hex }) => {
            editHex.value = hex;
            editColor.style.backgroundColor = hex;
          }
        });
      });
      editHex.addEventListener('change', () => {
        const val = editHex.value.trim();
        const hex = val.startsWith('#') ? val : `#${val}`;
        editColor.style.backgroundColor = hex;
        editHex.value = hex;
      });
    }

    if (btnSaveSwatch) {
      btnSaveSwatch.addEventListener('click', () => {
        if (!activeEditingSwatchId) return;
        const swatch = model.swatches.find((s) => s.id === activeEditingSwatchId);
        if (!swatch) return;

        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (editName) swatch.name = editName.value.trim() || swatch.name;
        const newColor = editHex ? editHex.value.trim() : swatch.color;

        // Cascade update across all elements referencing this swatch!
        GlobalSwatchManager.updateSwatchColor(model, swatch.id, newColor);

        if (el) callbacks.onUpdateElement(el);
        callbacks.syncMetadataToHost?.();
        if (editorContainer) editorContainer.style.display = 'none';
        onReRender();
      });
    }

    if (btnDeleteSwatch) {
      btnDeleteSwatch.addEventListener('click', () => {
        if (!activeEditingSwatchId) return;
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const idx = model.swatches.findIndex((s) => s.id === activeEditingSwatchId);
        if (idx >= 0) {
          model.swatches.splice(idx, 1);
        }
        // Unlink all elements referencing this swatch
        for (const item of model.elements) {
          if (item.attributes['data-fill-swatch'] === activeEditingSwatchId) {
            delete item.attributes['data-fill-swatch'];
            delete item.attributes['data-fill-tint'];
          }
          if (item.attributes['data-stroke-swatch'] === activeEditingSwatchId) {
            delete item.attributes['data-stroke-swatch'];
            delete item.attributes['data-stroke-tint'];
          }
        }
        if (el) callbacks.onUpdateElement(el);
        callbacks.syncMetadataToHost?.();
        if (editorContainer) editorContainer.style.display = 'none';
        onReRender();
      });
    }
  }
}
