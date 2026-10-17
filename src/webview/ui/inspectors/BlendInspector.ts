import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import { BlendEngine, BlendConfig } from '../../engine/blend/BlendEngine.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { I18nService } from '../../i18n/index.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Blend Tool Inspector (BlendInspector - MDWiki 8.8)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates parametric morphological blend controls (step count, start node alignment,
 *    and anti-twisting curve polarity reversal) from general vector inspectors.
 *
 * 2. Interactive Start Node 0 Calibration:
 *    Renders dedicated steppers for Figure A and Figure B, allowing the designer to
 *    shift the start anchor node cyclically to match corresponding geometry (e.g. corner to corner).
 *
 * 3. Immediate Twisting / Retorcimiento Resolution:
 *    Exposes a prominent toggle button for contour direction (horario <-> antihorario).
 *    Clicking it flips reverseDirectionB, instantly eliminating unsightly spiral self-intersections.
 *
 * 4. Bake / Expansion Support:
 *    Allows converting the live parametric blend into standalone SVG vector paths.
 */
export class BlendInspector {
  public static renderHtml(blendGroup: VectorElement): string {
    const cfg = BlendEngine.getBlendConfig(blendGroup) || {
      steps: 5,
      startNodeAIndex: 0,
      startNodeBIndex: 0,
      reverseDirectionA: false,
      reverseDirectionB: false,
    };

    const isReversedB = cfg.reverseDirectionB;

    return `
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${I18nService.t('inspector.parametricBlend')}</span>
          <span class="badge" style="font-size:10px; background:rgba(99,102,241,0.2); color:#818cf8; font-weight:600; padding:1px 6px; border-radius:4px;">${I18nService.t('inspector.live')}</span>
        </div>

        <!-- Pasos Intermedios -->
        <div class="prop-row" style="margin-top:6px;">
          <span class="prop-label">${I18nService.t('inspector.steps')}</span>
          <div style="display:flex; align-items:center; gap:6px; flex:1;">
            <input type="range" id="el-blend-steps-slider" min="1" max="40" step="1" value="${cfg.steps}" style="flex:1; cursor:pointer;" />
            <input type="number" class="prop-input" id="el-blend-steps-input" min="1" max="50" step="1" value="${cfg.steps}" style="width:45px; text-align:right;" />
          </div>
        </div>

        <!-- Calibración Manual de Nodo Inicial (Nodo 0) -->
        <div class="prop-row" style="align-items:flex-start; margin-top:8px;">
          <span class="prop-label" style="margin-top:4px;">${I18nService.t('inspector.startNode0')}</span>
          <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
            <!-- Figura A -->
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-subtle, rgba(0,0,0,0.15)); padding:4px 6px; border-radius:4px;">
              <span style="font-size:10.5px; color:var(--text-muted);">${I18nService.t('inspector.figureA')}:</span>
              <div style="display:flex; align-items:center; gap:3px;">
                <button type="button" class="prop-input" id="btn-blend-prev-a" style="cursor:pointer; width:22px; padding:1px; text-align:center;">◀</button>
                <input type="number" class="prop-input" id="el-blend-start-a" min="0" max="99" value="${cfg.startNodeAIndex}" style="width:36px; text-align:center; padding:1px;" />
                <button type="button" class="prop-input" id="btn-blend-next-a" style="cursor:pointer; width:22px; padding:1px; text-align:center;">▶</button>
              </div>
            </div>

            <!-- Figura B -->
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-subtle, rgba(0,0,0,0.15)); padding:4px 6px; border-radius:4px;">
              <span style="font-size:10.5px; color:var(--text-muted);">${I18nService.t('inspector.figureB')}:</span>
              <div style="display:flex; align-items:center; gap:3px;">
                <button type="button" class="prop-input" id="btn-blend-prev-b" style="cursor:pointer; width:22px; padding:1px; text-align:center;">◀</button>
                <input type="number" class="prop-input" id="el-blend-start-b" min="0" max="99" value="${cfg.startNodeBIndex}" style="width:36px; text-align:center; padding:1px;" />
                <button type="button" class="prop-input" id="btn-blend-next-b" style="cursor:pointer; width:22px; padding:1px; text-align:center;">▶</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Conmutador de Sentido de Recorrido (Anti-Twisting) -->
        <div class="prop-row" style="margin-top:8px;">
          <span class="prop-label">${I18nService.t('inspector.twisting')}</span>
          <button type="button" class="prop-input" id="btn-blend-toggle-twist" style="flex:1; cursor:pointer; font-weight:600; padding:4px 6px; text-align:center; display:flex; align-items:center; justify-content:center; gap:4px; ${isReversedB ? 'background:rgba(239,68,68,0.2); color:#f87171; border-color:#ef4444;' : 'background:rgba(16,185,129,0.15); color:#34d399;'}">
            <span>${isReversedB ? I18nService.t('inspector.reversedTwist') : I18nService.t('inspector.directTwist')}</span>
          </button>
        </div>

        <!-- Acciones de Fusión -->
        <div class="prop-row" style="margin-top:10px; display:flex; gap:4px;">
          <button type="button" class="prop-input" id="btn-blend-expand" style="flex:1; cursor:pointer; font-weight:600; padding:5px; background:var(--bg-active); color:var(--text-main);">
            ${I18nService.t('inspector.expandBlend')}
          </button>
          <button type="button" class="prop-input" id="btn-blend-release" style="cursor:pointer; padding:5px 8px; color:#ef4444;">
            ${I18nService.t('inspector.releaseBlend')}
          </button>
        </div>
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    blendGroup: VectorElement,
    model: VectorModel,
    callbacks: PropertyPanelCallbacks,
    onReRender: () => void
  ): void {
    const cfg = BlendEngine.getBlendConfig(blendGroup);
    if (!cfg) return;

    // Pasos slider and input
    const slider = container.querySelector<HTMLInputElement>('#el-blend-steps-slider');
    const input = container.querySelector<HTMLInputElement>('#el-blend-steps-input');

    const updateSteps = (val: number) => {
      const steps = Math.max(1, Math.min(50, val));
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      BlendEngine.updateBlendConfig(blendGroup, { steps });
      callbacks.onUpdateElement(blendGroup);
      onReRender();
    };

    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseInt(slider.value, 10) || 5;
        if (input) input.value = val.toString();
        BlendEngine.updateBlendConfig(blendGroup, { steps: val });
        callbacks.onUpdateElement(blendGroup);
      });
      slider.addEventListener('change', () => {
        const val = parseInt(slider.value, 10) || 5;
        updateSteps(val);
      });
    }

    if (input) {
      input.addEventListener('change', () => {
        const val = parseInt(input.value, 10) || 5;
        updateSteps(val);
      });
    }

    // Start Node A controls
    const inputStartA = container.querySelector<HTMLInputElement>('#el-blend-start-a');
    const btnPrevA = container.querySelector<HTMLButtonElement>('#btn-blend-prev-a');
    const btnNextA = container.querySelector<HTMLButtonElement>('#btn-blend-next-a');

    const updateStartA = (idx: number) => {
      const startNodeAIndex = Math.max(0, idx);
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      BlendEngine.updateBlendConfig(blendGroup, { startNodeAIndex });
      callbacks.onUpdateElement(blendGroup);
      onReRender();
    };

    if (inputStartA) {
      inputStartA.addEventListener('change', () => {
        updateStartA(parseInt(inputStartA.value, 10) || 0);
      });
    }
    if (btnPrevA) {
      btnPrevA.addEventListener('click', () => {
        const curr = parseInt(inputStartA?.value || '0', 10) || 0;
        updateStartA(Math.max(0, curr - 1));
      });
    }
    if (btnNextA) {
      btnNextA.addEventListener('click', () => {
        const curr = parseInt(inputStartA?.value || '0', 10) || 0;
        updateStartA(curr + 1);
      });
    }

    // Start Node B controls
    const inputStartB = container.querySelector<HTMLInputElement>('#el-blend-start-b');
    const btnPrevB = container.querySelector<HTMLButtonElement>('#btn-blend-prev-b');
    const btnNextB = container.querySelector<HTMLButtonElement>('#btn-blend-next-b');

    const updateStartB = (idx: number) => {
      const startNodeBIndex = Math.max(0, idx);
      if (callbacks.onPushUndo) callbacks.onPushUndo();
      BlendEngine.updateBlendConfig(blendGroup, { startNodeBIndex });
      callbacks.onUpdateElement(blendGroup);
      onReRender();
    };

    if (inputStartB) {
      inputStartB.addEventListener('change', () => {
        updateStartB(parseInt(inputStartB.value, 10) || 0);
      });
    }
    if (btnPrevB) {
      btnPrevB.addEventListener('click', () => {
        const curr = parseInt(inputStartB?.value || '0', 10) || 0;
        updateStartB(Math.max(0, curr - 1));
      });
    }
    if (btnNextB) {
      btnNextB.addEventListener('click', () => {
        const curr = parseInt(inputStartB?.value || '0', 10) || 0;
        updateStartB(curr + 1);
      });
    }

    // Toggle Twisting
    const btnToggleTwist = container.querySelector<HTMLButtonElement>('#btn-blend-toggle-twist');
    if (btnToggleTwist) {
      btnToggleTwist.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        BlendEngine.toggleReverseDirectionB(blendGroup);
        callbacks.onUpdateElement(blendGroup);
        onReRender();
      });
    }

    // Expand Blend Group into standard vectors
    const btnExpand = container.querySelector<HTMLButtonElement>('#btn-blend-expand');
    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const expanded = BlendEngine.expandBlendGroup(blendGroup);
        const idx = model.elements.findIndex((e) => e.id === blendGroup.id);
        if (idx >= 0) {
          model.elements.splice(idx, 1, ...expanded);
          callbacks.onUpdateElement(model.elements[idx]);
          onReRender();
        }
      });
    }

    // Release Blend Group back to original shape A and B
    const btnRelease = container.querySelector<HTMLButtonElement>('#btn-blend-release');
    if (btnRelease) {
      btnRelease.addEventListener('click', () => {
        const rawA = blendGroup.attributes[BlendEngine.SOURCE_A_ATTR];
        const rawB = blendGroup.attributes[BlendEngine.SOURCE_B_ATTR];
        if (!rawA || !rawB) return;
        try {
          const elA: VectorElement = JSON.parse(rawA);
          const elB: VectorElement = JSON.parse(rawB);
          if (callbacks.onPushUndo) callbacks.onPushUndo();
          const idx = model.elements.findIndex((e) => e.id === blendGroup.id);
          if (idx >= 0) {
            model.elements.splice(idx, 1, elA, elB);
            callbacks.onUpdateElement(elA);
            onReRender();
          }
        } catch {
          // ignore error
        }
      });
    }
  }
}
