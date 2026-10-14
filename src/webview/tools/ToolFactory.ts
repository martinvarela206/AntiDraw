import { VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { HistoryService } from '../services/HistoryService.js';
import { HostSyncService } from '../services/HostSyncService.js';
import { WorkspaceLayoutService } from '../engine/canvas/WorkspaceLayoutService.js';
import { CanvasInteractionController } from '../controllers/CanvasInteractionController.js';
import { Toolbar } from '../ui/Toolbar.js';
import { RulerView } from '../ui/RulerView.js';
import { PropertyPanel } from '../ui/PropertyPanel.js';
import { CanvasView } from '../engine/canvas/CanvasView.js';
import { ToolContext } from './IToolHandler.js';
import { SelectToolHandler } from './SelectToolHandler.js';
import { ShapeToolHandler } from './ShapeToolHandler.js';
import { PolylineToolHandler } from './PolylineToolHandler.js';
import { PenToolHandler } from './PenToolHandler.js';
import { NodeToolHandler } from './NodeToolHandler.js';
import { Session } from '../engine/session/Session.js';
import { ConfirmationModal } from '../ui/ConfirmationModal.js';

export interface ToolFactoryContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  nodeEditorTool: NodeEditorTool;
  canvasMgr: CanvasManager;
  getHistoryService: () => HistoryService;
  getHostSyncService: () => HostSyncService;
  getWorkspaceLayout: () => WorkspaceLayoutService;
  getInteractionCtrl: () => CanvasInteractionController;
  getToolbar: () => Toolbar | undefined;
  getRulerView: () => RulerView | undefined;
  getPropertyPanel: () => PropertyPanel | undefined;
  getCanvasView: () => CanvasView | undefined;
}

export interface ToolSuite {
  toolCtx: ToolContext;
  selectToolHandler: SelectToolHandler;
  shapeToolHandler: ShapeToolHandler;
  polylineToolHandler: PolylineToolHandler;
  penToolHandler: PenToolHandler;
  nodeToolHandler: NodeToolHandler;
  session: Session;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Tool Suite Factory (ToolFactory - L2/L4)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates the instantiation and callback wiring for all vector manipulation tools
 *    (`select`, `shape`, `polyline`, `pen`, `node`) and the interactive `Session` container.
 *
 * 2. Inversion of Control & Encapsulation:
 *    Shields the Composition Root (`main.ts`) from intimate knowledge of individual tool constructor
 *    dependencies and inspector synchronization callbacks.
 */
export class ToolFactory {
  public static createToolSuite(ctx: ToolFactoryContext): ToolSuite {
    const toolCtx: ToolContext = {
      model: ctx.model,
      selectionTool: ctx.selectionTool,
      canvasMgr: ctx.canvasMgr,
      pushUndo: () => ctx.getHistoryService().pushUndo(),
      syncToHost: () => ctx.getHostSyncService().syncToHost(),
      render: () => ctx.getWorkspaceLayout().render(),
      renderOverlay: () => ctx.getWorkspaceLayout().renderOverlay(),
      snapPoint: (pt, others, exclude, strokeWidth, halfPixel) =>
        ctx.canvasMgr.snapPoint(
          pt,
          others,
          {
            x: ctx.model.getViewBoxBounds().minX + (ctx.canvasMgr.rulerConfig.originX || 0),
            y: ctx.model.getViewBoxBounds().minY + (ctx.canvasMgr.rulerConfig.originY || 0),
          },
          ctx.model.getViewBoxBounds(),
          exclude,
          ctx.model.elements,
          Array.from(ctx.selectionTool.selectedElementIds),
          strokeWidth,
          halfPixel
        ),
      getOtherVertices: (exclude) => ctx.getInteractionCtrl()?.getOtherVertices(exclude) || [],
      setTool: (t) => ctx.getToolbar()?.setTool(t),
      getActiveTool: () => ctx.getToolbar()?.activeTool || 'select',
      confirm: (options) => ConfirmationModal.confirm(options),
      applyCanvasSize: () => ctx.getWorkspaceLayout().applyCanvasSize(),
      isPointerOverRuler: (x, y, o) => ctx.getRulerView()?.isPointOverRuler(x, y, o) ?? false,
    };

    const selectToolHandler = new SelectToolHandler(toolCtx, ctx.nodeEditorTool, {
      onSelectionChanged: () => ctx.getPropertyPanel()?.update(null, 'select'),
      onGuideSelected: (guide) => {
        ctx.getRulerView()?.setCornerActive(false);
        ctx.getPropertyPanel()?.showGuideSettings(guide);
        ctx.getHostSyncService().syncMetadataToHost();
      },
      onClearPanelMode: () => {
        ctx.getRulerView()?.setCornerActive(false);
        ctx.getPropertyPanel()?.resetPanelMode();
      },
      setCursor: (cursor) => ctx.getCanvasView()?.setCursor(cursor),
      syncMetadataToHost: () => ctx.getHostSyncService().syncMetadataToHost(),
    });

    const shapeToolHandler = new ShapeToolHandler(toolCtx);
    const polylineToolHandler = new PolylineToolHandler(toolCtx);
    const penToolHandler = new PenToolHandler(toolCtx);

    const nodeToolHandler = new NodeToolHandler(toolCtx, ctx.nodeEditorTool, {
      onNodeSelected: (v, _e, cnt = 1) =>
        ctx.getPropertyPanel()?.update(
          v,
          'node',
          penToolHandler.penNodeType,
          penToolHandler.vertexCount,
          null,
          polylineToolHandler.vertexCount,
          ctx.canvasMgr.gridAlignmentMode,
          ctx.canvasMgr.grids,
          ctx.canvasMgr.guides,
          cnt
        ),
      onDeselectNode: () => ctx.getPropertyPanel()?.resetPanelMode(),
    });

    const session = new Session(
      {
        select: selectToolHandler,
        shape: shapeToolHandler,
        polyline: polylineToolHandler,
        pen: penToolHandler,
        node: nodeToolHandler,
      },
      {
        onRender: () => ctx.getWorkspaceLayout().render(),
        onRenderOverlay: () => ctx.getWorkspaceLayout().renderOverlay(),
        onToolChanged: (tool) => ctx.getToolbar()?.setTool(tool),
        onResetPropertyPanel: () => ctx.getPropertyPanel()?.resetPanelMode(),
        setCursor: (cursor) => ctx.getCanvasView()?.setCursor(cursor),
        getBaseSnapshot: () => ctx.getHistoryService().createSnapshot(),
        onRestoreSnapshot: (state) => ctx.getHistoryService().applyState(state),
        onCommitSnapshot: () => ctx.getHistoryService().pushUndo(),
      }
    );

    return {
      toolCtx,
      selectToolHandler,
      shapeToolHandler,
      polylineToolHandler,
      penToolHandler,
      nodeToolHandler,
      session,
    };
  }
}
