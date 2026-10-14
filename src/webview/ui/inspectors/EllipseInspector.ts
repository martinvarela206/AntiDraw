import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../../engine/SelectionTool.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Ellipse, Pie & Arc Inspector (EllipseInspector)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates all UI rendering, geometric parsing, and reactive event bindings
 *    for native `<ellipse>`, `<circle>`, and parametric arc/pie/donut paths.
 *
 * 2. Canonical Primitive Geometry vs AABB Fallback (FIX-20):
 *    Evaluates native element parametric attributes ('cx', 'cy', 'rx', 'ry', 'r') as primary ground truth.
 *    Naive reliance on `box` (BoundingBox) causes catastrophic geometric deformation when an ellipse is
 *    converted to an arc or pie wedge (< 360°): the visual bounding box of a 90° or 60° arc only spans a fraction
 *    of the circle's radius and has an eccentric center, halving or distorting radii upon subsequent angle changes.
 *    `box` is strictly retained as a fallback for non-parametric imported paths with 4-point bezier curvature.
 *
 * 3. Parametric Donut / Ring Ratio (FEAT-10):
 *    Maintains reactive live adjustment of inner hole ratio (`data-inner-ratio`), automatically enforcing
 *    the `evenodd` fill rule for concentric holes and syncing slider and numeric inputs.
 */
