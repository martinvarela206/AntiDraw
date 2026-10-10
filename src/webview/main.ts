import { VectorModel, VectorElement, PathVertex, NodeType, Point } from './engine/VectorModel.js';
import { SelectionTool } from './engine/SelectionTool.js';
import { NodeEditorTool } from './engine/NodeEditorTool.js';
import { CanvasManager, GuideLine, RulerConfig } from './engine/CanvasManager.js';
import { BooleanOperations } from './engine/BooleanOperations.js';
import { ViewportController } from './engine/ViewportController.js';
import { OverlayRenderer } from './engine/OverlayRenderer.js';
import { SvgDomRenderer } from './engine/canvas/SvgDomRenderer.js';
import { CanvasView } from './engine/canvas/CanvasView.js';
import { Session } from './engine/session/Session.js';
import { VsCodeBridge } from './bridge/VsCodeBridge.js';
import { NodeCatalogService } from './engine/selection/NodeCatalogService.js';
import { ToolContext } from './tools/IToolHandler.js';
import { DistortTransformer } from './tools/interactions/DistortTransformer.js';
import { QuadCorners } from './engine/geometry/ProjectiveHomography.js';
import { SelectToolHandler } from './tools/SelectToolHandler.js';
import { ShapeToolHandler } from './tools/ShapeToolHandler.js';
import { PolylineToolHandler } from './tools/PolylineToolHandler.js';
import { PenToolHandler } from './tools/PenToolHandler.js';
import { NodeToolHandler } from './tools/NodeToolHandler.js';
import { Toolbar } from './ui/Toolbar.js';
import { ToolType } from './tools/ToolType.js';
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
import { KeyboardShortcutController } from './controllers/KeyboardShortcutController.js';
import { ContextMenuController } from './controllers/ContextMenuController.js';
import { CommandRegistry } from './engine/commands/CommandRegistry.js';
import { registerSystemCommands } from './engine/commands/SystemCommands.js';
import './styles/main.css';

class AntiDrawApp {
  private vscodeBridge: VsCodeBridge = VsCodeBridge.getInstance();
  private viewportCtrl!: ViewportController;
  private overlayRenderer: OverlayRenderer = new OverlayRenderer();
  private svgDomRenderer: SvgDomRenderer = new SvgDomRenderer();
  private canvasView!: CanvasView;
  private selectToolHandler!: SelectToolHandler;
  private shapeToolHandler!: ShapeToolHandler;
  private polylineToolHandler!: PolylineToolHandler;
  private penToolHandler!: PenToolHandler;
  private nodeToolHandler!: NodeToolHandler;
  private toolCtx!: ToolContext;

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

  private session!: Session;
  private get isDragging(): boolean { return this.session?.isDragging ?? false; }
  private set isDragging(v: boolean) { if (this.session) this.session.isDragging = v; }
  private get dragStartPt(): Point { return this.session?.dragStartPt ?? { x: 0, y: 0 }; }
  private set dragStartPt(v: Point) { if (this.session) this.session.dragStartPt = v; }
  private get activeHandle(): 'origin-drag' | 'guide-create' | 'shape' | null { return this.session?.activeHandle ?? null; }
  private set activeHandle(v: 'origin-drag' | 'guide-create' | 'shape' | null) { if (this.session) this.session.activeHandle = v; }

  // Ruler drag state
  private get dragGuideOrientation(): 'horizontal' | 'vertical' { return this.session?.dragGuideOrientation ?? 'horizontal'; }
  private set dragGuideOrientation(v: 'horizontal' | 'vertical') { if (this.session) this.session.dragGuideOrientation = v; }
  private get dragGuideCurrentPt(): Point { return this.session?.dragGuideCurrentPt ?? { x: 0, y: 0 }; }
  private set dragGuideCurrentPt(v: Point) { if (this.session) this.session.dragGuideCurrentPt = v; }
  private get dragOriginPt(): Point | null { return this.session?.dragOriginPt ?? null; }
  private set dragOriginPt(v: Point | null) { if (this.session) this.session.dragOriginPt = v; }

