import { VectorModel } from '../../engine/VectorModel.js';
import { GridAlignmentMode } from '../../engine/CanvasManager.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

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

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Canvas &amp; ViewBox Size</div>
        <div class="prop-row">
          <span class="prop-label">Preset</span>
          <select class="prop-input" id="canvas-preset" style="cursor:pointer;">
            ${VIEWBOX_PRESETS.map(
              (p) =>
                `<option value="${p.id}" ${selectedPresetId === p.id ? 'selected' : ''}>${p.name}</option>`
            ).join('')}
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="canvas-width" value="${canvas.width}" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="canvas-height" value="${canvas.height}" />
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">ViewBox (Artboard Frame)</div>
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
          <input type="text" class="prop-input" id="canvas-viewbox" value="${canvas.viewBox}" title="Format: minX minY width height" />
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Artboard Background</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="canvas-bg-color" value="${canvas.backgroundColor}" />
            <input type="text" class="prop-input" id="canvas-bg-hex" value="${canvas.backgroundColor}" />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Grid-Ruler Alignment</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input ${gridAlignmentMode === 'origin' ? 'active' : ''}" id="btn-canvas-grid-align-origin" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo A: Línea o cruce de grilla coincidente con (0, 0)">
            ┼ Línea en (0, 0)
          </button>
          <button class="prop-input ${gridAlignmentMode === 'cell-center' ? 'active' : ''}" id="btn-canvas-grid-align-center" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo B: Centro de la celda virtual coincidente con (0, 0)">
            ◫ Celda en (0, 0)
          </button>
        </div>
      </div>
    `;

    const presetSelect = container.querySelector<HTMLSelectElement>('#canvas-preset');
    const widthInput = container.querySelector<HTMLInputElement>('#canvas-width');
    const heightInput = container.querySelector<HTMLInputElement>('#canvas-height');
    const vbMinX = container.querySelector<HTMLInputElement>('#vb-minx');
    const vbMinY = container.querySelector<HTMLInputElement>('#vb-miny');
    const vbWidth = container.querySelector<HTMLInputElement>('#vb-width');
    const vbHeight = container.querySelector<HTMLInputElement>('#vb-height');
    const viewBoxInput = container.querySelector<HTMLInputElement>('#canvas-viewbox');
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

    if (bgColor) {
      bgColor.addEventListener('input', () => {
        model.canvas.backgroundColor = bgColor.value;
        if (bgHex) bgHex.value = bgColor.value;
        callbacks.onUpdateCanvas();
      });
    }
    if (bgHex) {
      bgHex.addEventListener('change', () => {
        model.canvas.backgroundColor = bgHex.value;
        if (bgColor) bgColor.value = bgHex.value;
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
  }
}
