import { VectorElement, VectorModel } from '../../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../../engine/SelectionTool.js';
import { ToolIcons } from '../../icons/ToolIcons.js';
import { I18nService } from '../../i18n/I18nService.js';
import { GroupHierarchyService } from '../../engine/selection/GroupHierarchyService.js';

export interface GroupInspectorCallbacks {
  onUpdateElement: (el: VectorElement) => void;
  onPushUndo?: () => void;
  onSelectionModeChange?: (mode: 'move' | 'scale' | 'rotate' | 'distort') => void;
  onTranslateSelection?: (dx: number, dy: number) => void;
  onUngroup?: () => void;
  onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onBoolean?: (op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment') => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Hierarchical Group Inspector (GroupInspector - L4)
 *
 * 1. Single Responsibility & Dedicated Group UX:
 *    Renders contextual properties exclusively for SVG container groups (<g>), replacing
 *    flat single-element controls with group-level bounding box geometry, isolated opacity
 *    management (W3C stacking context), compositing blend modes, child inventory telemetries,
 *    and instant ungrouping controls.
 *
 * 2. Isolated Stacking Context (Rule 18 / FEAT-GROUP):
 *    Applying opacity to group.attributes['opacity'] creates an isolated off-screen blending
 *    buffer where children compose together before applying group transparency, preventing
 *    internal seam overlaps and transparency multiplication.
 *
 * 3. Bidirectional Geometry Mutation:
 *    Allows direct numeric repositioning (X, Y) and dimensional scaling (W, H) that
 *    proportionally cascades to all descendant leaf vectors.
 */
export class GroupInspector {
  public static render(
    container: HTMLElement,
    group: VectorElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    callbacks: GroupInspectorCallbacks,
    onReRender: () => void
  ): void {
    const box = selectionTool.getBoundingBox(group);
    container.innerHTML = this.renderHtml(group, model, selectionTool, box);
    this.bindEvents(container, group, model, selectionTool, box, callbacks, onReRender);
  }

  public static renderHtml(
    group: VectorElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    box: BoundingBox | null
  ): string {
    const children = group.children || [];
    const leaves = GroupHierarchyService.collectLeafElements(group);

    // Group Opacity calculation
    const rawOpacity = parseFloat(group.attributes['opacity'] ?? '1');
    const opacityPct = Math.round(Math.max(0, Math.min(1, isNaN(rawOpacity) ? 1 : rawOpacity)) * 100);

    // Mix Blend Mode
    const blendMode = group.attributes['style']?.match(/mix-blend-mode:\s*([^;]+)/i)?.[1]?.trim() ||
      group.attributes['mix-blend-mode'] || 'normal';

    const x = box ? Math.round(box.x) : 0;
    const y = box ? Math.round(box.y) : 0;
    const w = box ? Math.round(box.width) : 0;
    const h = box ? Math.round(box.height) : 0;

    const blendModes = [
      { id: 'normal', label: I18nService.t('inspector.blendModeNormal') },
      { id: 'multiply', label: I18nService.t('inspector.blendModeMultiply') },
      { id: 'screen', label: I18nService.t('inspector.blendModeScreen') },
      { id: 'overlay', label: I18nService.t('inspector.blendModeOverlay') },
      { id: 'darken', label: I18nService.t('inspector.blendModeDarken') },
      { id: 'lighten', label: I18nService.t('inspector.blendModeLighten') },
      { id: 'color-dodge', label: I18nService.t('inspector.blendModeColorDodge') },
      { id: 'color-burn', label: I18nService.t('inspector.blendModeColorBurn') },
      { id: 'hard-light', label: I18nService.t('inspector.blendModeHardLight') },
      { id: 'soft-light', label: I18nService.t('inspector.blendModeSoftLight') },
      { id: 'difference', label: I18nService.t('inspector.blendModeDifference') },
      { id: 'exclusion', label: I18nService.t('inspector.blendModeExclusion') },
    ];

    return `
      <!-- 1. Header & Contained Elements Summary -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${I18nService.t('inspector.groupTitle')}</span>
          <span style="font-size:10px; font-weight:700; color:var(--accent-color); background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.3); border-radius:3px; padding:1px 5px;">${I18nService.t('inspector.groupTag')}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('common.elements')}</span>
          <span style="font-weight:600; color:var(--text-main);">${I18nService.t('inspector.containedElements', { count: children.length })}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('common.nodes')}</span>
          <span style="font-weight:600; color:var(--text-main);">${I18nService.t('inspector.totalNodes', { count: leaves.reduce((acc, curr) => acc + (curr.vertices ? curr.vertices.length : 0), 0) })}</span>
        </div>
        <div class="prop-row" style="margin-top:6px;">
          <button class="prop-input" id="btn-group-ungroup" style="cursor:pointer; background:var(--bg-panel-hover); font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px; width:100%;" title="${I18nService.t('inspector.ungroupShortcut')}">
            ${ToolIcons.fragment} ${I18nService.t('inspector.ungroupShortcut')}
          </button>
        </div>
      </div>

      <!-- 2. Interaction Modes -->
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('panels.transform')}</div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('inspector.mode')}</span>
          <div style="display:flex; gap:4px; flex:1;">
            <button class="prop-input" id="btn-group-mode-move" style="flex:1; cursor:pointer; font-weight:600; padding:4px; ${selectionTool.selectionMode === 'move' ? 'background:#10b981; color:#ffffff;' : ''}" title="${I18nService.t('inspector.modeMove')} (W)">${I18nService.t('inspector.modeMove')}</button>
            <button class="prop-input" id="btn-group-mode-scale" style="flex:1; cursor:pointer; font-weight:600; padding:4px; ${selectionTool.selectionMode === 'scale' ? 'background:var(--figma-brand); color:#ffffff;' : ''}" title="${I18nService.t('inspector.modeScale')} (R)">${I18nService.t('inspector.modeScale')}</button>
            <button class="prop-input" id="btn-group-mode-rotate" style="flex:1; cursor:pointer; font-weight:600; padding:4px; ${selectionTool.selectionMode === 'rotate' ? 'background:#8b5cf6; color:#ffffff;' : ''}" title="${I18nService.t('inspector.modeRotate')} (E)">${I18nService.t('inspector.modeRotate')}</button>
          </div>
        </div>
      </div>

      <!-- 3. Group Bounding Box Geometry -->
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('panels.geometry')}</div>
        <div class="prop-row">
          <span class="prop-label">X</span>
          <input type="number" class="prop-input" id="group-geo-x" value="${x}" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="group-geo-y" value="${y}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">W</span>
          <input type="number" class="prop-input" id="group-geo-w" value="${w}" min="1" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="group-geo-h" value="${h}" min="1" />
        </div>
      </div>

      <!-- 4. Group Opacity (Isolated Stacking Context) -->
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.groupOpacity')}</div>
        <div class="prop-row">
          <input type="range" class="prop-input" id="group-opacity-slider" min="0" max="100" step="1" value="${opacityPct}" style="flex:1; cursor:pointer; margin:0 4px;" title="${I18nService.t('inspector.groupOpacity')}" />
          <div style="display:flex; align-items:center; gap:2px; width:54px;">
            <input type="number" class="prop-input" id="group-opacity-num" min="0" max="100" step="1" value="${opacityPct}" style="width:36px; padding:2px 4px; text-align:right;" />
            <span style="font-size:11px; color:var(--text-muted); font-weight:600;">%</span>
          </div>
        </div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px; line-height:1.4;">
          ${I18nService.t('inspector.groupOpacityHint')}
        </div>
      </div>

      <!-- 5. Blend Mode (mix-blend-mode) -->
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.blendMode')}</div>
        <div class="prop-row">
          <select class="prop-input" id="group-blend-mode" style="width:100%; cursor:pointer;">
            ${blendModes.map((m) => `<option value="${m.id}" ${m.id === blendMode ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- 6. Alignment Actions -->
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.alignSelection')}</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 4px; flex-wrap: wrap;">
          <button class="btn-icon" id="btn-group-align-left" title="${I18nService.t('inspector.alignLeft')}">${ToolIcons.alignLeft}</button>
          <button class="btn-icon" id="btn-group-align-center" title="${I18nService.t('inspector.alignCenter')}">${ToolIcons.alignCenter}</button>
          <button class="btn-icon" id="btn-group-align-right" title="${I18nService.t('inspector.alignRight')}">${ToolIcons.alignRight}</button>
          <button class="btn-icon" id="btn-group-align-top" title="${I18nService.t('inspector.alignTop')}">${ToolIcons.alignTop}</button>
          <button class="btn-icon" id="btn-group-align-middle" title="${I18nService.t('inspector.alignMiddle')}">${ToolIcons.alignMiddle}</button>
          <button class="btn-icon" id="btn-group-align-bottom" title="${I18nService.t('inspector.alignBottom')}">${ToolIcons.alignBottom}</button>
        </div>
      </div>
    `;
  }

  public static bindEvents(
    container: HTMLElement,
    group: VectorElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    box: BoundingBox | null,
    callbacks: GroupInspectorCallbacks,
    onReRender: () => void
  ): void {
    // 1. Ungroup Button
    const btnUngroup = container.querySelector<HTMLButtonElement>('#btn-group-ungroup');
    if (btnUngroup) {
      btnUngroup.addEventListener('click', () => {
        if (callbacks.onUngroup) {
          callbacks.onUngroup();
        }
      });
    }

    // 2. Interaction Mode Buttons
    const btnModeMove = container.querySelector<HTMLButtonElement>('#btn-group-mode-move');
    const btnModeScale = container.querySelector<HTMLButtonElement>('#btn-group-mode-scale');
    const btnModeRotate = container.querySelector<HTMLButtonElement>('#btn-group-mode-rotate');

    if (btnModeMove) {
      btnModeMove.addEventListener('click', () => {
        selectionTool.selectionMode = 'move';
        callbacks.onSelectionModeChange?.('move');
        onReRender();
      });
    }
    if (btnModeScale) {
      btnModeScale.addEventListener('click', () => {
        selectionTool.selectionMode = 'scale';
        callbacks.onSelectionModeChange?.('scale');
        onReRender();
      });
    }
    if (btnModeRotate) {
      btnModeRotate.addEventListener('click', () => {
        selectionTool.selectionMode = 'rotate';
        callbacks.onSelectionModeChange?.('rotate');
        onReRender();
      });
    }

    // 3. Group Opacity
    const opacitySlider = container.querySelector<HTMLInputElement>('#group-opacity-slider');
    const opacityNum = container.querySelector<HTMLInputElement>('#group-opacity-num');

    const applyOpacity = (val: number, pushUndo: boolean = false) => {
      const clamped = Math.max(0, Math.min(100, Math.round(val)));
      if (opacitySlider) opacitySlider.value = clamped.toString();
      if (opacityNum) opacityNum.value = clamped.toString();

      const strVal = clamped === 100 ? '1' : (clamped / 100).toString();
      if (pushUndo && callbacks.onPushUndo) {
        callbacks.onPushUndo();
      }

      group.attributes['opacity'] = strVal;

      const domGroup = document.getElementById(group.id);
      if (domGroup) {
        if (clamped === 100) domGroup.removeAttribute('opacity');
        else domGroup.setAttribute('opacity', strVal);
      }

      callbacks.onUpdateElement(group);
    };

    if (opacitySlider && opacityNum) {
      opacitySlider.addEventListener('input', () => {
        applyOpacity(parseFloat(opacitySlider.value) || 0, false);
      });
      opacitySlider.addEventListener('change', () => {
        applyOpacity(parseFloat(opacitySlider.value) || 0, true);
      });
      opacityNum.addEventListener('change', () => {
        applyOpacity(parseFloat(opacityNum.value) || 0, true);
      });
    }

    // 4. Blend Mode (mix-blend-mode)
    const blendSelect = container.querySelector<HTMLSelectElement>('#group-blend-mode');
    if (blendSelect) {
      blendSelect.addEventListener('change', () => {
        if (callbacks.onPushUndo) callbacks.onPushUndo();
        const mode = blendSelect.value;
        if (mode === 'normal') {
          delete group.attributes['mix-blend-mode'];
          if (group.attributes['style']) {
            group.attributes['style'] = group.attributes['style'].replace(/mix-blend-mode:\s*[^;]+;?/gi, '').trim();
            if (!group.attributes['style']) delete group.attributes['style'];
          }
          const domEl = document.getElementById(group.id);
          if (domEl) {
            domEl.style.removeProperty('mix-blend-mode');
            domEl.removeAttribute('mix-blend-mode');
          }
        } else {
          group.attributes['mix-blend-mode'] = mode;
          const currentStyle = group.attributes['style'] || '';
          const cleaned = currentStyle.replace(/mix-blend-mode:\s*[^;]+;?/gi, '').trim();
          group.attributes['style'] = `${cleaned}${cleaned ? '; ' : ''}mix-blend-mode: ${mode};`;

          const domEl = document.getElementById(group.id);
          if (domEl) {
            domEl.style.mixBlendMode = mode;
            domEl.setAttribute('mix-blend-mode', mode);
          }
        }
        callbacks.onUpdateElement(group);
      });
    }

    // 5. Geometry X, Y, W, H Inputs
    const geoX = container.querySelector<HTMLInputElement>('#group-geo-x');
    const geoY = container.querySelector<HTMLInputElement>('#group-geo-y');
    const geoW = container.querySelector<HTMLInputElement>('#group-geo-w');
    const geoH = container.querySelector<HTMLInputElement>('#group-geo-h');

    if (box) {
      if (geoX) {
        geoX.addEventListener('change', () => {
          const targetX = parseFloat(geoX.value) || 0;
          const dx = targetX - box.x;
          if (dx !== 0 && callbacks.onTranslateSelection) {
            callbacks.onTranslateSelection(dx, 0);
          }
        });
      }
      if (geoY) {
        geoY.addEventListener('change', () => {
          const targetY = parseFloat(geoY.value) || 0;
          const dy = targetY - box.y;
          if (dy !== 0 && callbacks.onTranslateSelection) {
            callbacks.onTranslateSelection(0, dy);
          }
        });
      }
      if (geoW) {
        geoW.addEventListener('change', () => {
          const targetW = Math.max(1, parseFloat(geoW.value) || 1);
          if (box.width > 0 && targetW !== box.width) {
            const scaleX = targetW / box.width;
            if (callbacks.onPushUndo) callbacks.onPushUndo();
            const leaves = GroupHierarchyService.collectLeafElements(group);
            leaves.forEach((el) => {
              if (el.vertices) {
                el.vertices = el.vertices.map((v) => ({
                  ...v,
                  x: box.x + (v.x - box.x) * scaleX,
                  handleIn: v.handleIn ? { ...v.handleIn, x: box.x + (v.handleIn.x - box.x) * scaleX } : undefined,
                  handleOut: v.handleOut ? { ...v.handleOut, x: box.x + (v.handleOut.x - box.x) * scaleX } : undefined,
                }));
                el.attributes.d = model.compilePathD(el.vertices, model.isElementClosed(el));
                if (model.isParametricElement(el)) {
                  model.syncParametricAttributes(el);
                }
              }
            });
            callbacks.onUpdateElement(group);
            onReRender();
          }
        });
      }
      if (geoH) {
        geoH.addEventListener('change', () => {
          const targetH = Math.max(1, parseFloat(geoH.value) || 1);
          if (box.height > 0 && targetH !== box.height) {
            const scaleY = targetH / box.height;
            if (callbacks.onPushUndo) callbacks.onPushUndo();
            const leaves = GroupHierarchyService.collectLeafElements(group);
            leaves.forEach((el) => {
              if (el.vertices) {
                el.vertices = el.vertices.map((v) => ({
                  ...v,
                  y: box.y + (v.y - box.y) * scaleY,
                  handleIn: v.handleIn ? { ...v.handleIn, y: box.y + (v.handleIn.y - box.y) * scaleY } : undefined,
                  handleOut: v.handleOut ? { ...v.handleOut, y: box.y + (v.handleOut.y - box.y) * scaleY } : undefined,
                }));
                el.attributes.d = model.compilePathD(el.vertices, model.isElementClosed(el));
                if (model.isParametricElement(el)) {
                  model.syncParametricAttributes(el);
                }
              }
            });
            callbacks.onUpdateElement(group);
            onReRender();
          }
        });
      }
    }

    // 6. Alignments
    const bindAlign = (id: string, type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      const btn = container.querySelector<HTMLButtonElement>(`#${id}`);
      if (btn) {
        btn.addEventListener('click', () => {
          if (callbacks.onAlign) callbacks.onAlign(type);
        });
      }
    };
    bindAlign('btn-group-align-left', 'left');
    bindAlign('btn-group-align-center', 'center');
    bindAlign('btn-group-align-right', 'right');
    bindAlign('btn-group-align-top', 'top');
    bindAlign('btn-group-align-middle', 'middle');
    bindAlign('btn-group-align-bottom', 'bottom');
  }
}
