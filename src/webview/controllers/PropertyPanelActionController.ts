import { VectorModel, VectorElement, NodeType } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager, RulerConfig, GuideLine, ShapeToolConfig, GridConfig, GridType, GridAlignmentMode } from '../engine/CanvasManager.js';
import { NodeToolHandler } from '../tools/NodeToolHandler.js';
import { PenToolHandler } from '../tools/PenToolHandler.js';
import { PolylineToolHandler } from '../tools/PolylineToolHandler.js';
import { ToolContext } from '../tools/IToolHandler.js';
import { PropertyPanel, PropertyPanelCallbacks } from '../ui/PropertyPanel.js';
import { CanvasActionDispatcher } from '../services/CanvasActionDispatcher.js';
import { DistortTransformer } from '../tools/interactions/DistortTransformer.js';
import { QuadCorners } from '../engine/geometry/ProjectiveHomography.js';
import { Point } from '../core/geom/Point.js';
import { CommandRegistry } from '../commands/CommandRegistry.js';
import { WarpEngine, WarpArcOptions } from '../engine/warp/WarpEngine.js';
import { BoundingBoxCalculator } from '../engine/geometry/BoundingBoxCalculator.js';

import { ToolSuite } from '../tools/ToolFactory.js';
import { CoreServices } from '../services/CoreServiceRegistry.js';
import { HostSyncService } from '../services/HostSyncService.js';

export interface PropertyPanelActionContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  tools: ToolSuite;
  services: CoreServices;
  getPropertyPanel: () => PropertyPanel | undefined;
  getHostSyncService: () => HostSyncService;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Property Panel Action Controller (PropertyPanelActionController - L4)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Decouples the inspector panel mutation callbacks (stroke, fill, transforms, geometry,
 *    subdivisions, distort homography, grids, guidelines) away from `main.ts`.
 *
 * 2. Unidirectional Mutation Flow:
 *    Every property mutation updates the model or canvas configuration, records an undo
 *    snapshot when appropriate, triggers re-rendering, and synchronizes to the host.
 */
export class PropertyPanelActionController {
  constructor(private ctx: PropertyPanelActionContext) {}

