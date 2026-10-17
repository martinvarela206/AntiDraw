import { VectorModel } from './engine/VectorModel.js';
import { SelectionTool } from './engine/SelectionTool.js';
import { NodeEditorTool } from './engine/NodeEditorTool.js';
import { CanvasManager } from './engine/CanvasManager.js';
import { ViewportController } from './engine/ViewportController.js';
import { CanvasView } from './engine/canvas/CanvasView.js';
import { ToolFactory, ToolSuite } from './tools/ToolFactory.js';
import { AppLayoutManager } from './ui/AppLayoutManager.js';
import { ContextMenu } from './ui/ContextMenu.js';
import { CoreServiceRegistry, CoreServices } from './services/CoreServiceRegistry.js';
import { HostSyncService } from './services/HostSyncService.js';
import { CanvasInteractionController } from './controllers/CanvasInteractionController.js';
import { PropertyPanelActionController } from './controllers/PropertyPanelActionController.js';
import { ChromeActionController } from './controllers/ChromeActionController.js';
import { CommandShortcutController } from './controllers/CommandShortcutController.js';
import { LayerReorderService } from './engine/layout/LayerReorderService.js';
import './styles/main.css';

/**
 * ARCHITECTURAL RATIONALE: Application Composition Root (AntiDrawApp - L4)
 * Adheres strictly to Composition Root & Dependency Injection principles (< 200 lines):
 * - SRP: Acts exclusively as bootstrapper and dependency wiring container.
 * - Flow: L0/L1 Core Domain -> L2 Tools -> L3 Engine/Services -> L4 UI & Controllers.
 */
class AntiDrawApp {
  // Core Domain Models & Services
  private model = new VectorModel();
  private selectionTool = new SelectionTool();
  private nodeEditorTool = new NodeEditorTool();
  private canvasMgr = new CanvasManager();
  private contextMenu = new ContextMenu();
  private services!: CoreServices;
  private tools!: ToolSuite;
  private hostSyncService!: HostSyncService;
  private chromeCtrl!: ChromeActionController;
  private propertyPanelCtrl!: PropertyPanelActionController;
  private interactionCtrl!: CanvasInteractionController;
  private canvasView!: CanvasView;
  private layoutMgr!: AppLayoutManager;
  private viewportCtrl!: ViewportController;
  private commandShortcutCtrl!: CommandShortcutController;

  constructor() {
    this.bootstrap();
  }

