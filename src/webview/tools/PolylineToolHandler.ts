import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from '../ui/Toolbar.js';
import { Point, PathVertex, VectorElement } from '../engine/VectorModel.js';
import { formatNum } from '../engine/geometry/PathGeometryCompiler.js';

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

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'polyline') return false;
    if (e.button !== 0) return false;

    const z = this.ctx.canvasMgr.zoom || 1;
    const closeRadius = 14 / z;
    const otherVertices = this.ctx.getOtherVertices();
    this.currentPolylineVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);

    // If clicking on the first vertex, close the polygon
    // ARCHITECTURAL RATIONALE: Resilient Proximity Snapping & Preventing Premature Duplicate Stacking
    // 1. Minimum 2 vertices required to form a closed polygon/contour. Checking `>= 2` instead of `>= 3`
    //    prevents the 3rd click (e.g. closing a triangle) from failing the close condition and
    //    silently appending an unintended duplicate vertex on top of `firstV`.
    // 2. Both `snappedPt` and raw `pt` are tested within `closeRadius` to ensure snapping to an adjacent
    //    grid line or guide never prevents the user from committing the path closure.
    if (this.currentPolylineVertices.length >= 2) {
      const firstV = this.currentPolylineVertices[0];
      const distSnapped = Math.hypot(snappedPt.x - firstV.x, snappedPt.y - firstV.y);
      const distRaw = Math.hypot(pt.x - firstV.x, pt.y - firstV.y);
      if (distSnapped <= closeRadius || distRaw <= closeRadius) {
        this.finishPolylinePath(true);
        return true;
      }
    }

    // If clicking on the last vertex, finalize the open path
    if (this.currentPolylineVertices.length >= 2) {
      const lastV = this.currentPolylineVertices[this.currentPolylineVertices.length - 1];
      const distSnapped = Math.hypot(snappedPt.x - lastV.x, snappedPt.y - lastV.y);
      const distRaw = Math.hypot(pt.x - lastV.x, pt.y - lastV.y);
      if (distSnapped <= 6 / z || distRaw <= 6 / z) {
        this.finishPolylinePath(false);
        return true;
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

    this.currentPolylineVertices.push(newV);
    this.polylineHoverPoint = snappedPt;
    this.ctx.renderOverlay();
    return true;
  }

  public onPointerMove(_e: PointerEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'polyline') return false;

    const otherVertices = this.ctx.getOtherVertices();
    this.currentPolylineVertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);
    this.polylineHoverPoint = snappedPt;
    this.ctx.renderOverlay();
    return true;
  }

  public onPointerUp(_e: PointerEvent, _pt: Point): boolean {
    return false;
  }

  public onDoubleClick(_e: MouseEvent, _pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool === 'polyline' && this.currentPolylineVertices.length >= 2) {
      this.finishPolylinePath(false);
      return true;
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
      this.ctx.pushUndo();
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

      this.ctx.model.elements.push(newEl);
      this.ctx.selectionTool.select(id);
      this.currentPolylineVertices = [];
      this.polylineHoverPoint = null;
      this.ctx.setTool('select');
      this.ctx.render();
      this.ctx.syncToHost();
    } else {
      this.currentPolylineVertices = [];
      this.polylineHoverPoint = null;
      this.ctx.render();
    }
  }

  public renderOverlay(zoom: number): string {
    const z = zoom || 1;
    let html = '';

    if (this.currentPolylineVertices.length > 0) {
      const polyD = this.ctx.model.compilePathD(this.currentPolylineVertices, false);
      html += `<path d="${polyD}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`;

      const lastV = this.currentPolylineVertices[this.currentPolylineVertices.length - 1];
      const firstV = this.currentPolylineVertices[0];

      if (this.polylineHoverPoint) {
        const isHoveringStart =
          this.currentPolylineVertices.length >= 2 &&
          Math.hypot(this.polylineHoverPoint.x - firstV.x, this.polylineHoverPoint.y - firstV.y) <= 14 / z;

        const targetPt = isHoveringStart ? { x: firstV.x, y: firstV.y } : this.polylineHoverPoint;

        // Rubberband line from last vertex to hover point
        html += `<line x1="${lastV.x}" y1="${lastV.y}" x2="${targetPt.x}" y2="${targetPt.y}" stroke="${isHoveringStart ? '#10b981' : '#60a5fa'}" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;

        if (isHoveringStart) {
          html += `<circle cx="${firstV.x}" cy="${firstV.y}" r="${8 / z}" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        } else {
          html += `
            <g opacity="0.9">
              <circle cx="${targetPt.x}" cy="${targetPt.y}" r="${4.5 / z}" fill="#38bdf8" fill-opacity="0.35" stroke="#38bdf8" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              <circle cx="${targetPt.x}" cy="${targetPt.y}" r="${1.5 / z}" fill="#ffffff" />
            </g>
          `;
        }
      }

      this.currentPolylineVertices.forEach((v, idx) => {
        const isStart = idx === 0;
        if (isStart) {
          html += `<circle cx="${v.x}" cy="${v.y}" r="${5 / z}" fill="#10b981" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
        } else {
          html += `<rect x="${v.x - 3.5 / z}" y="${v.y - 3.5 / z}" width="${7 / z}" height="${7 / z}" fill="#38bdf8" stroke="#ffffff" stroke-width="1" rx="${1 / z}" vector-effect="non-scaling-stroke" />`;
        }
      });
    } else if (this.ctx.getActiveTool() === 'polyline' && this.polylineHoverPoint) {
      // First point preview under cursor before first click
      html += `
        <g opacity="0.9">
          <circle cx="${this.polylineHoverPoint.x}" cy="${this.polylineHoverPoint.y}" r="5" fill="#10b981" fill-opacity="0.35" stroke="#10b981" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
          <circle cx="${this.polylineHoverPoint.x}" cy="${this.polylineHoverPoint.y}" r="1.5" fill="#ffffff" />
        </g>
      `;
    }

    return html;
  }
}
