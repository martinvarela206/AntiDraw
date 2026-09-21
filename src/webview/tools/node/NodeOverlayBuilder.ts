import { ToolContext } from '../IToolHandler.js';
import { NodeEditorTool } from '../../engine/NodeEditorTool.js';
import { VectorElement, PathVertex } from '../../engine/VectorModel.js';
import { NodeMarqueeSelector } from './NodeMarqueeSelector.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Node Overlay Builder (SOLID / SRP)
 * Segregates SVG markup generation for Bézier tangent handles, active ghost nodes,
 * path segment highlights, and endpoint fusion indicators away from NodeToolHandler.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle (SRP):
 *    Generating vector overlay markup (tangent lines, control circles, ghost paths,
 *    fusion halos) is purely an SVG visual composition concern, decoupled from pointer
 *    event tracking and model synchronization.
 * 2. Visual Polish & Zoom Invariance:
 *    All control points, handles, and stroke widths scale with (1 / z) to ensure crisp
 *    rendering across extreme zoom levels (5% to 3200%).
 * 3. Separation of Concerns:
 *    Allows independent enhancement of node styling, hover feedback, and visual themes
 *    without risking regressions in spline math or state handling.
 */
export class NodeOverlayBuilder {
  private ctx: ToolContext;
  private nodeEditorTool: NodeEditorTool;

  constructor(ctx: ToolContext, nodeEditorTool: NodeEditorTool) {
    this.ctx = ctx;
    this.nodeEditorTool = nodeEditorTool;
  }

