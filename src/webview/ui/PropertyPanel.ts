import { VectorModel, VectorElement, PathVertex, NodeType, DropShadowConfig, InnerShadowConfig, GradientConfig, GradientStop } from '../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../engine/SelectionTool.js';
import { GuideLine, RulerConfig, ShapeToolConfig, GridAlignmentMode, GridConfig, GridType } from '../engine/CanvasManager.js';
import { ToolIcons } from '../icons/ToolIcons.js';

export interface PropertyPanelCallbacks {
  onUpdateElement: (el: VectorElement) => void;
  onUpdateCanvas: () => void;
  onNodeTypeChange: (nodeType: NodeType) => void;
  onSplitNode: () => void;
  onClosePath?: () => void;
  onConvertSegmentToLine?: () => void;
  onConvertSegmentToCurve?: () => void;
  onPenNodeTypeChange?: (nodeType: NodeType) => void;
  onFinishPenPath?: (close: boolean) => void;
  onFinishPolylinePath?: (close: boolean) => void;
  onUpdateRuler?: (config: RulerConfig) => void;
  onUpdateGuide?: (guide: GuideLine) => void;
  onDeleteGuide?: (guideId: string) => void;
  onClearAllGuides?: () => void;
  onUpdateShapeConfig?: (config: ShapeToolConfig) => void;
  onGridAlignmentChange?: (mode: GridAlignmentMode) => void;
  onAddGrid?: (type: GridType) => void;
  onRemoveGrid?: (gridId: string) => void;
  onUpdateGrid?: (gridId: string, partial: Partial<GridConfig>) => void;
  onReorderGrid?: (gridId: string, direction: 'up' | 'down') => void;
  onSelectGuide?: (guideId: string) => void;
  onStrokeToPath?: () => void;
  onPushUndo?: () => void;
  onRenderOverlay?: () => void;
  /**
   * Boolean Operations callback: Dispatches constructive geometry operations (union, subtract,
   * intersect, exclude, combine, fragment) directly to BooleanOperations engine.
   */
  onBoolean?: (op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment') => void;
}

export interface ViewBoxPreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const VIEWBOX_PRESETS: ViewBoxPreset[] = [
  { id: 'custom', name: 'Personalizado', width: 0, height: 0 },
  { id: 'icon-16', name: 'Icono 16x16', width: 16, height: 16 },
  { id: 'icon-32', name: 'Icono 32x32', width: 32, height: 32 },
  { id: 'icon-64', name: 'Icono 64x64', width: 64, height: 64 },
  { id: 'icon-128', name: 'Icono 128x128', width: 128, height: 128 },
  { id: 'a5-72', name: 'A5 (con 72ppp)', width: 420, height: 595 },
  { id: 'a4-72', name: 'A4 (con 72ppp)', width: 595, height: 842 },
  { id: '1080p', name: '1080p', width: 1920, height: 1080 },
  { id: '1440p', name: '1440p', width: 2560, height: 1440 },
];

/**
 * ARCHITECTURAL RATIONALE: Bi-directional Conversion Between SVG Miter Limit and Degrees
 *
 * 1. Why Degrees Instead of Dimensionless Ratio:
 *    In SVG, stroke-miterlimit is a dimensionless ratio m = 1 / sin(theta / 2), where theta is the interior
 *    angle between segments. For human designers, setting "miterlimit: 4" or "miterlimit: 10" is completely
 *    opaque and requires mental trigonometry. By exposing the limit directly in degrees (e.g. 29°),
 *    the designer immediately understands: "any corner sharper than 29° will be clipped to bevel;
 *    corners wider than 29° will remain sharp".
 *
 * 2. Exact Formula:
 *    - Given miterlimit m: theta_deg = 2 * asin(1 / m) * (180 / PI).
 *      Default m=4 -> ~28.96° -> 29°.
 *    - Given angle in degrees theta_deg: m = 1 / sin((theta_deg * PI) / 360).
 *      theta=15° -> m=7.66. theta=6° -> m=19.1.
 *
 * 3. Numerical Stability & Clamping:
 *    - Clamped to [1°, 170°] to avoid division by zero or infinite miter lengths at 0°.
 */
export function miterLimitToDegrees(limit: number): number {
  const m = Math.max(1, limit);
  const sinHalf = 1 / m;
  const halfAngleRad = Math.asin(Math.min(1, Math.max(0, sinHalf)));
  const angleDeg = (halfAngleRad * 2 * 180) / Math.PI;
  return Math.round(angleDeg);
}

export function degreesToMiterLimit(degrees: number): number {
  const deg = Math.max(1, Math.min(170, degrees));
  const halfAngleRad = (deg * Math.PI) / 360;
  const sinHalf = Math.sin(halfAngleRad);
  if (sinHalf <= 0.0001) return 100;
  const limit = 1 / sinHalf;
  return Math.round(limit * 100) / 100;
}

export class PropertyPanel {
  private container: HTMLElement;
  private model: VectorModel;
  private selectionTool: SelectionTool;
  private activeVertex: PathVertex | null = null;
  private activeTool: string = 'select';
  public penNodeType: NodeType = 'asymmetric';
  public penVertexCount: number = 0;
  public polylineVertexCount: number = 0;
  public gridAlignmentMode: GridAlignmentMode = 'origin';
  public grids: GridConfig[] = [];
  public guides: GuideLine[] = [];
  private activeRulerConfig: RulerConfig | null = null;
  private activeGuide: GuideLine | null = null;
  public shapeConfig: ShapeToolConfig = {
    aspectRatioW: 4,
    aspectRatioH: 3,
    starPoints: 5,
    starInnerRatio: 0.4,
    rectCornerRadius: 0,
  };
  private callbacks: PropertyPanelCallbacks;

  // Track which panel section is currently rendered to avoid full re-builds
  private currentPanelMode: 'canvas' | 'element' | 'node' | 'pen' | 'polyline' | 'multi' | 'ruler' | 'guide' | 'shape' | null = null;

  constructor(
    container: HTMLElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    callbacks: PropertyPanelCallbacks
  ) {
    this.container = container;
    this.model = model;
    this.selectionTool = selectionTool;
    this.callbacks = callbacks;
    this.renderPanel();
  }

  public update(
    selectedVertex: PathVertex | null = null,
    activeTool: string = 'select',
    penNodeType: NodeType = 'asymmetric',
    penVertexCount: number = 0,
    selectedGuide: GuideLine | null = null,
    polylineVertexCount: number = 0,
    gridAlignmentMode: GridAlignmentMode = 'origin',
    grids: GridConfig[] = [],
    guides: GuideLine[] = []
  ): void {
    this.activeVertex = selectedVertex;
    this.activeTool = activeTool;
    this.penNodeType = penNodeType;
    this.penVertexCount = penVertexCount;
    this.activeGuide = selectedGuide;
    this.polylineVertexCount = polylineVertexCount;
    this.gridAlignmentMode = gridAlignmentMode;
    if (grids.length > 0 || this.grids.length === 0) this.grids = grids;
    if (guides.length > 0 || this.guides.length === 0) this.guides = guides;

    const hasSelectedElements = this.model.elements.some((e) =>
      this.selectionTool.isSelected(e.id)
    );

    // Strict Modal Dismissal:
    // If elements or guides are selected, dismiss ruler mode immediately so vector properties
    // are never blocked or hidden by stale ruler state.
    if (hasSelectedElements) {
      if (this.currentPanelMode === 'ruler') {
        this.currentPanelMode = null;
        this.activeRulerConfig = null;
      }
      this.activeGuide = null;
    } else if (selectedGuide) {
      this.currentPanelMode = 'guide';
      this.activeRulerConfig = null;
    }

    this.renderPanel();
  }

  // Call this when the selected element changes so the panel mode resets
  public resetPanelMode(): void {
    this.currentPanelMode = null;
    this.activeVertex = null;
    this.activeGuide = null;
    this.activeRulerConfig = null;
  }

  public showRulerSettings(
    config: RulerConfig,
    gridAlignmentMode: GridAlignmentMode = 'origin',
    grids: GridConfig[] = [],
    guides: GuideLine[] = []
  ): void {
    this.currentPanelMode = 'ruler';
    this.activeRulerConfig = config;
    this.gridAlignmentMode = gridAlignmentMode;
    if (grids.length > 0) this.grids = grids;
    if (guides.length > 0) this.guides = guides;
    this.renderRulerProperties(config);
  }

  public showGuideSettings(guide: GuideLine): void {
    this.currentPanelMode = 'guide';
    this.activeGuide = guide;
    this.renderGuideProperties(guide);
  }

  /**
   * Technical Rationale (FIX-20):
   * Strict Modal Hierarchy for Property Inspector:
   *
   * 1. Vector Selection (Highest Priority):
   *    Whenever one or more vector elements are selected in the model, their properties MUST ALWAYS
   *    be presented (Transform, Fill, Stroke, Effects, Shape-specific parameters if ellipse/rect, etc.).
   *    Under no circumstance should tool creation modes or ruler settings override active vector selection.
   *
   * 2. Guide Line Selection:
   *    When a guideline is selected (and no vectors are selected), guideline properties are displayed.
   *
   * 3. Ruler Corner Mode:
   *    When the user explicitly clicks the ruler corner (`#ruler-corner`), ruler origin, scale,
   *    grids and guide manager are displayed.
   *
   * 4. In-Progress Path Creation:
   *    When actively drawing vertices in polyline or pen mode, action buttons (finish / close) are exposed.
   *
   * 5. Base / Default State (No vectors selected):
   *    When no vectors are selected (and neither a guide nor the ruler corner is active), the panel
   *    consistently presents the Canvas & ViewBox properties (presets, W/H, minX/minY, bg color, grid-ruler alignment).
   */
  private renderPanel(): void {
    const selectedEls = this.model.elements.filter(
      (e) => this.selectionTool.isSelected(e.id)
    );

    // 1. HIGHEST PRIORITY: Active Vector Element Selection
    if (selectedEls.length > 0) {
      this.activeGuide = null;
      this.activeRulerConfig = null;

      if (this.activeVertex && selectedEls.length === 1 && this.activeTool === 'node') {
        if (this.currentPanelMode === 'node') {
          // Panel already shows node properties — update in place without destroying DOM
          this.updateNodePropertiesInPlace(this.activeVertex);
        } else {
          this.renderNodeProperties(selectedEls[0], this.activeVertex);
          this.currentPanelMode = 'node';
        }
      } else if (selectedEls.length === 1) {
        this.currentPanelMode = 'element';
        this.renderElementProperties(selectedEls[0]);
      } else {
        this.currentPanelMode = 'multi';
        this.renderMultiElementProperties(selectedEls);
      }
      return;
    }

    // 2. Guide Line Selection
    if (this.activeGuide) {
      this.currentPanelMode = 'guide';
      this.activeRulerConfig = null;
      this.renderGuideProperties(this.activeGuide);
      return;
    }

    // 3. Ruler Corner Active
    if (this.currentPanelMode === 'ruler' && this.activeRulerConfig) {
      this.renderRulerProperties(this.activeRulerConfig);
      return;
    }

    // 4. In-Progress Interactive Path Creation
    if (this.activeTool === 'polyline' && this.polylineVertexCount > 0) {
      this.currentPanelMode = 'polyline';
      this.renderPolylineProperties();
      return;
    }

    if (this.activeTool === 'pen' && this.penVertexCount > 0) {
      this.currentPanelMode = 'pen';
      this.renderPenProperties();
      return;
    }

    // 5. Default Base State: Canvas & ViewBox Properties
    this.currentPanelMode = 'canvas';
    this.renderCanvasProperties();
  }

