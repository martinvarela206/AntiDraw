import { VectorModel, VectorElement, PathVertex, NodeType, Point } from './engine/VectorModel.js';
import { SelectionTool, HandleType } from './engine/SelectionTool.js';
import { NodeEditorTool } from './engine/NodeEditorTool.js';
import { CanvasManager } from './engine/CanvasManager.js';
import { BooleanOperations } from './engine/BooleanOperations.js';
import { Toolbar, ToolType } from './ui/Toolbar.js';
import { TopBar } from './ui/TopBar.js';
import { PropertyPanel } from './ui/PropertyPanel.js';
import './styles/main.css';

declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  setState(state: any): void;
  getState(): any;
};

const vscode = acquireVsCodeApi();

class AntiDrawApp {
  private model: VectorModel = new VectorModel();
  private selectionTool: SelectionTool = new SelectionTool();
  private nodeEditorTool: NodeEditorTool = new NodeEditorTool();
  private canvasMgr: CanvasManager = new CanvasManager();

  private toolbar!: Toolbar;
  private topBar!: TopBar;
  private propertyPanel!: PropertyPanel;

  private canvasWrapper!: HTMLElement;
  private svgCanvas!: SVGSVGElement;
  private overlaySvg!: SVGSVGElement;

  private isDragging: boolean = false;
  private dragStartPt: Point = { x: 0, y: 0 };
  private activeHandle: HandleType | 'move' | 'vertex' | 'handleIn' | 'handleOut' | 'pen' | 'shape' | 'marquee' | null = null;
  private initialElementState: VectorElement | null = null;
  private initialVertices: PathVertex[] = [];
  private initialElementsMap: Map<string, PathVertex[]> = new Map();
  private initialBox: any = null;

  public penNodeType: NodeType = 'asymmetric';
  private currentPenVertices: PathVertex[] = [];
  private penHoverPoint: Point | null = null;
  private penActiveVertexIdx: number | null = null;
  private penMovingVertexIdx: number | null = null;

  private shapeStartPt: Point | null = null;
  private isShiftPressed: boolean = false;
  // Flag: avoid re-parsing model when a change was sent from this webview itself
  private isUpdatingFromWebview: boolean = false;

  constructor() {
    this.initLayout();
    this.initEvents();
    this.notifyReady();
  }

  private initLayout(): void {
    const appEl = document.getElementById('app')!;
    // Use flat CSS grid structure directly inside #app
    appEl.innerHTML = `
      <div class="top-bar" id="top-bar"></div>
      <div class="left-toolbar" id="left-toolbar"></div>
      <div class="canvas-container" id="canvas-container">
        <div class="canvas-wrapper" id="canvas-wrapper">
          <canvas id="canvas-hit" style="position:absolute;top:0;left:0;display:none;"></canvas>
        </div>
      </div>
      <div class="right-panel" id="right-panel"></div>
      <div class="status-bar">
        <span id="status-tool">Tool: Select</span>
        <span id="status-coords">X: 0, Y: 0</span>
        <span id="status-info">Ready</span>
      </div>
    `;

    this.canvasWrapper = document.getElementById('canvas-wrapper')!;

    // Create svg-canvas and overlay-svg in JS and append to wrapper for guaranteed same-origin alignment
    const svgNS = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
    svgEl.id = 'svg-canvas';
    svgEl.style.cssText = 'position:absolute;top:0;left:0;display:block;overflow:visible;';
    this.canvasWrapper.appendChild(svgEl);
    this.svgCanvas = svgEl;

    const overlaySvgEl = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
    overlaySvgEl.id = 'overlay-svg';
    overlaySvgEl.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;';
    this.canvasWrapper.appendChild(overlaySvgEl);
    this.overlaySvg = overlaySvgEl;

    // Initialize Left Toolbar
    this.toolbar = new Toolbar(
      document.getElementById('left-toolbar')!,
      (tool) => this.handleToolChange(tool)
    );

    // Initialize Top Bar
    this.topBar = new TopBar(
      document.getElementById('top-bar')!,
      this.canvasMgr,
      {
        onAlign: (type) => this.handleAlign(type),
        onBoolean: (op) => this.handleBoolean(op),
        onZOrder: (action) => this.handleZOrder(action),
        onToggleGrid: () => {
          this.canvasMgr.showGrid = !this.canvasMgr.showGrid;
          this.topBar.update();
          this.render();
        },
        onToggleGuides: () => {
          this.canvasMgr.showGuides = !this.canvasMgr.showGuides;
          this.topBar.update();
          this.render();
        },
        onToggleSnap: (type) => {
          if (type === 'grid') this.canvasMgr.snapToGrid = !this.canvasMgr.snapToGrid;
          if (type === 'vertex') this.canvasMgr.snapToVertices = !this.canvasMgr.snapToVertices;
          this.topBar.update();
        },
      }
    );

    // Initialize Right Property Panel
    this.propertyPanel = new PropertyPanel(
      document.getElementById('right-panel')!,
      this.model,
      this.selectionTool,
      {
        onUpdateElement: (el) => {
          this.render();
          this.syncToHost();
        },
        onUpdateCanvas: () => {
          this.applyCanvasSize();
          this.render();
          this.syncToHost();
        },
        onNodeTypeChange: (type) => this.handleNodeTypeChange(type),
        onSplitNode: () => this.handleSplitNode(),
        onPenNodeTypeChange: (nodeType) => {
          this.penNodeType = nodeType;
          this.render();
        },
        onFinishPenPath: (close) => {
          this.finishPenPath(close);
        },
      }
    );
  }

