import { VectorElement, VectorModel, RectCorners } from '../../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../../engine/SelectionTool.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { I18nService } from '../../i18n/index.js';

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
          <span>${I18nService.t('toolbar.rect')}</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${rectCorners.mode === 'uniform' ? '⬭ ' + I18nService.t('inspector.cornersUnified') : '◳ ' + I18nService.t('inspector.cornersIndependent')}
          </span>
        </div>

        <div class="prop-row" style="gap: 4px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="${I18nService.t('inspector.cornerModeTooltip')}">${I18nService.t('inspector.mode')}</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-rect-mode-uniform" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.mode === 'uniform' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="${I18nService.t('inspector.cornersUnified')}">${I18nService.t('inspector.cornersUnified')}</button>
            <button class="prop-input" id="btn-rect-mode-independent" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.mode === 'independent' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="${I18nService.t('inspector.cornersIndependent')}">${I18nService.t('inspector.cornersIndependent')}</button>
          </div>
        </div>

        <div class="prop-row" style="gap: 4px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="${I18nService.t('inspector.unitTooltip')}">${I18nService.t('inspector.unit')}</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-rect-unit-px" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.unit === 'px' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="px">px</button>
            <button class="prop-input" id="btn-rect-unit-pct" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.unit === '%' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="%">%</button>
          </div>
        </div>

        <div id="rect-uniform-container" style="${rectCorners.mode === 'uniform' ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="${I18nService.t('inspector.radiusTooltip')}">${I18nService.t('common.radius')}</span>
            <div class="prop-coord-box" style="flex:1;">
              <span class="prop-coord-sublabel">R</span>
              <input type="number" class="prop-coord-input" id="rect-uniform-radius" value="${rectCorners.tl}" min="0" max="${rectCorners.unit === '%' ? 50 : Math.round(Math.min(w, h) / 2)}" step="1" />
              <span class="prop-coord-sublabel">${rectCorners.unit}</span>
            </div>
          </div>
          <div class="prop-row" style="gap: 3px;">
            <button class="prop-input" id="btn-rect-preset-0" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="0">0</button>
            <button class="prop-input" id="btn-rect-preset-5" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="5">5</button>
            <button class="prop-input" id="btn-rect-preset-10" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="10">10</button>
            <button class="prop-input" id="btn-rect-preset-20" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="20">20</button>
            <button class="prop-input" id="btn-rect-preset-pill" style="flex:1.4; cursor:pointer; font-size:9px; height:22px; padding:0;" title="${I18nService.t('inspector.pill')}">${I18nService.t('inspector.pill')}</button>
          </div>
        </div>

        <div id="rect-independent-container" style="${rectCorners.mode === 'independent' ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="${I18nService.t('inspector.topCorners')}">${I18nService.t('inspector.topCorners')}</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Top-Left (TL)">
                <span class="prop-coord-sublabel">TL</span>
                <input type="number" class="prop-coord-input" id="rect-corner-tl" value="${rectCorners.tl}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
              <div class="prop-coord-box" title="Top-Right (TR)">
                <span class="prop-coord-sublabel">TR</span>
                <input type="number" class="prop-coord-input" id="rect-corner-tr" value="${rectCorners.tr}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
            </div>
          </div>
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="${I18nService.t('inspector.bottomCorners')}">${I18nService.t('inspector.bottomCorners')}</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Bottom-Left (BL)">
                <span class="prop-coord-sublabel">BL</span>
                <input type="number" class="prop-coord-input" id="rect-corner-bl" value="${rectCorners.bl}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
              <div class="prop-coord-box" title="Bottom-Right (BR)">
                <span class="prop-coord-sublabel">BR</span>
                <input type="number" class="prop-coord-input" id="rect-corner-br" value="${rectCorners.br}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
            </div>
          </div>
          <div class="prop-row" style="gap: 4px;">
            <button class="prop-input" id="btn-rect-unify-corners" style="flex:1.2; cursor:pointer; font-size:9px; height:22px; padding:0; font-weight:600;" title="${I18nService.t('inspector.unifyCorners')}">⬭ ${I18nService.t('inspector.unifyCorners')}</button>
            <button class="prop-input" id="btn-rect-sync-tl" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="${I18nService.t('inspector.copyTL')}">${I18nService.t('inspector.copyTL')}</button>
            <button class="prop-input" id="btn-rect-invert-corners" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="${I18nService.t('inspector.invertCorners')}">⇄ ${I18nService.t('inspector.invertCorners')}</button>
          </div>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-rect-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="${I18nService.t('inspector.convertToCurves')} (Ctrl+Q)">${I18nService.t('inspector.convertToCurves')}</button>
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

      const isUniform =
        newCorners.mode === 'uniform' ||
        (newCorners.tl === newCorners.tr && newCorners.tr === newCorners.br && newCorners.br === newCorners.bl && newCorners.unit === 'px');

      if (isUniform && newCorners.unit === 'px') {
        el.tagName = 'rect';
        el.shapeType = 'rect';
        el.isParametric = true;
        el.attributes['data-shape'] = 'rect';
        el.attributes['data-parametric'] = 'true';
        el.attributes['data-corner-mode'] = 'uniform';
        if (newCorners.tl > 0) {
          el.attributes['rx'] = newCorners.tl.toString();
          el.attributes['ry'] = newCorners.tl.toString();
        } else {
          delete el.attributes['rx'];
          delete el.attributes['ry'];
        }
        delete el.attributes.d;
      } else {
        el.tagName = 'path';
        el.shapeType = 'rect';
        el.isParametric = true;
        el.attributes['data-shape'] = 'rect';
        el.attributes['data-parametric'] = 'true';
        el.attributes['data-corner-mode'] = 'independent';
        delete el.attributes['rx'];
        delete el.attributes['ry'];
      }

      el.attributes['data-rect-x'] = el.attributes.x || '0';
      el.attributes['data-rect-y'] = el.attributes.y || '0';
      el.attributes['data-rect-w'] = el.attributes.width || '100';
      el.attributes['data-rect-h'] = el.attributes.height || '100';

      const eff = model.calculateEffectiveCorners(rw, rh, newCorners);
      el.vertices = model.convertRectToVertices(rx, ry, rw, rh, eff.tl, eff.tr, eff.br, eff.bl);
      if (el.tagName === 'path') {
        el.attributes.d = model.compilePathD(el.vertices, true);
      }
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
    const btnUnifyCorners = container.querySelector<HTMLButtonElement>('#btn-rect-unify-corners');
    const btnSyncTL = container.querySelector<HTMLButtonElement>('#btn-rect-sync-tl');
    const btnInvertCorners = container.querySelector<HTMLButtonElement>('#btn-rect-invert-corners');
    const btnRectToPath = container.querySelector<HTMLButtonElement>('#btn-rect-to-path');

    btnUnifyCorners?.addEventListener('click', () => {
      const radius = rectCorners.tl;
      applyRectGeometry({
        ...rectCorners,
        mode: 'uniform',
        tl: radius,
        tr: radius,
        br: radius,
        bl: radius,
      });
    });

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
