import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { degreesToMiterLimit } from './AppearanceInspector.js';
import { StrokeMarkerControls } from './StrokeMarkerControls.js';

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
        <div class="prop-row">
          <span class="prop-label">Dashes</span>
          <input type="text" class="prop-input" id="el-stroke-dash" value="${strokeDash}" placeholder="e.g. 4 2" />
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
      elStrokeColor.addEventListener('input', () => {
        el.attributes['stroke'] = elStrokeColor.value;
        if (!el.attributes['stroke-width'] || parseFloat(el.attributes['stroke-width']) <= 0) {
          el.attributes['stroke-width'] = '1';
        }
        if (elStrokeHex) elStrokeHex.value = elStrokeColor.value;
        callbacks.onUpdateElement(el);
      });
      elStrokeColor.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
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
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        callbacks.onUpdateElement(el);
        onReRender();
      });
    }

    if (elStrokeWidth) {
      elStrokeWidth.addEventListener('input', () => {
        el.attributes['stroke-width'] = elStrokeWidth.value;
        callbacks.onUpdateElement(el);
      });
      elStrokeWidth.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
      });
    }

    if (elStrokeDash) {
      elStrokeDash.addEventListener('change', () => {
        el.attributes['stroke-dasharray'] = elStrokeDash.value;
        callbacks.onUpdateElement(el);
      });
    }

    if (elStrokeCap) {
      elStrokeCap.addEventListener('change', () => {
        el.attributes['stroke-linecap'] = elStrokeCap.value;
        callbacks.onUpdateElement(el);
      });
    }

    if (elStrokeJoin) {
      elStrokeJoin.addEventListener('change', () => {
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
      const applyMiterAngle = () => {
        const deg = Math.max(1, Math.min(170, parseFloat(elStrokeMiterAngle.value) || 29));
        const limit = degreesToMiterLimit(deg);
        el.attributes['stroke-miterlimit'] = limit.toString();
        callbacks.onUpdateElement(el);
      };
      elStrokeMiterAngle.addEventListener('input', applyMiterAngle);
      elStrokeMiterAngle.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
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
