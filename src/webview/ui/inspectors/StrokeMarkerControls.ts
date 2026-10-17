import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { ToolIcons } from '../../icons/ToolIcons.js';

export interface StrokeMarkerProps {
  markerStart: string;
  markerMid: string;
  markerEnd: string;
  markerAlign: 'tip' | 'extend';
  markerOffset: string;
  markerSize: string;
  markerUnits: string;
  markerLayer: string;
  markerColor: string;
  stroke: string;
  isShapeRestricted?: boolean;
  shapeTagName?: string;
}

/**
 * ARCHITECTURAL RATIONALE: Modular Stroke Marker Subsystem (StrokeMarkerControls)
 *
 * 1. Single Responsibility & Rule 6 File Size Compliance:
 *    Decoupled from StrokeInspector to preserve cohesive responsibilities and maintain file sizes
 *    well under the 500-line threshold.
 *
 * 2. Universal SVG Terminal Marker System with 13 Standard Models:
 *    Encapsulates controls for terminal and midpoint markers (start, mid, end), alignment modes
 *    (tip-on-end vs extend-past-end), parametric offsets, relative vs absolute sizing (strokeWidth vs userSpaceOnUse),
 *    paint-order layer stacking, and decoupled marker tints with context-stroke fallback.
 *
 * 3. Guided Primitive Conversion:
 *    For W3C-restricted shapes (<rect>, <circle>, <ellipse>) which ignore SVG markers per specification,
 *    presents an informative conversion callout with explicit action button.
 */
export class StrokeMarkerControls {
  private static readonly DIRECTIONAL_MARKERS = [
    'arrow-open',
    'arrow-filled',
    'arrow-stealth',
    'arrow-triangle-wide',
    'arrow-concave',
    'bar-cap',
    'bracket',
  ];

