import { VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { ViewportController } from '../engine/ViewportController.js';
import { AppLayoutManager } from '../ui/AppLayoutManager.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { ClipboardService } from '../services/ClipboardService.js';
import { HistoryService } from '../services/HistoryService.js';
import { HostSyncService } from '../services/HostSyncService.js';
import { CanvasActionDispatcher } from '../services/CanvasActionDispatcher.js';
import { WorkspaceLayoutService } from '../engine/canvas/WorkspaceLayoutService.js';
import { CanvasInteractionController } from './CanvasInteractionController.js';
import { KeyboardShortcutController } from './KeyboardShortcutController.js';
import { ContextMenuController } from './ContextMenuController.js';
import { CommandRegistry } from '../engine/commands/CommandRegistry.js';
import { registerSystemCommands } from '../engine/commands/SystemCommands.js';
import { ToolSuite } from '../tools/ToolFactory.js';

export interface CommandShortcutContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  nodeEditorTool: NodeEditorTool;
  contextMenu: ContextMenu;
  tools: ToolSuite;
  historyService: HistoryService;
  clipboardService: ClipboardService;
  actionDispatcher: CanvasActionDispatcher;
  workspaceLayout: WorkspaceLayoutService;
  hostSyncService: HostSyncService;
  interactionCtrl: CanvasInteractionController;
  getViewportCtrl: () => ViewportController;
  getLayoutMgr: () => AppLayoutManager;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Command & Shortcut Orchestrator (CommandShortcutController - L3/L4)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Centralizes the wiring of global command execution (`CommandRegistry`), physical keyboard
 *    accelerators (`KeyboardShortcutController`), and contextual radial/DOM menus (`ContextMenuController`).
 *
 * 2. Unified Action Hub:
 *    Ensures that undo, clipboard, z-order, node conversions, and host synchronization operations
 *    execute identical business logic regardless of whether they originate from a keyboard shortcut,
 *    command palette dispatch, or right-click context menu.
 */
export class CommandShortcutController {
  public readonly commandRegistry: CommandRegistry;
  public readonly keyboardCtrl: KeyboardShortcutController;
  public readonly contextMenuCtrl: ContextMenuController;

  constructor(private ctx: CommandShortcutContext) {
    const layout = ctx.getLayoutMgr();
    const vp = ctx.getViewportCtrl();

    // 1. Command Registry
    this.commandRegistry = CommandRegistry.getInstance();
    registerSystemCommands(this.commandRegistry);
    this.commandRegistry.setContext({
      model: ctx.model,
      selectionTool: ctx.selectionTool,
      canvasMgr: ctx.canvasMgr,
      toolbar: layout.toolbar,
      propertyPanel: layout.propertyPanel,
      clipboardService: ctx.clipboardService,
      historyService: ctx.historyService,
      actionDispatcher: ctx.actionDispatcher,
      viewportCtrl: vp,
      nodeEditorTool: ctx.nodeEditorTool,
      nodeToolHandler: ctx.tools.nodeToolHandler,
      undo: () => ctx.historyService.undo(),
      redo: () => ctx.historyService.redo(),
      pushUndo: () => ctx.historyService.pushUndo(),
      render: () => ctx.workspaceLayout.render(),
      syncToHost: () => ctx.hostSyncService.syncToHost(),
      syncMetadataToHost: () => ctx.hostSyncService.syncMetadataToHost(),
      cutSelection: () => ctx.clipboardService.cut(),
      copySelection: () => ctx.clipboardService.copy(),
      pasteClipboard: () => ctx.clipboardService.paste(),
      duplicateSelection: () => ctx.clipboardService.duplicate(),
      handleConvertToCurves: () => ctx.actionDispatcher.convertToCurves(),
      handleConvertToPrimitives: () => ctx.actionDispatcher.convertToPrimitives(),
      handleZOrder: (action: 'front' | 'forward' | 'backward' | 'back') => ctx.actionDispatcher.reorderZ(action),
      recenterViewBox: () => vp.recenterViewBox(),
    });

    // 2. Keyboard Accelerators
    this.keyboardCtrl = new KeyboardShortcutController({
      toolbar: layout.toolbar,
      selectionTool: ctx.selectionTool,
      canvasMgr: ctx.canvasMgr,
      nodeEditorTool: ctx.nodeEditorTool,
      model: ctx.model,
      propertyPanel: layout.propertyPanel,
      clipboardService: ctx.clipboardService,
      nodeToolHandler: ctx.tools.nodeToolHandler,
      shapeToolHandler: ctx.tools.shapeToolHandler,
      penToolHandler: ctx.tools.penToolHandler,
      polylineToolHandler: ctx.tools.polylineToolHandler,
      eraserToolHandler: ctx.tools.eraserToolHandler,
      isDragging: () => ctx.tools.session.isDragging,
      activeHandle: () => ctx.tools.session.activeHandle,
      copySelection: () => ctx.clipboardService.copy(),
      cutSelection: () => ctx.clipboardService.cut(),
      pasteClipboard: () => ctx.clipboardService.paste(),
      duplicateSelection: () => ctx.clipboardService.duplicate(),
      handleConvertToCurves: () => ctx.actionDispatcher.convertToCurves(),
      undo: () => ctx.historyService.undo(),
      redo: () => ctx.historyService.redo(),
      cancelCurrentAction: () => ctx.interactionCtrl.cancelCurrentAction(),
      pushUndo: () => ctx.historyService.pushUndo(),
      render: () => ctx.workspaceLayout.render(),
      renderOverlay: () => ctx.workspaceLayout.renderOverlay(),
      syncToHost: () => ctx.hostSyncService.syncToHost(),
      syncMetadataToHost: () => ctx.hostSyncService.syncMetadataToHost(),
    });

    // 3. Context Menu
    this.contextMenuCtrl = new ContextMenuController(
      {
        contextMenu: ctx.contextMenu,
        selectionTool: ctx.selectionTool,
        canvasMgr: ctx.canvasMgr,
        model: ctx.model,
        toolbar: layout.toolbar,
        propertyPanel: layout.propertyPanel,
        clipboardService: ctx.clipboardService,
        getCanvasPoint: (e) => ctx.interactionCtrl.getCanvasPoint(e),
        handleConvertToCurves: () => ctx.actionDispatcher.convertToCurves(),
        handleConvertToPrimitives: () => ctx.actionDispatcher.convertToPrimitives(),
        cutSelection: () => ctx.clipboardService.cut(),
        copySelection: () => ctx.clipboardService.copy(),
        pasteClipboard: () => ctx.clipboardService.paste(),
        duplicateSelection: () => ctx.clipboardService.duplicate(),
        handleZOrder: (action: 'front' | 'forward' | 'backward' | 'back') => ctx.actionDispatcher.reorderZ(action),
        pushUndo: () => ctx.historyService.pushUndo(),
        render: () => ctx.workspaceLayout.render(),
        syncToHost: () => ctx.hostSyncService.syncToHost(),
        cancelCurrentAction: () => ctx.interactionCtrl.cancelCurrentAction(),
      },
      [layout.canvasContainer, layout.canvasWrapper, layout.canvasScrollArea]
    );
  }
}
