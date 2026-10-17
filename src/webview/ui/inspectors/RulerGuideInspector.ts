import { ToolIcons } from '../../icons/ToolIcons.js';
import { RulerConfig, GuideLine, GridConfig, GridAlignmentMode } from '../../engine/CanvasManager.js';
import { VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';
import { I18nService } from '../../i18n/index.js';

/**
 * RulerGuideInspector
 *
 * Encapsulates the UI rendering and event handlers for:
 * 1. Ruler Origin & Scale configuration (zero point calibration, viewBox alignment, units, scale, step).
 * 2. Grid-Ruler Alignment modes (Origin vs Cell-Center).
 * 3. Grid Layer Manager (orthogonal, isometric, axonometric grids with visibility, reordering, and removal).
 * 4. Guide Lines Explorer (view/lock/delete guides, jump-to-guide focus, clear all guides).
 * 5. Guide Line Inspector (angle, pivot X/Y, color picker, delete action).
 */
export class RulerGuideInspector {
  public static renderRulerSettings(
    config: RulerConfig,
    container: HTMLElement,
    model: VectorModel,
    gridAlignmentMode: GridAlignmentMode,
    grids: GridConfig[],
    guides: GuideLine[],
    callbacks: PropertyPanelCallbacks,
    onReRender: (updatedConfig?: RulerConfig, updatedMode?: GridAlignmentMode) => void
  ): void {
    const vb = model.getViewBoxBounds();

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.rulerOrigin')}</div>
        <div class="prop-row">
          <span class="prop-label">Origin X</span>
          <input type="number" class="prop-input" id="ruler-origin-x" value="${config.originX || 0}" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="ruler-origin-y" value="${config.originY || 0}" />
        </div>
        <div class="prop-row" style="margin-top: 8px;">
          <span class="prop-label" style="width:70px;">Align Horiz</span>
          <div class="button-group" style="flex:1;">
            <button class="tool-btn" id="ruler-align-left" title="Origin at Left of ViewBox (X=0)">${ToolIcons.alignLeft}</button>
            <button class="tool-btn" id="ruler-align-center-h" title="Origin at Horizontal Center of ViewBox">${ToolIcons.alignCenter}</button>
            <button class="tool-btn" id="ruler-align-right" title="Origin at Right of ViewBox">${ToolIcons.alignRight}</button>
          </div>
        </div>
        <div class="prop-row" style="margin-top: 4px;">
          <span class="prop-label" style="width:70px;">Align Vert</span>
          <div class="button-group" style="flex:1;">
            <button class="tool-btn" id="ruler-align-top" title="Origin at Top of ViewBox (Y=0)">${ToolIcons.alignTop}</button>
            <button class="tool-btn" id="ruler-align-center-v" title="Origin at Vertical Center of ViewBox">${ToolIcons.alignMiddle}</button>
            <button class="tool-btn" id="ruler-align-bottom" title="Origin at Bottom of ViewBox">${ToolIcons.alignBottom}</button>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.rulerScale')}</div>
        <div class="prop-row">
          <span class="prop-label">Units</span>
          <select class="prop-input" id="ruler-unit" style="cursor:pointer;">
            <option value="px" ${config.unit === 'px' ? 'selected' : ''}>Pixels (px)</option>
            <option value="mm" ${config.unit === 'mm' ? 'selected' : ''}>Millimeters (mm)</option>
            <option value="cm" ${config.unit === 'cm' ? 'selected' : ''}>Centimeters (cm)</option>
            <option value="in" ${config.unit === 'in' ? 'selected' : ''}>Inches (in)</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Scale (px/u)</span>
          <input type="number" class="prop-input" id="ruler-scale" value="${config.scale}" min="0.1" step="0.1" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Major Step</span>
          <input type="number" class="prop-input" id="ruler-step" value="${config.step || 50}" min="10" step="10" />
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.gridAlignment')}</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input ${gridAlignmentMode === 'origin' ? 'active' : ''}" id="btn-grid-align-origin" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="${I18nService.t('statusbar.gridAlignOriginTooltip')}">
            ${I18nService.t('inspector.gridAlignOriginCanvas')}
          </button>
          <button class="prop-input ${gridAlignmentMode === 'cell-center' ? 'active' : ''}" id="btn-grid-align-center" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="${I18nService.t('statusbar.gridAlignCenterTooltip')}">
            ${I18nService.t('inspector.gridAlignCenterCanvas')}
          </button>
        </div>
      </div>

      <!-- EXPLORADOR DE GRILLAS -->
      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.activeGrids', { count: grids.length })}</div>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
          ${grids.map((g, idx) => `
            <div class="grid-item-card" style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span style="font-weight:600; font-size:11px; text-transform:capitalize; color:var(--text-main);">
                  ${g.type === 'isometric' ? I18nService.t('inspector.gridIsometric') : g.type === 'axonometric' ? I18nService.t('inspector.gridAxonometric') : I18nService.t('inspector.gridOrthogonal')}
                </span>
                <div style="display:flex; gap:4px; align-items:center;">
                  <button class="btn-icon" id="btn-grid-vis-${g.id}" style="width:20px; height:20px; font-size:11px;">
                    ${g.visible ? ToolIcons.eye : ToolIcons.eyeOff}
                  </button>
                  <button class="btn-icon" id="btn-grid-up-${g.id}" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''} style="width:20px; height:20px; font-size:9px;">
                    ▲
                  </button>
                  <button class="btn-icon" id="btn-grid-down-${g.id}" ${idx === grids.length - 1 ? 'disabled style="opacity:0.3;"' : ''} style="width:20px; height:20px; font-size:9px;">
                    ▼
                  </button>
                  ${grids.length > 1 ? `
                    <button class="btn-icon" id="btn-grid-del-${g.id}" style="width:20px; height:20px; font-size:11px; color:#ef4444;">
                      ${ToolIcons.trash}
                    </button>
                  ` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="prop-label" style="width:50px;">${I18nService.t('inspector.stepPx')}</span>
                <input type="number" class="prop-input" id="grid-spacing-${g.id}" value="${g.spacing}" min="1" step="1" style="flex:1; height:22px;" />
                <input type="color" class="color-swatch" id="grid-color-${g.id}" value="${g.color?.startsWith('#') ? g.color : '#4f566b'}" style="width:22px; height:22px;" />
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display:flex; gap:4px; margin-top:8px;">
          <button class="prop-input" id="btn-add-grid-ortho" style="cursor:pointer; text-align:center; font-size:10px; padding:4px 2px; flex:1;">
            + ${I18nService.t('inspector.gridOrthogonal')}
          </button>
          <button class="prop-input" id="btn-add-grid-iso" style="cursor:pointer; text-align:center; font-size:10px; padding:4px 2px; flex:1;">
            + ${I18nService.t('inspector.gridIsometric')}
          </button>
          <button class="prop-input" id="btn-add-grid-axono" style="cursor:pointer; text-align:center; font-size:10px; padding:4px 2px; flex:1;">
            + ${I18nService.t('inspector.gridAxonometric')}
          </button>
        </div>
      </div>

      <!-- EXPLORADOR DE LÍNEAS DE GUÍA -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${I18nService.t('panels.rulerGuides')} (${guides.length})</span>
        </div>
        ${guides.length === 0 ? `
          <div style="font-size:11px; color:var(--text-muted); padding:4px 0;">
            ${I18nService.t('inspector.noActiveGuides')}
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:4px; max-height:160px; overflow-y:auto; margin-top:4px;">
            ${guides.map((g) => `
              <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:4px; padding:4px 8px; display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" id="guide-item-select-${g.id}">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${g.color || '#00f0ff'};"></span>
                  <span style="font-size:11px; font-weight:500; color:var(--text-main);">
                    ${g.orientation === 'horizontal' ? `H: ${Math.round(g.position)}px` : g.orientation === 'vertical' ? `V: ${Math.round(g.position)}px` : `∠ ${Math.round(g.angle)}°`}
                  </span>
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                  <button class="btn-icon" id="btn-guide-vis-${g.id}" style="width:20px; height:20px; font-size:11px;">
                    ${g.visible !== false ? ToolIcons.eye : ToolIcons.eyeOff}
                  </button>
                  <button class="btn-icon" id="btn-guide-lock-${g.id}" style="width:20px; height:20px; font-size:11px;">
                    ${g.locked ? ToolIcons.lock : ToolIcons.unlock}
                  </button>
                  <button class="btn-icon" id="btn-guide-del-${g.id}" style="width:20px; height:20px; font-size:11px; color:#ef4444;">
                    ${ToolIcons.trash}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:8px;">
            <button class="prop-input" id="btn-clear-guides" style="cursor:pointer; background:#ef4444; color:#fff; text-align:center; font-weight:600; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
              ${ToolIcons.trash} ${I18nService.t('inspector.clearAllGuides')}
            </button>
          </div>
        `}
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.guideInstructions')}</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
          ${I18nService.t('inspector.guideInstructionsBody')}
        </div>
      </div>
    `;

    const originXInput = container.querySelector<HTMLInputElement>('#ruler-origin-x');
    const originYInput = container.querySelector<HTMLInputElement>('#ruler-origin-y');
    const alignLeftBtn = container.querySelector<HTMLButtonElement>('#ruler-align-left');
    const alignCenterHBtn = container.querySelector<HTMLButtonElement>('#ruler-align-center-h');
    const alignRightBtn = container.querySelector<HTMLButtonElement>('#ruler-align-right');
    const alignTopBtn = container.querySelector<HTMLButtonElement>('#ruler-align-top');
    const alignCenterVBtn = container.querySelector<HTMLButtonElement>('#ruler-align-center-v');
    const alignBottomBtn = container.querySelector<HTMLButtonElement>('#ruler-align-bottom');

    const unitSelect = container.querySelector<HTMLSelectElement>('#ruler-unit');
    const scaleInput = container.querySelector<HTMLInputElement>('#ruler-scale');
    const stepInput = container.querySelector<HTMLInputElement>('#ruler-step');
    const clearBtn = container.querySelector<HTMLButtonElement>('#btn-clear-guides');

    const updateOrigin = (x: number, y: number) => {
      config.originX = x;
      config.originY = y;
      if (originXInput) originXInput.value = x.toString();
      if (originYInput) originYInput.value = y.toString();
      if (callbacks.onUpdateRuler) callbacks.onUpdateRuler(config);
    };

    if (originXInput) {
      const handleX = () => {
        config.originX = parseFloat(originXInput.value) || 0;
        if (callbacks.onUpdateRuler) callbacks.onUpdateRuler(config);
      };
      originXInput.addEventListener('input', handleX);
      originXInput.addEventListener('change', handleX);
    }

    if (originYInput) {
      const handleY = () => {
        config.originY = parseFloat(originYInput.value) || 0;
        if (callbacks.onUpdateRuler) callbacks.onUpdateRuler(config);
      };
      originYInput.addEventListener('input', handleY);
      originYInput.addEventListener('change', handleY);
    }

    if (alignLeftBtn) {
      alignLeftBtn.addEventListener('click', () => updateOrigin(0, config.originY || 0));
    }
    if (alignCenterHBtn) {
      alignCenterHBtn.addEventListener('click', () => updateOrigin(Math.round(vb.width / 2), config.originY || 0));
    }
    if (alignRightBtn) {
      alignRightBtn.addEventListener('click', () => updateOrigin(Math.round(vb.width), config.originY || 0));
    }

    if (alignTopBtn) {
      alignTopBtn.addEventListener('click', () => updateOrigin(config.originX || 0, 0));
    }
    if (alignCenterVBtn) {
      alignCenterVBtn.addEventListener('click', () => updateOrigin(config.originX || 0, Math.round(vb.height / 2)));
    }
    if (alignBottomBtn) {
      alignBottomBtn.addEventListener('click', () => updateOrigin(config.originX || 0, Math.round(vb.height)));
    }

    if (unitSelect) {
      unitSelect.addEventListener('change', () => {
        config.unit = unitSelect.value as any;
        if (callbacks.onUpdateRuler) callbacks.onUpdateRuler(config);
      });
    }

    if (scaleInput) {
      scaleInput.addEventListener('change', () => {
        config.scale = parseFloat(scaleInput.value) || 1;
        if (callbacks.onUpdateRuler) callbacks.onUpdateRuler(config);
      });
    }

    if (stepInput) {
      stepInput.addEventListener('change', () => {
        config.step = parseFloat(stepInput.value) || 50;
        if (callbacks.onUpdateRuler) callbacks.onUpdateRuler(config);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (callbacks.onClearAllGuides) callbacks.onClearAllGuides();
      });
    }

    bindInspectorMouseDown(container, 'btn-grid-align-origin', () => {
      if (callbacks.onGridAlignmentChange) callbacks.onGridAlignmentChange('origin');
      onReRender(config, 'origin');
    });
    bindInspectorMouseDown(container, 'btn-grid-align-center', () => {
      if (callbacks.onGridAlignmentChange) callbacks.onGridAlignmentChange('cell-center');
      onReRender(config, 'cell-center');
    });

    // Bind Grid Explorer actions
    grids.forEach((g) => {
      bindInspectorMouseDown(container, `btn-grid-vis-${g.id}`, () => {
        const nextVis = !g.visible;
        g.visible = nextVis;
        if (callbacks.onUpdateGrid) callbacks.onUpdateGrid(g.id, { visible: nextVis });
        onReRender(config);
      });
      bindInspectorMouseDown(container, `btn-grid-up-${g.id}`, () => {
        if (callbacks.onReorderGrid) callbacks.onReorderGrid(g.id, 'up');
      });
      bindInspectorMouseDown(container, `btn-grid-down-${g.id}`, () => {
        if (callbacks.onReorderGrid) callbacks.onReorderGrid(g.id, 'down');
      });
      bindInspectorMouseDown(container, `btn-grid-del-${g.id}`, () => {
        if (callbacks.onRemoveGrid) callbacks.onRemoveGrid(g.id);
      });

      const spInput = container.querySelector<HTMLInputElement>(`#grid-spacing-${g.id}`);
      if (spInput) {
        spInput.addEventListener('change', () => {
          const val = Math.max(1, parseFloat(spInput.value) || 20);
          g.spacing = val;
          if (callbacks.onUpdateGrid) callbacks.onUpdateGrid(g.id, { spacing: val });
        });
      }

      const colInput = container.querySelector<HTMLInputElement>(`#grid-color-${g.id}`);
      if (colInput) {
        colInput.addEventListener('input', () => {
          g.color = colInput.value;
          if (callbacks.onUpdateGrid) callbacks.onUpdateGrid(g.id, { color: colInput.value });
        });
      }
    });

    bindInspectorMouseDown(container, 'btn-add-grid-ortho', () => {
      if (callbacks.onAddGrid) callbacks.onAddGrid('orthogonal');
    });
    bindInspectorMouseDown(container, 'btn-add-grid-iso', () => {
      if (callbacks.onAddGrid) callbacks.onAddGrid('isometric');
    });
    bindInspectorMouseDown(container, 'btn-add-grid-axono', () => {
      if (callbacks.onAddGrid) callbacks.onAddGrid('axonometric');
    });

    // Bind Guide Explorer actions
    guides.forEach((guide) => {
      const selectRow = container.querySelector(`#guide-item-select-${guide.id}`);
      if (selectRow) {
        selectRow.addEventListener('click', () => {
          if (callbacks.onSelectGuide) callbacks.onSelectGuide(guide.id);
        });
      }

      bindInspectorMouseDown(container, `btn-guide-vis-${guide.id}`, () => {
        guide.visible = guide.visible === false ? true : false;
        if (callbacks.onUpdateGuide) callbacks.onUpdateGuide(guide);
        onReRender(config);
      });

      bindInspectorMouseDown(container, `btn-guide-lock-${guide.id}`, () => {
        guide.locked = !guide.locked;
        if (callbacks.onUpdateGuide) callbacks.onUpdateGuide(guide);
        onReRender(config);
      });

      bindInspectorMouseDown(container, `btn-guide-del-${guide.id}`, () => {
        if (callbacks.onDeleteGuide) callbacks.onDeleteGuide(guide.id);
      });
    });
  }

  public static renderGuideSettings(
    guidesInput: GuideLine | GuideLine[],
    container: HTMLElement,
    callbacks: PropertyPanelCallbacks
  ): void {
    const guides = Array.isArray(guidesInput) ? guidesInput : [guidesInput];
    if (guides.length === 0) return;

    const singleGuide = guides.length === 1 ? guides[0] : null;
    const verticalGuides = guides.filter((g) => g.orientation === 'vertical');
    const horizontalGuides = guides.filter((g) => g.orientation === 'horizontal');
    const angledGuides = guides.filter((g) => g.orientation === 'angled');

    const hasVertical = verticalGuides.length > 0;
    const hasHorizontal = horizontalGuides.length > 0;
    const hasAngled = angledGuides.length > 0;

    const primaryV = verticalGuides[0];
    const primaryH = horizontalGuides[0];
    const valX = primaryV ? Math.round(primaryV.position * 100) / 100 : 0;
    const valY = primaryH ? Math.round(primaryH.position * 100) / 100 : 0;
    const valAngle = singleGuide ? Math.round(singleGuide.angle || 0) : Math.round((angledGuides[0]?.angle) || 0);
    const valPivotX = singleGuide ? Math.round(singleGuide.pivotX || 0) : Math.round((guides[0]?.pivotX) || 0);
    const valPivotY = singleGuide ? Math.round(singleGuide.pivotY || 0) : Math.round((guides[0]?.pivotY) || 0);
    const currentColor = singleGuide ? (singleGuide.color || '#00f0ff') : (guides[0].color || '#00f0ff');
    const allLocked = guides.every((g) => g.locked);

    let title = 'Guía de Regla';
    if (singleGuide) {
      title = singleGuide.orientation === 'vertical' ? 'Guía Vertical' : singleGuide.orientation === 'horizontal' ? 'Guía Horizontal' : 'Guía Inclinada';
    } else {
      title = `Guías Seleccionadas (${guides.length})`;
    }

    let typeDesc = '';
    if (singleGuide) {
      typeDesc = singleGuide.orientation;
    } else {
      const parts: string[] = [];
      if (hasVertical) parts.push(`${verticalGuides.length}V`);
      if (hasHorizontal) parts.push(`${horizontalGuides.length}H`);
      if (hasAngled) parts.push(`${angledGuides.length}∠`);
      typeDesc = parts.join(', ');
    }

    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${title}</div>
        <div class="prop-row">
          <span class="prop-label">Tipo</span>
          <span style="font-weight:600; color:var(--text-main); text-transform:capitalize;">${typeDesc}</span>
        </div>

        ${hasVertical ? `
          <div class="prop-row">
            <span class="prop-label">X</span>
            <input type="number" step="any" class="prop-input" id="guide-pos-x" value="${valX}" />
            ${verticalGuides.length > 1 ? `<span style="font-size:10px; color:var(--text-muted); margin-left:4px;">(Bloque ${verticalGuides.length})</span>` : ''}
          </div>
        ` : ''}

        ${hasHorizontal ? `
          <div class="prop-row">
            <span class="prop-label">Y</span>
            <input type="number" step="any" class="prop-input" id="guide-pos-y" value="${valY}" />
            ${horizontalGuides.length > 1 ? `<span style="font-size:10px; color:var(--text-muted); margin-left:4px;">(Bloque ${horizontalGuides.length})</span>` : ''}
          </div>
        ` : ''}

        ${(hasAngled || singleGuide) ? `
          <div class="prop-row">
            <span class="prop-label">Ángulo (°)</span>
            <input type="number" class="prop-input" id="guide-angle" value="${valAngle}" step="1" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Pivote X</span>
            <input type="number" class="prop-input" id="guide-pivot-x" value="${valPivotX}" />
            <span class="prop-label" style="width:20px; text-align:right;">Y</span>
            <input type="number" class="prop-input" id="guide-pivot-y" value="${valPivotY}" />
          </div>
        ` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.guideColor')}</div>
        <div class="prop-row">
          <span class="prop-label">${I18nService.t('common.color')}</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="guide-color" value="${currentColor}" />
            <input type="text" class="prop-input" id="guide-color-hex" value="${currentColor}" />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">${I18nService.t('inspector.guideActions')}</div>
        <div class="prop-row" style="flex-direction:column; gap:6px;">
          <button class="prop-input" id="btn-convert-guide-to-vector" style="cursor:pointer; background:var(--accent-primary, #007acc); color:#fff; text-align:center; font-weight:600; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            ${I18nService.t('inspector.convertToVector')}
          </button>
          <button class="prop-input" id="btn-lock-guides" style="cursor:pointer; background:var(--bg-panel-hover); text-align:center; font-weight:500; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            ${allLocked ? ToolIcons.unlock : ToolIcons.lock} ${allLocked ? I18nService.t('inspector.unlockGuidesAction') : I18nService.t('inspector.lockGuidesAction')}
          </button>
          <button class="prop-input" id="btn-delete-guide" style="cursor:pointer; background:#ef4444; color:#fff; text-align:center; font-weight:600; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            ${ToolIcons.trash} ${guides.length > 1 ? I18nService.t('inspector.deleteGuides', { count: guides.length }) : I18nService.t('inspector.deleteGuide')}
          </button>
        </div>
      </div>
    `;

    const convertBtn = container.querySelector<HTMLButtonElement>('#btn-convert-guide-to-vector');
    const posXInput = container.querySelector<HTMLInputElement>('#guide-pos-x');
    const posYInput = container.querySelector<HTMLInputElement>('#guide-pos-y');
    const angleInput = container.querySelector<HTMLInputElement>('#guide-angle');
    const pivotXInput = container.querySelector<HTMLInputElement>('#guide-pivot-x');
    const pivotYInput = container.querySelector<HTMLInputElement>('#guide-pivot-y');
    const colorInput = container.querySelector<HTMLInputElement>('#guide-color');
    const colorHexInput = container.querySelector<HTMLInputElement>('#guide-color-hex');
    const lockBtn = container.querySelector<HTMLButtonElement>('#btn-lock-guides');
    const deleteBtn = container.querySelector<HTMLButtonElement>('#btn-delete-guide');

    if (posXInput) {
      posXInput.addEventListener('change', () => {
        const newX = parseFloat(posXInput.value);
        if (isNaN(newX)) return;
        const deltaX = newX - valX;
        callbacks.onPushUndo?.();
        for (const g of verticalGuides) {
          g.position += deltaX;
          g.pivotX = (g.pivotX ?? g.position) + deltaX;
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
      });
    }

    if (posYInput) {
      posYInput.addEventListener('change', () => {
        const newY = parseFloat(posYInput.value);
        if (isNaN(newY)) return;
        const deltaY = newY - valY;
        callbacks.onPushUndo?.();
        for (const g of horizontalGuides) {
          g.position += deltaY;
          g.pivotY = (g.pivotY ?? g.position) + deltaY;
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
      });
    }

    if (angleInput) {
      angleInput.addEventListener('change', () => {
        const newAngle = parseFloat(angleInput.value) || 0;
        callbacks.onPushUndo?.();
        const targets = singleGuide ? [singleGuide] : angledGuides;
        for (const g of targets) {
          g.angle = newAngle;
          g.orientation = 'angled';
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
      });
    }

    if (pivotXInput) {
      pivotXInput.addEventListener('change', () => {
        const newPivotX = parseFloat(pivotXInput.value) || 0;
        callbacks.onPushUndo?.();
        for (const g of guides) {
          g.pivotX = newPivotX;
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
      });
    }

    if (pivotYInput) {
      pivotYInput.addEventListener('change', () => {
        const newPivotY = parseFloat(pivotYInput.value) || 0;
        callbacks.onPushUndo?.();
        for (const g of guides) {
          g.pivotY = newPivotY;
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
      });
    }

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        const newColor = colorInput.value;
        if (colorHexInput) colorHexInput.value = newColor;
        for (const g of guides) {
          g.color = newColor;
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
      });
    }

    if (colorHexInput) {
      colorHexInput.addEventListener('change', () => {
        const newColor = colorHexInput.value;
        if (colorInput) colorInput.value = newColor;
        for (const g of guides) {
          g.color = newColor;
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
      });
    }

    if (convertBtn) {
      convertBtn.addEventListener('click', () => {
        callbacks.onConvertGuideToVector?.();
      });
    }

    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        const nextLock = !allLocked;
        callbacks.onPushUndo?.();
        for (const g of guides) {
          g.locked = nextLock;
          callbacks.onUpdateGuide?.(g);
        }
        callbacks.onRenderOverlay?.();
        RulerGuideInspector.renderGuideSettings(guides, container, callbacks);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        callbacks.onPushUndo?.();
        for (const g of guides) {
          if (callbacks.onDeleteGuide) callbacks.onDeleteGuide(g.id);
        }
      });
    }
  }
}
