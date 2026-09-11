import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import { SelectionTool } from '../../engine/SelectionTool.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { degreesToMiterLimit } from './AppearanceInspector.js';

/**
 * MultiSelectionInspector
 *
 * Encapsulates the UI rendering and interactive event handlers when multiple vector
 * elements are selected simultaneously:
 * 1. Multiple Selection statistics (vector count, aggregate node count).
 * 2. Group Transformation & Pivot controls (scale mode vs rotate mode, group pivot coordinates X/Y, reset pivot).
 * 3. Batch Fill styling across all closed elements.
 * 4. Batch Stroke styling (color, width, linejoin, miter limit angle in degrees).
 * 5. Boolean Operations dispatch (union, subtract, intersect, exclude, combine, fragment).
 */
export class MultiSelectionInspector {
  public static render(
    container: HTMLElement,
    elements: VectorElement[],
    model: VectorModel,
    selectionTool: SelectionTool,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const groupBox = selectionTool.getGroupSelectionBoundingBox(elements);
    const multiPivot = groupBox ? selectionTool.getPivot(groupBox) : { x: 0, y: 0 };
    const hasClosedElements = elements.some((el) => model.isElementClosed(el));

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Multiple Selection</div>
        <div class="prop-row">
          <span class="prop-label">Selected</span>
          <span style="font-weight:600; color:var(--text-main);">${elements.length} vectors</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Total Nodes</span>
          <span style="font-weight:600; color:var(--text-main);">${elements.reduce((acc, curr) => acc + (curr.vertices ? curr.vertices.length : 0), 0)} nodes</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Transform (Group)</div>
        <div class="prop-row">
          <span class="prop-label">Modo</span>
          <div style="display:flex; gap:4px; flex:1;">
            <button class="prop-input" id="btn-multi-mode-transform" style="flex:1; cursor:pointer; font-weight:600; ${selectionTool.selectionMode === 'transform' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Mover y Redimensionar: muestra tiradores de escala y anclaje magnético por proximidad">⤢ Escalar</button>
            <button class="prop-input" id="btn-multi-mode-rotate" style="flex:1; cursor:pointer; font-weight:600; ${selectionTool.selectionMode === 'rotate' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Rotación: muestra tiradores de giro y permite reubicar libremente el centro de rotación">↻ Rotar</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Pivot</span>
          <input type="number" class="prop-input" id="multi-pivot-x" value="${Math.round(multiPivot.x)}" title="Coordenada X del pivote de rotación grupal" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="multi-pivot-y" value="${Math.round(multiPivot.y)}" title="Coordenada Y del pivote de rotación grupal" />
          <button class="prop-input" id="btn-multi-reset-pivot" style="width:auto; padding:2px 8px; cursor:pointer;" title="Restablecer pivote al centro de la selección">⟲</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Batch Fill</span>
          ${!hasClosedElements ? '<span style="font-size:10px; color:#94a3b8; font-weight:normal; text-transform:none;">(Solo elementos cerrados)</span>' : ''}
        </div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="batch-fill-color" value="#4f46e5" ${!hasClosedElements ? 'disabled' : ''} />
            <input type="text" class="prop-input" id="batch-fill-hex" value="#4f46e5" ${!hasClosedElements ? 'disabled style="opacity:0.6; cursor:not-allowed;" title="Ningún elemento seleccionado es un trazado cerrado"' : ''} />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Batch Stroke</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="batch-stroke-color" value="#000000" />
            <input type="text" class="prop-input" id="batch-stroke-hex" value="#000000" />
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="batch-stroke-width" value="1" min="0" step="0.5" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Join</span>
          <div style="display:flex; gap:4px; flex:1; align-items:center;">
            <select class="prop-input" id="batch-stroke-join" style="cursor:pointer; flex:1;">
              <option value="miter">Miter</option>
              <option value="round">Round</option>
              <option value="bevel">Bevel</option>
            </select>
            <div id="container-batch-stroke-miterlimit" style="display:flex; align-items:center; gap:2px; width:65px;" title="Ángulo mínimo de inglete en grados (°): esquinas más agudas que este valor se cortan a bisel">
              <input type="number" class="prop-input" id="batch-stroke-miter-angle" value="29" min="1" max="170" step="1" style="width:45px; padding:2px 4px; text-align:right;" />
              <span style="font-size:11px; color:var(--text-muted); font-weight:600;">°</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Boolean Operations (Formas)</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 6px; flex-wrap: wrap;">
          <button class="btn-icon" id="btn-prop-bool-union" title="Weld / Union (Soldar formas)">${ToolIcons.union}</button>
          <button class="btn-icon" id="btn-prop-bool-subtract" title="Trim / Minus (1° corta al último, conserva cortador)">${ToolIcons.subtract}</button>
          <button class="btn-icon" id="btn-prop-bool-intersect" title="Intersect (Intersección)">${ToolIcons.intersect}</button>
          <button class="btn-icon" id="btn-prop-bool-exclude" title="Exclusion / XOR (Exclusión)">${ToolIcons.exclude}</button>
          <button class="btn-icon" id="btn-prop-bool-combine" title="Boundary / Combine (Unir conservando originales)">${ToolIcons.combine}</button>
          <button class="btn-icon" id="btn-prop-bool-fragment" title="Divide / Fragment (Intersección y exclusión a la vez)">${ToolIcons.fragment}</button>
        </div>
      </div>
    `;

    const bFillColor = container.querySelector<HTMLInputElement>('#batch-fill-color');
    const bFillHex = container.querySelector<HTMLInputElement>('#batch-fill-hex');
    const bStrokeColor = container.querySelector<HTMLInputElement>('#batch-stroke-color');
    const bStrokeHex = container.querySelector<HTMLInputElement>('#batch-stroke-hex');
    const bStrokeWidth = container.querySelector<HTMLInputElement>('#batch-stroke-width');
    const bStrokeJoin = container.querySelector<HTMLSelectElement>('#batch-stroke-join');

    bindInspectorMouseDown(container, 'btn-prop-bool-union', () => callbacks.onBoolean && callbacks.onBoolean('union'));
    bindInspectorMouseDown(container, 'btn-prop-bool-subtract', () => callbacks.onBoolean && callbacks.onBoolean('subtract'));
    bindInspectorMouseDown(container, 'btn-prop-bool-intersect', () => callbacks.onBoolean && callbacks.onBoolean('intersect'));
    bindInspectorMouseDown(container, 'btn-prop-bool-exclude', () => callbacks.onBoolean && callbacks.onBoolean('exclude'));
    bindInspectorMouseDown(container, 'btn-prop-bool-combine', () => callbacks.onBoolean && callbacks.onBoolean('combine'));
    bindInspectorMouseDown(container, 'btn-prop-bool-fragment', () => callbacks.onBoolean && callbacks.onBoolean('fragment'));

    if (bFillColor) {
      bFillColor.addEventListener('input', () => {
        elements.forEach((el) => {
          if (model.isElementClosed(el)) {
            el.attributes['fill'] = bFillColor.value;
          } else {
            el.attributes['fill'] = 'none';
          }
        });
        if (bFillHex) bFillHex.value = bFillColor.value;
        callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bFillHex) {
      bFillHex.addEventListener('change', () => {
        elements.forEach((el) => {
          if (model.isElementClosed(el)) {
            el.attributes['fill'] = bFillHex.value;
          } else {
            el.attributes['fill'] = 'none';
          }
        });
        if (bFillColor) bFillColor.value = bFillHex.value;
        callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeColor) {
      bStrokeColor.addEventListener('input', () => {
        elements.forEach((el) => { el.attributes['stroke'] = bStrokeColor.value; });
        if (bStrokeHex) bStrokeHex.value = bStrokeColor.value;
        callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeHex) {
      bStrokeHex.addEventListener('change', () => {
        elements.forEach((el) => { el.attributes['stroke'] = bStrokeHex.value; });
        if (bStrokeColor) bStrokeColor.value = bStrokeHex.value;
        callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeWidth) {
      bStrokeWidth.addEventListener('input', () => {
        elements.forEach((el) => { el.attributes['stroke-width'] = bStrokeWidth.value; });
        callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeJoin) {
      bStrokeJoin.addEventListener('change', () => {
        elements.forEach((el) => { el.attributes['stroke-linejoin'] = bStrokeJoin.value; });
        const containerMiter = container.querySelector<HTMLElement>('#container-batch-stroke-miterlimit');
        if (containerMiter) containerMiter.style.display = bStrokeJoin.value === 'miter' ? 'flex' : 'none';
        callbacks.onUpdateElement(elements[0]);
      });
    }
    const bStrokeMiterAngle = container.querySelector<HTMLInputElement>('#batch-stroke-miter-angle');
    if (bStrokeMiterAngle) {
      const applyBatchMiterAngle = () => {
        const deg = Math.max(1, Math.min(170, parseFloat(bStrokeMiterAngle.value) || 29));
        const limit = degreesToMiterLimit(deg);
        elements.forEach((el) => { el.attributes['stroke-miterlimit'] = limit.toString(); });
        callbacks.onUpdateElement(elements[0]);
      };
      bStrokeMiterAngle.addEventListener('input', applyBatchMiterAngle);
      bStrokeMiterAngle.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyBatchMiterAngle();
      });
    }

    const multiPivotX = container.querySelector<HTMLInputElement>('#multi-pivot-x');
    const multiPivotY = container.querySelector<HTMLInputElement>('#multi-pivot-y');
    const btnMultiResetPivot = container.querySelector<HTMLButtonElement>('#btn-multi-reset-pivot');

    if (multiPivotX && multiPivotY && groupBox) {
      const applyMultiPivot = () => {
        const px = parseFloat(multiPivotX.value);
        const py = parseFloat(multiPivotY.value);
        if (!isNaN(px) && !isNaN(py)) {
          selectionTool.customPivot = { x: px, y: py };
          callbacks.onRenderOverlay?.();
        }
      };
      multiPivotX.addEventListener('input', applyMultiPivot);
      multiPivotY.addEventListener('input', applyMultiPivot);
    }

    if (btnMultiResetPivot && groupBox) {
      btnMultiResetPivot.addEventListener('click', () => {
        selectionTool.resetPivot();
        if (multiPivotX) multiPivotX.value = String(Math.round(groupBox.cx));
        if (multiPivotY) multiPivotY.value = String(Math.round(groupBox.cy));
        callbacks.onRenderOverlay?.();
      });
    }

    const btnMultiModeTransform = container.querySelector<HTMLButtonElement>('#btn-multi-mode-transform');
    const btnMultiModeRotate = container.querySelector<HTMLButtonElement>('#btn-multi-mode-rotate');
    btnMultiModeTransform?.addEventListener('click', () => {
      selectionTool.selectionMode = 'transform';
      callbacks.onRenderOverlay?.();
      onReRender();
    });
    btnMultiModeRotate?.addEventListener('click', () => {
      selectionTool.selectionMode = 'rotate';
      callbacks.onRenderOverlay?.();
      onReRender();
    });
  }
}