  // Render Ruler Configuration Properties
  private renderRulerProperties(config: RulerConfig): void {
    const vb = this.model.getViewBoxBounds();

    this.container.innerHTML = `
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
          <button class="prop-input ${this.gridAlignmentMode === 'origin' ? 'active' : ''}" id="btn-grid-align-origin" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo A: Línea o cruce de grilla coincidente con (0, 0)">
            ┼ Línea en (0, 0)
          </button>
          <button class="prop-input ${this.gridAlignmentMode === 'cell-center' ? 'active' : ''}" id="btn-grid-align-center" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo B: Centro de la celda virtual coincidente con (0, 0)">
            ◫ Celda en (0, 0)
          </button>
        </div>
      </div>

      <!-- EXPLORADOR DE GRILLAS -->
      <div class="panel-section">
        <div class="panel-title">Grillas Activas (${this.grids.length})</div>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
          ${this.grids.map((g, idx) => `
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
                  <button class="btn-icon" id="btn-grid-down-${g.id}" title="Bajar orden Z" ${idx === this.grids.length - 1 ? 'disabled style="opacity:0.3;"' : ''} style="width:20px; height:20px; font-size:9px;">
                    ▼
                  </button>
                  ${this.grids.length > 1 ? `
                    <button class="btn-icon" id="btn-grid-del-${g.id}" title="Eliminar Grilla" style="width:20px; height:20px; font-size:11px; color:#ef4444;">
                      🗑
                    </button>
                  ` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="prop-label" style="width:50px;">Paso (px)</span>
                <input type="number" class="prop-input" id="grid-spacing-${g.id}" value="${g.spacing}" min="2" step="5" style="flex:1; height:22px;" />
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
          <span>Líneas de Guía (${this.guides.length})</span>
        </div>
        ${this.guides.length === 0 ? `
          <div style="font-size:11px; color:var(--text-muted); padding:4px 0;">
            No hay guías activas. Arrastra desde las reglas métricas para crear una.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:4px; max-height:160px; overflow-y:auto; margin-top:4px;">
            ${this.guides.map((g) => `
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

    const originXInput = this.container.querySelector<HTMLInputElement>('#ruler-origin-x');
    const originYInput = this.container.querySelector<HTMLInputElement>('#ruler-origin-y');
    const alignLeftBtn = this.container.querySelector<HTMLButtonElement>('#ruler-align-left');
    const alignCenterHBtn = this.container.querySelector<HTMLButtonElement>('#ruler-align-center-h');
    const alignRightBtn = this.container.querySelector<HTMLButtonElement>('#ruler-align-right');
    const alignTopBtn = this.container.querySelector<HTMLButtonElement>('#ruler-align-top');
    const alignCenterVBtn = this.container.querySelector<HTMLButtonElement>('#ruler-align-center-v');
    const alignBottomBtn = this.container.querySelector<HTMLButtonElement>('#ruler-align-bottom');

    const unitSelect = this.container.querySelector<HTMLSelectElement>('#ruler-unit');
    const scaleInput = this.container.querySelector<HTMLInputElement>('#ruler-scale');
    const stepInput = this.container.querySelector<HTMLInputElement>('#ruler-step');
    const clearBtn = this.container.querySelector<HTMLButtonElement>('#btn-clear-guides');

    const updateOrigin = (x: number, y: number) => {
      config.originX = x;
      config.originY = y;
      if (originXInput) originXInput.value = x.toString();
      if (originYInput) originYInput.value = y.toString();
      if (this.callbacks.onUpdateRuler) this.callbacks.onUpdateRuler(config);
    };

    if (originXInput) {
      const handleX = () => {
        config.originX = parseFloat(originXInput.value) || 0;
        if (this.callbacks.onUpdateRuler) this.callbacks.onUpdateRuler(config);
      };
      originXInput.addEventListener('input', handleX);
      originXInput.addEventListener('change', handleX);
    }

    if (originYInput) {
      const handleY = () => {
        config.originY = parseFloat(originYInput.value) || 0;
        if (this.callbacks.onUpdateRuler) this.callbacks.onUpdateRuler(config);
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
        if (this.callbacks.onUpdateRuler) this.callbacks.onUpdateRuler(config);
      });
    }

    if (scaleInput) {
      scaleInput.addEventListener('change', () => {
        config.scale = parseFloat(scaleInput.value) || 1;
        if (this.callbacks.onUpdateRuler) this.callbacks.onUpdateRuler(config);
      });
    }

    if (stepInput) {
      stepInput.addEventListener('change', () => {
        config.step = parseFloat(stepInput.value) || 50;
        if (this.callbacks.onUpdateRuler) this.callbacks.onUpdateRuler(config);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (this.callbacks.onClearAllGuides) this.callbacks.onClearAllGuides();
      });
    }

    this.bindMouseDown('btn-grid-align-origin', () => {
      this.gridAlignmentMode = 'origin';
      if (this.callbacks.onGridAlignmentChange) this.callbacks.onGridAlignmentChange('origin');
      this.renderRulerProperties(config);
    });
    this.bindMouseDown('btn-grid-align-center', () => {
      this.gridAlignmentMode = 'cell-center';
      if (this.callbacks.onGridAlignmentChange) this.callbacks.onGridAlignmentChange('cell-center');
      this.renderRulerProperties(config);
    });

    // Bind Grid Explorer actions
    this.grids.forEach((g) => {
      this.bindMouseDown(`btn-grid-vis-${g.id}`, () => {
        const nextVis = !g.visible;
        g.visible = nextVis;
        if (this.callbacks.onUpdateGrid) this.callbacks.onUpdateGrid(g.id, { visible: nextVis });
        this.renderRulerProperties(config);
      });
      this.bindMouseDown(`btn-grid-up-${g.id}`, () => {
        if (this.callbacks.onReorderGrid) this.callbacks.onReorderGrid(g.id, 'up');
      });
      this.bindMouseDown(`btn-grid-down-${g.id}`, () => {
        if (this.callbacks.onReorderGrid) this.callbacks.onReorderGrid(g.id, 'down');
      });
      this.bindMouseDown(`btn-grid-del-${g.id}`, () => {
        if (this.callbacks.onRemoveGrid) this.callbacks.onRemoveGrid(g.id);
      });

      const spInput = this.container.querySelector<HTMLInputElement>(`#grid-spacing-${g.id}`);
      if (spInput) {
        spInput.addEventListener('change', () => {
          const val = Math.max(1, parseFloat(spInput.value) || 20);
          g.spacing = val;
          if (this.callbacks.onUpdateGrid) this.callbacks.onUpdateGrid(g.id, { spacing: val });
        });
      }

      const colInput = this.container.querySelector<HTMLInputElement>(`#grid-color-${g.id}`);
      if (colInput) {
        colInput.addEventListener('input', () => {
          g.color = colInput.value;
          if (this.callbacks.onUpdateGrid) this.callbacks.onUpdateGrid(g.id, { color: colInput.value });
        });
      }
    });

    this.bindMouseDown('btn-add-grid-ortho', () => {
      if (this.callbacks.onAddGrid) this.callbacks.onAddGrid('orthogonal');
    });
    this.bindMouseDown('btn-add-grid-iso', () => {
      if (this.callbacks.onAddGrid) this.callbacks.onAddGrid('isometric');
    });
    this.bindMouseDown('btn-add-grid-axono', () => {
      if (this.callbacks.onAddGrid) this.callbacks.onAddGrid('axonometric');
    });

    // Bind Guide Explorer actions
    this.guides.forEach((guide) => {
      const selectRow = this.container.querySelector(`#guide-item-select-${guide.id}`);
      if (selectRow) {
        selectRow.addEventListener('click', () => {
          if (this.callbacks.onSelectGuide) this.callbacks.onSelectGuide(guide.id);
        });
      }

      this.bindMouseDown(`btn-guide-vis-${guide.id}`, () => {
        guide.visible = guide.visible === false ? true : false;
        if (this.callbacks.onUpdateGuide) this.callbacks.onUpdateGuide(guide);
        this.renderRulerProperties(config);
      });

      this.bindMouseDown(`btn-guide-lock-${guide.id}`, () => {
        guide.locked = !guide.locked;
        if (this.callbacks.onUpdateGuide) this.callbacks.onUpdateGuide(guide);
        this.renderRulerProperties(config);
      });

      this.bindMouseDown(`btn-guide-del-${guide.id}`, () => {
        if (this.callbacks.onDeleteGuide) this.callbacks.onDeleteGuide(guide.id);
      });
    });
  }

  // Render Guide Line Properties
  private renderGuideProperties(guide: GuideLine): void {
    this.container.innerHTML = `
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

    const angleInput = this.container.querySelector<HTMLInputElement>('#guide-angle');
    const pivotXInput = this.container.querySelector<HTMLInputElement>('#guide-pivot-x');
    const pivotYInput = this.container.querySelector<HTMLInputElement>('#guide-pivot-y');
    const colorInput = this.container.querySelector<HTMLInputElement>('#guide-color');
    const colorHexInput = this.container.querySelector<HTMLInputElement>('#guide-color-hex');
    const deleteBtn = this.container.querySelector<HTMLButtonElement>('#btn-delete-guide');

    if (angleInput) {
      angleInput.addEventListener('change', () => {
        guide.angle = parseFloat(angleInput.value) || 0;
        guide.orientation = 'angled';
        if (this.callbacks.onUpdateGuide) this.callbacks.onUpdateGuide(guide);
      });
    }

    if (pivotXInput) {
      pivotXInput.addEventListener('change', () => {
        guide.pivotX = parseFloat(pivotXInput.value) || 0;
        if (this.callbacks.onUpdateGuide) this.callbacks.onUpdateGuide(guide);
      });
    }

    if (pivotYInput) {
      pivotYInput.addEventListener('change', () => {
        guide.pivotY = parseFloat(pivotYInput.value) || 0;
        if (this.callbacks.onUpdateGuide) this.callbacks.onUpdateGuide(guide);
      });
    }

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        guide.color = colorInput.value;
        if (colorHexInput) colorHexInput.value = colorInput.value;
        if (this.callbacks.onUpdateGuide) this.callbacks.onUpdateGuide(guide);
      });
    }

    if (colorHexInput) {
      colorHexInput.addEventListener('change', () => {
        guide.color = colorHexInput.value;
        if (colorInput) colorInput.value = colorHexInput.value;
        if (this.callbacks.onUpdateGuide) this.callbacks.onUpdateGuide(guide);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (this.callbacks.onDeleteGuide) this.callbacks.onDeleteGuide(guide.id);
      });
    }
  }

  // Render Pen Tool options & next-node-type configuration
  private renderPenProperties(): void {
    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Bézier Curve Tool (P)</div>
        <div class="prop-row">
          <span class="prop-label">Path Nodes</span>
          <span style="font-weight:600; color:var(--text-main);">${this.penVertexCount} vertices</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Next Node Type</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 8px;">
          <button class="btn-icon ${this.penNodeType === 'sharp' ? 'active' : ''}" id="btn-pen-sharp" title="Sin tiradores (Sharp / Recto)">
            ${ToolIcons.nodeSharp}
          </button>
          <button class="btn-icon ${this.penNodeType === 'asymmetric' ? 'active' : ''}" id="btn-pen-asym" title="Asymmetric Node (Independent Handles)">
            ${ToolIcons.nodeAsymmetric}
          </button>
          <button class="btn-icon ${this.penNodeType === 'smooth' ? 'active' : ''}" id="btn-pen-smooth" title="Uniform / Smooth Node (Curved)">
            ${ToolIcons.nodeSmooth}
          </button>
          <button class="btn-icon ${this.penNodeType === 'symmetric' ? 'active' : ''}" id="btn-pen-sym" title="Symmetric Node (Equal Length Handles)">
            ${ToolIcons.nodeSymmetric}
          </button>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:8px; line-height:1.4;">
          Selected mode will apply to new nodes drawn.
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Path Actions</div>
        <div class="prop-row" style="flex-direction:column; gap:6px;">
          <button class="prop-input" id="btn-finish-path" style="cursor:pointer; background:var(--accent-color); color:#fff; text-align:center; font-weight:600;">
            ✓ Finish Path (Enter)
          </button>
          <button class="prop-input" id="btn-close-path" style="cursor:pointer; background:var(--bg-panel-hover); text-align:center;">
            ⟳ Close &amp; Finish Loop
          </button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Shortcuts</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
          • <b>Click</b>: Add node<br/>
          • <b>Drag</b>: Pull Bézier handles (Hold <b>Alt</b> to break handle)<br/>
          • <b>Shift + Click node</b>: Delete node<br/>
          • <b>Ctrl + Drag node</b>: Move node<br/>
          • <b>Enter / DblClick</b>: Finish path<br/>
          • <b>Escape</b>: Cancel drawing
        </div>
      </div>
    `;

    this.bindMouseDown('btn-pen-sharp', () => {
      this.penNodeType = 'sharp';
      if (this.callbacks.onPenNodeTypeChange) this.callbacks.onPenNodeTypeChange('sharp');
      this.renderPenProperties();
    });
    this.bindMouseDown('btn-pen-asym', () => {
      this.penNodeType = 'asymmetric';
      if (this.callbacks.onPenNodeTypeChange) this.callbacks.onPenNodeTypeChange('asymmetric');
      this.renderPenProperties();
    });
    this.bindMouseDown('btn-pen-smooth', () => {
      this.penNodeType = 'smooth';
      if (this.callbacks.onPenNodeTypeChange) this.callbacks.onPenNodeTypeChange('smooth');
      this.renderPenProperties();
    });
    this.bindMouseDown('btn-pen-sym', () => {
      this.penNodeType = 'symmetric';
      if (this.callbacks.onPenNodeTypeChange) this.callbacks.onPenNodeTypeChange('symmetric');
      this.renderPenProperties();
    });
    this.bindMouseDown('btn-finish-path', () => {
      if (this.callbacks.onFinishPenPath) this.callbacks.onFinishPenPath(false);
    });
    this.bindMouseDown('btn-close-path', () => {
      if (this.callbacks.onFinishPenPath) this.callbacks.onFinishPenPath(true);
    });
  }

  // Render Polyline Tool Properties & Actions
  private renderPolylineProperties(): void {
    const hasEnoughVerts = this.polylineVertexCount >= 2;
    const canClose = this.polylineVertexCount >= 3;

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Polyline Tool (Y)</div>
        <div class="prop-row">
          <span class="prop-label">Vertices</span>
          <span style="font-weight:600; color:var(--text-main);">${this.polylineVertexCount} pts</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Path Actions</div>
        <div class="prop-row" style="flex-direction:column; gap:8px; align-items:stretch;">
          <button class="prop-input" id="btn-finish-polyline" ${!hasEnoughVerts ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : 'style="cursor:pointer; background:var(--bg-active); text-align:center;"'}>
            Finalizar Trazo Abierto (Enter / DblClick)
          </button>
          <button class="prop-input" id="btn-close-polyline" ${!canClose ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : 'style="cursor:pointer; background:var(--accent); color:#ffffff; text-align:center;"'}>
            Cerrar Polígono (Z / Clic en Inicio)
          </button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Drawing Instructions</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.6;">
          • <b>Clic</b>: Colocar vértice recto puro (L)<br/>
          • <b>Clic en inicio</b>: Cerrar figura (Z)<br/>
          • <b>Enter / Doble Clic</b>: Finalizar trazo abierto<br/>
          • <b>Escape</b>: Cancelar trazado en curso<br/>
          • <b>Snap Activo</b>: Imantado a Grilla, Guías y Nodos
        </div>
      </div>
    `;

    this.bindMouseDown('btn-finish-polyline', () => {
      if (this.callbacks.onFinishPolylinePath) this.callbacks.onFinishPolylinePath(false);
    });
    this.bindMouseDown('btn-close-polyline', () => {
      if (this.callbacks.onFinishPolylinePath) this.callbacks.onFinishPolylinePath(true);
    });
  }

  // Render properties when a shape tool is active and no element is selected
  private renderShapeToolProperties(): void {
    const toolName =
      this.activeTool === 'rect' ? 'Rectangle' :
      this.activeTool === 'ellipse' ? 'Ellipse / Circle' : 'Star';

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">${toolName} Tool Settings</div>
        
        <div class="prop-row">
          <span class="prop-label">Proportion (Alt)</span>
          <select class="prop-input" id="shape-aspect-preset" style="cursor:pointer;">
            <option value="4:3" ${this.shapeConfig.aspectRatioW === 4 && this.shapeConfig.aspectRatioH === 3 ? 'selected' : ''}>4:3 (Standard)</option>
            <option value="16:9" ${this.shapeConfig.aspectRatioW === 16 && this.shapeConfig.aspectRatioH === 9 ? 'selected' : ''}>16:9 (Widescreen)</option>
            <option value="1:1" ${this.shapeConfig.aspectRatioW === 1 && this.shapeConfig.aspectRatioH === 1 ? 'selected' : ''}>1:1 (Square)</option>
            <option value="3:2" ${this.shapeConfig.aspectRatioW === 3 && this.shapeConfig.aspectRatioH === 2 ? 'selected' : ''}>3:2 (Photo)</option>
            <option value="2:1" ${this.shapeConfig.aspectRatioW === 2 && this.shapeConfig.aspectRatioH === 1 ? 'selected' : ''}>2:1 (Panoramic)</option>
            <option value="custom" ${!['4:3', '16:9', '1:1', '3:2', '2:1'].includes(`${this.shapeConfig.aspectRatioW}:${this.shapeConfig.aspectRatioH}`) ? 'selected' : ''}>Custom</option>
          </select>
        </div>

        <div class="prop-row">
          <span class="prop-label">Ratio W : H</span>
          <div style="display:flex; gap:6px; width:130px; align-items:center;">
            <input type="number" class="prop-input" id="shape-ratio-w" value="${this.shapeConfig.aspectRatioW}" min="1" step="1" style="width:55px; text-align:center;" />
            <span style="font-weight:bold; color:var(--text-muted);">:</span>
            <input type="number" class="prop-input" id="shape-ratio-h" value="${this.shapeConfig.aspectRatioH}" min="1" step="1" style="width:55px; text-align:center;" />
          </div>
        </div>

        ${this.activeTool === 'star' ? `
          <div class="prop-row">
            <span class="prop-label">Star Points</span>
            <input type="number" class="prop-input" id="star-points" value="${this.shapeConfig.starPoints}" min="3" max="32" step="1" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Inner Ratio</span>
            <input type="number" class="prop-input" id="star-inner-ratio" value="${this.shapeConfig.starInnerRatio}" min="0.1" max="0.9" step="0.05" />
          </div>
        ` : ''}

        ${this.activeTool === 'rect' ? `
          <div class="prop-row">
            <span class="prop-label">Corner Radius</span>
            <input type="number" class="prop-input" id="rect-corner-radius" value="${this.shapeConfig.rectCornerRadius}" min="0" step="1" />
          </div>
        ` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-title">Creation Shortcuts</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.6;">
          • <b>Drag</b>: Free size from corner<br/>
          • <b>Shift + Drag</b>: Expand from center<br/>
          • <b>Ctrl + Drag</b>: 1:1 Aspect Ratio (Square/Circle)<br/>
          • <b>Alt + Drag</b>: Fixed Aspect Ratio (${this.shapeConfig.aspectRatioW}:${this.shapeConfig.aspectRatioH})<br/>
          • <b>Ctrl + Shift</b>: 1:1 Ratio from center<br/>
          • <b>Alt + Shift</b>: Fixed ratio (${this.shapeConfig.aspectRatioW}:${this.shapeConfig.aspectRatioH}) from center
        </div>
      </div>
    `;

    const presetSelect = this.container.querySelector<HTMLSelectElement>('#shape-aspect-preset');
    const ratioWInput = this.container.querySelector<HTMLInputElement>('#shape-ratio-w');
    const ratioHInput = this.container.querySelector<HTMLInputElement>('#shape-ratio-h');
    const starPointsInput = this.container.querySelector<HTMLInputElement>('#star-points');
    const starInnerRatioInput = this.container.querySelector<HTMLInputElement>('#star-inner-ratio');
    const rectRadiusInput = this.container.querySelector<HTMLInputElement>('#rect-corner-radius');

    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const val = presetSelect.value;
        if (val !== 'custom') {
          const [w, h] = val.split(':').map(Number);
          this.shapeConfig.aspectRatioW = w;
          this.shapeConfig.aspectRatioH = h;
          if (ratioWInput) ratioWInput.value = w.toString();
          if (ratioHInput) ratioHInput.value = h.toString();
          if (this.callbacks.onUpdateShapeConfig) this.callbacks.onUpdateShapeConfig(this.shapeConfig);
        }
      });
    }

