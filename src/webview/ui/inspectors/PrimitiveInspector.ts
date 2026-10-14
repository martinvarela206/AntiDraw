import { VectorElement, VectorModel, RectCorners } from '../../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../../engine/SelectionTool.js';
import { ShapeToolConfig } from '../../engine/CanvasManager.js';
import { RectInspector } from './RectInspector.js';
import { EllipseInspector } from './EllipseInspector.js';
import { LineInspector } from './LineInspector.js';
import { ShapeDefaultsInspector } from './ShapeDefaultsInspector.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

/**
 * PrimitiveInspector
 *
 * Encapsulates the UI rendering and interactive event handlers for:
 * 1. Shape Tool Properties (when a shape creation tool is active without element selection)
 * 2. Parametric Primitives on Selected Elements:
 *    - Ellipse & Circle: radii, center, full/pie/arc modes, angular range, invert angles, 1:1 circle.
 *    - Rectangle: uniform vs independent corner radii modes, px vs % units, quick presets (0, 5, 10, 20, pill), sync TL, invert corners.
 *    - Line: start (x1, y1) and end (x2, y2), length, angle, reverse points.
 *    - Polyline & Polygon: vertex count, points summary.
 * 3. Conversion to freeform Bézier curves (`convertToCurves`).
 */
export class PrimitiveInspector {
  /**
   * Renders the properties panel for shape tool creation modes (rect, ellipse, star)
   */
  public static renderShapeToolProperties(
    container: HTMLElement,
    activeTool: string,
    shapeConfig: ShapeToolConfig,
    callbacks: PropertyPanelCallbacks
  ): void {
    ShapeDefaultsInspector.render(container, activeTool, shapeConfig, callbacks);
  }

