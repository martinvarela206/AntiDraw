import { Point } from '../core/geom/Point.js';
import { VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { ViewportController } from '../engine/ViewportController.js';
import { Session } from '../engine/session/Session.js';
import { CanvasView, CanvasViewDelegate } from '../engine/canvas/CanvasView.js';
import { SelectToolHandler } from '../tools/SelectToolHandler.js';
import { ShapeToolHandler } from '../tools/ShapeToolHandler.js';
import { PolylineToolHandler } from '../tools/PolylineToolHandler.js';
import { PenToolHandler } from '../tools/PenToolHandler.js';
import { NodeToolHandler } from '../tools/NodeToolHandler.js';
import { NodeCatalogService } from '../engine/selection/NodeCatalogService.js';
import { Toolbar } from '../ui/Toolbar.js';
import { RulerView } from '../ui/RulerView.js';
import { PropertyPanel } from '../ui/PropertyPanel.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { ToolSuite } from '../tools/ToolFactory.js';

export interface CanvasInteractionContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  nodeEditorTool: NodeEditorTool;
  canvasMgr: CanvasManager;
  tools: ToolSuite;
  getViewportCtrl: () => ViewportController | undefined;
  getRulerView: () => RulerView | undefined;
  getToolbar: () => Toolbar | undefined;
  getPropertyPanel: () => PropertyPanel | undefined;
  getCanvasView: () => CanvasView | undefined;
  getContextMenu: () => ContextMenu | undefined;
  render: () => void;
  renderOverlay: () => void;
  applyCanvasSize: () => void;
  syncRulerScroll: () => void;
  syncMetadataToHost: () => void;
  pushUndo: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Canvas Interaction Controller (CanvasInteractionController - L4)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates pointer event processing, status bar coordinate telemetry, ruler interactions
 *    (origin repositioning, dynamic guide dragging with snapped drop previews),
 *    and polymorphic tool delegation away from `main.ts`.
 *
 * 2. Complete CanvasViewDelegate Compliance:
 *    Directly binds to `CanvasView` to receive hardware-accelerated RAF-coalesced pointer movements,
 *    window boundary events, and cross-boundary drag streams.
 */
export class CanvasInteractionController implements CanvasViewDelegate {
  private get session(): Session { return this.ctx.tools.session; }
  private get selectToolHandler(): SelectToolHandler { return this.ctx.tools.selectToolHandler; }
  private get shapeToolHandler(): ShapeToolHandler { return this.ctx.tools.shapeToolHandler; }
  private get polylineToolHandler(): PolylineToolHandler { return this.ctx.tools.polylineToolHandler; }
  private get penToolHandler(): PenToolHandler { return this.ctx.tools.penToolHandler; }
  private get nodeToolHandler(): NodeToolHandler { return this.ctx.tools.nodeToolHandler; }

  constructor(private ctx: CanvasInteractionContext) {}

  public getCanvasPoint(e: PointerEvent | MouseEvent): Point {
    const vp = this.ctx.getViewportCtrl();
    return vp ? vp.getCanvasPointFromClient(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
  }

  public isDragging(): boolean {
    return this.session.isDragging;
  }

  public isMiddlePanning(): boolean {
    return this.ctx.getViewportCtrl()?.isMiddlePanning ?? false;
  }

  public cancelCurrentAction(): void {
    this.ctx.getContextMenu()?.hide();
    this.ctx.getCanvasView()?.cancelRaf();
    this.session.cancelCurrentAction();
  }

  public onCancelAction(): void {
    this.cancelCurrentAction();
  }

  public handleLostFocusOrCancel(): void {
    const session = this.session;
    const toolbar = this.ctx.getToolbar();
    if (
      session.isDragging ||
      this.nodeToolHandler.isDragging ||
      this.shapeToolHandler.shapeStartPt !== null ||
      session.activeHandle !== null ||
      (toolbar?.activeTool === 'pen' && this.penToolHandler.isDragging)
    ) {
      this.cancelCurrentAction();
    }
  }

  public onLostFocusOrCancel(): void {
    this.handleLostFocusOrCancel();
  }

  public onPointerDown(e: PointerEvent, pt: Point): void {
    this.ctx.getContextMenu()?.hide();
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      this.cancelCurrentAction();
      return;
    }
    if (e.button !== 0) return;

    const session = this.session;
    session.dragStartPt = pt;
    session.isDragging = true;

    const toolbar = this.ctx.getToolbar();
    if (!toolbar?.activeTool || (toolbar.activeTool as any) === '') {
      toolbar?.setTool('select');
      this.ctx.getRulerView()?.setCornerActive(false);
      this.ctx.getPropertyPanel()?.resetPanelMode();
    }

    const activeTool = toolbar?.activeTool || 'select';
    this.ctx.getCanvasView()?.setPointerCapture(e.pointerId);

    if (activeTool === 'select' || activeTool === 'stroke') {
      if (this.selectToolHandler.onPointerDown(e, pt)) return;
    } else if (activeTool === 'node') {
      if (this.nodeToolHandler.onPointerDown(e, pt)) return;
    } else if (['rect', 'circle', 'ellipse', 'line', 'polygon', 'star'].includes(activeTool)) {
      if (this.shapeToolHandler.onPointerDown(e, pt)) {
        session.activeHandle = 'shape';
        return;
      }
    } else if (activeTool === 'polyline') {
      if (this.polylineToolHandler.onPointerDown(e, pt)) {
        this.ctx.render();
        return;
      }
    } else if (activeTool === 'pen') {
      if (this.penToolHandler.onPointerDown(e, pt)) return;
    } else if (activeTool === 'zoom') {
      const delta = e.altKey ? -0.1 : 0.1;
      this.ctx.getViewportCtrl()?.zoomAtClientPoint(e.clientX, e.clientY, delta);
      return;
    }

    this.ctx.render();
  }

  public onPointerMove(e: PointerEvent, pt: Point): void {
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) {
      const vb = this.ctx.model.getViewBoxBounds();
      const cfg = this.ctx.canvasMgr.rulerConfig;
      const originX = vb.minX + (cfg.originX || 0);
      const originY = vb.minY + (cfg.originY || 0);
      const relX = Math.round((pt.x - originX) / (cfg.scale || 1));
      const relY = Math.round((pt.y - originY) / (cfg.scale || 1));
      coordsEl.innerText = `X: ${relX}, Y: ${relY}`;
    }

    const rulerView = this.ctx.getRulerView();
    rulerView?.setCursorPos(pt.x, pt.y);

    const toolbar = this.ctx.getToolbar();
    const activeTool = toolbar?.activeTool || 'select';
    const canvasView = this.ctx.getCanvasView();
    const session = this.session;

    // Node Tool Delegation
    if (activeTool === 'node') {
      if (this.nodeToolHandler.onPointerMove(e, pt)) return;
      const z = this.ctx.canvasMgr.zoom || 1;
      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
      if (selectedEl && selectedEl.vertices) {
        const hit = this.ctx.nodeEditorTool.hitTestVertices(selectedEl.vertices, pt, 12 / z, this.ctx.nodeEditorTool.selectedVertexId);
        if (hit) {
          canvasView?.setCursor('pointer');
          return;
        }
        const hitSeg = this.ctx.nodeEditorTool.hitTestSegment(selectedEl.vertices, pt, 10 / z, this.ctx.model.isElementClosed(selectedEl));
        if (hitSeg !== null) {
          canvasView?.setCursor('crosshair');
          return;
        }
      }
      canvasView?.setCursor('default');
      return;
    }

    // Origin Drag preview from ruler corner
    if (session.activeHandle === 'origin-drag') {
      session.dragOriginPt = this.snapPoint(pt);
      this.ctx.renderOverlay();
      return;
    }

    // Guide creation preview from ruler drag
    if (session.activeHandle === 'guide-create') {
      const allVerts = this.getOtherVertices();
      session.dragGuideCurrentPt = this.snapPoint(pt, allVerts);
      this.ctx.renderOverlay();
      return;
    }

    // Tool Delegation
    if (activeTool === 'select' || activeTool === 'stroke') {
      if (this.selectToolHandler.onPointerMove(e, pt)) return;
    } else if (activeTool === 'polyline') {
      canvasView?.setCursor('crosshair');
      this.polylineToolHandler.onPointerMove(e, pt);
      return;
    } else if (activeTool === 'pen') {
      canvasView?.setCursor('crosshair');
      this.penToolHandler.onPointerMove(e, pt);
      return;
    } else if (session.activeHandle === 'shape') {
      this.shapeToolHandler.onPointerMove(e, pt);
      return;
    }
  }

  public onPointerUp(e: PointerEvent, pt: Point): void {
    const canvasView = this.ctx.getCanvasView();
    canvasView?.cancelRaf();
    canvasView?.releasePointerCapture(e.pointerId);

    const session = this.session;
    const toolbar = this.ctx.getToolbar();
    const activeTool = toolbar?.activeTool || 'select';

    // Node Tool Delegation
    if (activeTool === 'node') {
      session.isDragging = false;
      if (this.nodeToolHandler.onPointerUp(e, pt)) return;
      return;
    }

    // Finishing Origin Drag from ruler corner
    if (session.activeHandle === 'origin-drag') {
      session.isDragging = false;
      const vb = this.ctx.model.getViewBoxBounds();
      const finalPt = session.dragOriginPt || pt;
      this.ctx.canvasMgr.rulerConfig.originX = Math.round(finalPt.x - vb.minX);
      this.ctx.canvasMgr.rulerConfig.originY = Math.round(finalPt.y - vb.minY);
      session.activeHandle = null;
      session.dragOriginPt = null;
      this.ctx.syncRulerScroll();
      this.ctx.getPropertyPanel()?.showRulerSettings(this.ctx.canvasMgr.rulerConfig);
      this.ctx.render();
      this.ctx.syncMetadataToHost();
      return;
    }

    // Finishing Guide Creation from ruler drag
    if (session.activeHandle === 'guide-create') {
      session.isDragging = false;
      const isHoriz = session.dragGuideOrientation === 'horizontal';
      const allVerts = this.getOtherVertices();
      const snappedPt = this.snapPoint(pt, allVerts);
      const pos = Math.round(isHoriz ? snappedPt.y : snappedPt.x);

      const isDroppedOnRuler = this.ctx.getRulerView()?.isPointOverRuler(e.clientX, e.clientY, session.dragGuideOrientation);

      if (!isDroppedOnRuler) {
        const initialPivot = {
          x: Math.round(snappedPt.x),
          y: Math.round(snappedPt.y),
        };
        this.ctx.pushUndo();
        const newG = this.ctx.canvasMgr.addGuide(
          session.dragGuideOrientation,
          pos,
          this.ctx.model.canvas.width,
          this.ctx.model.canvas.height,
          undefined,
          initialPivot
        );
        this.ctx.canvasMgr.selectedGuideId = newG.id;
        this.ctx.getPropertyPanel()?.showGuideSettings(newG);
        this.ctx.syncMetadataToHost();
      }
      session.activeHandle = null;
      this.ctx.render();
      return;
    }

    // Select Tool Delegation
    if (activeTool === 'select' || activeTool === 'stroke') {
      session.isDragging = false;
      if (this.selectToolHandler.onPointerUp(e, pt)) return;
    }

    // Pen Tool Delegation
    if (activeTool === 'pen') {
      session.isDragging = false;
      if (this.penToolHandler.onPointerUp(e, pt)) return;
    }

    // Shape Tool Delegation
    if (session.activeHandle === 'shape') {
      session.isDragging = false;
      this.shapeToolHandler.onPointerUp(e, pt);
      session.activeHandle = null;
      toolbar?.setTool('select');
      this.ctx.applyCanvasSize();
      this.ctx.render();
      return;
    }

    session.isDragging = false;
    session.activeHandle = null;
    this.ctx.render();
  }

  public onDoubleClick(e: MouseEvent, pt: Point): void {
    const toolbar = this.ctx.getToolbar();
    const activeTool = toolbar?.activeTool || 'select';

    if (activeTool === 'zoom') {
      this.ctx.getViewportCtrl()?.zoomAtClientPoint(e.clientX, e.clientY, -0.2);
      return;
    }
    if (activeTool === 'polyline' && this.polylineToolHandler.onDoubleClick(e, pt)) return;
    if (activeTool === 'pen' && this.penToolHandler.onDoubleClick(e, pt)) return;
    if (activeTool === 'node' && this.nodeToolHandler.onDoubleClick(e, pt)) return;
    if (activeTool === 'select' && this.selectToolHandler.onDoubleClick(e, pt)) return;
  }

  private snapPoint(pt: Point, otherVertices: Point[] = [], excludeGuideId?: string): Point {
    const vb = this.ctx.model.getViewBoxBounds();
    const origin = {
      x: vb.minX + (this.ctx.canvasMgr.rulerConfig.originX || 0),
      y: vb.minY + (this.ctx.canvasMgr.rulerConfig.originY || 0),
    };
    const excludeElementIds = this.ctx.selectionTool ? Array.from(this.ctx.selectionTool.selectedElementIds) : undefined;
    return this.ctx.canvasMgr.snapPoint(pt, otherVertices, origin, vb, excludeGuideId, this.ctx.model.elements, excludeElementIds);
  }

  public getOtherVertices(excludeIds: string[] = []): Point[] {
    return NodeCatalogService.collectSnappableNodes(this.ctx.model.elements, { excludeIds });
  }
}
