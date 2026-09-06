import { VectorModel, VectorElement, PathVertex, NodeType } from '../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../engine/SelectionTool.js';
import { GuideLine, RulerConfig, ShapeToolConfig, GridAlignmentMode } from '../engine/CanvasManager.js';
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
    gridAlignmentMode: GridAlignmentMode = 'origin'
  ): void {
    this.activeVertex = selectedVertex;
    this.activeTool = activeTool;
    this.penNodeType = penNodeType;
    this.penVertexCount = penVertexCount;
    this.activeGuide = selectedGuide;
    this.polylineVertexCount = polylineVertexCount;
    this.gridAlignmentMode = gridAlignmentMode;

    if (selectedGuide) {
      this.currentPanelMode = 'guide';
    } else if (activeTool && activeTool !== '' && activeTool !== 'ruler') {
      if (this.currentPanelMode === 'ruler') {
        this.currentPanelMode = null;
      }
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

  public showRulerSettings(config: RulerConfig, gridAlignmentMode: GridAlignmentMode = 'origin'): void {
    this.currentPanelMode = 'ruler';
    this.activeRulerConfig = config;
    this.gridAlignmentMode = gridAlignmentMode;
    this.renderRulerProperties(config);
  }

  public showGuideSettings(guide: GuideLine): void {
    this.currentPanelMode = 'guide';
    this.activeGuide = guide;
    this.renderGuideProperties(guide);
  }

  private renderPanel(): void {
    if (this.activeTool === 'polyline') {
      this.currentPanelMode = 'polyline';
      this.renderPolylineProperties();
      return;
    }

    if (this.activeTool === 'pen') {
      this.currentPanelMode = 'pen';
      this.renderPenProperties();
      return;
    }

    if (this.currentPanelMode === 'ruler' && this.activeRulerConfig) {
      this.renderRulerProperties(this.activeRulerConfig);
      return;
    }

    if (this.activeGuide) {
      this.currentPanelMode = 'guide';
      this.renderGuideProperties(this.activeGuide);
      return;
    }

    const selectedEls = this.model.elements.filter(
      (e) => this.selectionTool.isSelected(e.id)
    );

    if (this.activeVertex && selectedEls.length === 1) {
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
    } else if (selectedEls.length > 1) {
      this.currentPanelMode = 'multi';
      this.renderMultiElementProperties(selectedEls);
    } else if (['rect', 'ellipse', 'star', 'line'].includes(this.activeTool)) {
      this.currentPanelMode = 'shape';
      this.renderShapeToolProperties();
    } else {
      this.currentPanelMode = 'canvas';
      this.renderCanvasProperties();
    }
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

      <div class="panel-section">
        <div class="panel-title">Guide Actions</div>
        <div class="prop-row" style="flex-direction:column; gap:6px;">
          <button class="prop-input" id="btn-clear-guides" style="cursor:pointer; background:#ef4444; color:#fff; text-align:center; font-weight:600;">
            🗑 Clear All Guides
          </button>
        </div>
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
      this.activeTool === 'ellipse' ? 'Ellipse / Circle' :
      this.activeTool === 'star' ? 'Star' : 'Line';

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
        <div class="panel-title">Batch Fill</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="batch-fill-color" value="#4f46e5" />
            <input type="text" class="prop-input" id="batch-fill-hex" value="#4f46e5" />
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

    this.bindMouseDown('btn-prop-bool-union', () => this.callbacks.onBoolean && this.callbacks.onBoolean('union'));
    this.bindMouseDown('btn-prop-bool-subtract', () => this.callbacks.onBoolean && this.callbacks.onBoolean('subtract'));
    this.bindMouseDown('btn-prop-bool-intersect', () => this.callbacks.onBoolean && this.callbacks.onBoolean('intersect'));
    this.bindMouseDown('btn-prop-bool-exclude', () => this.callbacks.onBoolean && this.callbacks.onBoolean('exclude'));
    this.bindMouseDown('btn-prop-bool-combine', () => this.callbacks.onBoolean && this.callbacks.onBoolean('combine'));
    this.bindMouseDown('btn-prop-bool-fragment', () => this.callbacks.onBoolean && this.callbacks.onBoolean('fragment'));

    if (bFillColor) {
      bFillColor.addEventListener('input', () => {
        elements.forEach((el) => { el.attributes['fill'] = bFillColor.value; });
        if (bFillHex) bFillHex.value = bFillColor.value;
        this.callbacks.onUpdateElement(elements[0]);
      });
    }
    if (bFillHex) {
      bFillHex.addEventListener('change', () => {
        elements.forEach((el) => { el.attributes['fill'] = bFillHex.value; });
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
    const fill = el.attributes['fill'] || 'none';
    const stroke = el.attributes['stroke'] || '#ffffff';
    const strokeWidth = el.attributes['stroke-width'] || '1';
    const strokeDash = el.attributes['stroke-dasharray'] || '';
    const strokeLinecap = el.attributes['stroke-linecap'] || 'butt';
    const strokeLinejoin = el.attributes['stroke-linejoin'] || 'miter';

    const box = this.selectionTool.getBoundingBox(el);
    const x = box ? Math.round(box.x) : 0;
    const y = box ? Math.round(box.y) : 0;
    const w = box ? Math.round(box.width) : 0;
    const h = box ? Math.round(box.height) : 0;

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
          <span class="prop-label">Nodes</span>
          <span style="font-weight:600; color:var(--text-main); font-size:12px;">${el.vertices ? el.vertices.length : 0} nodes (${el.isClosed ? 'closed' : 'open'})</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Fill</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="el-fill-color" value="${fill === 'none' ? '#4f46e5' : fill}" />
            <input type="text" class="prop-input" id="el-fill-hex" value="${fill}" />
          </div>
        </div>
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
          <select class="prop-input" id="el-stroke-join" style="cursor:pointer;">
            <option value="miter" ${strokeLinejoin === 'miter' ? 'selected' : ''}>Miter</option>
            <option value="round" ${strokeLinejoin === 'round' ? 'selected' : ''}>Round</option>
            <option value="bevel" ${strokeLinejoin === 'bevel' ? 'selected' : ''}>Bevel</option>
          </select>
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
        this.callbacks.onUpdateElement(el);
      };
      elW.addEventListener('change', applySize);
      elH.addEventListener('change', applySize);
    }

    if (elFillColor) {
      elFillColor.addEventListener('input', () => {
        el.attributes['fill'] = elFillColor.value;
        if (elFillHex) elFillHex.value = elFillColor.value;
        this.callbacks.onUpdateElement(el);
      });
    }
    if (elFillHex) {
      elFillHex.addEventListener('change', () => {
        el.attributes['fill'] = elFillHex.value;
        if (elFillColor) elFillColor.value = elFillHex.value;
        this.callbacks.onUpdateElement(el);
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
        this.callbacks.onUpdateElement(el);
      });
    }

    this.bindMouseDown('btn-prop-bool-union-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('union'));
    this.bindMouseDown('btn-prop-bool-subtract-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('subtract'));
    this.bindMouseDown('btn-prop-bool-intersect-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('intersect'));
    this.bindMouseDown('btn-prop-bool-exclude-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('exclude'));
    this.bindMouseDown('btn-prop-bool-combine-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('combine'));
    this.bindMouseDown('btn-prop-bool-fragment-single', () => this.callbacks.onBoolean && this.callbacks.onBoolean('fragment'));
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
