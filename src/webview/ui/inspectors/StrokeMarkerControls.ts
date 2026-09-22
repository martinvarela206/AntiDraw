import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

export interface StrokeMarkerProps {
  markerStart: string;
  markerMid: string;
  markerEnd: string;
  markerOffset: string;
  markerSize: string;
  markerUnits: string;
  markerLayer: string;
  markerColor: string;
  stroke: string;
}

/**
 * ARCHITECTURAL RATIONALE: Modular Stroke Marker Subsystem (StrokeMarkerControls)
 *
 * 1. Single Responsibility & Rule 6 File Size Compliance:
 *    Decoupled from StrokeInspector to preserve cohesive responsibilities and maintain file sizes
 *    well under the 500-line threshold.
 *
 * 2. Universal SVG Terminal Marker System:
 *    Encapsulates controls for terminal and midpoint markers (start, mid, end), parametric offsets,
 *    relative vs absolute sizing (strokeWidth vs userSpaceOnUse), paint-order layer stacking,
 *    and decoupled marker tints with context-stroke fallback.
 */
export class StrokeMarkerControls {
  public static renderHtml(props: StrokeMarkerProps): string {
    const {
      markerStart,
      markerMid,
      markerEnd,
      markerOffset,
      markerSize,
      markerUnits,
      markerLayer,
      markerColor,
      stroke,
    } = props;

    const isCustomMarkerColor = markerColor && markerColor !== 'context-stroke';
    const markerColorDisplay = isCustomMarkerColor ? markerColor : (stroke === 'none' || stroke === 'currentColor' ? '#000000' : stroke);

    return `
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
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    el: VectorElement,
    _model: VectorModel,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
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
  }
}
