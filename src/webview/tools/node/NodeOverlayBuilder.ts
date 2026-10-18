import { ToolContext } from '../IToolHandler.js';
import { NodeEditorTool } from '../../engine/NodeEditorTool.js';
import { VectorElement, PathVertex } from '../../engine/VectorModel.js';
import { NodeMarqueeSelector } from './NodeMarqueeSelector.js';
import { GizmoRenderer, GizmoTheme } from '../../engine/canvas/helpers/GizmoRenderer.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Node Overlay Builder (SOLID / SRP)
 * Segregates SVG markup generation for Bézier tangent handles, active ghost nodes,
 * path segment highlights, and endpoint fusion indicators away from NodeToolHandler.
 * Standardized via GizmoRenderer for complete visual parity across all tools.
 */
export class NodeOverlayBuilder {
  private ctx: ToolContext;
  private nodeEditorTool: NodeEditorTool;

  constructor(ctx: ToolContext, nodeEditorTool: NodeEditorTool) {
    this.ctx = ctx;
    this.nodeEditorTool = nodeEditorTool;
  }

  /**
   * ARCHITECTURAL RATIONALE: Bézier Handle Isolation & Leakage Prevention
   *
   * 1. Segment-Targeted Isolation:
   *    When a specific segment is selected (selectedSegmentIdx !== null), only the handles
   *    belonging directly to that segment (v1.handleOut leaving v1 towards v2, and v2.handleIn
   *    entering v2 from v1) are rendered. Tangents belonging to adjacent unselected segments
   *    (v1.handleIn or v2.handleOut) and outside neighbor vertices are strictly excluded.
   * 2. Vertex-Targeted Scoping:
   *    When individual vertices are selected (selectedSegmentIdx === null), only handles
   *    belonging to the explicitly selected vertices are rendered. Unselected neighbor vertices
   *    never sprout ghost handles.
   */
  public renderIdleBezierHandles(el: VectorElement, z: number): string {
    if (!el.vertices || this.ctx.model.isParametricElement(el)) return '';
    const verts = el.vertices;
    const isClosed = this.ctx.model.isElementClosed(el);

    // Case 1: Active Segment Selected - Strictly isolate handles to this segment
    if (this.nodeEditorTool.selectedSegmentIdx !== null) {
      const segIdx = this.nodeEditorTool.selectedSegmentIdx;
      if (segIdx < 0 || segIdx >= verts.length) return '';
      if (!isClosed && segIdx === verts.length - 1) return '';
      const nextIdx = (segIdx + 1) % verts.length;
      const v1 = verts[segIdx];
      const v2 = verts[nextIdx];

      let html = '';
      if (v1.handleOut) {
        html += GizmoRenderer.renderHandleHtml(v1.x, v1.y, v1.handleOut.x, v1.handleOut.y, z);
      }
      if (v2.handleIn) {
        html += GizmoRenderer.renderHandleHtml(v2.x, v2.y, v2.handleIn.x, v2.handleIn.y, z);
      }
      return html;
    }

    // Case 2: Selected Vertices - Only render handles of explicitly selected vertices
    const selectedIds = new Set(this.nodeEditorTool.selectedVertexIds || []);
    if (this.nodeEditorTool.selectedVertexId) {
      selectedIds.add(this.nodeEditorTool.selectedVertexId);
    }
    if (selectedIds.size === 0) return '';

    let html = '';
    verts.forEach((v) => {
      if (selectedIds.has(v.id)) {
        if (v.handleIn) {
          html += GizmoRenderer.renderHandleHtml(v.x, v.y, v.handleIn.x, v.handleIn.y, z);
        }
        if (v.handleOut) {
          html += GizmoRenderer.renderHandleHtml(v.x, v.y, v.handleOut.x, v.handleOut.y, z);
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
    return `<path d="${segD}" fill="none" stroke="${GizmoTheme.rubberband.strokeStandard}" stroke-width="${3 / z}" stroke-dasharray="${GizmoTheme.rubberband.dash}" vector-effect="non-scaling-stroke" />`;
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
    const ghostFill = isClosed ? GizmoTheme.ghost.fillClosed : GizmoTheme.ghost.fillOpen;
    let html = `<path d="${d}" fill="${ghostFill}" stroke="${GizmoTheme.ghost.stroke}" stroke-width="${GizmoTheme.ghost.strokeWidth}" stroke-dasharray="${GizmoTheme.ghost.dash}" vector-effect="non-scaling-stroke" />`;

    // Endpoint Fusion Halo when hovering near opposite endpoint on open path
    if (!isClosed && ghostVertices.length >= 2) {
      const firstV = ghostVertices[0];
      const lastV = ghostVertices[ghostVertices.length - 1];
      const dist = Math.hypot(lastV.x - firstV.x, lastV.y - firstV.y);
      if (dist <= this.nodeEditorTool.fusionThreshold) {
        html += `<circle cx="${firstV.x}" cy="${firstV.y}" r="${GizmoTheme.rubberband.closureHaloRadius / z}" fill="none" stroke="${GizmoTheme.rubberband.strokeClosing}" stroke-width="${GizmoTheme.rubberband.closureHaloWidth}" stroke-dasharray="${GizmoTheme.rubberband.closureHaloDash}" vector-effect="non-scaling-stroke" />`;
        html += GizmoRenderer.renderAnchorHtml({ x: firstV.x, y: firstV.y }, { kind: 'first' }, z);
      }
    }

    const selSeg = this.nodeEditorTool.selectedSegmentIdx;
    const segV1Id = selSeg !== null && selSeg >= 0 && selSeg < ghostVertices.length ? ghostVertices[selSeg].id : null;
    const nextSegIdx = selSeg !== null ? (isClosed ? (selSeg + 1) % ghostVertices.length : selSeg + 1) : -1;
    const segV2Id = nextSegIdx >= 0 && nextSegIdx < ghostVertices.length ? ghostVertices[nextSegIdx].id : null;

    ghostVertices.forEach((gv, idx) => {
      const isSelected =
        gv.id === this.nodeEditorTool.selectedVertexId ||
        marqueeSelector.isVertexSelected(gv.id) ||
        gv.id === segV1Id ||
        gv.id === segV2Id;

      html += GizmoRenderer.renderAnchorHtml(
        { x: gv.x, y: gv.y },
        { kind: 'standard', state: isSelected ? 'selected' : 'idle' },
        z
      );

      if (selSeg !== null) {
        if (idx === selSeg && gv.handleOut) {
          html += GizmoRenderer.renderHandleHtml(
            gv.x,
            gv.y,
            gv.handleOut.x,
            gv.handleOut.y,
            z,
            GizmoTheme.handle.colorGhost
          );
        } else if (idx === nextSegIdx && gv.handleIn) {
          html += GizmoRenderer.renderHandleHtml(
            gv.x,
            gv.y,
            gv.handleIn.x,
            gv.handleIn.y,
            z,
            GizmoTheme.handle.colorGhost
          );
        }
      } else if (isSelected) {
        if (gv.handleIn) {
          html += GizmoRenderer.renderHandleHtml(
            gv.x,
            gv.y,
            gv.handleIn.x,
            gv.handleIn.y,
            z,
            GizmoTheme.handle.colorGhost
          );
        }
        if (gv.handleOut) {
          html += GizmoRenderer.renderHandleHtml(
            gv.x,
            gv.y,
            gv.handleOut.x,
            gv.handleOut.y,
            z,
            GizmoTheme.handle.colorGhost
          );
        }
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
        html += GizmoRenderer.renderAnchorHtml(
          { x: v.x, y: v.y },
          { kind: 'standard', state: 'selected' },
          z
        );
      }
    });
    return html;
  }
}
