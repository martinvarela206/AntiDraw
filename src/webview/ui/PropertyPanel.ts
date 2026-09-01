import { VectorModel, VectorElement, PathVertex, NodeType } from '../engine/VectorModel.js';
import { SelectionTool, BoundingBox } from '../engine/SelectionTool.js';
import { ToolIcons } from '../icons/ToolIcons.js';

export interface PropertyPanelCallbacks {
  onUpdateElement: (el: VectorElement) => void;
  onUpdateCanvas: () => void;
  onNodeTypeChange: (nodeType: NodeType) => void;
  onSplitNode: () => void;
  onPenNodeTypeChange?: (nodeType: NodeType) => void;
  onFinishPenPath?: (close: boolean) => void;
}

export class PropertyPanel {
  private container: HTMLElement;
  private model: VectorModel;
  private selectionTool: SelectionTool;
  private activeVertex: PathVertex | null = null;
  private activeTool: string = 'select';
  public penNodeType: NodeType = 'asymmetric';
  public penVertexCount: number = 0;
  private callbacks: PropertyPanelCallbacks;

  // Track which panel section is currently rendered to avoid full re-builds
  private currentPanelMode: 'canvas' | 'element' | 'node' | 'pen' | 'multi' | null = null;

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
    penVertexCount: number = 0
  ): void {
    this.activeVertex = selectedVertex;
    this.activeTool = activeTool;
    this.penNodeType = penNodeType;
    this.penVertexCount = penVertexCount;
    this.renderPanel();
  }

  // Call this when the selected element changes so the panel mode resets
  public resetPanelMode(): void {
    this.currentPanelMode = null;
    this.activeVertex = null;
  }

  private renderPanel(): void {
    if (this.activeTool === 'pen') {
      this.currentPanelMode = 'pen';
      this.renderPenProperties();
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

  // Render Element Properties (Fill, Stroke, etc.)
  private renderElementProperties(el: VectorElement): void {
    const fill = el.attributes['fill'] || '#000000';
    const fillOpacity = parseFloat(el.attributes['fill-opacity'] || '1');
    const stroke = el.attributes['stroke'] || '#000000';
    const strokeOpacity = parseFloat(el.attributes['stroke-opacity'] || '1');
    const strokeWidth = el.attributes['stroke-width'] || '1';

    const fillHex = fill === 'none' ? '#000000' : fill;
    const strokeHex = stroke === 'none' ? '#000000' : stroke;

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Element</div>
        <div class="prop-row">
          <span class="prop-label">ID</span>
          <input type="text" class="prop-input" value="${el.id}" readonly />
        </div>
        <div class="prop-row">
          <span class="prop-label">Tag</span>
          <input type="text" class="prop-input" value="${el.tagName}" readonly />
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Fill</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="fill-color" value="${fillHex}" />
            <input type="text" class="prop-input" id="fill-hex" value="${fill}" />
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Opacity</span>
          <input type="range" class="prop-input" id="fill-alpha" min="0" max="1" step="0.01" value="${fillOpacity}" />
          <span id="fill-alpha-val" style="min-width:34px;text-align:right;">${Math.round(fillOpacity * 100)}%</span>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Stroke</div>
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-picker-row">
            <input type="color" class="color-swatch" id="stroke-color" value="${strokeHex}" />
            <input type="text" class="prop-input" id="stroke-hex" value="${stroke}" />
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Opacity</span>
          <input type="range" class="prop-input" id="stroke-alpha" min="0" max="1" step="0.01" value="${strokeOpacity}" />
          <span id="stroke-alpha-val" style="min-width:34px;text-align:right;">${Math.round(strokeOpacity * 100)}%</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-input" id="stroke-width" value="${strokeWidth}" min="0" step="0.5" />
        </div>
      </div>
    `;

    const fillColor = this.container.querySelector<HTMLInputElement>('#fill-color');
    const fillHexInput = this.container.querySelector<HTMLInputElement>('#fill-hex');
    const fillAlpha = this.container.querySelector<HTMLInputElement>('#fill-alpha');
    const fillAlphaVal = this.container.querySelector<HTMLElement>('#fill-alpha-val');
    const strokeColor = this.container.querySelector<HTMLInputElement>('#stroke-color');
    const strokeHexInput = this.container.querySelector<HTMLInputElement>('#stroke-hex');
    const strokeAlpha = this.container.querySelector<HTMLInputElement>('#stroke-alpha');
    const strokeAlphaVal = this.container.querySelector<HTMLElement>('#stroke-alpha-val');
    const strokeWidthInput = this.container.querySelector<HTMLInputElement>('#stroke-width');

    if (fillColor) fillColor.addEventListener('input', () => {
      el.attributes['fill'] = fillColor.value;
      if (fillHexInput) fillHexInput.value = fillColor.value;
      this.callbacks.onUpdateElement(el);
    });
    if (fillHexInput) fillHexInput.addEventListener('change', () => {
      el.attributes['fill'] = fillHexInput.value;
      if (fillColor) fillColor.value = fillHexInput.value;
      this.callbacks.onUpdateElement(el);
    });
    if (fillAlpha && fillAlphaVal) fillAlpha.addEventListener('input', () => {
      const val = parseFloat(fillAlpha.value);
      fillAlphaVal.innerText = `${Math.round(val * 100)}%`;
      el.attributes['fill-opacity'] = val.toString();
      this.callbacks.onUpdateElement(el);
    });
    if (strokeColor) strokeColor.addEventListener('input', () => {
      el.attributes['stroke'] = strokeColor.value;
      if (strokeHexInput) strokeHexInput.value = strokeColor.value;
      this.callbacks.onUpdateElement(el);
    });
    if (strokeHexInput) strokeHexInput.addEventListener('change', () => {
      el.attributes['stroke'] = strokeHexInput.value;
      if (strokeColor) strokeColor.value = strokeHexInput.value;
      this.callbacks.onUpdateElement(el);
    });
    if (strokeAlpha && strokeAlphaVal) strokeAlpha.addEventListener('input', () => {
      const val = parseFloat(strokeAlpha.value);
      strokeAlphaVal.innerText = `${Math.round(val * 100)}%`;
      el.attributes['stroke-opacity'] = val.toString();
      this.callbacks.onUpdateElement(el);
    });
    if (strokeWidthInput) strokeWidthInput.addEventListener('input', () => {
      el.attributes['stroke-width'] = strokeWidthInput.value;
      this.callbacks.onUpdateElement(el);
    });
  }

  // Render Node/Vertex Properties — built once, then updated in place via updateNodePropertiesInPlace()
  private renderNodeProperties(el: VectorElement, v: PathVertex): void {
    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Selected Vertex / Node</div>
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

  private bindInput(id: string, fn: (val: string) => void): void {
    const el = this.container.querySelector(`#${id}`) as HTMLInputElement;
    if (el) el.addEventListener('change', () => fn(el.value));
  }

  private bindClick(id: string, fn: () => void): void {
    const el = this.container.querySelector(`#${id}`);
    if (el) el.addEventListener('click', fn);
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