  private hasInitialCentered: boolean = false;
  private get isMiddlePanning(): boolean {
    return this.viewportCtrl?.isMiddlePanning ?? false;
  }

  private keyboardController!: KeyboardShortcutController;
  private contextMenuController!: ContextMenuController;
  private get isShiftPressed(): boolean {
    return this.keyboardController?.isShiftPressed ?? false;
  }

  // Subsystems & Services
  private layoutMgr!: AppLayoutManager;
  private clipboardService!: ClipboardService;
  private historyService!: HistoryService;
  private actionDispatcher!: CanvasActionDispatcher;
  private commandRegistry!: CommandRegistry;

  constructor() {
    this.initTools();
    this.initLayout();
    this.initClipboardService();
    this.initHistoryService();
    this.initActionDispatcher();
    this.initViewport();
    this.initCommandRegistry();
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
      canvasMgr: this.canvasMgr,
      onResetPropertyPanel: () => this.propertyPanel.resetPanelMode(),
      render: () => this.render(),
      syncToHost: () => this.syncToHost(),
      syncMetadataToHost: () => this.syncMetadataToHost(),
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

  private initCommandRegistry(): void {
    this.commandRegistry = CommandRegistry.getInstance();
    registerSystemCommands(this.commandRegistry);
    this.commandRegistry.setContext({
      model: this.model,
      selectionTool: this.selectionTool,
      canvasMgr: this.canvasMgr,
      toolbar: this.toolbar,
      propertyPanel: this.propertyPanel,
      clipboardService: this.clipboardService,
      historyService: this.historyService,
      actionDispatcher: this.actionDispatcher,
      viewportCtrl: this.viewportCtrl,
      nodeEditorTool: this.nodeEditorTool,
      nodeToolHandler: this.nodeToolHandler,
      undo: () => this.undo(),
      redo: () => this.redo(),
      pushUndo: () => this.pushUndo(),
      render: () => this.render(),
      syncToHost: () => this.syncToHost(),
      syncMetadataToHost: () => this.syncMetadataToHost(),
      cutSelection: () => this.cutSelection(),
      copySelection: () => this.copySelection(),
      pasteClipboard: () => this.pasteClipboard(),
      duplicateSelection: () => this.duplicateSelection(),
      handleConvertToCurves: () => this.handleConvertToCurves(),
      handleConvertToPrimitives: () => this.handleConvertToPrimitives(),
      handleZOrder: (action: 'front' | 'forward' | 'backward' | 'back') => this.handleZOrder(action),
      recenterViewBox: () => this.recenterViewBox(),
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
      confirm: (options) => ConfirmationModal.confirm(options),
      applyCanvasSize: () => this.applyCanvasSize(),
      isPointerOverRuler: (clientX, clientY, orientation) => this.rulerView?.isPointOverRuler(clientX, clientY, orientation) ?? false,
    };
    this.toolCtx = toolCtx;
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
        this.canvasView?.setCursor(cursor);
      },
      syncMetadataToHost: () => {
        this.syncMetadataToHost();
      },
    });
    this.shapeToolHandler = new ShapeToolHandler(toolCtx);
    this.polylineToolHandler = new PolylineToolHandler(toolCtx);
    this.penToolHandler = new PenToolHandler(toolCtx);
    this.nodeToolHandler = new NodeToolHandler(toolCtx, this.nodeEditorTool, {
      onNodeSelected: (vertex, _element, selectedCount = 1) => {
        this.propertyPanel.update(
          vertex,
          'node',
          this.penToolHandler.penNodeType,
          this.penToolHandler.vertexCount,
          null,
          this.polylineToolHandler.vertexCount,
          this.canvasMgr.gridAlignmentMode,
          this.canvasMgr.grids,
          this.canvasMgr.guides,
          selectedCount
        );
      },
      onDeselectNode: () => {
        this.propertyPanel.resetPanelMode();
      },
    });