  /**
   * Generates HTML markup for primitive-specific sections of an individual selected vector element.
   */
  public static renderElementPrimitives(
    el: VectorElement,
    model: VectorModel,
    box: BoundingBox | null
  ): string {
    const isEllipse = model.isEllipse(el);
    const isRect = model.isRect(el);
    const w = box ? Math.round(box.width) : Math.round(parseFloat(el.attributes.width || '100'));
    const h = box ? Math.round(box.height) : Math.round(parseFloat(el.attributes.height || '100'));
    const rectCorners = model.getRectCorners(el, w, h);

    const isLine = model.isLine(el);
    const isPolyline = model.isPolyline(el);
    const isPolygon = model.isPolygon(el);
    const isStar = model.isStar(el);
    const rawStarCx = el.attributes['cx'];
    const rawStarCy = el.attributes['cy'];
    const rawStarRx = el.attributes['rx'] || el.attributes['r'];
    const rawStarRy = el.attributes['ry'] || el.attributes['r'];
    const starCx = rawStarCx !== undefined ? parseFloat(rawStarCx) : (box ? box.cx : 0);
    const starCy = rawStarCy !== undefined ? parseFloat(rawStarCy) : (box ? box.cy : 0);
    const starRx = rawStarRx !== undefined ? parseFloat(rawStarRx) : (box ? box.width / 2 : 50);
    const starRy = rawStarRy !== undefined ? parseFloat(rawStarRy) : (box ? box.height / 2 : 50);
    const starPoints = parseInt(el.attributes['data-star-points'] || el.attributes['points'] || '5', 10);
    const starInnerRatio = parseFloat(el.attributes['data-star-inner-ratio'] || el.attributes['innerRatio'] || '0.4');
    const starInnerPct = Math.round(starInnerRatio * 100);
    let html = '';

    if (isEllipse) {
      html += EllipseInspector.render(el, model, box);
    }

    if (isRect) {
      html += RectInspector.render(el, model, box);
    }

    html += LineInspector.render(el, model);

    if (isStar) {
      const regularRatio = Math.cos(Math.PI / starPoints);
      const isRegularPolygon = Math.abs(starInnerRatio - regularRatio) < 0.01;
      const isOuterStar = starInnerRatio > regularRatio + 0.01;
      const starBadgeText = isRegularPolygon
        ? `⬡ Polígono regular (${starPoints} lados)`
        : isOuterStar
        ? `✦ Estrella externa (${starPoints} puntas)`
        : `★ Estrella interna (${starPoints} puntas)`;

      html += `
      <!-- Star & Regular Polygon Geometry Controls (FEAT-07 & FEAT-UnifiedStar) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Polígono / Estrella</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${starBadgeText}
          </span>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Coordenadas del centro de la figura">Centro</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X del centro">
              <span class="prop-coord-sublabel">X</span>
              <input type="number" class="prop-coord-input" id="star-cx" value="${Math.round(starCx)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y del centro">
              <span class="prop-coord-sublabel">Y</span>
              <input type="number" class="prop-coord-input" id="star-cy" value="${Math.round(starCy)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Radios exterior horizontal y vertical">Radios</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Radio exterior horizontal (rx)">
              <span class="prop-coord-sublabel">Rx</span>
              <input type="number" class="prop-coord-input" id="star-rx" value="${Math.round(starRx)}" min="1" />
            </div>
            <div class="prop-coord-box" title="Radio exterior vertical (ry)">
              <span class="prop-coord-sublabel">Ry</span>
              <input type="number" class="prop-coord-input" id="star-ry" value="${Math.round(starRy)}" min="1" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 4px;">
          <button class="prop-input" id="btn-star-make-uniform" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Hacer radios Rx y Ry iguales (1:1 Regular)">1:1 Regular</button>
          <button class="prop-input" id="btn-star-reset-regular" style="flex:1.4; cursor:pointer; font-size:9px; height:22px; padding:0; background:var(--accent-color); color:#ffffff; font-weight:600;" title="Revertir a polígono regular perfecto (${Math.round(regularRatio * 100)}%)">⬡ A Polígono Regular</button>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="Número de lados o puntas (3 a 64)">Lados</span>
          <input type="number" class="prop-coord-input" id="star-points" value="${starPoints}" min="3" max="64" step="1" style="flex: 1;" />
        </div>
        <div class="prop-row" style="gap: 4px;">
          <button class="prop-input" id="btn-star-preset-3" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Triángulo regular (3)">3 ▲</button>
          <button class="prop-input" id="btn-star-preset-4" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Cuadrado / 4 puntas (4)">4 ◆</button>
          <button class="prop-input" id="btn-star-preset-5" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Pentágono / 5 puntas (5)">5 ★</button>
          <button class="prop-input" id="btn-star-preset-6" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Hexágono / 6 puntas (6)">6 ⬡</button>
          <button class="prop-input" id="btn-star-preset-8" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Octógono / 8 puntas (8)">8 ✴</button>
          <button class="prop-input" id="btn-star-preset-12" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Dodecágono / 12 puntas (12)">12 ✹</button>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="Profundidad de arista / Radio interior (5% a 200%)">Arista</span>
          <div style="flex: 1; display: flex; align-items: center; gap: 4px;">
            <input type="range" id="star-inner-ratio-slider" min="5" max="200" step="1" value="${starInnerPct}" style="flex: 1; accent-color: var(--accent-color); cursor: pointer;" />
            <input type="number" class="prop-coord-input" id="star-inner-ratio-num" value="${starInnerPct}" min="5" max="200" step="1" style="width: 42px; text-align: center;" />
            <span style="font-size: 10px; color: var(--text-muted);">%</span>
          </div>
        </div>
        <div class="prop-row" style="gap: 4px;">
          <button class="prop-input" id="btn-star-ratio-25" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Puntas muy afiladas hacia adentro (25%)">25% Aguda</button>
          <button class="prop-input" id="btn-star-ratio-50" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Estrella media equilibrada (50%)">50% Media</button>
          <button class="prop-input" id="btn-star-ratio-regular" style="flex:1.2; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Polígono regular alineado (${Math.round(regularRatio * 100)}%)">⬡ ${Math.round(regularRatio * 100)}% Regular</button>
          <button class="prop-input" id="btn-star-ratio-130" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Estrella extendida hacia afuera (130%)">130% Externa</button>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-star-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curvas Bézier independientes (Ctrl+Q)">Convertir a Curvas</button>
        </div>
      </div>
      `;
    }

    return html;
  }

