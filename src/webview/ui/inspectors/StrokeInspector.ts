import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { degreesToMiterLimit } from './AppearanceInspector.js';
import { StrokeMarkerControls } from './StrokeMarkerControls.js';
import { StrokeLayersControls } from './StrokeLayersControls.js';
import { DashCornerAligner } from '../../engine/geometry/DashCornerAligner.js';
import { SpineCurveService } from '../../engine/stroke/SpineCurveService.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import { I18nService } from '../../i18n/index.js';
import { ColorPickerPopover } from '../ColorPickerPopover.js';

export interface StrokeInspectorProps {
  stroke: string;
  strokeWidth: string;
  strokeDash: string;
  strokeLinecap: string;
  strokeLinejoin: string;
  miterAngleDeg: number;
  markerStart: string;
  markerMid: string;
  markerEnd: string;
  markerAlign: 'tip' | 'extend';
  markerOffset: number;
  markerSize: number;
  markerUnits: 'strokeWidth' | 'userSpaceOnUse';
  markerLayer: 'over' | 'under';
  markerColor: string;
  dashAlignCorners?: boolean;
  isShapeRestricted?: boolean;
  shapeTagName?: string;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Stroke & Marker Inspector Component (StrokeInspector)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Decouples stroke outline manipulation, capping, joining, miter angle thresholds, and
 *    universal SVG marker attachments from the primary AppearanceInspector (fill/gradients).
 *
 * 2. Dedicated Tool Workflow Alignment:
 *    When the user activates the dedicated Stroke Tool (T) in the toolbar, the inspector exclusively
 *    presents path outline and marker controls, eliminating visual clutter from the general selection tool.
 *
 * 3. Bidirectional Miter Angle Conversion:
 *    Uses human-intuitive degrees [1°, 170°] instead of opaque dimensionless SVG miterlimit ratios.
 *
 * 4. Parametric Marker Offsets:
 *    Allows adjusting refX dynamically to push terminal markers forward/backward along curve tangents,
 *    eliminating unsightly blunt stroke caps protruding through arrow heads.
 *
 * 5. Independent Marker Sizing & Units (Relative vs Absolute):
 *    Supports proportional scaling relative to stroke-width (markerUnits="strokeWidth", default)
 *    as well as fixed absolute pixel dimensions (markerUnits="userSpaceOnUse") that remain constant
 *    regardless of path thickness.
 *
 * 6. Layer Ordering (paint-order) & Independent Marker Color:
 *    Enables rendering markers either above (default: fill stroke markers) or beneath the path stroke
 *    (fill markers stroke). Also decouples marker fill/stroke color from the path's stroke color,
 *    supporting custom accent tints while preserving context-stroke inheritance by default.
 */
export class StrokeInspector {
  public static renderHtml(
    el: VectorElement,
    props: StrokeInspectorProps
  ): string {
    const {
      stroke,
      strokeWidth,
      strokeDash,
      strokeLinecap,
      strokeLinejoin,
      miterAngleDeg,
      markerStart,
      markerMid,
      markerEnd,
      markerAlign,
      markerOffset,
      markerSize,
      markerUnits,
      markerLayer,
      markerColor,
      dashAlignCorners,
      isShapeRestricted,
      shapeTagName,
    } = props;

    const widthProfile = SpineCurveService.getWidthProfile(el);
    const profileMode = widthProfile ? (widthProfile.mode || 'variable') : 'uniform';
    const isSketch = profileMode === 'sketch';
    const sketchAmp = widthProfile?.sketchParams?.amplitude ?? 0.6;
    const sketchRough = widthProfile?.sketchParams?.roughness ?? 0.3;

    const isCurrentColor = stroke === 'currentColor';
    const hasStroke = stroke !== 'none' && stroke !== '' && stroke !== undefined && strokeWidth !== '0';

    return `
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>${I18nService.t('inspector.strokeLabel')}</span>
            ${!hasStroke ? `<span class="badge" style="font-size:10px; color:#94a3b8; font-weight:normal; text-transform:none;">(${I18nService.t('inspector.noStroke')})</span>` : ''}
          </div>
          <div style="display:flex; gap:4px; align-items:center;">
            ${hasStroke ? `
              <button class="prop-input" id="btn-remove-stroke" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#ef4444;" title="${I18nService.t('inspector.removeStroke')}">${I18nService.t('inspector.removeStroke')}</button>
            ` : `
              <button class="prop-input" id="btn-add-stroke" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#10b981; font-weight:600;" title="${I18nService.t('inspector.addStroke')}">${I18nService.t('inspector.addStroke')}</button>
            `}
          </div>
        </div>

        ${!hasStroke ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; padding:6px 8px; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:4px;">
          <span style="font-size:11px; color:#94a3b8;">${I18nService.t('inspector.noStroke')}</span>
          <button class="prop-input" id="btn-add-stroke-body" style="cursor:pointer; background:var(--accent-color); color:#fff; font-weight:600; padding:2px 8px; font-size:11px;" title="${I18nService.t('inspector.addStroke')}">${I18nService.t('inspector.addStroke')}</button>
        </div>
        ` : `
        <div id="stroke-active-controls">
          <div class="prop-row">
            <span class="prop-label">${I18nService.t('common.color')}</span>
            <div class="color-picker-row" style="display:flex; gap:4px; align-items:center;">
              <button type="button" class="color-swatch" id="el-stroke-color" style="background-color: ${isCurrentColor ? '#000000' : (stroke === 'none' ? '#000000' : stroke)};" title="${I18nService.t('common.color')}" ${isCurrentColor ? 'disabled title="currentColor"' : ''}></button>
              <input type="text" class="prop-input" id="el-stroke-hex" value="${stroke === 'none' ? '#000000' : stroke}" placeholder="#hex o currentColor" style="flex:1;" />
              <button class="prop-input ${isCurrentColor ? 'active' : ''}" id="btn-stroke-currentcolor" style="cursor:pointer; width:auto; padding:2px 6px; font-size:10px; font-weight:600; ${isCurrentColor ? 'background:#3b82f6; color:#fff;' : 'color:#94a3b8;'}" title="currentColor">currentColor</button>
            </div>
          </div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('inspector.strokeWidth')}</span>
          <input type="number" class="prop-input" id="el-stroke-width" value="${strokeWidth}" min="0" step="0.5" />
        </div>
        <div class="prop-row" style="align-items:flex-start;">
          <span class="prop-label" style="margin-top:4px;">${I18nService.t('inspector.strokeDash')}</span>
          <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
            <div style="display:flex; gap:4px; align-items:center;">
              <input type="text" class="prop-input" id="el-stroke-dash" value="${strokeDash}" placeholder="e.g. 8 4 o 0 8" style="flex:1;" />
              <label style="display:flex; align-items:center; gap:3px; font-size:10px; cursor:pointer; color:var(--text-muted); white-space:nowrap;">
                <input type="checkbox" id="el-stroke-dash-align-corners" ${dashAlignCorners ? 'checked' : ''} style="cursor:pointer;" />
                <span>${I18nService.t('inspector.dashAlignCorners')}</span>
              </label>
            </div>
            <div style="display:flex; gap:3px; flex-wrap:wrap;">
              <button type="button" class="prop-input" id="btn-dash-solid" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;">${I18nService.t('inspector.dashSolid')}</button>
              <button type="button" class="prop-input" id="btn-dash-dashed" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;">${I18nService.t('inspector.dashDashed')}</button>
              <button type="button" class="prop-input" id="btn-dash-dots" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;">${I18nService.t('inspector.dashDots')}</button>
              <button type="button" class="prop-input" id="btn-dash-dense-dots" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;">${I18nService.t('inspector.dashDenseDots')}</button>
              <button type="button" class="prop-input" id="btn-dash-long" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;">${I18nService.t('inspector.dashLong')}</button>
            </div>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('inspector.strokeCap')}</span>
          <select class="prop-input" id="el-stroke-cap" style="cursor:pointer;">
            <option value="butt" ${strokeLinecap === 'butt' ? 'selected' : ''}>Butt</option>
            <option value="round" ${strokeLinecap === 'round' ? 'selected' : ''}>Round</option>
            <option value="square" ${strokeLinecap === 'square' ? 'selected' : ''}>Square</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('inspector.strokeJoin')}</span>
          <div style="display:flex; gap:4px; flex:1; align-items:center;">
            <select class="prop-input" id="el-stroke-join" style="cursor:pointer; flex:1;">
              <option value="miter" ${strokeLinejoin === 'miter' ? 'selected' : ''}>Miter</option>
              <option value="round" ${strokeLinejoin === 'round' ? 'selected' : ''}>Round</option>
              <option value="bevel" ${strokeLinejoin === 'bevel' ? 'selected' : ''}>Bevel</option>
            </select>
            <div id="container-stroke-miterlimit" style="${strokeLinejoin === 'miter' ? 'display:flex;' : 'display:none;'} align-items:center; gap:2px; width:65px;">
              <input type="number" class="prop-input" id="el-stroke-miter-angle" value="${miterAngleDeg}" min="1" max="170" step="1" style="width:45px; padding:2px 4px; text-align:right;" />
              <span style="font-size:11px; color:var(--text-muted); font-weight:600;">°</span>
            </div>
          </div>
        </div>
        <div class="prop-row" style="align-items:flex-start;">
          <span class="prop-label" style="margin-top:4px;">${I18nService.t('inspector.profile')}</span>
          <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
            <div style="display:flex; gap:3px; flex-wrap:wrap;">
              <button type="button" class="prop-input ${profileMode === 'uniform' ? 'active' : ''}" id="btn-profile-uniform" style="cursor:pointer; width:auto; padding:2px 6px; font-size:10px; font-weight:600;">${I18nService.t('inspector.profileUniform')}</button>
              <button type="button" class="prop-input ${profileMode === 'variable' ? 'active' : ''}" id="btn-profile-tapered" style="cursor:pointer; width:auto; padding:2px 6px; font-size:10px; font-weight:600;">${I18nService.t('inspector.profileTapered')}</button>
              <button type="button" class="prop-input ${isSketch ? 'active' : ''}" id="btn-profile-sketch" style="cursor:pointer; width:auto; padding:2px 6px; font-size:10px; font-weight:600; color:var(--accent, #00f0ff);">${I18nService.t('inspector.profileSketch')}</button>
            </div>
            ${isSketch ? `
              <div id="container-sketch-params" style="display:flex; flex-direction:column; gap:3px; background:var(--bg-subtle, rgba(0,0,0,0.15)); padding:5px 6px; border-radius:4px; margin-top:2px; border:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px;">
                  <span style="color:var(--text-muted);">${I18nService.t('inspector.amplitude')}:</span>
                  <div style="display:flex; align-items:center; gap:3px;">
                    <input type="range" id="el-sketch-amplitude" min="0.1" max="0.95" step="0.05" value="${sketchAmp}" style="width:70px; cursor:pointer;" />
                    <span id="label-sketch-amp" style="width:24px; text-align:right; font-variant-numeric:tabular-nums; font-size:9.5px;">${Math.round(sketchAmp * 100)}%</span>
                  </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px;">
                  <span style="color:var(--text-muted);">${I18nService.t('inspector.roughness')}:</span>
                  <div style="display:flex; align-items:center; gap:3px;">
                    <input type="range" id="el-sketch-roughness" min="0" max="0.8" step="0.05" value="${sketchRough}" style="width:70px; cursor:pointer;" />
                    <span id="label-sketch-rough" style="width:24px; text-align:right; font-variant-numeric:tabular-nums; font-size:9.5px;">${Math.round(sketchRough * 100)}%</span>
                  </div>
                </div>
                <button type="button" class="prop-input" id="btn-sketch-reseed" style="cursor:pointer; font-size:9.5px; padding:2px 4px; margin-top:2px; text-align:center; display:inline-flex; align-items:center; justify-content:center; gap:4px;" title="${I18nService.t('inspector.reseedVariation')}">${ToolIcons.dice} ${I18nService.t('inspector.reseedVariation')}</button>
              </div>
            ` : ''}
          </div>
        </div>
        ${StrokeMarkerControls.renderHtml({
          markerStart,
          markerMid,
          markerEnd,
          markerAlign,
          markerOffset: markerOffset.toString(),
          markerSize: markerSize.toString(),
          markerUnits,
          markerLayer,
          markerColor,
          stroke,
          isShapeRestricted,
          shapeTagName,
        })}
        ${StrokeLayersControls.renderHtml(el)}
        <div class="prop-row" style="margin-top: 8px;">
          <button class="prop-input" id="btn-stroke-to-path" style="cursor:pointer; background:var(--bg-active); text-align:center; font-weight:600; color:var(--text-main); padding:6px;" title="${I18nService.t('inspector.strokeToPath')}">
            ⤹ ${I18nService.t('inspector.strokeToPathAction')}
          </button>
        </div>
        </div>
        `}
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const elStrokeColor = container.querySelector<HTMLInputElement>('#el-stroke-color');
    const elStrokeHex = container.querySelector<HTMLInputElement>('#el-stroke-hex');
    const elStrokeWidth = container.querySelector<HTMLInputElement>('#el-stroke-width');
    const elStrokeDash = container.querySelector<HTMLInputElement>('#el-stroke-dash');
    const elStrokeCap = container.querySelector<HTMLSelectElement>('#el-stroke-cap');
    const elStrokeJoin = container.querySelector<HTMLSelectElement>('#el-stroke-join');

