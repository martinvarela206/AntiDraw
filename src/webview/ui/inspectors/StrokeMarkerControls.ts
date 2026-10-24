import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import { I18nService } from '../../i18n/index.js';
import { ColorPickerPopover } from '../ColorPickerPopover.js';

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
            ${I18nService.t('inspector.markersRestrictedWarning', { tag: shapeTagName || 'shape' })}
          </div>
          <button type="button" class="prop-input" id="btn-convert-for-markers" style="cursor:pointer; background:var(--accent-color); color:#fff; font-weight:600; padding:4px 8px; text-align:center; font-size:11px; display:inline-flex; align-items:center; justify-content:center; gap:6px;" title="${I18nService.t('inspector.convertForMarkers')}">
            ${ToolIcons.lightning} ${I18nService.t('inspector.convertForMarkers')}
          </button>
        </div>
      `;
    }

    const isCustomMarkerColor = markerColor && markerColor !== 'context-stroke';
    const markerColorDisplay = isCustomMarkerColor ? markerColor : (stroke === 'none' || stroke === 'currentColor' ? '#000000' : stroke);

    const renderMarkerOptions = (current: string, isMid: boolean = false) => `
      <option value="none" ${current === 'none' ? 'selected' : ''}>${I18nService.t('common.none')}</option>
      <optgroup label="${I18nService.t('inspector.markerArrows')}">
        <option value="arrow-open" ${current === 'arrow-open' ? 'selected' : ''}>${I18nService.t('inspector.markerArrowOpen')}</option>
        <option value="arrow-filled" ${current === 'arrow-filled' ? 'selected' : ''}>${I18nService.t('inspector.markerArrowFilled')}</option>
        <option value="arrow-stealth" ${current === 'arrow-stealth' ? 'selected' : ''}>${I18nService.t('inspector.markerArrowStealth')}</option>
        <option value="arrow-triangle-wide" ${current === 'arrow-triangle-wide' ? 'selected' : ''}>${I18nService.t('inspector.markerArrowWide')}</option>
        <option value="arrow-concave" ${current === 'arrow-concave' ? 'selected' : ''}>${I18nService.t('inspector.markerArrowConcave')}</option>
      </optgroup>
      <optgroup label="${I18nService.t('inspector.markerGeometry')}">
        <option value="circle-dot" ${current === 'circle-dot' ? 'selected' : ''}>${I18nService.t('inspector.markerCircleDot')}</option>
        <option value="circle-open" ${current === 'circle-open' ? 'selected' : ''}>${I18nService.t('inspector.markerCircleOpen')}</option>
        <option value="diamond" ${current === 'diamond' ? 'selected' : ''}>${I18nService.t('inspector.markerDiamond')}</option>
        <option value="square-block" ${current === 'square-block' ? 'selected' : ''}>${I18nService.t('inspector.markerSquareBlock')}</option>
        <option value="square-open" ${current === 'square-open' ? 'selected' : ''}>${I18nService.t('inspector.markerSquareOpen')}</option>
      </optgroup>
      ${!isMid ? `
      <optgroup label="${I18nService.t('inspector.markerCaps')}">
        <option value="bar-cap" ${current === 'bar-cap' ? 'selected' : ''}>${I18nService.t('inspector.markerBarCap')}</option>
        <option value="slash" ${current === 'slash' ? 'selected' : ''}>${I18nService.t('inspector.markerSlash')}</option>
        <option value="bracket" ${current === 'bracket' ? 'selected' : ''}>${I18nService.t('inspector.markerBracket')}</option>
      </optgroup>
      ` : ''}
    `;

    return `
      <div class="prop-row">
        <span class="prop-label">${I18nService.t('inspector.markerStart')}</span>
        <select class="prop-input" id="el-marker-start" style="cursor:pointer;" title="${I18nService.t('inspector.markerStart')}">
          ${renderMarkerOptions(markerStart)}
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">${I18nService.t('inspector.markerMid')}</span>
        <select class="prop-input" id="el-marker-mid" style="cursor:pointer;" title="${I18nService.t('inspector.markerMid')}">
          ${renderMarkerOptions(markerMid, true)}
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">${I18nService.t('inspector.markerEnd')}</span>
        <select class="prop-input" id="el-marker-end" style="cursor:pointer;" title="${I18nService.t('inspector.markerEnd')}">
          ${renderMarkerOptions(markerEnd)}
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">${I18nService.t('inspector.markerAlign')}</span>
        <select class="prop-input" id="el-marker-align" style="cursor:pointer;">
          <option value="tip" ${markerAlign === 'tip' ? 'selected' : ''}>${I18nService.t('inspector.markerTip')}</option>
          <option value="extend" ${markerAlign === 'extend' ? 'selected' : ''}>${I18nService.t('inspector.markerExtend')}</option>
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">${I18nService.t('inspector.markerOffset')}</span>
        <input type="number" class="prop-input" id="el-marker-offset" value="${markerOffset}" step="0.5" />
      </div>
      <div class="prop-row">
        <span class="prop-label">${I18nService.t('inspector.markerSize')}</span>
        <div style="display:flex; gap:4px; flex:1; align-items:center;">
          <input type="number" class="prop-input" id="el-marker-size" value="${markerSize}" min="0.5" step="0.5" style="width:55px;" />
          <select class="prop-input" id="el-marker-units" style="cursor:pointer; flex:1;">
            <option value="strokeWidth" ${markerUnits === 'strokeWidth' ? 'selected' : ''}>${I18nService.t('inspector.markerRelative')}</option>
            <option value="userSpaceOnUse" ${markerUnits === 'userSpaceOnUse' ? 'selected' : ''}>${I18nService.t('inspector.markerAbsolute')}</option>
          </select>
        </div>
      </div>
      <div class="prop-row">
        <span class="prop-label">Mkr Layer</span>
        <select class="prop-input" id="el-marker-layer" style="cursor:pointer;" title="${I18nService.t('inspector.markerPaintOrderTooltip')}">
          <option value="over" ${markerLayer === 'over' ? 'selected' : ''}>${I18nService.t('inspector.markerLayerOver')}</option>
          <option value="under" ${markerLayer === 'under' ? 'selected' : ''}>${I18nService.t('inspector.markerLayerUnder')}</option>
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">Mkr Color</span>
        <div class="color-picker-row">
          <button type="button" class="color-swatch" id="el-marker-color" style="background-color: ${markerColorDisplay};" title="${I18nService.t('inspector.markerColorTooltip')}"></button>
          <input type="text" class="prop-input" id="el-marker-color-hex" value="${isCustomMarkerColor ? markerColor : I18nService.t('inspector.markerAutoPlaceholder')}" placeholder="${I18nService.t('inspector.markerAutoPlaceholder')}" title="${I18nService.t('inspector.markerColorTooltip')}" />
          <button class="prop-input" id="btn-reset-marker-color" style="width:26px; height:24px; padding:0; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="${I18nService.t('inspector.markerResetColorTooltip')}">⟲</button>
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
    const elMarkerColor = container.querySelector<HTMLButtonElement>('#el-marker-color');
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
        if (elMarkerColor) {
          const stroke = el.attributes['stroke'];
          elMarkerColor.style.backgroundColor = (stroke && stroke.startsWith('#')) ? stroke : '#000000';
        }
      } else {
        el.attributes['data-marker-color'] = color;
        if (elMarkerColor) elMarkerColor.style.backgroundColor = color;
        if (elMarkerColorHex) elMarkerColorHex.value = color;
      }
      refreshActiveMarkers();
    };

    if (elMarkerColor) {
      elMarkerColor.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentCustom = el.attributes['data-marker-color'];
        const initial = (currentCustom && currentCustom.startsWith('#')) ? currentCustom : (el.attributes['stroke']?.startsWith('#') ? el.attributes['stroke'] : '#000000');
        ColorPickerPopover.show({
          anchorEl: elMarkerColor,
          initialColor: initial,
          showAlpha: false,
          onChange: ({ hex }) => {
            el.attributes['data-marker-color'] = hex;
            elMarkerColor.style.backgroundColor = hex;
            if (elMarkerColorHex) elMarkerColorHex.value = hex;
            refreshActiveMarkers();
          },
          onCommit: ({ hex }) => {
            if (callbacks.onPushUndo) callbacks.onPushUndo();
            applyMarkerColor(hex);
          }
        });
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
