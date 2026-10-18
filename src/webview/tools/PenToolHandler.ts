import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, PointUtils, PathVertex, NodeType, VectorElement } from '../engine/VectorModel.js';
import { ActionIntent, ActionIntentFactory } from './contracts/ActionIntent.js';
import { CommandRegistry } from '../engine/commands/CommandRegistry.js';
import { OverlayDescriptor } from '../engine/canvas/OverlayDescriptor.js';
import { GizmoRenderer, GizmoTheme } from '../engine/canvas/helpers/GizmoRenderer.js';

/**
 * ARCHITECTURAL RATIONALE: Elastic Real-Time Curvature Feedback & Dynamic Bézier Ghosting
 * Dynamic Bézier ghosting, Alt-modifier cusp breaking, and scale normalization via GizmoRenderer.
 */
export class PenToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['pen'];
  private ctx: ToolContext;

  public penNodeType: NodeType = 'symmetric';
  public currentPenVertices: PathVertex[] = [];
  public penHoverPoint: Point | null = null;
  public penActiveVertexIdx: number | null = null;
  public penMovingVertexIdx: number | null = null;
  public isDragging: boolean = false;
  public isCuspBroken: boolean = false;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  public get vertexCount(): number {
    return this.currentPenVertices.length;
  }

  /**
   * Ciclo Declarativo (Capa L2): Evalúa pointerdown y emite intenciones
   */
  public evalPointerDown(e: PointerEvent, pt: Point): ActionIntent {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'pen' || e.button !== 0) return ActionIntentFactory.none();

    let evalPt = pt;
    if (e.shiftKey && this.currentPenVertices.length > 0) {
      const lastV = this.currentPenVertices[this.currentPenVertices.length - 1];
      evalPt = PointUtils.snapAngle({ x: lastV.x, y: lastV.y }, evalPt, Math.PI / 12);
    }

    const otherVertices = this.ctx.getOtherVertices();
    this.currentPenVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
    const snappedPt = (e.shiftKey && this.currentPenVertices.length > 0) ? evalPt : this.ctx.snapPoint(pt, otherVertices);

    // Check if clicking start node to close path
    if (this.currentPenVertices.length >= 2) {
      const firstV = this.currentPenVertices[0];
      const distSnapped = Math.hypot(snappedPt.x - firstV.x, snappedPt.y - firstV.y);
      const distRaw = Math.hypot(pt.x - firstV.x, pt.y - firstV.y);

      if (distSnapped <= closeRadius || distRaw <= closeRadius) {
        return ActionIntentFactory.commit('pen.finish', { close: true });
      }
    }

    const isStart = this.currentPenVertices.length === 0;
    const initialNodeType: NodeType = 'sharp';
    const newV: PathVertex = {
      id: `v_pen_${Date.now().toString(36)}_${this.currentPenVertices.length}`,
      x: snappedPt.x,
      y: snappedPt.y,
      nodeType: initialNodeType,
      command: isStart ? 'M' : 'L',
    };

    return ActionIntentFactory.begin('pen.vertex', { vertex: newV, isStart });
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerDown(e, pt);
    if (intent.kind === 'none') return false;

    if (intent.kind === 'commit') {
      this.finishPenPath(intent.params.close);
      return true;
    }

    if (intent.kind === 'begin' && intent.payload?.vertex) {
      this.currentPenVertices.push(intent.payload.vertex);
      this.penActiveVertexIdx = this.currentPenVertices.length - 1;
      this.isDragging = true;
      this.isCuspBroken = false;
      this.ctx.render();
      return true;
    }

    return false;
  }

  public evalPointerMove(e: PointerEvent, pt: Point): ActionIntent {
    if (this.ctx.getActiveTool() !== 'pen') return ActionIntentFactory.none();
    return ActionIntentFactory.preview('pen.move', { pt, altKey: e.altKey });
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerMove(e, pt);
    if (intent.kind === 'none') return false;

    if (this.isDragging && this.penActiveVertexIdx !== null) {
      const v = this.currentPenVertices[this.penActiveVertexIdx];
      const otherVertices = this.ctx.getOtherVertices();
      this.currentPenVertices.forEach((item, idx) => {
        if (idx !== this.penActiveVertexIdx) otherVertices.push({ x: item.x, y: item.y });
      });
      let snappedPt = this.ctx.snapPoint(pt, otherVertices);
      if (e.shiftKey) {
        snappedPt = PointUtils.snapAngle({ x: v.x, y: v.y }, snappedPt, Math.PI / 12);
      }

      const dx = snappedPt.x - v.x;
      const dy = snappedPt.y - v.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 3) {
        if (e.altKey) this.isCuspBroken = true;
        if (this.isCuspBroken) {
          v.nodeType = 'asymmetric';
          v.handleOut = { x: snappedPt.x, y: snappedPt.y };
        } else {
          v.nodeType = 'symmetric';
          v.handleOut = { x: snappedPt.x, y: snappedPt.y };
          v.handleIn = { x: v.x - dx, y: v.y - dy };
        }
      } else {
        if (!this.isCuspBroken && !v.handleOut && !v.handleIn) v.nodeType = 'sharp';
        const otherVerts = this.ctx.getOtherVertices();
        this.currentPenVertices.forEach((item) => otherVerts.push({ x: item.x, y: item.y }));
        this.penHoverPoint = this.ctx.snapPoint(pt, otherVerts);
      }
      this.ctx.renderOverlay();
      return true;
    }

    // Hover mode (cursor preview)
    let hoverPt = pt;
    if (e.shiftKey && this.currentPenVertices.length > 0) {
      const lastV = this.currentPenVertices[this.currentPenVertices.length - 1];
      hoverPt = PointUtils.snapAngle({ x: lastV.x, y: lastV.y }, hoverPt, Math.PI / 12);
      this.penHoverPoint = hoverPt;
    } else {
      const otherVertices = this.ctx.getOtherVertices();
      this.currentPenVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
      this.penHoverPoint = this.ctx.snapPoint(pt, otherVertices);
    }
    this.ctx.renderOverlay();
    return true;
  }

  public evalPointerUp(_e: PointerEvent, _pt: Point): ActionIntent {
    return this.isDragging ? ActionIntentFactory.preview('pen.drag_end') : ActionIntentFactory.none();
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerUp(e, pt);
    if (intent.kind === 'none') return false;

    if (this.penActiveVertexIdx !== null) {
      const v = this.currentPenVertices[this.penActiveVertexIdx];
      if (v && !v.handleIn && !v.handleOut) v.nodeType = 'sharp';
    }
    this.isDragging = false;
    this.isCuspBroken = false;
    this.penActiveVertexIdx = null;
    this.penMovingVertexIdx = null;
    this.ctx.renderOverlay();
    return true;
  }

  public onDoubleClick(_e: MouseEvent, _pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool === 'pen' && this.currentPenVertices.length >= 2) {
      this.finishPenPath(false);
      return true;
    }
    return false;
  }

  public onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Shift') {
      this.ctx.renderOverlay();
      return true;
    }
    if (e.key === 'Alt') {
      if (this.isDragging && this.penActiveVertexIdx !== null) {
        this.isCuspBroken = true;
        const v = this.currentPenVertices[this.penActiveVertexIdx];
        if (v) {
          v.nodeType = 'asymmetric';
          this.ctx.renderOverlay();
        }
        return true;
      }
    }
    if (e.key === 'Enter') {
      if (this.currentPenVertices.length >= 2) {
        this.finishPenPath(false);
        return true;
      }
    }
    if (e.key === 'Escape') {
      return this.cancel();
    }
    return false;
  }

  public cancel(): boolean {
    if (this.isDragging || this.currentPenVertices.length > 0 || this.penHoverPoint) {
      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.isDragging = false;
      this.isCuspBroken = false;
      this.penActiveVertexIdx = null;
      this.penMovingVertexIdx = null;
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public deactivate(): void {
    this.currentPenVertices = [];
    this.penHoverPoint = null;
    this.isDragging = false;
    this.isCuspBroken = false;
    this.penActiveVertexIdx = null;
    this.penMovingVertexIdx = null;
  }

  /**
   * Coincident Vertex Deduplication and Topological Fusion (unifyClosingVertices)
   */
  public finishPenPath(close: boolean = false): void {
    const z = this.ctx.canvasMgr.zoom || 1;
    const cleanVerts = this.ctx.model.unifyClosingVertices(
      this.currentPenVertices,
      close,
      14 / z
    );

    if (cleanVerts.length >= 2) {
      const id = `el_pen_${Date.now().toString(36)}`;
      const pathD = this.ctx.model.compilePathD(cleanVerts, close);
      const newEl: VectorElement = {
        id,
        tagName: 'path',
        attributes: {
          id,
          d: pathD,
          fill: close ? '#4f46e5' : 'none',
          stroke: this.ctx.model.canvas.svgStroke || '#ffffff',
          'stroke-width': '1',
          'vector-effect': 'non-scaling-stroke',
          'data-stroke-hairline': 'true',
          'data-node-types': cleanVerts.map((v) => v.nodeType).join(','),
        },
        vertices: cleanVerts,
        isClosed: close,
      };

      const cmdRegistry = CommandRegistry.getInstance();
      const cmdId = cmdRegistry.has('path.create') ? 'path.create' : 'shape.create';
      if (cmdRegistry.has(cmdId)) {
        cmdRegistry.execute(cmdId, { element: newEl });
      } else {
        this.ctx.pushUndo();
        this.ctx.model.elements.push(newEl);
        this.ctx.selectionTool.select(id);
        this.ctx.render();
        this.ctx.syncToHost();
      }

      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.ctx.setTool('select');
      this.ctx.render();
    } else {
      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.ctx.render();
    }
  }

  public renderOverlay(zoom: number): OverlayDescriptor[] {
    const z = zoom || 1;
    const descriptors: OverlayDescriptor[] = [];

    if (this.currentPenVertices.length > 0) {
      const penD = this.ctx.model.compilePathD(this.currentPenVertices, false);
      descriptors.push(GizmoRenderer.renderGhostPathDescriptor(penD, false));

      const lastV = this.currentPenVertices[this.currentPenVertices.length - 1];
      const firstV = this.currentPenVertices[0];

      if (this.penHoverPoint) {
        const isHoveringStart =
          this.currentPenVertices.length >= 2 &&
          Math.hypot(this.penHoverPoint.x - firstV.x, this.penHoverPoint.y - firstV.y) <= 14 / z;

        const targetPt = isHoveringStart ? { x: firstV.x, y: firstV.y } : this.penHoverPoint;

        if (lastV.handleOut) {
          const ghostD = `M ${lastV.x} ${lastV.y} C ${lastV.handleOut.x} ${lastV.handleOut.y}, ${targetPt.x} ${targetPt.y}, ${targetPt.x} ${targetPt.y}`;
          descriptors.push({
            type: 'path',
            d: ghostD,
            fill: 'none',
            stroke: isHoveringStart ? GizmoTheme.rubberband.strokeClosing : GizmoTheme.rubberband.strokeStandard,
            strokeWidth: GizmoTheme.rubberband.strokeWidth,
            strokeDasharray: GizmoTheme.rubberband.dash,
            vectorEffect: 'non-scaling-stroke',
          });
        } else {
          descriptors.push(...GizmoRenderer.renderRubberbandDescriptor(lastV, targetPt, z, isHoveringStart));
        }

        if (isHoveringStart) {
          descriptors.push({
            type: 'circle',
            cx: firstV.x,
            cy: firstV.y,
            r: GizmoTheme.rubberband.closureHaloRadius / z,
            fill: 'none',
            stroke: GizmoTheme.rubberband.strokeClosing,
            strokeWidth: GizmoTheme.rubberband.closureHaloWidth,
            strokeDasharray: GizmoTheme.rubberband.closureHaloDash,
            vectorEffect: 'non-scaling-stroke',
          });
        } else {
          descriptors.push(...GizmoRenderer.renderAnchorDescriptor(targetPt, { kind: 'standard', state: 'idle' }, z));
        }
      }

      this.currentPenVertices.forEach((v, idx) => {
        const isStart = idx === 0;
        if (v.handleIn) {
          descriptors.push(...GizmoRenderer.renderHandleDescriptor(v, v.handleIn, z));
        }
        if (v.handleOut) {
          descriptors.push(...GizmoRenderer.renderHandleDescriptor(v, v.handleOut, z));
        }
        descriptors.push(
          ...GizmoRenderer.renderAnchorDescriptor(
            v,
            { kind: isStart ? 'first' : 'standard', state: 'idle' },
            z
          )
        );
      });
    } else if (this.ctx.getActiveTool() === 'pen' && this.penHoverPoint) {
      descriptors.push(
        ...GizmoRenderer.renderAnchorDescriptor(
          this.penHoverPoint,
          { kind: 'standard', state: 'idle' },
          z
        )
      );
    }

    return descriptors;
  }
}
