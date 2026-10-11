import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, PathVertex, VectorElement } from '../engine/VectorModel.js';
import { formatNum } from '../engine/geometry/PathGeometryCompiler.js';
import { ActionIntent, ActionIntentFactory } from './contracts/ActionIntent.js';
import { CommandRegistry } from '../engine/commands/CommandRegistry.js';
import { OverlayDescriptor } from '../engine/canvas/OverlayDescriptor.js';
import { GizmoRenderer, GizmoTheme } from '../engine/canvas/helpers/GizmoRenderer.js';

/**
 * ARCHITECTURAL RATIONALE: Polyline & Orthogonal Polygon State Machine (PolylineToolHandler)
 *
 * 1. Ephemeral Vertex Accumulation:
 *    Unlike geometric shape tools that calculate bounds between two points, polylines accumulate
 *    an arbitrary sequence of vertices. Storing them in `currentPolylineVertices` and rendering
 *    them via `renderOverlay` keeps the DOM clean and prevents dozens of unnecessary undo steps.
 *
 * 2. Consecutive Micro-Offset Deduplication:
 *    Double-click events in modern browsers fire two consecutive `pointerdown` / `click` events
 *    in rapid succession before emitting `dblclick`. Without vertex deduplication (ignoring points
 *    with Euclidean distance <= 0.5px), the polyline would commit redundant duplicate nodes at the
 *    endpoint, causing visual rendering artifacts and corrupting De Casteljau subdivision in the
 *    Node Editor.
 *
 * 3. Magnetic Closing Ring Geometry:
 *    When drawing a closed polygon, the illustrator needs visual certainty that the current click
 *    will close the path rather than adding an adjacent vertex. When the hovering cursor is within
 *    14 / zoom pixels of the origin node (`firstV`), PolylineToolHandler snaps the endpoint to
 *    `firstV` and renders a prominent pulsating green target circle (`#10b981`), automatically
 *    closing the polygon on click.
 */
