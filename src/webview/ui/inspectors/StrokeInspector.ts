import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { degreesToMiterLimit, miterLimitToDegrees } from './AppearanceInspector.js';

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
    } = props;

    return `
      <div class="panel-section">
        <div class="panel-title">Stroke (Trazo)</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="el-stroke-color" value="${stroke === 'none' ? '#ffffff' : stroke}" />
            <input type="text" class="prop-input" id="el-stroke-hex" value="${stroke}" />
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
        <div class="prop-row">
          <span class="prop-label">Start Mkr</span>
          <select class="prop-input" id="el-marker-start" style="cursor:pointer;" title="Marcador de inicio de trazo (marker-start)">
            <option value="none" ${markerStart === 'none' ? 'selected' : ''}>None</option>
            <option value="arrow-open" ${markerStart === 'arrow-open' ? 'selected' : ''}>Arrow (Open)</option>
            <option value="arrow-filled" ${markerStart === 'arrow-filled' ? 'selected' : ''}>Arrow (Filled)</option>
            <option value="circle-dot" ${markerStart === 'circle-dot' ? 'selected' : ''}>Circle Dot</option>
            <option value="square-block" ${markerStart === 'square-block' ? 'selected' : ''}>Square</option>
            <option value="bar-cap" ${markerStart === 'bar-cap' ? 'selected' : ''}>Bar Cap</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Mid Mkr</span>
          <select class="prop-input" id="el-marker-mid" style="cursor:pointer;" title="Marcador en vértices intermedios (marker-mid)">
            <option value="none" ${markerMid === 'none' ? 'selected' : ''}>None</option>
            <option value="arrow-filled" ${markerMid === 'arrow-filled' ? 'selected' : ''}>Arrow (Directional)</option>
            <option value="circle-dot" ${markerMid === 'circle-dot' ? 'selected' : ''}>Circle Dot</option>
            <option value="square-block" ${markerMid === 'square-block' ? 'selected' : ''}>Square</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">End Mkr</span>
          <select class="prop-input" id="el-marker-end" style="cursor:pointer;" title="Marcador de final de trazo (marker-end)">
            <option value="none" ${markerEnd === 'none' ? 'selected' : ''}>None</option>
            <option value="arrow-open" ${markerEnd === 'arrow-open' ? 'selected' : ''}>Arrow (Open)</option>
            <option value="arrow-filled" ${markerEnd === 'arrow-filled' ? 'selected' : ''}>Arrow (Filled)</option>
            <option value="circle-dot" ${markerEnd === 'circle-dot' ? 'selected' : ''}>Circle Dot</option>
            <option value="square-block" ${markerEnd === 'square-block' ? 'selected' : ''}>Square</option>
            <option value="bar-cap" ${markerEnd === 'bar-cap' ? 'selected' : ''}>Bar Cap</option>
          </select>
        </div>
        <div class="prop-row" style="margin-top: 8px;">
          <button class="prop-input" id="btn-stroke-to-path" style="cursor:pointer; background:var(--bg-active); text-align:center; font-weight:600; color:var(--text-main); padding:6px;" title="Convertir geométricamente el trazo en un contorno cerrado independiente con relleno (Outline Stroke)">
            ⤹ Convertir Trazo a Vector
          </button>
        </div>
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

    if (elStrokeColor) {
      elStrokeColor.addEventListener('input', () => {
        el.attributes['stroke'] = elStrokeColor.value;
        if (elStrokeHex) elStrokeHex.value = elStrokeColor.value;
        callbacks.onUpdateElement(el);
      });
      elStrokeColor.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
      });
    }

    if (elStrokeHex) {
      elStrokeHex.addEventListener('change', () => {
        el.attributes['stroke'] = elStrokeHex.value;
        if (elStrokeColor) elStrokeColor.value = elStrokeHex.value;
        callbacks.onUpdateElement(el);
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

    const elMarkerStart = container.querySelector<HTMLSelectElement>('#el-marker-start');
    const elMarkerMid = container.querySelector<HTMLSelectElement>('#el-marker-mid');
    const elMarkerEnd = container.querySelector<HTMLSelectElement>('#el-marker-end');

    if (elMarkerStart) {
      elMarkerStart.addEventListener('change', () => {
        const val = elMarkerStart.value;
        if (val === 'none') {
          delete el.attributes['marker-start'];
        } else if (val === 'circle-dot' || val === 'square-block') {
          el.attributes['marker-start'] = `url(#ad-marker-${val})`;
        } else {
          el.attributes['marker-start'] = `url(#ad-marker-${val}-start)`;
        }
        callbacks.onUpdateElement(el);
      });
    }

    if (elMarkerMid) {
      elMarkerMid.addEventListener('change', () => {
        const val = elMarkerMid.value;
        if (val === 'none') {
          delete el.attributes['marker-mid'];
        } else if (val === 'arrow-filled') {
          el.attributes['marker-mid'] = 'url(#ad-marker-arrow-filled-mid)';
        } else {
          el.attributes['marker-mid'] = `url(#ad-marker-${val})`;
        }
        callbacks.onUpdateElement(el);
      });
    }

    if (elMarkerEnd) {
      elMarkerEnd.addEventListener('change', () => {
        const val = elMarkerEnd.value;
        if (val === 'none') {
          delete el.attributes['marker-end'];
        } else if (val === 'circle-dot' || val === 'square-block') {
          el.attributes['marker-end'] = `url(#ad-marker-${val})`;
        } else {
          el.attributes['marker-end'] = `url(#ad-marker-${val}-end)`;
        }
        callbacks.onUpdateElement(el);
      });
    }

    bindInspectorMouseDown(container, 'btn-stroke-to-path', () => {
      if (callbacks.onStrokeToPath) callbacks.onStrokeToPath();
    });
  }
}
