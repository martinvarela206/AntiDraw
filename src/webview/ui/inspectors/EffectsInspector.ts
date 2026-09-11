import { VectorElement, DropShadowConfig, InnerShadowConfig } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';

/**
 * EffectsInspector
 *
 * Encapsulates the UI rendering and interactive event handlers for element visual filter effects:
 * - Sombra Paralela (Drop Shadow): toggle, offset X (`dx`), offset Y (`dy`), blur radius, opacity (%), and color picker/hex.
 * - Sombra Interna (Inner Shadow): toggle, offset X (`dx`), offset Y (`dy`), blur radius, opacity (%), and color picker/hex.
 * - Live SVG `<filter>` linking (`filter="url(#ad-filter-shadow-${el.id})"`) and JSON attribute synchronization (`data-drop-shadow`, `data-inner-shadow`).
 */
export class EffectsInspector {
  public static renderHtml(
    ds: DropShadowConfig,
    is: InnerShadowConfig
  ): string {
    return `
      <div class="panel-section">
        <div class="panel-title">Effects (Sombras)</div>
        
        <!-- Sombra Paralela (Drop Shadow) -->
        <div class="prop-row" style="margin-bottom: 6px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--text-main);">
            <input type="checkbox" id="shadow-drop-enable" ${ds.enabled ? 'checked' : ''} />
            Sombra Paralela (Drop Shadow)
          </label>
        </div>
        <div id="shadow-drop-controls" style="${ds.enabled ? '' : 'display: none;'} margin-bottom: 12px; padding-left: 6px; border-left: 2px solid var(--border-subtle);">
          <div class="prop-row">
            <span class="prop-label">Offset X</span>
            <input type="number" class="prop-input" id="shadow-drop-dx" value="${ds.dx}" step="1" />
            <span class="prop-label" style="width:20px; text-align:right;">Y</span>
            <input type="number" class="prop-input" id="shadow-drop-dy" value="${ds.dy}" step="1" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Blur</span>
            <input type="number" class="prop-input" id="shadow-drop-blur" value="${ds.blur}" min="0" step="1" />
            <span class="prop-label" style="width:40px; text-align:right;">Opac%</span>
            <input type="number" class="prop-input" id="shadow-drop-opacity" value="${Math.round(ds.opacity * 100)}" min="0" max="100" step="5" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="shadow-drop-color" value="${ds.color || '#000000'}" />
              <input type="text" class="prop-input" id="shadow-drop-color-hex" value="${ds.color || '#000000'}" />
            </div>
          </div>
        </div>

        <!-- Sombra Interna (Inner Shadow) -->
        <div class="prop-row" style="margin-bottom: 6px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--text-main);">
            <input type="checkbox" id="shadow-inner-enable" ${is.enabled ? 'checked' : ''} />
            Sombra Interna (Inner Shadow)
          </label>
        </div>
        <div id="shadow-inner-controls" style="${is.enabled ? '' : 'display: none;'} padding-left: 6px; border-left: 2px solid var(--border-subtle);">
          <div class="prop-row">
            <span class="prop-label">Offset X</span>
            <input type="number" class="prop-input" id="shadow-inner-dx" value="${is.dx}" step="1" />
            <span class="prop-label" style="width:20px; text-align:right;">Y</span>
            <input type="number" class="prop-input" id="shadow-inner-dy" value="${is.dy}" step="1" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Blur</span>
            <input type="number" class="prop-input" id="shadow-inner-blur" value="${is.blur}" min="0" step="1" />
            <span class="prop-label" style="width:40px; text-align:right;">Opac%</span>
            <input type="number" class="prop-input" id="shadow-inner-opacity" value="${Math.round(is.opacity * 100)}" min="0" max="100" step="5" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="shadow-inner-color" value="${is.color || '#000000'}" />
              <input type="text" class="prop-input" id="shadow-inner-color-hex" value="${is.color || '#000000'}" />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    el: VectorElement,
    ds: DropShadowConfig,
    is: InnerShadowConfig,
    callbacks: PropertyPanelCallbacks
  ): void {
    const shadowDropEnable = container.querySelector<HTMLInputElement>('#shadow-drop-enable');
    const shadowDropControls = container.querySelector<HTMLElement>('#shadow-drop-controls');
    const shadowDropDx = container.querySelector<HTMLInputElement>('#shadow-drop-dx');
    const shadowDropDy = container.querySelector<HTMLInputElement>('#shadow-drop-dy');
    const shadowDropBlur = container.querySelector<HTMLInputElement>('#shadow-drop-blur');
    const shadowDropOpacity = container.querySelector<HTMLInputElement>('#shadow-drop-opacity');
    const shadowDropColor = container.querySelector<HTMLInputElement>('#shadow-drop-color');
    const shadowDropColorHex = container.querySelector<HTMLInputElement>('#shadow-drop-color-hex');

    const shadowInnerEnable = container.querySelector<HTMLInputElement>('#shadow-inner-enable');
    const shadowInnerControls = container.querySelector<HTMLElement>('#shadow-inner-controls');
    const shadowInnerDx = container.querySelector<HTMLInputElement>('#shadow-inner-dx');
    const shadowInnerDy = container.querySelector<HTMLInputElement>('#shadow-inner-dy');
    const shadowInnerBlur = container.querySelector<HTMLInputElement>('#shadow-inner-blur');
    const shadowInnerOpacity = container.querySelector<HTMLInputElement>('#shadow-inner-opacity');
    const shadowInnerColor = container.querySelector<HTMLInputElement>('#shadow-inner-color');
    const shadowInnerColorHex = container.querySelector<HTMLInputElement>('#shadow-inner-color-hex');

    const applyShadowChanges = () => {
      if (ds.enabled) {
        el.attributes['data-drop-shadow'] = JSON.stringify(ds);
      } else {
        delete el.attributes['data-drop-shadow'];
      }
      if (is.enabled) {
        el.attributes['data-inner-shadow'] = JSON.stringify(is);
      } else {
        delete el.attributes['data-inner-shadow'];
      }
      if (ds.enabled || is.enabled) {
        el.attributes['filter'] = `url(#ad-filter-shadow-${el.id})`;
      } else {
        delete el.attributes['filter'];
      }
      callbacks.onUpdateElement(el);
    };