    this.session = new Session(
      {
        select: this.selectToolHandler,
        shape: this.shapeToolHandler,
        polyline: this.polylineToolHandler,
        pen: this.penToolHandler,
        node: this.nodeToolHandler,
      },
      {
        onRender: () => this.render(),
        onRenderOverlay: () => this.renderOverlay(),
        onToolChanged: (tool) => {
          this.toolbar?.setTool(tool);
        },
        onResetPropertyPanel: () => {
          this.propertyPanel?.resetPanelMode();
        },
        setCursor: (cursor) => {
          if (this.canvasWrapper) {
            this.canvasWrapper.style.cursor = cursor;
          }
          if (this.canvasScrollArea && !this.isMiddlePanning) {
            this.canvasScrollArea.style.cursor = cursor === 'default' ? '' : cursor;
          }
        },
      }
    );
  }

  private initViewport(): void {
    this.viewportCtrl = new ViewportController({
      canvasScrollArea: this.canvasScrollArea,
      canvasWrapper: this.canvasWrapper,
      getSvgCanvas: () => this.svgCanvas,
      canvasMgr: this.canvasMgr,
      model: this.model,
      onRender: () => this.render(),
      onApplyCanvasSize: () => this.applyCanvasSize(),
      onRenderOverlay: () => this.renderOverlay(),
      onSyncRulers: (x, y) => this.rulerView?.renderRulers(x, y),
      onResizeRulers: (w, h) => this.rulerView?.updateSize(w, h),
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
        onFlip: (axis) => this.actionDispatcher.flip(axis),
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
          if (type === 'nodes' || type === 'vertex') this.canvasMgr.snapToNodes = !this.canvasMgr.snapToNodes;
          if (type === 'edges') this.canvasMgr.snapToEdges = !this.canvasMgr.snapToEdges;
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
        syncMetadataToHost: () => this.syncMetadataToHost(),
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
        onDistortCornerChange: (cornerKey, coord) => {
          const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
          if (selectedEls.length === 0) return;
          const groupBox = this.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
          if (!groupBox) return;
          const quad: QuadCorners = this.selectionTool.currentDistortQuad || {
            nw: { x: groupBox.x, y: groupBox.y },
            ne: { x: groupBox.x + groupBox.width, y: groupBox.y },
            se: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
            sw: { x: groupBox.x, y: groupBox.y + groupBox.height },
          };
          const updatedQuad = DistortTransformer.setCornerCoordinate(
            this.toolCtx,
            cornerKey,
            coord,
            selectedEls,
            groupBox,
            quad
          );
          if (updatedQuad) {
            this.selectionTool.currentDistortQuad = updatedQuad;
            this.propertyPanel.update(null, 'select');
            this.render();
            this.syncToHost();
          }
        },
        onResetDistortCorner: (cornerKey) => {
          const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
          if (selectedEls.length === 0) return;
          const groupBox = this.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
          if (!groupBox) return;
          const quad: QuadCorners = this.selectionTool.currentDistortQuad || {
            nw: { x: groupBox.x, y: groupBox.y },
            ne: { x: groupBox.x + groupBox.width, y: groupBox.y },
            se: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
            sw: { x: groupBox.x, y: groupBox.y + groupBox.height },
          };
          const cornersToReset = (this.selectionTool.selectedDistortCorners && this.selectionTool.selectedDistortCorners.size > 1)
            ? Array.from(this.selectionTool.selectedDistortCorners)
            : [cornerKey];
          let updatedQuad: QuadCorners | null = quad;
          for (const ck of cornersToReset) {
            const res = DistortTransformer.resetCorner(
              this.toolCtx,
              ck,
              selectedEls,
              groupBox,
              updatedQuad
            );
            if (res) updatedQuad = res;
          }
          if (updatedQuad) {
            this.selectionTool.currentDistortQuad = updatedQuad;
            this.propertyPanel.update(null, 'select');
            this.render();
            this.syncToHost();
          }
        },
        onResetAllDistortCorners: () => {
          const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
          if (selectedEls.length === 0) return;
          const restoredQuad = DistortTransformer.resetAllCorners(this.toolCtx, selectedEls);
          this.selectionTool.currentDistortQuad = restoredQuad;
          this.propertyPanel.update(null, 'select');
          this.render();
          this.syncToHost();
        },
        onResetSkew: () => {
          const selectedEls = this.model.elements.filter((el) => this.selectionTool.isSelected(el.id));
          if (selectedEls.length === 0) return;
          DistortTransformer.resetAllCorners(this.toolCtx, selectedEls);
          this.selectionTool.currentDistortQuad = null;
          this.propertyPanel.update(null, 'select');
          this.render();
          this.syncToHost();
        },
      },
    });

    this.canvasContainer = this.layoutMgr.canvasContainer;
    this.canvasScrollArea = this.layoutMgr.canvasScrollArea;
    this.canvasWrapper = this.layoutMgr.canvasWrapper;
    this.canvasView = new CanvasView(
      {
        canvasContainer: this.canvasContainer,
        canvasScrollArea: this.canvasScrollArea,
        canvasWrapper: this.canvasWrapper,
      },
      {
        getCanvasPoint: (e) => this.getCanvasPoint(e),
        onPointerDown: (e, pt) => this.onPointerDown(e, pt),
        onPointerMove: (e, pt) => this.onPointerMove(e, pt),
        onPointerUp: (e, pt) => this.onPointerUp(e, pt),
        onDoubleClick: (e, pt) => this.onDoubleClick(e, pt),
        onCancelAction: () => this.cancelCurrentAction(),
        onLostFocusOrCancel: () => this.handleLostFocusOrCancel(),
        isDragging: () => this.isDragging,
        isMiddlePanning: () => this.isMiddlePanning,
      }
    );
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
        if (payload.metadata.snapToNodes !== undefined) this.canvasMgr.snapToNodes = payload.metadata.snapToNodes;
        else if (payload.metadata.snapToVertices !== undefined) this.canvasMgr.snapToNodes = payload.metadata.snapToVertices;
        if (payload.metadata.snapToEdges !== undefined) this.canvasMgr.snapToEdges = payload.metadata.snapToEdges;
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
        if (payload.metadata.scaleStroke !== undefined) {
          this.selectionTool.scaleStroke = payload.metadata.scaleStroke;
        }
        if (payload.metadata.scaleCorners !== undefined) {
          this.selectionTool.scaleCorners = payload.metadata.scaleCorners;
        }
        if (payload.metadata.elementPivots) {
          this.selectionTool.elementPivots = new Map(Object.entries(payload.metadata.elementPivots));
        }
        this.canvasContainer.classList.toggle('no-rulers', !this.canvasMgr.showRulers);
        this.topBar.update();
      } else {
        this.canvasMgr.guides = [];
      }

      this.model.loadSvgString(payload.text, payload.metadata);
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

    // Dedicated Keyboard Shortcut Controller (SOLID / SRP)
    this.keyboardController = new KeyboardShortcutController({
      toolbar: this.toolbar,
      selectionTool: this.selectionTool,
      canvasMgr: this.canvasMgr,
      nodeEditorTool: this.nodeEditorTool,
      model: this.model,
      propertyPanel: this.propertyPanel,
      clipboardService: this.clipboardService,
      nodeToolHandler: this.nodeToolHandler,
      shapeToolHandler: this.shapeToolHandler,
      penToolHandler: this.penToolHandler,
      polylineToolHandler: this.polylineToolHandler,
      isDragging: () => this.isDragging,
      activeHandle: () => this.activeHandle,
      copySelection: () => this.copySelection(),
      cutSelection: () => this.cutSelection(),
      pasteClipboard: () => this.pasteClipboard(),
      duplicateSelection: () => this.duplicateSelection(),
      handleConvertToCurves: () => this.handleConvertToCurves(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      cancelCurrentAction: () => this.cancelCurrentAction(),
      pushUndo: () => this.pushUndo(),
      render: () => this.render(),
      renderOverlay: () => this.renderOverlay(),
      syncToHost: () => this.syncToHost(),
      syncMetadataToHost: () => this.syncMetadataToHost(),
    });

    // Window level pointer events for dragging across boundaries
    // Dedicated Context Menu Controller (SOLID / SRP)
    this.contextMenuController = new ContextMenuController(
      {
        contextMenu: this.contextMenu,
        selectionTool: this.selectionTool,
        canvasMgr: this.canvasMgr,
        model: this.model,
        toolbar: this.toolbar,
        propertyPanel: this.propertyPanel,
        clipboardService: this.clipboardService,
        getCanvasPoint: (e) => this.getCanvasPoint(e),
        handleConvertToCurves: () => this.handleConvertToCurves(),
        handleConvertToPrimitives: () => this.handleConvertToPrimitives(),
        cutSelection: () => this.cutSelection(),
        copySelection: () => this.copySelection(),
        pasteClipboard: () => this.pasteClipboard(),
        duplicateSelection: () => this.duplicateSelection(),
        handleZOrder: (action) => this.handleZOrder(action),
        pushUndo: () => this.pushUndo(),
        render: () => this.render(),
        syncToHost: () => this.syncToHost(),
        cancelCurrentAction: () => this.cancelCurrentAction(),
      },
      [this.canvasContainer, this.canvasWrapper, this.canvasScrollArea]
    );

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
    const elementsMetadata: Record<string, Record<string, string>> = {};
    for (const el of this.model.elements) {
      const elData: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.attributes)) {
        if (k.startsWith('data-')) {
          elData[k] = v;
        }
      }
      if (Object.keys(elData).length > 0) {
        elementsMetadata[el.id] = elData;
      }
    }

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
      snapToNodes: this.canvasMgr.snapToNodes,
      snapToVertices: this.canvasMgr.snapToNodes,
      snapToEdges: this.canvasMgr.snapToEdges,
      snapToViewBox: this.canvasMgr.snapToViewBox,
      snapAngular: this.canvasMgr.snapAngular,
      shapeConfig: this.canvasMgr.shapeConfig,
      undoStack: this.historyService.undoStackSnapshots,
      redoStack: this.historyService.redoStackSnapshots,
      zoom: this.canvasMgr.zoom,
      cameraOffset: this.viewportCtrl ? { x: this.viewportCtrl.cameraOffset.x, y: this.viewportCtrl.cameraOffset.y } : undefined,
      isAspectRatioLocked: this.selectionTool.isAspectRatioLocked,
      scaleStroke: this.selectionTool.scaleStroke,
      scaleCorners: this.selectionTool.scaleCorners,
      elementPivots: Object.fromEntries(this.selectionTool.elementPivots),
      canvas: { currentColor: this.model.canvas.currentColor },
      elements: elementsMetadata,
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
    const excludeElementIds = this.selectionTool ? Array.from(this.selectionTool.selectedElementIds) : undefined;
    return this.canvasMgr.snapPoint(pt, otherVertices, origin, vb, excludeGuideId, this.model.elements, excludeElementIds);
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
    if (tool !== 'select' && tool !== 'stroke') {
      this.canvasMgr.selectedGuideId = null;
      this.canvasMgr.activeGuideTransformId = null;
    }
    this.session.setTool(tool);
  }

  private cancelCurrentAction(): void {
    this.contextMenu?.hide();
    this.canvasView?.cancelRaf();
    this.session.cancelCurrentAction();
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

  private onPointerDown(e: PointerEvent, pt?: Point): void {
    this.contextMenu?.hide();
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      this.cancelCurrentAction();
      return;
    }
    if (e.button !== 0) return;
    const canvasPt = pt || this.getCanvasPoint(e);
    this.dragStartPt = canvasPt;
    this.isDragging = true;

    // If toolbar is currently in ruler or inactive state, switch back to select tool
    if (!this.toolbar.activeTool || (this.toolbar.activeTool as any) === '') {
      this.toolbar.setTool('select');
      this.rulerView.setCornerActive(false);
      this.propertyPanel.resetPanelMode();
    }

    const activeTool = this.toolbar.activeTool;

    this.canvasView?.setPointerCapture(e.pointerId);

    if (activeTool === 'select' || activeTool === 'stroke') {
      if (this.selectToolHandler.onPointerDown(e, canvasPt)) {
        return;
      }
    } else if (activeTool === 'node') {
      if (this.nodeToolHandler.onPointerDown(e, canvasPt)) {
        return;
      }
    } else if (['rect', 'circle', 'ellipse', 'line', 'polygon', 'star'].includes(activeTool)) {
      if (this.shapeToolHandler.onPointerDown(e, canvasPt)) {
        this.activeHandle = 'shape';
        return;
      }
    } else if (activeTool === 'polyline') {
      if (this.polylineToolHandler.onPointerDown(e, canvasPt)) {
        this.render();
        return;
      }
    } else if (activeTool === 'pen') {
      if (this.penToolHandler.onPointerDown(e, canvasPt)) {
        return;
      }
    } else if (activeTool === 'zoom') {
      const delta = e.altKey ? -0.1 : 0.1;
      this.zoomAtClientPoint(e.clientX, e.clientY, delta);
      return;
    }

    this.render();
  }

  private onPointerMove(e: PointerEvent, pt?: Point): void {
    const canvasPt = pt || this.getCanvasPoint(e);
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) {
      const vb = this.model.getViewBoxBounds();
      const cfg = this.canvasMgr.rulerConfig;
      const originX = vb.minX + (cfg.originX || 0);
      const originY = vb.minY + (cfg.originY || 0);
      const relX = Math.round((canvasPt.x - originX) / (cfg.scale || 1));
      const relY = Math.round((canvasPt.y - originY) / (cfg.scale || 1));
      coordsEl.innerText = `X: ${relX}, Y: ${relY}`;
    }

    // Update cursor indicator on rulers (hardware-accelerated DOM markers, 0 canvas redraw)
    this.rulerView.setCursorPos(canvasPt.x, canvasPt.y);

    // Node Tool Delegation
    if (this.toolbar.activeTool === 'node') {
      if (this.nodeToolHandler.onPointerMove(e, canvasPt)) {
        return;
      }
      const z = this.canvasMgr.zoom || 1;
      const selectedEl = this.model.elements.find((el) => this.selectionTool.isSelected(el.id));
      if (selectedEl && selectedEl.vertices) {
        const hit = this.nodeEditorTool.hitTestVertices(selectedEl.vertices, canvasPt, 12 / z, this.nodeEditorTool.selectedVertexId);
        if (hit) {
          this.canvasView.setCursor('pointer');
          return;
        }
        const hitSeg = this.nodeEditorTool.hitTestSegment(selectedEl.vertices, canvasPt, 10 / z, this.model.isElementClosed(selectedEl));
        if (hitSeg !== null) {
          this.canvasView.setCursor('crosshair');
          return;
        }
      }
      this.canvasView.setCursor('default');
      return;
    }

    // Handle Origin Drag preview from ruler corner
    if (this.activeHandle === 'origin-drag') {
      this.dragOriginPt = this.snapPoint(canvasPt);
      this.renderOverlay();
      return;
    }

    // Handle Guide creation preview from ruler drag
    if (this.activeHandle === 'guide-create') {
      const allVerts = this.getOtherVertices();
      this.dragGuideCurrentPt = this.snapPoint(canvasPt, allVerts);
      this.renderOverlay();
      return;
    }

    // Select Tool Delegation
    if (this.toolbar.activeTool === 'select' || this.toolbar.activeTool === 'stroke') {
      if (this.selectToolHandler.onPointerMove(e, canvasPt)) {
        return;
      }
    } else if (this.toolbar.activeTool === 'polyline') {
      this.canvasView.setCursor('crosshair');
      this.polylineToolHandler.onPointerMove(e, canvasPt);
      return;
    } else if (this.toolbar.activeTool === 'pen') {
      this.canvasView.setCursor('crosshair');
      this.penToolHandler.onPointerMove(e, canvasPt);
      return;
    } else if (this.activeHandle === 'shape') {
      this.shapeToolHandler.onPointerMove(e, canvasPt);
      return;
    }

    // Passive pointer moves without active drag or tool capture must never trigger full document re-render.
  }

  private onPointerUp(e: PointerEvent, pt?: Point): void {
    this.canvasView?.cancelRaf();
    this.canvasView?.releasePointerCapture(e.pointerId);

    const canvasPt = pt || this.getCanvasPoint(e);

    // Node Tool Delegation
    if (this.toolbar.activeTool === 'node') {
      this.isDragging = false;
      if (this.nodeToolHandler.onPointerUp(e, canvasPt)) {
        return;
      }
      return;
    }

    // Finishing Origin Drag from ruler corner
    if (this.activeHandle === 'origin-drag') {
      this.isDragging = false;
      const vb = this.model.getViewBoxBounds();
      const finalPt = this.dragOriginPt || canvasPt;
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
      const snappedPt = this.snapPoint(canvasPt, allVerts);
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
        this.pushUndo();
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
      if (this.selectToolHandler.onPointerUp(e, canvasPt)) {
        return;
      }
    }

    // Pen Tool Delegation
    if (this.toolbar.activeTool === 'pen') {
      this.isDragging = false;
      if (this.penToolHandler.onPointerUp(e, canvasPt)) {
        return;
      }
    }

    // Shape Tool Delegation
    if (this.activeHandle === 'shape') {
      this.isDragging = false;
      this.shapeToolHandler.onPointerUp(e, canvasPt);
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

  private onDoubleClick(e: MouseEvent, pt?: Point): void {
    if (this.toolbar.activeTool === 'zoom') {
      this.zoomAtClientPoint(e.clientX, e.clientY, -0.2);
      return;
    }

    const canvasPt = pt || this.getCanvasPoint(e);

    if (this.toolbar.activeTool === 'polyline') {
      if (this.polylineToolHandler.onDoubleClick(e, canvasPt)) return;
    }

    if (this.toolbar.activeTool === 'pen') {
      if (this.penToolHandler.onDoubleClick(e, canvasPt)) return;
    }

    // Node Tool Delegation
    if (this.toolbar.activeTool === 'node') {
      if (this.nodeToolHandler.onDoubleClick(e, canvasPt)) return;
    }

    // Select Tool Delegation (Guide angle/pivot or segment subdivision)
    if (this.toolbar.activeTool === 'select') {
      if (this.selectToolHandler.onDoubleClick(e, canvasPt)) return;
    }
  }

  private getOtherVertices(excludeIds: string[] = []): Point[] {
    return NodeCatalogService.collectSnappableNodes(this.model.elements, { excludeIds });
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

    // Render actual SVG elements via dedicated SvgDomRenderer
    this.svgDomRenderer.render(this.svgCanvas, this.model);

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

    const selNodeCount = Math.max(1, this.nodeEditorTool.selectedVertexIds?.size || 1);
    this.propertyPanel.update(
      selectedV,
      this.toolbar.activeTool,
      this.penToolHandler.penNodeType,
      this.penToolHandler.vertexCount,
      selectedGuide,
      this.polylineToolHandler.vertexCount,
      this.canvasMgr.gridAlignmentMode,
      this.canvasMgr.grids,
      this.canvasMgr.guides,
      selNodeCount
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
      tools: this.session ? this.session.getAllHandlers() : [],
    }, z);
  }
}

// Initialize Application when DOM content is ready
document.addEventListener('DOMContentLoaded', () => {
  new AntiDrawApp();
});
