import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, PathVertex, NodeType, VectorElement } from '../engine/VectorModel.js';
import { ActionIntent, ActionIntentFactory } from './contracts/ActionIntent.js';
import { CommandRegistry } from '../engine/commands/CommandRegistry.js';
import { OverlayDescriptor } from '../engine/canvas/OverlayDescriptor.js';

/**
 * ARCHITECTURAL RATIONALE: Elastic Real-Time Curvature Feedback & Dynamic Bézier Ghosting
 *
 * 1. Dynamic Bézier Ghosting:
 *    Traditional pen tools show only a straight rubberband line to the cursor, forcing the
 *    illustrator to mentally calculate the outgoing tangent curve. By synthesizing a cubic Bézier
 *    path (`M lastV.x,lastV.y C lastV.handleOut ... targetPt targetPt`) directly from the outgoing
 *    handle of the committed node to the hovering cursor point, the user visualizes the precise
 *    mathematical curve prior to committing the click.
 *
 * 2. Unlinked Tangents via Alt-Modifier (Sharp Cusps in Continuous Gestures):
 *    When dragging a new node, handles are generated colinearly. If the user holds `Alt`, the
 *    tangent link is immediately broken, switching the node to `asymmetric` and locking `handleIn`
 *    while freely positioning `handleOut`. This allows illustrators to form corners and sharp cusp
 *    transitions without breaking flow or having to switch to a secondary tool.
 *
 * 3. Physical Screen-Pixel Scale Normalization:
 *    Control points and stroke widths use `vector-effect="non-scaling-stroke"` and radii divided
 *    by `zoom` (e.g. `5 / z`, `3 / z`). This ensures interactive handles remain crisp, constant-size,
 *    and comfortable to target across all zoom factors (from 10% overview to 1000% macro editing).
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

    const z = this.ctx.canvasMgr.zoom || 1;
    const closeRadius = 14 / z;
    const otherVertices = this.ctx.getOtherVertices();
    this.currentPenVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);

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

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'pen') return false;

    if (this.isDragging && this.penActiveVertexIdx !== null) {
      const v = this.currentPenVertices[this.penActiveVertexIdx];
      const otherVertices = this.ctx.getOtherVertices();
      this.currentPenVertices.forEach((item, idx) => {
        if (idx !== this.penActiveVertexIdx) otherVertices.push({ x: item.x, y: item.y });
      });
      const snappedPt = this.ctx.snapPoint(pt, otherVertices);

      const dx = snappedPt.x - v.x;
      const dy = snappedPt.y - v.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 3) {
        if (e.altKey) {
          this.isCuspBroken = true;
        }

        if (this.isCuspBroken) {
          // Tangente quebrada: handleOut sigue al puntero libremente formando cúspide asimétrica
          v.nodeType = 'asymmetric';
          v.handleOut = { x: snappedPt.x, y: snappedPt.y };
        } else {
          // Continuidad colineal simétrica por defecto
          v.nodeType = 'symmetric';
          v.handleOut = { x: snappedPt.x, y: snappedPt.y };
          v.handleIn = { x: v.x - dx, y: v.y - dy };
        }
      } else {
        if (!this.isCuspBroken && !v.handleOut && !v.handleIn) {
          v.nodeType = 'sharp';
        }
        const otherVerts = this.ctx.getOtherVertices();
        this.currentPenVertices.forEach((item) => otherVerts.push({ x: item.x, y: item.y }));
        this.penHoverPoint = this.ctx.snapPoint(pt, otherVerts);
      }
      this.ctx.renderOverlay();
      return true;
    }

    // Hover mode (cursor preview)
    const otherVertices = this.ctx.getOtherVertices();
    this.currentPenVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);
    this.penHoverPoint = snappedPt;
    this.ctx.renderOverlay();
    return true;
  }

  public onPointerUp(_e: PointerEvent, _pt: Point): boolean {
    if (this.isDragging) {
      if (this.penActiveVertexIdx !== null) {
        const v = this.currentPenVertices[this.penActiveVertexIdx];
        if (v && !v.handleIn && !v.handleOut) {
          v.nodeType = 'sharp';
        }
      }
      this.isDragging = false;
      this.isCuspBroken = false;
      this.penActiveVertexIdx = null;
      this.penMovingVertexIdx = null;
      this.ctx.renderOverlay();
      return true;
    }
    return false;
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
   * ARCHITECTURAL RATIONALE: Coincident Vertex Deduplication and Topological Fusion
   *
   * 1. Eliminating Micro-Offset Duplicates:
   *    Consecutive micro-clicks (e.g. double-click gestures or mouse debounce jitter) frequently
   *    append multiple nodes at identical or near-identical coordinates.
   * 2. Single Unified Closing Node:
   *    When closing the path (`close === true`), if the final vertex was placed over the starting
   *    anchor point (`v0`), `unifyClosingVertices` fuses the closing vertex into `v0`, transferring
   *    incoming tangent handles and discarding the duplicate endpoint. The SVG 'Z' command then
   *    cleanly seals the contour to `v0` without producing double-stacked nodes.
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
          stroke: '#ffffff',
          'stroke-width': '2',
          'data-node-types': cleanVerts.map((v) => v.nodeType).join(','),
        },
        vertices: cleanVerts,
        isClosed: close,
      };

      const cmdRegistry = CommandRegistry.getInstance();
      if (cmdRegistry.has('shape.create')) {
        cmdRegistry.execute('shape.create', { element: newEl });
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
      descriptors.push({
        type: 'path',
        d: penD,
        fill: 'none',
        stroke: '#38bdf8',
        strokeWidth: 2,
        vectorEffect: 'non-scaling-stroke',
      });

      const lastV = this.currentPenVertices[this.currentPenVertices.length - 1];
      const firstV = this.currentPenVertices[0];

      if (this.penHoverPoint) {
        const isHoveringStart =
          this.currentPenVertices.length >= 2 &&
          Math.hypot(this.penHoverPoint.x - firstV.x, this.penHoverPoint.y - firstV.y) <= 14 / z;

        const targetPt = isHoveringStart ? { x: firstV.x, y: firstV.y } : this.penHoverPoint;

        let ghostD = '';
        if (lastV.handleOut) {
          ghostD = `M ${lastV.x} ${lastV.y} C ${lastV.handleOut.x} ${lastV.handleOut.y}, ${targetPt.x} ${targetPt.y}, ${targetPt.x} ${targetPt.y}`;
        } else {
          ghostD = `M ${lastV.x} ${lastV.y} L ${targetPt.x} ${targetPt.y}`;
        }
        descriptors.push({
          type: 'path',
          d: ghostD,
          fill: 'none',
          stroke: isHoveringStart ? '#10b981' : '#38bdf8',
          strokeWidth: 1.5,
          strokeDasharray: '4 3',
          vectorEffect: 'non-scaling-stroke',
        });

        if (isHoveringStart) {
          descriptors.push({
            type: 'circle',
            cx: firstV.x,
            cy: firstV.y,
            r: 8 / z,
            fill: 'none',
            stroke: '#10b981',
            strokeWidth: 2,
            strokeDasharray: '2 2',
            vectorEffect: 'non-scaling-stroke',
          });
        } else {
          descriptors.push({
            type: 'circle',
            cx: targetPt.x,
            cy: targetPt.y,
            r: 3.5 / z,
            fill: 'rgba(56, 189, 248, 0.35)',
            opacity: 0.95,
            stroke: '#38bdf8',
            strokeWidth: 1.5,
            strokeDasharray: '2 2',
            vectorEffect: 'non-scaling-stroke',
            pointerEvents: 'none',
          });
          descriptors.push({
            type: 'circle',
            cx: targetPt.x,
            cy: targetPt.y,
            r: 1.2 / z,
            fill: '#ffffff',
            pointerEvents: 'none',
          });
        }
      }

      this.currentPenVertices.forEach((v, idx) => {
        const isStart = idx === 0;

        if (v.handleIn) {
          descriptors.push({
            type: 'line',
            x1: v.x,
            y1: v.y,
            x2: v.handleIn.x,
            y2: v.handleIn.y,
            stroke: '#a855f7',
            strokeWidth: 1,
            strokeDasharray: '2 2',
            vectorEffect: 'non-scaling-stroke',
          });
          descriptors.push({
            type: 'circle',
            cx: v.handleIn.x,
            cy: v.handleIn.y,
            r: 3 / z,
            fill: '#a855f7',
            stroke: '#ffffff',
            strokeWidth: 1,
            vectorEffect: 'non-scaling-stroke',
          });
        }
        if (v.handleOut) {
          descriptors.push({
            type: 'line',
            x1: v.x,
            y1: v.y,
            x2: v.handleOut.x,
            y2: v.handleOut.y,
            stroke: '#a855f7',
            strokeWidth: 1,
            strokeDasharray: '2 2',
            vectorEffect: 'non-scaling-stroke',
          });
          descriptors.push({
            type: 'circle',
            cx: v.handleOut.x,
            cy: v.handleOut.y,
            r: 3 / z,
            fill: '#a855f7',
            stroke: '#ffffff',
            strokeWidth: 1,
            vectorEffect: 'non-scaling-stroke',
          });
        }

        if (isStart) {
          descriptors.push({
            type: 'circle',
            cx: v.x,
            cy: v.y,
            r: 5 / z,
            fill: '#10b981',
            stroke: '#ffffff',
            strokeWidth: 1.5,
            vectorEffect: 'non-scaling-stroke',
          });
        } else {
          descriptors.push({
            type: 'rect',
            x: v.x - 3.5 / z,
            y: v.y - 3.5 / z,
            width: 7 / z,
            height: 7 / z,
            fill: '#38bdf8',
            stroke: '#ffffff',
            strokeWidth: 1,
            rx: 1 / z,
            vectorEffect: 'non-scaling-stroke',
          });
        }
      });
    } else if (this.ctx.getActiveTool() === 'pen' && this.penHoverPoint) {
      // First ghost point preview under cursor before first click (zoom-independent screen size)
      descriptors.push({
        type: 'circle',
        cx: this.penHoverPoint.x,
        cy: this.penHoverPoint.y,
        r: 3.5 / z,
        fill: 'rgba(56, 189, 248, 0.35)',
        opacity: 0.95,
        stroke: '#38bdf8',
        strokeWidth: 1.5,
        strokeDasharray: '2 2',
        vectorEffect: 'non-scaling-stroke',
        pointerEvents: 'none',
      });
      descriptors.push({
        type: 'circle',
        cx: this.penHoverPoint.x,
        cy: this.penHoverPoint.y,
        r: 1.2 / z,
        fill: '#ffffff',
        pointerEvents: 'none',
      });
    }

    return descriptors;
  }
}
