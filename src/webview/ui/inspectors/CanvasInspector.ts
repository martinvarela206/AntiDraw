import { VectorModel } from '../../engine/VectorModel.js';
import { GridAlignmentMode } from '../../engine/CanvasManager.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { SwatchPaletteInspector } from './SwatchPaletteInspector.js';
import { I18nService } from '../../i18n/I18nService.js';

export interface ViewBoxPreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const VIEWBOX_PRESETS: ViewBoxPreset[] = [
  { id: 'custom', name: 'Personalizado', width: 0, height: 0 },
  { id: 'icon-16', name: 'Icono 16x16', width: 16, height: 16 },
  { id: 'icon-32', name: 'Icono 32x32', width: 32, height: 32 },
  { id: 'icon-64', name: 'Icono 64x64', width: 64, height: 64 },
  { id: 'icon-128', name: 'Icono 128x128', width: 128, height: 128 },
  { id: 'a5-72', name: 'A5 (con 72ppp)', width: 420, height: 595 },
  { id: 'a4-72', name: 'A4 (con 72ppp)', width: 595, height: 842 },
  { id: '1080p', name: '1080p', width: 1920, height: 1080 },
  { id: '1440p', name: '1440p', width: 2560, height: 1440 },
];

/**
 * ARCHITECTURAL RATIONALE: Mousedown Event Binding for Inspector Elements
 *
 * 1. Why mousedown instead of click:
 *    Click events are preceded by mousedown and mouseup. In vector editors, clicking on inspector buttons
 *    can cause input blurring, text deselection, or canvas focus shifts if mousedown is not intercepted.
 * 2. Calling e.preventDefault() on 'mousedown' suppresses document-level focus switching while
 *    e.stopPropagation() prevents the event from reaching canvas pointer listeners.
 */
