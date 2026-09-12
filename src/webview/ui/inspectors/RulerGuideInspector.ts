import { ToolIcons } from '../../icons/ToolIcons.js';
import { RulerConfig, GuideLine, GridConfig, GridAlignmentMode } from '../../engine/CanvasManager.js';
import { VectorModel } from '../../engine/VectorModel.js';
import type { PropertyPanelCallbacks } from '../PropertyPanel.js';
import { bindInspectorMouseDown } from './CanvasInspector.js';

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
        <div class="panel-title">Ruler Origin (Zero Point)</div>
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
        <div class="panel-title">Ruler &amp; Grid Scale</div>
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
        <div class="panel-title">Grid-Ruler Alignment</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input ${gridAlignmentMode === 'origin' ? 'active' : ''}" id="btn-grid-align-origin" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo A: Línea o cruce de grilla coincidente con (0, 0)">
            ┼ Línea en (0, 0)
          </button>
          <button class="prop-input ${gridAlignmentMode === 'cell-center' ? 'active' : ''}" id="btn-grid-align-center" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo B: Snap al centro de cada celda de la grilla (sin desplazar la cuadrícula)">
            ◫ Celda en (0, 0)
          </button>
        </div>
      </div>

      <!-- EXPLORADOR DE GRILLAS -->
      <div class="panel-section">
        <div class="panel-title">Grillas Activas (${grids.length})</div>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
          ${grids.map((g, idx) => `
            <div class="grid-item-card" style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span style="font-weight:600; font-size:11px; text-transform:capitalize; color:var(--text-main);">
                  ${g.type === 'isometric' ? '📐 Isométrica' : g.type === 'axonometric' ? '📐 Axonométrica (45°)' : '⊞ Ortogonal'}
                </span>
                <div style="display:flex; gap:4px; align-items:center;">
                  <button class="btn-icon" id="btn-grid-vis-${g.id}" title="${g.visible ? 'Ocultar Grilla' : 'Mostrar Grilla'}" style="width:20px; height:20px; font-size:11px;">
                    ${g.visible ? '👁' : '🚫'}
                  </button>
                  <button class="btn-icon" id="btn-grid-up-${g.id}" title="Subir orden Z" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''} style="width:20px; height:20px; font-size:9px;">
                    ▲
                  </button>
                  <button class="btn-icon" id="btn-grid-down-${g.id}" title="Bajar orden Z" ${idx === grids.length - 1 ? 'disabled style="opacity:0.3;"' : ''} style="width:20px; height:20px; font-size:9px;">
                    ▼
                  </button>
                  ${grids.length > 1 ? `
                    <button class="btn-icon" id="btn-grid-del-${g.id}" title="Eliminar Grilla" style="width:20px; height:20px; font-size:11px; color:#ef4444;">
                      🗑
                    </button>
                  ` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="prop-label" style="width:50px;">Paso (px)</span>
                <input type="number" class="prop-input" id="grid-spacing-${g.id}" value="${g.spacing}" min="1" step="1" style="flex:1; height:22px;" />
                <input type="color" class="color-swatch" id="grid-color-${g.id}" value="${g.color?.startsWith('#') ? g.color : '#4f566b'}" style="width:22px; height:22px;" title="Color de trazo de grilla" />
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display:flex; gap:4px; margin-top:8px;">
          <button class="prop-input" id="btn-add-grid-ortho" style="cursor:pointer; text-align:center; font-size:10px; padding:4px 2px; flex:1;" title="Añadir Grilla Ortogonal">
            + Ortogonal
          </button>
          <button class="prop-input" id="btn-add-grid-iso" style="cursor:pointer; text-align:center; font-size:10px; padding:4px 2px; flex:1;" title="Añadir Grilla Isométrica">
            + Isométrica
          </button>
          <button class="prop-input" id="btn-add-grid-axono" style="cursor:pointer; text-align:center; font-size:10px; padding:4px 2px; flex:1;" title="Añadir Grilla Axonométrica">
            + Axonométrica
          </button>
        </div>
      </div>

      <!-- EXPLORADOR DE LÍNEAS DE GUÍA -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Líneas de Guía (${guides.length})</span>
        </div>
        ${guides.length === 0 ? `
          <div style="font-size:11px; color:var(--text-muted); padding:4px 0;">
            No hay guías activas. Arrastra desde las reglas métricas para crear una.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:4px; max-height:160px; overflow-y:auto; margin-top:4px;">
            ${guides.map((g) => `
              <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:4px; padding:4px 8px; display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" id="guide-item-select-${g.id}" title="Seleccionar guía en el lienzo">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${g.color || '#00f0ff'};"></span>
                  <span style="font-size:11px; font-weight:500; color:var(--text-main);">
                    ${g.orientation === 'horizontal' ? `H: ${Math.round(g.position)}px` : g.orientation === 'vertical' ? `V: ${Math.round(g.position)}px` : `∠ ${Math.round(g.angle)}°`}
                  </span>
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                  <button class="btn-icon" id="btn-guide-vis-${g.id}" title="${g.visible !== false ? 'Ocultar Guía' : 'Mostrar Guía'}" style="width:20px; height:20px; font-size:11px;">
                    ${g.visible !== false ? '👁' : '🚫'}
                  </button>
                  <button class="btn-icon" id="btn-guide-lock-${g.id}" title="${g.locked ? 'Desbloquear Guía' : 'Bloquear Guía'}" style="width:20px; height:20px; font-size:11px;">
                    ${g.locked ? '🔒' : '🔓'}
                  </button>
                  <button class="btn-icon" id="btn-guide-del-${g.id}" title="Eliminar Guía" style="width:20px; height:20px; font-size:11px; color:#ef4444;">
                    🗑
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:8px;">
            <button class="prop-input" id="btn-clear-guides" style="cursor:pointer; background:#ef4444; color:#fff; text-align:center; font-weight:600;">
              🗑 Limpiar Todas las Guías
            </button>
          </div>
        `}
      </div>

      <div class="panel-section">
        <div class="panel-title">Guide Instructions</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
          • <b>Drag from top ruler</b>: Create horizontal guide<br/>
          • <b>Drag from left ruler</b>: Create vertical guide<br/>
          • <b>Click guide</b>: Select guide<br/>
          • <b>Drag guide to ruler or Supr</b>: Delete guide<br/>
          • <b>Double-click guide</b>: Edit angle &amp; pivot node
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
    guide: GuideLine,
    container: HTMLElement,
    callbacks: PropertyPanelCallbacks
  ): void {
    container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Guide Line Settings</div>
        <div class="prop-row">
          <span class="prop-label">Type</span>
          <span style="font-weight:600; color:var(--text-main); text-transform:capitalize;">${guide.orientation}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Angle (°)</span>
          <input type="number" class="prop-input" id="guide-angle" value="${Math.round(guide.angle || 0)}" step="1" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Pivot X</span>
          <input type="number" class="prop-input" id="guide-pivot-x" value="${Math.round(guide.pivotX || 0)}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Pivot Y</span>
          <input type="number" class="prop-input" id="guide-pivot-y" value="${Math.round(guide.pivotY || 0)}" />
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Guide Color</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="guide-color" value="${guide.color || '#00f0ff'}" />
            <input type="text" class="prop-input" id="guide-color-hex" value="${guide.color || '#00f0ff'}" />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Guide Actions</div>
        <div class="prop-row" style="flex-direction:column; gap:6px;">
          <button class="prop-input" id="btn-delete-guide" style="cursor:pointer; background:#ef4444; color:#fff; text-align:center; font-weight:600;">
            🗑 Delete Guide (Supr)
          </button>
        </div>
      </div>
    `;

    const angleInput = container.querySelector<HTMLInputElement>('#guide-angle');
    const pivotXInput = container.querySelector<HTMLInputElement>('#guide-pivot-x');
    const pivotYInput = container.querySelector<HTMLInputElement>('#guide-pivot-y');
    const colorInput = container.querySelector<HTMLInputElement>('#guide-color');
    const colorHexInput = container.querySelector<HTMLInputElement>('#guide-color-hex');
    const deleteBtn = container.querySelector<HTMLButtonElement>('#btn-delete-guide');

    if (angleInput) {
      angleInput.addEventListener('change', () => {
        guide.angle = parseFloat(angleInput.value) || 0;
        guide.orientation = 'angled';
        if (callbacks.onUpdateGuide) callbacks.onUpdateGuide(guide);
      });
    }

    if (pivotXInput) {
      pivotXInput.addEventListener('change', () => {
        guide.pivotX = parseFloat(pivotXInput.value) || 0;
        if (callbacks.onUpdateGuide) callbacks.onUpdateGuide(guide);
      });
    }

    if (pivotYInput) {
      pivotYInput.addEventListener('change', () => {
        guide.pivotY = parseFloat(pivotYInput.value) || 0;
        if (callbacks.onUpdateGuide) callbacks.onUpdateGuide(guide);
      });
    }

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        guide.color = colorInput.value;
        if (colorHexInput) colorHexInput.value = colorInput.value;
        if (callbacks.onUpdateGuide) callbacks.onUpdateGuide(guide);
      });
    }

    if (colorHexInput) {
      colorHexInput.addEventListener('change', () => {
        guide.color = colorHexInput.value;
        if (colorInput) colorInput.value = colorHexInput.value;
        if (callbacks.onUpdateGuide) callbacks.onUpdateGuide(guide);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (callbacks.onDeleteGuide) callbacks.onDeleteGuide(guide.id);
      });
    }
  }
}
