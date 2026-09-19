import { VectorModel, VectorElement, PathVertex, NodeType, Point } from './engine/VectorModel.js';
import { SelectionTool } from './engine/SelectionTool.js';
import { NodeEditorTool } from './engine/NodeEditorTool.js';
import { CanvasManager, GuideLine, RulerConfig } from './engine/CanvasManager.js';
import { BooleanOperations } from './engine/BooleanOperations.js';
import { ViewportController } from './engine/ViewportController.js';
import { OverlayRenderer } from './engine/OverlayRenderer.js';
import { VsCodeBridge } from './bridge/VsCodeBridge.js';
import { ToolContext } from './tools/IToolHandler.js';
import { SelectToolHandler } from './tools/SelectToolHandler.js';
import { ShapeToolHandler } from './tools/ShapeToolHandler.js';
import { PolylineToolHandler } from './tools/PolylineToolHandler.js';
import { PenToolHandler } from './tools/PenToolHandler.js';
import { NodeToolHandler } from './tools/NodeToolHandler.js';
import { Toolbar, ToolType } from './ui/Toolbar.js';
import { TopBar } from './ui/TopBar.js';
import { PropertyPanel } from './ui/PropertyPanel.js';
import { RulerView } from './ui/RulerView.js';
import { ContextMenu, ContextMenuItem } from './ui/ContextMenu.js';
import { ConfirmationModal } from './ui/ConfirmationModal.js';
import { GridCanvasRenderer } from './ui/GridCanvasRenderer.js';
import { AppLayoutManager } from './ui/AppLayoutManager.js';
import { ClipboardService } from './services/ClipboardService.js';
import { HistoryService } from './services/HistoryService.js';
import { CanvasActionDispatcher } from './services/CanvasActionDispatcher.js';
import './styles/main.css';

class AntiDrawApp {
  private vscodeBridge: VsCodeBridge = VsCodeBridge.getInstance();
  private viewportCtrl!: ViewportController;
  private overlayRenderer: OverlayRenderer = new OverlayRenderer();
  private selectToolHandler!: SelectToolHandler;
  private shapeToolHandler!: ShapeToolHandler;
  private polylineToolHandler!: PolylineToolHandler;
  private penToolHandler!: PenToolHandler;
  private nodeToolHandler!: NodeToolHandler;

  private model: VectorModel = new VectorModel();
  private selectionTool: SelectionTool = new SelectionTool();
  private nodeEditorTool: NodeEditorTool = new NodeEditorTool();
  private canvasMgr: CanvasManager = new CanvasManager();

  private toolbar!: Toolbar;
  private topBar!: TopBar;
  private propertyPanel!: PropertyPanel;
  private rulerView!: RulerView;
  private contextMenu: ContextMenu = new ContextMenu();

  private canvasContainer!: HTMLElement;
  private canvasScrollArea!: HTMLElement;
  private canvasWrapper!: HTMLElement;
  private svgCanvas!: SVGSVGElement;
  /**
   * HISTORICAL PERFORMANCE ARCHITECTURE (FIX-12):
   * Isolated grid SVG layer retained for backwards compatibility.
   * Active rendering is delegated to the viewport-bounded `gridCanvasRenderer`.
   */
  private gridSvg!: SVGSVGElement;
  private gridCanvas!: HTMLCanvasElement;
  private gridCanvasRenderer!: GridCanvasRenderer;
  private overlaySvg!: SVGSVGElement;

  private pointerMoveRafId: number | null = null;
  private latestPointerMoveEvent: PointerEvent | null = null;

  private isDragging: boolean = false;
  private dragStartPt: Point = { x: 0, y: 0 };
  private activeHandle: 'origin-drag' | 'guide-create' | 'shape' | null = null;

  // Ruler drag state
  private dragGuideOrientation: 'horizontal' | 'vertical' = 'horizontal';
  private dragGuideCurrentPt: Point = { x: 0, y: 0 };
  private dragOriginPt: Point | null = null;

  private hasInitialCentered: boolean = false;
  private get isMiddlePanning(): boolean {
    return this.viewportCtrl?.isMiddlePanning ?? false;
  }

  private isShiftPressed: boolean = false;

  // Subsystems & Services
  private layoutMgr!: AppLayoutManager;
  private clipboardService!: ClipboardService;
  private historyService!: HistoryService;
  private actionDispatcher!: CanvasActionDispatcher;

  constructor() {
    this.initTools();
    this.initLayout();
    this.initClipboardService();
    this.initHistoryService();
    this.initActionDispatcher();
    this.initViewport();
    this.initEvents();
    this.notifyReady();
  }

  private initClipboardService(): void {
    this.clipboardService = new ClipboardService({
      model: this.model,
      selectionTool: this.selectionTool,
      canvasMgr: this.canvasMgr,
      pushUndo: () => this.pushUndo(),
      render: () => this.render(),
      syncToHost: () => this.syncToHost(),
      syncMetadataToHost: () => this.syncMetadataToHost(),
      onResetPropertyPanel: () => this.propertyPanel.resetPanelMode(),
      onShowGuideSettings: (guide: GuideLine) => this.propertyPanel.showGuideSettings(guide),
      onUpdatePropertyPanel: () => this.propertyPanel.update(null, 'select'),
    });
  }

  private initHistoryService(): void {
    this.historyService = new HistoryService({
      model: this.model,
      selectionTool: this.selectionTool,
      onResetPropertyPanel: () => this.propertyPanel.resetPanelMode(),
      render: () => this.render(),
      syncToHost: () => this.syncToHost(),
    });
  }

  private initActionDispatcher(): void {
    this.actionDispatcher = new CanvasActionDispatcher({
      model: this.model,
      selectionTool: this.selectionTool,
      pushUndo: () => this.pushUndo(),
      render: () => this.render(),
      syncToHost: () => this.syncToHost(),
      onResetPropertyPanel: () => this.propertyPanel.resetPanelMode(),
      onUpdatePropertyPanel: (activeTool: string) => this.propertyPanel.update(null, activeTool),
      getActiveTool: () => this.toolbar?.activeTool || 'select',
    });
  }

  private initTools(): void {
    const toolCtx: ToolContext = {
      model: this.model,
      selectionTool: this.selectionTool,
      canvasMgr: this.canvasMgr,
      pushUndo: () => this.pushUndo(),
      syncToHost: () => this.syncToHost(),
      render: () => this.render(),
      renderOverlay: () => this.renderOverlay(),
      snapPoint: (pt, others, excludeGuideId) => this.snapPoint(pt, others, excludeGuideId),
      getOtherVertices: (excludeIds) => this.getOtherVertices(excludeIds),
      setTool: (t) => this.toolbar.setTool(t),
      getActiveTool: () => this.toolbar.activeTool,
      applyCanvasSize: () => this.applyCanvasSize(),
      isPointerOverRuler: (clientX, clientY, orientation) => this.rulerView?.isPointOverRuler(clientX, clientY, orientation) ?? false,
    };
    this.selectToolHandler = new SelectToolHandler(toolCtx, this.nodeEditorTool, {
      onSelectionChanged: () => {
        this.propertyPanel.update(null, 'select');
      },
      onGuideSelected: (guide) => {
        this.rulerView.setCornerActive(false);
        this.propertyPanel.showGuideSettings(guide);
        this.syncMetadataToHost();
      },
      onClearPanelMode: () => {
        this.rulerView.setCornerActive(false);
        this.propertyPanel.resetPanelMode();
      },
      setCursor: (cursor) => {
        this.canvasWrapper.style.cursor = cursor;
        if (!this.isMiddlePanning) {
          this.canvasScrollArea.style.cursor = cursor === 'default' ? '' : cursor;
        }
      },
      syncMetadataToHost: () => {
        this.syncMetadataToHost();
      },
    });
    this.shapeToolHandler = new ShapeToolHandler(toolCtx);
    this.polylineToolHandler = new PolylineToolHandler(toolCtx);
    this.penToolHandler = new PenToolHandler(toolCtx);
    this.nodeToolHandler = new NodeToolHandler(toolCtx, this.nodeEditorTool, {
      onNodeSelected: (vertex, _element) => {
        this.propertyPanel.update(vertex, 'node');
      },
      onDeselectNode: () => {
        this.propertyPanel.resetPanelMode();
      },
    });
  }