export function bindInspectorMouseDown(container: HTMLElement, id: string, fn: () => void): void {
  const el = container.querySelector(`#${id}`);
  if (el) {
    el.addEventListener('mousedown', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }
}

/**
 * CanvasInspector
 *
 * Encapsulates the UI rendering, preset resolution, and event bindings for Canvas and ViewBox properties:
 * - Canvas & ViewBox dimensions and standard presets (Icon 16/32/64/128, A4, A5, 1080p, 1440p, Custom).
 * - Artboard frame bounding box (minX, minY, width, height, raw viewBox).
 * - Artboard background color with synchronized hex/picker inputs.
 * - Grid-Ruler alignment mode selector (Origin vs. Cell Center).
 */
export class CanvasInspector {
  public static render(
    container: HTMLElement,
    model: VectorModel,
    gridAlignmentMode: GridAlignmentMode,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const { canvas } = model;
    const vb = model.getViewBoxBounds();

    const currentW = Math.round(canvas.width);
    const currentH = Math.round(canvas.height);
    const matchedPreset = VIEWBOX_PRESETS.slice(1).find(
      (p) => p.width === currentW && p.height === currentH
    );
    const selectedPresetId = matchedPreset ? matchedPreset.id : 'custom';

    const isEs = I18nService.getLanguage() === 'es';

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('panels.canvasProps')}</div>
        <div class="prop-row">
          <span class="prop-label">Preset</span>
          <select class="prop-input" id="canvas-preset" style="cursor:pointer;">
            ${VIEWBOX_PRESETS.map(
              (p) =>
                `<option value="${p.id}" ${selectedPresetId === p.id ? 'selected' : ''}>${p.id === 'custom' ? I18nService.t('common.custom') : p.name}</option>`
            ).join('')}
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('common.width')}</span>
          <input type="number" class="prop-input" id="canvas-width" value="${canvas.width}" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="canvas-height" value="${canvas.height}" />
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('panels.viewboxScaling')}</div>
        <div class="prop-row">
          <span class="prop-label">X</span>
          <input type="number" class="prop-input" id="vb-minx" value="${vb.minX}" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="vb-miny" value="${vb.minY}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">W</span>
          <input type="number" class="prop-input" id="vb-width" value="${vb.width}" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="vb-height" value="${vb.height}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Raw</span>
          <input type="text" class="prop-input" id="canvas-viewbox" value="${canvas.viewBox}" title="${isEs ? 'Formato: minX minY width height' : 'Format: minX minY width height'}" />
        </div>
        <div class="prop-row">
          <span class="prop-label" title="${isEs ? 'preserveAspectRatio: Ajuste de relación de aspecto del viewBox' : 'preserveAspectRatio: ViewBox aspect ratio alignment'}">Aspect</span>
          <select class="prop-input" id="canvas-preserve-aspect" style="cursor:pointer;">
            <option value="none" ${canvas.preserveAspectRatio === 'none' ? 'selected' : ''}>none (${isEs ? 'Deformar' : 'Distort'})</option>
            <option value="xMidYMid meet" ${!canvas.preserveAspectRatio || canvas.preserveAspectRatio === 'xMidYMid meet' ? 'selected' : ''}>xMidYMid meet (${isEs ? 'Contener centrado' : 'Contain center'})</option>
            <option value="xMinYMin meet" ${canvas.preserveAspectRatio === 'xMinYMin meet' ? 'selected' : ''}>xMinYMin meet (${isEs ? 'Contener arriba-izq' : 'Contain top-left'})</option>
            <option value="xMaxYMax meet" ${canvas.preserveAspectRatio === 'xMaxYMax meet' ? 'selected' : ''}>xMaxYMax meet (${isEs ? 'Contener abajo-der' : 'Contain bottom-right'})</option>
            <option value="xMidYMid slice" ${canvas.preserveAspectRatio === 'xMidYMid slice' ? 'selected' : ''}>xMidYMid slice (${isEs ? 'Cubrir centrado' : 'Cover center'})</option>
            <option value="xMinYMin slice" ${canvas.preserveAspectRatio === 'xMinYMin slice' ? 'selected' : ''}>xMinYMin slice (${isEs ? 'Cubrir arriba-izq' : 'Cover top-left'})</option>
            <option value="xMaxYMax slice" ${canvas.preserveAspectRatio === 'xMaxYMax slice' ? 'selected' : ''}>xMaxYMax slice (${isEs ? 'Cubrir abajo-der' : 'Cover bottom-right'})</option>
          </select>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('panels.currentColorView')}</div>
        <div class="prop-row">
          <span class="prop-label" title="${isEs ? 'Color con el que se visualiza currentColor en el lienzo' : 'Preview color for currentColor on the canvas'}">${I18nService.t('common.color')}</span>
          <div class="color-picker-row" style="display:flex; gap:4px; align-items:center;">
            <input type="color" class="color-swatch" id="canvas-currentcolor-color" value="${canvas.currentColor || '#000000'}" />
            <input type="text" class="prop-input" id="canvas-currentcolor-hex" value="${canvas.currentColor || '#000000'}" style="flex:1;" />
            <button class="prop-input" id="btn-reset-canvas-currentcolor" style="width:26px; height:24px; padding:0; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="${isEs ? 'Restablecer a negro (#000000)' : 'Reset preview color to black (#000000)'}">⟲</button>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('panels.rootSvgAttrs')}</div>
        <div class="prop-row">
          <span class="prop-label" title="${I18nService.t('inspector.rootFillTooltip')}">${I18nService.t('inspector.rootFill')}</span>
          <input type="text" class="prop-input" id="canvas-svg-fill" value="${canvas.svgFill || ''}" placeholder="none, currentColor, #hex" />
        </div>
        <div class="prop-row">
          <span class="prop-label" title="${I18nService.t('inspector.rootStrokeTooltip')}">${I18nService.t('inspector.rootStroke')}</span>
          <input type="text" class="prop-input" id="canvas-svg-stroke" value="${canvas.svgStroke || ''}" placeholder="none, currentColor, #hex" />
        </div>
        <div class="prop-row">
          <span class="prop-label" title="${I18nService.t('inspector.rootWidthTooltip')}">${I18nService.t('inspector.rootWidth')}</span>
          <input type="number" class="prop-input" id="canvas-svg-strokewidth" value="${canvas.svgStrokeWidth || ''}" min="0" step="0.5" placeholder="1.5" />
        </div>
        <div class="prop-row">
          <span class="prop-label" title="${I18nService.t('inspector.linecapTooltip')}">${I18nService.t('inspector.linecap')}</span>
          <select class="prop-input" id="canvas-svg-linecap" style="cursor:pointer;">
            <option value="" ${!canvas.svgStrokeLinecap ? 'selected' : ''}>${I18nService.t('inspector.undefinedDefault')}</option>
            <option value="butt" ${canvas.svgStrokeLinecap === 'butt' ? 'selected' : ''}>butt</option>
            <option value="round" ${canvas.svgStrokeLinecap === 'round' ? 'selected' : ''}>round</option>
            <option value="square" ${canvas.svgStrokeLinecap === 'square' ? 'selected' : ''}>square</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label" title="${I18nService.t('inspector.linejoinTooltip')}">${I18nService.t('inspector.linejoin')}</span>
          <select class="prop-input" id="canvas-svg-linejoin" style="cursor:pointer;">
            <option value="" ${!canvas.svgStrokeLinejoin ? 'selected' : ''}>${I18nService.t('inspector.undefinedDefault')}</option>
            <option value="miter" ${canvas.svgStrokeLinejoin === 'miter' ? 'selected' : ''}>miter</option>
            <option value="round" ${canvas.svgStrokeLinejoin === 'round' ? 'selected' : ''}>round</option>
            <option value="bevel" ${canvas.svgStrokeLinejoin === 'bevel' ? 'selected' : ''}>bevel</option>
          </select>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('panels.artboardBackground')}</div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('common.color')}</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="canvas-bg-color" value="${canvas.backgroundColor && canvas.backgroundColor.startsWith('#') ? canvas.backgroundColor : '#ffffff'}" />
            <input type="text" class="prop-input" id="canvas-bg-hex" value="${canvas.backgroundColor || 'none'}" placeholder="${isEs ? 'none o #hex' : 'none or #hex'}" style="flex:1;" />
            <button class="prop-input ${canvas.backgroundColor === 'none' || !canvas.backgroundColor ? 'active' : ''}" id="btn-canvas-bg-none" style="cursor:pointer; width:auto; padding:2px 6px; font-size:10px; font-weight:600;" title="${isEs ? 'Quitar color de fondo (transparente)' : 'Remove background color (transparent)'}">${isEs ? 'Sin fondo' : 'No background'}</button>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.gridAlignment')}</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input ${gridAlignmentMode === 'origin' ? 'active' : ''}" id="btn-canvas-grid-align-origin" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="${I18nService.t('statusbar.gridAlignOriginTooltip')}">
            ${I18nService.t('inspector.gridAlignOriginCanvas')}
          </button>
          <button class="prop-input ${gridAlignmentMode === 'cell-center' ? 'active' : ''}" id="btn-canvas-grid-align-center" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="${I18nService.t('statusbar.gridAlignCenterTooltip')}">
            ${I18nService.t('inspector.gridAlignCenterCanvas')}
          </button>
        </div>
      </div>

      ${SwatchPaletteInspector.renderHtml(model, null)}
    `;

    const presetSelect = container.querySelector<HTMLSelectElement>('#canvas-preset');
    const widthInput = container.querySelector<HTMLInputElement>('#canvas-width');
    const heightInput = container.querySelector<HTMLInputElement>('#canvas-height');
    const vbMinX = container.querySelector<HTMLInputElement>('#vb-minx');
    const vbMinY = container.querySelector<HTMLInputElement>('#vb-miny');
    const vbWidth = container.querySelector<HTMLInputElement>('#vb-width');
    const vbHeight = container.querySelector<HTMLInputElement>('#vb-height');
    const viewBoxInput = container.querySelector<HTMLInputElement>('#canvas-viewbox');
    const preserveAspectInput = container.querySelector<HTMLSelectElement>('#canvas-preserve-aspect');
    const ccColor = container.querySelector<HTMLInputElement>('#canvas-currentcolor-color');
    const ccHex = container.querySelector<HTMLInputElement>('#canvas-currentcolor-hex');
    const btnResetCc = container.querySelector<HTMLButtonElement>('#btn-reset-canvas-currentcolor');
    const svgFillInput = container.querySelector<HTMLInputElement>('#canvas-svg-fill');
    const svgStrokeInput = container.querySelector<HTMLInputElement>('#canvas-svg-stroke');
    const svgStrokeWidthInput = container.querySelector<HTMLInputElement>('#canvas-svg-strokewidth');
    const svgLinecapInput = container.querySelector<HTMLSelectElement>('#canvas-svg-linecap');
    const svgLinejoinInput = container.querySelector<HTMLSelectElement>('#canvas-svg-linejoin');
    const bgColor = container.querySelector<HTMLInputElement>('#canvas-bg-color');
    const bgHex = container.querySelector<HTMLInputElement>('#canvas-bg-hex');

    const syncVbFromNumbers = () => {
      const minX = parseFloat(vbMinX?.value || '0') || 0;
      const minY = parseFloat(vbMinY?.value || '0') || 0;
      const w = parseFloat(vbWidth?.value || '800') || 800;
      const h = parseFloat(vbHeight?.value || '600') || 600;
      model.setViewBoxBounds(minX, minY, w, h);
      if (viewBoxInput) viewBoxInput.value = model.canvas.viewBox;
      callbacks.onUpdateCanvas();
    };

    const checkPresetOrCustom = () => {
      if (presetSelect) {
        const w = parseFloat(widthInput?.value || vbWidth?.value || '0');
        const h = parseFloat(heightInput?.value || vbHeight?.value || '0');
        const found = VIEWBOX_PRESETS.slice(1).find((p) => p.width === w && p.height === h);
        presetSelect.value = found ? found.id : 'custom';
      }
    };

    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const val = presetSelect.value;
        const preset = VIEWBOX_PRESETS.find((p) => p.id === val);
        if (preset && preset.id !== 'custom') {
          model.canvas.width = preset.width;
          model.canvas.height = preset.height;
          const curVb = model.getViewBoxBounds();
          model.setViewBoxBounds(curVb.minX, curVb.minY, preset.width, preset.height);
          if (widthInput) widthInput.value = preset.width.toString();
          if (heightInput) heightInput.value = preset.height.toString();
          if (vbWidth) vbWidth.value = preset.width.toString();
          if (vbHeight) vbHeight.value = preset.height.toString();
          if (viewBoxInput) viewBoxInput.value = model.canvas.viewBox;
          callbacks.onUpdateCanvas();
        }
      });
    }

    if (widthInput) {
      widthInput.addEventListener('input', checkPresetOrCustom);
      widthInput.addEventListener('change', () => {
        checkPresetOrCustom();
        const newW = parseFloat(widthInput.value) || 800;
        model.canvas.width = newW;
        const curVb = model.getViewBoxBounds();
        model.setViewBoxBounds(curVb.minX, curVb.minY, newW, curVb.height);
        if (vbWidth) vbWidth.value = newW.toString();
        if (viewBoxInput) viewBoxInput.value = model.canvas.viewBox;
        callbacks.onUpdateCanvas();
      });
    }

    if (heightInput) {
      heightInput.addEventListener('input', checkPresetOrCustom);
      heightInput.addEventListener('change', () => {
        checkPresetOrCustom();
        const newH = parseFloat(heightInput.value) || 600;
        model.canvas.height = newH;
        const curVb = model.getViewBoxBounds();
        model.setViewBoxBounds(curVb.minX, curVb.minY, curVb.width, newH);
        if (vbHeight) vbHeight.value = newH.toString();
        if (viewBoxInput) viewBoxInput.value = model.canvas.viewBox;
        callbacks.onUpdateCanvas();
      });
    }

    if (vbMinX) vbMinX.addEventListener('change', syncVbFromNumbers);
    if (vbMinY) vbMinY.addEventListener('change', syncVbFromNumbers);

    if (vbWidth) {
      vbWidth.addEventListener('input', () => {
        if (widthInput) widthInput.value = vbWidth.value;
        checkPresetOrCustom();
      });
      vbWidth.addEventListener('change', () => {
        if (widthInput) widthInput.value = vbWidth.value;
        model.canvas.width = parseFloat(vbWidth.value) || 800;
        checkPresetOrCustom();
        syncVbFromNumbers();
      });
    }

    if (vbHeight) {
      vbHeight.addEventListener('input', () => {
        if (heightInput) heightInput.value = vbHeight.value;
        checkPresetOrCustom();
      });
      vbHeight.addEventListener('change', () => {
        if (heightInput) heightInput.value = vbHeight.value;
        model.canvas.height = parseFloat(vbHeight.value) || 600;
        checkPresetOrCustom();
        syncVbFromNumbers();
      });
    }

    if (viewBoxInput) {
      viewBoxInput.addEventListener('change', () => {
        model.canvas.viewBox = viewBoxInput.value.trim();
        const updatedVb = model.getViewBoxBounds();
        if (vbMinX) vbMinX.value = updatedVb.minX.toString();
        if (vbMinY) vbMinY.value = updatedVb.minY.toString();
        if (vbWidth) vbWidth.value = updatedVb.width.toString();
        if (vbHeight) vbHeight.value = updatedVb.height.toString();
        checkPresetOrCustom();
        callbacks.onUpdateCanvas();
      });
    }

    if (preserveAspectInput) {
      preserveAspectInput.addEventListener('change', () => {
        model.canvas.preserveAspectRatio = preserveAspectInput.value;
        callbacks.onUpdateCanvas();
        onReRender();
      });
    }

    const updateCurrentColor = (val: string) => {
      model.canvas.currentColor = val;
      if (ccColor) ccColor.value = val.startsWith('#') ? val : '#000000';
      if (ccHex) ccHex.value = val;
      callbacks.syncMetadataToHost?.();
      callbacks.onUpdateCanvas();
      onReRender();
    };

    if (ccColor) {
      ccColor.addEventListener('input', () => updateCurrentColor(ccColor.value));
    }
    if (ccHex) {
      ccHex.addEventListener('change', () => {
        const v = ccHex.value.trim();
        updateCurrentColor(v.startsWith('#') ? v : `#${v}`);
      });
    }
    if (btnResetCc) {
      btnResetCc.addEventListener('click', () => updateCurrentColor('#000000'));
    }

    if (svgFillInput) {
      svgFillInput.addEventListener('change', () => {
        model.canvas.svgFill = svgFillInput.value.trim();
        callbacks.onUpdateCanvas();
      });
    }
    if (svgStrokeInput) {
      svgStrokeInput.addEventListener('change', () => {
        model.canvas.svgStroke = svgStrokeInput.value.trim();
        callbacks.onUpdateCanvas();
      });
    }
    if (svgStrokeWidthInput) {
      svgStrokeWidthInput.addEventListener('change', () => {
        model.canvas.svgStrokeWidth = svgStrokeWidthInput.value.trim();
        callbacks.onUpdateCanvas();
      });
    }
    if (svgLinecapInput) {
      svgLinecapInput.addEventListener('change', () => {
        model.canvas.svgStrokeLinecap = svgLinecapInput.value;
        callbacks.onUpdateCanvas();
      });
    }
    if (svgLinejoinInput) {
      svgLinejoinInput.addEventListener('change', () => {
        model.canvas.svgStrokeLinejoin = svgLinejoinInput.value;
        callbacks.onUpdateCanvas();
      });
    }

    const btnBgNone = container.querySelector<HTMLButtonElement>('#btn-canvas-bg-none');
    if (btnBgNone) {
      btnBgNone.addEventListener('click', () => {
        model.canvas.backgroundColor = 'none';
        if (bgHex) bgHex.value = 'none';
        callbacks.onUpdateCanvas();
      });
    }

    if (bgColor) {
      bgColor.addEventListener('input', () => {
        model.canvas.backgroundColor = bgColor.value;
        if (bgHex) bgHex.value = bgColor.value;
        callbacks.onUpdateCanvas();
      });
    }
    if (bgHex) {
      bgHex.addEventListener('change', () => {
        const val = bgHex.value.trim();
        model.canvas.backgroundColor = val;
        if (bgColor && val.startsWith('#')) bgColor.value = val;
        callbacks.onUpdateCanvas();
      });
    }

    bindInspectorMouseDown(container, 'btn-canvas-grid-align-origin', () => {
      if (callbacks.onGridAlignmentChange) callbacks.onGridAlignmentChange('origin');
      onReRender();
    });
    bindInspectorMouseDown(container, 'btn-canvas-grid-align-center', () => {
      if (callbacks.onGridAlignmentChange) callbacks.onGridAlignmentChange('cell-center');
      onReRender();
    });

    SwatchPaletteInspector.bindEvents(container, model, null, callbacks, onReRender);
  }
}