export class PolylineToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['polyline'];
  private ctx: ToolContext;

  public currentPolylineVertices: PathVertex[] = [];
  public polylineHoverPoint: Point | null = null;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  public get vertexCount(): number {
    return this.currentPolylineVertices.length;
  }

  /**
   * Ciclo Declarativo (Capa L2): Evalúa pointerdown y emite intenciones
   */
  public evalPointerDown(e: PointerEvent, pt: Point): ActionIntent {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'polyline' || e.button !== 0) return ActionIntentFactory.none();

    const z = this.ctx.canvasMgr.zoom || 1;
    const closeRadius = 14 / z;
    const otherVertices = this.ctx.getOtherVertices();
    this.currentPolylineVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);

    // Si hace click en el primer vértice, cerrar polígono
    if (this.currentPolylineVertices.length >= 2) {
      const firstV = this.currentPolylineVertices[0];
      const distSnapped = Math.hypot(snappedPt.x - firstV.x, snappedPt.y - firstV.y);
      const distRaw = Math.hypot(pt.x - firstV.x, pt.y - firstV.y);
      if (distSnapped <= closeRadius || distRaw <= closeRadius) {
        return ActionIntentFactory.commit('polyline.finish', { close: true });
      }
    }

    // Si hace click en el último vértice, finalizar trazado abierto
    if (this.currentPolylineVertices.length >= 2) {
      const lastV = this.currentPolylineVertices[this.currentPolylineVertices.length - 1];
      const distSnapped = Math.hypot(snappedPt.x - lastV.x, snappedPt.y - lastV.y);
      const distRaw = Math.hypot(pt.x - lastV.x, pt.y - lastV.y);
      if (distSnapped <= 6 / z || distRaw <= 6 / z) {
        return ActionIntentFactory.commit('polyline.finish', { close: false });
      }
    }

    const isStart = this.currentPolylineVertices.length === 0;
    const newV: PathVertex = {
      id: `v_poly_${Date.now().toString(36)}_${this.currentPolylineVertices.length}`,
      x: snappedPt.x,
      y: snappedPt.y,
      nodeType: 'asymmetric',
      command: isStart ? 'M' : 'L',
    };

    return ActionIntentFactory.begin('polyline.vertex', { vertex: newV, isStart });
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerDown(e, pt);
    if (intent.kind === 'none') return false;

    if (intent.kind === 'commit') {
      this.finishPolylinePath(intent.params.close);
      return true;
    }

    if (intent.kind === 'begin' && intent.payload?.vertex) {
      this.currentPolylineVertices.push(intent.payload.vertex);
      this.polylineHoverPoint = { x: intent.payload.vertex.x, y: intent.payload.vertex.y };
      this.ctx.renderOverlay();
      return true;
    }

    return false;
  }

  public evalPointerMove(_e: PointerEvent, pt: Point): ActionIntent {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'polyline') return ActionIntentFactory.none();

    const otherVertices = this.ctx.getOtherVertices();
    this.currentPolylineVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);
    return ActionIntentFactory.preview('polyline.hover', { point: snappedPt });
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerMove(e, pt);
    if (intent.kind === 'none') return false;

    if (intent.kind === 'preview' && intent.payload?.point) {
      this.polylineHoverPoint = intent.payload.point;
    }
    this.ctx.renderOverlay();
    return true;
  }

  public evalPointerUp(_e: PointerEvent, _pt: Point): ActionIntent {
    return ActionIntentFactory.none();
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerUp(e, pt);
    return intent.kind !== 'none';
  }

  public onDoubleClick(_e: MouseEvent, _pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool === 'polyline' && this.currentPolylineVertices.length >= 2) {
      this.finishPolylinePath(false);
      return true;
    }
    return false;
  }

  public onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') {
      if (this.currentPolylineVertices.length >= 2) {
        this.finishPolylinePath(false);
        return true;
      }
    }
    if (e.key === 'Escape') {
      return this.cancel();
    }
    return false;
  }

  public cancel(): boolean {
    if (this.currentPolylineVertices.length > 0 || this.polylineHoverPoint) {
      this.currentPolylineVertices = [];
      this.polylineHoverPoint = null;
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public deactivate(): void {
    this.currentPolylineVertices = [];
    this.polylineHoverPoint = null;
  }

  /**
   * ARCHITECTURAL RATIONALE: Coincident Vertex Deduplication & Terminal Unification
   *
   * 1. Eliminating Micro-Offset Duplicates:
   *    Consecutive clicks occurring in close succession (double-click gestures or mouse debounce jitter)
   *    frequently emit adjacent vertices with Euclidean distance <= 0.5px.
   * 2. Single Unified Closing Node:
   *    When closing the path (`close === true`), if the final vertex was placed over the starting
   *    anchor point (`v0`), `unifyClosingVertices` fuses the closing vertex into `v0`, transferring
   *    incoming tangent handles and discarding the duplicate endpoint. The SVG 'Z' command then
   *    cleanly seals the contour to `v0` without producing double-stacked nodes.
   *
   * 3. Canonical SVG Native Primitive Preservation (FEAT-11):
   *    - Closed straight-segment contours are preserved directly as native SVG `<polygon>` primitives.
   *    - Open straight-segment sequences with >2 nodes are preserved as native SVG `<polyline>` primitives.
   *    - Open 2-node straight segments are preserved as native SVG `<line>` primitives.
   */
  public finishPolylinePath(close: boolean = false): void {
    const z = this.ctx.canvasMgr.zoom || 1;
    const cleanVerts = this.ctx.model.unifyClosingVertices(
      this.currentPolylineVertices,
      close,
      14 / z
    );

    if (cleanVerts.length >= 2) {
      const id = `el_poly_${Date.now().toString(36)}`;
      const pathD = this.ctx.model.compilePathD(cleanVerts, close);
      const pointsStr = cleanVerts.map((v) => `${formatNum(v.x)},${formatNum(v.y)}`).join(' ');
      const tagName = close ? 'polygon' : (cleanVerts.length === 2 ? 'line' : 'polyline');
      const shapeType = close ? 'polygon' : (cleanVerts.length === 2 ? 'line' : 'polyline');
      const isParametric = true;

      const attributes: Record<string, string> = {
        id,
        d: pathD,
        fill: close ? '#6366f1' : 'none',
        stroke: '#ffffff',
        'stroke-width': '2',
        'data-node-types': cleanVerts.map(() => 'asymmetric').join(','),
        'data-shape': shapeType,
        'data-parametric': 'true',
      };

      if (shapeType === 'line') {
        attributes['x1'] = formatNum(cleanVerts[0].x);
        attributes['y1'] = formatNum(cleanVerts[0].y);
        attributes['x2'] = formatNum(cleanVerts[1].x);
        attributes['y2'] = formatNum(cleanVerts[1].y);
      } else {
        attributes['points'] = pointsStr;
      }

      const newEl: VectorElement = {
        id,
        tagName,
        shapeType,
        attributes,
        vertices: cleanVerts,
        isClosed: close,
        isParametric,
      };

      const cmdRegistry = CommandRegistry.getInstance();
      const cmdId = newEl.tagName === 'path' ? 'path.create' : 'shape.create';
      if (cmdRegistry.has(cmdId)) {
        cmdRegistry.execute(cmdId, { element: newEl });
      } else if (cmdRegistry.has('shape.create')) {
        cmdRegistry.execute('shape.create', { element: newEl });
      } else {
        this.ctx.pushUndo();
        this.ctx.model.elements.push(newEl);
        this.ctx.selectionTool.select(id);
        this.ctx.render();
        this.ctx.syncToHost();
      }

      this.currentPolylineVertices = [];
      this.polylineHoverPoint = null;
      this.ctx.setTool('select');
      this.ctx.render();
    } else {
      this.currentPolylineVertices = [];
      this.polylineHoverPoint = null;
      this.ctx.render();
    }
  }

  public renderOverlay(zoom: number): OverlayDescriptor[] {
    const z = zoom || 1;
    const descriptors: OverlayDescriptor[] = [];

    if (this.currentPolylineVertices.length > 0) {
      const polyD = this.ctx.model.compilePathD(this.currentPolylineVertices, false);
      descriptors.push(GizmoRenderer.renderGhostPathDescriptor(polyD, false));

      const lastV = this.currentPolylineVertices[this.currentPolylineVertices.length - 1];
      const firstV = this.currentPolylineVertices[0];

      if (this.polylineHoverPoint) {
        const isHoveringStart =
          this.currentPolylineVertices.length >= 2 &&
          Math.hypot(this.polylineHoverPoint.x - firstV.x, this.polylineHoverPoint.y - firstV.y) <= 14 / z;

        const targetPt = isHoveringStart ? { x: firstV.x, y: firstV.y } : this.polylineHoverPoint;

        descriptors.push(...GizmoRenderer.renderRubberbandDescriptor(lastV, targetPt, z, isHoveringStart));

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

      this.currentPolylineVertices.forEach((v, idx) => {
        const isStart = idx === 0;
        descriptors.push(
          ...GizmoRenderer.renderAnchorDescriptor(
            v,
            { kind: isStart ? 'first' : 'standard', state: 'idle' },
            z
          )
        );
      });
    } else if (this.ctx.getActiveTool() === 'polyline' && this.polylineHoverPoint) {
      descriptors.push(
        ...GizmoRenderer.renderAnchorDescriptor(
          this.polylineHoverPoint,
          { kind: 'standard', state: 'idle' },
          z
        )
      );
    }

    return descriptors;
  }
}
