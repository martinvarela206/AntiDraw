import { ShapeToolConfig } from '../../engine/CanvasManager.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

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
}
