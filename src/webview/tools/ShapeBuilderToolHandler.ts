import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, VectorElement } from '../engine/VectorModel.js';
import { SegmentTrimEngine, TrimSubSegment } from '../engine/boolean/SegmentTrimEngine.js';

export interface ShapeBuilderHandlerCallbacks {
  setCursor?: (cursor: string) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Shape Builder & Segment Trim Handler (ShapeBuilderToolHandler)
 *
 * Provides high-precision sub-stroke trimming with topological node welding:
 * 1. Real-Time Hover Highlighting:
 *    As the pointer glides across the vector document, the analytical sub-stroke under the cursor
 *    is dynamically highlighted with a high-contrast crimson overlay.
 * 2. Instant Click or Continuous Drag Sweep:
 *    - Click: Trims a single atomic sub-stroke immediately.
 *    - Drag Sweep: Sweeps across multiple consecutive sub-strokes, collecting them in real time
 *      and deleting them in a single batch on pointerup.
 * 3. Topological Node Welding:
 *    Evaluates the valence k of terminal nodes:
 *    - k == 2: Welds the 2 meeting sub-strokes into a unified vector, merging separate paths and
 *      closing cycles (such as a 4-line hashtag transformed into a closed square polygon).
 *    - k >= 3: Preserves independent branches without automatic combination.
 */
export class ShapeBuilderToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['shapeBuilder'];
  private ctx: ToolContext;
  private callbacks?: ShapeBuilderHandlerCallbacks;

  public cachedSubSegments: TrimSubSegment[] = [];
  public candidateElements: VectorElement[] = [];
  public hoveredSubSeg: TrimSubSegment | null = null;
  public sweptSubSegIds: Set<string> = new Set();
  public isDragging: boolean = false;
  public dragStartPoint: Point | null = null;
  public hasExceededDragThreshold: boolean = false;
  public initialHitSubSeg: TrimSubSegment | null = null;

  constructor(ctx: ToolContext, callbacks?: ShapeBuilderHandlerCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
  }

  public activate(): void {
    this.invalidate();
    this.callbacks?.setCursor?.('crosshair');
    this.refreshSubSegments();
  }

  public deactivate(): void {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.hasExceededDragThreshold = false;
    this.initialHitSubSeg = null;
    this.hoveredSubSeg = null;
    this.sweptSubSegIds.clear();
    this.cachedSubSegments = [];
    this.candidateElements = [];
    this.callbacks?.setCursor?.('');
  }

  public invalidate(): void {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.hasExceededDragThreshold = false;
    this.initialHitSubSeg = null;
    this.hoveredSubSeg = null;
    this.sweptSubSegIds.clear();
    this.cachedSubSegments = [];
    this.candidateElements = [];
  }

