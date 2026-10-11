import { ToolType } from '../tools/ToolType.js';
import { TopBarCallbacks } from '../ui/TopBar.js';
import { RulerViewCallbacks } from '../ui/RulerView.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { HistoryService } from '../services/HistoryService.js';
import { HostSyncService } from '../services/HostSyncService.js';
import { CanvasActionDispatcher } from '../services/CanvasActionDispatcher.js';
import { WorkspaceLayoutService } from '../engine/canvas/WorkspaceLayoutService.js';
import { Session } from '../engine/session/Session.js';
import { ViewportController } from '../engine/ViewportController.js';
import { CanvasView } from '../engine/canvas/CanvasView.js';
import { AppLayoutManager } from '../ui/AppLayoutManager.js';
import { VectorModel } from '../engine/VectorModel.js';
import { TransformNumericModal } from '../ui/TransformNumericModal.js';

export interface ChromeActionContext {
  model: VectorModel;
  canvasMgr: CanvasManager;
  selectionTool: SelectionTool;
  historyService: () => HistoryService;
  hostSyncService: () => HostSyncService;
  actionDispatcher: () => CanvasActionDispatcher;
  workspaceLayout: () => WorkspaceLayoutService;
  session: () => Session;
  getViewportCtrl: () => ViewportController | undefined;
  getCanvasView: () => CanvasView | undefined;
  getLayoutMgr: () => AppLayoutManager | undefined;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated UI Chrome Action Controller (ChromeActionController - L4)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates top toolbar commands (align, flip, booleans, z-order, grid/guide toggles, snap controls)
 *    and physical ruler bar interactions (origin resets, corner inspection modes, drag starts) away from `main.ts`.
 *
 * 2. Unidirectional Event Dispatching:
 *    Routes chrome user actions to their respective engine domains and updates visual views in a deterministic pass.
 */
export class ChromeActionController {
  constructor(private ctx: ChromeActionContext) {}

  public onToolChange(tool: ToolType): void {
    const statusTool = document.getElementById('status-tool');
    if (statusTool) statusTool.innerText = `Tool: ${tool}`;

    const layout = this.ctx.getLayoutMgr();
    layout?.rulerView.setCornerActive(false);

    if (tool !== 'select' && tool !== 'stroke') {
      this.ctx.canvasMgr.selectedGuideId = null;
      this.ctx.canvasMgr.activeGuideTransformId = null;
    }
    this.ctx.session().setTool(tool);
  }

  /**
   * ARCHITECTURAL RATIONALE: Tool Double-Click Quick Actions (09.2)
   * - Select Tool double-click: Opens precision numeric transformation modal dialog (X, Y, ΔX, ΔY).
   * - Zoom Tool double-click: Fits the SVG artboard / ViewBox seamlessly to the screen (Fit to Screen).
   */
  public onToolDoubleClick(tool: ToolType): void {
    if (tool === 'select') {
      const selectedEls = this.ctx.model.elements.filter((el) =>
        this.ctx.selectionTool.isSelected(el.id)
      );
      let groupBox: { x: number; y: number; width: number; height: number } | null = null;
      if (selectedEls.length === 1) {
        groupBox = this.ctx.selectionTool.getBoundingBox(selectedEls[0]);
      } else if (selectedEls.length > 1) {
        groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls);
      }

      TransformNumericModal.show({
        currentBox: groupBox,
        selectedCount: selectedEls.length,
        onApply: (dx, dy, duplicate) => {
          this.ctx.actionDispatcher().translateSelection(dx, dy, duplicate);
        },
      });
    } else if (tool === 'zoom') {
      this.ctx.getViewportCtrl()?.fitToScreen(32);
    }
  }

