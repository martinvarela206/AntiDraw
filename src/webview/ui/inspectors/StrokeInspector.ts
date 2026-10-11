import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { degreesToMiterLimit } from './AppearanceInspector.js';
import { StrokeMarkerControls } from './StrokeMarkerControls.js';
import { DashCornerAligner } from '../../engine/geometry/DashCornerAligner.js';

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
  markerOffset: number;
  markerSize: number;
  markerUnits: 'strokeWidth' | 'userSpaceOnUse';
  markerLayer: 'over' | 'under';
  markerColor: string;
  dashAlignCorners?: boolean;
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
      markerOffset,
      markerSize,
      markerUnits,
      markerLayer,
      markerColor,
      dashAlignCorners,
    } = props;

    const isCurrentColor = stroke === 'currentColor';
    const hasStroke = stroke !== 'none' && stroke !== '' && stroke !== undefined && strokeWidth !== '0';

    return `
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>Stroke (Trazo)</span>
            ${!hasStroke ? '<span class="badge" style="font-size:10px; color:#94a3b8; font-weight:normal; text-transform:none;">(Sin trazo)</span>' : ''}
          </div>
          <div style="display:flex; gap:4px; align-items:center;">
            ${hasStroke ? `
              <button class="prop-input" id="btn-remove-stroke" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#ef4444;" title="Quitar trazo (establecer stroke='none')">− Quitar</button>
            ` : `
              <button class="prop-input" id="btn-add-stroke" style="cursor:pointer; width:auto; padding:1px 6px; font-size:11px; color:#10b981; font-weight:600;" title="Añadir trazo de 1px">+ Añadir</button>
            `}
          </div>
        </div>

        ${!hasStroke ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; padding:6px 8px; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:4px;">
          <span style="font-size:11px; color:#94a3b8;">Sin borde (stroke="none")</span>
          <button class="prop-input" id="btn-add-stroke-body" style="cursor:pointer; background:var(--accent-color); color:#fff; font-weight:600; padding:2px 8px; font-size:11px;" title="Añadir trazo de 1px">+ Añadir Borde</button>
        </div>
        ` : `
        <div id="stroke-active-controls">
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row" style="display:flex; gap:4px; align-items:center;">
              <input type="color" class="color-swatch" id="el-stroke-color" value="${isCurrentColor ? '#000000' : (stroke === 'none' ? '#000000' : stroke)}" ${isCurrentColor ? 'disabled title="Color dinámico (currentColor)"' : ''} />
              <input type="text" class="prop-input" id="el-stroke-hex" value="${stroke === 'none' ? '#000000' : stroke}" placeholder="#hex o currentColor" style="flex:1;" />
              <button class="prop-input ${isCurrentColor ? 'active' : ''}" id="btn-stroke-currentcolor" style="cursor:pointer; width:auto; padding:2px 6px; font-size:10px; font-weight:600; ${isCurrentColor ? 'background:#3b82f6; color:#fff;' : 'color:#94a3b8;'}" title="Conmutar currentColor (hereda dinámicamente el color de texto del contexto)">currentColor</button>
            </div>
          </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="el-stroke-width" value="${strokeWidth}" min="0" step="0.5" />
        </div>
        <div class="prop-row" style="align-items:flex-start;">
          <span class="prop-label" style="margin-top:4px;">Dashes</span>
          <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
            <div style="display:flex; gap:4px; align-items:center;">
              <input type="text" class="prop-input" id="el-stroke-dash" value="${strokeDash}" placeholder="e.g. 8 4 o 0 8" style="flex:1;" />
              <label style="display:flex; align-items:center; gap:3px; font-size:10px; cursor:pointer; color:var(--text-muted); white-space:nowrap;" title="Ajustar guiones a esquinas (Plan::fitted): calcula y escala micro-intervalos para centrar perfectamente un guión o punto en cada esquina">
                <input type="checkbox" id="el-stroke-dash-align-corners" ${dashAlignCorners ? 'checked' : ''} style="cursor:pointer;" />
                <span>Esquinas</span>
              </label>
            </div>
            <div style="display:flex; gap:3px; flex-wrap:wrap;">
              <button type="button" class="prop-input" id="btn-dash-solid" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;" title="Trazo continuo sin guiones">Sólido</button>
              <button type="button" class="prop-input" id="btn-dash-dashed" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;" title="Guiones estándar (8 4) adaptados a esquinas">Guiones</button>
              <button type="button" class="prop-input" id="btn-dash-dots" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;" title="Discos circulares perfectos (0 8) centrados en cada vértice">Puntos</button>
              <button type="button" class="prop-input" id="btn-dash-dense-dots" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;" title="Puntos finos densos (0 5)">Puntos finos</button>
              <button type="button" class="prop-input" id="btn-dash-long" style="cursor:pointer; width:auto; padding:1px 5px; font-size:9.5px;" title="Rayas largas (16 6)">Rayas</button>
            </div>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Cap</span>
          <select class="prop-input" id="el-stroke-cap" style="cursor:pointer;">
            <option value="butt" ${strokeLinecap === 'butt' ? 'selected' : ''}>Butt</option>
            <option value="round" ${strokeLinecap === 'round' ? 'selected' : ''}>Round</option>
            <option value="square" ${strokeLinecap === 'square' ? 'selected' : ''}>Square</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Join</span>
          <div style="display:flex; gap:4px; flex:1; align-items:center;">
            <select class="prop-input" id="el-stroke-join" style="cursor:pointer; flex:1;">
              <option value="miter" ${strokeLinejoin === 'miter' ? 'selected' : ''}>Miter</option>
              <option value="round" ${strokeLinejoin === 'round' ? 'selected' : ''}>Round</option>
              <option value="bevel" ${strokeLinejoin === 'bevel' ? 'selected' : ''}>Bevel</option>
            </select>
            <div id="container-stroke-miterlimit" style="${strokeLinejoin === 'miter' ? 'display:flex;' : 'display:none;'} align-items:center; gap:2px; width:65px;" title="Ángulo mínimo de inglete en grados (°): esquinas más agudas que este valor se cortan a bisel. Valores menores permiten puntas más afiladas.">
              <input type="number" class="prop-input" id="el-stroke-miter-angle" value="${miterAngleDeg}" min="1" max="170" step="1" style="width:45px; padding:2px 4px; text-align:right;" />
              <span style="font-size:11px; color:var(--text-muted); font-weight:600;">°</span>
            </div>
          </div>
        </div>
        ${StrokeMarkerControls.renderHtml({
          markerStart,
          markerMid,
          markerEnd,
          markerOffset: markerOffset.toString(),
          markerSize: markerSize.toString(),
          markerUnits,
          markerLayer,
          markerColor,
          stroke,
        })}
        <div class="prop-row" style="margin-top: 8px;">
          <button class="prop-input" id="btn-stroke-to-path" style="cursor:pointer; background:var(--bg-active); text-align:center; font-weight:600; color:var(--text-main); padding:6px;" title="Convertir geométricamente el trazo en un contorno cerrado independiente con relleno (Outline Stroke)">
            ⤹ Convertir Trazo a Vector
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
      let isPickingStroke = false;
      elStrokeColor.addEventListener('pointerdown', () => {
        if (!isPickingStroke && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isPickingStroke = true;
        }
      });
      elStrokeColor.addEventListener('input', () => {
        if (!isPickingStroke && callbacks.onPushUndo) {
          callbacks.onPushUndo();
          isPickingStroke = true;
        }
        el.attributes['stroke'] = elStrokeColor.value;
        if (!el.attributes['stroke-width'] || parseFloat(el.attributes['stroke-width']) <= 0) {
          el.attributes['stroke-width'] = '1';
        }
        if (elStrokeHex) elStrokeHex.value = elStrokeColor.value;
        callbacks.onUpdateElement(el);
      });
      elStrokeColor.addEventListener('change', () => {
        isPickingStroke = false;
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

    bindInspectorMouseDown(container, 'btn-stroke-to-path', () => {
      if (callbacks.onStrokeToPath) callbacks.onStrokeToPath();
    });
  }
}