    const btnRemoveStroke = container.querySelector<HTMLButtonElement>('#btn-remove-stroke');
    if (btnRemoveStroke) {
      btnRemoveStroke.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes['stroke'] = 'none';
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    const btnAddStroke = container.querySelector<HTMLButtonElement>('#btn-add-stroke');
    const btnAddStrokeBody = container.querySelector<HTMLButtonElement>('#btn-add-stroke-body');
    const onAddStrokeClicked = () => {
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      const newStroke = el.attributes['stroke'] && el.attributes['stroke'] !== 'none' ? el.attributes['stroke'] : '#000000';
      el.attributes['stroke'] = newStroke;
      const currentW = parseFloat(el.attributes['stroke-width'] || '0');
      if (currentW <= 0) {
        el.attributes['stroke-width'] = '1';
      }
      callbacks.onUpdateElement(el);
      onReRender();
    };
    if (btnAddStroke) btnAddStroke.addEventListener('click', onAddStrokeClicked);
    if (btnAddStrokeBody) btnAddStrokeBody.addEventListener('click', onAddStrokeClicked);

    if (elStrokeColor) {
      elStrokeColor.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (el.attributes['stroke'] === 'currentColor') return;

        const currentStroke = el.attributes['stroke'] && el.attributes['stroke'] !== 'none'
          ? el.attributes['stroke']
          : '#000000';
        const currentOp = parseFloat(el.attributes['stroke-opacity'] || '1');

        ColorPickerPopover.show({
          anchor: elStrokeColor,
          initialColor: currentStroke,
          initialOpacity: currentOp,
          showAlpha: true,
          onChange: ({ hex, alpha }) => {
            el.attributes['stroke'] = hex;
            if (!el.attributes['stroke-width'] || parseFloat(el.attributes['stroke-width']) <= 0) {
              el.attributes['stroke-width'] = '1';
            }
            if (alpha < 1) {
              el.attributes['stroke-opacity'] = alpha.toFixed(2);
            } else {
              delete el.attributes['stroke-opacity'];
            }
            if (elStrokeHex) elStrokeHex.value = hex;
            elStrokeColor.style.backgroundColor = hex;
            callbacks.onUpdateElement(el);
          },
          onCommit: () => {
            if (callbacks.onPushUndo) callbacks.onPushUndo();
            callbacks.onUpdateElement(el);
          },
        });
      });
    }