  public createTopBarCallbacks(): TopBarCallbacks {
    return {
      onUndo: () => this.ctx.historyService().undo(),
      onRedo: () => this.ctx.historyService().redo(),
      onAlign: (type) => this.ctx.actionDispatcher().align(type),
      onFlip: (axis) => this.ctx.actionDispatcher().flip(axis),
      onBoolean: (op) => this.ctx.actionDispatcher().executeBoolean(op),
      onZOrder: (action) => this.ctx.actionDispatcher().reorderZ(action),
      onToggleRulers: () => {
        this.ctx.canvasMgr.showRulers = !this.ctx.canvasMgr.showRulers;
        const layout = this.ctx.getLayoutMgr();
        layout?.canvasContainer.classList.toggle('no-rulers', !this.ctx.canvasMgr.showRulers);
        layout?.topBar.update();
        this.ctx.workspaceLayout().syncRulerScroll();
        this.ctx.workspaceLayout().render();
        this.ctx.hostSyncService().syncMetadataToHost();
      },
      onToggleGrid: () => {
        this.ctx.canvasMgr.showGrid = !this.ctx.canvasMgr.showGrid;
        this.ctx.getLayoutMgr()?.topBar.update();
        this.ctx.workspaceLayout().updateGridLayer();
        this.ctx.workspaceLayout().render();
        this.ctx.hostSyncService().syncMetadataToHost();
      },
      onToggleGuides: () => {
        this.ctx.canvasMgr.showGuides = !this.ctx.canvasMgr.showGuides;
        this.ctx.getLayoutMgr()?.topBar.update();
        this.ctx.workspaceLayout().render();
        this.ctx.hostSyncService().syncMetadataToHost();
      },
      onToggleSnap: (type) => {
        if (type === 'grid') this.ctx.canvasMgr.snapToGrid = !this.ctx.canvasMgr.snapToGrid;
        if (type === 'guide') this.ctx.canvasMgr.snapToGuides = !this.ctx.canvasMgr.snapToGuides;
        if (type === 'nodes' || type === 'vertex') this.ctx.canvasMgr.snapToNodes = !this.ctx.canvasMgr.snapToNodes;
        if (type === 'edges') this.ctx.canvasMgr.snapToEdges = !this.ctx.canvasMgr.snapToEdges;
        if (type === 'viewbox') this.ctx.canvasMgr.snapToViewBox = !this.ctx.canvasMgr.snapToViewBox;
        if (type === 'angular') this.ctx.canvasMgr.snapAngular = !this.ctx.canvasMgr.snapAngular;
        this.ctx.getLayoutMgr()?.topBar.update();
        this.ctx.hostSyncService().syncMetadataToHost();
      },
    };
  }

  public createRulerCallbacks(): RulerViewCallbacks {
    return {
      onCornerClick: () => {
        const layout = this.ctx.getLayoutMgr();
        if (!layout) return;

        if (layout.propertyPanel.currentPanelMode === 'ruler') {
          layout.rulerView.setCornerActive(false);
          layout.propertyPanel.resetPanelMode();
          layout.toolbar.setTool('select');
          this.ctx.workspaceLayout().render();
          return;
        }
        layout.toolbar.deselectAll();
        layout.rulerView.setCornerActive(true);
        this.ctx.selectionTool.deselectAll();
        this.ctx.canvasMgr.selectedGuideId = null;
        this.ctx.canvasMgr.activeGuideTransformId = null;
        const statusTool = document.getElementById('status-tool');
        if (statusTool) statusTool.innerText = `Tool: Ruler`;
        layout.propertyPanel.showRulerSettings(
          this.ctx.canvasMgr.rulerConfig,
          this.ctx.canvasMgr.gridAlignmentMode,
          this.ctx.canvasMgr.grids,
          this.ctx.canvasMgr.guides
        );
        this.ctx.workspaceLayout().render();
      },
      onResetOrigin: () => {
        this.ctx.canvasMgr.rulerConfig.originX = 0;
        this.ctx.canvasMgr.rulerConfig.originY = 0;
        this.ctx.workspaceLayout().syncRulerScroll();
        this.ctx.getLayoutMgr()?.propertyPanel.showRulerSettings(
          this.ctx.canvasMgr.rulerConfig,
          this.ctx.canvasMgr.gridAlignmentMode,
          this.ctx.canvasMgr.grids,
          this.ctx.canvasMgr.guides
        );
        this.ctx.workspaceLayout().render();
        this.ctx.hostSyncService().syncMetadataToHost();
      },
      onStartDragOrigin: (pos) => {
        const session = this.ctx.session();
        session.activeHandle = 'origin-drag';
        session.dragOriginPt = this.ctx.getViewportCtrl()?.getCanvasPointFromClient(pos.x, pos.y) || { x: pos.x, y: pos.y };
        session.isDragging = true;
        this.ctx.getCanvasView()?.setCursor('crosshair');
        this.ctx.workspaceLayout().renderOverlay();
      },
      onStartDragGuide: (orientation, pos) => {
        const session = this.ctx.session();
        session.activeHandle = 'guide-create';
        session.dragGuideOrientation = orientation;
        session.dragGuideCurrentPt = this.ctx.getViewportCtrl()?.getCanvasPointFromClient(pos.x, pos.y) || { x: pos.x, y: pos.y };
        session.isDragging = true;
        this.ctx.canvasMgr.selectedGuideId = null;
        this.ctx.workspaceLayout().render();
      },
    };
  }
}
