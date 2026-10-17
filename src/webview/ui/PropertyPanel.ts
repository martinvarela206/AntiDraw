import { VectorModel, VectorElement, PathVertex, NodeType, DropShadowConfig, InnerShadowConfig, GradientConfig, GradientStop, RectCorners, Point } from '../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../engine/SelectionTool.js';
import { GuideLine, RulerConfig, ShapeToolConfig, GridAlignmentMode, GridConfig, GridType } from '../engine/CanvasManager.js';
import { ToolIcons } from '../icons/ToolIcons.js';

export interface PropertyPanelCallbacks {
  onUpdateElement: (el: VectorElement) => void;
  onUpdateCanvas: () => void;
  onNodeTypeChange: (nodeType: NodeType) => void;
  onSplitNode: () => void;
  onClosePath?: () => void;
  onJoinNodes?: () => void;
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
  /**
   * Free Distort (Homography) callbacks for numerical corner placement and resets.
   */
  onDistortCornerChange?: (cornerKey: 'nw' | 'ne' | 'se' | 'sw', coord: Point) => void;
  onResetDistortCorner?: (cornerKey: 'nw' | 'ne' | 'se' | 'sw') => void;
  onResetAllDistortCorners?: () => void;
  onResetSkew?: () => void;
  onApplyWarpArc?: (options: any) => void;
  onResetWarp?: () => void;
  onConvertGuideToVector?: () => void;
  syncMetadataToHost?: () => void;
}

export { ViewBoxPreset, VIEWBOX_PRESETS } from './inspectors/CanvasInspector.js';
export { miterLimitToDegrees, degreesToMiterLimit } from './inspectors/AppearanceInspector.js';
import { CanvasInspector } from './inspectors/CanvasInspector.js';
import { RulerGuideInspector } from './inspectors/RulerGuideInspector.js';
import { GeometryInspector } from './inspectors/GeometryInspector.js';
import { AppearanceInspector, miterLimitToDegrees, degreesToMiterLimit } from './inspectors/AppearanceInspector.js';
import { EffectsInspector } from './inspectors/EffectsInspector.js';
import { PrimitiveInspector } from './inspectors/PrimitiveInspector.js';
import { ShapeDefaultsInspector } from './inspectors/ShapeDefaultsInspector.js';
import { NodeInspector } from './inspectors/NodeInspector.js';
import { MultiSelectionInspector } from './inspectors/MultiSelectionInspector.js';
import { SwatchPaletteInspector } from './inspectors/SwatchPaletteInspector.js';
import { StrokeInspector, StrokeInspectorProps } from './inspectors/StrokeInspector.js';
import { QuickHelpInspector } from './inspectors/QuickHelpInspector.js';
import { BlendEngine } from '../engine/blend/BlendEngine.js';
import { BlendInspector } from './inspectors/BlendInspector.js';

export class PropertyPanel {
  private container: HTMLElement;
  private inspectorContainer!: HTMLElement;
  private quickHelpContainer!: HTMLElement;
  private model: VectorModel;
  private selectionTool: SelectionTool;
  private activeVertex: PathVertex | null = null;
  public selectedNodeCount: number = 1;
  private activeTool: string = 'select';
  public penNodeType: NodeType = 'symmetric';
  public penVertexCount: number = 0;
  public polylineVertexCount: number = 0;
  public gridAlignmentMode: GridAlignmentMode = 'origin';
  public grids: GridConfig[] = [];
  public guides: GuideLine[] = [];
  private activeRulerConfig: RulerConfig | null = null;
  private activeGuide: GuideLine | null = null;
  public selectedGuides: GuideLine[] = [];
  public shapeConfig: ShapeToolConfig = {
    aspectRatioW: 4,
    aspectRatioH: 3,
    starPoints: 5,
    starInnerRatio: 0.4,
    rectCornerRadius: 0,
    polygonSides: 5,
  };
  private callbacks: PropertyPanelCallbacks;

  // Track which panel section is currently rendered to avoid full re-builds
  public currentPanelMode: 'canvas' | 'element' | 'node' | 'pen' | 'polyline' | 'multi' | 'ruler' | 'guide' | 'shape' | 'stroke' | null = null;