    if (elStrokeHex) {
      elStrokeHex.addEventListener('input', () => {
        const val = elStrokeHex.value.trim();
        if (val.startsWith('#') && (val.length === 4 || val.length === 7 || val.length === 9)) {
          el.attributes['stroke'] = val;
          if (elStrokeColor) elStrokeColor.style.backgroundColor = val;
          callbacks.onUpdateElement(el);
        }
      });
      elStrokeHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const val = elStrokeHex.value.trim();
        if (val.toLowerCase() === 'currentcolor') {
          el.attributes['stroke'] = 'currentColor';
        } else {
          el.attributes['stroke'] = val.startsWith('#') || val === 'none' ? val : `#${val}`;
          if (elStrokeColor) elStrokeColor.style.backgroundColor = el.attributes['stroke'];
        }
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    const btnStrokeCurrentColor = container.querySelector<HTMLButtonElement>('#btn-stroke-currentcolor');
    if (btnStrokeCurrentColor) {
      btnStrokeCurrentColor.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (el.attributes['stroke'] === 'currentColor') {
          el.attributes['stroke'] = '#000000';
        } else {
          el.attributes['stroke'] = 'currentColor';
          if (!el.attributes['stroke-width'] || parseFloat(el.attributes['stroke-width']) <= 0) {
            el.attributes['stroke-width'] = '1';
          }
        }
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    if (elStrokeHex) {
      elStrokeHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const val = elStrokeHex.value.trim();
        if (val.toLowerCase() === 'currentcolor') {
          el.attributes['stroke'] = 'currentColor';
        } else {
          el.attributes['stroke'] = val.startsWith('#') || val === 'none' ? val : `#${val}`;
          if (elStrokeColor) elStrokeColor.value = el.attributes['stroke'];
        }
        if (!el.attributes['stroke-width'] || parseFloat(el.attributes['stroke-width']) <= 0) {
          el.attributes['stroke-width'] = '1';
        }
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    if (elStrokeWidth) {
      let isEditingWidth = false;
      elStrokeWidth.addEventListener('pointerdown', () => {
        if (!isEditingWidth && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isEditingWidth = true;
        }
      });
      elStrokeWidth.addEventListener('input', () => {
        if (!isEditingWidth && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isEditingWidth = true;
        }
        el.attributes['stroke-width'] = elStrokeWidth.value;
        callbacks.onUpdateElement(el);
      });
      elStrokeWidth.addEventListener('change', () => {
        isEditingWidth = false;
      });
    }

    const elStrokeDashAlignCorners = container.querySelector<HTMLInputElement>('#el-stroke-dash-align-corners');

    const applyDashSettings = (nominalValue: string, alignCorners: boolean) => {
      const trimmed = nominalValue.trim();
      if (!trimmed || trimmed === 'none' || trimmed === '0') {
        delete el.attributes['stroke-dasharray'];
        delete el.attributes['data-dash-nominal'];
        delete el.attributes['data-dash-align'];
        if (elStrokeDash) elStrokeDash.value = '';
        if (elStrokeDashAlignCorners) elStrokeDashAlignCorners.checked = false;
      } else if (alignCorners) {
        el.attributes['data-dash-nominal'] = trimmed;
        el.attributes['data-dash-align'] = 'corners';
        const fitted = DashCornerAligner.calculateFittedDashString(el, trimmed);
        el.attributes['stroke-dasharray'] = fitted;
        if (elStrokeDash) elStrokeDash.value = trimmed;
        if (elStrokeDashAlignCorners) elStrokeDashAlignCorners.checked = true;
      } else {
        delete el.attributes['data-dash-nominal'];
        delete el.attributes['data-dash-align'];
        el.attributes['stroke-dasharray'] = trimmed;
        if (elStrokeDash) elStrokeDash.value = trimmed;
        if (elStrokeDashAlignCorners) elStrokeDashAlignCorners.checked = false;
      }
      callbacks.onUpdateElement(el);
    };

    if (elStrokeDash) {
      elStrokeDash.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const align = elStrokeDashAlignCorners ? elStrokeDashAlignCorners.checked : false;
        applyDashSettings(elStrokeDash.value, align);
      });
    }

    if (elStrokeDashAlignCorners) {
      elStrokeDashAlignCorners.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const nominal = elStrokeDash ? elStrokeDash.value || '8 4' : '8 4';
        applyDashSettings(nominal, elStrokeDashAlignCorners.checked);
      });
    }

    // Quick Dash Presets
    const btnSolid = container.querySelector<HTMLButtonElement>('#btn-dash-solid');
    if (btnSolid) {
      btnSolid.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyDashSettings('', false);
      });
    }

    const btnDashed = container.querySelector<HTMLButtonElement>('#btn-dash-dashed');
    if (btnDashed) {
      btnDashed.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyDashSettings('8 4', true);
      });
    }

    const btnDots = container.querySelector<HTMLButtonElement>('#btn-dash-dots');
    if (btnDots) {
      btnDots.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes['stroke-linecap'] = 'round';
        if (elStrokeCap) elStrokeCap.value = 'round';
        applyDashSettings('0 8', true);
      });
    }

    const btnDenseDots = container.querySelector<HTMLButtonElement>('#btn-dash-dense-dots');
    if (btnDenseDots) {
      btnDenseDots.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes['stroke-linecap'] = 'round';
        if (elStrokeCap) elStrokeCap.value = 'round';
        applyDashSettings('0 5', true);
      });
    }

    const btnLong = container.querySelector<HTMLButtonElement>('#btn-dash-long');
    if (btnLong) {
      btnLong.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyDashSettings('16 6', true);
      });
    }

    if (elStrokeCap) {
      elStrokeCap.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes['stroke-linecap'] = elStrokeCap.value;
        callbacks.onUpdateElement(el);
      });
    }

    if (elStrokeJoin) {
      elStrokeJoin.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes['stroke-linejoin'] = elStrokeJoin.value;
        const miterContainer = container.querySelector<HTMLElement>('#container-stroke-miterlimit');
        if (miterContainer) {
          miterContainer.style.display = elStrokeJoin.value === 'miter' ? 'flex' : 'none';
        }
        callbacks.onUpdateElement(el);
      });
    }

    const elStrokeMiterAngle = container.querySelector<HTMLInputElement>('#el-stroke-miter-angle');
    if (elStrokeMiterAngle) {
      let isEditingMiter = false;
      const applyMiterAngle = () => {
        const deg = Math.max(1, Math.min(170, parseFloat(elStrokeMiterAngle.value) || 29));
        const limit = degreesToMiterLimit(deg);
        el.attributes['stroke-miterlimit'] = limit.toString();
        callbacks.onUpdateElement(el);
      };
      elStrokeMiterAngle.addEventListener('pointerdown', () => {
        if (!isEditingMiter && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isEditingMiter = true;
        }
      });
      elStrokeMiterAngle.addEventListener('input', () => {
        if (!isEditingMiter && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isEditingMiter = true;
        }
        applyMiterAngle();
      });
      elStrokeMiterAngle.addEventListener('change', () => {
        isEditingMiter = false;
        applyMiterAngle();
      });
    }

    // Delegate all terminal marker events to modular StrokeMarkerControls
    StrokeMarkerControls.bindEvents(container, el, model, callbacks, onReRender);

    // Bind Width Profile & Sketch Ink modulation events
    const btnProfileUniform = container.querySelector<HTMLButtonElement>('#btn-profile-uniform');
    if (btnProfileUniform) {
      btnProfileUniform.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        SpineCurveService.setWidthProfile(el, null);
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    const btnProfileTapered = container.querySelector<HTMLButtonElement>('#btn-profile-tapered');
    if (btnProfileTapered) {
      btnProfileTapered.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        SpineCurveService.applyTaperedProfile(el);
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    const btnProfileSketch = container.querySelector<HTMLButtonElement>('#btn-profile-sketch');
    if (btnProfileSketch) {
      btnProfileSketch.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        SpineCurveService.applySketchModulation(el);
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    const elSketchAmp = container.querySelector<HTMLInputElement>('#el-sketch-amplitude');
    const labelSketchAmp = container.querySelector<HTMLElement>('#label-sketch-amp');
    if (elSketchAmp) {
      let isEditingAmp = false;
      elSketchAmp.addEventListener('pointerdown', () => {
        if (!isEditingAmp && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isEditingAmp = true;
        }
      });
      elSketchAmp.addEventListener('input', () => {
        const val = parseFloat(elSketchAmp.value) || 0.5;
        if (labelSketchAmp) labelSketchAmp.textContent = `${Math.round(val * 100)}%`;
        const profile = SpineCurveService.getWidthProfile(el);
        if (profile) {
          if (!profile.sketchParams) {
            profile.sketchParams = { amplitude: val, frequency: 5, seed: 42, roughness: 0.3 };
          } else {
            profile.sketchParams.amplitude = val;
          }
          SpineCurveService.setWidthProfile(el, profile);
          callbacks.onUpdateElement(el);
        }
      });
      elSketchAmp.addEventListener('change', () => {
        isEditingAmp = false;
      });
    }

    const elSketchRough = container.querySelector<HTMLInputElement>('#el-sketch-roughness');
    const labelSketchRough = container.querySelector<HTMLElement>('#label-sketch-rough');
    if (elSketchRough) {
      let isEditingRough = false;
      elSketchRough.addEventListener('pointerdown', () => {
        if (!isEditingRough && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isEditingRough = true;
        }
      });
      elSketchRough.addEventListener('input', () => {
        const val = parseFloat(elSketchRough.value) || 0.25;
        if (labelSketchRough) labelSketchRough.textContent = `${Math.round(val * 100)}%`;
        const profile = SpineCurveService.getWidthProfile(el);
        if (profile) {
          if (!profile.sketchParams) {
            profile.sketchParams = { amplitude: 0.5, frequency: 5, seed: 42, roughness: val };
          } else {
            profile.sketchParams.roughness = val;
          }
          SpineCurveService.setWidthProfile(el, profile);
          callbacks.onUpdateElement(el);
        }
      });
      elSketchRough.addEventListener('change', () => {
        isEditingRough = false;
      });
    }

    const btnSketchReseed = container.querySelector<HTMLButtonElement>('#btn-sketch-reseed');
    if (btnSketchReseed) {
      btnSketchReseed.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const profile = SpineCurveService.getWidthProfile(el);
        if (profile && profile.sketchParams) {
          profile.sketchParams.seed = Math.floor(Math.random() * 100000);
          SpineCurveService.setWidthProfile(el, profile);
          callbacks.onUpdateElement(el);
          onReRender();
        }
      });
    }

    // Delegate multi-stroke layers events
    StrokeLayersControls.bindEvents(container, el, callbacks, onReRender);

    bindInspectorMouseDown(container, 'btn-stroke-to-path', () => {
      if (callbacks.onStrokeToPath) callbacks.onStrokeToPath();
    });
  }
}