    if (shadowDropEnable && shadowDropControls) {
      shadowDropEnable.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        ds.enabled = shadowDropEnable.checked;
        shadowDropControls.style.display = ds.enabled ? '' : 'none';
        applyShadowChanges();
      });
    }

    if (shadowDropDx) {
      shadowDropDx.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        ds.dx = parseFloat(shadowDropDx.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowDropDy) {
      shadowDropDy.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        ds.dy = parseFloat(shadowDropDy.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowDropBlur) {
      shadowDropBlur.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        ds.blur = Math.max(0, parseFloat(shadowDropBlur.value) || 0);
        applyShadowChanges();
      });
    }
    if (shadowDropOpacity) {
      shadowDropOpacity.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const pct = Math.max(0, Math.min(100, parseFloat(shadowDropOpacity.value) || 0));
        ds.opacity = pct / 100;
        applyShadowChanges();
      });
    }
    if (shadowDropColor) {
      shadowDropColor.addEventListener('input', () => {
        ds.color = shadowDropColor.value;
        if (shadowDropColorHex) shadowDropColorHex.value = shadowDropColor.value;
        applyShadowChanges();
      });
      shadowDropColor.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
      });
    }
    if (shadowDropColorHex) {
      shadowDropColorHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        ds.color = shadowDropColorHex.value;
        if (shadowDropColor) shadowDropColor.value = shadowDropColorHex.value;
        applyShadowChanges();
      });
    }

    // Inner Shadow listeners
    if (shadowInnerEnable && shadowInnerControls) {
      shadowInnerEnable.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        is.enabled = shadowInnerEnable.checked;
        shadowInnerControls.style.display = is.enabled ? '' : 'none';
        applyShadowChanges();
      });
    }
    if (shadowInnerDx) {
      shadowInnerDx.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        is.dx = parseFloat(shadowInnerDx.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowInnerDy) {
      shadowInnerDy.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        is.dy = parseFloat(shadowInnerDy.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowInnerBlur) {
      shadowInnerBlur.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        is.blur = Math.max(0, parseFloat(shadowInnerBlur.value) || 0);
        applyShadowChanges();
      });
    }
    if (shadowInnerOpacity) {
      shadowInnerOpacity.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const pct = Math.max(0, Math.min(100, parseFloat(shadowInnerOpacity.value) || 0));
        is.opacity = pct / 100;
        applyShadowChanges();
      });
    }
    if (shadowInnerColor) {
      shadowInnerColor.addEventListener('input', () => {
        is.color = shadowInnerColor.value;
        if (shadowInnerColorHex) shadowInnerColorHex.value = shadowInnerColor.value;
        applyShadowChanges();
      });
      shadowInnerColor.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
      });
    }
    if (shadowInnerColorHex) {
      shadowInnerColorHex.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        is.color = shadowInnerColorHex.value;
        if (shadowInnerColor) shadowInnerColor.value = shadowInnerColorHex.value;
        applyShadowChanges();
      });
    }
  }
}