  public static renderHtml(props: StrokeMarkerProps): string {
    const {
      markerStart,
      markerMid,
      markerEnd,
      markerAlign,
      markerOffset,
      markerSize,
      markerUnits,
      markerLayer,
      markerColor,
      stroke,
      isShapeRestricted,
      shapeTagName,
    } = props;

    if (isShapeRestricted) {
      return `
        <div class="prop-row" style="flex-direction:column; align-items:stretch; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; gap:6px; margin-top:4px;">
          <div style="font-size:10px; color:var(--text-muted); line-height:1.35;">
            Las figuras SVG cerradas (&lt;${shapeTagName || 'figura'}&gt;) no admiten marcadores en el estándar SVG W3C. Para añadir flechas o terminales, convierte la figura a vector.
          </div>
          <button type="button" class="prop-input" id="btn-convert-for-markers" style="cursor:pointer; background:var(--accent-color); color:#fff; font-weight:600; padding:4px 8px; text-align:center; font-size:11px; display:inline-flex; align-items:center; justify-content:center; gap:6px;" title="Convertir a trazado Bézier editable para admitir flechas y marcadores">
            ${ToolIcons.lightning} Convertir a Curvas para Flechas
          </button>
        </div>
      `;
    }

    const isCustomMarkerColor = markerColor && markerColor !== 'context-stroke';
    const markerColorDisplay = isCustomMarkerColor ? markerColor : (stroke === 'none' || stroke === 'currentColor' ? '#000000' : stroke);

    const renderMarkerOptions = (current: string, isMid: boolean = false) => `
      <option value="none" ${current === 'none' ? 'selected' : ''}>None (Ninguno)</option>
      <optgroup label="Flechas">
        <option value="arrow-open" ${current === 'arrow-open' ? 'selected' : ''}>Flecha Abierta (V)</option>
        <option value="arrow-filled" ${current === 'arrow-filled' ? 'selected' : ''}>Flecha Rellena (Triángulo)</option>
        <option value="arrow-stealth" ${current === 'arrow-stealth' ? 'selected' : ''}>Flecha Furtiva (Stealth)</option>
        <option value="arrow-triangle-wide" ${current === 'arrow-triangle-wide' ? 'selected' : ''}>Flecha Ancha (Wide)</option>
        <option value="arrow-concave" ${current === 'arrow-concave' ? 'selected' : ''}>Flecha Cóncava (Concave)</option>
      </optgroup>
      <optgroup label="Geometría">
        <option value="circle-dot" ${current === 'circle-dot' ? 'selected' : ''}>Punto Sólido (Circle Dot)</option>
        <option value="circle-open" ${current === 'circle-open' ? 'selected' : ''}>Círculo Hueco (Circle Open)</option>
        <option value="diamond" ${current === 'diamond' ? 'selected' : ''}>Rombo Diamante (Diamond)</option>
        <option value="square-block" ${current === 'square-block' ? 'selected' : ''}>Cuadrado Sólido (Square)</option>
        <option value="square-open" ${current === 'square-open' ? 'selected' : ''}>Cuadrado Hueco (Square Open)</option>
      </optgroup>
      ${!isMid ? `
      <optgroup label="Cotas y Remates">
        <option value="bar-cap" ${current === 'bar-cap' ? 'selected' : ''}>Barra Remate en T</option>
        <option value="slash" ${current === 'slash' ? 'selected' : ''}>Barra Inclinada (Slash)</option>
        <option value="bracket" ${current === 'bracket' ? 'selected' : ''}>Corchete Delimitador (Bracket)</option>
      </optgroup>
      ` : ''}
    `;

    return `
      <div class="prop-row">
        <span class="prop-label">Start Mkr</span>
        <select class="prop-input" id="el-marker-start" style="cursor:pointer;" title="Marcador de inicio de trazo (marker-start)">
          ${renderMarkerOptions(markerStart)}
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">Mid Mkr</span>
        <select class="prop-input" id="el-marker-mid" style="cursor:pointer;" title="Marcador en vértices intermedios (marker-mid)">
          ${renderMarkerOptions(markerMid, true)}
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">End Mkr</span>
        <select class="prop-input" id="el-marker-end" style="cursor:pointer;" title="Marcador de final de trazo (marker-end)">
          ${renderMarkerOptions(markerEnd)}
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">Mkr Align</span>
        <select class="prop-input" id="el-marker-align" style="cursor:pointer;" title="Alineación del marcador: Punta en nodo (Tip-on-end) ancla la punta exterior exacta en el vértice; Extender (Extend-past-end) ancla la base en el vértice y proyecta la flecha hacia afuera">
          <option value="tip" ${markerAlign === 'tip' ? 'selected' : ''}>Punta en nodo (Tip)</option>
          <option value="extend" ${markerAlign === 'extend' ? 'selected' : ''}>Extender fuera (Extend)</option>
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
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    el: VectorElement,
    model: VectorModel,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const btnConvertForMarkers = container.querySelector<HTMLButtonElement>('#btn-convert-for-markers');
    if (btnConvertForMarkers) {
      btnConvertForMarkers.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        model.convertToCurves(el);
        callbacks.onUpdateElement(el);
        onReRender();
      });
      return;
    }

    const elMarkerStart = container.querySelector<HTMLSelectElement>('#el-marker-start');
    const elMarkerMid = container.querySelector<HTMLSelectElement>('#el-marker-mid');
    const elMarkerEnd = container.querySelector<HTMLSelectElement>('#el-marker-end');
    const elMarkerAlign = container.querySelector<HTMLSelectElement>('#el-marker-align');
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
        const align = el.attributes['data-marker-align'] || 'tip';
        const offset = parseFloat(el.attributes['data-marker-offset'] || '0') || 0;
        const isCustom =
          align !== 'tip' ||
          offset !== 0 ||
          el.attributes['data-marker-size'] !== undefined ||
          el.attributes['data-marker-units'] !== undefined ||
          (el.attributes['data-marker-color'] !== undefined && el.attributes['data-marker-color'] !== 'context-stroke');

        let keyWithPos = baseVal;
        const isDirectional = StrokeMarkerControls.DIRECTIONAL_MARKERS.includes(baseVal);
        if (attr === 'marker-start' && isDirectional) {
          keyWithPos = `${baseVal}-start`;
        } else if (attr === 'marker-end' && isDirectional) {
          keyWithPos = `${baseVal}-end`;
        } else if (attr === 'marker-mid' && isDirectional) {
          keyWithPos = `${baseVal}-mid`;
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

    if (elMarkerAlign) {
      elMarkerAlign.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (elMarkerAlign.value === 'tip') {
          delete el.attributes['data-marker-align'];
        } else {
          el.attributes['data-marker-align'] = elMarkerAlign.value;
        }
        refreshActiveMarkers();
      });
    }

    if (elMarkerOffset) {
      elMarkerOffset.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const val = parseFloat(elMarkerOffset.value) || 0;
        if (val === 0) {
          delete el.attributes['data-marker-offset'];
        } else {
          el.attributes['data-marker-offset'] = val.toString();
        }
        refreshActiveMarkers();
      });
    }

    if (elMarkerSize) {
      elMarkerSize.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const val = Math.max(0.5, parseFloat(elMarkerSize.value) || 6);
        if (val === 6) {
          delete el.attributes['data-marker-size'];
        } else {
          el.attributes['data-marker-size'] = val.toString();
        }
        refreshActiveMarkers();
      });
    }

    if (elMarkerUnits) {
      elMarkerUnits.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        if (elMarkerUnits.value === 'strokeWidth') {
          delete el.attributes['data-marker-units'];
        } else {
          el.attributes['data-marker-units'] = elMarkerUnits.value;
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

    const applyMarkerColor = (color: string) => {
      if (color === 'context-stroke') {
        delete el.attributes['data-marker-color'];
        if (elMarkerColorHex) elMarkerColorHex.value = 'Auto (trazo)';
      } else {
        el.attributes['data-marker-color'] = color;
        if (elMarkerColor) elMarkerColor.value = color;
        if (elMarkerColorHex) elMarkerColorHex.value = color;
      }
      refreshActiveMarkers();
    };

    if (elMarkerColor) {
      elMarkerColor.addEventListener('input', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyMarkerColor(elMarkerColor.value);
      });
    }

    if (elMarkerColorHex) {
      elMarkerColorHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const val = elMarkerColorHex.value.trim();
        if (val === '' || val.toLowerCase() === 'auto' || val === 'context-stroke') {
          applyMarkerColor('context-stroke');
        } else {
          const hex = val.startsWith('#') ? val : `#${val}`;
          applyMarkerColor(hex);
        }
      });
    }

    if (btnResetMarkerColor) {
      btnResetMarkerColor.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        applyMarkerColor('context-stroke');
      });
    }
  }
}
