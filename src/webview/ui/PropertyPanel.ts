import { VectorModel, VectorElement, PathVertex, NodeType, DropShadowConfig, InnerShadowConfig, GradientConfig, GradientStop, RectCorners } from '../engine/VectorModel.js';
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
  /**
   * Converts a parametric primitive to freeform Bézier curves (Ctrl+Q).
   */
  onConvertToCurves?: (el: VectorElement) => void;
}

export { ViewBoxPreset, VIEWBOX_PRESETS } from './inspectors/CanvasInspector.js';
export { miterLimitToDegrees, degreesToMiterLimit } from './inspectors/AppearanceInspector.js';
import { CanvasInspector } from './inspectors/CanvasInspector.js';
import { RulerGuideInspector } from './inspectors/RulerGuideInspector.js';
import { GeometryInspector } from './inspectors/GeometryInspector.js';
import { AppearanceInspector, miterLimitToDegrees, degreesToMiterLimit } from './inspectors/AppearanceInspector.js';
import { EffectsInspector } from './inspectors/EffectsInspector.js';

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
  public currentPanelMode: 'canvas' | 'element' | 'node' | 'pen' | 'polyline' | 'multi' | 'ruler' | 'guide' | 'shape' | null = null;

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
    RulerGuideInspector.renderRulerSettings(
      config,
      this.container,
      this.model,
      this.gridAlignmentMode,
      this.grids,
      this.guides,
      this.callbacks,
      (updatedConfig?: RulerConfig, updatedMode?: GridAlignmentMode) => {
        if (updatedConfig) this.activeRulerConfig = updatedConfig;
        if (updatedMode) this.gridAlignmentMode = updatedMode;
        this.renderRulerProperties(this.activeRulerConfig || config);
      }
    );
  }

  // Render Guide Line Properties
  private renderGuideProperties(guide: GuideLine): void {
    RulerGuideInspector.renderGuideSettings(guide, this.container, this.callbacks);
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
          <span class="prop-label">Modo</span>
          <div style="display:flex; gap:4px; flex:1;">
            <button class="prop-input" id="btn-multi-mode-transform" style="flex:1; cursor:pointer; font-weight:600; ${this.selectionTool.selectionMode === 'transform' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Mover y Redimensionar: muestra tiradores de escala y anclaje magnético por proximidad">⤢ Escalar</button>
            <button class="prop-input" id="btn-multi-mode-rotate" style="flex:1; cursor:pointer; font-weight:600; ${this.selectionTool.selectionMode === 'rotate' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Modo Rotación: muestra tiradores de giro y permite reubicar libremente el centro de rotación">↻ Rotar</button>
          </div>
        </div>
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

    const btnMultiModeTransform = this.container.querySelector<HTMLButtonElement>('#btn-multi-mode-transform');
    const btnMultiModeRotate = this.container.querySelector<HTMLButtonElement>('#btn-multi-mode-rotate');
    btnMultiModeTransform?.addEventListener('click', () => {
      this.selectionTool.selectionMode = 'transform';
      this.callbacks.onRenderOverlay?.();
      this.renderMultiElementProperties(elements);
    });
    btnMultiModeRotate?.addEventListener('click', () => {
      this.selectionTool.selectionMode = 'rotate';
      this.callbacks.onRenderOverlay?.();
      this.renderMultiElementProperties(elements);
    });
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
    CanvasInspector.render(
      this.container,
      this.model,
      this.gridAlignmentMode,
      this.callbacks,
      () => {
        this.renderCanvasProperties();
      }
    );
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
    const ellipseType = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
    const ellipseStartAngle = Math.round(parseFloat(el.attributes['data-start-angle'] || '0'));
    const ellipseEndAngle = Math.round(parseFloat(el.attributes['data-end-angle'] || '360'));

    const isRect = this.model.isRect(el);
    const rectCorners = this.model.getRectCorners(el, w, h);

    const isLine = this.model.isLine(el);
    const isPolyline = this.model.isPolyline(el);
    const isPolygon = this.model.isPolygon(el);
    const lineX1 = parseFloat(el.attributes.x1 || (el.vertices && el.vertices[0] ? el.vertices[0].x.toString() : '0'));
    const lineY1 = parseFloat(el.attributes.y1 || (el.vertices && el.vertices[0] ? el.vertices[0].y.toString() : '0'));
    const lineX2 = parseFloat(el.attributes.x2 || (el.vertices && el.vertices[1] ? el.vertices[1].x.toString() : '100'));
    const lineY2 = parseFloat(el.attributes.y2 || (el.vertices && el.vertices[1] ? el.vertices[1].y.toString() : '100'));
    const lineLength = Math.round(Math.hypot(lineX2 - lineX1, lineY2 - lineY1) * 10) / 10;
    const lineAngle = Math.round((Math.atan2(lineY2 - lineY1, lineX2 - lineX1) * 180) / Math.PI);

    const circleR = parseFloat(el.attributes.r || (el.attributes.rx || (w / 2).toString()));
    const circleCx = parseFloat(el.attributes.cx || (x + w / 2).toString());
    const circleCy = parseFloat(el.attributes.cy || (y + h / 2).toString());

    // Inverse Primitive Recognition (FEAT-05):
    // If element is a pure path and not currently parametric, detect whether its vertices
    // conform to canonical native SVG primitives (line, polyline, polygon, rect, circle, ellipse).
    const detectedPrimitive = !this.model.isParametricElement(el) && el.tagName === 'path'
      ? this.model.detectPrimitiveFromPath(el)
      : null;

    this.container.innerHTML = `
      ${GeometryInspector.renderHtml(el, this.model, this.selectionTool, box, pivot, isClosed, detectedPrimitive)}

      ${isEllipse ? `
      <!-- Ellipse / Circle Geometry Controls (FIX-19 & FEAT-02) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Elipse / Círculo</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${ellipseType === 'pie' ? '◔ Tarta' : ellipseType === 'arc' ? '◜ Arco' : isCircle ? '● Círculo' : '⬭ Elipse'}
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
        <div class="prop-row" style="gap: 4px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="Tipo de primitiva: elipse completa, sector cerrado de tarta o arco perimetral abierto">Modo</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-ellipse-mode-full" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${ellipseType === 'ellipse' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Elipse / Círculo completo (360°)">Elipse</button>
            <button class="prop-input" id="btn-ellipse-mode-pie" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${ellipseType === 'pie' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Sector o porción de tarta cerrada con centro y radios (Pie)">Tarta</button>
            <button class="prop-input" id="btn-ellipse-mode-arc" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${ellipseType === 'arc' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Arco perimetral abierto sin relleno (Arc)">Arco</button>
          </div>
        </div>
        <div id="ellipse-angles-container" style="${ellipseType === 'ellipse' ? 'display:none;' : 'display:flex;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Ángulos inicial y final de corte">Ángulo</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Ángulo inicial en grados (°)">
                <span class="prop-coord-sublabel">Ini</span>
                <input type="number" class="prop-coord-input" id="ellipse-start-angle" value="${ellipseStartAngle}" min="0" max="360" step="5" />
                <span class="prop-coord-sublabel">°</span>
              </div>
              <div class="prop-coord-box" title="Ángulo final en grados (°)">
                <span class="prop-coord-sublabel">Fin</span>
                <input type="number" class="prop-coord-input" id="ellipse-end-angle" value="${ellipseEndAngle}" min="0" max="360" step="5" />
                <span class="prop-coord-sublabel">°</span>
              </div>
            </div>
            <button class="prop-input" id="btn-ellipse-invert-angles" style="width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" title="Invertir sector angular">⇄</button>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-ellipse-swap-radii" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Intercambiar radio horizontal y vertical (Rotar 90°)">⇄ Rotar 90°</button>
          <button class="prop-input" id="btn-ellipse-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curvas Bézier independientes">Convertir a Curvas</button>
        </div>
      </div>
      ` : ''}

      ${isRect ? `
      <!-- Rectangle Geometry & Advanced Corner Radii Controls (FEAT-03) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Rectángulo</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${rectCorners.mode === 'uniform' ? '⬭ Uniforme' : '◳ Individual'}
          </span>
        </div>

        <div class="prop-row" style="gap: 4px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="Modo de curvatura de esquinas">Modo</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-rect-mode-uniform" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.mode === 'uniform' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Todas las esquinas comparten el mismo radio">Uniforme</button>
            <button class="prop-input" id="btn-rect-mode-independent" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.mode === 'independent' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Configurar radios individuales por esquina (TL, TR, BR, BL)">Individual</button>
          </div>
        </div>

        <div class="prop-row" style="gap: 4px; margin-top: 4px;">
          <span class="prop-label" style="width: 46px;" title="Unidad de medida: píxeles (px) o porcentaje (%)">Unidad</span>
          <div style="display:flex; gap:3px; flex:1;">
            <button class="prop-input" id="btn-rect-unit-px" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.unit === 'px' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Radio en píxeles absolutos (px)">px</button>
            <button class="prop-input" id="btn-rect-unit-pct" style="flex:1; cursor:pointer; font-size:10px; font-weight:600; ${rectCorners.unit === '%' ? 'background:var(--accent-color); color:#ffffff;' : ''}" title="Radio en porcentaje (%)">%</button>
          </div>
        </div>

        <div id="rect-uniform-container" style="${rectCorners.mode === 'uniform' ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Radio de curvatura para todas las esquinas">Radio</span>
            <div class="prop-coord-box" style="flex:1;">
              <span class="prop-coord-sublabel">R</span>
              <input type="number" class="prop-coord-input" id="rect-uniform-radius" value="${rectCorners.tl}" min="0" max="${rectCorners.unit === '%' ? 50 : Math.round(Math.min(w, h) / 2)}" step="1" />
              <span class="prop-coord-sublabel">${rectCorners.unit}</span>
            </div>
          </div>
          <div class="prop-row" style="gap: 3px;">
            <button class="prop-input" id="btn-rect-preset-0" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Esquinas rectas (0)">0</button>
            <button class="prop-input" id="btn-rect-preset-5" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Radio 5">5</button>
            <button class="prop-input" id="btn-rect-preset-10" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Radio 10">10</button>
            <button class="prop-input" id="btn-rect-preset-20" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Radio 20">20</button>
            <button class="prop-input" id="btn-rect-preset-pill" style="flex:1.4; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Redondeo máximo (Píldora)">Píldora</button>
          </div>
        </div>

        <div id="rect-independent-container" style="${rectCorners.mode === 'independent' ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:6px; margin-top:6px;">
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Esquinas superiores: Izquierda (TL) y Derecha (TR)">Arriba</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Esquina Superior Izquierda (Top-Left)">
                <span class="prop-coord-sublabel">TL</span>
                <input type="number" class="prop-coord-input" id="rect-corner-tl" value="${rectCorners.tl}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
              <div class="prop-coord-box" title="Esquina Superior Derecha (Top-Right)">
                <span class="prop-coord-sublabel">TR</span>
                <input type="number" class="prop-coord-input" id="rect-corner-tr" value="${rectCorners.tr}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
            </div>
          </div>
          <div class="prop-row" style="gap: 6px;">
            <span class="prop-label" style="width: 46px;" title="Esquinas inferiores: Izquierda (BL) y Derecha (BR)">Abajo</span>
            <div class="prop-coord-group">
              <div class="prop-coord-box" title="Esquina Inferior Izquierda (Bottom-Left)">
                <span class="prop-coord-sublabel">BL</span>
                <input type="number" class="prop-coord-input" id="rect-corner-bl" value="${rectCorners.bl}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
              <div class="prop-coord-box" title="Esquina Inferior Derecha (Bottom-Right)">
                <span class="prop-coord-sublabel">BR</span>
                <input type="number" class="prop-coord-input" id="rect-corner-br" value="${rectCorners.br}" min="0" step="1" />
                <span class="prop-coord-sublabel">${rectCorners.unit}</span>
              </div>
            </div>
          </div>
          <div class="prop-row" style="gap: 4px;">
            <button class="prop-input" id="btn-rect-sync-tl" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Copiar el valor de TL a todas las esquinas">Copiar TL</button>
            <button class="prop-input" id="btn-rect-invert-corners" style="flex:1; cursor:pointer; font-size:9px; height:22px; padding:0;" title="Intercambiar / Alternar radios de esquinas opuestas">⇄ Alternar</button>
          </div>
        </div>

        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-rect-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curvas Bézier independientes (Ctrl+Q)">Convertir a Curvas</button>
        </div>
      </div>
      ` : ''}

      ${isLine ? `
      <!-- Line Geometry Controls (FEAT-04) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Línea Recta (&lt;line&gt;)</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${lineLength}px (${lineAngle}°)
          </span>
        </div>
        <div class="prop-row" style="gap: 6px;">
          <span class="prop-label" style="width: 46px;" title="Punto inicial (x1, y1)">Inicio</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X1 de inicio">
              <span class="prop-coord-sublabel">X1</span>
              <input type="number" class="prop-coord-input" id="line-x1" value="${Math.round(lineX1)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y1 de inicio">
              <span class="prop-coord-sublabel">Y1</span>
              <input type="number" class="prop-coord-input" id="line-y1" value="${Math.round(lineY1)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <span class="prop-label" style="width: 46px;" title="Punto final (x2, y2)">Fin</span>
          <div class="prop-coord-group">
            <div class="prop-coord-box" title="Coordenada X2 de final">
              <span class="prop-coord-sublabel">X2</span>
              <input type="number" class="prop-coord-input" id="line-x2" value="${Math.round(lineX2)}" />
            </div>
            <div class="prop-coord-box" title="Coordenada Y2 de final">
              <span class="prop-coord-sublabel">Y2</span>
              <input type="number" class="prop-coord-input" id="line-y2" value="${Math.round(lineY2)}" />
            </div>
          </div>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-line-reverse" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Invertir extremos (intercambiar X1/Y1 con X2/Y2)">⇄ Invertir Puntos</button>
          <button class="prop-input" id="btn-line-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a curva Bézier independiente (Ctrl+Q)">Convertir a Curvas</button>
        </div>
      </div>
      ` : ''}

      ${isPolyline || isPolygon ? `
      <!-- Polyline / Polygon Geometry Controls (FEAT-04) -->
      <div class="panel-section">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${isPolygon ? 'Polígono (&lt;polygon&gt;)' : 'Polilínea (&lt;polyline&gt;)'}</span>
          <span style="font-size:10px; color:var(--accent-color); font-weight:600; text-transform:none;">
            ${el.vertices ? el.vertices.length : 0} vértices
          </span>
        </div>
        <div class="prop-row" style="margin-top: 4px;">
          <span class="prop-label">Puntos</span>
          <span style="font-size:11px; color:var(--text-muted); flex:1; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${el.attributes.points || ''}">
            ${el.attributes.points || '0 puntos'}
          </span>
        </div>
        <div class="prop-row" style="gap: 6px; margin-top: 6px;">
          <button class="prop-input" id="btn-poly-to-path" style="flex: 1; cursor: pointer; height: 24px; font-size: 10px; text-align: center;" title="Convertir a trazado con curvas Bézier libres (Ctrl+Q)">Convertir a Curvas</button>
        </div>
      </div>
      ` : ''}

      ${AppearanceInspector.renderHtml(
        el,
        isClosed,
        fill,
        stroke,
        strokeWidth,
        strokeDash,
        strokeLinecap,
        strokeLinejoin,
        miterAngleDeg,
        markerStart,
        markerMid,
        markerEnd,
        grad,
        fillType,
        gradientCss
      )}

      ${EffectsInspector.renderHtml(ds, is)}

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

    GeometryInspector.bindEvents(
      this.container,
      el,
      this.model,
      this.selectionTool,
      box,
      this.callbacks,
      () => this.renderElementProperties(el),
      detectedPrimitive
    );

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

      const applyEllipseGeometry = (
        newCx: number,
        newCy: number,
        newRx: number,
        newRy: number,
        newType: 'ellipse' | 'pie' | 'arc' = ellipseType,
        newStart: number = ellipseStartAngle,
        newEnd: number = ellipseEndAngle
      ) => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        const clampedRx = Math.max(1, newRx);
        const clampedRy = Math.max(1, newRy);
        el.attributes['data-shape'] = 'ellipse';
        el.attributes['cx'] = newCx.toString();
        el.attributes['cy'] = newCy.toString();
        el.attributes['rx'] = clampedRx.toString();
        el.attributes['ry'] = clampedRy.toString();
        el.attributes['data-ellipse-type'] = newType;
        el.attributes['data-start-angle'] = newStart.toString();
        el.attributes['data-end-angle'] = newEnd.toString();
        el.isClosed = newType !== 'arc';

        if (newType === 'arc') {
          el.attributes.fill = 'none';
          delete el.attributes['data-gradient'];
        } else if (newType === 'pie' || newType === 'ellipse') {
          if (!el.attributes.fill || el.attributes.fill === 'none') {
            el.attributes.fill = '#6366f1';
          }
        }

        el.vertices = this.model.convertEllipseToVertices(
          newCx,
          newCy,
          clampedRx,
          clampedRy,
          newType,
          newStart,
          newEnd
        );
        el.attributes.d = this.model.compileEllipseD(
          newCx,
          newCy,
          clampedRx,
          clampedRy,
          newType,
          newStart,
          newEnd
        );
        el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');

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

      const btnModeFull = this.container.querySelector<HTMLButtonElement>('#btn-ellipse-mode-full');
      const btnModePie = this.container.querySelector<HTMLButtonElement>('#btn-ellipse-mode-pie');
      const btnModeArc = this.container.querySelector<HTMLButtonElement>('#btn-ellipse-mode-arc');
      const inputStartAngle = this.container.querySelector<HTMLInputElement>('#ellipse-start-angle');
      const inputEndAngle = this.container.querySelector<HTMLInputElement>('#ellipse-end-angle');
      const btnInvertAngles = this.container.querySelector<HTMLButtonElement>('#btn-ellipse-invert-angles');

      btnModeFull?.addEventListener('click', () => {
        applyEllipseGeometry(ellipseCx, ellipseCy, ellipseRx, ellipseRy, 'ellipse', 0, 360);
      });

      btnModePie?.addEventListener('click', () => {
        const s = ellipseStartAngle;
        const e = (ellipseEndAngle === 360 && s === 0) ? 270 : ellipseEndAngle;
        applyEllipseGeometry(ellipseCx, ellipseCy, ellipseRx, ellipseRy, 'pie', s, e);
      });

      btnModeArc?.addEventListener('click', () => {
        const s = ellipseStartAngle;
        const e = (ellipseEndAngle === 360 && s === 0) ? 270 : ellipseEndAngle;
        applyEllipseGeometry(ellipseCx, ellipseCy, ellipseRx, ellipseRy, 'arc', s, e);
      });

      if (inputStartAngle && inputEndAngle) {
        const onAnglesChange = () => {
          let s = parseFloat(inputStartAngle.value) || 0;
          let e = parseFloat(inputEndAngle.value) || 0;
          s = ((s % 360) + 360) % 360;
          e = ((e % 360) + 360) % 360;
          if (s === e) e = (s + 360);
          applyEllipseGeometry(ellipseCx, ellipseCy, ellipseRx, ellipseRy, ellipseType === 'ellipse' ? 'pie' : ellipseType, s, e);
        };
        inputStartAngle.addEventListener('change', onAnglesChange);
        inputEndAngle.addEventListener('change', onAnglesChange);
      }

      btnInvertAngles?.addEventListener('click', () => {
        applyEllipseGeometry(ellipseCx, ellipseCy, ellipseRx, ellipseRy, ellipseType === 'ellipse' ? 'pie' : ellipseType, ellipseEndAngle, ellipseStartAngle);
      });

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
          this.model.convertToCurves(el);
          if (this.callbacks.onConvertToCurves) {
            this.callbacks.onConvertToCurves(el);
          } else {
            this.callbacks.onUpdateElement(el);
            this.renderElementProperties(el);
          }
        });
      }
    }

    /**
     * ARCHITECTURAL RATIONALE: Interactive Parametric Rect Corner Inspector (FEAT-03)
     * Provides live bidirectional synchronization between the UI inputs (uniform radius, 4-corner inputs,
     * unit toggle px/%, mode toggle uniform/individual, quick presets) and the vector element model.
     */
    if (isRect && box) {
      const applyRectGeometry = (
        newCorners: RectCorners
      ) => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();

        const rx = parseFloat(el.attributes.x || '0');
        const ry = parseFloat(el.attributes.y || '0');
        const rw = parseFloat(el.attributes.width || '100');
        const rh = parseFloat(el.attributes.height || '100');

        el.attributes['data-corner-mode'] = newCorners.mode;
        el.attributes['data-corner-unit'] = newCorners.unit;
        el.attributes['data-corner-tl'] = newCorners.tl.toString();
        el.attributes['data-corner-tr'] = newCorners.tr.toString();
        el.attributes['data-corner-br'] = newCorners.br.toString();
        el.attributes['data-corner-bl'] = newCorners.bl.toString();
        el.attributes['data-corner-radius'] = `${newCorners.tl},${newCorners.tr},${newCorners.br},${newCorners.bl}`;

        if (newCorners.mode === 'uniform') {
          el.attributes['rx'] = newCorners.unit === '%' ? `${newCorners.tl}%` : newCorners.tl.toString();
          el.attributes['ry'] = el.attributes['rx'];
        } else {
          delete el.attributes['rx'];
          delete el.attributes['ry'];
        }

        const eff = this.model.calculateEffectiveCorners(rw, rh, newCorners);
        el.vertices = this.model.convertRectToVertices(rx, ry, rw, rh, eff.tl, eff.tr, eff.br, eff.bl);
        el.attributes.d = this.model.compilePathD(el.vertices, true);
        el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');

        this.callbacks.onUpdateElement(el);
        this.renderElementProperties(el);
      };

      const btnModeUniform = this.container.querySelector<HTMLButtonElement>('#btn-rect-mode-uniform');
      const btnModeIndependent = this.container.querySelector<HTMLButtonElement>('#btn-rect-mode-independent');
      const btnUnitPx = this.container.querySelector<HTMLButtonElement>('#btn-rect-unit-px');
      const btnUnitPct = this.container.querySelector<HTMLButtonElement>('#btn-rect-unit-pct');
      const inputUniformRadius = this.container.querySelector<HTMLInputElement>('#rect-uniform-radius');
      const inputTL = this.container.querySelector<HTMLInputElement>('#rect-corner-tl');
      const inputTR = this.container.querySelector<HTMLInputElement>('#rect-corner-tr');
      const inputBR = this.container.querySelector<HTMLInputElement>('#rect-corner-br');
      const inputBL = this.container.querySelector<HTMLInputElement>('#rect-corner-bl');
      const btnPreset0 = this.container.querySelector<HTMLButtonElement>('#btn-rect-preset-0');
      const btnPreset5 = this.container.querySelector<HTMLButtonElement>('#btn-rect-preset-5');
      const btnPreset10 = this.container.querySelector<HTMLButtonElement>('#btn-rect-preset-10');
      const btnPreset20 = this.container.querySelector<HTMLButtonElement>('#btn-rect-preset-20');
      const btnPresetPill = this.container.querySelector<HTMLButtonElement>('#btn-rect-preset-pill');
      const btnSyncTL = this.container.querySelector<HTMLButtonElement>('#btn-rect-sync-tl');
      const btnInvertCorners = this.container.querySelector<HTMLButtonElement>('#btn-rect-invert-corners');
      const btnRectToPath = this.container.querySelector<HTMLButtonElement>('#btn-rect-to-path');

      btnModeUniform?.addEventListener('click', () => {
        applyRectGeometry({
          ...rectCorners,
          mode: 'uniform',
          tr: rectCorners.tl,
          br: rectCorners.tl,
          bl: rectCorners.tl,
        });
      });

      btnModeIndependent?.addEventListener('click', () => {
        applyRectGeometry({
          ...rectCorners,
          mode: 'independent',
        });
      });

      btnUnitPx?.addEventListener('click', () => {
        if (rectCorners.unit === 'px') return;
        const maxR = Math.min(w, h) / 2;
        const toPx = (pct: number) => Math.round((pct / 50) * maxR);
        applyRectGeometry({
          ...rectCorners,
          unit: 'px',
          tl: toPx(rectCorners.tl),
          tr: toPx(rectCorners.tr),
          br: toPx(rectCorners.br),
          bl: toPx(rectCorners.bl),
        });
      });

      btnUnitPct?.addEventListener('click', () => {
        if (rectCorners.unit === '%') return;
        const maxR = Math.min(w, h) / 2;
        const toPct = (pxVal: number) => Math.min(50, Math.round((pxVal / (maxR || 1)) * 50));
        applyRectGeometry({
          ...rectCorners,
          unit: '%',
          tl: toPct(rectCorners.tl),
          tr: toPct(rectCorners.tr),
          br: toPct(rectCorners.br),
          bl: toPct(rectCorners.bl),
        });
      });

      inputUniformRadius?.addEventListener('change', () => {
        const val = Math.max(0, parseFloat(inputUniformRadius.value) || 0);
        applyRectGeometry({
          ...rectCorners,
          tl: val,
          tr: val,
          br: val,
          bl: val,
        });
      });

      const onIndependentCornersChange = () => {
        const tl = Math.max(0, parseFloat(inputTL?.value || '0') || 0);
        const tr = Math.max(0, parseFloat(inputTR?.value || '0') || 0);
        const br = Math.max(0, parseFloat(inputBR?.value || '0') || 0);
        const bl = Math.max(0, parseFloat(inputBL?.value || '0') || 0);
        applyRectGeometry({
          ...rectCorners,
          mode: 'independent',
          tl,
          tr,
          br,
          bl,
        });
      };

      inputTL?.addEventListener('change', onIndependentCornersChange);
      inputTR?.addEventListener('change', onIndependentCornersChange);
      inputBR?.addEventListener('change', onIndependentCornersChange);
      inputBL?.addEventListener('change', onIndependentCornersChange);

      btnPreset0?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 0, tr: 0, br: 0, bl: 0 });
      });
      btnPreset5?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 5, tr: 5, br: 5, bl: 5 });
      });
      btnPreset10?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 10, tr: 10, br: 10, bl: 10 });
      });
      btnPreset20?.addEventListener('click', () => {
        applyRectGeometry({ ...rectCorners, tl: 20, tr: 20, br: 20, bl: 20 });
      });
      btnPresetPill?.addEventListener('click', () => {
        const maxVal = rectCorners.unit === '%' ? 50 : Math.round(Math.min(w, h) / 2);
        applyRectGeometry({ ...rectCorners, tl: maxVal, tr: maxVal, br: maxVal, bl: maxVal });
      });

      btnSyncTL?.addEventListener('click', () => {
        const tl = rectCorners.tl;
        applyRectGeometry({ ...rectCorners, tl, tr: tl, br: tl, bl: tl });
      });

      btnInvertCorners?.addEventListener('click', () => {
        applyRectGeometry({
          ...rectCorners,
          tl: rectCorners.br,
          tr: rectCorners.bl,
          br: rectCorners.tl,
          bl: rectCorners.tr,
        });
      });

      btnRectToPath?.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        this.model.convertToCurves(el);
        if (this.callbacks.onConvertToCurves) {
          this.callbacks.onConvertToCurves(el);
        } else {
          this.callbacks.onUpdateElement(el);
          this.renderElementProperties(el);
        }
      });
    }

    if (isLine) {
      const lineX1Input = this.container.querySelector<HTMLInputElement>('#line-x1');
      const lineY1Input = this.container.querySelector<HTMLInputElement>('#line-y1');
      const lineX2Input = this.container.querySelector<HTMLInputElement>('#line-x2');
      const lineY2Input = this.container.querySelector<HTMLInputElement>('#line-y2');
      const btnLineReverse = this.container.querySelector<HTMLButtonElement>('#btn-line-reverse');
      const btnLineToPath = this.container.querySelector<HTMLButtonElement>('#btn-line-to-path');

      const applyLineCoordinates = (x1: number, y1: number, x2: number, y2: number) => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        el.attributes.x1 = x1.toString();
        el.attributes.y1 = y1.toString();
        el.attributes.x2 = x2.toString();
        el.attributes.y2 = y2.toString();
        el.vertices = this.model.convertShapeToVertices('line', el.attributes);
        el.attributes.d = this.model.compilePathD(el.vertices, false);
        this.callbacks.onUpdateElement(el);
        this.renderElementProperties(el);
      };

      lineX1Input?.addEventListener('change', () => {
        const x1 = parseFloat(lineX1Input.value) || 0;
        applyLineCoordinates(x1, lineY1, lineX2, lineY2);
      });
      lineY1Input?.addEventListener('change', () => {
        const y1 = parseFloat(lineY1Input.value) || 0;
        applyLineCoordinates(lineX1, y1, lineX2, lineY2);
      });
      lineX2Input?.addEventListener('change', () => {
        const x2 = parseFloat(lineX2Input.value) || 0;
        applyLineCoordinates(lineX1, lineY1, x2, lineY2);
      });
      lineY2Input?.addEventListener('change', () => {
        const y2 = parseFloat(lineY2Input.value) || 0;
        applyLineCoordinates(lineX1, lineY1, lineX2, y2);
      });

      btnLineReverse?.addEventListener('click', () => {
        applyLineCoordinates(lineX2, lineY2, lineX1, lineY1);
      });

      btnLineToPath?.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        this.model.convertToCurves(el);
        if (this.callbacks.onConvertToCurves) {
          this.callbacks.onConvertToCurves(el);
        } else {
          this.callbacks.onUpdateElement(el);
          this.renderElementProperties(el);
        }
      });
    }

    if (isPolyline || isPolygon) {
      const btnPolyToPath = this.container.querySelector<HTMLButtonElement>('#btn-poly-to-path');
      btnPolyToPath?.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        this.model.convertToCurves(el);
        if (this.callbacks.onConvertToCurves) {
          this.callbacks.onConvertToCurves(el);
        } else {
          this.callbacks.onUpdateElement(el);
          this.renderElementProperties(el);
        }
      });
    }

    const btnConvertToPath = this.container.querySelector<HTMLButtonElement>('#btn-convert-to-path');
    if (btnConvertToPath) {
      btnConvertToPath.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        this.model.convertToCurves(el);
        if (this.callbacks.onConvertToCurves) {
          this.callbacks.onConvertToCurves(el);
        } else {
          this.callbacks.onUpdateElement(el);
          this.renderElementProperties(el);
        }
      });
    }

    /**
     * ARCHITECTURAL RATIONALE: Inverse Primitive Converter Action (FEAT-05)
     * When user clicks "Simplificar a <primitive>", executes conversion algorithm in VectorModel,
     * resets tag name, restores native attributes, updates element, records undo state,
     * and refreshes inspector properties and canvas overlay.
     */
    const btnSimplifyToPrimitive = this.container.querySelector<HTMLButtonElement>('#btn-simplify-to-primitive');
    if (btnSimplifyToPrimitive) {
      btnSimplifyToPrimitive.addEventListener('click', () => {
        if (this.callbacks.onPushUndo) this.callbacks.onPushUndo();
        const converted = this.model.convertPathToPrimitive(el);
        if (converted) {
          this.callbacks.onUpdateElement(el);
          this.renderElementProperties(el);
          if (this.callbacks.onRenderOverlay) {
            this.callbacks.onRenderOverlay();
          }
        }
      });
    }

    AppearanceInspector.bindEvents(
      this.container,
      el,
      this.model,
      isClosed,
      grad,
      fillType,
      this.callbacks,
      () => this.renderElementProperties(el)
    );

    this.bindMouseDown('btn-prop-bool-union-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('union'));
    this.bindMouseDown('btn-prop-bool-subtract-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('subtract'));
    this.bindMouseDown('btn-prop-bool-intersect-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('intersect'));
    this.bindMouseDown('btn-prop-bool-exclude-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('exclude'));
    this.bindMouseDown('btn-prop-bool-combine-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('combine'));
    this.bindMouseDown('btn-prop-bool-fragment-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('fragment'));

    EffectsInspector.bindEvents(this.container, el, ds, is, this.callbacks);
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
