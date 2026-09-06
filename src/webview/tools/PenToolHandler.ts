import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from '../ui/Toolbar.js';
import { Point, PathVertex, NodeType, VectorElement } from '../engine/VectorModel.js';

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

  public penNodeType: NodeType = 'asymmetric';
  public currentPenVertices: PathVertex[] = [];
  public penHoverPoint: Point | null = null;
  public penActiveVertexIdx: number | null = null;
  public penMovingVertexIdx: number | null = null;
  public isDragging: boolean = false;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  public get vertexCount(): number {
    return this.currentPenVertices.length;
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'pen') return false;
    if (e.button !== 0) return false;

    const snappedPt = this.ctx.snapPoint(pt);

    // Check if clicking start node to close path
    let hitVertexIdx = -1;
    for (let i = 0; i < this.currentPenVertices.length; i++) {
      const v = this.currentPenVertices[i];
      if (Math.hypot(snappedPt.x - v.x, snappedPt.y - v.y) <= 12) {
        hitVertexIdx = i;
        break;
      }
    }

    if (hitVertexIdx === 0 && this.currentPenVertices.length >= 2) {
      this.finishPenPath(true);
      return true;
    }

    const isStart = this.currentPenVertices.length === 0;
    const initialNodeType = this.penNodeType || 'asymmetric';
    const newV: PathVertex = {
      id: `v_pen_${Date.now().toString(36)}_${this.currentPenVertices.length}`,
      x: snappedPt.x,
      y: snappedPt.y,
      nodeType: initialNodeType,
      command: isStart ? 'M' : 'L',
    };

    this.currentPenVertices.push(newV);
    this.penActiveVertexIdx = this.currentPenVertices.length - 1;
    this.isDragging = true;
    this.ctx.render();
    return true;
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
      const isAlt = e.altKey;

      if (Math.hypot(dx, dy) > 3) {
        if (isAlt) {
          v.nodeType = 'asymmetric';
          v.handleOut = { x: snappedPt.x, y: snappedPt.y };
        } else {
          v.handleOut = { x: snappedPt.x, y: snappedPt.y };
          if (v.nodeType === 'smooth' || v.nodeType === 'symmetric') {
            v.handleIn = { x: v.x - dx, y: v.y - dy };
          } else if (v.nodeType === 'asymmetric') {
            if (!v.handleIn) {
              v.handleIn = { x: v.x - dx, y: v.y - dy };
            }
          }
        }
      } else {
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
      this.isDragging = false;
      this.penActiveVertexIdx = null;
      this.penMovingVertexIdx = null;
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

  public cancel(): boolean {
    if (this.isDragging || this.currentPenVertices.length > 0 || this.penHoverPoint) {
      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.isDragging = false;
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
    this.penActiveVertexIdx = null;
    this.penMovingVertexIdx = null;
  }

  public finishPenPath(close: boolean = false): void {
    if (this.currentPenVertices.length >= 2) {
      this.ctx.pushUndo();
      const id = `el_pen_${Date.now().toString(36)}`;
      const pathD = this.ctx.model.compilePathD(this.currentPenVertices, close);
      const newEl: VectorElement = {
        id,
        tagName: 'path',
        attributes: {
          id,
          d: pathD,
          fill: close ? '#4f46e5' : 'none',
          stroke: '#ffffff',
          'stroke-width': '2',
          'data-node-types': this.currentPenVertices.map((v) => v.nodeType).join(','),
        },
        vertices: JSON.parse(JSON.stringify(this.currentPenVertices)),
        isClosed: close,
      };

      this.ctx.model.elements.push(newEl);
      this.ctx.selectionTool.select(id);
      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.ctx.setTool('select');
      this.ctx.render();
      this.ctx.syncToHost();
    } else {
      this.currentPenVertices = [];
      this.penHoverPoint = null;
      this.ctx.render();
    }
  }

  public renderOverlay(zoom: number): string {
    const z = zoom || 1;
    let html = '';

    if (this.currentPenVertices.length > 0) {
      const penD = this.ctx.model.compilePathD(this.currentPenVertices, false);
      html += `<path d="${penD}" fill="none" stroke="#38bdf8" stroke-width="2" vector-effect="non-scaling-stroke" />`;

      const lastV = this.currentPenVertices[this.currentPenVertices.length - 1];
      const firstV = this.currentPenVertices[0];

      if (this.penHoverPoint) {
        const isHoveringStart =
          this.currentPenVertices.length >= 3 &&
          Math.hypot(this.penHoverPoint.x - firstV.x, this.penHoverPoint.y - firstV.y) <= 12;

        const targetPt = isHoveringStart ? { x: firstV.x, y: firstV.y } : this.penHoverPoint;

        let ghostD = '';
        if (lastV.handleOut) {
          ghostD = `M ${lastV.x} ${lastV.y} C ${lastV.handleOut.x} ${lastV.handleOut.y}, ${targetPt.x} ${targetPt.y}, ${targetPt.x} ${targetPt.y}`;
        } else {
          ghostD = `M ${lastV.x} ${lastV.y} L ${targetPt.x} ${targetPt.y}`;
        }
        html += `<path d="${ghostD}" fill="none" stroke="${isHoveringStart ? '#10b981' : '#38bdf8'}" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;

        if (isHoveringStart) {
          html += `<circle cx="${firstV.x}" cy="${firstV.y}" r="${8 / z}" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        } else {
          html += `
            <g opacity="0.95">
              <circle cx="${targetPt.x}" cy="${targetPt.y}" r="${5 / z}" fill="rgba(56, 189, 248, 0.35)" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
              <circle cx="${targetPt.x}" cy="${targetPt.y}" r="${1.5 / z}" fill="#ffffff" />
            </g>
          `;
        }
      }

      this.currentPenVertices.forEach((v, idx) => {
        const isStart = idx === 0;

        if (v.handleIn) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleIn.x}" y2="${v.handleIn.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${v.handleIn.x}" cy="${v.handleIn.y}" r="${3 / z}" fill="#a855f7" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
        }
        if (v.handleOut) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleOut.x}" y2="${v.handleOut.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${v.handleOut.x}" cy="${v.handleOut.y}" r="${3 / z}" fill="#a855f7" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
        }

        if (isStart) {
          html += `<circle cx="${v.x}" cy="${v.y}" r="${5 / z}" fill="#10b981" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
        } else {
          html += `<rect x="${v.x - 3.5 / z}" y="${v.y - 3.5 / z}" width="${7 / z}" height="${7 / z}" fill="#38bdf8" stroke="#ffffff" stroke-width="1" rx="${1 / z}" vector-effect="non-scaling-stroke" />`;
        }
      });
    } else if (this.ctx.getActiveTool() === 'pen' && this.penHoverPoint) {
      // First ghost point preview under cursor before first click
      html += `
        <g opacity="0.95">
          <circle cx="${this.penHoverPoint.x}" cy="${this.penHoverPoint.y}" r="${5 / z}" fill="rgba(56, 189, 248, 0.35)" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
          <circle cx="${this.penHoverPoint.x}" cy="${this.penHoverPoint.y}" r="${1.5 / z}" fill="#ffffff" />
        </g>
      `;
    }

    return html;
  }
}