  public cancel(): boolean {
    if (this.isDragging || this.sweptSubSegIds.size > 0 || this.hoveredSubSeg) {
      this.isDragging = false;
      this.dragStartPoint = null;
      this.hasExceededDragThreshold = false;
      this.initialHitSubSeg = null;
      this.sweptSubSegIds.clear();
      this.hoveredSubSeg = null;
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public refreshSubSegments(): void {
    const selectedIds = this.ctx.selectionTool.selectedElementIds;
    if (selectedIds && selectedIds.size >= 2) {
      this.candidateElements = this.ctx.model.elements.filter(
        (el) => selectedIds.has(el.id) && SegmentTrimEngine.isTrimable(el)
      );
    } else {
      this.candidateElements = this.ctx.model.elements.filter(
        (el) => SegmentTrimEngine.isTrimable(el)
      );
    }

    this.cachedSubSegments = SegmentTrimEngine.extractSubSegments(this.candidateElements, this.ctx.model);
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    if (e.button !== 0) return false;

    this.refreshSubSegments();
    const z = this.ctx.canvasMgr.zoom || 1;
    const hit = SegmentTrimEngine.findSubSegmentAtPoint(pt, this.cachedSubSegments, 12 / z);

    if (hit) {
      this.isDragging = true;
      this.dragStartPoint = { ...pt };
      this.hasExceededDragThreshold = false;
      this.initialHitSubSeg = hit;
      this.sweptSubSegIds.clear();
      this.sweptSubSegIds.add(hit.id);
      this.hoveredSubSeg = hit;
      this.ctx.renderOverlay();
      return true;
    }

    return false;
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    if (this.cachedSubSegments.length === 0) {
      this.refreshSubSegments();
    }

    const z = this.ctx.canvasMgr.zoom || 1;
    const hit = SegmentTrimEngine.findSubSegmentAtPoint(pt, this.cachedSubSegments, 12 / z);

    let needsOverlayUpdate = false;

    if (this.isDragging && this.dragStartPoint) {
      const screenDist = Math.hypot(pt.x - this.dragStartPoint.x, pt.y - this.dragStartPoint.y) * z;
      if (screenDist > 5) {
        this.hasExceededDragThreshold = true;
      }
      if (this.hasExceededDragThreshold && hit && !this.sweptSubSegIds.has(hit.id)) {
        this.sweptSubSegIds.add(hit.id);
        needsOverlayUpdate = true;
      }
    }

    if (hit?.id !== this.hoveredSubSeg?.id) {
      this.hoveredSubSeg = hit;
      needsOverlayUpdate = true;
    }

    if (needsOverlayUpdate) {
      this.ctx.renderOverlay();
    }

    if (hit) {
      this.callbacks?.setCursor?.('crosshair');
      return true;
    }

    return false;
  }

  public onPointerUp(e: PointerEvent, _pt: Point): boolean {
    if (!this.isDragging && this.sweptSubSegIds.size === 0) {
      this.hoveredSubSeg = null;
      return false;
    }

    this.isDragging = false;
    this.dragStartPoint = null;

    // If drag threshold was not exceeded, treat as a single click on initial hit
    if (!this.hasExceededDragThreshold && this.initialHitSubSeg) {
      this.sweptSubSegIds.clear();
      this.sweptSubSegIds.add(this.initialHitSubSeg.id);
    }

    if (this.sweptSubSegIds.size === 0) {
      this.hoveredSubSeg = null;
      this.ctx.renderOverlay();
      return true;
    }

    const affectedElementIds = SegmentTrimEngine.findConnectedElementIds(
      this.cachedSubSegments,
      this.sweptSubSegIds
    );

    if (affectedElementIds.size === 0) {
      this.sweptSubSegIds.clear();
      this.hoveredSubSeg = null;
      this.refreshSubSegments();
      this.ctx.renderOverlay();
      return true;
    }

    const affectedElements = this.candidateElements.filter((el) => affectedElementIds.has(el.id));
    const affectedSubSegs = this.cachedSubSegments.filter((s) => affectedElementIds.has(s.sourceElementId));

    const weldedElements = SegmentTrimEngine.trimAndWeld(
      affectedSubSegs,
      this.sweptSubSegIds,
      affectedElements
    );

    // Commit snapshot to undo stack only upon confirmed transformation
    this.ctx.pushUndo();

    // In-place replacement of affected elements preserving document z-order and non-affected elements
    const newElements: VectorElement[] = [];
    let replaced = false;
    for (const el of this.ctx.model.elements) {
      if (affectedElementIds.has(el.id)) {
        if (!replaced) {
          newElements.push(...weldedElements);
          replaced = true;
        }
      } else {
        newElements.push(el);
      }
    }
    this.ctx.model.elements = newElements;

    // Select the new elements
    this.ctx.selectionTool.deselectAll();
    for (const el of weldedElements) {
      this.ctx.selectionTool.toggleSelect(el.id);
    }

    // Reset interaction state and refresh cache
    this.sweptSubSegIds.clear();
    this.hoveredSubSeg = null;
    this.initialHitSubSeg = null;
    this.hasExceededDragThreshold = false;
    this.refreshSubSegments();

    this.ctx.render();
    this.ctx.renderOverlay();
    this.ctx.syncToHost();
    return true;
  }

  public renderOverlay(zoom: number = 1): string {
    const segmentsToHighlight: TrimSubSegment[] = [];

    if (this.hoveredSubSeg && !this.sweptSubSegIds.has(this.hoveredSubSeg.id)) {
      segmentsToHighlight.push(this.hoveredSubSeg);
    }

    for (const id of this.sweptSubSegIds) {
      const seg = this.cachedSubSegments.find((s) => s.id === id);
      if (seg) segmentsToHighlight.push(seg);
    }

    if (segmentsToHighlight.length === 0) return '';

    const strokeW = Math.max(2.5, 3.5 / zoom);
    let html = `<g id="shape-builder-overlay" pointer-events="none">`;

    for (const seg of segmentsToHighlight) {
      const isSwept = this.sweptSubSegIds.has(seg.id);
      const color = isSwept ? '#ef4444' : '#f43f5e';
      const opacity = isSwept ? '0.95' : '0.85';

      let d = '';
      if (seg.isBezier && seg.h1 && seg.h2) {
        d = `M ${seg.p1.x} ${seg.p1.y} C ${seg.h1.x} ${seg.h1.y} ${seg.h2.x} ${seg.h2.y} ${seg.p2.x} ${seg.p2.y}`;
      } else {
        d = `M ${seg.p1.x} ${seg.p1.y} L ${seg.p2.x} ${seg.p2.y}`;
      }

      // Background contrasting stroke
      html += `<path d="${d}" fill="none" stroke="#000000" stroke-width="${strokeW + 2 / zoom}" stroke-linecap="round" opacity="0.4" />`;
      // High-visibility crimson highlight
      html += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-dasharray="6 3" stroke-linecap="round" opacity="${opacity}" />`;
    }

    html += `</g>`;
    return html;
  }
}