  private initViewport(): void {
    this.viewportCtrl = new ViewportController({
      canvasScrollArea: this.canvasScrollArea,
      canvasWrapper: this.canvasWrapper,
      getSvgCanvas: () => this.svgCanvas,
      getRulerView: () => this.rulerView,
      canvasMgr: this.canvasMgr,
      model: this.model,
      onRender: () => this.render(),
      onApplyCanvasSize: () => this.applyCanvasSize(),
      onRenderOverlay: () => this.renderOverlay(),
      onZoomChanged: () => {
        this.syncMetadataToHostDebounced();
      },
      onCameraOffsetChanged: () => {
        this.syncMetadataToHostDebounced();
      }
    });

    this.canvasMgr.visibleBoundsProvider = () => this.viewportCtrl.getVisibleCanvasBounds();
  }

  private initLayout(): void {
    this.layoutMgr = new AppLayoutManager({
      canvasMgr: this.canvasMgr,
      model: this.model,
      selectionTool: this.selectionTool,
      onToolChange: (tool) => this.handleToolChange(tool),
      topBarCallbacks: {
        onUndo: () => this.undo(),
        onRedo: () => this.redo(),
        onAlign: (type) => this.handleAlign(type),
        onBoolean: (op) => this.handleBoolean(op),
        onZOrder: (action) => this.handleZOrder(action),
        onToggleRulers: () => {
          this.canvasMgr.showRulers = !this.canvasMgr.showRulers;
          this.canvasContainer.classList.toggle('no-rulers', !this.canvasMgr.showRulers);
          this.topBar.update();
          this.syncRulerScroll();
          this.render();
          this.syncMetadataToHost();
        },
        onToggleGrid: () => {
          this.canvasMgr.showGrid = !this.canvasMgr.showGrid;
          this.topBar.update();
          this.render();
          this.syncMetadataToHost();
        },
        onToggleGuides: () => {
          this.canvasMgr.showGuides = !this.canvasMgr.showGuides;
          this.topBar.update();
          this.render();
          this.syncMetadataToHost();
        },
        onToggleSnap: (type) => {
          if (type === 'grid') this.canvasMgr.snapToGrid = !this.canvasMgr.snapToGrid;
          if (type === 'guide') this.canvasMgr.snapToGuides = !this.canvasMgr.snapToGuides;
          if (type === 'vertex') this.canvasMgr.snapToVertices = !this.canvasMgr.snapToVertices;
          if (type === 'viewbox') this.canvasMgr.snapToViewBox = !this.canvasMgr.snapToViewBox;
          if (type === 'angular') this.canvasMgr.snapAngular = !this.canvasMgr.snapAngular;
          this.topBar.update();
          this.syncMetadataToHost();
        },
      },
      rulerCallbacks: {
        onCornerClick: () => {
          if (this.propertyPanel.currentPanelMode === 'ruler') {
            this.rulerView.setCornerActive(false);
            this.propertyPanel.resetPanelMode();
            this.toolbar.setTool('select');
            this.render();
            return;
          }
          this.toolbar.deselectAll();
          this.rulerView.setCornerActive(true);
          this.selectionTool.deselectAll();
          this.canvasMgr.selectedGuideId = null;
          this.canvasMgr.activeGuideTransformId = null;
          const statusTool = document.getElementById('status-tool');
          if (statusTool) statusTool.innerText = `Tool: Ruler`;
          this.propertyPanel.showRulerSettings(this.canvasMgr.rulerConfig, this.canvasMgr.gridAlignmentMode, this.canvasMgr.grids, this.canvasMgr.guides);
          this.render();
        },
        onResetOrigin: () => {
          this.canvasMgr.rulerConfig.originX = 0;
          this.canvasMgr.rulerConfig.originY = 0;
          this.syncRulerScroll();
          this.propertyPanel.showRulerSettings(this.canvasMgr.rulerConfig, this.canvasMgr.gridAlignmentMode, this.canvasMgr.grids, this.canvasMgr.guides);
          this.render();
          this.syncMetadataToHost();
        },
        onStartDragOrigin: (clientPos) => {
          const pt = this.getCanvasPointFromClient(clientPos.x, clientPos.y);
          this.activeHandle = 'origin-drag';
          this.dragOriginPt = pt;
          this.isDragging = true;
          this.canvasWrapper.style.cursor = 'crosshair';
          this.renderOverlay();
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
      },
      onScroll: () => {
        this.syncRulerScroll();
      },
      propertyPanelCallbacks: {
        onRenderOverlay: () => this.renderOverlay(),
        onUpdateElement: (_el) => {
          this.render();
          this.syncToHost();
        },
        onUpdateCanvas: () => {
          this.applyCanvasSize();
          this.render();
          this.syncToHost();
        },
        onNodeTypeChange: (type) => this.nodeToolHandler.handleNodeTypeChange(type),
        onSplitNode: () => this.nodeToolHandler.handleSplitNode(),
        onClosePath: () => this.nodeToolHandler.handleCloseOpenPath(),
        onConvertSegmentToLine: () => this.nodeToolHandler.handleConvertSegmentToLine(),
        onConvertSegmentToCurve: () => this.nodeToolHandler.handleConvertSegmentToCurve(),
        onPenNodeTypeChange: (nodeType) => {
          this.penToolHandler.penNodeType = nodeType;
          this.render();
        },
        onFinishPenPath: (close) => {
          this.penToolHandler.finishPenPath(close);
        },
        onFinishPolylinePath: (close) => {
          this.polylineToolHandler.finishPolylinePath(close);
        },
        onUpdateRuler: (cfg) => {
          this.canvasMgr.rulerConfig = cfg;
          this.syncRulerScroll();
          this.render();
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
        onGridAlignmentChange: (mode) => {
          this.canvasMgr.gridAlignmentMode = mode;
          this.updateStatusGridAlignment();
          this.render();
          this.syncMetadataToHost();
        },
        onAddGrid: (type) => {
          this.canvasMgr.addGrid(type, 20);
          this.propertyPanel.showRulerSettings(this.canvasMgr.rulerConfig, this.canvasMgr.gridAlignmentMode, this.canvasMgr.grids, this.canvasMgr.guides);
          this.render();
          this.syncMetadataToHost();
        },
        onRemoveGrid: (gridId) => {
          this.canvasMgr.removeGrid(gridId);
          this.propertyPanel.showRulerSettings(this.canvasMgr.rulerConfig, this.canvasMgr.gridAlignmentMode, this.canvasMgr.grids, this.canvasMgr.guides);
          this.render();
          this.syncMetadataToHost();
        },
        onUpdateGrid: (gridId, partial) => {
          this.canvasMgr.updateGrid(gridId, partial);
          this.render();
          this.syncMetadataToHost();
        },
        onReorderGrid: (gridId, direction) => {
          this.canvasMgr.reorderGrid(gridId, direction);
          this.propertyPanel.showRulerSettings(this.canvasMgr.rulerConfig, this.canvasMgr.gridAlignmentMode, this.canvasMgr.grids, this.canvasMgr.guides);
          this.render();
          this.syncMetadataToHost();
        },
        onSelectGuide: (guideId) => {
          this.canvasMgr.selectedGuideId = guideId;
          const g = this.canvasMgr.getGuide(guideId);
          if (g) {
            this.propertyPanel.showGuideSettings(g);
          }
          this.render();
        },
        onBoolean: (op) => this.handleBoolean(op),
        onStrokeToPath: () => this.handleStrokeToPath(),
        onConvertToCurves: (_el) => this.handleConvertToCurves(),
        onPushUndo: () => this.pushUndo(),
      },
    });

    this.canvasContainer = this.layoutMgr.canvasContainer;
    this.canvasScrollArea = this.layoutMgr.canvasScrollArea;
    this.canvasWrapper = this.layoutMgr.canvasWrapper;
    this.svgCanvas = this.layoutMgr.svgCanvas;
    this.gridSvg = this.layoutMgr.gridSvg;
    this.gridCanvas = this.layoutMgr.gridCanvas;
    this.gridCanvasRenderer = this.layoutMgr.gridCanvasRenderer;
    this.overlaySvg = this.layoutMgr.overlaySvg;
    this.toolbar = this.layoutMgr.toolbar;
    this.topBar = this.layoutMgr.topBar;
    this.rulerView = this.layoutMgr.rulerView;
    this.propertyPanel = this.layoutMgr.propertyPanel;
  }

  private syncRulerScroll(): void {
    if (this.viewportCtrl) {
      this.viewportCtrl.syncRulerScroll();
    }
  }

  private initEvents(): void {
    // Webview messaging from VS Code Host via VsCodeBridge
    this.vscodeBridge.onLoadSvg((payload) => {
      // Load sidecar metadata if available
      if (payload.metadata) {
        this.canvasMgr.guides = Array.isArray(payload.metadata.guides) ? payload.metadata.guides : [];
        if (payload.metadata.ruler) {
          this.canvasMgr.rulerConfig = { ...this.canvasMgr.rulerConfig, ...payload.metadata.ruler };
        }
        if (payload.metadata.showRulers !== undefined) this.canvasMgr.showRulers = payload.metadata.showRulers;
        if (Array.isArray(payload.metadata.grids)) this.canvasMgr.grids = payload.metadata.grids;
        if (payload.metadata.showGrid !== undefined) this.canvasMgr.showGrid = payload.metadata.showGrid;
        if (payload.metadata.showGuides !== undefined) this.canvasMgr.showGuides = payload.metadata.showGuides;
        if (payload.metadata.gridSpacing !== undefined) this.canvasMgr.gridSpacing = payload.metadata.gridSpacing;
        if (payload.metadata.gridAlignmentMode !== undefined) {
          this.canvasMgr.gridAlignmentMode = payload.metadata.gridAlignmentMode;
          this.updateStatusGridAlignment();
        }
        if (payload.metadata.snapToGrid !== undefined) this.canvasMgr.snapToGrid = payload.metadata.snapToGrid;
        if (payload.metadata.snapToGuides !== undefined) this.canvasMgr.snapToGuides = payload.metadata.snapToGuides;
        if (payload.metadata.snapToVertices !== undefined) this.canvasMgr.snapToVertices = payload.metadata.snapToVertices;
        if (payload.metadata.snapToViewBox !== undefined) this.canvasMgr.snapToViewBox = payload.metadata.snapToViewBox;
        if (payload.metadata.snapAngular !== undefined) this.canvasMgr.snapAngular = payload.metadata.snapAngular;
        if (payload.metadata.shapeConfig) {
          this.canvasMgr.shapeConfig = { ...this.canvasMgr.shapeConfig, ...payload.metadata.shapeConfig };
        }
        this.historyService.loadFromMetadata(payload.metadata);
        if (payload.metadata.zoom !== undefined) {
          this.canvasMgr.zoom = payload.metadata.zoom;
        }
        if (payload.metadata.isAspectRatioLocked !== undefined) {
          this.selectionTool.isAspectRatioLocked = payload.metadata.isAspectRatioLocked;
        }
        if (payload.metadata.elementPivots) {
          this.selectionTool.elementPivots = new Map(Object.entries(payload.metadata.elementPivots));
        }
        this.canvasContainer.classList.toggle('no-rulers', !this.canvasMgr.showRulers);
        this.topBar.update();
      } else {
        this.canvasMgr.guides = [];
      }

      this.model.loadSvgString(payload.text);
      this.applyCanvasSize();
      this.render();
      if (!this.hasInitialCentered) {
        this.hasInitialCentered = true;
        setTimeout(() => {
          if (payload.metadata?.cameraOffset) {
            this.viewportCtrl.cameraOffset = { ...payload.metadata.cameraOffset };
            this.viewportCtrl.applyCameraTransform();
            this.viewportCtrl.syncRulerScroll();
          } else {
            this.recenterViewBox();
          }
        }, 40);
      }
    });

    // Keyboard shortcuts & modifiers
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.isShiftPressed = true;

      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;

      if (e.key === 'v' || e.key === 'V') this.toolbar.setTool('select');
      if (e.key === 't' || e.key === 'T') this.toolbar.setTool('stroke');
      if (e.key === 'n' || e.key === 'N') this.toolbar.setTool('node');
      if (!e.ctrlKey && !e.metaKey && (e.key === 'y' || e.key === 'Y')) this.toolbar.setTool('polyline');
      if (e.key === 'p' || e.key === 'P') this.toolbar.setTool('pen');
      if (e.key === 'r' || e.key === 'R') this.toolbar.setTool('rect');
      if (e.key === 'o' || e.key === 'O') this.toolbar.setTool('circle');
      if (e.key === 'e' || e.key === 'E') this.toolbar.setTool('ellipse');
      if (e.key === 'l' || e.key === 'L') this.toolbar.setTool('line');
      if (e.key === 'g' || e.key === 'G') this.toolbar.setTool('polygon');
      if (e.key === 's' || e.key === 'S') this.toolbar.setTool('star');
      if (!e.ctrlKey && !e.metaKey && (e.key === 'z' || e.key === 'Z')) this.toolbar.setTool('zoom');

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && (e.key === 'c' || e.key === 'C')) {
        if (this.selectionTool.selectedElementIds.size > 0 || this.canvasMgr.selectedGuideId) {
          e.preventDefault();
          this.copySelection();
          return;
        }
      }

      if (isCtrl && (e.key === 'q' || e.key === 'Q')) {
        if (this.selectionTool.selectedElementIds.size > 0) {
          e.preventDefault();
          this.handleConvertToCurves();
          return;
        }
      }

      if (isCtrl && (e.key === 'x' || e.key === 'X')) {
        if (this.selectionTool.selectedElementIds.size > 0 || this.canvasMgr.selectedGuideId) {
          e.preventDefault();
          this.cutSelection();
          return;
        }
      }

      if (isCtrl && (e.key === 'v' || e.key === 'V')) {
        if (this.clipboardService.hasContent) {
          e.preventDefault();
          this.pasteClipboard();
          return;
        }
      }

      if (isCtrl && (e.key === 'd' || e.key === 'D')) {
        if (this.selectionTool.selectedElementIds.size > 0 || this.canvasMgr.selectedGuideId) {
          e.preventDefault();
          this.duplicateSelection();
          return;
        }
      }

      if (isCtrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }

      if (isCtrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        this.redo();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        const hasActiveDrag = !!(
          this.isDragging ||
          this.nodeToolHandler.isDragging ||
          this.shapeToolHandler.shapeStartPt ||
          this.activeHandle === 'shape' ||
          (this.toolbar.activeTool === 'pen' && (this.penToolHandler.isDragging || this.penToolHandler.vertexCount > 0)) ||
          (this.toolbar.activeTool === 'polyline' && this.polylineToolHandler.vertexCount > 0) ||
          this.selectionTool.marqueeRect ||
          this.activeHandle === 'guide-create' ||
          this.activeHandle === 'origin-drag'
        );

        if (hasActiveDrag) {
          this.cancelCurrentAction();
        } else {
          // Deselect elements/nodes/guides and switch to canvas/viewbox properties panel
          this.selectionTool.deselectAll();
          this.canvasMgr.selectedGuideId = null;
          this.canvasMgr.activeGuideTransformId = null;
          this.nodeEditorTool.selectedVertexId = null;
          this.nodeEditorTool.selectedHandleType = null;
          if (this.toolbar.activeTool === 'node') {
            this.toolbar.setTool('select');
          }
          this.propertyPanel.resetPanelMode();
          this.render();
        }
        return;
      }

      if (this.toolbar.activeTool === 'polyline') {
        if (e.key === 'Enter') {
          this.polylineToolHandler.finishPolylinePath(false);
          return;
        }
      }

      if (this.toolbar.activeTool === 'pen') {
        if (e.key === 'Enter') {
          this.penToolHandler.finishPenPath(false);
          return;
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

        // 1b. Delete selected vertex in node editor
        if (this.toolbar.activeTool === 'node' && this.nodeEditorTool.selectedVertexId) {
          if (this.nodeToolHandler.deleteSelectedVertex()) {
            this.propertyPanel.update(null, 'node');
            return;
          }
        }

        // 2. Delete selected vector elements
        if (this.selectionTool.selectedElementIds.size > 0) {
          this.pushUndo();
          this.model.elements = this.model.elements.filter(
            (el) => !this.selectionTool.isSelected(el.id)
          );
          this.selectionTool.deselectAll();
          this.propertyPanel.resetPanelMode();
          this.render();
          this.syncToHost();
        }
      }

      // Arrow Key Nudge for selected vectors with modifier multiplier steps
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (this.selectionTool.selectedElementIds.size > 0) {
          e.preventDefault();

          let step = 1;
          const ctrl = e.ctrlKey || e.metaKey;
          const shift = e.shiftKey;
          const alt = e.altKey;

          if (shift && alt) {
            step = 100;
          } else if (ctrl && alt) {
            step = 75;
          } else if (ctrl && shift) {
            step = 50;
          } else if (alt) {
            step = 25;
          } else if (shift) {
            step = 10;
          } else if (ctrl) {
            step = 5;
          } else {
            step = 1;
          }

          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowRight') dx = step;
          if (e.key === 'ArrowUp') dy = -step;
          if (e.key === 'ArrowDown') dy = step;

          // If in Node Tool and a specific vertex is selected, move only that vertex
          const activeEl = this.model.elements.find(
            (el) => el.id === this.selectionTool.selectedElementId
          );
          if (
            this.toolbar.activeTool === 'node' &&
            activeEl &&
            activeEl.vertices &&
            this.nodeEditorTool.selectedVertexId
          ) {
            const v = activeEl.vertices.find(
              (n) => n.id === this.nodeEditorTool.selectedVertexId
            );
            if (v) {
              v.x += dx;
              v.y += dy;
              if (v.handleIn) {
                v.handleIn.x += dx;
                v.handleIn.y += dy;
              }
              if (v.handleOut) {
                v.handleOut.x += dx;
                v.handleOut.y += dy;
              }
              activeEl.attributes.d = this.model.compilePathD(
                activeEl.vertices,
                activeEl.isClosed
              );
              this.render();
              this.syncToHost();
              return;
            }
          }

          // Otherwise translate all selected vector elements
          this.model.elements.forEach((el) => {
            if (this.selectionTool.isSelected(el.id) && el.vertices) {
              el.vertices.forEach((v) => {
                v.x += dx;
                v.y += dy;
                if (v.handleIn) {
                  v.handleIn.x += dx;
                  v.handleIn.y += dy;
                }
                if (v.handleOut) {
                  v.handleOut.x += dx;
                  v.handleOut.y += dy;
                }
              });
              el.attributes.d = this.model.compilePathD(el.vertices, el.isClosed);
            }
          });

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
      if (this.isDragging) {
        this.onPointerMove(e);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isDragging) {
        this.onPointerUp(e);
      }
    });

    // Window-level focus loss and pointer cancellation (e.g. Windows Snipping Tool with delay, Alt+Tab, OS modals)
    window.addEventListener('blur', () => {
      this.handleLostFocusOrCancel();
    });
    window.addEventListener('pointercancel', () => {
      this.handleLostFocusOrCancel();
    });

    // Right-click / Context Menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const pt = this.getCanvasPoint(e);
      const z = this.canvasMgr.zoom || 1;
      const hit = this.selectionTool.hitTest(this.model.elements, pt, z);

      if (hit) {
        if (!this.selectionTool.isSelected(hit.element.id)) {
          this.selectionTool.select(hit.element.id);
          this.propertyPanel.update(null, this.toolbar.activeTool);
          this.render();
        }
      }

      const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
      if (selectedEls.length > 0) {
        const hasParametric = selectedEls.some((el) => this.model.isParametricElement(el));
        const canSimplifyToPrimitive = selectedEls.some((el) => !this.model.isParametricElement(el) && el.tagName === 'path' && this.model.detectPrimitiveFromPath(el) !== null);

        const menuItems: ContextMenuItem[] = [
          {
            id: 'convert-to-path',
            label: 'Convertir a Curvas',
            shortcut: 'Ctrl+Q',
            disabled: !hasParametric,
            action: () => this.handleConvertToCurves(),
          },
          {
            id: 'convert-to-primitive',
            label: 'Simplificar a Primitivas SVG',
            disabled: !canSimplifyToPrimitive,
            action: () => this.handleConvertToPrimitives(),
          },
          { id: 'separator', label: '', action: () => {} },
          {
            id: 'cut',
            label: 'Cortar',
            shortcut: 'Ctrl+X',
            action: () => this.cutSelection(),
          },
          {
            id: 'copy',
            label: 'Copiar',
            shortcut: 'Ctrl+C',
            action: () => this.copySelection(),
          },
          {
            id: 'paste',
            label: 'Pegar',
            shortcut: 'Ctrl+V',
            disabled: !this.clipboardService.hasContent,
            action: () => this.pasteClipboard(),
          },
          {
            id: 'duplicate',
            label: 'Duplicar',
            shortcut: 'Ctrl+D',
            action: () => this.duplicateSelection(),
          },
          { id: 'separator', label: '', action: () => {} },
          {
            id: 'bring-to-front',
            label: 'Traer al Frente',
            action: () => this.handleZOrder('front'),
          },
          {
            id: 'send-to-back',
            label: 'Enviar al Fondo',
            action: () => this.handleZOrder('back'),
          },
          { id: 'separator', label: '', action: () => {} },
          {
            id: 'delete',
            label: 'Eliminar',
            shortcut: 'Supr',
            action: () => {
              this.pushUndo();
              this.model.elements = this.model.elements.filter((el) => !this.selectionTool.isSelected(el.id));
              this.selectionTool.deselectAll();
              this.propertyPanel.resetPanelMode();
              this.render();
              this.syncToHost();
            },
          },
        ];

        this.contextMenu.show(e.clientX, e.clientY, menuItems);
      } else {
        this.contextMenu.hide();
        this.cancelCurrentAction();
      }
    };
    this.canvasContainer.addEventListener('contextmenu', handleContextMenu);
    this.canvasWrapper.addEventListener('contextmenu', handleContextMenu);
    this.canvasScrollArea.addEventListener('contextmenu', handleContextMenu);

    // Pointer events on Canvas Wrapper
    this.canvasWrapper.addEventListener('pointerdown', (e) => {
      if (e.button === 1) return; // Allow middle click to bubble up for panning
      e.stopPropagation();
      this.onPointerDown(e);
    });
    this.canvasWrapper.addEventListener('pointermove', (e) => {
      e.stopPropagation();
      this.onPointerMove(e);
    });
    this.canvasWrapper.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.onPointerUp(e);
    });
    this.canvasWrapper.addEventListener('pointercancel', () => {
      this.handleLostFocusOrCancel();
    });
    this.canvasWrapper.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.onDoubleClick(e);
    });

    // Pointer events on Canvas Scroll Area (delegating interaction for guides extending outside canvasWrapper)
    this.canvasScrollArea.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        this.cancelCurrentAction();
        return;
      }
      if (e.button === 0) {
        this.onPointerDown(e);
      }
    });
    this.canvasScrollArea.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isMiddlePanning && !this.isDragging) {
        this.onPointerMove(e);
      }
    });
    this.canvasScrollArea.addEventListener('pointerup', (e: PointerEvent) => {
      if (e.button === 0 && this.isDragging) {
        this.onPointerUp(e);
      }
    });
    this.canvasScrollArea.addEventListener('pointercancel', () => {
      this.handleLostFocusOrCancel();
    });
    this.canvasScrollArea.addEventListener('dblclick', (e: MouseEvent) => {
      this.onDoubleClick(e);
    });

    // ARCHITECTURAL RATIONALE: Persistent Status Bar Grid-Ruler Alignment (FEAT-StatusBarGridAlign)
    // Synchronizes the grid-ruler alignment mode directly from the global bottom status bar.
    // Why this exists:
    // Previously, users had to click on empty canvas space to deselect active elements and reveal
    // the CanvasInspector or RulerGuideInspector panels just to switch between 'origin' and 'cell-center'.
    // Exposing these controls in the persistent status bar enables immediate toggling during active
    // vector manipulation without interrupting selection context or multi-element transforms.
    this.initStatusGridAlignment();
  }

  /**
   * Synchronizes the active visual state of status bar grid alignment buttons with canvasMgr.gridAlignmentMode.
   */
  public updateStatusGridAlignment(): void {
    const originBtn = document.getElementById('status-grid-align-origin');
    const centerBtn = document.getElementById('status-grid-align-center');
    const mode = this.canvasMgr.gridAlignmentMode;
    if (originBtn) {
      if (mode === 'origin') {
        originBtn.classList.add('active');
      } else {
        originBtn.classList.remove('active');
      }
    }
    if (centerBtn) {
      if (mode === 'cell-center') {
        centerBtn.classList.add('active');
      } else {
        centerBtn.classList.remove('active');
      }
    }
  }

  /**
   * Initializes event listeners for status bar grid alignment buttons.
   */
  private initStatusGridAlignment(): void {
    const originBtn = document.getElementById('status-grid-align-origin');
    const centerBtn = document.getElementById('status-grid-align-center');
    originBtn?.addEventListener('click', () => {
      this.canvasMgr.gridAlignmentMode = 'origin';
      this.updateStatusGridAlignment();
      this.render();
      this.syncMetadataToHost();
    });
    centerBtn?.addEventListener('click', () => {
      this.canvasMgr.gridAlignmentMode = 'cell-center';
      this.updateStatusGridAlignment();
      this.render();
      this.syncMetadataToHost();
    });
    this.updateStatusGridAlignment();
  }

  public recenterViewBox(): void {
    this.viewportCtrl.recenterViewBox();
  }

  public zoomAtClientPointByFactor(clientX: number, clientY: number, factor: number): void {
    this.viewportCtrl.zoomAtClientPointByFactor(clientX, clientY, factor);
  }

  public zoomAtClientPoint(clientX: number, clientY: number, delta: number): void {
    this.viewportCtrl.zoomAtClientPoint(clientX, clientY, delta);
  }

  public setZoom(zoom: number): void {
    this.viewportCtrl.setZoom(zoom);
  }

  private applyCameraTransform(): void {
    this.viewportCtrl.applyCameraTransform();
  }

  private updateStatusZoom(): void {
    this.viewportCtrl.updateStatusZoom();
  }

  private notifyReady(): void {
    this.vscodeBridge.notifyReady();
  }

  private syncToHost(): void {
    const svgText = this.model.toSvgString();
    this.vscodeBridge.updateDocument(svgText);
    this.syncMetadataToHost();
  }

  /**
   * ARCHITECTURAL RATIONALE: Companion JSON Metadata File Segregation
   * Why metadata is not injected into the SVG XML directly:
   * 1. Standard SVG Portability: Storing proprietary editor state (guidelines, ruler origins,
   *    grid spacing, snapping toggles) inside the SVG document via custom XML attributes
   *    (e.g., data-antidraw-*) causes schema validation warnings and risks being stripped by
   *    strict SVG processors, minifiers, or other vector editors (Figma, Illustrator, Inkscape).
   * 2. Clean Vector Code: Exported SVGs remain 100% clean and web-ready without proprietary clutter.
   * 3. Persistence: By syncing editor state to a companion <name>.json file managed by the extension host,
   *    all workspace customizations survive session restarts without polluting the vector graphic.
   */
  private syncMetadataToHost(): void {
    this.vscodeBridge.updateMetadata({
      grids: this.canvasMgr.grids,
      guides: this.canvasMgr.guides,
      ruler: this.canvasMgr.rulerConfig,
      showRulers: this.canvasMgr.showRulers,
      showGrid: this.canvasMgr.showGrid,
      showGuides: this.canvasMgr.showGuides,
      gridSpacing: this.canvasMgr.gridSpacing,
      gridAlignmentMode: this.canvasMgr.gridAlignmentMode,
      snapToGrid: this.canvasMgr.snapToGrid,
      snapToGuides: this.canvasMgr.snapToGuides,
      snapToVertices: this.canvasMgr.snapToVertices,
      snapToViewBox: this.canvasMgr.snapToViewBox,
      snapAngular: this.canvasMgr.snapAngular,
      shapeConfig: this.canvasMgr.shapeConfig,
      undoStack: this.historyService.undoStackSnapshots,
      redoStack: this.historyService.redoStackSnapshots,
      zoom: this.canvasMgr.zoom,
      cameraOffset: this.viewportCtrl ? { x: this.viewportCtrl.cameraOffset.x, y: this.viewportCtrl.cameraOffset.y } : undefined,
      isAspectRatioLocked: this.selectionTool.isAspectRatioLocked,
      elementPivots: Object.fromEntries(this.selectionTool.elementPivots),
    });
  }

  private metadataSyncTimeout: any = null;
  private syncMetadataToHostDebounced(): void {
    if (this.metadataSyncTimeout !== null) {
      clearTimeout(this.metadataSyncTimeout);
    }
    this.metadataSyncTimeout = setTimeout(() => {
      this.syncMetadataToHost();
      this.metadataSyncTimeout = null;
    }, 300);
  }

  private lastAppliedVb: string = '';
  private lastAppliedDisplayW: number = -1;
  private lastAppliedDisplayH: number = -1;

  /**
   * ARCHITECTURAL RATIONALE: Zero-Reflow Dynamic Workspace Sizing
   *
   * Previous Implementation:
   * Replaced `this.canvasWrapper.style.cssText` on every wheel tick, forcing the browser to re-parse 10 CSS
   * rules. In addition, called `setAttribute('viewBox')`, `this.updateGridLayer()`, `this.rulerView.updateSize()`,
   * and `this.syncRulerScroll()` redundantly, multiplying redraw passes by 3x on every animation frame.
   *
   * Solution:
   * Directly sets `style.width` and `style.height` only when pixel values change.
   * SVG attributes (`viewBox`, `width`, `height`) and ruler dimensions are updated strictly when `workBounds`
   * mutates, bypassing SVG DOM mutation completely during camera zoom and maintaining 60/120/144 FPS.
   */
  private applyCanvasSize(): void {
    const zoom = this.canvasMgr.zoom || 1.0;
    const workBounds = this.model.getWorkingCanvasBounds(16);
    const displayW = Math.round(workBounds.width * zoom);
    const displayH = Math.round(workBounds.height * zoom);
    const vb = `${workBounds.minX} ${workBounds.minY} ${workBounds.width} ${workBounds.height}`;

    if (this.lastAppliedDisplayW !== displayW || this.lastAppliedDisplayH !== displayH) {
      this.lastAppliedDisplayW = displayW;
      this.lastAppliedDisplayH = displayH;
      this.canvasWrapper.style.width = `${displayW}px`;
      this.canvasWrapper.style.height = `${displayH}px`;
      this.svgCanvas.style.width = `${displayW}px`;
      this.svgCanvas.style.height = `${displayH}px`;
      this.overlaySvg.style.width = `${displayW}px`;
      this.overlaySvg.style.height = `${displayH}px`;
    }

    if (this.lastAppliedVb !== vb) {
      this.lastAppliedVb = vb;
      const wStr = workBounds.width.toString();
      const hStr = workBounds.height.toString();
      [this.svgCanvas, this.overlaySvg].forEach((svg) => {
        svg.setAttribute('width', wStr);
        svg.setAttribute('height', hStr);
        svg.setAttribute('viewBox', vb);
      });
      this.rulerView.updateSize(workBounds.width, workBounds.height);
    }
  }

  private lastGridCacheKey: string = '';

  /**
   * ARCHITECTURAL RATIONALE: Viewport-Bounded Canvas Grid Update
   *
   * Replaces SVG `<pattern>` DOM tiling inside `#grid-svg` with high-performance 2D Canvas rendering.
   * By delegating grid drawing to `GridCanvasRenderer`, the canvas memory is strictly bound to the
   * viewport size (e.g. 1920x1080) rather than scaling to 30,000px at 3000% zoom.
   * Line width and dash patterns remain invariant to camera zoom (always 1 crisp screen pixel),
   * and frame rates remain pegged at 60/120/144 FPS during continuous zooming and panning.
   */
  public updateGridLayer(force: boolean = false): void {
    if (!this.gridCanvasRenderer || !this.canvasScrollArea) return;

    const vb = this.model.getViewBoxBounds();
    const workBounds = this.model.getWorkingCanvasBounds(16);
    const originX = vb.minX + (this.canvasMgr.rulerConfig.originX || 0);
    const originY = vb.minY + (this.canvasMgr.rulerConfig.originY || 0);
    const zoom = this.canvasMgr.zoom || 1.0;

    this.gridCanvasRenderer.render({
      scrollArea: this.canvasScrollArea,
      canvasMgr: this.canvasMgr,
      workBounds,
      cameraOffset: this.viewportCtrl?.cameraOffset || { x: 0, y: 0 },
      zoom,
      originX,
      originY,
    });
  }

  // Snap point accounting for dynamic ruler (0,0) origin offset and artboard viewBox bounds
  private snapPoint(pt: Point, otherVertices: Point[] = [], excludeGuideId?: string): Point {
    const vb = this.model.getViewBoxBounds();
    const origin = {
      x: vb.minX + (this.canvasMgr.rulerConfig.originX || 0),
      y: vb.minY + (this.canvasMgr.rulerConfig.originY || 0),
    };
    return this.canvasMgr.snapPoint(pt, otherVertices, origin, vb, excludeGuideId);
  }

  private getCanvasPoint(e: PointerEvent | MouseEvent): Point {
    return this.getCanvasPointFromClient(e.clientX, e.clientY);
  }

  private getCanvasPointFromClient(clientX: number, clientY: number): Point {
    return this.viewportCtrl.getCanvasPointFromClient(clientX, clientY);
  }

  private handleToolChange(tool: ToolType): void {
    const statusTool = document.getElementById('status-tool');
    if (statusTool) statusTool.innerText = `Tool: ${tool}`;
    this.rulerView.setCornerActive(false);
    this.propertyPanel.resetPanelMode();
    if (tool !== 'select' && tool !== 'stroke') {
      this.canvasMgr.selectedGuideId = null;
      this.canvasMgr.activeGuideTransformId = null;
    }
    if (tool !== 'polyline') {
      this.polylineToolHandler.deactivate();
    }
    if (!['rect', 'circle', 'ellipse', 'line', 'polygon', 'star'].includes(tool)) {
      this.shapeToolHandler.cancel();
    }
    if (tool !== 'pen') {
      this.penToolHandler.deactivate();
    }
    if (tool !== 'node') {
      this.nodeToolHandler.deactivate();
    }
    this.render();
  }

  private cancelCurrentAction(): void {
    let needsRender = false;

    this.contextMenu?.hide();

    // 1. Select tool cancellation
    if (this.selectToolHandler.cancel()) {
      needsRender = true;
    }

    // 2. Node tool vertex or handle manipulation
    if (this.nodeToolHandler.cancel()) {
      needsRender = true;
    }

    // 3. Shape creation
    if (this.shapeToolHandler.cancel()) {
      this.activeHandle = null;
      this.isDragging = false;
      needsRender = true;
    }

    // 4. Pen tool in-progress path or dragging
    if (this.toolbar.activeTool === 'pen' && this.penToolHandler.cancel()) {
      this.activeHandle = null;
      this.isDragging = false;
      needsRender = true;
    }

    // 5. Polyline tool in-progress path
    if (this.toolbar.activeTool === 'polyline' && this.polylineToolHandler.cancel()) {
      this.isDragging = false;
      this.activeHandle = null;
      needsRender = true;
    }

    // 6. Ruler guide creation
    if (this.activeHandle === 'guide-create') {
      this.dragGuideCurrentPt = { x: 0, y: 0 };
      this.activeHandle = null;
      this.isDragging = false;
      needsRender = true;
    }

    // 7. Ruler origin drag
    if (this.activeHandle === 'origin-drag') {
      this.dragOriginPt = null;
      this.activeHandle = null;
      this.isDragging = false;
      needsRender = true;
    }

    this.isDragging = false;
    this.activeHandle = null;
    if (this.pointerMoveRafId !== null) {
      cancelAnimationFrame(this.pointerMoveRafId);
      this.pointerMoveRafId = null;
    }
    this.latestPointerMoveEvent = null;

    this.canvasWrapper.style.cursor = '';
    this.canvasScrollArea.style.cursor = '';

    if (needsRender) {
      this.render();
    } else {
      this.renderOverlay();
    }
  }

  /**
   * ARCHITECTURAL RATIONALE: Global Focus Loss & Pointer Cancellation Purge (FIX-LostFocusGhost)
   * When OS-level capture occurs (such as Windows Snipping Tool with delay, Alt+Tab, system alerts),
   * the webview window immediately fires 'blur' and in-flight pointer streams receive 'pointercancel'.
   * Because 'pointerup' is never received, drag states and preview ghosts in #overlay-svg would remain
   * permanently frozen on the canvas.
   * This handler cancels all active tool drags, releases pointer capture, and purges the ephemeral overlay.
   */
  private handleLostFocusOrCancel(): void {
    if (
      this.isDragging ||
      this.nodeToolHandler.isDragging ||
      this.shapeToolHandler.shapeStartPt !== null ||
      this.activeHandle !== null ||
      (this.toolbar.activeTool === 'pen' && this.penToolHandler.isDragging)
    ) {
      this.cancelCurrentAction();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      this.cancelCurrentAction();
      return;
    }
    if (e.button !== 0) return;
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

    if (activeTool === 'select' || activeTool === 'stroke') {
      if (this.selectToolHandler.onPointerDown(e, pt)) {
        return;
      }
    } else if (activeTool === 'node') {
      if (this.nodeToolHandler.onPointerDown(e, pt)) {
        return;
      }
    } else if (['rect', 'circle', 'ellipse', 'line', 'polygon', 'star'].includes(activeTool)) {
      if (this.shapeToolHandler.onPointerDown(e, pt)) {
        this.activeHandle = 'shape';
        return;
      }
    } else if (activeTool === 'polyline') {
      if (this.polylineToolHandler.onPointerDown(e, pt)) {
        this.render();
        return;
      }
    } else if (activeTool === 'pen') {
      if (this.penToolHandler.onPointerDown(e, pt)) {
        return;
      }
    } else if (activeTool === 'zoom') {
      const delta = e.altKey ? -0.1 : 0.1;
      this.zoomAtClientPoint(e.clientX, e.clientY, delta);
      return;
    }

    this.render();
  }

  /**
   * HISTORICAL PERFORMANCE ARCHITECTURE (FIX-12):
   * requestAnimationFrame Coalescing for Pointer Movement.
   *
   * Previous Implementation:
   * High-polling mice (125Hz-1000Hz) dispatched hundreds of pointermove events per second.
   * Each event executed hit-testing, coordinate transforms, status text updates, and at line 1093
   * fell through to an accidental `this.render()`, which re-parsed and reconstructed the entire
   * SVG DOM and property panel on every mouse pixel moved!
   *
   * Solution:
   * 1. Coalesce high-frequency pointer movements into `requestAnimationFrame`, processing
   *    at most one update per screen refresh cycle.
   * 2. Completely eliminate the accidental `this.render()` on passive mouse movements.
   */
  private onPointerMove(e: PointerEvent): void {
    this.latestPointerMoveEvent = e;
    if (this.pointerMoveRafId === null) {
      this.pointerMoveRafId = requestAnimationFrame(() => {
        this.pointerMoveRafId = null;
        if (this.latestPointerMoveEvent) {
          this.processPointerMove(this.latestPointerMoveEvent);
        }
      });
    }
  }

  private processPointerMove(e: PointerEvent): void {
    const pt = this.getCanvasPoint(e);
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) {
      const vb = this.model.getViewBoxBounds();
      const cfg = this.canvasMgr.rulerConfig;
      const originX = vb.minX + (cfg.originX || 0);
      const originY = vb.minY + (cfg.originY || 0);
      const relX = Math.round((pt.x - originX) / (cfg.scale || 1));
      const relY = Math.round((pt.y - originY) / (cfg.scale || 1));
      coordsEl.innerText = `X: ${relX}, Y: ${relY}`;
    }

    // Update cursor indicator on rulers (hardware-accelerated DOM markers, 0 canvas redraw)
    this.rulerView.setCursorPos(pt.x, pt.y);

    // Node Tool Delegation
    if (this.toolbar.activeTool === 'node') {
      if (this.nodeToolHandler.onPointerMove(e, pt)) {
        return;
      }
      const z = this.canvasMgr.zoom || 1;
      const selectedEl = this.model.elements.find((el) => this.selectionTool.isSelected(el.id));
      if (selectedEl && selectedEl.vertices) {
        const hit = this.nodeEditorTool.hitTestVertices(selectedEl.vertices, pt, 12 / z, this.nodeEditorTool.selectedVertexId);
        if (hit) {
          this.canvasWrapper.style.cursor = 'pointer';
          this.canvasScrollArea.style.cursor = 'pointer';
          return;
        }
        const hitSeg = this.nodeEditorTool.hitTestSegment(selectedEl.vertices, pt, 10 / z, this.model.isElementClosed(selectedEl));
        if (hitSeg !== null) {
          this.canvasWrapper.style.cursor = 'crosshair';
          this.canvasScrollArea.style.cursor = 'crosshair';
          return;
        }
      }
      this.canvasWrapper.style.cursor = 'default';
      this.canvasScrollArea.style.cursor = '';
      return;
    }

    // Handle Origin Drag preview from ruler corner
    if (this.activeHandle === 'origin-drag') {
      this.dragOriginPt = this.snapPoint(pt);
      this.renderOverlay();
      return;
    }

    // Handle Guide creation preview from ruler drag
    if (this.activeHandle === 'guide-create') {
      const allVerts = this.getOtherVertices();
      this.dragGuideCurrentPt = this.snapPoint(pt, allVerts);
      this.renderOverlay();
      return;
    }

    // Select Tool Delegation
    if (this.toolbar.activeTool === 'select' || this.toolbar.activeTool === 'stroke') {
      if (this.selectToolHandler.onPointerMove(e, pt)) {
        return;
      }
    } else if (this.toolbar.activeTool === 'polyline') {
      this.canvasWrapper.style.cursor = 'crosshair';
      if (!this.isMiddlePanning) {
        this.canvasScrollArea.style.cursor = '';
      }
      this.polylineToolHandler.onPointerMove(e, pt);
      return;
    } else if (this.toolbar.activeTool === 'pen') {
      this.canvasWrapper.style.cursor = 'crosshair';
      if (!this.isMiddlePanning) {
        this.canvasScrollArea.style.cursor = '';
      }
      this.penToolHandler.onPointerMove(e, pt);
      return;
    } else if (this.activeHandle === 'shape') {
      this.shapeToolHandler.onPointerMove(e, pt);
      return;
    }

    // Passive pointer moves without active drag or tool capture must never trigger full document re-render.
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.pointerMoveRafId !== null) {
      cancelAnimationFrame(this.pointerMoveRafId);
      this.pointerMoveRafId = null;
      if (this.latestPointerMoveEvent) {
        this.processPointerMove(this.latestPointerMoveEvent);
      }
    }

    try {
      if (this.canvasWrapper.hasPointerCapture(e.pointerId)) {
        this.canvasWrapper.releasePointerCapture(e.pointerId);
      }
    } catch (_err) {}

    const pt = this.getCanvasPoint(e);

    // Node Tool Delegation
    if (this.toolbar.activeTool === 'node') {
      this.isDragging = false;
      if (this.nodeToolHandler.onPointerUp(e, pt)) {
        return;
      }
      return;
    }

    // Finishing Origin Drag from ruler corner
    if (this.activeHandle === 'origin-drag') {
      this.isDragging = false;
      const vb = this.model.getViewBoxBounds();
      const finalPt = this.dragOriginPt || pt;
      this.canvasMgr.rulerConfig.originX = Math.round(finalPt.x - vb.minX);
      this.canvasMgr.rulerConfig.originY = Math.round(finalPt.y - vb.minY);
      this.activeHandle = null;
      this.dragOriginPt = null;
      this.syncRulerScroll();
      this.propertyPanel.showRulerSettings(this.canvasMgr.rulerConfig);
      this.render();
      this.syncMetadataToHost();
      return;
    }

    // Finishing Guide Creation from ruler drag
    if (this.activeHandle === 'guide-create') {
      this.isDragging = false;
      const isHoriz = this.dragGuideOrientation === 'horizontal';
      const allVerts = this.getOtherVertices();
      const snappedPt = this.snapPoint(pt, allVerts);
      const pos = Math.round(isHoriz ? snappedPt.y : snappedPt.x);

      // ARCHITECTURAL RATIONALE: Physical Ruler Drag Cancellation (FIX-04)
      // When dragging from a ruler, cancel creation only if dropped back onto the physical ruler bar.
      // Guides can exist and be manipulated across the entire workspace, including outside the viewBox.
      const isDroppedOnRuler = this.rulerView?.isPointOverRuler(e.clientX, e.clientY, this.dragGuideOrientation);

      if (!isDroppedOnRuler) {
        // ARCHITECTURAL RATIONALE: Ruler Drop Center Positioning
        // When dragging a guideline from a ruler, its initial center point is placed
        // directly at the coordinates where the drag was released (snappedPt), instead
        // of arbitrarily defaulting to canvas center (W/2 or H/2).
        const initialPivot = {
          x: Math.round(snappedPt.x),
          y: Math.round(snappedPt.y),
        };
        const newG = this.canvasMgr.addGuide(
          this.dragGuideOrientation,
          pos,
          this.model.canvas.width,
          this.model.canvas.height,
          undefined,
          initialPivot
        );
        this.canvasMgr.selectedGuideId = newG.id;
        this.propertyPanel.showGuideSettings(newG);
        this.syncMetadataToHost();
      }
      this.activeHandle = null;
      this.render();
      return;
    }

    // Select Tool Delegation
    if (this.toolbar.activeTool === 'select' || this.toolbar.activeTool === 'stroke') {
      this.isDragging = false;
      if (this.selectToolHandler.onPointerUp(e, pt)) {
        return;
      }
    }

    // Pen Tool Delegation
    if (this.toolbar.activeTool === 'pen') {
      this.isDragging = false;
      if (this.penToolHandler.onPointerUp(e, pt)) {
        return;
      }
    }

    // Shape Tool Delegation
    if (this.activeHandle === 'shape') {
      this.isDragging = false;
      this.shapeToolHandler.onPointerUp(e, pt);
      this.activeHandle = null;
      this.toolbar.setTool('select');
      this.applyCanvasSize();
      this.render();
      return;
    }

    this.isDragging = false;
    this.activeHandle = null;
    this.render();
  }

  private onDoubleClick(e: MouseEvent): void {
    if (this.toolbar.activeTool === 'zoom') {
      this.zoomAtClientPoint(e.clientX, e.clientY, -0.2);
      return;
    }

    const pt = this.getCanvasPoint(e);

    if (this.toolbar.activeTool === 'polyline') {
      if (this.polylineToolHandler.onDoubleClick(e, pt)) return;
    }

    if (this.toolbar.activeTool === 'pen') {
      if (this.penToolHandler.onDoubleClick(e, pt)) return;
    }

    // Node Tool Delegation
    if (this.toolbar.activeTool === 'node') {
      if (this.nodeToolHandler.onDoubleClick(e, pt)) return;
    }

    // Select Tool Delegation (Guide angle/pivot or segment subdivision)
    if (this.toolbar.activeTool === 'select') {
      if (this.selectToolHandler.onDoubleClick(e, pt)) return;
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


  private handleAlign(type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    this.actionDispatcher.align(type);
  }

  private handleBoolean(op: 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment'): void {
    this.actionDispatcher.executeBoolean(op);
  }

  private handleZOrder(action: 'front' | 'forward' | 'backward' | 'back'): void {
    this.actionDispatcher.reorderZ(action);
  }

  private handleStrokeToPath(): void {
    this.actionDispatcher.strokeToPath();
  }

  private async handleConvertToCurves(): Promise<void> {
    await this.actionDispatcher.convertToCurves();
  }

  private handleConvertToPrimitives(): void {
    this.actionDispatcher.convertToPrimitives();
  }



  private pushUndo(): void {
    this.historyService.pushUndo();
  }

  private undo(): void {
    this.historyService.undo();
  }

  private redo(): void {
    this.historyService.redo();
  }

  private copySelection(): void {
    this.clipboardService.copy();
  }

  private cutSelection(): void {
    this.clipboardService.cut();
  }

  private pasteClipboard(): void {
    this.clipboardService.paste();
  }

  private duplicateSelection(): void {
    this.clipboardService.duplicate();
  }

  private render(autoResize: boolean = true): void {
    // Auto-adjust dynamic workspace dimensions only when NOT actively dragging
    if (autoResize && !this.isDragging) {
      this.applyCanvasSize();
      this.syncRulerScroll();
    }

    // Render actual SVG elements
    this.svgCanvas.innerHTML = '';

    // 1. Render Artboard background rect behind all vector elements
    const vb = this.model.getViewBoxBounds();
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('id', '__artboard_bg__');
    bgRect.setAttribute('x', vb.minX.toString());
    bgRect.setAttribute('y', vb.minY.toString());
    bgRect.setAttribute('width', vb.width.toString());
    bgRect.setAttribute('height', vb.height.toString());
    bgRect.setAttribute('fill', this.model.canvas.backgroundColor || '#ffffff');
    this.svgCanvas.appendChild(bgRect);

    // 2. Render all vector elements
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

    const hasSelectedElements = this.selectionTool.selectedElementIds.size > 0;
    if (hasSelectedElements || selectedGuide || this.propertyPanel.currentPanelMode !== 'ruler') {
      this.rulerView.setCornerActive(false);
    }

    this.propertyPanel.update(
      selectedV,
      this.toolbar.activeTool,
      this.penToolHandler.penNodeType,
      this.penToolHandler.vertexCount,
      selectedGuide,
      this.polylineToolHandler.vertexCount,
      this.canvasMgr.gridAlignmentMode,
      this.canvasMgr.grids,
      this.canvasMgr.guides
    );
  }

  // Render Overlays: Artboard ViewBox Frame, Grid lines, Guide lines, Bounding box + handles, Vertices
  private renderOverlay(): void {
    const z = this.canvasMgr.zoom || 1;
    this.updateGridLayer();
    this.overlaySvg.innerHTML = this.overlayRenderer.render({
      model: this.model,
      canvasMgr: this.canvasMgr,
      selectionTool: this.selectionTool,
      nodeEditorTool: this.nodeEditorTool,
      activeTool: this.toolbar.activeTool,
      dragOriginPt: this.dragOriginPt,
      dragGuideOrientation: this.dragGuideOrientation,
      dragGuideCurrentPt: this.dragGuideCurrentPt,
      isDraggingGuideCreate: this.activeHandle === 'guide-create',
      isDraggingOrigin: this.activeHandle === 'origin-drag',
      hasGhostNodeVertices: !!this.nodeToolHandler.ghostNodeVertices,
      tools: [
        this.selectToolHandler,
        this.nodeToolHandler,
        this.shapeToolHandler,
        this.penToolHandler,
        this.polylineToolHandler,
      ],
    }, z);
  }
}

// Initialize Application when DOM content is ready
document.addEventListener('DOMContentLoaded', () => {
  new AntiDrawApp();
});