  /**
   * Renders idle Bézier handles and tangent lines for the selected vertex and its immediate neighbors.
   */
  public renderIdleBezierHandles(el: VectorElement, z: number): string {
    if (!el.vertices || this.ctx.model.isParametricElement(el)) return '';
    const verts = el.vertices;
    const selectedIdx = verts.findIndex((v) => v.id === this.nodeEditorTool.selectedVertexId);
    if (selectedIdx < 0) return '';

    const isClosed = this.ctx.model.isElementClosed(el);
    const showHandlesFor = new Set<number>();
    showHandlesFor.add(selectedIdx);
    const prevIdx = selectedIdx > 0 ? selectedIdx - 1 : isClosed ? verts.length - 1 : -1;
    if (prevIdx >= 0) showHandlesFor.add(prevIdx);
    const nextIdx = selectedIdx < verts.length - 1 ? selectedIdx + 1 : isClosed ? 0 : -1;
    if (nextIdx >= 0) showHandlesFor.add(nextIdx);

    const bHandleR = 3.5 / z;
    let html = '';
    verts.forEach((v, idx) => {
      if (showHandlesFor.has(idx)) {
        if (v.handleIn) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleIn.x}" y2="${v.handleIn.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${v.handleIn.x}" cy="${v.handleIn.y}" r="${bHandleR}" fill="#a855f7" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
        }
        if (v.handleOut) {
          html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleOut.x}" y2="${v.handleOut.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${v.handleOut.x}" cy="${v.handleOut.y}" r="${bHandleR}" fill="#a855f7" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
        }
      }
    });
    return html;
  }

  /**
   * Renders highlighted dashed path segment when a segment is selected.
   */
  public renderSelectedSegment(el: VectorElement, z: number): string {
    if (!el.vertices || this.nodeEditorTool.selectedSegmentIdx === null) return '';
    const verts = el.vertices;
    const segIdx = this.nodeEditorTool.selectedSegmentIdx;
    if (segIdx < 0 || segIdx >= verts.length) return '';

    const nextIdx = (segIdx + 1) % verts.length;
    const v1 = verts[segIdx];
    const v2 = verts[nextIdx];
    const isCurve = !!(v1.handleOut || v2.handleIn);
    let segD = '';
    if (isCurve) {
      const h1 = v1.handleOut || { x: v1.x, y: v1.y };
      const h2 = v2.handleIn || { x: v2.x, y: v2.y };
      segD = `M ${v1.x} ${v1.y} C ${h1.x} ${h1.y} ${h2.x} ${h2.y} ${v2.x} ${v2.y}`;
    } else {
      segD = `M ${v1.x} ${v1.y} L ${v2.x} ${v2.y}`;
    }
    return `<path d="${segD}" fill="none" stroke="#38bdf8" stroke-width="${3 / z}" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />`;
  }

  /**
   * Renders ghost path, ghost nodes, handles, and auto-closure fusion indicator during drag.
   */
  public renderGhostPath(
    el: VectorElement,
    ghostVertices: PathVertex[],
    marqueeSelector: NodeMarqueeSelector,
    z: number
  ): string {
    const isClosed = this.ctx.model.isElementClosed(el);
    const d = this.ctx.model.compilePathD(ghostVertices, isClosed);
    /**
     * ARCHITECTURAL RATIONALE: Open Path Topological Cleanliness
     * Setting `fill="none"` when `!isClosed` prevents spurious triangular or polygonal chord fills
     * when editing open polylines, lines, or unclosed Bézier splines.
     */
    const ghostFill = isClosed ? 'rgba(56, 189, 248, 0.15)' : 'none';
    let html = `<path d="${d}" fill="${ghostFill}" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;

    // Endpoint Fusion Halo when hovering near opposite endpoint on open path
    if (!isClosed && ghostVertices.length >= 2) {
      const firstV = ghostVertices[0];
      const lastV = ghostVertices[ghostVertices.length - 1];
      const dist = Math.hypot(lastV.x - firstV.x, lastV.y - firstV.y);
      if (dist <= this.nodeEditorTool.fusionThreshold) {
        html += `<circle cx="${firstV.x}" cy="${firstV.y}" r="${10 / z}" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />`;
        html += `<circle cx="${firstV.x}" cy="${firstV.y}" r="${4 / z}" fill="#10b981" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
      }
    }

    const selSeg = this.nodeEditorTool.selectedSegmentIdx;
    const segV1Id = selSeg !== null && selSeg >= 0 && selSeg < ghostVertices.length ? ghostVertices[selSeg].id : null;
    const nextSegIdx = selSeg !== null ? (isClosed ? (selSeg + 1) % ghostVertices.length : selSeg + 1) : -1;
    const segV2Id = nextSegIdx >= 0 && nextSegIdx < ghostVertices.length ? ghostVertices[nextSegIdx].id : null;

    ghostVertices.forEach((gv) => {
      const isSelected =
        gv.id === this.nodeEditorTool.selectedVertexId ||
        marqueeSelector.isVertexSelected(gv.id) ||
        gv.id === segV1Id ||
        gv.id === segV2Id;
      if (isSelected) {
        html += `<circle cx="${gv.x}" cy="${gv.y}" r="${6 / z}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        html += `<circle cx="${gv.x}" cy="${gv.y}" r="${4 / z}" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
        if (gv.handleIn) {
          html += `<line x1="${gv.x}" y1="${gv.y}" x2="${gv.handleIn.x}" y2="${gv.handleIn.y}" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${gv.handleIn.x}" cy="${gv.handleIn.y}" r="${4 / z}" fill="#c084fc" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
        }
        if (gv.handleOut) {
          html += `<line x1="${gv.x}" y1="${gv.y}" x2="${gv.handleOut.x}" y2="${gv.handleOut.y}" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${gv.handleOut.x}" cy="${gv.handleOut.y}" r="${4 / z}" fill="#c084fc" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
        }
      } else {
        html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
      }
    });

    return html;
  }

  /**
   * Renders highlight circles for marquee-selected nodes in idle mode.
   */
  public renderMultiSelectedVertices(el: VectorElement, marqueeSelector: NodeMarqueeSelector, z: number): string {
    if (!el.vertices) return '';
    let html = '';
    el.vertices.forEach((v) => {
      if (marqueeSelector.isVertexSelected(v.id) && v.id !== this.nodeEditorTool.selectedVertexId) {
        html += `<circle cx="${v.x}" cy="${v.y}" r="${5.5 / z}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        html += `<circle cx="${v.x}" cy="${v.y}" r="${3.5 / z}" fill="#38bdf8" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
      }
    });
    return html;
  }
}