export class EllipseInspector {
  public static render(
    el: VectorElement,
    model: VectorModel,
    box: BoundingBox | null
  ): string {
    const rawCx = el.attributes['cx'];
    const rawCy = el.attributes['cy'];
    const rawRx = el.attributes['rx'] || el.attributes['r'];
    const rawRy = el.attributes['ry'] || el.attributes['r'];

    const ellipseCx = rawCx !== undefined ? parseFloat(rawCx) : (box ? box.cx : 0);
    const ellipseCy = rawCy !== undefined ? parseFloat(rawCy) : (box ? box.cy : 0);
    const ellipseRx = rawRx !== undefined ? parseFloat(rawRx) : (box ? box.width / 2 : 0);
    const ellipseRy = rawRy !== undefined ? parseFloat(rawRy) : (box ? box.height / 2 : 0);
    const isCircle = Math.abs(ellipseRx - ellipseRy) < 0.5;
    const ellipseType = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
    const ellipseStartAngle = Math.round(parseFloat(el.attributes['data-start-angle'] || '0'));
    const ellipseEndAngle = Math.round(parseFloat(el.attributes['data-end-angle'] || '360'));
    const ellipseInnerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
    const ellipseInnerPct = Math.round(ellipseInnerRatio * 100);

    const badgeText = ellipseInnerRatio > 0
      ? (ellipseType === 'pie' ? '◔ Rosca parcial' : '🍩 Rosca')
      : (ellipseType === 'pie' ? '◔ Tarta' : ellipseType === 'arc' ? '◜ Arco' : isCircle ? '● Círculo' : '⬭ Elipse');

    return `
      <!-- Ellipse / Circle Geometry Controls (FIX-19, FEAT-02 & FEAT-10) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Elipse / Círculo</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${badgeText}
          </span>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Coordenadas del centro de la elipse">Centro</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X del centro de la elipse">
              <span class="prop-coord-sublabel">X</span>
              <input type="number" class="prop-coord-input" id="ellipse-cx" value="${Math.round(ellipseCx)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y del centro de la elipse">
              <span class="prop-coord-sublabel">Y</span>
              <input type="number" class="prop-coord-input" id="ellipse-cy" value="${Math.round(ellipseCy)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Radios horizontal y vertical">Radios</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Radio horizontal (rx)">
              <span class="prop-coord-sublabel">Rx</span>
              <input type="number" class="prop-coord-input" id="ellipse-rx" value="${Math.round(ellipseRx)}" min="1" />
            </div>
            <div class="prop-coord-box" title="Radio vertical (ry)">
              <span class="prop-coord-sublabel">Ry</span>
              <input type="number" class="prop-coord-input" id="ellipse-ry" value="${Math.round(ellipseRy)}" min="1" />
            </div>
          </div>
          <button class="prop-input" id="btn-ellipse-make-circle" style="width: auto; padding: 2px 6px; height: 26px; cursor: pointer; flex-shrink: 0;" title="Convertir a círculo perfecto 1:1">1:1</button>
        </div>
        <div class="prop-row" style="gap: 4px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="Tipo de primitiva: elipse completa, sector cerrado de tarta o arco perimetral abierto">Modo</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-ellipse-mode-full" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${ellipseType === 'ellipse' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Elipse / Círculo completo (360°)">Elipse</button>
            <button class="prop-input" id="btn-ellipse-mode-pie" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${ellipseType === 'pie' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Sector o porción de tarta cerrada con centro y radios (Pie)">Tarta</button>
            <button class="prop-input" id="btn-ellipse-mode-arc" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${ellipseType === 'arc' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Arco perimetral abierto sin relleno (Arc)">Arco</button>
          </div>
        </div>
        <div id="ellipse-angles-container" style="${ellipseType === 'ellipse' ? 'display:none;' : 'display:flex;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Ángulos inicial y final de corte">Ángulo</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Ángulo inicial en grados (°)">
                <span class="prop-coord-sublabel">Ini</span>
                <input type="number" class="prop-coord-input" id="ellipse-start-angle" value="${ellipseStartAngle}" min="0" max="360" step="5" />
                <span class="prop-coord-sublabel">°</span>
              </div>
              <div class="prop-coord-box" title="Ángulo final en grados (°)">
                <span class="prop-coord-sublabel">Fin</span>
                <input type="number" class="prop-coord-input" id="ellipse-end-angle" value="${ellipseEndAngle}" min="0" max="360" step="5" />
                <span class="prop-coord-sublabel">°</span>
              </div>
            </div>
            <button class="prop-input" id="btn-ellipse-invert-angles" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Invertir sector angular">⇄</button>
          </div>
        </div>
        <!-- Donut / Ring Inner Ratio (FEAT-10) -->
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="Radio interno para crear rosca/anillo o sector anular (0% a 95%)">Hueco</span>
          <div style="display:flex; align-items:center; gap:6px; flex:1;">
            <input type="range" id="ellipse-inner-ratio-slider" min="0" max="95" value="${ellipseInnerPct}" style="flex:1; cursor:pointer;" title="Deslizador de hueco interior" />
            <div class="prop-coord-box" style="width:52px; flex-shrink:0;">
              <input type="number" class="prop-coord-input" id="ellipse-inner-ratio-num" value="${ellipseInnerPct}" min="0" max="95" step="5" />
              <span class="prop-coord-sublabel">%</span>
            </div>
            <button class="prop-input" id="btn-ellipse-inner-reset" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Restablecer a círculo/sector sólido (0% hueco)">●</button>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-ellipse-swap-radii" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Intercambiar radio horizontal y vertical (Rotar 90°)">⇄ Rotar 90°</button>
          <button class="prop-input" id="btn-ellipse-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curvas Bézier independientes">Convertir a Curvas</button>
        </div>
      </div>
    `;
  }

