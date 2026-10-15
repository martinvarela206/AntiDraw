import { VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { CanvasManager, GuideLine } from '../engine/CanvasManager.js';
import { HistoryService } from './HistoryService.js';
import { ClipboardService } from './ClipboardService.js';
import { CanvasActionDispatcher } from './CanvasActionDispatcher.js';
import { WorkspaceLayoutService } from '../engine/canvas/WorkspaceLayoutService.js';
import { HostSyncService } from './HostSyncService.js';
import { AppLayoutManager } from '../ui/AppLayoutManager.js';
import { ViewportController } from '../engine/ViewportController.js';
import { ToolSuite } from '../tools/ToolFactory.js';
import { OverlayRenderer } from '../engine/OverlayRenderer.js';
import { SvgDomRenderer } from '../engine/canvas/SvgDomRenderer.js';
import { CrashGuard } from './CrashGuard.js';

export interface CoreServiceContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  nodeEditorTool: NodeEditorTool;
  canvasMgr: CanvasManager;
  getHostSyncService: () => HostSyncService;
  getLayoutMgr: () => AppLayoutManager | undefined;
  getViewportCtrl: () => ViewportController | undefined;
  getTools: () => ToolSuite;
}

export interface CoreServices {
  historyService: HistoryService;
  clipboardService: ClipboardService;
  actionDispatcher: CanvasActionDispatcher;
  workspaceLayout: WorkspaceLayoutService;
  crashGuard: CrashGuard;
}

/**
 * ARCHITECTURAL RATIONALE: Core Engine Services Factory (CoreServiceRegistry - L3)
 *
 * Encapsulates the instantiation and mutual wiring of fundamental services:
 * - HistoryService: deep transaction snapshots and rollback
 * - ClipboardService: cross-element copy/paste/duplicate
 * - CanvasActionDispatcher: constructive geometry, alignments, z-order
 * - WorkspaceLayoutService: DOM SVG projection and dynamic sizing
 */
export class CoreServiceRegistry {
  public static createServices(ctx: CoreServiceContext): CoreServices {
    let workspaceLayout: WorkspaceLayoutService;

    const historyService = new HistoryService({
      model: ctx.model,
      selectionTool: ctx.selectionTool,
      canvasMgr: ctx.canvasMgr,
      render: () => workspaceLayout.render(),
      syncToHost: () => ctx.getHostSyncService().syncToHost(),
      syncMetadataToHost: () => ctx.getHostSyncService().syncMetadataToHost(),
      onResetPropertyPanel: () => ctx.getLayoutMgr()?.propertyPanel.resetPanelMode(),
    });

    const clipboardService = new ClipboardService({
      model: ctx.model,
      selectionTool: ctx.selectionTool,
      canvasMgr: ctx.canvasMgr,
      pushUndo: () => historyService.pushUndo(),
      render: () => workspaceLayout.render(),
      syncToHost: () => ctx.getHostSyncService().syncToHost(),
      syncMetadataToHost: () => ctx.getHostSyncService().syncMetadataToHost(),
      onResetPropertyPanel: () => ctx.getLayoutMgr()?.propertyPanel.resetPanelMode(),
      onShowGuideSettings: (g: GuideLine) => ctx.getLayoutMgr()?.propertyPanel.showGuideSettings(g),
      onUpdatePropertyPanel: () => ctx.getLayoutMgr()?.propertyPanel.update(null, 'select'),
    });

    const crashGuard = new CrashGuard({
      historyService,
      render: () => workspaceLayout.render(),
    });

    const actionDispatcher = new CanvasActionDispatcher({
      model: ctx.model,
      selectionTool: ctx.selectionTool,
      pushUndo: () => historyService.pushUndo(),
      render: () => workspaceLayout.render(),
      syncToHost: () => ctx.getHostSyncService().syncToHost(),
      onResetPropertyPanel: () => ctx.getLayoutMgr()?.propertyPanel.resetPanelMode(),
      onUpdatePropertyPanel: (t) => ctx.getLayoutMgr()?.propertyPanel.update(null, t),
      getActiveTool: () => ctx.getLayoutMgr()?.toolbar?.activeTool || 'select',
      crashGuard,
    });

    workspaceLayout = new WorkspaceLayoutService({
      model: ctx.model,
      canvasMgr: ctx.canvasMgr,
      selectionTool: ctx.selectionTool,
      nodeEditorTool: ctx.nodeEditorTool,
      overlayRenderer: new OverlayRenderer(),
      svgDomRenderer: new SvgDomRenderer(),
      gridCanvasRenderer: () => ctx.getLayoutMgr()?.gridCanvasRenderer,
      getCanvasWrapper: () => ctx.getLayoutMgr()?.canvasWrapper,
      getCanvasScrollArea: () => ctx.getLayoutMgr()?.canvasScrollArea,
      getSvgCanvas: () => ctx.getLayoutMgr()?.svgCanvas,
      getOverlaySvg: () => ctx.getLayoutMgr()?.overlaySvg,
      getViewportCtrl: () => ctx.getViewportCtrl(),
      getRulerView: () => ctx.getLayoutMgr()?.rulerView,
      getPropertyPanel: () => ctx.getLayoutMgr()?.propertyPanel,
      getToolbar: () => ctx.getLayoutMgr()?.toolbar,
      getSession: () => ctx.getTools().session,
      getPenHandler: () => ctx.getTools().penToolHandler,
      getPolylineHandler: () => ctx.getTools().polylineToolHandler,
      getVectorExplorerPanel: () => ctx.getLayoutMgr()?.vectorExplorerPanel,
    });

    return {
      historyService,
      clipboardService,
      actionDispatcher,
      workspaceLayout,
      crashGuard,
    };
  }
}