    if (ratioWInput) {
      ratioWInput.addEventListener('input', () => {
        const val = parseFloat(ratioWInput.value);
        if (!isNaN(val) && val > 0) {
          this.shapeConfig.aspectRatioW = val;
          if (this.callbacks.onUpdateShapeConfig) this.callbacks.onUpdateShapeConfig(this.shapeConfig);
        }
      });
    }

    if (ratioHInput) {
      ratioHInput.addEventListener('input', () => {
        const val = parseFloat(ratioHInput.value);
        if (!isNaN(val) && val > 0) {
          this.shapeConfig.aspectRatioH = val;
          if (this.callbacks.onUpdateShapeConfig) this.callbacks.onUpdateShapeConfig(this.shapeConfig);
        }
      });
    }

    if (starPointsInput) {
      starPointsInput.addEventListener('input', () => {
        const val = parseInt(starPointsInput.value, 10);
        if (!isNaN(val) && val >= 3) {
          this.shapeConfig.starPoints = val;
          if (this.callbacks.onUpdateShapeConfig) this.callbacks.onUpdateShapeConfig(this.shapeConfig);
        }
      });
    }

    if (starInnerRatioInput) {
      starInnerRatioInput.addEventListener('input', () => {
        const val = parseFloat(starInnerRatioInput.value);
        if (!isNaN(val) && val > 0 && val < 1) {
          this.shapeConfig.starInnerRatio = val;
          if (this.callbacks.onUpdateShapeConfig) this.callbacks.onUpdateShapeConfig(this.shapeConfig);
        }
      });
    }