  public static bind(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    box: BoundingBox | null,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const rawCx = el.attributes['cx'];
    const rawCy = el.attributes['cy'];
    const rawRx = el.attributes['rx'] || el.attributes['r'];
    const rawRy = el.attributes['ry'] || el.attributes['r'];

    const ellipseCx = rawCx !== undefined ? parseFloat(rawCx) : (box ? box.cx : 0);
    const ellipseCy = rawCy !== undefined ? parseFloat(rawCy) : (box ? box.cy : 0);
    const ellipseRx = rawRx !== undefined ? parseFloat(rawRx) : (box ? box.width / 2 : 0);
    const ellipseRy = rawRy !== undefined ? parseFloat(rawRy) : (box ? box.height / 2 : 0);
    const ellipseType = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
    const ellipseStartAngle = Math.round(parseFloat(el.attributes['data-start-angle'] || '0'));
    const ellipseEndAngle = Math.round(parseFloat(el.attributes['data-end-angle'] || '360'));

    const ellipseCxInput = container.querySelector<HTMLInputElement>('#ellipse-cx');
    const ellipseCyInput = container.querySelector<HTMLInputElement>('#ellipse-cy');
    const ellipseRxInput = container.querySelector<HTMLInputElement>('#ellipse-rx');
    const ellipseRyInput = container.querySelector<HTMLInputElement>('#ellipse-ry');
    const btnEllipseMakeCircle = container.querySelector<HTMLButtonElement>('#btn-ellipse-make-circle');
    const btnEllipseSwapRadii = container.querySelector<HTMLButtonElement>('#btn-ellipse-swap-radii');
    const btnEllipseToPath = container.querySelector<HTMLButtonElement>('#btn-ellipse-to-path');

    const ellipseInnerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
    const innerSlider = container.querySelector<HTMLInputElement>('#ellipse-inner-ratio-slider');
    const innerNum = container.querySelector<HTMLInputElement>('#ellipse-inner-ratio-num');
    const btnInnerReset = container.querySelector<HTMLButtonElement>('#btn-ellipse-inner-reset');

    const getCurGeometry = () => ({
      cx: parseFloat(el.attributes.cx || ellipseCx.toString()),
      cy: parseFloat(el.attributes.cy || ellipseCy.toString()),
      rx: parseFloat(el.attributes.rx || el.attributes.r || ellipseRx.toString()),
      ry: parseFloat(el.attributes.ry || el.attributes.r || ellipseRy.toString())
    });

    const applyEllipseGeometry = (
      newCx: number,
      newCy: number,
      newRx: number,
      newRy: number,
      newType: 'ellipse' | 'pie' | 'arc' = ellipseType,
      newStart: number = ellipseStartAngle,
      newEnd: number = ellipseEndAngle,
      newInnerRatio: number = ellipseInnerRatio
    ) => {
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      const clampedRx = Math.max(1, newRx);
      const clampedRy = Math.max(1, newRy);
      const clampedInner = Math.max(0, Math.min(0.95, newInnerRatio));
      el.attributes['data-shape'] = 'ellipse';
      el.attributes['cx'] = newCx.toString();
      el.attributes['cy'] = newCy.toString();
      el.attributes['rx'] = clampedRx.toString();
      el.attributes['ry'] = clampedRy.toString();
      delete el.attributes['r'];
      el.attributes['data-ellipse-type'] = newType;
      el.attributes['data-start-angle'] = newStart.toString();
      el.attributes['data-end-angle'] = newEnd.toString();
      el.attributes['data-inner-ratio'] = clampedInner.toString();
      el.isClosed = newType !== 'arc';

      const isFull = newType === 'ellipse' && Math.abs(newEnd - newStart) >= 360 && clampedInner === 0;

      if (isFull) {
        const isCircle = Math.abs(clampedRx - clampedRy) < 0.5;
        el.tagName = isCircle ? 'circle' : 'ellipse';
        el.shapeType = isCircle ? 'circle' : 'ellipse';
        el.isParametric = true;
        el.attributes['data-shape'] = isCircle ? 'circle' : 'ellipse';
        el.attributes['data-parametric'] = 'true';
        delete el.attributes.d;
        delete el.attributes['fill-rule'];
        if (isCircle) {
          el.attributes['r'] = clampedRx.toString();
          delete el.attributes['rx'];
          delete el.attributes['ry'];
        } else {
          el.attributes['rx'] = clampedRx.toString();
          el.attributes['ry'] = clampedRy.toString();
          delete el.attributes['r'];
        }
      } else {
        el.tagName = 'path';
        el.shapeType = 'ellipse';
        el.isParametric = true;
        el.attributes['data-shape'] = 'ellipse';
        el.attributes['data-parametric'] = 'true';
      }

      el.attributes['data-ellipse-cx'] = newCx.toString();
      el.attributes['data-ellipse-cy'] = newCy.toString();
      el.attributes['data-ellipse-rx'] = clampedRx.toString();
      el.attributes['data-ellipse-ry'] = clampedRy.toString();

      if (clampedInner > 0) {
        el.attributes['fill-rule'] = 'evenodd';
      } else {
        delete el.attributes['fill-rule'];
      }

      if (newType === 'arc') {
        el.attributes.fill = 'none';
        delete el.attributes['data-gradient'];
      } else if (newType === 'pie' || newType === 'ellipse') {
        if (!el.attributes.fill || el.attributes.fill === 'none') {
          el.attributes.fill = '#6366f1';
        }
      }

      el.vertices = model.convertEllipseToVertices(
        newCx,
        newCy,
        clampedRx,
        clampedRy,
        newType,
        newStart,
        newEnd,
        clampedInner
      );
      if (el.tagName === 'path') {
        el.attributes.d = model.compileEllipseD(
          newCx,
          newCy,
          clampedRx,
          clampedRy,
          newType,
          newStart,
          newEnd,
          clampedInner
        );
      }
      el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');

      const newBox = selectionTool.getBoundingBox(el);
      if (newBox && box) {
        selectionTool.updatePivotOnScale(box, newBox, [el]);
      }
      callbacks.onUpdateElement(el);
      onReRender();
    };

    if (ellipseCxInput && ellipseCyInput) {
      const onCenterChange = () => {
        const targetCx = parseFloat(ellipseCxInput.value) || 0;
        const targetCy = parseFloat(ellipseCyInput.value) || 0;
        const { rx, ry } = getCurGeometry();
        applyEllipseGeometry(targetCx, targetCy, rx, ry);
      };
      ellipseCxInput.addEventListener('change', onCenterChange);
      ellipseCyInput.addEventListener('change', onCenterChange);
    }

    if (ellipseRxInput && ellipseRyInput) {
      const onRadiiChange = () => {
        const targetRx = Math.max(1, parseFloat(ellipseRxInput.value) || 1);
        const targetRy = Math.max(1, parseFloat(ellipseRyInput.value) || 1);
        const { cx, cy } = getCurGeometry();
        applyEllipseGeometry(cx, cy, targetRx, targetRy);
      };
      ellipseRxInput.addEventListener('change', onRadiiChange);
      ellipseRyInput.addEventListener('change', onRadiiChange);
    }

    const btnModeFull = container.querySelector<HTMLButtonElement>('#btn-ellipse-mode-full');
    const btnModePie = container.querySelector<HTMLButtonElement>('#btn-ellipse-mode-pie');
    const btnModeArc = container.querySelector<HTMLButtonElement>('#btn-ellipse-mode-arc');
    const inputStartAngle = container.querySelector<HTMLInputElement>('#ellipse-start-angle');
    const inputEndAngle = container.querySelector<HTMLInputElement>('#ellipse-end-angle');
    const btnInvertAngles = container.querySelector<HTMLButtonElement>('#btn-ellipse-invert-angles');

    btnModeFull?.addEventListener('click', () => {
      const { cx, cy, rx, ry } = getCurGeometry();
      applyEllipseGeometry(cx, cy, rx, ry, 'ellipse', 0, 360);
    });

    btnModePie?.addEventListener('click', () => {
      const { cx, cy, rx, ry } = getCurGeometry();
      const s = ellipseStartAngle;
      const e = (ellipseEndAngle === 360 && s === 0) ? 270 : ellipseEndAngle;
      applyEllipseGeometry(cx, cy, rx, ry, 'pie', s, e);
    });

    btnModeArc?.addEventListener('click', () => {
      const { cx, cy, rx, ry } = getCurGeometry();
      const s = ellipseStartAngle;
      const e = (ellipseEndAngle === 360 && s === 0) ? 270 : ellipseEndAngle;
      applyEllipseGeometry(cx, cy, rx, ry, 'arc', s, e);
    });

    if (inputStartAngle && inputEndAngle) {
      const onAnglesChange = () => {
        const rawS = parseFloat(inputStartAngle.value) || 0;
        const rawE = parseFloat(inputEndAngle.value) || 0;
        let s = ((rawS % 360) + 360) % 360;
        let e = ((rawE % 360) + 360) % 360;
        if (s === e || Math.abs(rawE - rawS) >= 360) {
          e = s + 360;
        }
        let span = e - s;
        while (span < 0) span += 360;
        while (span > 360) span -= 360;
        if (span === 0) span = 360;

        /**
         * ARCHITECTURAL RATIONALE: Full 360° Sweep Auto-Transition to Ellipse Mode (FIX-EllipseAutoMode)
         *
         * 1. Technical Justification:
         *    When adjusting start/end angles in EllipseInspector, reaching a complete 360° sweep
         *    (e.g., 0° to 360°, identical angles, or delta >= 360°) geometrically forms a full closed ellipse.
         *    Retaining 'pie' or 'arc' mode causes the inspector to keep showing angle controls and radial spokes
         *    instead of the canonical full-ellipse controls. Automatically switching `data-ellipse-type` to
         *    'ellipse' aligns the element's metadata with its true topological closure and seamlessly hides
         *    the angle inputs in favor of standard full ellipse editing.
         *
         * 2. Canonical Angle Normalization:
         *    Upon reaching span >= 360° (or within floating-point tolerance), angles are normalized to
         *    canonical boundaries (start: 0, end: 360) and mode is upgraded to 'ellipse'.
         *
         * 3. Partial Sectors:
         *    If span < 360°, an element previously in 'ellipse' mode transitions to 'pie', while existing
         *    'pie' or 'arc' modes are preserved.
         */
        const isFullCircle = Math.abs(span - 360) < 1e-4;
        const targetType = isFullCircle ? 'ellipse' : (ellipseType === 'ellipse' ? 'pie' : ellipseType);
        const finalS = isFullCircle ? 0 : s;
        const finalE = isFullCircle ? 360 : e;

        const { cx, cy, rx, ry } = getCurGeometry();
        applyEllipseGeometry(cx, cy, rx, ry, targetType, finalS, finalE);
      };
      inputStartAngle.addEventListener('change', onAnglesChange);
      inputEndAngle.addEventListener('change', onAnglesChange);
    }

    btnInvertAngles?.addEventListener('click', () => {
      const { cx, cy, rx, ry } = getCurGeometry();
      applyEllipseGeometry(cx, cy, rx, ry, ellipseType === 'ellipse' ? 'pie' : ellipseType, ellipseEndAngle, ellipseStartAngle);
    });

    if (innerSlider && innerNum) {
      innerSlider.addEventListener('input', () => {
        const valPct = parseFloat(innerSlider.value) || 0;
        innerNum.value = valPct.toString();
        const { cx, cy, rx, ry } = getCurGeometry();
        applyEllipseGeometry(cx, cy, rx, ry, ellipseType, ellipseStartAngle, ellipseEndAngle, valPct / 100);
      });

      innerNum.addEventListener('change', () => {
        let valPct = parseFloat(innerNum.value) || 0;
        valPct = Math.max(0, Math.min(95, valPct));
        innerSlider.value = valPct.toString();
        const { cx, cy, rx, ry } = getCurGeometry();
        applyEllipseGeometry(cx, cy, rx, ry, ellipseType, ellipseStartAngle, ellipseEndAngle, valPct / 100);
      });
    }

    if (btnInnerReset) {
      btnInnerReset.addEventListener('click', () => {
        if (innerSlider) innerSlider.value = '0';
        if (innerNum) innerNum.value = '0';
        const { cx, cy, rx, ry } = getCurGeometry();
        applyEllipseGeometry(cx, cy, rx, ry, ellipseType, ellipseStartAngle, ellipseEndAngle, 0);
      });
    }

    if (btnEllipseMakeCircle) {
      btnEllipseMakeCircle.addEventListener('click', () => {
        const { cx, cy, rx, ry } = getCurGeometry();
        const uniformR = Math.max(1, Math.round((rx + ry) / 2));
        applyEllipseGeometry(cx, cy, uniformR, uniformR);
      });
    }

    if (btnEllipseSwapRadii) {
      btnEllipseSwapRadii.addEventListener('click', () => {
        const { cx, cy, rx, ry } = getCurGeometry();
        applyEllipseGeometry(cx, cy, ry, rx);
      });
    }

    if (btnEllipseToPath) {
      btnEllipseToPath.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        model.convertToCurves(el);
        if (callbacks.onConvertToCurves) {
          callbacks.onConvertToCurves(el);
        } else {
          callbacks.onUpdateElement(el);
          onReRender();
        }
      });
    }
  }
}
