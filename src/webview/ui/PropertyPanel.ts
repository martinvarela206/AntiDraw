import { VectorModel, VectorElement, PathVertex, NodeType } from '../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../engine/SelectionTool.js';
import { GuideLine, RulerConfig } from '../engine/CanvasManager.js';
import { ToolIcons } from '../icons/ToolIcons.js';

export interface PropertyPanelCallbacks {
  onUpdateElement: (el: VectorElement) => void;
  onUpdateCanvas: () => void;
  onNodeTypeChange: (nodeType: NodeType) => void;
  onSplitNode: () => void;
  onPenNodeTypeChange?: (nodeType: NodeType) => void;
  onFinishPenPath?: (close: boolean) => void;
  onUpdateRuler?: (config: RulerConfig) => void;
  onUpdateGuide?: (guide: GuideLine) => void;
  onDeleteGuide?: (guideId: string) => void;
  onClearAllGuides?: () => void;
}

export class PropertyPanel {
  private container: HTMLElement;
  private model: VectorModel;
  private selectionTool: SelectionTool;
  private activeVertex: PathVertex | null = null;
  private activeTool: string = 'select';
  public penNodeType: NodeType = 'asymmetric';
  public penVertexCount: number = 0;
  private activeRulerConfig: RulerConfig | null = null;
  private activeGuide: GuideLine | null = null;
  private callbacks: PropertyPanelCallbacks;