  constructor(
    container: HTMLElement,
    model: VectorModel,
    selectionTool: SelectionTool,
    callbacks: PropertyPanelCallbacks
  ) {
    this.container = container;
    this.ensureContainers();
    this.model = model;
    this.selectionTool = selectionTool;
    this.callbacks = callbacks;
    this.renderPanel();
  }

  private ensureContainers(): void {
    if (
      !this.inspectorContainer ||
      !this.quickHelpContainer ||
      !this.container.contains(this.inspectorContainer) ||
      !this.container.contains(this.quickHelpContainer)
    ) {
      this.container.innerHTML = `
        <div class="property-inspector-content" id="property-inspector-content"></div>
        <div class="property-quick-help" id="property-quick-help"></div>
      `;
      this.inspectorContainer = this.container.querySelector('#property-inspector-content')!;
      this.quickHelpContainer = this.container.querySelector('#property-quick-help')!;
    }
  }

  private renderQuickHelp(isGuideOrRuler: boolean = false): void {
    this.ensureContainers();
    QuickHelpInspector.render(this.quickHelpContainer, this.activeTool, isGuideOrRuler);
  }

  public update(
    selectedVertex: PathVertex | null = null,
    activeTool: string = 'select',
    penNodeType: NodeType = 'symmetric',
    penVertexCount: number = 0,
    selectedGuide: GuideLine | null = null,
    polylineVertexCount: number = 0,
    gridAlignmentMode: GridAlignmentMode = 'origin',
    grids: GridConfig[] = [],
    guides: GuideLine[] = [],
    selectedNodeCount: number = 1,
    selectedGuides: GuideLine[] = []
  ): void {
    this.activeVertex = selectedVertex;
    this.selectedNodeCount = selectedNodeCount;
    this.activeTool = activeTool;
    this.penNodeType = penNodeType;
    this.penVertexCount = penVertexCount;
    this.activeGuide = selectedGuide;
    this.selectedGuides = selectedGuides.length > 0 ? selectedGuides : (selectedGuide ? [selectedGuide] : []);
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
      this.selectedGuides = [];
    } else if (selectedGuide || this.selectedGuides.length > 0) {
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
    this.selectedGuides = [];
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
    this.ensureContainers();
    this.renderRulerProperties(config);
    this.renderQuickHelp(true);
  }

  public showGuideSettings(guideOrGuides: GuideLine | GuideLine[]): void {
    const list = Array.isArray(guideOrGuides) ? guideOrGuides : [guideOrGuides];
    this.currentPanelMode = 'guide';
    this.activeGuide = list[0] || null;
    this.selectedGuides = list;
    this.ensureContainers();
    this.renderGuideProperties(list);
    this.renderQuickHelp(true);
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
    this.ensureContainers();

    const selectedEls = this.model.elements.filter(
      (e) => this.selectionTool.isSelected(e.id)
    );

    let isGuideOrRuler = false;

    // 1. HIGHEST PRIORITY: Active Vector Element Selection
    if (selectedEls.length > 0) {
      this.activeGuide = null;
      this.activeRulerConfig = null;

      if (this.activeVertex && selectedEls.length === 1 && this.activeTool === 'node') {
        if (this.currentPanelMode === 'node' && this.selectedNodeCount <= 1) {
          // Panel already shows node properties — update in place without destroying DOM
          this.updateNodePropertiesInPlace(this.activeVertex);
        } else {
          this.renderNodeProperties(selectedEls[0], this.activeVertex, this.selectedNodeCount);
          this.currentPanelMode = 'node';
        }
      } else if (this.activeTool === 'stroke') {
        if (selectedEls.length === 1) {
          this.currentPanelMode = 'stroke';
          this.renderStrokeProperties(selectedEls[0]);
        } else {
          this.currentPanelMode = 'multi';
          this.renderMultiElementProperties(selectedEls);
        }
      } else if (selectedEls.length === 1) {
        this.currentPanelMode = 'element';
        this.renderElementProperties(selectedEls[0]);
      } else {
        this.currentPanelMode = 'multi';
        this.renderMultiElementProperties(selectedEls);
      }
    } else if (this.activeTool === 'stroke') {
      // Stroke Tool Active without elements selected
      this.currentPanelMode = 'stroke';
      this.renderStrokeEmptyState();
    } else if (this.activeGuide || this.selectedGuides.length > 0) {
      // 2. Guide Line Selection (single or multi-guide)
      this.currentPanelMode = 'guide';
      this.activeRulerConfig = null;
      isGuideOrRuler = true;
      const guidesToRender = this.selectedGuides.length > 0 ? this.selectedGuides : (this.activeGuide ? [this.activeGuide] : []);
      this.renderGuideProperties(guidesToRender);
    } else if (this.currentPanelMode === 'ruler' && this.activeRulerConfig) {
      // 3. Ruler Corner Active
      isGuideOrRuler = true;
      this.renderRulerProperties(this.activeRulerConfig);
    } else if (this.activeTool === 'polyline' && this.polylineVertexCount > 0) {
      // 4. In-Progress Interactive Path Creation
      this.currentPanelMode = 'polyline';
      this.renderPolylineProperties();
    } else if (this.activeTool === 'pen' && this.penVertexCount > 0) {
      this.currentPanelMode = 'pen';
      this.renderPenProperties();
    } else if (['rect', 'circle', 'ellipse', 'line', 'polygon', 'star'].includes(this.activeTool)) {
      // 5. Active Shape Tool Creation Settings (No vectors selected)
      this.currentPanelMode = 'shape';
      this.renderShapeToolProperties();
    } else {
      // 6. Default Base State: Canvas & ViewBox Properties
      this.currentPanelMode = 'canvas';
      this.renderCanvasProperties();
    }

    this.renderQuickHelp(isGuideOrRuler);
  }

