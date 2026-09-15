import { VectorElement, VectorModel, RectCorners } from '../../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../../engine/SelectionTool.js';
import { ShapeToolConfig } from '../../engine/CanvasManager.js';
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
    const toolName =
      activeTool === 'rect' ? 'Rectangle' :
      activeTool === 'circle' ? 'Circle' :
      activeTool === 'ellipse' ? 'Ellipse' :
      activeTool === 'line' ? 'Line' :
      activeTool === 'polygon' ? 'Polygon' :
      'Star';

    const showAspectRatios = activeTool !== 'line' && activeTool !== 'circle';

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${toolName} Tool Settings</div>
        
        ${showAspectRatios ? `
        <div class="prop-row">
          <span class="prop-label">Proportion (Alt)</span>
          <select class="prop-input" id="shape-aspect-preset" style="cursor:pointer;">
            <option value="4:3" ${shapeConfig.aspectRatioW === 4 && shapeConfig.aspectRatioH === 3 ? 'selected' : ''}>4:3 (Standard)</option>
            <option value="16:9" ${shapeConfig.aspectRatioW === 16 && shapeConfig.aspectRatioH === 9 ? 'selected' : ''}>16:9 (Widescreen)</option>
            <option value="1:1" ${shapeConfig.aspectRatioW === 1 && shapeConfig.aspectRatioH === 1 ? 'selected' : ''}>1:1 (Square)</option>
            <option value="3:2" ${shapeConfig.aspectRatioW === 3 && shapeConfig.aspectRatioH === 2 ? 'selected' : ''}>3:2 (Photo)</option>
            <option value="2:1" ${shapeConfig.aspectRatioW === 2 && shapeConfig.aspectRatioH === 1 ? 'selected' : ''}>2:1 (Panoramic)</option>
            <option value="custom" ${!['4:3', '16:9', '1:1', '3:2', '2:1'].includes(`${shapeConfig.aspectRatioW}:${shapeConfig.aspectRatioH}`) ? 'selected' : ''}>Custom</option>
          </select>
        </div>

        <div class="prop-row">
          <span class="prop-label">Ratio W : H</span>
          <div style="display:flex; gap:6px; width:130px; align-items:center;">
            <input type="number" class="prop-input" id="shape-ratio-w" value="${shapeConfig.aspectRatioW}" min="1" step="1" style="width:55px; text-align:center;" />
            <span style="font-weight:bold; color:var(--text-muted);">:</span>
            <input type="number" class="prop-input" id="shape-ratio-h" value="${shapeConfig.aspectRatioH}" min="1" step="1" style="width:55px; text-align:center;" />
          </div>
        </div>
        ` : ''}

        ${activeTool === 'star' ? `
          <div class="prop-row">
            <span class="prop-label">Star Points</span>
            <input type="number" class="prop-input" id="star-points" value="${shapeConfig.starPoints}" min="3" max="32" step="1" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Inner Ratio</span>
            <input type="number" class="prop-input" id="star-inner-ratio" value="${shapeConfig.starInnerRatio}" min="0.1" max="0.9" step="0.05" />
          </div>
        ` : ''}

        ${activeTool === 'polygon' ? `
          <div class="prop-row">
            <span class="prop-label">Sides</span>
            <input type="number" class="prop-input" id="polygon-sides" value="${shapeConfig.polygonSides || 5}" min="3" max="32" step="1" />
          </div>
        ` : ''}

        ${activeTool === 'rect' ? `
          <div class="prop-row">
            <span class="prop-label">Corner Radius</span>
            <input type="number" class="prop-input" id="rect-corner-radius" value="${shapeConfig.rectCornerRadius}" min="0" step="1" />
          </div>
        ` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-title">Creation Shortcuts</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.6;">
          ${activeTool === 'line' ? `
            • <b>Drag</b>: Draw straight line between points<br/>
            • <b>Shift + Drag</b>: Constrain to 45° angular intervals
          ` : activeTool === 'circle' ? `
            • <b>Drag</b>: Free size circle from corner<br/>
            • <b>Shift + Drag</b>: Expand circle outward from center
          ` : `
            • <b>Drag</b>: Free size from corner<br/>
            • <b>Shift + Drag</b>: Expand from center<br/>
            • <b>Ctrl + Drag</b>: 1:1 Aspect Ratio (Square/Regular)<br/>
            • <b>Alt + Drag</b>: Fixed Aspect Ratio (${shapeConfig.aspectRatioW}:${shapeConfig.aspectRatioH})<br/>
            • <b>Ctrl + Shift</b>: 1:1 Ratio from center<br/>
            • <b>Alt + Shift</b>: Fixed ratio (${shapeConfig.aspectRatioW}:${shapeConfig.aspectRatioH}) from center
          `}
        </div>
      </div>
    `;

    const presetSelect = container.querySelector<HTMLSelectElement>('#shape-aspect-preset');
    const ratioWInput = container.querySelector<HTMLInputElement>('#shape-ratio-w');
    const ratioHInput = container.querySelector<HTMLInputElement>('#shape-ratio-h');
    const starPointsInput = container.querySelector<HTMLInputElement>('#star-points');
    const starInnerRatioInput = container.querySelector<HTMLInputElement>('#star-inner-ratio');
    const polygonSidesInput = container.querySelector<HTMLInputElement>('#polygon-sides');
    const rectRadiusInput = container.querySelector<HTMLInputElement>('#rect-corner-radius');

    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const val = presetSelect.value;
        if (val !== 'custom') {
          const [w, h] = val.split(':').map(Number);
          shapeConfig.aspectRatioW = w;
          shapeConfig.aspectRatioH = h;
          if (ratioWInput) ratioWInput.value = w.toString();
          if (ratioHInput) ratioHInput.value = h.toString();
          if (callbacks.onUpdateShapeConfig) callbacks.onUpdateShapeConfig(shapeConfig);
        }
      });
    }

    if (ratioWInput) {
      ratioWInput.addEventListener('input', () => {
        const val = parseFloat(ratioWInput.value);
        if (!isNaN(val) && val > 0) {
          shapeConfig.aspectRatioW = val;
          if (callbacks.onUpdateShapeConfig) callbacks.onUpdateShapeConfig(shapeConfig);
        }
      });
    }

    if (ratioHInput) {
      ratioHInput.addEventListener('input', () => {
        const val = parseFloat(ratioHInput.value);
        if (!isNaN(val) && val > 0) {
          shapeConfig.aspectRatioH = val;
          if (callbacks.onUpdateShapeConfig) callbacks.onUpdateShapeConfig(shapeConfig);
        }
      });
    }

    if (starPointsInput) {
      starPointsInput.addEventListener('input', () => {
        const val = parseInt(starPointsInput.value, 10);
        if (!isNaN(val) && val >= 3) {
          shapeConfig.starPoints = val;
          if (callbacks.onUpdateShapeConfig) callbacks.onUpdateShapeConfig(shapeConfig);
        }
      });
    }

    if (starInnerRatioInput) {
      starInnerRatioInput.addEventListener('input', () => {
        const val = parseFloat(starInnerRatioInput.value);
        if (!isNaN(val) && val > 0 && val < 1) {
          shapeConfig.starInnerRatio = val;
          if (callbacks.onUpdateShapeConfig) callbacks.onUpdateShapeConfig(shapeConfig);
        }
      });
    }

    if (polygonSidesInput) {
      polygonSidesInput.addEventListener('input', () => {
        const val = parseInt(polygonSidesInput.value, 10);
        if (!isNaN(val) && val >= 3) {
          shapeConfig.polygonSides = val;
          if (callbacks.onUpdateShapeConfig) callbacks.onUpdateShapeConfig(shapeConfig);
        }
      });
    }

    if (rectRadiusInput) {
      rectRadiusInput.addEventListener('input', () => {
        const val = parseFloat(rectRadiusInput.value);
        if (!isNaN(val) && val >= 0) {
          shapeConfig.rectCornerRadius = val;
          if (callbacks.onUpdateShapeConfig) callbacks.onUpdateShapeConfig(shapeConfig);
        }
      });
    }
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
    const rawCx = el.attributes['cx'];
    const rawCy = el.attributes['cy'];
    const rawRx = el.attributes['rx'] || el.attributes['r'];
    const rawRy = el.attributes['ry'] || el.attributes['r'];

    /**
     * ARCHITECTURAL RATIONALE: Canonical Primitive Geometry vs AABB Fallback (FIX-20)
     * Evaluates native element parametric attributes ('cx', 'cy', 'rx', 'ry', 'r') as primary ground truth.
     * Naive reliance on `box` (BoundingBox) causes catastrophic geometric deformation when an ellipse is
     * converted to an arc or pie wedge (< 360°): the visual bounding box of a 90° or 60° arc only spans a fraction
     * of the circle's radius and has an eccentric center, halving or distorting radii upon subsequent angle changes.
     * `box` is strictly retained as a fallback for non-parametric imported paths with 4-point bezier curvature.
     */
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
    const starInnerPct = Math.round(starInnerRatio * 100);
    const lineX1 = parseFloat(el.attributes.x1 || (el.vertices && el.vertices[0] ? el.vertices[0].x.toString() : '0'));
    const lineY1 = parseFloat(el.attributes.y1 || (el.vertices && el.vertices[0] ? el.vertices[0].y.toString() : '0'));
    const lineX2 = parseFloat(el.attributes.x2 || (el.vertices && el.vertices[1] ? el.vertices[1].x.toString() : '100'));
    const lineY2 = parseFloat(el.attributes.y2 || (el.vertices && el.vertices[1] ? el.vertices[1].y.toString() : '100'));
    const lineLength = Math.round(Math.hypot(lineX2 - lineX1, lineY2 - lineY1) * 10) / 10;
    const lineAngle = Math.round((Math.atan2(lineY2 - lineY1, lineX2 - lineX1) * 180) / Math.PI);

    let html = '';

    if (isEllipse) {
      const badgeText = ellipseInnerRatio > 0
        ? (ellipseType === 'pie' ? '◔ Rosca parcial' : '🍩 Rosca')
        : (ellipseType === 'pie' ? '◔ Tarta' : ellipseType === 'arc' ? '◜ Arco' : isCircle ? '● Círculo' : '⬭ Elipse');

      html += `
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

    if (isRect) {
      html += `
      <!-- Rectangle Geometry & Advanced Corner Radii Controls (FEAT-03) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Rectángulo</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${rectCorners.mode === 'uniform' ? '⬭ Uniforme' : '◳ Individual'}
          </span>
        </div>

        <div class="prop-row" style="gap: 4px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="Modo de curvatura de esquinas">Modo</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-rect-mode-uniform" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.mode === 'uniform' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Todas las esquinas comparten el mismo radio">Uniforme</button>
            <button class="prop-input" id="btn-rect-mode-independent" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.mode === 'independent' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Configurar radios individuales por esquina (TL, TR, BR, BL)">Individual</button>
          </div>
        </div>

        <div class="prop-row" style="gap: 4px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="Unidad de medida: píxeles (px) o porcentaje (%)">Unidad</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-rect-unit-px" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.unit === 'px' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Radio en píxeles absolutos (px)">px</button>
            <button class="prop-input" id="btn-rect-unit-pct" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.unit === '%' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Radio en porcentaje (%)">%</button>
          </div>
        </div>

        <div id="rect-uniform-container" style="${rectCorners.mode === 'uniform' ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Radio de curvatura para todas las esquinas">Radio</span>
            <div class="prop-coord-box" style="flex:1;">
              <span class="prop-coord-sublabel">R</span>
              <input type="number" class="prop-coord-input" id="rect-uniform-radius" value="${rectCorners.tl}" min="0" max="${rectCorners.unit === '%' ? 50 : Math.round(Math.min(w, h) / 2)}" step="1" />
              <span class="prop-coord-sublabel">${rectCorners.unit}</span>
            </div>
          </div>
          <div class="prop-row" style="gap: 3px;">
            <button class="prop-input" id="btn-rect-preset-0" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Esquinas rectas (0)">0</button>
            <button class="prop-input" id="btn-rect-preset-5" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Radio 5">5</button>
            <button class="prop-input" id="btn-rect-preset-10" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Radio 10">10</button>
            <button class="prop-input" id="btn-rect-preset-20" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Radio 20">20</button>
            <button class="prop-input" id="btn-rect-preset-pill" style="flex:1.4; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Redondeo máximo (Píldora)">Píldora</button>
          </div>
        </div>

        <div id="rect-independent-container" style="${rectCorners.mode === 'independent' ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Esquinas superiores: Izquierda (TL) y Derecha (TR)">Arriba</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Esquina Superior Izquierda (Top-Left)">
                <span class="prop-coord-sublabel">TL</span>
                <input type="number" class="prop-coord-input" id="rect-corner-tl" value="${rectCorners.tl}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
              <div class="prop-coord-box" title="Esquina Superior Derecha (Top-Right)">
                <span class="prop-coord-sublabel">TR</span>
                <input type="number" class="prop-coord-input" id="rect-corner-tr" value="${rectCorners.tr}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
            </div>
          </div>
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Esquinas inferiores: Izquierda (BL) y Derecha (BR)">Abajo</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Esquina Inferior Izquierda (Bottom-Left)">
                <span class="prop-coord-sublabel">BL</span>
                <input type="number" class="prop-coord-input" id="rect-corner-bl" value="${rectCorners.bl}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
              <div class="prop-coord-box" title="Esquina Inferior Derecha (Bottom-Right)">
                <span class="prop-coord-sublabel">BR</span>
                <input type="number" class="prop-coord-input" id="rect-corner-br" value="${rectCorners.br}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
            </div>
          </div>
          <div class="prop-row" style="gap: 4px;">
            <button class="prop-input" id="btn-rect-sync-tl" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Copiar el valor de TL a todas las esquinas">Copiar TL</button>
            <button class="prop-input" id="btn-rect-invert-corners" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Intercambiar / Alternar radios de esquinas opuestas">⇄ Alternar</button>
          </div>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-rect-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curvas Bézier independientes (Ctrl+Q)">Convertir a Curvas</button>
        </div>
      </div>
      `;
    }

    if (isLine) {
      html += `
      <!-- Line Geometry Controls (FEAT-04) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Línea Recta (&lt;line&gt;)</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${lineLength}px (${lineAngle}°)
          </span>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Punto inicial (x1, y1)">Inicio</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X1 de inicio">
              <span class="prop-coord-sublabel">X1</span>
              <input type="number" class="prop-coord-input" id="line-x1" value="${Math.round(lineX1)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y1 de inicio">
              <span class="prop-coord-sublabel">Y1</span>
              <input type="number" class="prop-coord-input" id="line-y1" value="${Math.round(lineY1)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="Punto final (x2, y2)">Fin</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X2 de final">
              <span class="prop-coord-sublabel">X2</span>
              <input type="number" class="prop-coord-input" id="line-x2" value="${Math.round(lineX2)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y2 de final">
              <span class="prop-coord-sublabel">Y2</span>
              <input type="number" class="prop-coord-input" id="line-y2" value="${Math.round(lineY2)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-line-reverse" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Invertir extremos (intercambiar X1/Y1 con X2/Y2)">⇄ Invertir Puntos</button>
          <button class="prop-input" id="btn-line-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curva Bézier independiente (Ctrl+Q)">Convertir a Curvas</button>
        </div>
      </div>
      `;
    }

    if (isPolyline || isPolygon) {
      html += `
      <!-- Polyline / Polygon Geometry Controls (FEAT-04) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${isPolygon ? 'Polígono (&lt;polygon&gt;)' : 'Polilínea (&lt;polyline&gt;)'}</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${el.vertices ? el.vertices.length : 0} vértices
          </span>
        </div>
        <div class="prop-row" style="margin-top: 4px;">
          <span class="prop-label">Puntos</span>
          <span style="font-size:11px; color:var(--text-muted); flex:1; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${el.attributes.points || ''}">
            ${el.attributes.points || '0 puntos'}
          </span>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-poly-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a trazado con curvas Bézier libres (Ctrl+Q)">Convertir a Curvas</button>
        </div>
      </div>
      `;
    }

    if (isStar) {
      html += `
      <!-- Star Geometry Controls (FEAT-07) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Estrella Paramétrica</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ★ ${starPoints} puntas (${starInnerPct}%)
          </span>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Coordenadas del centro de la estrella">Centro</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X del centro de la estrella">
              <span class="prop-coord-sublabel">X</span>
              <input type="number" class="prop-coord-input" id="star-cx" value="${Math.round(starCx)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y del centro de la estrella">
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
          <button class="prop-input" id="btn-star-make-uniform" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Hacer radios Rx y Ry iguales (Estrella regular 1:1)">1:1 Regular</button>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="Número de puntas de la estrella (3 a 64)">Puntas</span>
          <input type="number" class="prop-coord-input" id="star-points" value="${starPoints}" min="3" max="64" step="1" style="flex: 1;" />
        </div>
        <div class="prop-row" style="gap: 4px;">
          <button class="prop-input" id="btn-star-preset-3" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;">3</button>
          <button class="prop-input" id="btn-star-preset-4" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;">4</button>
          <button class="prop-input" id="btn-star-preset-5" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;">5</button>
          <button class="prop-input" id="btn-star-preset-6" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;">6</button>
          <button class="prop-input" id="btn-star-preset-8" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;">8</button>
          <button class="prop-input" id="btn-star-preset-12" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;">12</button>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="Radio interior (profundidad de las puntas en %)">Radio int.</span>
          <div style="flex: 1; display: flex; align-items: center; gap: 4px;">
            <input type="range" id="star-inner-ratio-slider" min="5" max="95" step="1" value="${starInnerPct}" style="flex: 1; accent-color: var(--accent-color); cursor: pointer;" />
            <input type="number" class="prop-coord-input" id="star-inner-ratio-num" value="${starInnerPct}" min="5" max="95" step="1" style="width: 38px; text-align: center;" />
            <span style="font-size: 10px; color: var(--text-muted);">%</span>
          </div>
        </div>
        <div class="prop-row" style="gap: 4px;">
          <button class="prop-input" id="btn-star-ratio-20" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Puntas muy afiladas (20%)">20% Aguda</button>
          <button class="prop-input" id="btn-star-ratio-38" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Proporción áurea clásica (38.2%)">38% Áurea</button>
          <button class="prop-input" id="btn-star-ratio-50" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Equilibrada estándar (50%)">50% Media</button>
          <button class="prop-input" id="btn-star-ratio-70" style="flex:1; cursor:pointer; font-size:9px; height:20px; padding:0;" title="Puntas suaves / estrella gruesa (70%)">70% Suave</button>
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
    const rawCx = el.attributes['cx'];
    const rawCy = el.attributes['cy'];
    const rawRx = el.attributes['rx'] || el.attributes['r'];
    const rawRy = el.attributes['ry'] || el.attributes['r'];

    /**
     * ARCHITECTURAL RATIONALE: Canonical Primitive Geometry vs AABB Fallback (FIX-20)
     * Evaluates native element parametric attributes ('cx', 'cy', 'rx', 'ry', 'r') as primary ground truth.
     * Naive reliance on `box` (BoundingBox) causes catastrophic geometric deformation when an ellipse is
     * converted to an arc or pie wedge (< 360°): the visual bounding box of a 90° or 60° arc only spans a fraction
     * of the circle's radius and has an eccentric center, halving or distorting radii upon subsequent angle changes.
     * `box` is strictly retained as a fallback for non-parametric imported paths with 4-point bezier curvature.
     */
    const ellipseCx = rawCx !== undefined ? parseFloat(rawCx) : (box ? box.cx : 0);
    const ellipseCy = rawCy !== undefined ? parseFloat(rawCy) : (box ? box.cy : 0);
    const ellipseRx = rawRx !== undefined ? parseFloat(rawRx) : (box ? box.width / 2 : 0);
    const ellipseRy = rawRy !== undefined ? parseFloat(rawRy) : (box ? box.height / 2 : 0);
    const ellipseType = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
    const ellipseStartAngle = Math.round(parseFloat(el.attributes['data-start-angle'] || '0'));
    const ellipseEndAngle = Math.round(parseFloat(el.attributes['data-end-angle'] || '360'));

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
    const lineX1 = parseFloat(el.attributes.x1 || (el.vertices && el.vertices[0] ? el.vertices[0].x.toString() : '0'));
    const lineY1 = parseFloat(el.attributes.y1 || (el.vertices && el.vertices[0] ? el.vertices[0].y.toString() : '0'));
    const lineX2 = parseFloat(el.attributes.x2 || (el.vertices && el.vertices[1] ? el.vertices[1].x.toString() : '100'));
    const lineY2 = parseFloat(el.attributes.y2 || (el.vertices && el.vertices[1] ? el.vertices[1].y.toString() : '100'));

    // Ellipse / Circle Event Bindings
    if (isEllipse && (box || rawCx !== undefined)) {
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
          let s = parseFloat(inputStartAngle.value) || 0;
          let e = parseFloat(inputEndAngle.value) || 0;
          s = ((s % 360) + 360) % 360;
          e = ((e % 360) + 360) % 360;
          if (s === e) e = (s + 360);
          const { cx, cy, rx, ry } = getCurGeometry();
          applyEllipseGeometry(cx, cy, rx, ry, ellipseType === 'ellipse' ? 'pie' : ellipseType, s, e);
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

    /**
     * ARCHITECTURAL RATIONALE: Interactive Parametric Rect Corner Inspector (FEAT-03)
     * Provides live bidirectional synchronization between the UI inputs (uniform radius, 4-corner inputs,
     * unit toggle px/%, mode toggle uniform/individual, quick presets) and the vector element model.
     */
    if (isRect && box) {
      const applyRectGeometry = (
        newCorners: RectCorners
      ) => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();

        const rx = parseFloat(el.attributes.x || '0');
        const ry = parseFloat(el.attributes.y || '0');
        const rw = parseFloat(el.attributes.width || '100');
        const rh = parseFloat(el.attributes.height || '100');

        el.attributes['data-corner-mode'] = newCorners.mode;
        el.attributes['data-corner-unit'] = newCorners.unit;
        el.attributes['data-corner-tl'] = newCorners.tl.toString();
        el.attributes['data-corner-tr'] = newCorners.tr.toString();
        el.attributes['data-corner-br'] = newCorners.br.toString();
        el.attributes['data-corner-bl'] = newCorners.bl.toString();
        el.attributes['data-corner-radius'] = `${newCorners.tl},${newCorners.tr},${newCorners.br},${newCorners.bl}`;

        if (newCorners.mode === 'uniform') {
          el.attributes['rx'] = newCorners.unit === '%' ? `${newCorners.tl}%` : newCorners.tl.toString();
          el.attributes['ry'] = el.attributes['rx'];
        } else {
          delete el.attributes['rx'];
          delete el.attributes['ry'];
        }

        const eff = model.calculateEffectiveCorners(rw, rh, newCorners);
        el.vertices = model.convertRectToVertices(rx, ry, rw, rh, eff.tl, eff.tr, eff.br, eff.bl);
        el.attributes.d = model.compilePathD(el.vertices, true);
        el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');

        callbacks.onUpdateElement(el);
        onReRender();
      };

      const btnModeUniform = container.querySelector<HTMLButtonElement>('#btn-rect-mode-uniform');
      const btnModeIndependent = container.querySelector<HTMLButtonElement>('#btn-rect-mode-independent');
      const btnUnitPx = container.querySelector<HTMLButtonElement>('#btn-rect-unit-px');
      const btnUnitPct = container.querySelector<HTMLButtonElement>('#btn-rect-unit-pct');
      const inputUniformRadius = container.querySelector<HTMLInputElement>('#rect-uniform-radius');
      const inputTL = container.querySelector<HTMLInputElement>('#rect-corner-tl');
      const inputTR = container.querySelector<HTMLInputElement>('#rect-corner-tr');
      const inputBR = container.querySelector<HTMLInputElement>('#rect-corner-br');
      const inputBL = container.querySelector<HTMLInputElement>('#rect-corner-bl');
      const btnPreset0 = container.querySelector<HTMLButtonElement>('#btn-rect-preset-0');
      const btnPreset5 = container.querySelector<HTMLButtonElement>('#btn-rect-preset-5');
      const btnPreset10 = container.querySelector<HTMLButtonElement>('#btn-rect-preset-10');
      const btnPreset20 = container.querySelector<HTMLButtonElement>('#btn-rect-preset-20');
      const btnPresetPill = container.querySelector<HTMLButtonElement>('#btn-rect-preset-pill');
      const btnSyncTL = container.querySelector<HTMLButtonElement>('#btn-rect-sync-tl');
      const btnInvertCorners = container.querySelector<HTMLButtonElement>('#btn-rect-invert-corners');
      const btnRectToPath = container.querySelector<HTMLButtonElement>('#btn-rect-to-path');

      btnModeUniform?.addEventListener('click', () => {
        applyRectGeometry({
          ...rectCorners,
          mode: 'uniform',
          tr: rectCorners.tl,
          br: rectCorners.tl,
          bl: rectCorners.tl,
        });
      });

      btnModeIndependent?.addEventListener('click', () => {
        applyRectGeometry({
          ...rectCorners,
          mode: 'independent',
        });
      });

      btnUnitPx?.addEventListener('click', () => {
        if (rectCorners.unit === 'px') return;
        const maxR = Math.min(w, h) / 2;
        const toPx = (pct: number) => Math.round((pct / 50) * maxR);
        applyRectGeometry({
          ...rectCorners,
          unit: 'px',
          tl: toPx(rectCorners.tl),
          tr: toPx(rectCorners.tr),
          br: toPx(rectCorners.br),
          bl: toPx(rectCorners.bl),
        });
      });

      btnUnitPct?.addEventListener('click', () => {
        if (rectCorners.unit === '%') return;
        const maxR = Math.min(w, h) / 2;
        const toPct = (pxVal: number) => Math.min(50, Math.round((pxVal / (maxR || 1)) * 50));
        applyRectGeometry({
          ...rectCorners,
          unit: '%',
          tl: toPct(rectCorners.tl),
          tr: toPct(rectCorners.tr),
          br: toPct(rectCorners.br),
          bl: toPct(rectCorners.bl),
        });
      });

      inputUniformRadius?.addEventListener('change', () => {
        const val = Math.max(0, parseFloat(inputUniformRadius.value) || 0);
        applyRectGeometry({
          ...rectCorners,
          tl: val,
          tr: val,
          br: val,
          bl: val,
        });
      });

      const onIndependentCornersChange = () => {
        const tl = Math.max(0, parseFloat(inputTL?.value || '0') || 0);
        const tr = Math.max(0, parseFloat(inputTR?.value || '0') || 0);
        const br = Math.max(0, parseFloat(inputBR?.value || '0') || 0);
        const bl = Math.max(0, parseFloat(inputBL?.value || '0') || 0);
        applyRectGeometry({
          ...rectCorners,
          mode: 'independent',
          tl,
          tr,
          br,
          bl,
        });
      };

      inputTL?.addEventListener('change', onIndependentCornersChange);
      inputTR?.addEventListener('change', onIndependentCornersChange);
      inputBR?.addEventListener('change', onIndependentCornersChange);
      inputBL?.addEventListener('change', onIndependentCornersChange);

      btnPreset0?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 0, tr: 0, br: 0, bl: 0 });
      });
      btnPreset5?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 5, tr: 5, br: 5, bl: 5 });
      });
      btnPreset10?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 10, tr: 10, br: 10, bl: 10 });
      });
      btnPreset20?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 20, tr: 20, br: 20, bl: 20 });
      });
      btnPresetPill?.addEventListener('click', () => {
        const maxVal = rectCorners.unit === '%' ? 50 : Math.round(Math.min(w, h) / 2);
        applyRectGeometry({ ...rectCorners, tl: maxVal, tr: maxVal, br: maxVal, bl: maxVal });
      });

      btnSyncTL?.addEventListener('click', () => {
        const tl = rectCorners.tl;
        applyRectGeometry({ ...rectCorners, tl, tr: tl, br: tl, bl: tl });
      });

      btnInvertCorners?.addEventListener('click', () => {
        applyRectGeometry({
          ...rectCorners,
          tl: rectCorners.br,
          tr: rectCorners.bl,
          br: rectCorners.tl,
          bl: rectCorners.tr,
        });
      });

      btnRectToPath?.addEventListener('click', () => {
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

    if (isLine) {
      const lineX1Input = container.querySelector<HTMLInputElement>('#line-x1');
      const lineY1Input = container.querySelector<HTMLInputElement>('#line-y1');
      const lineX2Input = container.querySelector<HTMLInputElement>('#line-x2');
      const lineY2Input = container.querySelector<HTMLInputElement>('#line-y2');
      const btnLineReverse = container.querySelector<HTMLButtonElement>('#btn-line-reverse');
      const btnLineToPath = container.querySelector<HTMLButtonElement>('#btn-line-to-path');

      const applyLineCoordinates = (x1: number, y1: number, x2: number, y2: number) => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes.x1 = x1.toString();
        el.attributes.y1 = y1.toString();
        el.attributes.x2 = x2.toString();
        el.attributes.y2 = y2.toString();
        el.vertices = model.convertShapeToVertices('line', el.attributes);
        el.attributes.d = model.compilePathD(el.vertices, false);
        callbacks.onUpdateElement(el);
        onReRender();
      };

      lineX1Input?.addEventListener('change', () => {
        const x1 = parseFloat(lineX1Input.value) || 0;
        applyLineCoordinates(x1, lineY1, lineX2, lineY2);
      });
      lineY1Input?.addEventListener('change', () => {
        const y1 = parseFloat(lineY1Input.value) || 0;
        applyLineCoordinates(lineX1, y1, lineX2, lineY2);
      });
      lineX2Input?.addEventListener('change', () => {
        const x2 = parseFloat(lineX2Input.value) || 0;
        applyLineCoordinates(lineX1, lineY1, x2, lineY2);
      });
      lineY2Input?.addEventListener('change', () => {
        const y2 = parseFloat(lineY2Input.value) || 0;
        applyLineCoordinates(lineX1, lineY1, lineX2, y2);
      });

      btnLineReverse?.addEventListener('click', () => {
        applyLineCoordinates(lineX2, lineY2, lineX1, lineY1);
      });

      btnLineToPath?.addEventListener('click', () => {
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

    if (isPolyline || isPolygon) {
      const btnPolyToPath = container.querySelector<HTMLButtonElement>('#btn-poly-to-path');
      btnPolyToPath?.addEventListener('click', () => {
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
        const clampedInner = Math.max(0.05, Math.min(0.95, newInnerRatio));

        el.attributes['data-shape'] = 'star';
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
          valPct = Math.max(5, Math.min(95, valPct));
          starInnerSlider.value = valPct.toString();
          const { cx, cy, rx, ry } = getCurStarGeometry();
          applyStarGeometry(cx, cy, rx, ry, starPoints, valPct / 100);
        });
      }

      const ratioPresets: { id: string; ratio: number }[] = [
        { id: '#btn-star-ratio-20', ratio: 0.20 },
        { id: '#btn-star-ratio-38', ratio: 0.382 },
        { id: '#btn-star-ratio-50', ratio: 0.50 },
        { id: '#btn-star-ratio-70', ratio: 0.70 },
      ];
      for (const preset of ratioPresets) {
        const btn = container.querySelector<HTMLButtonElement>(preset.id);
        btn?.addEventListener('click', () => {
          const { cx, cy, rx, ry } = getCurStarGeometry();
          applyStarGeometry(cx, cy, rx, ry, starPoints, preset.ratio);
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
