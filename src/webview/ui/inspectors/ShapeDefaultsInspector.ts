import { ShapeToolConfig } from '../../engine/CanvasManager.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { I18nService } from '../../i18n/index.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Shape Tool Defaults Inspector (ShapeDefaultsInspector)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates UI rendering and interactive event handlers for shape creation tool
 *    default parameters when no elements are selected (active tool mode).
 *
 * 2. Pre-Instantiation Configuration:
 *    Handles proportion presets (4:3, 16:9, 1:1, 3:2, 2:1, Custom), numeric ratio W:H inputs,
 *    star points/inner ratios, regular polygon side counts, rectangle initial corner radii,
 *    and informational creation shortcut cheatsheets.
 */
export class ShapeDefaultsInspector {
  public static render(
    container: HTMLElement,
    activeTool: string,
    shapeConfig: ShapeToolConfig,
    callbacks: PropertyPanelCallbacks
  ): void {
    const rawToolTitle = I18nService.t(`toolbar.${activeTool}`);
    const toolTitle = (rawToolTitle && !rawToolTitle.startsWith('toolbar.'))
      ? rawToolTitle.replace(/\s*\([^)]*\)$/, '').trim()
      : activeTool;

    const showAspectRatios = activeTool !== 'line' && activeTool !== 'circle';

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('shapeDefaults.toolSettings', { tool: toolTitle })}</div>
        
        ${showAspectRatios ? `
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('shapeDefaults.proportionAlt')}</span>
          <select class="prop-input" id="shape-aspect-preset" style="cursor:pointer;">
            <option value="4:3" ${shapeConfig.aspectRatioW === 4 && shapeConfig.aspectRatioH === 3 ? 'selected' : ''}>${I18nService.t('shapeDefaults.standard43')}</option>
            <option value="16:9" ${shapeConfig.aspectRatioW === 16 && shapeConfig.aspectRatioH === 9 ? 'selected' : ''}>${I18nService.t('shapeDefaults.widescreen169')}</option>
            <option value="1:1" ${shapeConfig.aspectRatioW === 1 && shapeConfig.aspectRatioH === 1 ? 'selected' : ''}>${I18nService.t('shapeDefaults.square11')}</option>
            <option value="3:2" ${shapeConfig.aspectRatioW === 3 && shapeConfig.aspectRatioH === 2 ? 'selected' : ''}>${I18nService.t('shapeDefaults.photo32')}</option>
            <option value="2:1" ${shapeConfig.aspectRatioW === 2 && shapeConfig.aspectRatioH === 1 ? 'selected' : ''}>${I18nService.t('shapeDefaults.panoramic21')}</option>
            <option value="custom" ${!['4:3', '16:9', '1:1', '3:2', '2:1'].includes(`${shapeConfig.aspectRatioW}:${shapeConfig.aspectRatioH}`) ? 'selected' : ''}>${I18nService.t('shapeDefaults.custom')}</option>
          </select>
        </div>

        <div class="prop-row">
          <span class="prop-label">${I18nService.t('shapeDefaults.ratioWH')}</span>
          <div style="display:flex; gap:6px; width:130px; align-items:center;">
            <input type="number" class="prop-input" id="shape-ratio-w" value="${shapeConfig.aspectRatioW}" min="1" step="1" style="width:55px; text-align:center;" />
            <span style="font-weight:bold; color:var(--text-muted);">:</span>
            <input type="number" class="prop-input" id="shape-ratio-h" value="${shapeConfig.aspectRatioH}" min="1" step="1" style="width:55px; text-align:center;" />
          </div>
        </div>
        ` : ''}

        ${activeTool === 'star' ? `
          <div class="prop-row">
            <span class="prop-label">${I18nService.t('shapeDefaults.starPoints')}</span>
            <input type="number" class="prop-input" id="star-points" value="${shapeConfig.starPoints}" min="3" max="32" step="1" />
          </div>
          <div class="prop-row">
            <span class="prop-label">${I18nService.t('shapeDefaults.innerRatio')}</span>
            <input type="number" class="prop-input" id="star-inner-ratio" value="${shapeConfig.starInnerRatio}" min="0.1" max="0.9" step="0.05" />
          </div>
        ` : ''}

        ${activeTool === 'polygon' ? `
          <div class="prop-row">
            <span class="prop-label">${I18nService.t('shapeDefaults.sides')}</span>
            <input type="number" class="prop-input" id="polygon-sides" value="${shapeConfig.polygonSides || 5}" min="3" max="32" step="1" />
          </div>
        ` : ''}

        ${activeTool === 'rect' ? `
          <div class="prop-row">
            <span class="prop-label">${I18nService.t('shapeDefaults.cornerRadius')}</span>
            <input type="number" class="prop-input" id="rect-corner-radius" value="${shapeConfig.rectCornerRadius}" min="0" step="1" />
          </div>
        ` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('shapeDefaults.creationShortcuts')}</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.6;">
          ${activeTool === 'line' ? `
            ${I18nService.t('shapeDefaults.lineDrag')}<br/>
            ${I18nService.t('shapeDefaults.lineShiftDrag')}
          ` : activeTool === 'circle' ? `
            ${I18nService.t('shapeDefaults.circleDrag')}<br/>
            ${I18nService.t('shapeDefaults.circleShiftDrag')}
          ` : `
            ${I18nService.t('shapeDefaults.shapeDrag')}<br/>
            ${I18nService.t('shapeDefaults.shapeShiftDrag')}<br/>
            ${I18nService.t('shapeDefaults.shapeCtrlDrag')}<br/>
            ${I18nService.t('shapeDefaults.shapeAltDrag', { w: shapeConfig.aspectRatioW, h: shapeConfig.aspectRatioH })}<br/>
            ${I18nService.t('shapeDefaults.shapeCtrlShift')}<br/>
            ${I18nService.t('shapeDefaults.shapeAltShift', { w: shapeConfig.aspectRatioW, h: shapeConfig.aspectRatioH })}
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
}