  // Render Ruler Configuration Properties
  private renderRulerProperties(config: RulerConfig): void {
    this.ensureContainers();
    RulerGuideInspector.renderRulerSettings(
      config,
      this.inspectorContainer,
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
  private renderGuideProperties(guide: GuideLine | GuideLine[]): void {
    this.ensureContainers();
    RulerGuideInspector.renderGuideSettings(guide, this.inspectorContainer, this.callbacks);
  }

  // Render Pen Tool options & next-node-type configuration
  private renderPenProperties(): void {
    this.inspectorContainer.innerHTML = `
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
          <button class="prop-input" id="btn-finish-path" style="cursor:pointer; background:var(--accent-color); color:#fff; text-align:center; font-weight:600; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            ${ToolIcons.check} Finish Path (Enter)
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

    this.inspectorContainer.innerHTML = `
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
    ShapeDefaultsInspector.render(
      this.inspectorContainer,
      this.activeTool,
      this.shapeConfig,
      this.callbacks
    );
  }

  // Render properties when multiple elements are selected
  private renderMultiElementProperties(elements: VectorElement[]): void {
    MultiSelectionInspector.render(
      this.inspectorContainer,
      elements,
      this.model,
      this.selectionTool,
      this.callbacks,
      () => this.renderMultiElementProperties(elements)
    );
  }

  /**
   * ARCHITECTURAL RATIONALE: High-Frequency In-Place DOM Mutation
   * Preserves 60fps responsiveness during node dragging without reflow.
   */
  private updateNodePropertiesInPlace(v: PathVertex): void {
    NodeInspector.updateInPlace(this.inspectorContainer, v);
  }

  // Render Canvas & ViewBox Properties
  private renderCanvasProperties(): void {
    CanvasInspector.render(
      this.inspectorContainer,
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
    let fill = el.attributes['fill'] || 'none';

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
    const pivot = box ? this.selectionTool.getPivot(box, el) : { x: 0, y: 0 };
    // Inverse Primitive Recognition (FEAT-05):
    // If element is a pure path and not currently parametric, detect whether its vertices
    // conform to canonical native SVG primitives (line, polyline, polygon, rect, circle, ellipse).
    const detectedPrimitive = !this.model.isParametricElement(el) && el.tagName === 'path'
      ? this.model.detectPrimitiveFromPath(el)
      : null;

    const isBlend = BlendEngine.isBlendGroup(el);

    this.inspectorContainer.innerHTML = `
      ${isBlend ? BlendInspector.renderHtml(el) : ''}

      ${GeometryInspector.renderHtml(el, this.model, this.selectionTool, box, pivot, isClosed, detectedPrimitive)}

      ${PrimitiveInspector.renderElementPrimitives(el, this.model, box)}

      ${AppearanceInspector.renderHtml(
        el,
        isClosed,
        fill,
        grad,
        fillType,
        gradientCss
      )}

      ${StrokeInspector.renderHtml(el, this.getStrokeProps(el))}

      ${SwatchPaletteInspector.renderHtml(this.model, el)}

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
      this.inspectorContainer,
      el,
      this.model,
      this.selectionTool,
      box,
      this.callbacks,
      () => this.renderElementProperties(el),
      detectedPrimitive
    );

    PrimitiveInspector.bindElementPrimitives(
      this.inspectorContainer,
      el,
      this.model,
      this.selectionTool,
      box,
      this.callbacks,
      () => this.renderElementProperties(el)
    );

    AppearanceInspector.bindEvents(
      this.inspectorContainer,
      el,
      this.model,
      isClosed,
      grad,
      fillType,
      this.callbacks,
      () => this.renderElementProperties(el)
    );

    StrokeInspector.bindEvents(
      this.inspectorContainer,
      el,
      this.model,
      this.callbacks,
      () => this.renderElementProperties(el)
    );

    SwatchPaletteInspector.bindEvents(
      this.inspectorContainer,
      this.model,
      el,
      this.callbacks,
      () => this.renderElementProperties(el)
    );

    this.bindMouseDown('btn-prop-bool-union-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('union'));
    this.bindMouseDown('btn-prop-bool-subtract-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('subtract'));
    this.bindMouseDown('btn-prop-bool-intersect-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('intersect'));
    this.bindMouseDown('btn-prop-bool-exclude-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('exclude'));
    this.bindMouseDown('btn-prop-bool-combine-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('combine'));
    this.bindMouseDown('btn-prop-bool-fragment-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('fragment'));

    EffectsInspector.bindEvents(this.inspectorContainer, el, ds, is, this.callbacks);

    if (isBlend) {
      BlendInspector.bindEvents(this.inspectorContainer, el, this.model, this.callbacks, () => this.renderPanel());
    }
  }

  // Render Stroke Tool Empty State (No vector selected)
  private renderStrokeEmptyState(): void {
    this.inspectorContainer.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Stroke Tool (Herramienta Trazo - T)</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.5; margin-top:6px;">
          Selecciona cualquier vector o trazado en el lienzo para inspeccionar y configurar sus propiedades de línea, remates, uniones y marcadores.
        </div>
      </div>
    `;
  }

  private getStrokeProps(el: VectorElement): StrokeInspectorProps {
    const stroke = el.attributes['stroke'] || '#ffffff';
    const strokeWidth = el.attributes['stroke-width'] || '1';
    const strokeDash = el.attributes['data-dash-nominal'] || el.attributes['stroke-dasharray'] || '';
    const dashAlignCorners = el.attributes['data-dash-align'] === 'corners';
    const strokeLinecap = el.attributes['stroke-linecap'] || 'butt';
    const strokeLinejoin = el.attributes['stroke-linejoin'] || 'miter';
    const strokeMiterlimit = parseFloat(el.attributes['stroke-miterlimit'] || '4') || 4;
    const miterAngleDeg = miterLimitToDegrees(strokeMiterlimit);

    const parseMarkerId = (val?: string): string => {
      if (!val || val === 'none') return 'none';
      const models = [
        'arrow-open',
        'arrow-filled',
        'arrow-stealth',
        'arrow-triangle-wide',
        'arrow-concave',
        'circle-dot',
        'circle-open',
        'diamond',
        'square-block',
        'square-open',
        'bar-cap',
        'slash',
        'bracket',
      ];
      for (const m of models) {
        if (val.includes(m)) return m;
      }
      return 'none';
    };

    const markerStart = parseMarkerId(el.attributes['marker-start']);
    const markerMid = parseMarkerId(el.attributes['marker-mid']);
    const markerEnd = parseMarkerId(el.attributes['marker-end']);
    const markerAlign = (el.attributes['data-marker-align'] as 'tip' | 'extend') || 'tip';
    const markerOffset = parseFloat(el.attributes['data-marker-offset'] || '0') || 0;
    const markerSize = el.attributes['data-marker-size'] ? parseFloat(el.attributes['data-marker-size']) : 6;
    const markerUnits = (el.attributes['data-marker-units'] as 'strokeWidth' | 'userSpaceOnUse') || 'strokeWidth';
    const paintOrder = el.attributes['paint-order'] || '';
    const markerLayer: 'over' | 'under' = paintOrder.includes('markers stroke') ? 'under' : 'over';
    const markerColor = el.attributes['data-marker-color'] || 'context-stroke';

    const tag = el.tagName?.toLowerCase() || '';
    const shape = el.shapeType?.toLowerCase() || '';
    const isShapeRestricted = tag === 'rect' || tag === 'circle' || tag === 'ellipse' || shape === 'rect' || shape === 'circle' || shape === 'ellipse';

    return {
      stroke,
      strokeWidth,
      strokeDash,
      strokeLinecap,
      strokeLinejoin,
      miterAngleDeg,
      markerStart,
      markerMid,
      markerEnd,
      markerAlign,
      markerOffset,
      markerSize,
      markerUnits,
      markerLayer,
      markerColor,
      dashAlignCorners,
      isShapeRestricted,
      shapeTagName: el.tagName,
    };
  }

  /**
   * ARCHITECTURAL RATIONALE: Modal Synchronization of Primitive & Geometry Inspectors (FEAT-08)
   * Why Geometry and Primitive Inspectors must be integrated in Stroke tool mode:
   * 1. When the user switches to the dedicated Stroke Tool (T) to fine-tune outline thickness, capping,
   *    dashing, or markers on a parametric primitive (such as a star, rect, ellipse, polygon, or line),
   *    the primitive controls (e.g., star points, inner ratio, corner radii, slice angles) and
   *    bounding box geometry controls (X, Y, W, H, rotation, flip) must NOT be suppressed or hidden.
   * 2. Naive modal isolation previously replaced the entire property panel with stroke-only controls,
   *    forcing cumbersome back-and-forth tool switching and obscuring shape-defining parameters.
   * 3. Unifying the presentation ensures full interactive continuity: the user can adjust both the
   *    parametric primitive shape and its stroke attributes simultaneously in real time.
   */
  private renderStrokeProperties(el: VectorElement): void {
    const isClosed = this.model.isElementClosed(el);
    const box = this.selectionTool.getBoundingBox(el);
    if (el.attributes['data-pivot'] && !this.selectionTool.customPivot) {
      this.selectionTool.restorePivotForElement(el);
    }
    const pivot = box ? this.selectionTool.getPivot(box, el) : { x: 0, y: 0 };
    const detectedPrimitive = !this.model.isParametricElement(el) && el.tagName === 'path'
      ? this.model.detectPrimitiveFromPath(el)
      : null;

    const strokeProps = this.getStrokeProps(el);

    this.inspectorContainer.innerHTML = `
      ${GeometryInspector.renderHtml(el, this.model, this.selectionTool, box, pivot, isClosed, detectedPrimitive)}

      ${PrimitiveInspector.renderElementPrimitives(el, this.model, box)}

      ${StrokeInspector.renderHtml(el, strokeProps)}
    `;

    GeometryInspector.bindEvents(
      this.inspectorContainer,
      el,
      this.model,
      this.selectionTool,
      box,
      this.callbacks,
      () => this.renderStrokeProperties(el),
      detectedPrimitive
    );

    PrimitiveInspector.bindElementPrimitives(
      this.inspectorContainer,
      el,
      this.model,
      this.selectionTool,
      box,
      this.callbacks,
      () => this.renderStrokeProperties(el)
    );

    StrokeInspector.bindEvents(
      this.inspectorContainer,
      el,
      this.model,
      this.callbacks,
      () => this.renderStrokeProperties(el)
    );
  }

  // Render Node Properties for single or multiple selected vertices
  private renderNodeProperties(el: VectorElement, v: PathVertex, selectedCount: number = 1): void {
    const isParametric = this.model.isParametricElement(el);
    this.inspectorContainer.innerHTML = NodeInspector.renderHtml(el, v, selectedCount, isParametric);
    NodeInspector.bindEvents(this.inspectorContainer, this.callbacks, el);
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
    const el = this.inspectorContainer.querySelector(`#${id}`);
    if (el) {
      el.addEventListener('mousedown', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    }
  }
}