  // Track which panel section is currently rendered to avoid full re-builds
  private currentPanelMode: 'canvas' | 'element' | 'node' | 'pen' | 'multi' | 'ruler' | 'guide' | null = null;

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
    selectedGuide: GuideLine | null = null
  ): void {
    this.activeVertex = selectedVertex;
    this.activeTool = activeTool;
    this.penNodeType = penNodeType;
    this.penVertexCount = penVertexCount;
    this.activeGuide = selectedGuide;

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

  public showRulerSettings(config: RulerConfig): void {
    this.currentPanelMode = 'ruler';
    this.activeRulerConfig = config;
    this.renderRulerProperties(config);
  }

  public showGuideSettings(guide: GuideLine): void {
    this.currentPanelMode = 'guide';
    this.activeGuide = guide;
    this.renderGuideProperties(guide);
  }

  private renderPanel(): void {
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
    } else {
      this.currentPanelMode = 'canvas';
      this.renderCanvasProperties();
    }
  }

  // Render Ruler Configuration Properties
  private renderRulerProperties(config: RulerConfig): void {
    this.container.innerHTML = `
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

    const unitSelect = this.container.querySelector<HTMLSelectElement>('#ruler-unit');
    const scaleInput = this.container.querySelector<HTMLInputElement>('#ruler-scale');
    const stepInput = this.container.querySelector<HTMLInputElement>('#ruler-step');
    const clearBtn = this.container.querySelector<HTMLButtonElement>('#btn-clear-guides');

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
        <div class="panel-title">Pen Path Tool</div>
        <div class="prop-row">
          <span class="prop-label">Path Nodes</span>
          <span style="font-weight:600; color:var(--text-main);">${this.penVertexCount} vertices</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Next Node Type</div>
        <div class="prop-row" style="justify-content: flex-start; gap: 8px;">
          <button class="btn-icon ${this.penNodeType === 'asymmetric' ? 'active' : ''}" id="btn-pen-asym" title="Asymmetric Node (Corner / Sharp)">
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
          • <b>Drag</b>: Pull Bézier handles<br/>
          • <b>Shift + Click node</b>: Delete node<br/>
          • <b>Ctrl + Drag node</b>: Move node<br/>
          • <b>Enter / DblClick</b>: Finish path<br/>
          • <b>Escape</b>: Cancel drawing
        </div>
      </div>
    `;

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

  // Render properties when multiple elements are selected
  private renderMultiElementProperties(elements: VectorElement[]): void {
    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Multiple Selection</div>
        <div class="prop-row">
          <span class="prop-label">Selected</span>
          <span style="font-weight:600; color:var(--text-main);">${elements.length} vectors</span>
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
    `;

    const bFillColor = this.container.querySelector<HTMLInputElement>('#batch-fill-color');
    const bFillHex = this.container.querySelector<HTMLInputElement>('#batch-fill-hex');
    const bStrokeColor = this.container.querySelector<HTMLInputElement>('#batch-stroke-color');
    const bStrokeHex = this.container.querySelector<HTMLInputElement>('#batch-stroke-hex');
    const bStrokeWidth = this.container.querySelector<HTMLInputElement>('#batch-stroke-width');

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

  // Update only the dynamic parts of the node panel without destroying DOM
  private updateNodePropertiesInPlace(v: PathVertex): void {
    const xInput = this.container.querySelector<HTMLInputElement>('#node-pos-x');
    const yInput = this.container.querySelector<HTMLInputElement>('#node-pos-y');
    if (xInput) xInput.value = Math.round(v.x).toString();
    if (yInput) yInput.value = Math.round(v.y).toString();

    const asymBtn = this.container.querySelector('#btn-node-asym');
    const smoothBtn = this.container.querySelector('#btn-node-smooth');
    const symBtn = this.container.querySelector('#btn-node-sym');
    if (asymBtn) asymBtn.classList.toggle('active', v.nodeType === 'asymmetric');
    if (smoothBtn) smoothBtn.classList.toggle('active', v.nodeType === 'smooth');
    if (symBtn) symBtn.classList.toggle('active', v.nodeType === 'symmetric');
  }

  // Render Canvas Properties
  private renderCanvasProperties(): void {
    const { canvas } = this.model;

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Canvas &amp; Workspace</div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="canvas-width" value="${canvas.width}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Height</span>
          <input type="number" class="prop-input" id="canvas-height" value="${canvas.height}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">ViewBox</span>
          <input type="text" class="prop-input" id="canvas-viewbox" value="${canvas.viewBox}" />
        </div>
        <div class="prop-row">
          <span class="prop-label">Background</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="canvas-bg-color" value="${canvas.backgroundColor}" />
            <input type="text" class="prop-input" id="canvas-bg-hex" value="${canvas.backgroundColor}" />
          </div>
        </div>
      </div>
    `;

    const widthInput = this.container.querySelector<HTMLInputElement>('#canvas-width');
    const heightInput = this.container.querySelector<HTMLInputElement>('#canvas-height');
    const bgColor = this.container.querySelector<HTMLInputElement>('#canvas-bg-color');
    const bgHex = this.container.querySelector<HTMLInputElement>('#canvas-bg-hex');

    if (widthInput) widthInput.addEventListener('change', () => {
      this.model.canvas.width = parseFloat(widthInput.value) || 800;
      this.callbacks.onUpdateCanvas();
    });
    if (heightInput) heightInput.addEventListener('change', () => {
      this.model.canvas.height = parseFloat(heightInput.value) || 600;
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
  }

  // Render Node Properties for single selected vertex
  private renderNodeProperties(el: VectorElement, v: PathVertex): void {
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
          <button class="btn-icon ${v.nodeType === 'asymmetric' ? 'active' : ''}" id="btn-node-asym" title="Asymmetric Node">
            ${ToolIcons.nodeAsymmetric}
          </button>
          <button class="btn-icon ${v.nodeType === 'smooth' ? 'active' : ''}" id="btn-node-smooth" title="Uniform / Smooth Node">
            ${ToolIcons.nodeSmooth}
          </button>
          <button class="btn-icon ${v.nodeType === 'symmetric' ? 'active' : ''}" id="btn-node-sym" title="Symmetric Node">
            ${ToolIcons.nodeSymmetric}
          </button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Node Actions</div>
        <div class="prop-row">
          <button class="prop-input" id="btn-split-node" style="cursor:pointer; background:var(--bg-active); text-align:center;">
            ${ToolIcons.splitNode} Split Node into 2 Vertices
          </button>
        </div>
      </div>
    `;

    // mousedown + preventDefault: prevents focus stealing / blur from canvas when clicking panel buttons
    this.bindMouseDown('btn-node-asym', () => this.callbacks.onNodeTypeChange('asymmetric'));
    this.bindMouseDown('btn-node-smooth', () => this.callbacks.onNodeTypeChange('smooth'));
    this.bindMouseDown('btn-node-sym', () => this.callbacks.onNodeTypeChange('symmetric'));
    this.bindMouseDown('btn-split-node', () => this.callbacks.onSplitNode());
  }

  // mousedown + preventDefault prevents focus change on canvas; stopPropagation blocks canvasWrapper pointerdown
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