    if (rectRadiusInput) {
      rectRadiusInput.addEventListener('input', () => {
        const val = parseFloat(rectRadiusInput.value);
        if (!isNaN(val) && val >= 0) {
          this.shapeConfig.rectCornerRadius = val;
          if (this.callbacks.onUpdateShapeConfig) this.callbacks.onUpdateShapeConfig(this.shapeConfig);
        }
      });
    }
  }

  // Render properties when multiple elements are selected
  private renderMultiElementProperties(elements: VectorElement[]): void {
    const groupBox = this.selectionTool.getGroupSelectionBoundingBox(elements);
    const multiPivot = groupBox ? this.selectionTool.getPivot(groupBox) : { x: 0, y: 0 };

    const hasClosedElements = elements.some((el) => this.model.isElementClosed(el));

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Multiple Selection</div>
        <div class="prop-row">
          <span class="prop-label">Selected</span>
          <span style="font-weight:600; color:var(--text-main);">${elements.length} vectors</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Total Nodes</span>
          <span style="font-weight:600; color:var(--text-main);">${elements.reduce((acc, curr) => acc + (curr.vertices ? curr.vertices.length : 0), 0)} nodes</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Transform (Group)</div>
        <div class="prop-row">
          <span class="prop-label">Pivot</span>
          <input type="number" class="prop-input" id="multi-pivot-x" value="${Math.round(multiPivot.x)}" title="Coordenada X del pivote de rotación grupal" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="multi-pivot-y" value="${Math.round(multiPivot.y)}" title="Coordenada Y del pivote de rotación grupal" />
          <button class="prop-input" id="btn-multi-reset-pivot" style="width:auto; padding:2px 8px; cursor:pointer;" title="Restablecer pivote al centro de la selección">⟲</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Batch Fill</span>
          ${!hasClosedElements ? '<span style="font-size:10px; color:#94a3b8; font-weight:normal; text-transform:none;">(Solo elementos cerrados)</span>' : ''}
        </div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="batch-fill-color" value="#4f46e5" ${!hasClosedElements ? 'disabled' : ''} />
            <input type="text" class="prop-input" id="batch-fill-hex" value="#4f46e5" ${!hasClosedElements ? 'disabled style="opacity:0.6; cursor:not-allowed;" title="Ningún elemento seleccionado es un trazado cerrado"' : ''} />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Batch Stroke</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="batch-stroke-color" value="#000000" />
            <input type="text" class="prop-input" id="batch-stroke-hex" value="#000000" />
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="batch-stroke-width" value="1" min="0" step="0.5" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Join</span>
          <div style="display:flex; gap:4px; flex:1; align-items:center;">
            <select class="prop-input" id="batch-stroke-join" style="cursor:pointer; flex:1;">
              <option value="miter">Miter</option>
              <option value="round">Round</option>
              <option value="bevel">Bevel</option>
            </select>
            <div id="container-batch-stroke-miterlimit" style="display:flex; align-items:center; gap:2px; width:65px;" title="Ángulo mínimo de inglete en grados (°): esquinas más agudas que este valor se cortan a bisel">
              <input type="number" class="prop-input" id="batch-stroke-miter-angle" value="29" min="1" max="170" step="1" style="width:45px; padding:2px 4px; text-align:right;" />
              <span style="font-size:11px; color:var(--text-muted); font-weight:600;">°</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Boolean Operations (Formas)</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 6px; flex-wrap: wrap;">
          <button class="btn-icon" id="btn-prop-bool-union" title="Weld / Union (Soldar formas)">${ToolIcons.union}</button>
          <button class="btn-icon" id="btn-prop-bool-subtract" title="Trim / Minus (1° corta al último, conserva cortador)">${ToolIcons.subtract}</button>
          <button class="btn-icon" id="btn-prop-bool-intersect" title="Intersect (Intersección)">${ToolIcons.intersect}</button>
          <button class="btn-icon" id="btn-prop-bool-exclude" title="Exclusion / XOR (Exclusión)">${ToolIcons.exclude}</button>
          <button class="btn-icon" id="btn-prop-bool-combine" title="Boundary / Combine (Unir conservando originales)">${ToolIcons.combine}</button>
          <button class="btn-icon" id="btn-prop-bool-fragment" title="Divide / Fragment (Intersección y exclusión a la vez)">${ToolIcons.fragment}</button>
        </div>
      </div>
    `;

    const bFillColor = this.container.querySelector<HTMLInputElement>('#batch-fill-color');
    const bFillHex = this.container.querySelector<HTMLInputElement>('#batch-fill-hex');
    const bStrokeColor = this.container.querySelector<HTMLInputElement>('#batch-stroke-color');
    const bStrokeHex = this.container.querySelector<HTMLInputElement>('#batch-stroke-hex');
    const bStrokeWidth = this.container.querySelector<HTMLInputElement>('#batch-stroke-width');
    const bStrokeJoin = this.container.querySelector<HTMLSelectElement>('#batch-stroke-join');
    const bStrokeMiterlimit = this.container.querySelector<HTMLInputElement>('#batch-stroke-miterlimit');

    this.bindMouseDown('btn-prop-bool-union', () => this.callbacks.onBoolean && this.callbacks.onBoolean('union'));
    this.bindMouseDown('btn-prop-bool-subtract', () => this.callbacks.onBoolean && this.callbacks.onBoolean('subtract'));
    this.bindMouseDown('btn-prop-bool-intersect', () => this.callbacks.onBoolean && this.callbacks.onBoolean('intersect'));
    this.bindMouseDown('btn-prop-bool-exclude', () => this.callbacks.onBoolean && this.callbacks.onBoolean('exclude'));
    this.bindMouseDown('btn-prop-bool-combine', () => this.callbacks.onBoolean && this.callbacks.onBoolean('combine'));
    this.bindMouseDown('btn-prop-bool-fragment', () => this.callbacks.onBoolean && this.callbacks.onBoolean('fragment'));

    if (bFillColor) {
      bFillColor.addEventListener('input', () => {
        elements.forEach((el) => {
          if (this.model.isElementClosed(el)) {
            el.attributes['fill'] = bFillColor.value;
          } else {
            el.attributes['fill'] = 'none';
          }
        });
        if (bFillHex) bFillHex.value = bFillColor.value;
        this.callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bFillHex) {
      bFillHex.addEventListener('change', () => {
        elements.forEach((el) => {
          if (this.model.isElementClosed(el)) {
            el.attributes['fill'] = bFillHex.value;
          } else {
            el.attributes['fill'] = 'none';
          }
        });
        if (bFillColor) bFillColor.value = bFillHex.value;
        this.callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeColor) {
      bStrokeColor.addEventListener('input', () => {
        elements.forEach((el) => { el.attributes['stroke'] = bStrokeColor.value; });
        if (bStrokeHex) bStrokeHex.value = bStrokeColor.value;
        this.callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeHex) {
      bStrokeHex.addEventListener('change', () => {
        elements.forEach((el) => { el.attributes['stroke'] = bStrokeHex.value; });
        if (bStrokeColor) bStrokeColor.value = bStrokeHex.value;
        this.callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeWidth) {
      bStrokeWidth.addEventListener('input', () => {
        elements.forEach((el) => { el.attributes['stroke-width'] = bStrokeWidth.value; });
        this.callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bStrokeJoin) {
      bStrokeJoin.addEventListener('change', () => {
        elements.forEach((el) => { el.attributes['stroke-linejoin'] = bStrokeJoin.value; });
        const containerMiter = this.container.querySelector<HTMLElement>('#container-batch-stroke-miterlimit');
        if (containerMiter) containerMiter.style.display = bStrokeJoin.value === 'miter' ? 'flex' : 'none';
        this.callbacks.onUpdateElement(elements[0]);
      });
    }
    const bStrokeMiterAngle = this.container.querySelector<HTMLInputElement>('#batch-stroke-miter-angle');
    if (bStrokeMiterAngle) {
      const applyBatchMiterAngle = () => {
        const deg = Math.max(1, Math.min(170, parseFloat(bStrokeMiterAngle.value) || 29));
        const limit = degreesToMiterLimit(deg);
        elements.forEach((el) => { el.attributes['stroke-miterlimit'] = limit.toString(); });
        this.callbacks.onUpdateElement(elements[0]);
      };
      bStrokeMiterAngle.addEventListener('input', applyBatchMiterAngle);
      bStrokeMiterAngle.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        applyBatchMiterAngle();
      });
    }

    const multiPivotX = this.container.querySelector<HTMLInputElement>('#multi-pivot-x');
    const multiPivotY = this.container.querySelector<HTMLInputElement>('#multi-pivot-y');
    const btnMultiResetPivot = this.container.querySelector<HTMLButtonElement>('#btn-multi-reset-pivot');

    if (multiPivotX && multiPivotY && groupBox) {
      const applyMultiPivot = () => {
        const px = parseFloat(multiPivotX.value);
        const py = parseFloat(multiPivotY.value);
        if (!isNaN(px) && !isNaN(py)) {
          this.selectionTool.customPivot = { x: px, y: py };
          this.callbacks.onRenderOverlay?.();
        }
      };
      multiPivotX.addEventListener('input', applyMultiPivot);
      multiPivotY.addEventListener('input', applyMultiPivot);
    }

    if (btnMultiResetPivot && groupBox) {
      btnMultiResetPivot.addEventListener('click', () => {
        this.selectionTool.resetPivot();
        if (multiPivotX) multiPivotX.value = String(Math.round(groupBox.cx));
        if (multiPivotY) multiPivotY.value = String(Math.round(groupBox.cy));
        this.callbacks.onRenderOverlay?.();
      });
    }
  }

  /**
   * ARCHITECTURAL RATIONALE: High-Frequency In-Place DOM Mutation
   * Why this exists:
   * During active node dragging, `update()` is called on every animation frame/mousemove event.
   * If `renderNodeProperties()` were invoked each time, it would completely wipe `innerHTML`,
   * forcing browser reflow, destroying active input cursor focus, and producing perceptible frame drops.
   * By mutating only the existing text inputs and active CSS classes in place, 60fps responsiveness
   * is preserved without flickering or focus loss.
   */
  private updateNodePropertiesInPlace(v: PathVertex): void {
    const xInput = this.container.querySelector<HTMLInputElement>('#node-pos-x');
    const yInput = this.container.querySelector<HTMLInputElement>('#node-pos-y');
    if (xInput) xInput.value = Math.round(v.x).toString();
    if (yInput) yInput.value = Math.round(v.y).toString();

    const isSharp = v.nodeType === 'sharp' || (!v.handleIn && !v.handleOut);
    const sharpBtn = this.container.querySelector('#btn-node-sharp');
    const asymBtn = this.container.querySelector('#btn-node-asym');
    const smoothBtn = this.container.querySelector('#btn-node-smooth');
    const symBtn = this.container.querySelector('#btn-node-sym');

    if (sharpBtn) sharpBtn.classList.toggle('active', isSharp);
    if (asymBtn) asymBtn.classList.toggle('active', !isSharp && v.nodeType === 'asymmetric');
    if (smoothBtn) smoothBtn.classList.toggle('active', !isSharp && v.nodeType === 'smooth');
    if (symBtn) symBtn.classList.toggle('active', !isSharp && v.nodeType === 'symmetric');
  }

  // Render Canvas & ViewBox Properties
  private renderCanvasProperties(): void {
    const { canvas } = this.model;
    const vb = this.model.getViewBoxBounds();

    const currentW = Math.round(canvas.width);
    const currentH = Math.round(canvas.height);
    const matchedPreset = VIEWBOX_PRESETS.slice(1).find(
      (p) => p.width === currentW && p.height === currentH
    );
    const selectedPresetId = matchedPreset ? matchedPreset.id : 'custom';

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Canvas &amp; ViewBox Size</div>
        <div class="prop-row">
          <span class="prop-label">Preset</span>
          <select class="prop-input" id="canvas-preset" style="cursor:pointer;">
            ${VIEWBOX_PRESETS.map(
              (p) =>
                `<option value="${p.id}" ${selectedPresetId === p.id ? 'selected' : ''}>${p.name}</option>`
            ).join('')}
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="canvas-width" value="${canvas.width}" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="canvas-height" value="${canvas.height}" />
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">ViewBox (Artboard Frame)</div>
        <div class="prop-row">
          <span class="prop-label">X</span>
          <input type="number" class="prop-input" id="vb-minx" value="${vb.minX}" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="vb-miny" value="${vb.minY}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">W</span>
          <input type="number" class="prop-input" id="vb-width" value="${vb.width}" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="vb-height" value="${vb.height}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Raw</span>
          <input type="text" class="prop-input" id="canvas-viewbox" value="${canvas.viewBox}" title="Format: minX minY width height" />
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Artboard Background</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="canvas-bg-color" value="${canvas.backgroundColor}" />
            <input type="text" class="prop-input" id="canvas-bg-hex" value="${canvas.backgroundColor}" />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Grid-Ruler Alignment</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input ${this.gridAlignmentMode === 'origin' ? 'active' : ''}" id="btn-canvas-grid-align-origin" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo A: Línea o cruce de grilla coincidente con (0, 0)">
            ┼ Línea en (0, 0)
          </button>
          <button class="prop-input ${this.gridAlignmentMode === 'cell-center' ? 'active' : ''}" id="btn-canvas-grid-align-center" style="cursor:pointer; text-align:center; flex:1; padding:6px 4px; font-size:11px;" title="Modo B: Centro de la celda virtual coincidente con (0, 0)">
            ◫ Celda en (0, 0)
          </button>
        </div>
      </div>
    `;

    const presetSelect = this.container.querySelector<HTMLSelectElement>('#canvas-preset');
    const widthInput = this.container.querySelector<HTMLInputElement>('#canvas-width');
    const heightInput = this.container.querySelector<HTMLInputElement>('#canvas-height');
    const vbMinX = this.container.querySelector<HTMLInputElement>('#vb-minx');
    const vbMinY = this.container.querySelector<HTMLInputElement>('#vb-miny');
    const vbWidth = this.container.querySelector<HTMLInputElement>('#vb-width');
    const vbHeight = this.container.querySelector<HTMLInputElement>('#vb-height');
    const viewBoxInput = this.container.querySelector<HTMLInputElement>('#canvas-viewbox');
    const bgColor = this.container.querySelector<HTMLInputElement>('#canvas-bg-color');
    const bgHex = this.container.querySelector<HTMLInputElement>('#canvas-bg-hex');

    const syncVbFromNumbers = () => {
      const minX = parseFloat(vbMinX?.value || '0') || 0;
      const minY = parseFloat(vbMinY?.value || '0') || 0;
      const w = parseFloat(vbWidth?.value || '800') || 800;
      const h = parseFloat(vbHeight?.value || '600') || 600;
      this.model.setViewBoxBounds(minX, minY, w, h);
      if (viewBoxInput) viewBoxInput.value = this.model.canvas.viewBox;
      this.callbacks.onUpdateCanvas();
    };

    const checkPresetOrCustom = () => {
      if (presetSelect) {
        const w = parseFloat(widthInput?.value || vbWidth?.value || '0');
        const h = parseFloat(heightInput?.value || vbHeight?.value || '0');
        const found = VIEWBOX_PRESETS.slice(1).find((p) => p.width === w && p.height === h);
        presetSelect.value = found ? found.id : 'custom';
      }
    };

    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const val = presetSelect.value;
        const preset = VIEWBOX_PRESETS.find((p) => p.id === val);
        if (preset && preset.id !== 'custom') {
          this.model.canvas.width = preset.width;
          this.model.canvas.height = preset.height;
          const curVb = this.model.getViewBoxBounds();
          this.model.setViewBoxBounds(curVb.minX, curVb.minY, preset.width, preset.height);
          if (widthInput) widthInput.value = preset.width.toString();
          if (heightInput) heightInput.value = preset.height.toString();
          if (vbWidth) vbWidth.value = preset.width.toString();
          if (vbHeight) vbHeight.value = preset.height.toString();
          if (viewBoxInput) viewBoxInput.value = this.model.canvas.viewBox;
          this.callbacks.onUpdateCanvas();
        }
      });
    }

    if (widthInput) {
      widthInput.addEventListener('input', checkPresetOrCustom);
      widthInput.addEventListener('change', () => {
        checkPresetOrCustom();
        const newW = parseFloat(widthInput.value) || 800;
        this.model.canvas.width = newW;
        const curVb = this.model.getViewBoxBounds();
        this.model.setViewBoxBounds(curVb.minX, curVb.minY, newW, curVb.height);
        if (vbWidth) vbWidth.value = newW.toString();
        if (viewBoxInput) viewBoxInput.value = this.model.canvas.viewBox;
        this.callbacks.onUpdateCanvas();
      });
    }

    if (heightInput) {
      heightInput.addEventListener('input', checkPresetOrCustom);
      heightInput.addEventListener('change', () => {
        checkPresetOrCustom();
        const newH = parseFloat(heightInput.value) || 600;
        this.model.canvas.height = newH;
        const curVb = this.model.getViewBoxBounds();
        this.model.setViewBoxBounds(curVb.minX, curVb.minY, curVb.width, newH);
        if (vbHeight) vbHeight.value = newH.toString();
        if (viewBoxInput) viewBoxInput.value = this.model.canvas.viewBox;
        this.callbacks.onUpdateCanvas();
      });
    }

    if (vbMinX) vbMinX.addEventListener('change', syncVbFromNumbers);
    if (vbMinY) vbMinY.addEventListener('change', syncVbFromNumbers);

    if (vbWidth) {
      vbWidth.addEventListener('input', () => {
        if (widthInput) widthInput.value = vbWidth.value;
        checkPresetOrCustom();
      });
      vbWidth.addEventListener('change', () => {
        if (widthInput) widthInput.value = vbWidth.value;
        this.model.canvas.width = parseFloat(vbWidth.value) || 800;
        checkPresetOrCustom();
        syncVbFromNumbers();
      });
    }

    if (vbHeight) {
      vbHeight.addEventListener('input', () => {
        if (heightInput) heightInput.value = vbHeight.value;
        checkPresetOrCustom();
      });
      vbHeight.addEventListener('change', () => {
        if (heightInput) heightInput.value = vbHeight.value;
        this.model.canvas.height = parseFloat(vbHeight.value) || 600;
        checkPresetOrCustom();
        syncVbFromNumbers();
      });
    }

    if (viewBoxInput) viewBoxInput.addEventListener('change', () => {
      this.model.canvas.viewBox = viewBoxInput.value.trim();
      const updatedVb = this.model.getViewBoxBounds();
      if (vbMinX) vbMinX.value = updatedVb.minX.toString();
      if (vbMinY) vbMinY.value = updatedVb.minY.toString();
      if (vbWidth) vbWidth.value = updatedVb.width.toString();
      if (vbHeight) vbHeight.value = updatedVb.height.toString();
      checkPresetOrCustom();
      this.callbacks.onUpdateCanvas();
    });

    if (bgColor) bgColor.addEventListener('input', () => {
      this.model.canvas.backgroundColor = bgColor.value;
      if (bgHex) bgHex.value = bgColor.value;
      this.callbacks.onUpdateCanvas();
    });
    if (bgHex) bgHex.addEventListener('change', () => {
      this.model.canvas.backgroundColor = bgHex.value;
      if (bgColor) bgColor.value = bgHex.value;
      this.callbacks.onUpdateCanvas();
    });

    this.bindMouseDown('btn-canvas-grid-align-origin', () => {
      this.gridAlignmentMode = 'origin';
      if (this.callbacks.onGridAlignmentChange) this.callbacks.onGridAlignmentChange('origin');
      this.renderCanvasProperties();
    });
    this.bindMouseDown('btn-canvas-grid-align-center', () => {
      this.gridAlignmentMode = 'cell-center';
      if (this.callbacks.onGridAlignmentChange) this.callbacks.onGridAlignmentChange('cell-center');
      this.renderCanvasProperties();
    });
  }

  // Render Single Element Properties
  private renderElementProperties(el: VectorElement): void {
    const isClosed = this.model.isElementClosed(el);
    let fill = isClosed ? (el.attributes['fill'] || 'none') : 'none';
    if (!isClosed) {
      el.attributes['fill'] = 'none';
      delete el.attributes['data-gradient'];
    }
    const stroke = el.attributes['stroke'] || '#ffffff';
    const strokeWidth = el.attributes['stroke-width'] || '1';
    const strokeDash = el.attributes['stroke-dasharray'] || '';
    const strokeLinecap = el.attributes['stroke-linecap'] || 'butt';
    const strokeLinejoin = el.attributes['stroke-linejoin'] || 'miter';
    const strokeMiterlimit = parseFloat(el.attributes['stroke-miterlimit'] || '4') || 4;
    const miterAngleDeg = miterLimitToDegrees(strokeMiterlimit);

    const parseMarkerId = (val?: string): string => {
      if (!val || val === 'none') return 'none';
      if (val.includes('arrow-open')) return 'arrow-open';
      if (val.includes('arrow-filled')) return 'arrow-filled';
      if (val.includes('circle-dot')) return 'circle-dot';
      if (val.includes('square-block')) return 'square-block';
      if (val.includes('bar-cap')) return 'bar-cap';
      return 'none';
    };

    const markerStart = parseMarkerId(el.attributes['marker-start']);
    const markerMid = parseMarkerId(el.attributes['marker-mid']);
    const markerEnd = parseMarkerId(el.attributes['marker-end']);

    const box = this.selectionTool.getBoundingBox(el);
    const x = box ? Math.round(box.x) : 0;
    const y = box ? Math.round(box.y) : 0;
    const w = box ? Math.round(box.width) : 0;
    const h = box ? Math.round(box.height) : 0;

    let ds: DropShadowConfig = { enabled: false, dx: 4, dy: 4, blur: 4, color: '#000000', opacity: 0.5 };
    let is: InnerShadowConfig = { enabled: false, dx: 2, dy: 2, blur: 3, color: '#000000', opacity: 0.6 };
    if (el.attributes['data-drop-shadow']) {
      try {
        ds = { ...ds, ...JSON.parse(el.attributes['data-drop-shadow']) };
      } catch {}
    }
    if (el.attributes['data-inner-shadow']) {
      try {
        is = { ...is, ...JSON.parse(el.attributes['data-inner-shadow']) };
      } catch {}
    }

    let grad: GradientConfig | null = null;
    if (isClosed && el.attributes['data-gradient']) {
      try {
        grad = JSON.parse(el.attributes['data-gradient']);
      } catch {}
    }

    let fillType: 'solid' | 'linear' | 'radial' | 'none' = 'solid';
    if (!isClosed) {
      fillType = 'none';
    } else if (fill === 'none' && !grad) {
      fillType = 'none';
    } else if (grad && grad.type === 'radial') {
      fillType = 'radial';
    } else if (grad && grad.type === 'linear') {
      fillType = 'linear';
    } else if (fill.startsWith('url(#ad-grad-')) {
      fillType = 'linear';
    }

    if (!grad) {
      grad = {
        type: fillType === 'radial' ? 'radial' : 'linear',
        angle: 0,
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { id: 'stop_0', offset: 0, color: fill !== 'none' && !fill.startsWith('url') ? fill : '#4f46e5', opacity: 1 },
          { id: 'stop_1', offset: 1, color: '#ec4899', opacity: 1 },
        ],
      };
    } else if (grad.type === 'radial') {
      if (grad.cx === undefined) grad.cx = 0.5;
      if (grad.cy === undefined) grad.cy = 0.5;
      if (grad.r === undefined) grad.r = 0.5;
    }

    const sortedStops = [...grad.stops].sort((a, b) => a.offset - b.offset);
    const gradientCss = `linear-gradient(to right, ${sortedStops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})`;
    if (el.attributes['data-pivot'] && !this.selectionTool.customPivot) {
      this.selectionTool.restorePivotForElement(el);
    }
    const pivot = box ? this.selectionTool.getPivot(box) : { x: 0, y: 0 };
    const isEllipse = this.model.isEllipse(el);
    const ellipseCx = box ? box.cx : (parseFloat(el.attributes['cx'] || '0') || 0);
    const ellipseCy = box ? box.cy : (parseFloat(el.attributes['cy'] || '0') || 0);
    const ellipseRx = box ? box.width / 2 : (parseFloat(el.attributes['rx'] || '0') || 0);
    const ellipseRy = box ? box.height / 2 : (parseFloat(el.attributes['ry'] || '0') || 0);
    const isCircle = Math.abs(ellipseRx - ellipseRy) < 0.5;

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Transform</div>
        <div class="prop-row">
          <span class="prop-label">X</span>
          <input type="number" class="prop-input" id="el-x" value="${x}" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="el-y" value="${y}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">W</span>
          <input type="number" class="prop-input" id="el-w" value="${w}" />
          <span class="prop-label" style="width:20px; text-align:right;">H</span>
          <input type="number" class="prop-input" id="el-h" value="${h}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Pivot</span>
          <input type="number" class="prop-input" id="el-pivot-x" value="${Math.round(pivot.x)}" title="Coordenada X del pivote de rotación" />
          <span class="prop-label" style="width:20px; text-align:right;">Y</span>
          <input type="number" class="prop-input" id="el-pivot-y" value="${Math.round(pivot.y)}" title="Coordenada Y del pivote de rotación" />
          <button class="prop-input" id="btn-reset-pivot" style="width:auto; padding:2px 8px; cursor:pointer;" title="Restablecer pivote al centro del elemento">⟲</button>
        </div>
        <div class="prop-row">
          <span class="prop-label">Nodes</span>
          <span style="font-weight:600; color:var(--text-main); font-size:12px;">${el.vertices ? el.vertices.length : 0} nodes (${isClosed ? 'closed' : 'open'})</span>
        </div>
      </div>

      ${isEllipse ? `
      <!-- Ellipse / Circle Geometry Controls (FIX-19) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Elipse / Círculo</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${isCircle ? '● Círculo' : '⬭ Elipse'}
          </span>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Coordenadas del centro de la elipse">Centro</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X del centro de la elipse">
              <span class="prop-coord-sublabel">X</span>
              <input type="number" class="prop-coord-input" id="ellipse-cx" value="${Math.round(ellipseCx)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y del centro de la elipse">
              <span class="prop-coord-sublabel">Y</span>
              <input type="number" class="prop-coord-input" id="ellipse-cy" value="${Math.round(ellipseCy)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Radios horizontal y vertical">Radios</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Radio horizontal (rx)">
              <span class="prop-coord-sublabel">Rx</span>
              <input type="number" class="prop-coord-input" id="ellipse-rx" value="${Math.round(ellipseRx)}" min="1" />
            </div>
            <div class="prop-coord-box" title="Radio vertical (ry)">
              <span class="prop-coord-sublabel">Ry</span>
              <input type="number" class="prop-coord-input" id="ellipse-ry" value="${Math.round(ellipseRy)}" min="1" />
            </div>
          </div>
          <button class="prop-input" id="btn-ellipse-make-circle" style="width: auto; padding: 2px 6px; height: 26px; cursor: pointer; flex-shrink: 0;" title="Convertir a círculo perfecto 1:1">1:1</button>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 4px;">
          <button class="prop-input" id="btn-ellipse-swap-radii" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Intercambiar radio horizontal y vertical (Rotar 90°)">⇄ Rotar 90°</button>
          <button class="prop-input" id="btn-ellipse-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curvas Bézier independientes">Convertir a Curvas</button>
        </div>
      </div>
      ` : ''}

      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Fill (Relleno)</span>
          ${!isClosed ? '<span style="font-size:10px; color:#94a3b8; font-weight:normal; text-transform:none;">Trazado abierto</span>' : ''}
        </div>
        ${!isClosed ? `
        <div class="prop-row">
          <span class="prop-label">Type</span>
          <select class="prop-input" id="el-fill-type" disabled style="cursor:not-allowed; opacity:0.6;" title="Los vectores abiertos no admiten relleno. Cierra el trazado formalmente para habilitar el relleno.">
            <option value="none" selected>None (Trazado abierto)</option>
          </select>
        </div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px; line-height:1.4;">
          Los vectores abiertos tienen el relleno bloqueado a <code>none</code> para evitar cierres simulados.
        </div>
        <div style="margin-top:6px;">
          <button class="prop-input" id="btn-prop-close-path" style="width:100%; cursor:pointer; background:#3b82f6; color:#fff; text-align:center; font-weight:600; padding:4px 8px; font-size:11px;" title="Cerrar trazado formalmente uniendo extremos libres con Z">Cerrar Trazado (Z)</button>
        </div>
        ` : `
        <div class="prop-row">
          <span class="prop-label">Type</span>
          <select class="prop-input" id="el-fill-type" style="cursor:pointer;">
            <option value="solid" ${fillType === 'solid' ? 'selected' : ''}>Solid Color</option>
            <option value="linear" ${fillType === 'linear' ? 'selected' : ''}>Linear Gradient</option>
            <option value="radial" ${fillType === 'radial' ? 'selected' : ''}>Radial Gradient</option>
            <option value="none" ${fillType === 'none' ? 'selected' : ''}>None</option>
          </select>
        </div>

        <!-- Solid Fill Container -->
        <div id="fill-solid-controls" style="${fillType === 'solid' ? '' : 'display: none;'}">
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="el-fill-color" value="${fill === 'none' || fill.startsWith('url') ? '#4f46e5' : fill}" />
              <input type="text" class="prop-input" id="el-fill-hex" value="${fill.startsWith('url') ? '#4f46e5' : fill}" />
            </div>
          </div>
        </div>

        <!-- Gradient Controls Container -->
        <div id="fill-gradient-controls" style="${fillType === 'linear' || fillType === 'radial' ? '' : 'display: none;'} margin-top: 6px;">
          <!-- Gradient Preview Bar -->
          <div style="margin-bottom: 8px;">
            <div id="gradient-bar-preview" style="height: 18px; border-radius: 4px; border: 1px solid var(--border-subtle); background: ${gradientCss}; margin-bottom: 6px;"></div>
            <div style="display: flex; gap: 4px; justify-content: space-between; align-items: center;">
              <button class="prop-input" id="btn-add-gradient-stop" style="cursor: pointer; width: auto; padding: 3px 8px; font-size: 10px; font-weight: 600;" title="Añadir parada de color">+ Parada</button>
              <button class="prop-input" id="btn-reverse-gradient" style="cursor: pointer; width: auto; padding: 3px 8px; font-size: 11px; font-weight: 600;" title="Invertir dirección del degradado">⇄ Invertir</button>
              <button class="prop-input" id="btn-delete-gradient-stop" style="cursor: pointer; width: auto; padding: 3px 8px; font-size: 10px; color: #ef4444;" title="Eliminar parada activa" ${grad.stops.length <= 2 ? 'disabled' : ''}>🗑</button>
            </div>
          </div>

          <!-- Angle Control (for Linear) -->
          <div id="gradient-angle-row" class="prop-row" style="${fillType === 'linear' ? '' : 'display: none;'}">
            <span class="prop-label">Angle (°)</span>
            <input type="number" class="prop-input" id="gradient-angle" value="${grad.angle ?? 0}" min="0" max="360" step="15" />
            <select class="prop-input" id="gradient-angle-preset" style="width: 70px; cursor: pointer;">
              <option value="0" ${grad.angle === 0 ? 'selected' : ''}>0° →</option>
              <option value="90" ${grad.angle === 90 ? 'selected' : ''}>90° ↓</option>
              <option value="180" ${grad.angle === 180 ? 'selected' : ''}>180° ←</option>
              <option value="270" ${grad.angle === 270 ? 'selected' : ''}>270° ↑</option>
              <option value="45" ${grad.angle === 45 ? 'selected' : ''}>45° ↘</option>
              <option value="135" ${grad.angle === 135 ? 'selected' : ''}>135° ↙</option>
            </select>
          </div>

          <!-- Radial Gradient Geometric Controls (for Radial) -->
          <!--
            Technical Rationale (FIX-16):
            In the 260px inspector panel, squeezing a 70px label, multiple standalone percentage indicators,
            two separate number inputs with default browser padding/spinners, and an action button causes
            severe horizontal clipping of values like "-100" or "100" (inputs previously reduced to ~20px text area).
            To resolve this without breaking layout hierarchy:
            1. Shorten the primary row label to 46px ("Centro", "Radio", "Foco").
            2. Encapsulate X/Y percentage inputs into `.prop-coord-group` and `.prop-coord-box` badge containers.
            3. Separate sublabels ('X', 'Y', '%') as non-selectable affixes while giving the input 100% of the
               box's inner flex width, ensuring 3-4 digit percentage values remain completely visible without truncation.
            4. Retain 26x26px square action buttons with centered glyphs for quick resetting and synchronization.
          -->
          <div id="fill-radial-controls" style="${fillType === 'radial' ? '' : 'display: none;'}">
            <div class="prop-row" style="gap: 6px;">
              <span class="prop-label" style="width: 46px;" title="Posición del centro del gradiente radial">Centro</span>
              <div class="prop-coord-group">
                <div class="prop-coord-box" title="Posición X del centro del gradiente (%)">
                  <span class="prop-coord-sublabel">X</span>
                  <input type="number" class="prop-coord-input" id="radial-cx" value="${Math.round((grad.cx ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
                <div class="prop-coord-box" title="Posición Y del centro del gradiente (%)">
                  <span class="prop-coord-sublabel">Y</span>
                  <input type="number" class="prop-coord-input" id="radial-cy" value="${Math.round((grad.cy ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
              </div>
              <button class="prop-input" id="btn-reset-radial-center" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Centrar al 50%, 50%">⟲</button>
            </div>
            <div class="prop-row" style="gap: 6px;">
              <span class="prop-label" style="width: 46px;" title="Radio de dispersión del gradiente radial">Radio</span>
              <div class="prop-coord-box" style="flex: 1;" title="Radio de dispersión del gradiente radial (%)">
                <span class="prop-coord-sublabel">R</span>
                <input type="number" class="prop-coord-input" id="radial-r" value="${Math.round((grad.r ?? 0.5) * 100)}" min="1" max="500" step="5" />
                <span class="prop-coord-sublabel">%</span>
              </div>
              <button class="prop-input" id="btn-reset-radial-radius" style="width: auto; padding: 2px 8px; height: 26px; cursor: pointer; flex-shrink: 0;" title="Restablecer radio al 50%">50%</button>
            </div>
            <div class="prop-row" style="gap: 6px;">
              <span class="prop-label" style="width: 46px;" title="Foco de iluminación del gradiente radial">Foco</span>
              <div class="prop-coord-group">
                <div class="prop-coord-box" title="Foco X del gradiente radial (%)">
                  <span class="prop-coord-sublabel">X</span>
                  <input type="number" class="prop-coord-input" id="radial-fx" value="${Math.round((grad.fx ?? grad.cx ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
                <div class="prop-coord-box" title="Foco Y del gradiente radial (%)">
                  <span class="prop-coord-sublabel">Y</span>
                  <input type="number" class="prop-coord-input" id="radial-fy" value="${Math.round((grad.fy ?? grad.cy ?? 0.5) * 100)}" min="-100" max="200" step="5" />
                  <span class="prop-coord-sublabel">%</span>
                </div>
              </div>
              <button class="prop-input" id="btn-sync-radial-focus" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Igualar foco al centro">⟲</button>
            </div>
          </div>

          <!-- Active Stop Selector & Inspector -->
          <div class="prop-row">
            <span class="prop-label">Stop</span>
            <select class="prop-input" id="gradient-active-stop-select" style="cursor:pointer;">
              ${grad.stops.map((s, idx) => `<option value="${idx}">Parada ${idx + 1} (${Math.round(s.offset * 100)}%)</option>`).join('')}
            </select>
          </div>
          <div class="prop-row">
            <span class="prop-label">Offset %</span>
            <input type="number" class="prop-input" id="gradient-stop-offset" value="${Math.round((grad.stops[0]?.offset ?? 0) * 100)}" min="0" max="100" step="5" />
            <span class="prop-label" style="width:40px; text-align:right;">Opac%</span>
            <input type="number" class="prop-input" id="gradient-stop-opacity" value="${Math.round((grad.stops[0]?.opacity ?? 1) * 100)}" min="0" max="100" step="5" />
          </div>
          <div class="prop-row">
            <span class="prop-label">Color</span>
            <div class="color-picker-row">
              <input type="color" class="color-swatch" id="gradient-stop-color" value="${grad.stops[0]?.color ?? '#4f46e5'}" />
              <input type="text" class="prop-input" id="gradient-stop-color-hex" value="${grad.stops[0]?.color ?? '#4f46e5'}" />
            </div>
          </div>
        </div>
        `}
      </div>

      <div class="panel-section">
        <div class="panel-title">Stroke</div>
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

      <div class="panel-section">
        <div class="panel-title">Boolean Operations (Formas)</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 6px; flex-wrap: wrap;">
          <button class="btn-icon" id="btn-prop-bool-union-single" title="Weld / Union (Soldar formas)">${ToolIcons.union}</button>
          <button class="btn-icon" id="btn-prop-bool-subtract-single" title="Trim / Minus (1° corta al último)">${ToolIcons.subtract}</button>
          <button class="btn-icon" id="btn-prop-bool-intersect-single" title="Intersect (Intersección)">${ToolIcons.intersect}</button>
          <button class="btn-icon" id="btn-prop-bool-exclude-single" title="Exclusion / XOR (Exclusión)">${ToolIcons.exclude}</button>
          <button class="btn-icon" id="btn-prop-bool-combine-single" title="Boundary / Combine (Unir conservando originales)">${ToolIcons.combine}</button>
          <button class="btn-icon" id="btn-prop-bool-fragment-single" title="Divide / Fragment (Intersección y exclusión a la vez)">${ToolIcons.fragment}</button>
        </div>
      </div>
    `;

    const elX = this.container.querySelector<HTMLInputElement>('#el-x');
    const elY = this.container.querySelector<HTMLInputElement>('#el-y');
    const elW = this.container.querySelector<HTMLInputElement>('#el-w');
    const elH = this.container.querySelector<HTMLInputElement>('#el-h');
    const elFillColor = this.container.querySelector<HTMLInputElement>('#el-fill-color');
    const elFillHex = this.container.querySelector<HTMLInputElement>('#el-fill-hex');
    const elStrokeColor = this.container.querySelector<HTMLInputElement>('#el-stroke-color');
    const elStrokeHex = this.container.querySelector<HTMLInputElement>('#el-stroke-hex');
    const elStrokeWidth = this.container.querySelector<HTMLInputElement>('#el-stroke-width');
    const elStrokeDash = this.container.querySelector<HTMLInputElement>('#el-stroke-dash');
    const elStrokeCap = this.container.querySelector<HTMLSelectElement>('#el-stroke-cap');
    const elStrokeJoin = this.container.querySelector<HTMLSelectElement>('#el-stroke-join');

    if (elX && elY && box && el.vertices) {
      const applyPos = () => {
        const targetX = parseFloat(elX.value) || 0;
        const targetY = parseFloat(elY.value) || 0;
        const dx = targetX - box.x;
        const dy = targetY - box.y;
        el.vertices = el.vertices!.map((v) => ({
          ...v,
          x: v.x + dx,
          y: v.y + dy,
          handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
          handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
        }));
        this.selectionTool.updatePivotOnTranslate(dx, dy, [el]);
        this.callbacks.onUpdateElement(el);
      };
      elX.addEventListener('change', applyPos);
      elY.addEventListener('change', applyPos);
    }

    if (elW && elH && box && el.vertices) {
      const applySize = () => {
        const targetW = Math.max(parseFloat(elW.value) || 1, 1);
        const targetH = Math.max(parseFloat(elH.value) || 1, 1);
        const sx = targetW / (box.width || 1);
        const sy = targetH / (box.height || 1);
        el.vertices = el.vertices!.map((v) => ({
          ...v,
          x: box.x + (v.x - box.x) * sx,
          y: box.y + (v.y - box.y) * sy,
          handleIn: v.handleIn ? { x: box.x + (v.handleIn.x - box.x) * sx, y: box.y + (v.handleIn.y - box.y) * sy } : undefined,
          handleOut: v.handleOut ? { x: box.x + (v.handleOut.x - box.x) * sx, y: box.y + (v.handleOut.y - box.y) * sy } : undefined,
        }));
        this.selectionTool.updatePivotOnScale(box, { ...box, width: targetW, height: targetH }, [el]);
        this.callbacks.onUpdateElement(el);
      };
      elW.addEventListener('change', applySize);
      elH.addEventListener('change', applySize);
    }

    const elPivotX = this.container.querySelector<HTMLInputElement>('#el-pivot-x');
    const elPivotY = this.container.querySelector<HTMLInputElement>('#el-pivot-y');
    const btnResetPivot = this.container.querySelector<HTMLButtonElement>('#btn-reset-pivot');

    if (elPivotX && elPivotY && box) {
      const applyPivot = () => {
        const px = parseFloat(elPivotX.value);
        const py = parseFloat(elPivotY.value);
        if (!isNaN(px) && !isNaN(py)) {
          this.selectionTool.setCustomPivotForElement(el, { x: px, y: py });
          this.callbacks.onUpdateElement(el);
          this.callbacks.onRenderOverlay?.();
        }
      };
      elPivotX.addEventListener('input', applyPivot);
      elPivotY.addEventListener('input', applyPivot);
    }

    if (btnResetPivot && box) {
      btnResetPivot.addEventListener('click', () => {
        this.selectionTool.resetPivot(el);
        if (elPivotX) elPivotX.value = String(Math.round(box.cx));
        if (elPivotY) elPivotY.value = String(Math.round(box.cy));
        this.callbacks.onUpdateElement(el);
        this.callbacks.onRenderOverlay?.();
      });
    }

    /**
     * Technical Rationale (FIX-19):
     * Event listeners for dedicated Ellipse / Circle inspector controls.
     * When user modifies Center X/Y or Radius X/Y:
     * - Re-generates canonical Bézier vertices using `convertShapeToVertices('ellipse', ...)`
     *   preserving smooth symmetric curvature.
     * - Updates element attributes (`cx, cy, rx, ry`, `data-shape="ellipse"`, `d`).
     * - Dispatches `onPushUndo` and `onUpdateElement` to update canvas, DOM and metadata.
     * - Re-renders element properties so bounding box and transform numbers stay strictly aligned.
     */
    if (isEllipse && box) {
      const ellipseCxInput = this.container.querySelector<HTMLInputElement>('#ellipse-cx');
      const ellipseCyInput = this.container.querySelector<HTMLInputElement>('#ellipse-cy');
      const ellipseRxInput = this.container.querySelector<HTMLInputElement>('#ellipse-rx');
      const ellipseRyInput = this.container.querySelector<HTMLInputElement>('#ellipse-ry');
      const btnEllipseMakeCircle = this.container.querySelector<HTMLButtonElement>('#btn-ellipse-make-circle');
      const btnEllipseSwapRadii = this.container.querySelector<HTMLButtonElement>('#btn-ellipse-swap-radii');
      const btnEllipseToPath = this.container.querySelector<HTMLButtonElement>('#btn-ellipse-to-path');

      const applyEllipseGeometry = (newCx: number, newCy: number, newRx: number, newRy: number) => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        const clampedRx = Math.max(1, newRx);
        const clampedRy = Math.max(1, newRy);
        el.vertices = this.model.convertShapeToVertices('ellipse', {
          cx: newCx.toString(),
          cy: newCy.toString(),
          rx: clampedRx.toString(),
          ry: clampedRy.toString(),
        });
        el.attributes['data-shape'] = 'ellipse';
        el.attributes['cx'] = newCx.toString();
        el.attributes['cy'] = newCy.toString();
        el.attributes['rx'] = clampedRx.toString();
        el.attributes['ry'] = clampedRy.toString();
        el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
        el.attributes.d = this.model.compilePathD(el.vertices, true);

        const newBox = this.selectionTool.getBoundingBox(el);
        if (newBox) {
          this.selectionTool.updatePivotOnScale(box, newBox, [el]);
        }
        this.callbacks.onUpdateElement(el);
        this.renderElementProperties(el);
      };

      if (ellipseCxInput && ellipseCyInput) {
        const onCenterChange = () => {
          const targetCx = parseFloat(ellipseCxInput.value) || 0;
          const targetCy = parseFloat(ellipseCyInput.value) || 0;
          applyEllipseGeometry(targetCx, targetCy, ellipseRx, ellipseRy);
        };
        ellipseCxInput.addEventListener('change', onCenterChange);
        ellipseCyInput.addEventListener('change', onCenterChange);
      }

      if (ellipseRxInput && ellipseRyInput) {
        const onRadiiChange = () => {
          const targetRx = Math.max(1, parseFloat(ellipseRxInput.value) || 1);
          const targetRy = Math.max(1, parseFloat(ellipseRyInput.value) || 1);
          applyEllipseGeometry(ellipseCx, ellipseCy, targetRx, targetRy);
        };
        ellipseRxInput.addEventListener('change', onRadiiChange);
        ellipseRyInput.addEventListener('change', onRadiiChange);
      }

      if (btnEllipseMakeCircle) {
        btnEllipseMakeCircle.addEventListener('click', () => {
          const uniformR = Math.max(1, Math.round((ellipseRx + ellipseRy) / 2));
          applyEllipseGeometry(ellipseCx, ellipseCy, uniformR, uniformR);
        });
      }

      if (btnEllipseSwapRadii) {
        btnEllipseSwapRadii.addEventListener('click', () => {
          applyEllipseGeometry(ellipseCx, ellipseCy, ellipseRy, ellipseRx);
        });
      }

      if (btnEllipseToPath) {
        btnEllipseToPath.addEventListener('click', () => {
          if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
          el.attributes['data-shape'] = 'path';
          this.callbacks.onUpdateElement(el);
          this.renderElementProperties(el);
        });
      }
    }

    let activeStopIdx = 0;

    const syncActiveStopInputs = () => {
      const s = grad!.stops[activeStopIdx] || grad!.stops[0];
      if (!s) return;
      const stopSelect = this.container.querySelector<HTMLSelectElement>('#gradient-active-stop-select');
      const stopOffset = this.container.querySelector<HTMLInputElement>('#gradient-stop-offset');
      const stopOpacity = this.container.querySelector<HTMLInputElement>('#gradient-stop-opacity');
      const stopColor = this.container.querySelector<HTMLInputElement>('#gradient-stop-color');
      const stopColorHex = this.container.querySelector<HTMLInputElement>('#gradient-stop-color-hex');
      const delBtn = this.container.querySelector<HTMLButtonElement>('#btn-delete-gradient-stop');

      if (stopSelect) stopSelect.value = activeStopIdx.toString();
      if (stopOffset) stopOffset.value = Math.round(s.offset * 100).toString();
      if (stopOpacity) stopOpacity.value = Math.round((s.opacity !== undefined ? s.opacity : 1) * 100).toString();
      if (stopColor) stopColor.value = s.color || '#4f46e5';
      if (stopColorHex) stopColorHex.value = s.color || '#4f46e5';
      if (delBtn) delBtn.disabled = grad!.stops.length <= 2;
    };

    const updateGradientPreview = () => {
      const sorted = [...grad!.stops].sort((a, b) => a.offset - b.offset);
      const css = `linear-gradient(to right, ${sorted.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})`;
      const bar = this.container.querySelector<HTMLElement>('#gradient-bar-preview');
      if (bar) bar.style.background = css;

      const stopSelect = this.container.querySelector<HTMLSelectElement>('#gradient-active-stop-select');
      if (stopSelect) {
        stopSelect.innerHTML = grad!.stops
          .map((s, idx) => `<option value="${idx}" ${idx === activeStopIdx ? 'selected' : ''}>Parada ${idx + 1} (${Math.round(s.offset * 100)}%)</option>`)
          .join('');
      }
    };

    const applyFillChanges = () => {
      if (!isClosed) {
        el.attributes['fill'] = 'none';
        delete el.attributes['data-gradient'];
        this.callbacks.onUpdateElement(el);
        return;
      }
      if (fillType === 'none') {
        el.attributes['fill'] = 'none';
        delete el.attributes['data-gradient'];
      } else if (fillType === 'solid') {
        const solColor = this.container.querySelector<HTMLInputElement>('#el-fill-hex')?.value || '#4f46e5';
        el.attributes['fill'] = solColor;
        delete el.attributes['data-gradient'];
      } else {
        grad!.type = fillType;
        el.attributes['data-gradient'] = JSON.stringify(grad);
        el.attributes['fill'] = `url(#ad-grad-${el.id})`;
        updateGradientPreview();
      }
      this.callbacks.onUpdateElement(el);
    };

    const btnPropClosePath = this.container.querySelector<HTMLButtonElement>('#btn-prop-close-path');
    if (btnPropClosePath) {
      this.bindMouseDown('btn-prop-close-path', () => {
        if (this.callbacks.onClosePath) {
          this.callbacks.onClosePath();
        }
      });
    }

    const fillTypeSelect = this.container.querySelector<HTMLSelectElement>('#el-fill-type');
    const solidControls = this.container.querySelector<HTMLElement>('#fill-solid-controls');
    const gradControls = this.container.querySelector<HTMLElement>('#fill-gradient-controls');
    const angleRow = this.container.querySelector<HTMLElement>('#gradient-angle-row');
    const radialControls = this.container.querySelector<HTMLElement>('#fill-radial-controls');

    if (fillTypeSelect && isClosed) {
      fillTypeSelect.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        fillType = fillTypeSelect.value as any;
        if (solidControls) solidControls.style.display = fillType === 'solid' ? '' : 'none';
        if (gradControls) gradControls.style.display = (fillType === 'linear' || fillType === 'radial') ? '' : 'none';
        if (angleRow) angleRow.style.display = fillType === 'linear' ? '' : 'none';
        if (radialControls) radialControls.style.display = fillType === 'radial' ? '' : 'none';
        if (fillType === 'radial') {
          grad!.cx = grad!.cx ?? 0.5;
          grad!.cy = grad!.cy ?? 0.5;
          grad!.r = grad!.r ?? 0.5;
        }
        applyFillChanges();
      });
    }

    if (elFillColor && isClosed) {
      elFillColor.addEventListener('input', () => {
        if (fillType === 'solid') {
          el.attributes['fill'] = elFillColor.value;
          if (elFillHex) elFillHex.value = elFillColor.value;
          this.callbacks.onUpdateElement(el);
        }
      });
      elFillColor.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
      });
    }
    if (elFillHex && isClosed) {
      elFillHex.addEventListener('change', () => {
        if (fillType === 'solid') {
          if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
          el.attributes['fill'] = elFillHex.value;
          if (elFillColor) elFillColor.value = elFillHex.value;
          this.callbacks.onUpdateElement(el);
        }
      });
    }

    const stopSelect = this.container.querySelector<HTMLSelectElement>('#gradient-active-stop-select');
    if (stopSelect) {
      stopSelect.addEventListener('change', () => {
        activeStopIdx = parseInt(stopSelect.value, 10) || 0;
        syncActiveStopInputs();
      });
    }

    const stopOffset = this.container.querySelector<HTMLInputElement>('#gradient-stop-offset');
    if (stopOffset) {
      stopOffset.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        const pct = Math.max(0, Math.min(100, parseFloat(stopOffset.value) || 0));
        if (grad!.stops[activeStopIdx]) {
          grad!.stops[activeStopIdx].offset = pct / 100;
          applyFillChanges();
          syncActiveStopInputs();
        }
      });
    }

    const stopOpacity = this.container.querySelector<HTMLInputElement>('#gradient-stop-opacity');
    if (stopOpacity) {
      stopOpacity.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        const pct = Math.max(0, Math.min(100, parseFloat(stopOpacity.value) || 0));
        if (grad!.stops[activeStopIdx]) {
          grad!.stops[activeStopIdx].opacity = pct / 100;
          applyFillChanges();
        }
      });
    }

    const stopColor = this.container.querySelector<HTMLInputElement>('#gradient-stop-color');
    const stopColorHex = this.container.querySelector<HTMLInputElement>('#gradient-stop-color-hex');
    if (stopColor) {
      stopColor.addEventListener('input', () => {
        if (grad!.stops[activeStopIdx]) {
          grad!.stops[activeStopIdx].color = stopColor.value;
          if (stopColorHex) stopColorHex.value = stopColor.value;
          applyFillChanges();
        }
      });
      stopColor.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
      });
    }
    if (stopColorHex) {
      stopColorHex.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        if (grad!.stops[activeStopIdx]) {
          grad!.stops[activeStopIdx].color = stopColorHex.value;
          if (stopColor) stopColor.value = stopColorHex.value;
          applyFillChanges();
        }
      });
    }

    const addStopBtn = this.container.querySelector<HTMLButtonElement>('#btn-add-gradient-stop');
    if (addStopBtn) {
      addStopBtn.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        const curOffset = grad!.stops[activeStopIdx]?.offset ?? 0;
        const newOffset = Math.round(((curOffset + 1) / 2) * 100) / 100;
        grad!.stops.push({
          id: `stop_${Date.now().toString(36)}`,
          offset: Math.min(newOffset, 0.95),
          color: '#f59e0b',
          opacity: 1,
        });
        activeStopIdx = grad!.stops.length - 1;
        applyFillChanges();
        syncActiveStopInputs();
      });
    }

    const delStopBtn = this.container.querySelector<HTMLButtonElement>('#btn-delete-gradient-stop');
    if (delStopBtn) {
      delStopBtn.addEventListener('click', () => {
        if (grad!.stops.length <= 2) return;
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        grad!.stops.splice(activeStopIdx, 1);
        activeStopIdx = Math.max(0, activeStopIdx - 1);
        applyFillChanges();
        syncActiveStopInputs();
      });
    }

    const revBtn = this.container.querySelector<HTMLButtonElement>('#btn-reverse-gradient');
    if (revBtn) {
      revBtn.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        grad!.stops.forEach((s) => {
          s.offset = Math.round((1 - s.offset) * 100) / 100;
        });
        grad!.stops.sort((a, b) => a.offset - b.offset);
        applyFillChanges();
        syncActiveStopInputs();
      });
    }

    const gradAngle = this.container.querySelector<HTMLInputElement>('#gradient-angle');
    const gradAnglePreset = this.container.querySelector<HTMLSelectElement>('#gradient-angle-preset');
    if (gradAngle) {
      gradAngle.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        grad!.angle = parseFloat(gradAngle.value) || 0;
        if (gradAnglePreset) gradAnglePreset.value = gradAngle.value;
        applyFillChanges();
      });
    }
    if (gradAnglePreset) {
      gradAnglePreset.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        grad!.angle = parseFloat(gradAnglePreset.value) || 0;
        if (gradAngle) gradAngle.value = gradAnglePreset.value;
        applyFillChanges();
      });
    }

    // Radial Gradient Numeric Controls Event Listeners
    const radialCx = this.container.querySelector<HTMLInputElement>('#radial-cx');
    const radialCy = this.container.querySelector<HTMLInputElement>('#radial-cy');
    const btnResetRadialCenter = this.container.querySelector<HTMLButtonElement>('#btn-reset-radial-center');

    const updateRadialCenter = () => {
      if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
      const cxPct = parseFloat(radialCx?.value || '50') || 50;
      const cyPct = parseFloat(radialCy?.value || '50') || 50;
      const newCx = Math.round((cxPct / 100) * 1000) / 1000;
      const newCy = Math.round((cyPct / 100) * 1000) / 1000;
      if (grad!.fx === undefined || grad!.fx === grad!.cx) {
        grad!.fx = newCx;
        grad!.fy = newCy;
        if (radialFx) radialFx.value = Math.round(newCx * 100).toString();
        if (radialFy) radialFy.value = Math.round(newCy * 100).toString();
      }
      grad!.cx = newCx;
      grad!.cy = newCy;
      applyFillChanges();
    };

    if (radialCx) radialCx.addEventListener('change', updateRadialCenter);
    if (radialCy) radialCy.addEventListener('change', updateRadialCenter);
    if (btnResetRadialCenter) {
      btnResetRadialCenter.addEventListener('click', () => {
        if (radialCx) radialCx.value = '50';
        if (radialCy) radialCy.value = '50';
        updateRadialCenter();
      });
    }

    const radialR = this.container.querySelector<HTMLInputElement>('#radial-r');
    const btnResetRadialRadius = this.container.querySelector<HTMLButtonElement>('#btn-reset-radial-radius');
    if (radialR) {
      radialR.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        const rPct = Math.max(1, parseFloat(radialR.value || '50') || 50);
        grad!.r = Math.round((rPct / 100) * 1000) / 1000;
        applyFillChanges();
      });
    }
    if (btnResetRadialRadius) {
      btnResetRadialRadius.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        if (radialR) radialR.value = '50';
        grad!.r = 0.5;
        applyFillChanges();
      });
    }

    const radialFx = this.container.querySelector<HTMLInputElement>('#radial-fx');
    const radialFy = this.container.querySelector<HTMLInputElement>('#radial-fy');
    const btnSyncRadialFocus = this.container.querySelector<HTMLButtonElement>('#btn-sync-radial-focus');

    const updateRadialFocus = () => {
      if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
      const fxPct = parseFloat(radialFx?.value || '50') || 50;
      const fyPct = parseFloat(radialFy?.value || '50') || 50;
      grad!.fx = Math.round((fxPct / 100) * 1000) / 1000;
      grad!.fy = Math.round((fyPct / 100) * 1000) / 1000;
      applyFillChanges();
    };

    if (radialFx) radialFx.addEventListener('change', updateRadialFocus);
    if (radialFy) radialFy.addEventListener('change', updateRadialFocus);
    if (btnSyncRadialFocus) {
      btnSyncRadialFocus.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        grad!.fx = grad!.cx ?? 0.5;
        grad!.fy = grad!.cy ?? 0.5;
        if (radialFx) radialFx.value = Math.round((grad!.fx) * 100).toString();
        if (radialFy) radialFy.value = Math.round((grad!.fy) * 100).toString();
        applyFillChanges();
      });
    }

    if (elStrokeColor) {
      elStrokeColor.addEventListener('input', () => {
        el.attributes['stroke'] = elStrokeColor.value;
        if (elStrokeHex) elStrokeHex.value = elStrokeColor.value;
        this.callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeHex) {
      elStrokeHex.addEventListener('change', () => {
        el.attributes['stroke'] = elStrokeHex.value;
        if (elStrokeColor) elStrokeColor.value = elStrokeHex.value;
        this.callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeWidth) {
      elStrokeWidth.addEventListener('input', () => {
        el.attributes['stroke-width'] = elStrokeWidth.value;
        this.callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeDash) {
      elStrokeDash.addEventListener('change', () => {
        el.attributes['stroke-dasharray'] = elStrokeDash.value;
        this.callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeCap) {
      elStrokeCap.addEventListener('change', () => {
        el.attributes['stroke-linecap'] = elStrokeCap.value;
        this.callbacks.onUpdateElement(el);
      });
    }
    if (elStrokeJoin) {
      elStrokeJoin.addEventListener('change', () => {
        el.attributes['stroke-linejoin'] = elStrokeJoin.value;
        const miterContainer = this.container.querySelector<HTMLElement>('#container-stroke-miterlimit');
        if (miterContainer) {
          miterContainer.style.display = elStrokeJoin.value === 'miter' ? 'flex' : 'none';
        }
        this.callbacks.onUpdateElement(el);
      });
    }

    /**
     * ARCHITECTURAL RATIONALE: Interactive Miter Limit Angle (° Degree) Input
     *
     * Why degrees instead of dimensionless ratio:
     * According to W3C SVG specifications, stroke-miterlimit is a mathematical ratio m = 1 / sin(theta / 2).
     * Asking the user to enter abstract numbers (like 4, 10, 14.1) is completely non-intuitive.
     * Expressing this control in angular degrees (°):
     * - Allows immediate visual mental modeling: a corner with angle theta < miterAngleDeg is beveled;
     *   corners with theta >= miterAngleDeg retain sharp miter points.
     * - Positioned immediately adjacent to the 'Join' select input for zero visual search cost.
     * - Live-syncs to SVG stroke-miterlimit attribute bidirectionally without loss of precision.
     */
    const elStrokeMiterAngle = this.container.querySelector<HTMLInputElement>('#el-stroke-miter-angle');
    if (elStrokeMiterAngle) {
      const applyMiterAngle = () => {
        const deg = Math.max(1, Math.min(170, parseFloat(elStrokeMiterAngle.value) || 29));
        const limit = degreesToMiterLimit(deg);
        el.attributes['stroke-miterlimit'] = limit.toString();
        this.callbacks.onUpdateElement(el);
      };
      elStrokeMiterAngle.addEventListener('input', applyMiterAngle);
      elStrokeMiterAngle.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        applyMiterAngle();
      });
    }

    const elMarkerStart = this.container.querySelector<HTMLSelectElement>('#el-marker-start');
    const elMarkerMid = this.container.querySelector<HTMLSelectElement>('#el-marker-mid');
    const elMarkerEnd = this.container.querySelector<HTMLSelectElement>('#el-marker-end');

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
        this.callbacks.onUpdateElement(el);
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
        this.callbacks.onUpdateElement(el);
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
        this.callbacks.onUpdateElement(el);
      });
    }

    this.bindMouseDown('btn-stroke-to-path', () => {
      if (this.callbacks.onStrokeToPath) this.callbacks.onStrokeToPath();
    });

    this.bindMouseDown('btn-prop-bool-union-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('union'));
    this.bindMouseDown('btn-prop-bool-subtract-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('subtract'));
    this.bindMouseDown('btn-prop-bool-intersect-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('intersect'));
    this.bindMouseDown('btn-prop-bool-exclude-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('exclude'));
    this.bindMouseDown('btn-prop-bool-combine-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('combine'));
    this.bindMouseDown('btn-prop-bool-fragment-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('fragment'));

    // Effects (Sombras) Event Listeners
    const shadowDropEnable = this.container.querySelector<HTMLInputElement>('#shadow-drop-enable');
    const shadowDropControls = this.container.querySelector<HTMLElement>('#shadow-drop-controls');
    const shadowDropDx = this.container.querySelector<HTMLInputElement>('#shadow-drop-dx');
    const shadowDropDy = this.container.querySelector<HTMLInputElement>('#shadow-drop-dy');
    const shadowDropBlur = this.container.querySelector<HTMLInputElement>('#shadow-drop-blur');
    const shadowDropOpacity = this.container.querySelector<HTMLInputElement>('#shadow-drop-opacity');
    const shadowDropColor = this.container.querySelector<HTMLInputElement>('#shadow-drop-color');
    const shadowDropColorHex = this.container.querySelector<HTMLInputElement>('#shadow-drop-color-hex');

    const shadowInnerEnable = this.container.querySelector<HTMLInputElement>('#shadow-inner-enable');
    const shadowInnerControls = this.container.querySelector<HTMLElement>('#shadow-inner-controls');
    const shadowInnerDx = this.container.querySelector<HTMLInputElement>('#shadow-inner-dx');
    const shadowInnerDy = this.container.querySelector<HTMLInputElement>('#shadow-inner-dy');
    const shadowInnerBlur = this.container.querySelector<HTMLInputElement>('#shadow-inner-blur');
    const shadowInnerOpacity = this.container.querySelector<HTMLInputElement>('#shadow-inner-opacity');
    const shadowInnerColor = this.container.querySelector<HTMLInputElement>('#shadow-inner-color');
    const shadowInnerColorHex = this.container.querySelector<HTMLInputElement>('#shadow-inner-color-hex');

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
      this.callbacks.onUpdateElement(el);
    };

    if (shadowDropEnable && shadowDropControls) {
      shadowDropEnable.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        ds.enabled = shadowDropEnable.checked;
        shadowDropControls.style.display = ds.enabled ? '' : 'none';
        applyShadowChanges();
      });
    }

    if (shadowDropDx) {
      shadowDropDx.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        ds.dx = parseFloat(shadowDropDx.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowDropDy) {
      shadowDropDy.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        ds.dy = parseFloat(shadowDropDy.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowDropBlur) {
      shadowDropBlur.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        ds.blur = Math.max(0, parseFloat(shadowDropBlur.value) || 0);
        applyShadowChanges();
      });
    }
    if (shadowDropOpacity) {
      shadowDropOpacity.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
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
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
      });
    }
    if (shadowDropColorHex) {
      shadowDropColorHex.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        ds.color = shadowDropColorHex.value;
        if (shadowDropColor) shadowDropColor.value = shadowDropColorHex.value;
        applyShadowChanges();
      });
    }

    // Inner Shadow listeners
    if (shadowInnerEnable && shadowInnerControls) {
      shadowInnerEnable.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        is.enabled = shadowInnerEnable.checked;
        shadowInnerControls.style.display = is.enabled ? '' : 'none';
        applyShadowChanges();
      });
    }
    if (shadowInnerDx) {
      shadowInnerDx.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        is.dx = parseFloat(shadowInnerDx.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowInnerDy) {
      shadowInnerDy.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        is.dy = parseFloat(shadowInnerDy.value) || 0;
        applyShadowChanges();
      });
    }
    if (shadowInnerBlur) {
      shadowInnerBlur.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        is.blur = Math.max(0, parseFloat(shadowInnerBlur.value) || 0);
        applyShadowChanges();
      });
    }
    if (shadowInnerOpacity) {
      shadowInnerOpacity.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
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
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
      });
    }
    if (shadowInnerColorHex) {
      shadowInnerColorHex.addEventListener('change', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        is.color = shadowInnerColorHex.value;
        if (shadowInnerColor) shadowInnerColor.value = shadowInnerColorHex.value;
        applyShadowChanges();
      });
    }
  }

  // Render Node Properties for single selected vertex
  private renderNodeProperties(el: VectorElement, v: PathVertex): void {
    const isSharp = v.nodeType === 'sharp' || (!v.handleIn && !v.handleOut);
    const isClosed =
      el.isClosed ??
      (!el.tagName ||
        ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName) ||
        (el.attributes.d ? /z/i.test(el.attributes.d) : false));

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Vertex Coordinates</div>
        <div class="prop-row">
          <span class="prop-label">Position X</span>
          <input type="number" class="prop-input" id="node-pos-x" value="${Math.round(v.x)}" readonly />
        </div>
        <div class="prop-row">
          <span class="prop-label">Position Y</span>
          <input type="number" class="prop-input" id="node-pos-y" value="${Math.round(v.y)}" readonly />
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Node Type</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 8px;">
          <button class="btn-icon ${isSharp ? 'active' : ''}" id="btn-node-sharp" title="Sin tiradores (Cúspide / Recto)">
            ${ToolIcons.nodeSharp}
          </button>
          <button class="btn-icon ${!isSharp && v.nodeType === 'asymmetric' ? 'active' : ''}" id="btn-node-asym" title="Asymmetric Node (Independent Handles)">
            ${ToolIcons.nodeAsymmetric}
          </button>
          <button class="btn-icon ${!isSharp && v.nodeType === 'smooth' ? 'active' : ''}" id="btn-node-smooth" title="Uniform / Smooth Node">
            ${ToolIcons.nodeSmooth}
          </button>
          <button class="btn-icon ${!isSharp && v.nodeType === 'symmetric' ? 'active' : ''}" id="btn-node-sym" title="Symmetric Node">
            ${ToolIcons.nodeSymmetric}
          </button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Path &amp; Node Actions</div>
        <div class="prop-row" style="flex-direction:column; gap:6px;">
          ${!isClosed ? `
            <button class="prop-input" id="btn-close-curve" style="cursor:pointer; background:var(--accent-color); color:#fff; text-align:center; font-weight:600;" title="Auto-Cerrar trazado uniendo extremos con comando Z">
              ⟳ Auto-Cerrar Curva (Z)
            </button>
          ` : `
            <div style="font-size:11px; color:var(--text-muted); text-align:center; padding: 3px 0;">✓ Contorno cerrado (Z)</div>
          `}
          <button class="prop-input" id="btn-split-node" style="cursor:pointer; background:var(--bg-active); text-align:center;">
            ${ToolIcons.splitNode} Split Node into 2 Vertices
          </button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Segment Conversion</div>
        <div class="prop-row" style="display:flex; gap:6px;">
          <button class="prop-input" id="btn-segment-to-line" style="cursor:pointer; background:var(--bg-active); text-align:center; flex:1;" title="Convertir tramo a recta pura (L)">
            ― A Recta
          </button>
          <button class="prop-input" id="btn-segment-to-curve" style="cursor:pointer; background:var(--bg-active); text-align:center; flex:1;" title="Convertir tramo a curva Bézier (C)">
            ∿ A Curva
          </button>
        </div>
      </div>
    `;

    // mousedown + preventDefault: prevents focus stealing / blur from canvas when clicking panel buttons
    this.bindMouseDown('btn-node-sharp', () => this.callbacks.onNodeTypeChange('sharp'));
    this.bindMouseDown('btn-node-asym', () => this.callbacks.onNodeTypeChange('asymmetric'));
    this.bindMouseDown('btn-node-smooth', () => this.callbacks.onNodeTypeChange('smooth'));
    this.bindMouseDown('btn-node-sym', () => this.callbacks.onNodeTypeChange('symmetric'));
    this.bindMouseDown('btn-close-curve', () => {
      if (this.callbacks.onClosePath) this.callbacks.onClosePath();
    });
    this.bindMouseDown('btn-split-node', () => this.callbacks.onSplitNode());
    this.bindMouseDown('btn-segment-to-line', () => {
      if (this.callbacks.onConvertSegmentToLine) this.callbacks.onConvertSegmentToLine();
    });
    this.bindMouseDown('btn-segment-to-curve', () => {
      if (this.callbacks.onConvertSegmentToCurve) this.callbacks.onConvertSegmentToCurve();
    });
  }

  /**
   * ARCHITECTURAL RATIONALE: Focus Preservation & Event Propagation Isolation
   * Why mousedown + preventDefault + stopPropagation is required:
   * 1. Standard HTML button 'click' events fire AFTER 'pointerdown' and 'mousedown'.
   * 2. In browser environments (and VS Code webviews), clicking an element steals focus from the
   *    active SVG canvas or focused inputs, firing unintended blur events.
   * 3. Furthermore, click events bubble up to container wrappers. In AntiDraw, bubbling to
   *    #canvas-wrapper or #canvas-scroll-area would trigger canvas deselect or pan/selection routines.
   * 4. Calling e.preventDefault() on 'mousedown' suppresses document-level focus switching while
   *    e.stopPropagation() prevents the event from reaching canvas pointer listeners.
   */
  private bindMouseDown(id: string, fn: () => void): void {
    const el = this.container.querySelector(`#${id}`);
    if (el) {
      el.addEventListener('mousedown', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    }
  }
}
