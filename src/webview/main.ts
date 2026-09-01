import { VectorModel, VectorElement, PathVertex, NodeType, Point } from './engine/VectorModel.js';
import { SelectionTool, HandleType } from './engine/SelectionTool.js';
import { NodeEditorTool } from './engine/NodeEditorTool.js';
import { CanvasManager, GuideLine, RulerConfig } from './engine/CanvasManager.js';
import { BooleanOperations } from './engine/BooleanOperations.js';
import { Toolbar, ToolType } from './ui/Toolbar.js';
import { TopBar } from './ui/TopBar.js';
import { PropertyPanel } from './ui/PropertyPanel.js';
import { RulerView } from './ui/RulerView.js';
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
  private rulerView!: RulerView;

  private canvasContainer!: HTMLElement;
  private canvasScrollArea!: HTMLElement;
  private canvasWrapper!: HTMLElement;
  private svgCanvas!: SVGSVGElement;
  private overlaySvg!: SVGSVGElement;

  private isDragging: boolean = false;
  private dragStartPt: Point = { x: 0, y: 0 };
  private activeHandle:
    | HandleType
    | 'move'
    | 'vertex'
    | 'handleIn'
    | 'handleOut'
    | 'pen'
    | 'shape'
    | 'marquee'
    | 'guide-create'
    | 'guide-move'
    | 'guide-pivot'
    | 'guide-rotate'
    | null = null;

  private initialElementState: VectorElement | null = null;
  private initialVertices: PathVertex[] = [];
  private initialElementsMap: Map<string, PathVertex[]> = new Map();
  private initialBox: any = null;
  private dragAnchorPt: Point = { x: 0, y: 0 };

  // Guide dragging state
  private dragGuideOrientation: 'horizontal' | 'vertical' = 'horizontal';
  private dragGuideCurrentPt: Point = { x: 0, y: 0 };
  private guideInitialState: GuideLine | null = null;
  private activeRotateArrowIdx: 1 | 2 = 1;

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
    // CSS grid structure inside #app
    appEl.innerHTML = `
      <div class="top-bar" id="top-bar"></div>
      <div class="left-toolbar" id="left-toolbar"></div>
      <div class="canvas-container" id="canvas-container">
        <div class="ruler-corner" id="ruler-corner" title="Ruler Settings (Scale &amp; Units)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 3H3v18h18V3z"/>
            <path d="M3 9h6M3 15h4M9 3v6M15 3v4"/>
          </svg>
        </div>
        <div class="ruler-top-container" id="ruler-top-container">
          <canvas class="ruler-canvas" id="ruler-top-canvas"></canvas>
        </div>
        <div class="ruler-left-container" id="ruler-left-container">
          <canvas class="ruler-canvas" id="ruler-left-canvas"></canvas>
        </div>
        <div class="canvas-scroll-area" id="canvas-scroll-area">
          <div class="canvas-wrapper" id="canvas-wrapper">
            <canvas id="canvas-hit" style="position:absolute;top:0;left:0;display:none;"></canvas>
          </div>
        </div>
      </div>
      <div class="right-panel" id="right-panel"></div>
      <div class="status-bar">
        <span id="status-tool">Tool: Select</span>
        <span id="status-coords">X: 0, Y: 0</span>
        <span id="status-info">Ready</span>
      </div>
    `;

    this.canvasContainer = document.getElementById('canvas-container')!;
    this.canvasScrollArea = document.getElementById('canvas-scroll-area')!;
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
          if (type === 'guide') this.canvasMgr.snapToGuides = !this.canvasMgr.snapToGuides;
          if (type === 'vertex') this.canvasMgr.snapToVertices = !this.canvasMgr.snapToVertices;
          this.topBar.update();
        },
      }
    );

    // Initialize Rulers
    this.rulerView = new RulerView(
      this.canvasContainer,
      this.canvasMgr,
      {
        onCornerClick: () => {
          this.toolbar.deselectAll();
          this.rulerView.setCornerActive(true);
          this.selectionTool.deselectAll();
          this.canvasMgr.selectedGuideId = null;
          this.canvasMgr.activeGuideTransformId = null;
          const statusTool = document.getElementById('status-tool');
          if (statusTool) statusTool.innerText = `Tool: Ruler`;
          this.propertyPanel.showRulerSettings(this.canvasMgr.rulerConfig);
          this.render();
        },
        onStartDragGuide: (orientation, clientPos) => {
          const pt = this.getCanvasPointFromClient(clientPos.x, clientPos.y);
          this.activeHandle = 'guide-create';
          this.dragGuideOrientation = orientation;
          this.dragGuideCurrentPt = pt;
          this.isDragging = true;
          this.canvasMgr.selectedGuideId = null;
          this.render();
        },
      }
    );

    // Sync rulers with scroll area
    this.canvasScrollArea.addEventListener('scroll', () => {
      this.syncRulerScroll();
    });

    // Initialize Right Property Panel
    this.propertyPanel = new PropertyPanel(
      document.getElementById('right-panel')!,
      this.model,
      this.selectionTool,
      {
        onUpdateElement: (_el) => {
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
        onUpdateRuler: (cfg) => {
          this.canvasMgr.rulerConfig = cfg;
          this.syncRulerScroll();
          this.syncMetadataToHost();
        },
        onUpdateGuide: (_guide) => {
          this.render();
          this.syncMetadataToHost();
        },
        onDeleteGuide: (id) => {
          this.canvasMgr.removeGuide(id);
          this.propertyPanel.resetPanelMode();
          this.render();
          this.syncMetadataToHost();
        },
        onClearAllGuides: () => {
          this.canvasMgr.guides = [];
          this.canvasMgr.selectedGuideId = null;
          this.canvasMgr.activeGuideTransformId = null;
          this.propertyPanel.resetPanelMode();
          this.render();
          this.syncMetadataToHost();
        },
        onUpdateShapeConfig: (cfg) => {
          this.canvasMgr.shapeConfig = cfg;
        },
      }
    );
  }

  private syncRulerScroll(): void {
    const wrapRect = this.canvasWrapper.getBoundingClientRect();
    const scrollRect = this.canvasScrollArea.getBoundingClientRect();
    const offsetX = wrapRect.left - scrollRect.left;
    const offsetY = wrapRect.top - scrollRect.top;
    this.rulerView.renderRulers(offsetX, offsetY);
  }

  private initEvents(): void {
    // Webview messaging from VS Code Host
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'loadSvg') {
        if (this.isUpdatingFromWebview) {
          this.isUpdatingFromWebview = false;
          return;
        }

        // Load sidecar metadata if available, otherwise clear guides
        if (msg.metadata) {
          this.canvasMgr.guides = Array.isArray(msg.metadata.guides) ? msg.metadata.guides : [];
          if (msg.metadata.ruler) {
            this.canvasMgr.rulerConfig = { ...this.canvasMgr.rulerConfig, ...msg.metadata.ruler };
          }
        } else {
          this.canvasMgr.guides = [];
        }

        this.model.loadSvgString(msg.text);
        this.applyCanvasSize();
        this.render();
      }
    });

    // Keyboard shortcuts & modifiers
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.isShiftPressed = true;

      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;

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
        // 1. Delete selected guide line
        if (this.canvasMgr.selectedGuideId) {
          this.canvasMgr.removeGuide(this.canvasMgr.selectedGuideId);
          this.propertyPanel.resetPanelMode();
          this.render();
          this.syncMetadataToHost();
          return;
        }

        // 2. Delete selected vector elements
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

    // Window level pointer events for dragging across boundaries
    window.addEventListener('pointermove', (e) => {
      if (this.isDragging && (this.activeHandle === 'guide-create' || this.activeHandle === 'guide-move' || this.activeHandle === 'guide-pivot' || this.activeHandle === 'guide-rotate')) {
        this.onPointerMove(e);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isDragging && (this.activeHandle === 'guide-create' || this.activeHandle === 'guide-move' || this.activeHandle === 'guide-pivot' || this.activeHandle === 'guide-rotate')) {
        this.onPointerUp(e);
      }
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

  private syncMetadataToHost(): void {
    vscode.postMessage({
      type: 'updateMetadata',
      metadata: {
        guides: this.canvasMgr.guides,
        ruler: this.canvasMgr.rulerConfig,
      },
    });
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

    // Update ruler sizes
    setTimeout(() => {
      this.rulerView.updateSize(width, height);
      this.syncRulerScroll();
    }, 0);
  }

  private getCanvasPoint(e: PointerEvent | MouseEvent): Point {
    return this.getCanvasPointFromClient(e.clientX, e.clientY);
  }

  private getCanvasPointFromClient(clientX: number, clientY: number): Point {
    const rect = this.svgCanvas.getBoundingClientRect();
    const { width: canvasW, height: canvasH } = this.model.canvas;
    const scaleX = canvasW / (rect.width || 1);
    const scaleY = canvasH / (rect.height || 1);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private handleToolChange(tool: ToolType): void {
    const statusTool = document.getElementById('status-tool');
    if (statusTool) statusTool.innerText = `Tool: ${tool}`;
    this.rulerView.setCornerActive(false);
    this.propertyPanel.resetPanelMode();
    if (tool !== 'select') {
      this.canvasMgr.selectedGuideId = null;
      this.canvasMgr.activeGuideTransformId = null;
    }
    this.render();
  }

  // Hit test for guide line under point
  private hitTestGuide(pt: Point, tolerance: number = 8): GuideLine | null {
    if (!this.canvasMgr.showGuides) return null;
    const threshold = tolerance / this.canvasMgr.zoom;

    for (let i = this.canvasMgr.guides.length - 1; i >= 0; i--) {
      const g = this.canvasMgr.guides[i];
      const rad = ((g.angle || 0) * Math.PI) / 180;
      const nx = -Math.sin(rad);
      const ny = Math.cos(rad);
      const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : this.model.canvas.width / 2);
      const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : this.model.canvas.height / 2);

      const dist = Math.abs(nx * (pt.x - px) + ny * (pt.y - py));
      if (dist <= threshold) {
        return g;
      }
    }
    return null;
  }

  // Calculate guide endpoints and control handles
  private getGuideGeometry(guide: GuideLine): {
    p1: Point;
    p2: Point;
    arrow1: Point;
    arrow2: Point;
    pivot: Point;
  } {
    const w = this.model.canvas.width;
    const h = this.model.canvas.height;
    const rad = ((guide.angle || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const px = guide.pivotX ?? (guide.orientation === 'vertical' ? guide.position : w / 2);
    const py = guide.pivotY ?? (guide.orientation === 'horizontal' ? guide.position : h / 2);

    // Large bounding span across canvas
    const span = Math.max(w, h) * 2;
    const p1 = { x: px - cos * span, y: py - sin * span };
    const p2 = { x: px + cos * span, y: py + sin * span };

    // Curved arrows positioned at visible bounds relative to pivot
    const arrowDist = Math.min(w, h) * 0.4;
    const arrow1 = { x: px - cos * arrowDist, y: py - sin * arrowDist };
    const arrow2 = { x: px + cos * arrowDist, y: py + sin * arrowDist };

    return { p1, p2, arrow1, arrow2, pivot: { x: px, y: py } };
  }

  private onPointerDown(e: PointerEvent): void {
    const pt = this.getCanvasPoint(e);
    this.dragStartPt = pt;
    this.isDragging = true;

    // If toolbar is currently in ruler or inactive state, switch back to select tool
    if (!this.toolbar.activeTool || (this.toolbar.activeTool as any) === '') {
      this.toolbar.setTool('select');
      this.rulerView.setCornerActive(false);
      this.propertyPanel.resetPanelMode();
    }

    const activeTool = this.toolbar.activeTool;

    try {
      this.canvasWrapper.setPointerCapture(e.pointerId);
    } catch (_err) {}

    if (activeTool === 'select') {
      // 1. Check if clicking on active Guide Transform controls (pivot or curved arrows)
      if (this.canvasMgr.activeGuideTransformId) {
        const activeG = this.canvasMgr.getGuide(this.canvasMgr.activeGuideTransformId);
        if (activeG) {
          const geom = this.getGuideGeometry(activeG);

          // Check pivot click
          if (Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 12) {
            this.activeHandle = 'guide-pivot';
            this.guideInitialState = { ...activeG };
            this.render();
            return;
          }

          // Check arrow 1 click
          if (Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16) {
            this.activeHandle = 'guide-rotate';
            this.activeRotateArrowIdx = 1;
            this.guideInitialState = { ...activeG };
            this.render();
            return;
          }

          // Check arrow 2 click
          if (Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16) {
            this.activeHandle = 'guide-rotate';
            this.activeRotateArrowIdx = 2;
            this.guideInitialState = { ...activeG };
            this.render();
            return;
          }
        }
      }

      // 2. Check hit on Guide Lines
      const hitGuide = this.hitTestGuide(pt, 8);
      if (hitGuide) {
        this.selectionTool.deselectAll();
        this.canvasMgr.selectedGuideId = hitGuide.id;
        this.activeHandle = 'guide-move';
        this.guideInitialState = { ...hitGuide };
        this.propertyPanel.showGuideSettings(hitGuide);
        this.render();
        return;
      } else {
        // Deselect guide if clicking elsewhere
        if (this.canvasMgr.selectedGuideId) {
          this.canvasMgr.selectedGuideId = null;
          this.canvasMgr.activeGuideTransformId = null;
          this.propertyPanel.resetPanelMode();
        }
      }

      // 3. Modifier-based selection (Ctrl: Toggle select/deselect; Shift: Deselect)
      if (e.ctrlKey || e.metaKey) {
        const hit = this.selectionTool.hitTest(this.model.elements, pt, this.canvasMgr.zoom);
        if (hit) {
          this.selectionTool.toggleSelect(hit.element.id);
          this.propertyPanel.resetPanelMode();
          this.render();
          return;
        } else {
          // Ctrl + Drag on canvas: Marquee selection that adds to selection
          this.shapeStartPt = pt;
          this.activeHandle = 'marquee';
          this.selectionTool.isDeselectMarquee = false;
          this.render();
          return;
        }
      }

      if (e.shiftKey) {
        const hit = this.selectionTool.hitTest(this.model.elements, pt, this.canvasMgr.zoom);
        if (hit) {
          this.selectionTool.deselect(hit.element.id);
          this.propertyPanel.resetPanelMode();
          this.render();
          return;
        } else {
          // Shift + Drag on canvas: Deselect marquee
          this.shapeStartPt = pt;
          this.activeHandle = 'marquee';
          this.selectionTool.isDeselectMarquee = true;
          this.render();
          return;
        }
      }

      // 4. Normal selection (No Ctrl / Shift)
      // 4a. Check hit directly on a vertex of any selected element (move from vertex)
      const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
      let hitVertex: Point | null = null;
      if (selectedEls.length > 0) {
        for (const selEl of selectedEls) {
          if (selEl.vertices) {
            for (const v of selEl.vertices) {
              if (Math.hypot(pt.x - v.x, pt.y - v.y) <= 8 / (this.canvasMgr.zoom || 1)) {
                hitVertex = { x: v.x, y: v.y };
                break;
              }
            }
            if (hitVertex) break;
          }
        }
      }

      if (hitVertex) {
        this.activeHandle = 'move';
        this.dragAnchorPt = hitVertex;
        this.initialElementsMap.clear();
        selectedEls.forEach((el) => {
          if (el.vertices) {
            this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
          }
        });
        this.propertyPanel.resetPanelMode();
        this.render();
        return;
      }

      // 4b. Check hit on composite bounding box handles if vector elements are selected
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

      // 4c. Hit test vector elements under cursor (fill or stroke/border)
      const hit = this.selectionTool.hitTest(this.model.elements, pt, this.canvasMgr.zoom);
      if (hit) {
        if (!this.selectionTool.isSelected(hit.element.id)) {
          this.selectionTool.select(hit.element.id);
        }

        const nowSelected = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
        if (nowSelected.length > 0) {
          this.activeHandle = 'move';
          this.dragAnchorPt = { x: pt.x, y: pt.y };
          this.initialElementsMap.clear();
          nowSelected.forEach((el) => {
            if (el.vertices) {
              this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
            }
          });
        }
        this.propertyPanel.resetPanelMode();
      } else {
        // 4d. Clicked on empty canvas space: start Marquee selection
        this.selectionTool.deselectAll();
        this.shapeStartPt = pt;
        this.activeHandle = 'marquee';
        this.selectionTool.isDeselectMarquee = false;
        this.propertyPanel.resetPanelMode();
        this.canvasMgr.isCanvasSelected = true;
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
          this.nodeEditorTool.selectedVertexId = null;
          this.nodeEditorTool.selectedHandleType = null;
        }
      }
    } else if (['rect', 'ellipse', 'line', 'star'].includes(activeTool)) {
      const otherVertices = this.getOtherVertices();
      this.shapeStartPt = this.canvasMgr.snapPoint(pt, otherVertices);
      this.activeHandle = 'shape';
    } else if (activeTool === 'pen') {
      const snappedPt = this.canvasMgr.snapPoint(pt);

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
          this.currentPenVertices.splice(hitVertexIdx, 1);
          if (this.currentPenVertices.length > 0) {
            this.currentPenVertices[0].command = 'M';
          }
          this.render();
          return;
        } else if (e.ctrlKey || e.metaKey) {
          this.penMovingVertexIdx = hitVertexIdx;
          this.activeHandle = 'pen';
          this.render();
          return;
        } else if (hitVertexIdx === 0 && this.currentPenVertices.length >= 3) {
          this.finishPenPath(true);
          return;
        }
      }

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
        command: isStart ? 'M' : this.penNodeType === 'asymmetric' ? 'L' : 'C',
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

    // Update cursor indicator on rulers
    this.rulerView.setCursorPos(pt.x, pt.y);

    if (!this.isDragging || !this.activeHandle) {
      // Hover testing for cursors
      if (this.toolbar.activeTool === 'select') {
        // Check active guide controls hover
        if (this.canvasMgr.activeGuideTransformId) {
          const activeG = this.canvasMgr.getGuide(this.canvasMgr.activeGuideTransformId);
          if (activeG) {
            const geom = this.getGuideGeometry(activeG);
            if (Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 12) {
              this.canvasWrapper.style.cursor = 'move';
              return;
            }
            if (
              Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16 ||
              Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16
            ) {
              this.canvasWrapper.style.cursor = 'grab';
              return;
            }
          }
        }

        // Check guide line hover
        const hitG = this.hitTestGuide(pt, 6);
        if (hitG) {
          this.canvasWrapper.style.cursor = hitG.orientation === 'vertical' ? 'ew-resize' : hitG.orientation === 'horizontal' ? 'ns-resize' : 'crosshair';
          return;
        }

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

    // Handle Guide interactions
    if (this.activeHandle === 'guide-create') {
      this.dragGuideCurrentPt = pt;
      this.renderOverlay();
      return;
    }

    if (this.activeHandle === 'guide-move' && this.canvasMgr.selectedGuideId && this.guideInitialState) {
      const g = this.canvasMgr.getGuide(this.canvasMgr.selectedGuideId);
      if (g) {
        if (g.orientation === 'horizontal') {
          g.position = Math.round(this.guideInitialState.position + dy);
          g.pivotY = g.position;
        } else if (g.orientation === 'vertical') {
          g.position = Math.round(this.guideInitialState.position + dx);
          g.pivotX = g.position;
        } else {
          g.pivotX = Math.round((this.guideInitialState.pivotX || 0) + dx);
          g.pivotY = Math.round((this.guideInitialState.pivotY || 0) + dy);
        }
      }
      this.render();
      return;
    }

    if (this.activeHandle === 'guide-pivot' && this.canvasMgr.selectedGuideId) {
      const g = this.canvasMgr.getGuide(this.canvasMgr.selectedGuideId);
      if (g) {
        g.pivotX = Math.round(pt.x);
        g.pivotY = Math.round(pt.y);
        if (g.orientation === 'horizontal') g.position = g.pivotY;
        if (g.orientation === 'vertical') g.position = g.pivotX;
      }
      this.render();
      return;
    }

    if (this.activeHandle === 'guide-rotate' && this.canvasMgr.selectedGuideId) {
      const g = this.canvasMgr.getGuide(this.canvasMgr.selectedGuideId);
      if (g) {
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : this.model.canvas.width / 2);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : this.model.canvas.height / 2);
        const angleRad = Math.atan2(pt.y - py, pt.x - px);
        let deg = Math.round((angleRad * 180) / Math.PI);
        if (deg < 0) deg += 360;

        // Snap angle to 0, 45, 90, 135, 180, 225, 270, 315 if within 3 degrees
        const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
        for (const sa of snapAngles) {
          if (Math.abs(deg - sa) <= 3) {
            deg = sa % 360;
            break;
          }
        }

        g.angle = deg;
        if (g.angle === 0 || g.angle === 180) {
          g.orientation = 'horizontal';
          g.position = g.pivotY;
        } else if (g.angle === 90 || g.angle === 270) {
          g.orientation = 'vertical';
          g.position = g.pivotX;
        } else {
          g.orientation = 'angled';
        }
      }
      this.render();
      return;
    }

    if (this.toolbar.activeTool === 'select') {
      if (this.activeHandle === 'marquee' && this.shapeStartPt) {
        const minX = Math.min(this.shapeStartPt.x, pt.x);
        const minY = Math.min(this.shapeStartPt.y, pt.y);
        const w = Math.abs(pt.x - this.shapeStartPt.x);
        const h = Math.abs(pt.y - this.shapeStartPt.y);
        this.selectionTool.marqueeRect = { x: minX, y: minY, width: w, height: h };
        this.renderOverlay();
        return;
      } else if (this.activeHandle === 'move' && this.initialElementsMap.size > 0) {
        // Collect other unselected vertices for snapToVertices
        const otherVertices: Point[] = [];
        this.model.elements.forEach((el) => {
          if (!this.selectionTool.isSelected(el.id) && el.vertices) {
            el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
          }
        });

        // Compute target position of the anchor and snap it
        const rawTarget: Point = { x: this.dragAnchorPt.x + dx, y: this.dragAnchorPt.y + dy };
        const snappedTarget = this.canvasMgr.snapPoint(rawTarget, otherVertices);
        const effectiveDx = snappedTarget.x - this.dragAnchorPt.x;
        const effectiveDy = snappedTarget.y - this.dragAnchorPt.y;

        this.initialElementsMap.forEach((origVerts, id) => {
          const el = this.model.elements.find((e) => e.id === id);
          if (el) {
            el.vertices = origVerts.map((v) => ({
              ...v,
              x: v.x + effectiveDx,
              y: v.y + effectiveDy,
              handleIn: v.handleIn ? { x: v.handleIn.x + effectiveDx, y: v.handleIn.y + effectiveDy } : undefined,
              handleOut: v.handleOut ? { x: v.handleOut.x + effectiveDx, y: v.handleOut.y + effectiveDy } : undefined,
            }));
          }
        });
      } else if (this.initialBox && this.activeHandle !== 'move' && this.initialElementsMap.size > 0) {
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
          const otherVertices: Point[] = [];
          this.model.elements.forEach((el) => {
            if (el.vertices) {
              el.vertices.forEach((v) => {
                if (v.id !== this.nodeEditorTool.selectedVertexId) {
                  otherVertices.push({ x: v.x, y: v.y });
                }
              });
            }
          });
          const snappedPt = this.canvasMgr.snapPoint(pt, otherVertices);
          const result = this.nodeEditorTool.moveVertex(
            selectedEl.vertices,
            this.nodeEditorTool.selectedVertexId,
            snappedPt,
            this.isShiftPressed,
            this.model.elements
          );
          selectedEl.vertices = result.updatedVertices;
        } else if (
          (this.activeHandle === 'handleIn' || this.activeHandle === 'handleOut') &&
          this.nodeEditorTool.selectedVertexId
        ) {
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
          this.currentPenVertices[this.penMovingVertexIdx].x = pt.x;
          this.currentPenVertices[this.penMovingVertexIdx].y = pt.y;
        } else if (this.penActiveVertexIdx !== null && this.currentPenVertices[this.penActiveVertexIdx]) {
          const curV = this.currentPenVertices[this.penActiveVertexIdx];
          const curDx = pt.x - curV.x;
          const curDy = pt.y - curV.y;
          curV.handleOut = { x: pt.x, y: pt.y };
          const angle = Math.atan2(curDy, curDx) + Math.PI;
          const dist = curV.nodeType === 'symmetric'
            ? Math.hypot(curDx, curDy)
            : (curV.handleIn ? Math.hypot(curV.handleIn.x - curV.x, curV.handleIn.y - curV.y) : Math.hypot(curDx, curDy));
          curV.handleIn = {
            x: curV.x + Math.cos(angle) * dist,
            y: curV.y + Math.sin(angle) * dist,
          };
          if (curV.command === 'L' && (curDx !== 0 || curDy !== 0)) {
            curV.command = 'C';
          }
        }
      } else {
        this.penHoverPoint = pt;
      }
      this.renderOverlay();
      return;
    } else if (this.activeHandle === 'shape' && this.shapeStartPt) {
      const otherVertices = this.getOtherVertices();
      const snappedPt = this.canvasMgr.snapPoint(pt, otherVertices);
      this.previewShape(this.shapeStartPt, snappedPt, e.shiftKey, e.ctrlKey, e.altKey);
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
      const pt = this.getCanvasPoint(e);

      // 1. Finishing Guide Creation from ruler drag
      if (this.activeHandle === 'guide-create') {
        const isHoriz = this.dragGuideOrientation === 'horizontal';
        const pos = Math.round(isHoriz ? pt.y : pt.x);

        // Check if dragged into canvas bounds (if dropped back inside ruler area, ignore)
        const isInside = isHoriz
          ? pt.y >= 0 && pt.y <= this.model.canvas.height
          : pt.x >= 0 && pt.x <= this.model.canvas.width;

        if (isInside) {
          const newG = this.canvasMgr.addGuide(
            this.dragGuideOrientation,
            pos,
            this.model.canvas.width,
            this.model.canvas.height
          );
          this.canvasMgr.selectedGuideId = newG.id;
          this.propertyPanel.showGuideSettings(newG);
          this.syncMetadataToHost();
        }
        this.activeHandle = null;
        this.render();
        return;
      }

      // 2. Finishing Guide Move (Check if dragged back to ruler to delete)
      if (this.activeHandle === 'guide-move' && this.canvasMgr.selectedGuideId) {
        const g = this.canvasMgr.getGuide(this.canvasMgr.selectedGuideId);
        if (g) {
          let shouldDelete = false;
          if (g.orientation === 'horizontal' && (pt.y < 0 || pt.y > this.model.canvas.height)) {
            shouldDelete = true;
          } else if (g.orientation === 'vertical' && (pt.x < 0 || pt.x > this.model.canvas.width)) {
            shouldDelete = true;
          }

          if (shouldDelete) {
            this.canvasMgr.removeGuide(g.id);
            this.propertyPanel.resetPanelMode();
          }
          this.syncMetadataToHost();
        }
        this.activeHandle = null;
        this.guideInitialState = null;
        this.render();
        return;
      }

      // 3. Finishing Guide Transform (Pivot / Rotate)
      if (this.activeHandle === 'guide-pivot' || this.activeHandle === 'guide-rotate') {
        this.activeHandle = null;
        this.guideInitialState = null;
        this.syncMetadataToHost();
        this.render();
        return;
      }

      if (this.activeHandle === 'pen') {
        this.penActiveVertexIdx = null;
        this.penMovingVertexIdx = null;
      } else if (this.activeHandle === 'marquee' && this.selectionTool.marqueeRect) {
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
        const otherVertices = this.getOtherVertices();
        const snappedPt = this.canvasMgr.snapPoint(pt, otherVertices);
        this.commitShape(this.shapeStartPt, snappedPt, e.shiftKey, e.ctrlKey, e.altKey);
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

    // Double-click on guide line -> enter angle / pivot transform mode
    const hitGuide = this.hitTestGuide(pt, 8);
    if (hitGuide) {
      this.selectionTool.deselectAll();
      this.canvasMgr.selectedGuideId = hitGuide.id;
      this.canvasMgr.activeGuideTransformId = hitGuide.id;
      this.propertyPanel.showGuideSettings(hitGuide);
      this.render();
      return;
    }

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

  private getOtherVertices(excludeIds: string[] = []): Point[] {
    const pts: Point[] = [];
    const excludeSet = new Set(excludeIds);
    this.model.elements.forEach((el) => {
      if (!excludeSet.has(el.id) && el.vertices) {
        el.vertices.forEach((v) => pts.push({ x: v.x, y: v.y }));
      }
    });
    return pts;
  }

  private calculateShapeBounds(
    start: Point,
    current: Point,
    shiftKey: boolean,
    ctrlKey: boolean,
    altKey: boolean
  ): { x: number; y: number; w: number; h: number; cx: number; cy: number; rx: number; ry: number } {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;
    const rawW = Math.abs(dx);
    const rawH = Math.abs(dy);

    let targetW = Math.max(rawW, 2);
    let targetH = Math.max(rawH, 2);

    // Priority: ctrlKey (1:1 ratio) takes precedence over altKey
    if (ctrlKey) {
      const size = Math.max(rawW, rawH, 2);
      targetW = size;
      targetH = size;
    } else if (altKey) {
      const ratioW = this.canvasMgr.shapeConfig?.aspectRatioW || 4;
      const ratioH = this.canvasMgr.shapeConfig?.aspectRatioH || 3;
      const ratio = ratioW / (ratioH || 1);

      if (rawW / ratio > rawH) {
        targetW = Math.max(rawW, 2);
        targetH = Math.max(targetW / ratio, 2);
      } else {
        targetH = Math.max(rawH, 2);
        targetW = Math.max(targetH * ratio, 2);
      }
    }

    let x = 0;
    let y = 0;
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let rx = 0;
    let ry = 0;

    if (shiftKey) {
      // Shift: Expand from center
      cx = start.x;
      cy = start.y;
      rx = targetW;
      ry = targetH;
      w = targetW * 2;
      h = targetH * 2;
      x = cx - targetW;
      y = cy - targetH;
    } else {
      // Corner-to-corner expansion
      x = sx > 0 ? start.x : start.x - targetW;
      y = sy > 0 ? start.y : start.y - targetH;
      w = targetW;
      h = targetH;
      cx = x + w / 2;
      cy = y + h / 2;
      rx = w / 2;
      ry = h / 2;
    }

    return { x, y, w, h, cx, cy, rx, ry };
  }

  private createShapeElement(
    tool: string,
    start: Point,
    current: Point,
    id: string,
    shiftKey: boolean = false,
    ctrlKey: boolean = false,
    altKey: boolean = false
  ): VectorElement {
    const isLine = tool === 'line';
    const isClosed = !isLine;
    let vertices: PathVertex[] = [];

    if (isLine) {
      let pStart = start;
      let pEnd = current;
      if (shiftKey) {
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        pStart = { x: start.x - dx, y: start.y - dy };
        pEnd = { x: start.x + dx, y: start.y + dy };
      }
      if (ctrlKey) {
        const dx = pEnd.x - pStart.x;
        const dy = pEnd.y - pStart.y;
        const len = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);
        const snap = Math.PI / 4;
        angle = Math.round(angle / snap) * snap;
        pEnd = {
          x: pStart.x + len * Math.cos(angle),
          y: pStart.y + len * Math.sin(angle),
        };
      }
      vertices = this.model.convertShapeToVertices('line', {
        x1: pStart.x.toString(),
        y1: pStart.y.toString(),
        x2: pEnd.x.toString(),
        y2: pEnd.y.toString(),
      });
    } else {
      const bounds = this.calculateShapeBounds(start, current, shiftKey, ctrlKey, altKey);

      if (tool === 'rect') {
        vertices = this.model.convertShapeToVertices('rect', {
          x: bounds.x.toString(),
          y: bounds.y.toString(),
          width: bounds.w.toString(),
          height: bounds.h.toString(),
          rx: (this.canvasMgr.shapeConfig?.rectCornerRadius || 0).toString(),
        });
      } else if (tool === 'ellipse') {
        vertices = this.model.convertShapeToVertices('ellipse', {
          cx: bounds.cx.toString(),
          cy: bounds.cy.toString(),
          rx: bounds.rx.toString(),
          ry: bounds.ry.toString(),
        });
      } else if (tool === 'star') {
        vertices = this.model.convertShapeToVertices('star', {
          cx: bounds.cx.toString(),
          cy: bounds.cy.toString(),
          rx: bounds.rx.toString(),
          ry: bounds.ry.toString(),
          points: (this.canvasMgr.shapeConfig?.starPoints || 5).toString(),
          innerRatio: (this.canvasMgr.shapeConfig?.starInnerRatio || 0.4).toString(),
        });
      }
    }

    const d = this.model.compilePathD(vertices, isClosed);
    return {
      id,
      tagName: 'path',
      attributes: {
        id,
        d,
        fill: isClosed ? '#6366f1' : 'none',
        stroke: '#ffffff',
        'stroke-width': '2',
        'data-node-types': vertices.map((v) => v.nodeType).join(','),
      },
      vertices,
      isClosed,
    };
  }

  private previewShape(
    start: Point,
    current: Point,
    shiftKey: boolean = false,
    ctrlKey: boolean = false,
    altKey: boolean = false
  ): void {
    const tempId = 'temp_shape_preview';
    this.model.elements = this.model.elements.filter((el) => el.id !== tempId);
    const newEl = this.createShapeElement(
      this.toolbar.activeTool,
      start,
      current,
      tempId,
      shiftKey,
      ctrlKey,
      altKey
    );
    newEl.attributes['fill-opacity'] = '0.5';
    this.model.elements.push(newEl);
    this.render();
  }

  private commitShape(
    start: Point,
    current: Point,
    shiftKey: boolean = false,
    ctrlKey: boolean = false,
    altKey: boolean = false
  ): void {
    const tempId = 'temp_shape_preview';
    this.model.elements = this.model.elements.filter((el) => el.id !== tempId);
    const id = `el_${Date.now().toString(36)}`;
    const newEl = this.createShapeElement(
      this.toolbar.activeTool,
      start,
      current,
      id,
      shiftKey,
      ctrlKey,
      altKey
    );
    this.model.elements.push(newEl);
    this.selectionTool.select(id);
    this.render();
    this.syncToHost();
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
    const selectedIds = Array.from(this.selectionTool.selectedElementIds);
    const selectedEls: VectorElement[] = [];
    selectedIds.forEach((id) => {
      const el = this.model.elements.find((e) => e.id === id);
      if (el) selectedEls.push(el);
    });

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

    const selectedGuide = this.canvasMgr.selectedGuideId
      ? this.canvasMgr.getGuide(this.canvasMgr.selectedGuideId) || null
      : null;

    this.propertyPanel.update(
      selectedV,
      this.toolbar.activeTool,
      this.penNodeType,
      this.currentPenVertices.length,
      selectedGuide
    );
  }

  // Render Overlays: Grid lines, Guide lines (1px constant screen width), Bounding box + handles, Vertices & Bezier control handles
  private renderOverlay(): void {
    let html = '';
    const w = this.model.canvas.width;
    const h = this.model.canvas.height;

    // 1. Grid Lines Overlay
    if (this.canvasMgr.showGrid) {
      const step = this.canvasMgr.gridSpacing;

      for (let x = step; x < w; x += step) {
        html += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#2a2d3d" stroke-width="0.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      }
      for (let y = step; y < h; y += step) {
        html += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#2a2d3d" stroke-width="0.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      }
    }

    // 2. Guide Lines Overlay (Always 1px width, inverted highlight on select, transform controls on double click)
    if (this.canvasMgr.showGuides) {
      this.canvasMgr.guides.forEach((g) => {
        const isSelected = g.id === this.canvasMgr.selectedGuideId;
        const isTransforming = g.id === this.canvasMgr.activeGuideTransformId;

        // Inverted color on selection (default cyan #00f0ff -> bright inverse red #ff1a40)
        const guideColor = isSelected ? '#ff1a40' : (g.color || '#00f0ff');
        const dashArray = isSelected ? 'none' : '4 2';
        const geom = this.getGuideGeometry(g);

        // Render full guide line across visible canvas span
        html += `<line x1="${geom.p1.x}" y1="${geom.p1.y}" x2="${geom.p2.x}" y2="${geom.p2.y}" stroke="${guideColor}" stroke-width="1" stroke-dasharray="${dashArray}" vector-effect="non-scaling-stroke" />`;

        // Render Transform Controls when in active Guide Double-Click Mode
        if (isTransforming) {
          // Center Pivot Node Handle
          html += `
            <circle cx="${geom.pivot.x}" cy="${geom.pivot.y}" r="6" fill="#1e293b" stroke="${guideColor}" stroke-width="2" vector-effect="non-scaling-stroke" />
            <circle cx="${geom.pivot.x}" cy="${geom.pivot.y}" r="2" fill="${guideColor}" />
            <line x1="${geom.pivot.x - 9}" y1="${geom.pivot.y}" x2="${geom.pivot.x + 9}" y2="${geom.pivot.y}" stroke="${guideColor}" stroke-width="1" vector-effect="non-scaling-stroke" />
            <line x1="${geom.pivot.x}" y1="${geom.pivot.y - 9}" x2="${geom.pivot.x}" y2="${geom.pivot.y + 9}" stroke="${guideColor}" stroke-width="1" vector-effect="non-scaling-stroke" />
          `;

          // Curved Double-Ended Arrows at both visible limits
          const arrowRot = (g.angle || 0) + 90;

          // Arrow 1
          html += `
            <g transform="translate(${geom.arrow1.x}, ${geom.arrow1.y}) rotate(${arrowRot})">
              <path d="M -8,-5 C -4,-10 4,-10 8,-5 M 8,-5 L 4,-7 M 8,-5 L 8,-1 M -8,-5 L -4,-7 M -8,-5 L -8,-1 M -8,5 C -4,10 4,10 8,5 M 8,5 L 4,7 M 8,5 L 8,1 M -8,5 L -4,7 M -8,5 L -8,1" fill="none" stroke="${guideColor}" stroke-width="2" vector-effect="non-scaling-stroke" />
              <circle cx="0" cy="0" r="14" fill="transparent" />
            </g>
          `;

          // Arrow 2
          html += `
            <g transform="translate(${geom.arrow2.x}, ${geom.arrow2.y}) rotate(${arrowRot})">
              <path d="M -8,-5 C -4,-10 4,-10 8,-5 M 8,-5 L 4,-7 M 8,-5 L 8,-1 M -8,-5 L -4,-7 M -8,-5 L -8,-1 M -8,5 C -4,10 4,10 8,5 M 8,5 L 4,7 M 8,5 L 8,1 M -8,5 L -4,7 M -8,5 L -8,1" fill="none" stroke="${guideColor}" stroke-width="2" vector-effect="non-scaling-stroke" />
              <circle cx="0" cy="0" r="14" fill="transparent" />
            </g>
          `;
        }
      });
    }

    // Dynamic Guide Drag Creation Preview
    if (this.activeHandle === 'guide-create') {
      const isHoriz = this.dragGuideOrientation === 'horizontal';
      if (isHoriz) {
        html += `<line x1="-500" y1="${this.dragGuideCurrentPt.y}" x2="${w + 500}" y2="${this.dragGuideCurrentPt.y}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      } else {
        html += `<line x1="${this.dragGuideCurrentPt.x}" y1="-500" x2="${this.dragGuideCurrentPt.x}" y2="${h + 500}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      }
    }

    // 3. Marquee Selection Rectangle Overlay
    if (this.selectionTool.marqueeRect) {
      const m = this.selectionTool.marqueeRect;
      const isDesel = this.selectionTool.isDeselectMarquee;
      html += `<rect x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" fill="${isDesel ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)'}" stroke="${isDesel ? '#ef4444' : '#3b82f6'}" stroke-width="1" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />`;
    }

    // 4. Hover Highlight
    if (
      this.selectionTool.hoveredElementId &&
      !this.selectionTool.isSelected(this.selectionTool.hoveredElementId)
    ) {
      const hEl = this.model.elements.find((e) => e.id === this.selectionTool.hoveredElementId);
      if (hEl && hEl.vertices) {
        const d = this.model.compilePathD(hEl.vertices, hEl.isClosed);
        html += `<path d="${d}" fill="none" stroke="#6366f1" stroke-width="2" stroke-dasharray="4 2" opacity="0.8" vector-effect="non-scaling-stroke" />`;
      }
    }

    // 5. Bounding Box & 8 Resize Handles + Rotation Handle for Selected Elements
    const selectedEls = this.model.elements.filter((e) => this.selectionTool.isSelected(e.id));

    if (selectedEls.length > 0) {
      const groupBox = this.selectionTool.getGroupBoundingBox(selectedEls);
      if (groupBox) {
        html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;

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

        handles.forEach((hPos) => {
          html += `<rect x="${hPos.x - 3.5}" y="${hPos.y - 3.5}" width="7" height="7" fill="#ffffff" stroke="#0284c7" stroke-width="1" rx="1" />`;
        });

        // Rotation Handle
        html += `<line x1="${groupBox.cx}" y1="${groupBox.y}" x2="${groupBox.cx}" y2="${groupBox.y - 18}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        html += `<circle cx="${groupBox.cx}" cy="${groupBox.y - 18}" r="3.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1" />`;
      }

      if (selectedEls.length > 1) {
        selectedEls.forEach((el) => {
          const elBox = this.selectionTool.getBoundingBox(el);
          if (elBox) {
            html += `<rect x="${elBox.x}" y="${elBox.y}" width="${elBox.width}" height="${elBox.height}" fill="none" stroke="#60a5fa" stroke-width="0.75" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke" />`;
          }
        });
      }

      // 6. Always visible vertices for all selected elements (Selection mode & Node mode)
      selectedEls.forEach((el) => {
        if (el.vertices) {
          const isNodeMode = this.toolbar.activeTool === 'node' && selectedEls.length === 1;
          const selectedVertexId = this.nodeEditorTool.selectedVertexId;

          el.vertices.forEach((v) => {
            const isSelectedVertex = isNodeMode && v.id === selectedVertexId;
            html += `<circle cx="${v.x}" cy="${v.y}" r="${isSelectedVertex ? 4.5 : 3.5}" fill="${isSelectedVertex ? '#38bdf8' : '#ffffff'}" stroke="#0284c7" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
          });
        }
      });

      // 7. Node Edit Mode Bezier Handles for Selected Vertex
      if (selectedEls.length === 1 && selectedEls[0].vertices && this.toolbar.activeTool === 'node') {
        const selectedEl = selectedEls[0];
        const verts = selectedEl.vertices!;
        const selectedIdx = verts.findIndex((v) => v.id === this.nodeEditorTool.selectedVertexId);

        const showHandlesFor = new Set<number>();
        if (selectedIdx >= 0) {
          showHandlesFor.add(selectedIdx);
          const prevIdx = selectedIdx > 0 ? selectedIdx - 1 : selectedEl.isClosed ? verts.length - 1 : -1;
          if (prevIdx >= 0) showHandlesFor.add(prevIdx);
          const nextIdx = selectedIdx < verts.length - 1 ? selectedIdx + 1 : selectedEl.isClosed ? 0 : -1;
          if (nextIdx >= 0) showHandlesFor.add(nextIdx);
        }

        verts.forEach((v, idx) => {
          if (showHandlesFor.has(idx)) {
            if (v.handleIn) {
              html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleIn.x}" y2="${v.handleIn.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${v.handleIn.x}" cy="${v.handleIn.y}" r="3.5" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
            }
            if (v.handleOut) {
              html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleOut.x}" y2="${v.handleOut.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${v.handleOut.x}" cy="${v.handleOut.y}" r="3.5" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
            }
          }
        });
      }
    }

    // 7. Pen Tool In-Progress Path & Rubberband Overlay
    if (this.currentPenVertices.length > 0) {
      const penD = this.model.compilePathD(this.currentPenVertices, false);
      html += `<path d="${penD}" fill="none" stroke="#38bdf8" stroke-width="2" vector-effect="non-scaling-stroke" />`;

      const lastV = this.currentPenVertices[this.currentPenVertices.length - 1];
      if (this.penHoverPoint) {
        html += `<line x1="${lastV.x}" y1="${lastV.y}" x2="${this.penHoverPoint.x}" y2="${this.penHoverPoint.y}" stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;
      }

      this.currentPenVertices.forEach((v, idx) => {
        const isStart = idx === 0;

        if (v.handleIn) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleIn.x}" y2="${v.handleIn.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${v.handleIn.x}" cy="${v.handleIn.y}" r="3" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
        }
        if (v.handleOut) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleOut.x}" y2="${v.handleOut.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${v.handleOut.x}" cy="${v.handleOut.y}" r="3" fill="#a855f7" stroke="#ffffff" stroke-width="1" />`;
        }

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
