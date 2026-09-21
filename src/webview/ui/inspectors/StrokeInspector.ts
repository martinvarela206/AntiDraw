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

    const isCustomMarkerColor = markerColor && markerColor !== 'context-stroke';
    const markerColorDisplay = isCustomMarkerColor ? markerColor : (stroke === 'none' ? '#ffffff' : stroke);
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
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="el-stroke-color" value="${stroke === 'none' ? '#000000' : stroke}" />
              <input type="text" class="prop-input" id="el-stroke-hex" value="${stroke === 'none' ? '#000000' : stroke}" />
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
        <div class="prop-row">
          <span class="prop-label">Offset</span>
          <input type="number" class="prop-input" id="el-marker-offset" value="${markerOffset}" step="0.5" title="Desfase paramétrico del marcador respecto al nodo: valores positivos desplazan el marcador hacia afuera del trazo para evitar que el remate del trazo sobresalga" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Mkr Size</span>
          <div style="display:flex; gap:4px; flex:1; align-items:center;">
            <input type="number" class="prop-input" id="el-marker-size" value="${markerSize}" min="0.5" step="0.5" style="width:55px;" title="Dimensionamiento del marcador (escala)" />
            <select class="prop-input" id="el-marker-units" style="cursor:pointer; flex:1;" title="Unidades de escala del marcador: Relativo escala con el grosor del trazo (strokeWidth); Absoluto mantiene dimensiones fijas en píxeles (userSpaceOnUse)">
              <option value="strokeWidth" ${markerUnits === 'strokeWidth' ? 'selected' : ''}>Relativo (trazo)</option>
              <option value="userSpaceOnUse" ${markerUnits === 'userSpaceOnUse' ? 'selected' : ''}>Absoluto (px)</option>
            </select>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Mkr Layer</span>
          <select class="prop-input" id="el-marker-layer" style="cursor:pointer;" title="Orden de dibujo (paint-order): Sobre el trazo o Debajo del trazo">
            <option value="over" ${markerLayer === 'over' ? 'selected' : ''}>Sobre el trazo (Over)</option>
            <option value="under" ${markerLayer === 'under' ? 'selected' : ''}>Debajo del trazo (Under)</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Mkr Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="el-marker-color" value="${markerColorDisplay}" />
            <input type="text" class="prop-input" id="el-marker-color-hex" value="${isCustomMarkerColor ? markerColor : 'Auto (trazo)'}" placeholder="Auto (trazo)" title="Color del marcador: escribe un código hexadecimal o usa el botón ⟲ para volver al color del trazo" />
            <button class="prop-input" id="btn-reset-marker-color" style="width:26px; height:24px; padding:0; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Restablecer color al trazo (context-stroke)">⟲</button>
          </div>
        </div>
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

    if (elStrokeHex) {
      elStrokeHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        el.attributes['stroke'] = elStrokeHex.value;
        if (!el.attributes['stroke-width'] || parseFloat(el.attributes['stroke-width']) <= 0) {
          el.attributes['stroke-width'] = '1';
        }
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
    const elMarkerOffset = container.querySelector<HTMLInputElement>('#el-marker-offset');
    const elMarkerSize = container.querySelector<HTMLInputElement>('#el-marker-size');
    const elMarkerUnits = container.querySelector<HTMLSelectElement>('#el-marker-units');
    const elMarkerLayer = container.querySelector<HTMLSelectElement>('#el-marker-layer');
    const elMarkerColor = container.querySelector<HTMLInputElement>('#el-marker-color');
    const elMarkerColorHex = container.querySelector<HTMLInputElement>('#el-marker-color-hex');
    const btnResetMarkerColor = container.querySelector<HTMLButtonElement>('#btn-reset-marker-color');

    const setMarker = (attr: 'marker-start' | 'marker-mid' | 'marker-end', baseVal: string) => {
      if (baseVal === 'none') {
        delete el.attributes[attr];
      } else {
        const offset = parseFloat(el.attributes['data-marker-offset'] || '0') || 0;
        const isCustom = offset !== 0 ||
          el.attributes['data-marker-size'] !== undefined ||
          el.attributes['data-marker-units'] !== undefined ||
          (el.attributes['data-marker-color'] !== undefined && el.attributes['data-marker-color'] !== 'context-stroke');
        let keyWithPos = baseVal;
        if (attr === 'marker-start' && (baseVal === 'arrow-open' || baseVal === 'arrow-filled' || baseVal === 'bar-cap')) {
          keyWithPos = `${baseVal}-start`;
        } else if (attr === 'marker-end' && (baseVal === 'arrow-open' || baseVal === 'arrow-filled' || baseVal === 'bar-cap')) {
          keyWithPos = `${baseVal}-end`;
        } else if (attr === 'marker-mid' && baseVal === 'arrow-filled') {
          keyWithPos = 'arrow-filled-mid';
        }

        if (isCustom) {
          el.attributes[attr] = `url(#ad-marker-${keyWithPos}-${el.id})`;
        } else {
          el.attributes[attr] = `url(#ad-marker-${keyWithPos})`;
        }
      }
      callbacks.onUpdateElement(el);
    };

    const refreshActiveMarkers = () => {
      if (elMarkerStart && elMarkerStart.value !== 'none') setMarker('marker-start', elMarkerStart.value);
      if (elMarkerMid && elMarkerMid.value !== 'none') setMarker('marker-mid', elMarkerMid.value);
      if (elMarkerEnd && elMarkerEnd.value !== 'none') setMarker('marker-end', elMarkerEnd.value);
      callbacks.onUpdateElement(el);
    };

    if (elMarkerStart) {
      elMarkerStart.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        setMarker('marker-start', elMarkerStart.value);
      });
    }

    if (elMarkerMid) {
      elMarkerMid.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        setMarker('marker-mid', elMarkerMid.value);
      });
    }

    if (elMarkerEnd) {
      elMarkerEnd.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        setMarker('marker-end', elMarkerEnd.value);
      });
    }

    if (elMarkerOffset) {
      const applyOffset = () => {
        const val = parseFloat(elMarkerOffset.value || '0') || 0;
        if (val === 0) {
          delete el.attributes['data-marker-offset'];
        } else {
          el.attributes['data-marker-offset'] = val.toString();
        }
        refreshActiveMarkers();
      };

      elMarkerOffset.addEventListener('input', applyOffset);
      elMarkerOffset.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyOffset();
      });
    }

    if (elMarkerSize) {
      const applySize = () => {
        const val = parseFloat(elMarkerSize.value || '6') || 6;
        if (val === 6 && (!el.attributes['data-marker-units'] || el.attributes['data-marker-units'] === 'strokeWidth')) {
          delete el.attributes['data-marker-size'];
        } else {
          el.attributes['data-marker-size'] = val.toString();
        }
        refreshActiveMarkers();
      };

      elMarkerSize.addEventListener('input', applySize);
      elMarkerSize.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applySize();
      });
    }

    if (elMarkerUnits) {
      elMarkerUnits.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const units = elMarkerUnits.value;
        if (units === 'strokeWidth') {
          delete el.attributes['data-marker-units'];
        } else {
          el.attributes['data-marker-units'] = units;
        }
        refreshActiveMarkers();
      });
    }

    if (elMarkerLayer) {
      elMarkerLayer.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (elMarkerLayer.value === 'under') {
          el.attributes['paint-order'] = 'fill markers stroke';
        } else {
          delete el.attributes['paint-order'];
        }
        callbacks.onUpdateElement(el);
      });
    }

    if (elMarkerColor) {
      elMarkerColor.addEventListener('input', () => {
        el.attributes['data-marker-color'] = elMarkerColor.value;
        if (elMarkerColorHex) elMarkerColorHex.value = elMarkerColor.value;
        refreshActiveMarkers();
      });
      elMarkerColor.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
      });
    }

    if (elMarkerColorHex) {
      elMarkerColorHex.addEventListener('change', () => {
        const val = elMarkerColorHex.value.trim();
        if (!val || val.toLowerCase().includes('auto') || val === 'context-stroke') {
          delete el.attributes['data-marker-color'];
        } else {
          el.attributes['data-marker-color'] = val.startsWith('#') ? val : `#${val}`;
        }
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        refreshActiveMarkers();
        onReRender();
      });
    }

    if (btnResetMarkerColor) {
      btnResetMarkerColor.addEventListener('click', () => {
        delete el.attributes['data-marker-color'];
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        refreshActiveMarkers();
        onReRender();
      });
    }

    bindInspectorMouseDown(container, 'btn-stroke-to-path', () => {
      if (callbacks.onStrokeToPath) callbacks.onStrokeToPath();
    });
  }
}
