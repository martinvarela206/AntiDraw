import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../../engine/SelectionTool.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

/**
 * GeometryInspector
 *
 * Encapsulates the UI rendering and event handlers for element transform & geometry:
 * - Selection mode switching (Scale / Transform vs. Rotate).
 * - Bounding box position (X, Y) and dimensions (Width, Height).
 * - Custom and center rotation pivot coordinates (Pivot X, Pivot Y, Reset Pivot).
 * - Node count display and topological status (open vs. closed).
 * - Parametric conversion shortcuts ("Convertir a Curvas" Ctrl+Q) and inverse simplification ("Simplificar a <primitiva>").
 */
export class GeometryInspector {
  public static renderHtml(
    el: VectorElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    box: BoundingBox | null,
    pivot: { x: number; y: number },
    isClosed: boolean,
    detectedPrimitive: { primitive: string } | null
  ): string {
    const x = box ? Math.round(box.x) : 0;
    const y = box ? Math.round(box.y) : 0;
    const w = box ? Math.round(box.width) : 0;
    const h = box ? Math.round(box.height) : 0;

    return `
      <div class="panel-section">
        <div class="panel-title">Transform</div>
        <div class="prop-row">
          <span class="prop-label">Modo</span>
          <div style="display:flex; gap:4px; flex:1;">
            <button class="prop-input" id="btn-mode-transform" style="flex:1; cursor:pointer; font-weight:600; ${selectionTool.selectionMode === 'transform' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Mover y Redimensionar: muestra tiradores de escala y anclaje magnético por proximidad">⤢ Escalar</button>
            <button class="prop-input" id="btn-mode-rotate" style="flex:1; cursor:pointer; font-weight:600; ${selectionTool.selectionMode === 'rotate' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Rotación: muestra tiradores de giro y permite reubicar libremente el centro de rotación">↻ Rotar</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">X</span>
          <input type="number" class="prop-input" id="el-x" value="${x}" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="el-y" value="${y}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">W</span>
          <input type="number" class="prop-input" id="el-w" value="${w}" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="el-h" value="${h}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Pivot</span>
          <input type="number" class="prop-input" id="el-pivot-x" value="${Math.round(pivot.x)}" title="Coordenada X del pivote de rotación" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="el-pivot-y" value="${Math.round(pivot.y)}" title="Coordenada Y del pivote de rotación" />
          <button class="prop-input" id="btn-reset-pivot" style="width:auto; padding:2px 8px; cursor:pointer;" title="Restablecer pivote al centro del elemento">⟲</button>
        </div>
        <div class="prop-row">
          <span class="prop-label">Nodes</span>
          <span style="font-weight:600; color:var(--text-main); font-size:12px;">${el.vertices ? el.vertices.length : 0} nodes (${isClosed ? 'closed' : 'open'})</span>
        </div>
        ${model.isParametricElement(el) ? `
        <div class="prop-row" style="margin-top: 6px;">
          <button class="prop-input" id="btn-convert-to-path" style="flex:1; cursor:pointer; background:#312e81; color:#c7d2fe; border:1px solid #6366f1; font-weight:600; padding:6px; display:flex; align-items:center; justify-content:center; gap:6px;" title="Convertir primitiva paramétrica a curvas libres editables con herramienta de Nodos (Ctrl+Q)">
            <span style="font-size:13px;">⤹</span>
            <span>Convertir a Curvas (Ctrl+Q)</span>
          </button>
        </div>` : (detectedPrimitive ? `
        <div class="prop-row" style="margin-top: 6px; flex-direction: column; gap: 4px; background: rgba(16, 185, 129, 0.08); border: 1px dashed #10b981; border-radius: 4px; padding: 6px;">
          <div style="font-size: 10px; color: #10b981; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
            <span>⚡ Primitiva detectada</span>
            <span style="text-transform: uppercase; font-family: monospace;">&lt;${detectedPrimitive.primitive}&gt;</span>
          </div>
          <button class="prop-input" id="btn-simplify-to-primitive" style="cursor:pointer; background:#065f46; color:#a7f3d0; border:1px solid #10b981; font-weight:600; padding:5px; display:flex; align-items:center; justify-content:center; gap:6px; font-size:11px;" title="Simplificar trazado &lt;path&gt; a forma geométrica SVG canónica &lt;${detectedPrimitive.primitive}&gt;">
            <span>⚡</span>
            <span>Simplificar a &lt;${detectedPrimitive.primitive}&gt;</span>
          </button>
        </div>` : '')}
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    box: BoundingBox | null,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void,
    detectedPrimitive: { primitive: string } | null
  ): void {
    const elX = container.querySelector<HTMLInputElement>('#el-x');
    const elY = container.querySelector<HTMLInputElement>('#el-y');
    const elW = container.querySelector<HTMLInputElement>('#el-w');
    const elH = container.querySelector<HTMLInputElement>('#el-h');

    if (elX && elY && box && el.vertices) {
      const applyPos = () => {
        const targetX = parseFloat(elX.value) || 0;
        const targetY = parseFloat(elY.value) || 0;
        const dx = targetX - box.x;
        const dy = targetY - box.y;
        el.vertices = el.vertices!.map((v) => ({
          ...v,
          x: v.x + dx,
          y: v.y + dy,
          handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
          handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
        }));
        selectionTool.updatePivotOnTranslate(dx, dy, [el]);
        callbacks.onUpdateElement(el);
      };
      elX.addEventListener('change', applyPos);
      elY.addEventListener('change', applyPos);
    }

    if (elW && elH && box && el.vertices) {
      const applySize = () => {
        const targetW = Math.max(parseFloat(elW.value) || 1, 1);
        const targetH = Math.max(parseFloat(elH.value) || 1, 1);
        const sx = targetW / (box.width || 1);
        const sy = targetH / (box.height || 1);
        el.vertices = el.vertices!.map((v) => ({
          ...v,
          x: box.x + (v.x - box.x) * sx,
          y: box.y + (v.y - box.y) * sy,
          handleIn: v.handleIn ? { x: box.x + (v.handleIn.x - box.x) * sx, y: box.y + (v.handleIn.y - box.y) * sy } : undefined,
          handleOut: v.handleOut ? { x: box.x + (v.handleOut.x - box.x) * sx, y: box.y + (v.handleOut.y - box.y) * sy } : undefined,
        }));
        selectionTool.updatePivotOnScale(box, { ...box, width: targetW, height: targetH }, [el]);
        callbacks.onUpdateElement(el);
      };
      elW.addEventListener('change', applySize);
      elH.addEventListener('change', applySize);
    }

    const elPivotX = container.querySelector<HTMLInputElement>('#el-pivot-x');
    const elPivotY = container.querySelector<HTMLInputElement>('#el-pivot-y');
    const btnResetPivot = container.querySelector<HTMLButtonElement>('#btn-reset-pivot');

    if (elPivotX && elPivotY && box) {
      const applyPivot = () => {
        const px = parseFloat(elPivotX.value);
        const py = parseFloat(elPivotY.value);
        if (!isNaN(px) && !isNaN(py)) {
          selectionTool.setCustomPivotForElement(el, { x: px, y: py });
          callbacks.onUpdateElement(el);
          callbacks.onRenderOverlay?.();
        }
      };
      elPivotX.addEventListener('input', applyPivot);
      elPivotY.addEventListener('input', applyPivot);
    }

    if (btnResetPivot && box) {
      btnResetPivot.addEventListener('click', () => {
        selectionTool.resetPivot(el);
        if (elPivotX) elPivotX.value = String(Math.round(box.cx));
        if (elPivotY) elPivotY.value = String(Math.round(box.cy));
        callbacks.onUpdateElement(el);
        callbacks.onRenderOverlay?.();
      });
    }

    const btnModeTransform = container.querySelector<HTMLButtonElement>('#btn-mode-transform');
    const btnModeRotate = container.querySelector<HTMLButtonElement>('#btn-mode-rotate');
    btnModeTransform?.addEventListener('click', () => {
      selectionTool.selectionMode = 'transform';
      callbacks.onRenderOverlay?.();
      onReRender();
    });
    btnModeRotate?.addEventListener('click', () => {
      selectionTool.selectionMode = 'rotate';
      callbacks.onRenderOverlay?.();
      onReRender();
    });

    const btnConvertToPath = container.querySelector<HTMLButtonElement>('#btn-convert-to-path');
    if (btnConvertToPath) {
      btnConvertToPath.addEventListener('click', () => {
        if (callbacks.onConvertToCurves) {
          callbacks.onConvertToCurves(el);
        } else {
          model.convertToCurves(el);
          callbacks.onUpdateElement(el);
        }
        onReRender();
      });
    }

    const btnSimplify = container.querySelector<HTMLButtonElement>('#btn-simplify-to-primitive');
    if (btnSimplify && detectedPrimitive) {
      btnSimplify.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        model.convertPathToPrimitive(el);
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }
  }
}
