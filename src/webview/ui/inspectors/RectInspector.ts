import { VectorElement, VectorModel, RectCorners } from '../../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../../engine/SelectionTool.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Rectangle & Advanced Corner Inspector (RectInspector)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates UI rendering and interactive event handlers for rectangle geometry,
 *    uniform vs independent corner modes, px vs % unit scaling, quick radius presets
 *    (0, 5, 10, 20, pill), TL synchronization, and corner inversion.
 *
 * 2. Real-Time Bidirectional Synchronization (FEAT-03):
 *    Maintains reactive synchronization between input fields, corner mode switches,
 *    live effective corner calculations (`calculateEffectiveCorners`), and serialized
 *    parametric attributes without de-structuring the native rectangle.
 */
export class RectInspector {
  public static render(
    el: VectorElement,
    model: VectorModel,
    box: BoundingBox | null
  ): string {
    const w = box ? Math.round(box.width) : 0;
    const h = box ? Math.round(box.height) : 0;
    const rectCorners = model.getRectCorners(el, w, h);

    return `
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

  public static bind(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    box: BoundingBox,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    const rectCorners = model.getRectCorners(el, w, h);

    const applyRectGeometry = (newCorners: RectCorners) => {
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
}
