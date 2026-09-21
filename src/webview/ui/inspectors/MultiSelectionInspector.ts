import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import { SelectionTool } from '../../engine/SelectionTool.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { degreesToMiterLimit } from './AppearanceInspector.js';
import { DistortInspectorControls } from './DistortInspectorControls.js';

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

    const firstOp = elements[0]?.attributes['opacity'] !== undefined ? parseFloat(elements[0].attributes['opacity']) : 1;
    const allSameOpacity = elements.every((el) => {
      const op = el.attributes['opacity'] !== undefined ? parseFloat(el.attributes['opacity']) : 1;
      return Math.abs(op - firstOp) < 0.01;
    });
    const multiOpacityPct = allSameOpacity ? Math.round(Math.max(0, Math.min(1, isNaN(firstOp) ? 1 : firstOp)) * 100) : 100;

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
            <button class="prop-input" id="btn-multi-mode-move" style="flex:1; cursor:pointer; font-weight:600; padding:4px; ${selectionTool.selectionMode === 'move' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Mover: Mover elementos y anclar vértices">✛ Mover</button>
            <button class="prop-input" id="btn-multi-mode-scale" style="flex:1; cursor:pointer; font-weight:600; padding:4px; ${selectionTool.selectionMode === 'scale' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Escalar: Redimensionar con 8 tiradores">⤡ Escalar</button>
            <button class="prop-input" id="btn-multi-mode-rotate" style="flex:1; cursor:pointer; font-weight:600; padding:4px; ${selectionTool.selectionMode === 'rotate' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Rotación: muestra tiradores de giro y permite reubicar libremente el centro de rotación">↻ Rotar</button>
            <button class="prop-input" id="btn-multi-mode-distort" style="flex:1; cursor:pointer; font-weight:600; padding:4px; ${selectionTool.selectionMode === 'distort' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Deformar: Deformación libre de esquinas y cizalla grupal">▱ Deformar</button>
          </div>
        </div>
        <div class="prop-row" style="margin-top:2px;">
          <span class="prop-label" style="font-size:11px;">Escalar</span>
          <div style="display:flex; gap:6px; flex:1; align-items:center;">
            <button class="prop-input" id="btn-multi-lock-scale-stroke" style="flex:1; padding:2px 4px; display:flex; justify-content:center; align-items:center; gap:4px; cursor:pointer; font-size:11px; ${selectionTool.scaleStroke ? 'background:var(--accent-color); color:#ffffff;' : 'background:transparent;'} border:1px solid var(--border-color);" title="Escalar grosor de trazo proporcionalmente al redimensionar (candado cerrado = escala, abierto = fijo)">${selectionTool.scaleStroke ? '🔒' : '🔓'} Trazo</button>
            <button class="prop-input" id="btn-multi-lock-scale-corners" style="flex:1; padding:2px 4px; display:flex; justify-content:center; align-items:center; gap:4px; cursor:pointer; font-size:11px; ${selectionTool.scaleCorners ? 'background:var(--accent-color); color:#ffffff;' : 'background:transparent;'} border:1px solid var(--border-color);" title="Escalar radios de esquinas paramétricas proporcionalmente al redimensionar (candado cerrado = escala, abierto = fijo)">${selectionTool.scaleCorners ? '🔒' : '🔓'} Esquinas</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Pivot</span>
          <input type="number" class="prop-input" id="multi-pivot-x" value="${Math.round(multiPivot.x)}" title="Coordenada X del pivote de rotación grupal" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="multi-pivot-y" value="${Math.round(multiPivot.y)}" title="Coordenada Y del pivote de rotación grupal" />
          <button class="prop-input" id="btn-multi-reset-pivot" style="width:auto; padding:2px 8px; cursor:pointer;" title="Restablecer pivote al centro de la selección">⟲</button>
        </div>
        <div class="prop-row">
          <span class="prop-label">Opacity</span>
          <input type="range" class="prop-input" id="multi-opacity-slider" min="0" max="100" step="1" value="${multiOpacityPct}" style="flex:1; cursor:pointer; margin:0 4px;" title="Opacidad de los elementos seleccionados (0% a 100%)" />
          <div style="display:flex; align-items:center; gap:2px; width:54px;">
            <input type="number" class="prop-input" id="multi-opacity" min="0" max="100" step="1" value="${multiOpacityPct}" style="width:36px; padding:2px 4px; text-align:right;" title="Porcentaje de opacidad grupal (0 - 100)" />
            <span style="font-size:11px; color:var(--text-muted); font-weight:600;">%</span>
          </div>
        </div>
        ${groupBox ? DistortInspectorControls.renderHtml(selectionTool, groupBox.x, groupBox.y, groupBox.width, groupBox.height, 'multi-') : ''}
      </div>

      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Batch Fill</span>
          <div style="display:flex; gap:4px; align-items:center;">
            <button class="prop-input" id="btn-batch-add-fill" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#10b981; font-weight:600;" title="Añadir relleno a todos los elementos seleccionados">+ Añadir</button>
            <button class="prop-input" id="btn-batch-remove-fill" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#ef4444;" title="Quitar relleno de todos los elementos seleccionados (fill='none')">− Quitar</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="batch-fill-color" value="#4f46e5" />
            <input type="text" class="prop-input" id="batch-fill-hex" value="#4f46e5" />
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

    const btnBatchAddFill = container.querySelector<HTMLButtonElement>('#btn-batch-add-fill');
    const btnBatchRemoveFill = container.querySelector<HTMLButtonElement>('#btn-batch-remove-fill');

    if (btnBatchAddFill) {
      btnBatchAddFill.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const col = bFillHex?.value || '#4f46e5';
        elements.forEach((el) => {
          if (!model.isElementClosed(el) && el.vertices && el.vertices.length > 2) {
            el.isClosed = true;
            el.attributes.d = model.compilePathD(el.vertices, true);
          }
          el.attributes['fill'] = col;
          delete el.attributes['data-gradient'];
        });
        callbacks.onUpdateElement(elements[0]);
        onReRender();
      });
    }

    if (btnBatchRemoveFill) {
      btnBatchRemoveFill.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        elements.forEach((el) => {
          el.attributes['fill'] = 'none';
          delete el.attributes['data-gradient'];
        });
        callbacks.onUpdateElement(elements[0]);
        onReRender();
      });
    }

    if (bFillColor) {
      bFillColor.addEventListener('input', () => {
        elements.forEach((el) => {
          if (!model.isElementClosed(el) && el.vertices && el.vertices.length > 2) {
            el.isClosed = true;
            el.attributes.d = model.compilePathD(el.vertices, true);
          }
          el.attributes['fill'] = bFillColor.value;
          delete el.attributes['data-gradient'];
        });
        if (bFillHex) bFillHex.value = bFillColor.value;
        callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bFillHex) {
      bFillHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        elements.forEach((el) => {
          if (!model.isElementClosed(el) && el.vertices && el.vertices.length > 2) {
            el.isClosed = true;
            el.attributes.d = model.compilePathD(el.vertices, true);
          }
          el.attributes['fill'] = bFillHex.value;
          delete el.attributes['data-gradient'];
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

    const btnMultiModeMove = container.querySelector<HTMLButtonElement>('#btn-multi-mode-move');
    const btnMultiModeScale = container.querySelector<HTMLButtonElement>('#btn-multi-mode-scale');
    const btnMultiModeRotate = container.querySelector<HTMLButtonElement>('#btn-multi-mode-rotate');
    const btnMultiModeDistort = container.querySelector<HTMLButtonElement>('#btn-multi-mode-distort');
    btnMultiModeMove?.addEventListener('click', () => {
      selectionTool.selectionMode = 'move';
      callbacks.onRenderOverlay?.();
      onReRender();
    });
    btnMultiModeScale?.addEventListener('click', () => {
      selectionTool.selectionMode = 'scale';
      callbacks.onRenderOverlay?.();
      onReRender();
    });
    btnMultiModeRotate?.addEventListener('click', () => {
      selectionTool.selectionMode = 'rotate';
      callbacks.onRenderOverlay?.();
      onReRender();
    });
    btnMultiModeDistort?.addEventListener('click', () => {
      selectionTool.selectionMode = 'distort';
      callbacks.onRenderOverlay?.();
      onReRender();
    });

    const multiOpacity = container.querySelector<HTMLInputElement>('#multi-opacity');
    const multiOpacitySlider = container.querySelector<HTMLInputElement>('#multi-opacity-slider');
    if (multiOpacity && multiOpacitySlider) {
      multiOpacitySlider.addEventListener('input', () => {
        const val = Math.max(0, Math.min(100, Math.round(parseFloat(multiOpacitySlider.value) || 0)));
        multiOpacity.value = val.toString();
        const strVal = val === 100 ? '1' : (val / 100).toString();
        elements.forEach((el) => {
          el.attributes['opacity'] = strVal;
          const svgEl = document.getElementById(el.id);
          if (svgEl) {
            if (val === 100) svgEl.removeAttribute('opacity');
            else svgEl.setAttribute('opacity', strVal);
          }
        });
      });
      multiOpacitySlider.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        callbacks.onUpdateElement(elements[0]);
      });
      multiOpacity.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const val = Math.max(0, Math.min(100, Math.round(parseFloat(multiOpacity.value) || 0)));
        multiOpacity.value = val.toString();
        multiOpacitySlider.value = val.toString();
        const strVal = val === 100 ? '1' : (val / 100).toString();
        elements.forEach((el) => {
          el.attributes['opacity'] = strVal;
          const svgEl = document.getElementById(el.id);
          if (svgEl) {
            if (val === 100) svgEl.removeAttribute('opacity');
            else svgEl.setAttribute('opacity', strVal);
          }
        });
        callbacks.onUpdateElement(elements[0]);
      });
    }

    DistortInspectorControls.bindEvents(container, selectionTool, callbacks, onReRender, 'multi-');

    const btnMultiLockStroke = container.querySelector<HTMLButtonElement>('#btn-multi-lock-scale-stroke');
    btnMultiLockStroke?.addEventListener('click', () => {
      selectionTool.scaleStroke = !selectionTool.scaleStroke;
      callbacks.onRenderOverlay?.();
      onReRender();
    });

    const btnMultiLockCorners = container.querySelector<HTMLButtonElement>('#btn-multi-lock-scale-corners');
    btnMultiLockCorners?.addEventListener('click', () => {
      selectionTool.scaleCorners = !selectionTool.scaleCorners;
      callbacks.onRenderOverlay?.();
      onReRender();
    });
  }
}