  private bootstrap(): void {
    // 1. Tool suite & interactive session
    this.tools = ToolFactory.createToolSuite({
      model: this.model,
      selectionTool: this.selectionTool,
      nodeEditorTool: this.nodeEditorTool,
      canvasMgr: this.canvasMgr,
      getHistoryService: () => this.services.historyService,
      getHostSyncService: () => this.hostSyncService,
      getWorkspaceLayout: () => this.services.workspaceLayout,
      getInteractionCtrl: () => this.interactionCtrl,
      getToolbar: () => this.layoutMgr?.toolbar,
      getRulerView: () => this.layoutMgr?.rulerView,
      getPropertyPanel: () => this.layoutMgr?.propertyPanel,
      getCanvasView: () => this.canvasView,
    });

    // 2. Core services (History, Clipboard, Action Dispatcher, Workspace Layout)
    this.services = CoreServiceRegistry.createServices({
      model: this.model,
      selectionTool: this.selectionTool,
      nodeEditorTool: this.nodeEditorTool,
      canvasMgr: this.canvasMgr,
      getHostSyncService: () => this.hostSyncService,
      getLayoutMgr: () => this.layoutMgr,
      getViewportCtrl: () => this.viewportCtrl,
      getTools: () => this.tools,
    });

    // 3. Action Controllers (Chrome TopBar/Ruler & Inspector PropertyPanel)
    this.chromeCtrl = new ChromeActionController({
      model: this.model,
      canvasMgr: this.canvasMgr,
      selectionTool: this.selectionTool,
      historyService: () => this.services.historyService,
      hostSyncService: () => this.hostSyncService,
      actionDispatcher: () => this.services.actionDispatcher,
      workspaceLayout: () => this.services.workspaceLayout,
      session: () => this.tools.session,
      getViewportCtrl: () => this.viewportCtrl,
      getCanvasView: () => this.canvasView,
      getLayoutMgr: () => this.layoutMgr,
    });

    this.propertyPanelCtrl = new PropertyPanelActionController({
      model: this.model,
      selectionTool: this.selectionTool,
      canvasMgr: this.canvasMgr,
      tools: this.tools,
      services: this.services,
      getPropertyPanel: () => this.layoutMgr?.propertyPanel,
      getHostSyncService: () => this.hostSyncService,
    });

    // 4. UI Layout Manager & Viewport
    this.layoutMgr = new AppLayoutManager({
      canvasMgr: this.canvasMgr,
      model: this.model,
      selectionTool: this.selectionTool,
      onToolChange: (tool) => this.chromeCtrl.onToolChange(tool),
      onToolDoubleClick: (tool) => this.chromeCtrl.onToolDoubleClick(tool),
      topBarCallbacks: this.chromeCtrl.createTopBarCallbacks(),
      rulerCallbacks: this.chromeCtrl.createRulerCallbacks(),
      propertyPanelCallbacks: this.propertyPanelCtrl.createCallbacks(),
      onScroll: () => this.services.workspaceLayout.syncRulerScroll(),
      onExplorerSelectElement: (id, multi) => {
        if (multi) {
          if (this.selectionTool.selectedElementIds.has(id)) {
            this.selectionTool.selectedElementIds.delete(id);
          } else {
            this.selectionTool.selectedElementIds.add(id);
          }
        } else {
          this.selectionTool.selectedElementIds.clear();
          this.selectionTool.selectedElementIds.add(id);
        }
        this.services.workspaceLayout.render();
      },
      onExplorerToggleVisibility: (id) => {
        const el = this.model.getElementById(id);
        if (el) {
          el.attributes.display = el.attributes.display === 'none' ? 'inline' : 'none';
          this.services.historyService.pushUndo();
          this.services.workspaceLayout.render();
          this.hostSyncService.syncToHost();
        }
      },
      onExplorerToggleLock: (id) => {
        const el = this.model.getElementById(id);
        if (el) {
          const locked = el.attributes['data-locked'] === 'true';
          el.attributes['data-locked'] = locked ? 'false' : 'true';
          this.services.historyService.pushUndo();
          this.services.workspaceLayout.render();
          this.hostSyncService.syncToHost();
        }
      },
      onExplorerReorder: (sourceId, targetId, pos) => {
        this.model.elements = LayerReorderService.moveToPosition(this.model.elements, sourceId, targetId, pos);
        this.services.historyService.pushUndo();
        this.services.workspaceLayout.render();
        this.hostSyncService.syncToHost();
      },
      onExplorerRecenter: () => {
        this.viewportCtrl?.recenterViewBox();
      },
    });

    this.viewportCtrl = new ViewportController({
      canvasScrollArea: this.layoutMgr.canvasScrollArea,
      canvasWrapper: this.layoutMgr.canvasWrapper,
      getSvgCanvas: () => this.layoutMgr.svgCanvas,
      canvasMgr: this.canvasMgr,
      model: this.model,
      onRender: () => this.services.workspaceLayout.render(),
      onApplyCanvasSize: () => this.services.workspaceLayout.applyCanvasSize(),
      onRenderOverlay: () => this.services.workspaceLayout.renderOverlay(),
      onSyncRulers: (x, y) => this.layoutMgr.rulerView?.renderRulers(x, y),
      onResizeRulers: (w, h) => this.layoutMgr.rulerView?.updateSize(w, h),
      onZoomChanged: () => {
        this.services.workspaceLayout.updateGridLayer();
        this.hostSyncService.syncMetadataToHostDebounced();
      },
      onCameraOffsetChanged: () => {
        this.services.workspaceLayout.updateGridLayer();
        this.hostSyncService.syncMetadataToHostDebounced();
      },
    });
    this.canvasMgr.visibleBoundsProvider = () => this.viewportCtrl.getVisibleCanvasBounds();

    // 5. Interaction Controller, CanvasView, and Host Sync Service
    this.interactionCtrl = new CanvasInteractionController({
      model: this.model,
      selectionTool: this.selectionTool,
      nodeEditorTool: this.nodeEditorTool,
      canvasMgr: this.canvasMgr,
      tools: this.tools,
      getViewportCtrl: () => this.viewportCtrl,
      getRulerView: () => this.layoutMgr?.rulerView,
      getToolbar: () => this.layoutMgr?.toolbar,
      getPropertyPanel: () => this.layoutMgr?.propertyPanel,
      getCanvasView: () => this.canvasView,
      getContextMenu: () => this.contextMenu,
      render: () => this.services.workspaceLayout.render(),
      renderOverlay: () => this.services.workspaceLayout.renderOverlay(),
      applyCanvasSize: () => this.services.workspaceLayout.applyCanvasSize(),
      syncRulerScroll: () => this.services.workspaceLayout.syncRulerScroll(),
      syncMetadataToHost: () => this.hostSyncService.syncMetadataToHost(),
      pushUndo: () => this.services.historyService.pushUndo(),
    });

    this.canvasView = new CanvasView(
      {
        canvasContainer: this.layoutMgr.canvasContainer,
        canvasScrollArea: this.layoutMgr.canvasScrollArea,
        canvasWrapper: this.layoutMgr.canvasWrapper,
      },
      this.interactionCtrl
    );

    this.hostSyncService = new HostSyncService({
      model: this.model,
      canvasMgr: this.canvasMgr,
      selectionTool: this.selectionTool,
      historyService: this.services.historyService,
      getViewportCtrl: () => this.viewportCtrl,
      getCanvasContainer: () => this.layoutMgr.canvasContainer,
      getTopBar: () => this.layoutMgr.topBar,
      applyCanvasSize: () => this.services.workspaceLayout.applyCanvasSize(),
      render: () => this.services.workspaceLayout.render(),
      recenterViewBox: () => this.viewportCtrl.recenterViewBox(),
    });

    // 6. Commands, Shortcuts & Context Menus
    this.commandShortcutCtrl = new CommandShortcutController({
      model: this.model,
      selectionTool: this.selectionTool,
      canvasMgr: this.canvasMgr,
      nodeEditorTool: this.nodeEditorTool,
      contextMenu: this.contextMenu,
      tools: this.tools,
      historyService: this.services.historyService,
      clipboardService: this.services.clipboardService,
      actionDispatcher: this.services.actionDispatcher,
      workspaceLayout: this.services.workspaceLayout,
      hostSyncService: this.hostSyncService,
      interactionCtrl: this.interactionCtrl,
      getViewportCtrl: () => this.viewportCtrl,
      getLayoutMgr: () => this.layoutMgr,
    });

    // 7. Ready notification to VS Code Host
    this.hostSyncService.notifyReady();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AntiDrawApp();
});
