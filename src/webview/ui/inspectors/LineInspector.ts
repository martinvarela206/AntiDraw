import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { I18nService } from '../../i18n/index.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Line, Polyline & Polygon Inspector (LineInspector)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates UI rendering and interactive event handlers for linear SVG elements
 *    (`<line>`, `<polyline>`, and `<polygon>`).
 *
 * 2. Real-Time Bidirectional Geometric Synchronization (FEAT-04):
 *    Extracts origin (`x1`, `y1`) and destination (`x2`, `y2`) coordinates with fallback to vertex arrays,
 *    analytically calculates Euclidean length and polar angle in degrees, and supports coordinate inversion
 *    (`⇄ Invertir Puntos`) as well as lossless conversion to freeform Bézier curves (`<path>`).
 */
export class LineInspector {
  public static render(el: VectorElement, model: VectorModel): string {
    const isLine = model.isLine(el);
    const isPolyline = model.isPolyline(el);
    const isPolygon = model.isPolygon(el);

    let html = '';

    if (isLine) {
      const lineX1 = parseFloat(el.attributes.x1 || (el.vertices && el.vertices[0] ? el.vertices[0].x.toString() : '0'));
      const lineY1 = parseFloat(el.attributes.y1 || (el.vertices && el.vertices[0] ? el.vertices[0].y.toString() : '0'));
      const lineX2 = parseFloat(el.attributes.x2 || (el.vertices && el.vertices[1] ? el.vertices[1].x.toString() : '100'));
      const lineY2 = parseFloat(el.attributes.y2 || (el.vertices && el.vertices[1] ? el.vertices[1].y.toString() : '100'));
      const lineLength = Math.round(Math.hypot(lineX2 - lineX1, lineY2 - lineY1) * 10) / 10;
      const lineAngle = Math.round((Math.atan2(lineY2 - lineY1, lineX2 - lineX1) * 180) / Math.PI);

      html += `
      <!-- Line Geometry Controls (FEAT-04) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${I18nService.t('inspector.straightLine')} (&lt;line&gt;)</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${lineLength}px (${lineAngle}°)
          </span>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="${I18nService.t('inspector.startPointTitle')}">${I18nService.t('inspector.startPoint')}</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="${I18nService.t('inspector.startCoordXTitle')}">
              <span class="prop-coord-sublabel">X1</span>
              <input type="number" class="prop-coord-input" id="line-x1" value="${Math.round(lineX1)}" />
            </div>
            <div class="prop-coord-box" title="${I18nService.t('inspector.startCoordYTitle')}">
              <span class="prop-coord-sublabel">Y1</span>
              <input type="number" class="prop-coord-input" id="line-y1" value="${Math.round(lineY1)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="${I18nService.t('inspector.endPointTitle')}">${I18nService.t('inspector.endPoint')}</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="${I18nService.t('inspector.endCoordXTitle')}">
              <span class="prop-coord-sublabel">X2</span>
              <input type="number" class="prop-coord-input" id="line-x2" value="${Math.round(lineX2)}" />
            </div>
            <div class="prop-coord-box" title="${I18nService.t('inspector.endCoordYTitle')}">
              <span class="prop-coord-sublabel">Y2</span>
              <input type="number" class="prop-coord-input" id="line-y2" value="${Math.round(lineY2)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-line-reverse" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="${I18nService.t('inspector.reversePointsTitle')}">⇄ ${I18nService.t('inspector.reversePoints')}</button>
          <button class="prop-input" id="btn-line-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="${I18nService.t('inspector.convertToCurves')} (Ctrl+Q)">${I18nService.t('inspector.convertToCurves')}</button>
        </div>
      </div>
      `;
    }

    if (isPolyline || isPolygon) {
      html += `
      <!-- Polyline / Polygon Geometry Controls (FEAT-04) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${isPolygon ? `${I18nService.t('toolbar.polygon')} (&lt;polygon&gt;)` : `${I18nService.t('toolbar.polyline')} (&lt;polyline&gt;)`}</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${el.vertices ? el.vertices.length : 0} ${I18nService.t('inspector.vertices')}
          </span>
        </div>
        <div class="prop-row" style="margin-top: 4px;">
          <span class="prop-label">${I18nService.t('inspector.pointsLabel')}</span>
          <span style="font-size:11px; color:var(--text-muted); flex:1; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${el.attributes.points || ''}">
            ${el.attributes.points || I18nService.t('inspector.pointsZero')}
          </span>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-poly-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="${I18nService.t('inspector.convertToCurves')} (Ctrl+Q)">${I18nService.t('inspector.convertToCurves')}</button>
        </div>
      </div>
      `;
    }

    return html;
  }

  public static bind(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const isLine = model.isLine(el);
    const isPolyline = model.isPolyline(el);
    const isPolygon = model.isPolygon(el);

    if (isLine) {
      const lineX1 = parseFloat(el.attributes.x1 || (el.vertices && el.vertices[0] ? el.vertices[0].x.toString() : '0'));
      const lineY1 = parseFloat(el.attributes.y1 || (el.vertices && el.vertices[0] ? el.vertices[0].y.toString() : '0'));
      const lineX2 = parseFloat(el.attributes.x2 || (el.vertices && el.vertices[1] ? el.vertices[1].x.toString() : '100'));
      const lineY2 = parseFloat(el.attributes.y2 || (el.vertices && el.vertices[1] ? el.vertices[1].y.toString() : '100'));

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
  }
}