  public createCallbacks(): PropertyPanelCallbacks {
    const s = this.ctx.services;
    const tools = this.ctx.tools;
    const host = this.ctx.getHostSyncService();

    return {
      onRenderOverlay: () => s.workspaceLayout.renderOverlay(),
      onUpdateElement: (_el: VectorElement) => {
        s.workspaceLayout.render();
        host.syncToHost();
      },
      onUpdateCanvas: () => {
        s.workspaceLayout.applyCanvasSize();
        s.workspaceLayout.render();
        host.syncToHost();
      },
      syncMetadataToHost: () => host.syncMetadataToHost(),
      onNodeTypeChange: (type: NodeType) => tools.nodeToolHandler.handleNodeTypeChange(type),
      onSplitNode: () => tools.nodeToolHandler.handleSplitNode(),
      onClosePath: () => tools.nodeToolHandler.handleCloseOpenPath(),
      onJoinNodes: () => tools.nodeToolHandler.handleJoinSelectedNodes(),
      onConvertSegmentToLine: () => tools.nodeToolHandler.handleConvertSegmentToLine(),
      onConvertSegmentToCurve: () => tools.nodeToolHandler.handleConvertSegmentToCurve(),
      onUpdateNodePosition: (vertexId: string, pos: Point) => {
        tools.nodeToolHandler.handleUpdateNodePosition(vertexId, pos);
      },
      onUpdateNodeHandle: (vertexId: string, handleType: 'handleIn' | 'handleOut', pos: Point) => {
        tools.nodeToolHandler.handleUpdateNodeHandle(vertexId, handleType, pos);
      },
      onPenNodeTypeChange: (nodeType: NodeType) => {
        tools.penToolHandler.penNodeType = nodeType;
        s.workspaceLayout.render();
      },
      onFinishPenPath: (close: boolean) => {
        tools.penToolHandler.finishPenPath(close);
      },
      onFinishPolylinePath: (close: boolean) => {
        tools.polylineToolHandler.finishPolylinePath(close);
      },
      onUpdateRuler: (cfg: RulerConfig) => {
        this.ctx.canvasMgr.rulerConfig = cfg;
        s.workspaceLayout.syncRulerScroll();
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onUpdateGuide: (_guide: GuideLine) => {
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onDeleteGuide: (id: string) => {
        this.ctx.canvasMgr.removeGuide(id);
        this.ctx.getPropertyPanel()?.resetPanelMode();
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onClearAllGuides: () => {
        this.ctx.canvasMgr.guides = [];
        this.ctx.canvasMgr.selectedGuideId = null;
        this.ctx.canvasMgr.activeGuideTransformId = null;
        this.ctx.getPropertyPanel()?.resetPanelMode();
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onUpdateShapeConfig: (cfg: ShapeToolConfig) => {
        this.ctx.canvasMgr.shapeConfig = cfg;
      },
      onGridAlignmentChange: (mode: GridAlignmentMode) => {
        this.ctx.canvasMgr.gridAlignmentMode = mode;
        host.updateStatusGridAlignment();
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onAddGrid: (type: GridType) => {
        this.ctx.canvasMgr.addGrid(type, 20);
        this.ctx.getPropertyPanel()?.showRulerSettings(
          this.ctx.canvasMgr.rulerConfig,
          this.ctx.canvasMgr.gridAlignmentMode,
          this.ctx.canvasMgr.grids,
          this.ctx.canvasMgr.guides
        );
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onRemoveGrid: (gridId: string) => {
        this.ctx.canvasMgr.removeGrid(gridId);
        this.ctx.getPropertyPanel()?.showRulerSettings(
          this.ctx.canvasMgr.rulerConfig,
          this.ctx.canvasMgr.gridAlignmentMode,
          this.ctx.canvasMgr.grids,
          this.ctx.canvasMgr.guides
        );
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onUpdateGrid: (gridId: string, partial: Partial<GridConfig>) => {
        this.ctx.canvasMgr.updateGrid(gridId, partial);
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onReorderGrid: (gridId: string, direction: 'up' | 'down') => {
        this.ctx.canvasMgr.reorderGrid(gridId, direction);
        this.ctx.getPropertyPanel()?.showRulerSettings(
          this.ctx.canvasMgr.rulerConfig,
          this.ctx.canvasMgr.gridAlignmentMode,
          this.ctx.canvasMgr.grids,
          this.ctx.canvasMgr.guides
        );
        s.workspaceLayout.render();
        host.syncMetadataToHost();
      },
      onSelectGuide: (guideId: string) => {
        this.ctx.canvasMgr.selectedGuideId = guideId;
        const g = this.ctx.canvasMgr.getGuide(guideId);
        if (g) {
          this.ctx.getPropertyPanel()?.showGuideSettings(g);
        }
        s.workspaceLayout.render();
      },
      onBoolean: (op) => {
        const cmdId = `boolean.${op}`;
        const registry = CommandRegistry.getInstance();
        if (registry.has(cmdId)) {
          registry.execute(cmdId);
        } else {
          s.actionDispatcher.executeBoolean(op);
        }
      },
      onStrokeToPath: () => s.actionDispatcher.strokeToPath(),
      onConvertToCurves: (_el) => s.actionDispatcher.convertToCurves(),
      onGroup: () => s.actionDispatcher.groupSelection(),
      onUngroup: () => s.actionDispatcher.ungroupSelection(),
      onPushUndo: () => s.historyService.pushUndo(),
      onDistortCornerChange: (cornerKey: 'nw' | 'ne' | 'se' | 'sw', coord: Point) => {
        const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
        if (selectedEls.length === 0) return;
        const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
        if (!groupBox) return;
        const quad: QuadCorners = this.ctx.selectionTool.currentDistortQuad || {
          nw: { x: groupBox.x, y: groupBox.y },
          ne: { x: groupBox.x + groupBox.width, y: groupBox.y },
          se: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
          sw: { x: groupBox.x, y: groupBox.y + groupBox.height },
        };
        const updatedQuad = DistortTransformer.setCornerCoordinate(
          tools.toolCtx,
          cornerKey,
          coord,
          selectedEls,
          groupBox,
          quad
        );
        if (updatedQuad) {
          this.ctx.selectionTool.currentDistortQuad = updatedQuad;
          this.ctx.getPropertyPanel()?.update(null, 'select');
          s.workspaceLayout.render();
          host.syncToHost();
        }
      },
      onResetDistortCorner: (cornerKey: 'nw' | 'ne' | 'se' | 'sw') => {
        const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
        if (selectedEls.length === 0) return;
        const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
        if (!groupBox) return;
        const quad: QuadCorners = this.ctx.selectionTool.currentDistortQuad || {
          nw: { x: groupBox.x, y: groupBox.y },
          ne: { x: groupBox.x + groupBox.width, y: groupBox.y },
          se: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
          sw: { x: groupBox.x, y: groupBox.y + groupBox.height },
        };
        const cornersToReset =
          this.ctx.selectionTool.selectedDistortCorners && this.ctx.selectionTool.selectedDistortCorners.size > 1
            ? Array.from(this.ctx.selectionTool.selectedDistortCorners)
            : [cornerKey];
        let updatedQuad: QuadCorners | null = quad;
        for (const ck of cornersToReset) {
          const res = DistortTransformer.resetCorner(
            tools.toolCtx,
            ck,
            selectedEls,
            groupBox,
            updatedQuad
          );
          if (res) updatedQuad = res;
        }
        if (updatedQuad) {
          this.ctx.selectionTool.currentDistortQuad = updatedQuad;
          this.ctx.getPropertyPanel()?.update(null, 'select');
          s.workspaceLayout.render();
          host.syncToHost();
        }
      },
      onResetAllDistortCorners: () => {
        const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
        if (selectedEls.length === 0) return;
        const restoredQuad = DistortTransformer.resetAllCorners(tools.toolCtx, selectedEls);
        this.ctx.selectionTool.currentDistortQuad = restoredQuad;
        this.ctx.getPropertyPanel()?.update(null, 'select');
        s.workspaceLayout.render();
        host.syncToHost();
      },
      onResetSkew: () => {
        const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
        if (selectedEls.length === 0) return;
        DistortTransformer.resetAllCorners(tools.toolCtx, selectedEls);
        this.ctx.selectionTool.currentDistortQuad = null;
        this.ctx.getPropertyPanel()?.update(null, 'select');
        s.workspaceLayout.render();
        host.syncToHost();
      },
      onConvertGuideToVector: () => {
        CommandRegistry.getInstance().execute('guide.convertToVector');
      },
      onApplyWarpArc: (options: WarpArcOptions) => {
        const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
        if (selectedEls.length === 0) return;
        s.historyService.pushUndo();
        selectedEls.forEach((el) => {
          if (this.ctx.model.isParametricElement(el)) {
            this.ctx.model.convertToCurves(el);
          }
        });
        const groupBox = BoundingBoxCalculator.getGroupBoundingBox(selectedEls);
        if (!groupBox) return;
        selectedEls.forEach((el) => {
          WarpEngine.warpElement(el, options, groupBox);
        });
        this.ctx.getPropertyPanel()?.update(null, 'select');
        s.workspaceLayout.render();
        host.syncToHost();
      },
      onResetWarp: () => {
        const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
        if (selectedEls.length === 0) return;
        s.historyService.pushUndo();
        selectedEls.forEach((el) => {
          WarpEngine.resetWarp(el);
        });
        this.ctx.getPropertyPanel()?.update(null, 'select');
        s.workspaceLayout.render();
        host.syncToHost();
      },
    };
  }
}