  /**
   * Binds interactive DOM listeners for primitive shape parameters.
   */
  public static bindElementPrimitives(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    box: BoundingBox | null,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const isEllipse = model.isEllipse(el);
    const isRect = model.isRect(el);
    const w = box ? Math.round(box.width) : 0;
    const h = box ? Math.round(box.height) : 0;
    const rectCorners = model.getRectCorners(el, w, h);

    const isLine = model.isLine(el);
    const isPolyline = model.isPolyline(el);
    const isPolygon = model.isPolygon(el);
    const isStar = model.isStar(el);
    const rawStarCx = el.attributes['cx'];
    const rawStarCy = el.attributes['cy'];
    const rawStarRx = el.attributes['rx'] || el.attributes['r'];
    const rawStarRy = el.attributes['ry'] || el.attributes['r'];
    const starCx = rawStarCx !== undefined ? parseFloat(rawStarCx) : (box ? box.cx : 0);
    const starCy = rawStarCy !== undefined ? parseFloat(rawStarCy) : (box ? box.cy : 0);
    const starRx = rawStarRx !== undefined ? parseFloat(rawStarRx) : (box ? box.width / 2 : 50);
    const starRy = rawStarRy !== undefined ? parseFloat(rawStarRy) : (box ? box.height / 2 : 50);
    const starPoints = parseInt(el.attributes['data-star-points'] || el.attributes['points'] || '5', 10);
    const starInnerRatio = parseFloat(el.attributes['data-star-inner-ratio'] || el.attributes['innerRatio'] || '0.4');
    // Ellipse / Circle Event Bindings
    if (isEllipse && (box || el.attributes['cx'] !== undefined)) {
      EllipseInspector.bind(container, el, model, selectionTool, box, callbacks, onReRender);
    }

    /**
     * ARCHITECTURAL RATIONALE: Interactive Parametric Rect Corner Inspector (FEAT-03)
     * Provides live bidirectional synchronization between the UI inputs (uniform radius, 4-corner inputs,
     * unit toggle px/%, mode toggle uniform/individual, quick presets) and the vector element model.
     */
    const effectiveBox: BoundingBox = box || {
      x: parseFloat(el.attributes.x || '0'),
      y: parseFloat(el.attributes.y || '0'),
      width: parseFloat(el.attributes.width || '100'),
      height: parseFloat(el.attributes.height || '100'),
      cx: parseFloat(el.attributes.x || '0') + parseFloat(el.attributes.width || '100') / 2,
      cy: parseFloat(el.attributes.y || '0') + parseFloat(el.attributes.height || '100') / 2,
    };
    if (isRect && (box || el.attributes['width'] !== undefined || el.vertices?.length)) {
      RectInspector.bind(container, el, model, effectiveBox, callbacks, onReRender);
    }

    LineInspector.bind(container, el, model, callbacks, onReRender);

    /**
     * ARCHITECTURAL RATIONALE: Interactive Parametric Star Inspector (FEAT-07)
     * Provides live bidirectional synchronization between the UI inputs (center cx/cy, outer radii rx/ry,
     * points count with quick presets, inner ratio slider/numerical input with geometric ratio presets,
     * and conversion to freeform curves) and the vector element model.
     * Regenerates star vertices and compiled path 'd' analytically, preserving bounding box pivot scaling.
     */
    if (isStar && (box || rawStarCx !== undefined)) {
      const getCurStarGeometry = () => ({
        cx: parseFloat(el.attributes.cx || starCx.toString()),
        cy: parseFloat(el.attributes.cy || starCy.toString()),
        rx: parseFloat(el.attributes.rx || el.attributes.r || starRx.toString()),
        ry: parseFloat(el.attributes.ry || el.attributes.r || starRy.toString())
      });

      const applyStarGeometry = (
        newCx: number,
        newCy: number,
        newRx: number,
        newRy: number,
        newPoints: number = starPoints,
        newInnerRatio: number = starInnerRatio
      ) => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const clampedRx = Math.max(1, newRx);
        const clampedRy = Math.max(1, newRy);
        const clampedPoints = Math.max(3, Math.min(64, Math.round(newPoints)));
        const clampedInner = Math.max(0.05, Math.min(2.0, newInnerRatio));
        const regularRatio = Math.cos(Math.PI / clampedPoints);
        const isRegular = Math.abs(clampedInner - regularRatio) < 0.005;

        if (isRegular) {
          el.attributes['data-shape'] = 'polygon';
          el.attributes['data-polygon-sides'] = clampedPoints.toString();
        } else {
          el.attributes['data-shape'] = 'star';
        }
        el.attributes['data-parametric'] = 'true';
        el.attributes['cx'] = newCx.toString();
        el.attributes['cy'] = newCy.toString();
        el.attributes['rx'] = clampedRx.toString();
        el.attributes['ry'] = clampedRy.toString();
        el.attributes['data-star-points'] = clampedPoints.toString();
        el.attributes['data-star-inner-ratio'] = clampedInner.toString();
        el.attributes['points'] = clampedPoints.toString();
        el.attributes['innerRatio'] = clampedInner.toString();

        el.vertices = model.convertShapeToVertices('star', el.attributes);
        el.attributes.d = model.compilePathD(el.vertices, true);
        el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');

        const newBox = selectionTool.getBoundingBox(el);
        if (newBox && box) {
          selectionTool.updatePivotOnScale(box, newBox, [el]);
        }
        callbacks.onUpdateElement(el);
        onReRender();
      };

      const starCxInput = container.querySelector<HTMLInputElement>('#star-cx');
      const starCyInput = container.querySelector<HTMLInputElement>('#star-cy');
      const starRxInput = container.querySelector<HTMLInputElement>('#star-rx');
      const starRyInput = container.querySelector<HTMLInputElement>('#star-ry');
      const btnStarUniform = container.querySelector<HTMLButtonElement>('#btn-star-make-uniform');
      const btnStarResetRegular = container.querySelector<HTMLButtonElement>('#btn-star-reset-regular');
      const starPointsInput = container.querySelector<HTMLInputElement>('#star-points');
      const starInnerSlider = container.querySelector<HTMLInputElement>('#star-inner-ratio-slider');
      const starInnerNum = container.querySelector<HTMLInputElement>('#star-inner-ratio-num');
      const btnStarToPath = container.querySelector<HTMLButtonElement>('#btn-star-to-path');

      if (starCxInput && starCyInput) {
        const onCenterChange = () => {
          const targetCx = parseFloat(starCxInput.value) || 0;
          const targetCy = parseFloat(starCyInput.value) || 0;
          const { rx, ry } = getCurStarGeometry();
          applyStarGeometry(targetCx, targetCy, rx, ry);
        };
        starCxInput.addEventListener('change', onCenterChange);
        starCyInput.addEventListener('change', onCenterChange);
      }

      if (starRxInput && starRyInput) {
        const onRadiiChange = () => {
          const targetRx = Math.max(1, parseFloat(starRxInput.value) || 1);
          const targetRy = Math.max(1, parseFloat(starRyInput.value) || 1);
          const { cx, cy } = getCurStarGeometry();
          applyStarGeometry(cx, cy, targetRx, targetRy);
        };
        starRxInput.addEventListener('change', onRadiiChange);
        starRyInput.addEventListener('change', onRadiiChange);
      }

      btnStarUniform?.addEventListener('click', () => {
        const { cx, cy, rx, ry } = getCurStarGeometry();
        const uniformR = Math.max(1, Math.round((rx + ry) / 2));
        applyStarGeometry(cx, cy, uniformR, uniformR);
      });

      btnStarResetRegular?.addEventListener('click', () => {
        const { cx, cy, rx, ry } = getCurStarGeometry();
        const regRatio = Math.cos(Math.PI / starPoints);
        applyStarGeometry(cx, cy, rx, ry, starPoints, regRatio);
      });

      starPointsInput?.addEventListener('change', () => {
        const pts = Math.max(3, Math.min(64, parseInt(starPointsInput.value, 10) || 5));
        const { cx, cy, rx, ry } = getCurStarGeometry();
        applyStarGeometry(cx, cy, rx, ry, pts, starInnerRatio);
      });

      const presetPoints = [3, 4, 5, 6, 8, 12];
      for (const p of presetPoints) {
        const btnPreset = container.querySelector<HTMLButtonElement>(`#btn-star-preset-${p}`);
        btnPreset?.addEventListener('click', () => {
          const { cx, cy, rx, ry } = getCurStarGeometry();
          applyStarGeometry(cx, cy, rx, ry, p, starInnerRatio);
        });
      }

      if (starInnerSlider && starInnerNum) {
        starInnerSlider.addEventListener('input', () => {
          const valPct = parseFloat(starInnerSlider.value) || 40;
          starInnerNum.value = valPct.toString();
          const { cx, cy, rx, ry } = getCurStarGeometry();
          applyStarGeometry(cx, cy, rx, ry, starPoints, valPct / 100);
        });

        starInnerNum.addEventListener('change', () => {
          let valPct = parseFloat(starInnerNum.value) || 40;
          valPct = Math.max(5, Math.min(200, valPct));
          starInnerSlider.value = valPct.toString();
          const { cx, cy, rx, ry } = getCurStarGeometry();
          applyStarGeometry(cx, cy, rx, ry, starPoints, valPct / 100);
        });
      }

      const ratioPresets: { id: string; ratio: () => number }[] = [
        { id: '#btn-star-ratio-25', ratio: () => 0.25 },
        { id: '#btn-star-ratio-50', ratio: () => 0.50 },
        { id: '#btn-star-ratio-regular', ratio: () => Math.cos(Math.PI / starPoints) },
        { id: '#btn-star-ratio-130', ratio: () => 1.30 },
      ];
      for (const preset of ratioPresets) {
        const btn = container.querySelector<HTMLButtonElement>(preset.id);
        btn?.addEventListener('click', () => {
          const { cx, cy, rx, ry } = getCurStarGeometry();
          applyStarGeometry(cx, cy, rx, ry, starPoints, preset.ratio());
        });
      }

      btnStarToPath?.addEventListener('click', () => {
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