  private initEvents(): void {
    // Webview messaging from VS Code Host
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'loadSvg') {
        // Skip re-parse if the webview itself triggered this change;
        // this preserves in-memory state (nodeType, etc.) that SVG cannot encode.
        if (this.isUpdatingFromWebview) {
          this.isUpdatingFromWebview = false;
          return;
        }
        this.model.loadSvgString(msg.text);
        this.applyCanvasSize();
        this.render();
      }
    });

    // Keyboard shortcuts & modifiers
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.isShiftPressed = true;

      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'v' || e.key === 'V') this.toolbar.setTool('select');
      if (e.key === 'n' || e.key === 'N') this.toolbar.setTool('node');
      if (e.key === 'p' || e.key === 'P') this.toolbar.setTool('pen');
      if (e.key === 'r' || e.key === 'R') this.toolbar.setTool('rect');
      if (e.key === 'e' || e.key === 'E') this.toolbar.setTool('ellipse');

      if (this.toolbar.activeTool === 'pen') {
        if (e.key === 'Enter') {
          this.finishPenPath(false);
        } else if (e.key === 'Escape') {
          this.currentPenVertices = [];
          this.penHoverPoint = null;
          this.render();
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectionTool.selectedElementIds.size > 0) {
          this.model.elements = this.model.elements.filter(
            (el) => !this.selectionTool.isSelected(el.id)
          );
          this.selectionTool.deselectAll();
          this.propertyPanel.resetPanelMode();
          this.render();
          this.syncToHost();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.isShiftPressed = false;
    });

    // Pointer events on Canvas Wrapper
    this.canvasWrapper.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvasWrapper.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvasWrapper.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvasWrapper.addEventListener('dblclick', (e) => this.onDoubleClick(e));
  }

  private notifyReady(): void {
    vscode.postMessage({ type: 'ready' });
  }

  private syncToHost(): void {
    this.isUpdatingFromWebview = true;
    const svgText = this.model.toSvgString();
    vscode.postMessage({ type: 'updateDocument', text: svgText });
  }

  private applyCanvasSize(): void {
    const { width, height, backgroundColor } = this.model.canvas;
    const vb = `0 0 ${width} ${height}`;
    this.model.canvas.viewBox = vb;

    // Set canvas-wrapper to exact pixel dimensions — never scale with window
    this.canvasWrapper.style.cssText = `
      position: relative;
      width: ${width}px;
      height: ${height}px;
      background-color: ${backgroundColor};
      box-shadow: 0 12px 40px rgba(0,0,0,0.6);
      border: 1px solid #2b2d3d;
      flex-shrink: 0;
      box-sizing: content-box;
      overflow: hidden;
    `;

    // Both SVGs: fixed pixel size equal to canvas, anchored at top-left
    [this.svgCanvas, this.overlaySvg].forEach((svg) => {
      svg.setAttribute('width', width.toString());
      svg.setAttribute('height', height.toString());
      svg.setAttribute('viewBox', vb);
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
      svg.style.position = 'absolute';
      svg.style.top = '0';
      svg.style.left = '0';
    });
  }

  private getCanvasPoint(e: PointerEvent | MouseEvent): Point {
    // Use svgCanvas.getBoundingClientRect for precise offset of the SVG on screen
    const rect = this.svgCanvas.getBoundingClientRect();
    const { width: canvasW, height: canvasH } = this.model.canvas;
    // Scale in case CSS has resized the SVG (should be 1:1 but handle edge cases)
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private handleToolChange(tool: ToolType): void {
    const statusTool = document.getElementById('status-tool');
    if (statusTool) statusTool.innerText = `Tool: ${tool}`;
    this.render();
  }

  private onPointerDown(e: PointerEvent): void {
    const pt = this.getCanvasPoint(e);
    this.dragStartPt = pt;
    this.isDragging = true;
    const activeTool = this.toolbar.activeTool;

    try {
      this.canvasWrapper.setPointerCapture(e.pointerId);
    } catch (_err) {}

    if (activeTool === 'select') {
      const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));

      // 1. Check hit on composite bounding box handles if one or more elements are selected
      if (selectedEls.length > 0) {
        const groupBox = this.selectionTool.getGroupBoundingBox(selectedEls);
        if (groupBox) {
          const handle = this.selectionTool.hitTestHandle(groupBox, pt, 14);
          if (handle) {
            this.activeHandle = handle;
            this.initialElementsMap.clear();
            selectedEls.forEach((el) => {
              if (el.vertices) {
                this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
              }
            });
            this.initialBox = groupBox;
            this.render();
            return;
          }
        }
      }

      // 2. Hit test vector elements under cursor
      const hit = this.selectionTool.hitTest(this.model.elements, pt);
      if (hit) {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+Click: Toggle selection (add if not present, remove if present)
          this.selectionTool.toggleSelect(hit.element.id);
        } else if (e.shiftKey) {
          // Shift+Click: Deselect clicked element
          this.selectionTool.deselect(hit.element.id);
        } else {
          // Normal Click: If element is not already in multi-selection, select only it
          if (!this.selectionTool.isSelected(hit.element.id)) {
            this.selectionTool.select(hit.element.id);
          }
          // If already selected, maintain multi-selection to allow moving together
        }

        const nowSelected = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
        if (nowSelected.length > 0) {
          this.activeHandle = 'move';
          this.initialElementsMap.clear();
          nowSelected.forEach((el) => {
            if (el.vertices) {
              this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
            }
          });
        }
        this.propertyPanel.resetPanelMode();
      } else {
        // 3. Clicked on empty canvas space: start Marquee selection
        this.shapeStartPt = pt;
        this.activeHandle = 'marquee';

        if (e.shiftKey) {
          // Shift+Drag on empty canvas: Deselect marquee
          this.selectionTool.isDeselectMarquee = true;
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl+Drag: Additive marquee (keep current selection)
          this.selectionTool.isDeselectMarquee = false;
        } else {
          // Normal drag: Clear previous selection and select marquee items
          this.selectionTool.deselectAll();
          this.selectionTool.isDeselectMarquee = false;
          this.propertyPanel.resetPanelMode();
          this.canvasMgr.isCanvasSelected = true;
        }
      }
    } else if (activeTool === 'node') {
      const selectedEl = this.model.elements.find(
        (el) => el.id === this.selectionTool.selectedElementId
      );

      if (selectedEl && selectedEl.vertices) {
        const hitNode = this.nodeEditorTool.hitTestVertices(
          selectedEl.vertices,
          pt,
          12,
          this.nodeEditorTool.selectedVertexId
        );
        if (hitNode) {
          this.nodeEditorTool.selectedVertexId = hitNode.vertex.id;
          this.nodeEditorTool.selectedHandleType = hitNode.type;
          this.activeHandle = hitNode.type;
          this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
        } else {
          // Click on empty canvas space in node mode: deselect vertex
          this.nodeEditorTool.selectedVertexId = null;
          this.nodeEditorTool.selectedHandleType = null;
        }
      }
    } else if (['rect', 'ellipse', 'line', 'star'].includes(activeTool)) {
      this.shapeStartPt = this.canvasMgr.snapPoint(pt);
      this.activeHandle = 'shape';
    } else if (activeTool === 'pen') {
      const snappedPt = this.canvasMgr.snapPoint(pt);

      // 1. Hit test on existing in-progress pen vertices
      let hitVertexIdx = -1;
      for (let i = 0; i < this.currentPenVertices.length; i++) {
        const v = this.currentPenVertices[i];
        if (Math.hypot(snappedPt.x - v.x, snappedPt.y - v.y) <= 12) {
          hitVertexIdx = i;
          break;
        }
      }

      if (hitVertexIdx >= 0) {
        if (e.shiftKey) {
          // Shift + Click: Delete this vertex
          this.currentPenVertices.splice(hitVertexIdx, 1);
          if (this.currentPenVertices.length > 0) {
            this.currentPenVertices[0].command = 'M';
          }
          this.render();
          return;
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl + Drag: Reposition this vertex
          this.penMovingVertexIdx = hitVertexIdx;
          this.activeHandle = 'pen';
          this.render();
          return;
        } else if (hitVertexIdx === 0 && this.currentPenVertices.length >= 3) {
          // Click on first vertex closes the path loop
          this.finishPenPath(true);
          return;
        }
      }

      // 2. Add new vertex with current configured penNodeType
      const isStart = this.currentPenVertices.length === 0;
      let hIn: Point | undefined = undefined;
      let hOut: Point | undefined = undefined;
      if (this.penNodeType !== 'asymmetric') {
        hIn = { x: snappedPt.x - 20, y: snappedPt.y };
        hOut = { x: snappedPt.x + 20, y: snappedPt.y };
      }

      const newV: PathVertex = {
        id: `v_pen_${this.currentPenVertices.length}`,
        x: snappedPt.x,
        y: snappedPt.y,
        handleIn: hIn,
        handleOut: hOut,
        nodeType: this.penNodeType,
        command: isStart ? 'M' : (this.penNodeType === 'asymmetric' ? 'L' : 'C'),
      };

      this.currentPenVertices.push(newV);
      this.penActiveVertexIdx = this.currentPenVertices.length - 1;
      this.activeHandle = 'pen';
      this.render();
    }

    this.render();
  }

  private onPointerMove(e: PointerEvent): void {
    const pt = this.getCanvasPoint(e);
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) coordsEl.innerText = `X: ${Math.round(pt.x)}, Y: ${Math.round(pt.y)}`;

    if (!this.isDragging || !this.activeHandle) {
      // Hover testing for cursors
      if (this.toolbar.activeTool === 'select') {
        const selectedEl = this.model.elements.find(
          (el) => el.id === this.selectionTool.selectedElementId
        );
        let cursor = 'default';

        if (selectedEl) {
          const box = this.selectionTool.getBoundingBox(selectedEl);
          if (box) {
            const h = this.selectionTool.hitTestHandle(box, pt, 14);
            if (h) {
              if (h === 'nw' || h === 'se') cursor = 'nwse-resize';
              else if (h === 'ne' || h === 'sw') cursor = 'nesw-resize';
              else if (h === 'n' || h === 's') cursor = 'ns-resize';
              else if (h === 'w' || h === 'e') cursor = 'ew-resize';
              else if (h === 'rotate') cursor = 'grab';
            }
          }
        }

        if (cursor === 'default') {
          const hit = this.selectionTool.hitTest(this.model.elements, pt);
          this.selectionTool.hoveredElementId = hit ? hit.element.id : null;
          if (hit) cursor = 'move';
        }

        this.canvasWrapper.style.cursor = cursor;
        this.renderOverlay();
      }
      return;
    }

    const dx = pt.x - this.dragStartPt.x;
    const dy = pt.y - this.dragStartPt.y;

    if (this.toolbar.activeTool === 'select') {
      if (this.activeHandle === 'marquee' && this.shapeStartPt) {
        // Update marquee drag rectangle
        const minX = Math.min(this.shapeStartPt.x, pt.x);
        const minY = Math.min(this.shapeStartPt.y, pt.y);
        const w = Math.abs(pt.x - this.shapeStartPt.x);
        const h = Math.abs(pt.y - this.shapeStartPt.y);
        this.selectionTool.marqueeRect = { x: minX, y: minY, width: w, height: h };
        this.renderOverlay();
        return;
      } else if (this.activeHandle === 'move' && this.initialElementsMap.size > 0) {
        // Move all selected elements together
        this.initialElementsMap.forEach((origVerts, id) => {
          const el = this.model.elements.find((e) => e.id === id);
          if (el) {
            el.vertices = origVerts.map((v) => ({
              ...v,
              x: v.x + dx,
              y: v.y + dy,
              handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
              handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
            }));
          }
        });
      } else if (this.initialBox && this.activeHandle !== 'move' && this.initialElementsMap.size > 0) {
        // Resize / Transform all selected elements together based on composite group box
        this.initialElementsMap.forEach((origVerts, id) => {
          const el = this.model.elements.find((e) => e.id === id);
          if (el) {
            el.vertices = this.selectionTool.transformVertices(
              origVerts,
              this.initialBox,
              this.activeHandle as HandleType,
              dx,
              dy
            );
          }
        });
      }
    } else if (this.toolbar.activeTool === 'node') {
      const selectedEl = this.model.elements.find((el) => this.selectionTool.isSelected(el.id));
      if (selectedEl && selectedEl.vertices) {
        if (this.activeHandle === 'vertex' && this.nodeEditorTool.selectedVertexId) {
          // Move Vertex with Endpoint Auto-Fusion (unless Shift is pressed)
          const result = this.nodeEditorTool.moveVertex(
            selectedEl.vertices,
            this.nodeEditorTool.selectedVertexId,
            pt,
            this.isShiftPressed,
            this.model.elements
          );
          selectedEl.vertices = result.updatedVertices;
        } else if (
          (this.activeHandle === 'handleIn' || this.activeHandle === 'handleOut') &&
          this.nodeEditorTool.selectedVertexId
        ) {
          // Move Bezier handle
          selectedEl.vertices = this.nodeEditorTool.moveHandle(
            selectedEl.vertices,
            this.nodeEditorTool.selectedVertexId,
            this.activeHandle,
            pt
          );
        }
      }
    } else if (this.toolbar.activeTool === 'pen') {
      if (this.isDragging && this.activeHandle === 'pen') {
        if (this.penMovingVertexIdx !== null && this.currentPenVertices[this.penMovingVertexIdx]) {
          // Ctrl+Drag: Move existing node
          this.currentPenVertices[this.penMovingVertexIdx].x = pt.x;
          this.currentPenVertices[this.penMovingVertexIdx].y = pt.y;
        } else if (this.penActiveVertexIdx !== null && this.currentPenVertices[this.penActiveVertexIdx]) {
          // Click & Drag while creating: pull handles dynamically
          const curV = this.currentPenVertices[this.penActiveVertexIdx];
          const dx = pt.x - curV.x;
          const dy = pt.y - curV.y;
          curV.handleOut = { x: pt.x, y: pt.y };
          const angle = Math.atan2(dy, dx) + Math.PI;
          const dist = curV.nodeType === 'symmetric'
            ? Math.hypot(dx, dy)
            : (curV.handleIn ? Math.hypot(curV.handleIn.x - curV.x, curV.handleIn.y - curV.y) : Math.hypot(dx, dy));
          curV.handleIn = {
            x: curV.x + Math.cos(angle) * dist,
            y: curV.y + Math.sin(angle) * dist,
          };
          if (curV.command === 'L' && (dx !== 0 || dy !== 0)) {
            curV.command = 'C';
          }
        }
      } else {
        // Hovering preview point for rubberband line
        this.penHoverPoint = pt;
      }
      this.renderOverlay();
      return;
    } else if (this.activeHandle === 'shape' && this.shapeStartPt) {
      // Dynamic shape drag preview
      this.previewShape(this.shapeStartPt, pt);
    }

    this.render();
  }

  private onPointerUp(e: PointerEvent): void {
    try {
      if (this.canvasWrapper.hasPointerCapture(e.pointerId)) {
        this.canvasWrapper.releasePointerCapture(e.pointerId);
      }
    } catch (_err) {}

    if (this.isDragging) {
      this.isDragging = false;

      if (this.activeHandle === 'pen') {
        this.penActiveVertexIdx = null;
        this.penMovingVertexIdx = null;
      } else if (this.activeHandle === 'marquee' && this.selectionTool.marqueeRect) {
        // Commit marquee selection
        const hitIds = this.selectionTool.hitTestMarquee(
          this.model.elements,
          this.selectionTool.marqueeRect
        );

        if (this.selectionTool.isDeselectMarquee) {
          hitIds.forEach((id) => this.selectionTool.deselect(id));
        } else if (e.ctrlKey || e.metaKey) {
          hitIds.forEach((id) => this.selectionTool.selectedElementIds.add(id));
        } else {
          this.selectionTool.selectedElementIds = new Set(hitIds);
        }

        this.selectionTool.marqueeRect = null;
        this.selectionTool.isDeselectMarquee = false;
        this.shapeStartPt = null;
        this.render();
      } else if (this.activeHandle === 'shape' && this.shapeStartPt) {
        const pt = this.getCanvasPoint(e);
        this.commitShape(this.shapeStartPt, pt);
        this.shapeStartPt = null;
        this.toolbar.setTool('select');
      }

      this.activeHandle = null;
      this.initialElementsMap.clear();
      this.syncToHost();
    }
  }

  private onDoubleClick(e: MouseEvent): void {
    if (this.toolbar.activeTool === 'pen') {
      this.finishPenPath(false);
      return;
    }

    const pt = this.getCanvasPoint(e);
    const selectedEl = this.model.elements.find(
      (el) => el.id === this.selectionTool.selectedElementId
    );

    // Double-click to add a vertex to path
    if (selectedEl && selectedEl.vertices) {
      const updated = this.nodeEditorTool.insertVertexOnPath(selectedEl.vertices, pt);
      if (updated) {
        selectedEl.vertices = updated;
        this.render();
        this.syncToHost();
      }
    }
  }

  private previewShape(start: Point, current: Point): void {
    const tool = this.toolbar.activeTool;
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);

    const tempId = 'temp_shape_preview';
    this.model.elements = this.model.elements.filter((el) => el.id !== tempId);

    const newEl: VectorElement = {
      id: tempId,
      tagName: tool === 'rect' ? 'rect' : 'ellipse',
      attributes: {
        id: tempId,
        x: x.toString(),
        y: y.toString(),
        width: w.toString(),
        height: h.toString(),
        cx: (x + w / 2).toString(),
        cy: (y + h / 2).toString(),
        rx: (w / 2).toString(),
        ry: (h / 2).toString(),
        fill: '#6366f1',
        'fill-opacity': '0.5',
        stroke: '#ffffff',
        'stroke-width': '2',
      },
    };

    // Store temporary shape vertices
    this.model.loadSvgString(this.model.toSvgString());
  }

  private commitShape(start: Point, current: Point): void {
    const tool = this.toolbar.activeTool;
    const w = Math.max(Math.abs(current.x - start.x), 10);
    const h = Math.max(Math.abs(current.y - start.y), 10);
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);

    const id = `el_${Date.now().toString(36)}`;
    const newEl: VectorElement = {
      id,
      tagName: tool === 'rect' ? 'rect' : 'ellipse',
      attributes: {
        id,
        x: x.toString(),
        y: y.toString(),
        width: w.toString(),
        height: h.toString(),
        cx: (x + w / 2).toString(),
        cy: (y + h / 2).toString(),
        rx: (w / 2).toString(),
        ry: (h / 2).toString(),
        fill: '#6366f1',
        stroke: '#ffffff',
        'stroke-width': '2',
      },
    };

    this.model.elements.push(newEl);
    this.selectionTool.selectedElementId = id;
    this.model.loadSvgString(this.model.toSvgString());
  }

  // Commit pen path to vector model elements
  private finishPenPath(close: boolean = false): void {
    if (this.currentPenVertices.length >= 2) {
      const id = `el_pen_${Date.now().toString(36)}`;
      const pathD = this.model.compilePathD(this.currentPenVertices, close);
      const newEl: VectorElement = {
        id,
        tagName: 'path',
        attributes: {
          id,
          d: pathD,
          fill: close ? '#4f46e5' : 'none',
          stroke: '#ffffff',
          'stroke-width': '2',
          'data-node-types': this.currentPenVertices.map((v) => v.nodeType).join(','),
        },
        vertices: JSON.parse(JSON.stringify(this.currentPenVertices)),
        isClosed: close,
      };

      this.model.elements.push(newEl);
      this.selectionTool.select(id);
      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.toolbar.setTool('select');
      this.render();
      this.syncToHost();
    } else {
      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.render();
    }
  }

  private handleAlign(type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
    if (selectedEls.length > 0) {
      const aligned = BooleanOperations.alignElements(
        selectedEls,
        type,
        this.model.canvas.width,
        this.model.canvas.height
      );
      aligned.forEach((aEl) => {
        const target = this.model.elements.find((e) => e.id === aEl.id);
        if (target) target.vertices = aEl.vertices;
      });
      this.render();
      this.syncToHost();
    }
  }

  private handleBoolean(op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine'): void {
    const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
    if (selectedEls.length < 2) return;

    let result: VectorElement | null = null;
    if (op === 'union') result = BooleanOperations.union(selectedEls[0], selectedEls[1]);
    if (op === 'subtract') result = BooleanOperations.subtract(selectedEls[0], selectedEls[1]);
    if (op === 'intersect') result = BooleanOperations.intersect(selectedEls[0], selectedEls[1]);
    if (op === 'exclude') result = BooleanOperations.exclude(selectedEls[0], selectedEls[1]);
    if (op === 'combine') result = BooleanOperations.combine(selectedEls);

    if (result) {
      const removeIds = new Set(selectedEls.map((e) => e.id));
      this.model.elements = this.model.elements.filter((e) => !removeIds.has(e.id));
      this.model.elements.push(result);
      this.selectionTool.select(result.id);
      this.render();
      this.syncToHost();
    }
  }

  private handleZOrder(action: 'front' | 'forward' | 'backward' | 'back'): void {
    const selectedIds = Array.from(this.selectionTool.selectedElementIds);
    selectedIds.forEach((id) => {
      this.model.elements = BooleanOperations.reorder(this.model.elements, id, action);
    });
    this.render();
    this.syncToHost();
  }

  private handleNodeTypeChange(type: NodeType): void {
    const selectedEl = this.model.elements.find(
      (el) => el.id === this.selectionTool.selectedElementId
    );
    if (selectedEl && selectedEl.vertices && this.nodeEditorTool.selectedVertexId) {
      selectedEl.vertices = this.nodeEditorTool.setNodeType(
        selectedEl.vertices,
        this.nodeEditorTool.selectedVertexId,
        type
      );
      // Preserve both selection references across render() — render() -> propertyPanel.update()
      // recreates panel DOM, which would otherwise lose the selectedVertexId state
      const savedElementId = this.selectionTool.selectedElementId;
      const savedVertexId = this.nodeEditorTool.selectedVertexId;
      this.render();
      this.selectionTool.selectedElementId = savedElementId;
      this.nodeEditorTool.selectedVertexId = savedVertexId;
      this.syncToHost();
    }
  }

  private handleSplitNode(): void {
    const selectedEl = this.model.elements.find(
      (el) => el.id === this.selectionTool.selectedElementId
    );
    if (selectedEl && selectedEl.vertices && this.nodeEditorTool.selectedVertexId) {
      selectedEl.vertices = this.nodeEditorTool.splitNode(
        selectedEl.vertices,
        this.nodeEditorTool.selectedVertexId
      );
      this.render();
      this.syncToHost();
    }
  }

  private render(): void {
    // Render actual SVG elements
    this.svgCanvas.innerHTML = '';
    const tempSvg = document.createElement('div');
    tempSvg.innerHTML = this.model.toSvgString();
    const parsedSvg = tempSvg.querySelector('svg');
    if (parsedSvg) {
      Array.from(parsedSvg.children).forEach((child) => {
        this.svgCanvas.appendChild(child.cloneNode(true));
      });
    }

    this.renderOverlay();
    
    // Update Right Property Panel
    const selectedEl = this.model.elements.find(
      (el) => el.id === this.selectionTool.selectedElementId
    );
    let selectedV: PathVertex | null = null;
    if (selectedEl && selectedEl.vertices && this.nodeEditorTool.selectedVertexId) {
      selectedV = selectedEl.vertices.find(
        (v) => v.id === this.nodeEditorTool.selectedVertexId
      ) || null;
    }
    this.propertyPanel.update(
      selectedV,
      this.toolbar.activeTool,
      this.penNodeType,
      this.currentPenVertices.length
    );
  }

  // Render Overlays: Grid lines, Guide lines, Bounding box + handles, Vertices & Bezier control handles
  private renderOverlay(): void {
    let html = '';

    // 1. Grid Lines Overlay
    if (this.canvasMgr.showGrid) {
      const step = this.canvasMgr.gridSpacing;
      const w = this.model.canvas.width;
      const h = this.model.canvas.height;

      for (let x = step; x < w; x += step) {
        html += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#2a2d3d" stroke-width="0.5" stroke-dasharray="2 2" />`;
      }
      for (let y = step; y < h; y += step) {
        html += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#2a2d3d" stroke-width="0.5" stroke-dasharray="2 2" />`;
      }
    }

    // 2. Guide Lines Overlay
    if (this.canvasMgr.showGuides) {
      this.canvasMgr.guides.forEach((g) => {
        if (g.orientation === 'horizontal') {
          html += `<line x1="0" y1="${g.position}" x2="${this.model.canvas.width}" y2="${g.position}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="4 2" />`;
        } else {
          html += `<line x1="${g.position}" y1="0" x2="${g.position}" y2="${this.model.canvas.height}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="4 2" />`;
        }
      });
    }

    // 3. Marquee Selection Rectangle Overlay
    if (this.selectionTool.marqueeRect) {
      const m = this.selectionTool.marqueeRect;
      const isDesel = this.selectionTool.isDeselectMarquee;
      html += `<rect x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" fill="${isDesel ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)'}" stroke="${isDesel ? '#ef4444' : '#3b82f6'}" stroke-width="1" stroke-dasharray="4 2" />`;
    }

    // 4. Hover Highlight (Tolerance 3px diameter / border highlight)
    if (
      this.selectionTool.hoveredElementId &&
      !this.selectionTool.isSelected(this.selectionTool.hoveredElementId)
    ) {
      const hEl = this.model.elements.find((e) => e.id === this.selectionTool.hoveredElementId);
      if (hEl && hEl.vertices) {
        const d = this.model.compilePathD(hEl.vertices, hEl.isClosed);
        html += `<path d="${d}" fill="none" stroke="#6366f1" stroke-width="2" stroke-dasharray="4 2" opacity="0.8" />`;
      }
    }

    // 5. Bounding Box & 8 Resize Handles + Rotation Handle for Selected Elements
    const selectedEls = this.model.elements.filter((e) => this.selectionTool.isSelected(e.id));

    if (selectedEls.length > 0) {
      const groupBox = this.selectionTool.getGroupBoundingBox(selectedEls);
      if (groupBox) {
        // Dotted Bounding Rectangle (1px stroke width)
        html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3 3" />`;

        // Handles (NW, N, NE, W, E, SW, S, SE)
        const handles = [
          { x: groupBox.x, y: groupBox.y },
          { x: groupBox.cx, y: groupBox.y },
          { x: groupBox.x + groupBox.width, y: groupBox.y },
          { x: groupBox.x, y: groupBox.cy },
          { x: groupBox.x + groupBox.width, y: groupBox.cy },
          { x: groupBox.x, y: groupBox.y + groupBox.height },
          { x: groupBox.cx, y: groupBox.y + groupBox.height },
          { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
        ];

        handles.forEach((h) => {
          html += `<rect x="${h.x - 3.5}" y="${h.y - 3.5}" width="7" height="7" fill="#ffffff" stroke="#0284c7" stroke-width="1" rx="1" />`;
        });

        // Rotation Handle
        html += `<line x1="${groupBox.cx}" y1="${groupBox.y}" x2="${groupBox.cx}" y2="${groupBox.y - 18}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2" />`;
        html += `<circle cx="${groupBox.cx}" cy="${groupBox.y - 18}" r="3.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1" />`;
      }

      // If multi-selected, draw individual subtle dashed bounds around each element
      if (selectedEls.length > 1) {
        selectedEls.forEach((el) => {
          const elBox = this.selectionTool.getBoundingBox(el);
          if (elBox) {
            html += `<rect x="${elBox.x}" y="${elBox.y}" width="${elBox.width}" height="${elBox.height}" fill="none" stroke="#60a5fa" stroke-width="0.75" stroke-dasharray="2 2" opacity="0.6" />`;
          }
        });
      }

      // 6. Node Edit Mode Vertices & Bezier Handles (for single selected vector)
      if (selectedEls.length === 1 && selectedEls[0].vertices && this.toolbar.activeTool === 'node') {
        const selectedEl = selectedEls[0];
        const verts = selectedEl.vertices;
        const selectedIdx = verts.findIndex((v) => v.id === this.nodeEditorTool.selectedVertexId);

        // Determine which vertex indices should show their handles:
        // selected + one before + one after (wrapping for closed paths)
        const showHandlesFor = new Set<number>();
        if (selectedIdx >= 0) {
          showHandlesFor.add(selectedIdx);
          // adjacent prev
          const prevIdx = selectedIdx > 0 ? selectedIdx - 1 : (selectedEl.isClosed ? verts.length - 1 : -1);
          if (prevIdx >= 0) showHandlesFor.add(prevIdx);
          // adjacent next
          const nextIdx = selectedIdx < verts.length - 1 ? selectedIdx + 1 : (selectedEl.isClosed ? 0 : -1);
          if (nextIdx >= 0) showHandlesFor.add(nextIdx);
        }

        verts.forEach((v, idx) => {
          const isSelected = idx === selectedIdx;

          // Render Bezier Handles only for selected + adjacent vertices
          if (showHandlesFor.has(idx)) {
            if (v.handleIn) {
              html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleIn.x}" y2="${v.handleIn.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" />`;
              html += `<circle cx="${v.handleIn.x}" cy="${v.handleIn.y}" r="3.5" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
            }
            if (v.handleOut) {
              html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleOut.x}" y2="${v.handleOut.y}" stroke="#a855f7" stroke-width="1" />`;
              html += `<circle cx="${v.handleOut.x}" cy="${v.handleOut.y}" r="3.5" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
            }
          }

          // All vertex anchor points shown in node mode
          html += `<circle cx="${v.x}" cy="${v.y}" r="${isSelected ? 4.5 : 3.5}" fill="${isSelected ? '#38bdf8' : '#ffffff'}" stroke="#0284c7" stroke-width="1" />`;
        });
      }
    }

    // 7. Pen Tool In-Progress Path & Rubberband Overlay
    if (this.currentPenVertices.length > 0) {
      const penD = this.model.compilePathD(this.currentPenVertices, false);
      html += `<path d="${penD}" fill="none" stroke="#38bdf8" stroke-width="2" />`;

      const lastV = this.currentPenVertices[this.currentPenVertices.length - 1];
      if (this.penHoverPoint) {
        html += `<line x1="${lastV.x}" y1="${lastV.y}" x2="${this.penHoverPoint.x}" y2="${this.penHoverPoint.y}" stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="3 3" />`;
      }

      this.currentPenVertices.forEach((v, idx) => {
        const isStart = idx === 0;

        // Render handles if present
        if (v.handleIn) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleIn.x}" y2="${v.handleIn.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" />`;
          html += `<circle cx="${v.handleIn.x}" cy="${v.handleIn.y}" r="3" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
        }
        if (v.handleOut) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleOut.x}" y2="${v.handleOut.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" />`;
          html += `<circle cx="${v.handleOut.x}" cy="${v.handleOut.y}" r="3" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
        }

        // Vertex marker (Start vertex highlighted in green/cyan)
        if (isStart) {
          html += `<circle cx="${v.x}" cy="${v.y}" r="5" fill="#10b981" stroke="#ffffff" stroke-width="1.5" />`;
        } else {
          html += `<rect x="${v.x - 3.5}" y="${v.y - 3.5}" width="7" height="7" fill="#38bdf8" stroke="#ffffff" stroke-width="1" rx="1" />`;
        }
      });
    }

    this.overlaySvg.innerHTML = html;
  }
}

// Initialize Application when DOM content is ready
document.addEventListener('DOMContentLoaded', () => {
  new AntiDrawApp();
});
