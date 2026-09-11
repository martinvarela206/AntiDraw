import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

/**
 * TranslateInteraction
 *
 * Encapsulates solidary movement and translation of selected vector elements:
 * 1. Proximity Anchor Detection (FIX-05):
 *    Identifies the closest vertex or group pivot within proximity threshold (20 / zoom)
 *    as the definitive magnetic anchor coordinate (`dragAnchorPt`), ensuring zero-tolerance
 *    snapping against grid lines, guidelines, and other element vertices.
 * 2. Ghost Translation & Snapping:
 *    Maintains non-destructive ghost offsets (`ghostDragOffset`) during active dragging,
 *    updating DOM overlay outlines at 60fps without corrupting document state.
 * 3. Atomic Undo & Host Synchronization:
 *    On pointer release, commits translated coordinates in a single undo step and
 *    synchronizes element metadata and custom pivot positions solidarily.
 */
export class TranslateInteraction {
  public initialElementsMap: Map<string, PathVertex[]> = new Map();
  public initialBox: any = null;
  public ghostDragOffset: Point | null = null;
  public dragAnchorPt: Point = { x: 0, y: 0 };

  /**
   * ARCHITECTURAL RATIONALE: Proximity Anchor Detection (FIX-05)
   * Evaluates all vertices of the selected elements and the group bounding box pivot/center.
   * If any vertex or the center is within `20 / zoom` pixels of `pt`, the closest one is returned
   * as the definitive magnetic anchor coordinate for translation (`dragAnchorPt`).
   * This guarantees zero-tolerance magnetic snapping to grid, guidelines, and other vertices
   * without requiring pixel-perfect clicking directly on sub-pixel vertex handles.
   */
  public findClosestMoveAnchor(
    ctx: ToolContext,
    selectedEls: VectorElement[],
    pt: Point,
    groupBox: any,
    zoom: number
  ): Point {
    const threshold = 20 / (zoom || 1);
    let bestPt: Point = { x: pt.x, y: pt.y };
    let bestDist = threshold;

    if (groupBox) {
      const pivot = ctx.selectionTool.getPivot(groupBox);
      const dPivot = Math.hypot(pt.x - pivot.x, pt.y - pivot.y);
      if (dPivot < bestDist) {
        bestDist = dPivot;
        bestPt = { x: pivot.x, y: pivot.y };
      }
    }

    for (const el of selectedEls) {
      if (el.vertices) {
        for (const v of el.vertices) {
          const d = Math.hypot(pt.x - v.x, pt.y - v.y);
          if (d < bestDist) {
            bestDist = d;
            bestPt = { x: v.x, y: v.y };
          }
        }
      }
    }

    return bestPt;
  }

  public isNearSelectionAnchor(
    ctx: ToolContext,
    selectedEls: VectorElement[],
    pt: Point,
    groupBox: any,
    zoom: number
  ): boolean {
    const threshold = 20 / (zoom || 1);
    if (groupBox) {
      const pivot = ctx.selectionTool.getPivot(groupBox);
      if (Math.hypot(pt.x - pivot.x, pt.y - pivot.y) <= threshold) {
        return true;
      }
    }

    for (const el of selectedEls) {
      if (el.vertices) {
        for (const v of el.vertices) {
          if (Math.hypot(pt.x - v.x, pt.y - v.y) <= threshold) {
            return true;
          }
        }
      }
    }

    return false;
  }

  public start(
    ctx: ToolContext,
    pt: Point,
    selectedEls: VectorElement[],
    groupBox: any
  ): void {
    const z = ctx.canvasMgr.zoom || 1;
    this.dragAnchorPt = this.findClosestMoveAnchor(ctx, selectedEls, pt, groupBox, z);
    this.initialElementsMap.clear();
    selectedEls.forEach((el) => {
      if (el.vertices) {
        this.initialElementsMap.set(
          el.id,
          el.vertices.map((v) => ({ ...v, handleIn: v.handleIn ? { ...v.handleIn } : undefined, handleOut: v.handleOut ? { ...v.handleOut } : undefined }))
        );
      }
    });
    this.initialBox = groupBox ? { ...groupBox } : null;
    this.ghostDragOffset = null;
  }

  public onPointerMove(
    ctx: ToolContext,
    pt: Point,
    dragStartPt: Point
  ): boolean {
    if (this.initialElementsMap.size === 0) return false;

    const dx = pt.x - dragStartPt.x;
    const dy = pt.y - dragStartPt.y;

    // Collect other unselected vertices for snapToVertices
    const otherVertices: Point[] = [];
    ctx.model.elements.forEach((el) => {
      if (!ctx.selectionTool.isSelected(el.id) && el.vertices) {
        el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
      }
    });

    // Compute target position of the anchor and snap it
    const rawTarget: Point = { x: this.dragAnchorPt.x + dx, y: this.dragAnchorPt.y + dy };
    const snappedTarget = ctx.snapPoint(rawTarget, otherVertices);
    const effectiveDx = snappedTarget.x - this.dragAnchorPt.x;
    const effectiveDy = snappedTarget.y - this.dragAnchorPt.y;

    this.ghostDragOffset = { x: effectiveDx, y: effectiveDy };
    ctx.renderOverlay();
    return true;
  }

  public onPointerUp(
    ctx: ToolContext,
    callbacks: SelectToolCallbacks
  ): boolean {
    if (!this.ghostDragOffset) {
      this.initialElementsMap.clear();
      this.initialBox = null;
      return false;
    }

    let hasChanges = false;
    if (this.ghostDragOffset.x !== 0 || this.ghostDragOffset.y !== 0) {
      ctx.pushUndo();
      const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
      this.initialElementsMap.forEach((origVerts, id) => {
        const el = ctx.model.elements.find((e) => e.id === id);
        if (el) {
          el.vertices = origVerts.map((v) => ({
            ...v,
            x: v.x + this.ghostDragOffset!.x,
            y: v.y + this.ghostDragOffset!.y,
            handleIn: v.handleIn
              ? { x: v.handleIn.x + this.ghostDragOffset!.x, y: v.handleIn.y + this.ghostDragOffset!.y }
              : undefined,
            handleOut: v.handleOut
              ? { x: v.handleOut.x + this.ghostDragOffset!.x, y: v.handleOut.y + this.ghostDragOffset!.y }
              : undefined,
          }));
          const isClosed = ctx.model.isElementClosed(el);
          el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
          if (ctx.model.isParametricElement(el)) {
            ctx.model.syncParametricAttributes(el);
          }
        }
      });
      // Translate custom pivot solidarily with moved vectors
      ctx.selectionTool.updatePivotOnTranslate(this.ghostDragOffset.x, this.ghostDragOffset.y, selectedEls);
      hasChanges = true;
    }

    this.ghostDragOffset = null;
    this.initialElementsMap.clear();
    this.initialBox = null;

    if (hasChanges) {
      callbacks.onSelectionChanged?.();
      ctx.syncToHost();
      ctx.render();
    }

    return hasChanges;
  }

  public cancel(): boolean {
    if (this.ghostDragOffset || this.initialElementsMap.size > 0 || this.initialBox) {
      this.ghostDragOffset = null;
      this.initialElementsMap.clear();
      this.initialBox = null;
      return true;
    }
    return false;
  }

  public renderGhostOverlay(ctx: ToolContext): string {
    if (!this.ghostDragOffset) return '';
    let html = '';
    this.initialElementsMap.forEach((origVerts, id) => {
      const el = ctx.model.elements.find((e) => e.id === id);
      if (el) {
        const movedVerts = origVerts.map((v) => ({
          ...v,
          x: v.x + this.ghostDragOffset!.x,
          y: v.y + this.ghostDragOffset!.y,
          handleIn: v.handleIn
            ? { x: v.handleIn.x + this.ghostDragOffset!.x, y: v.handleIn.y + this.ghostDragOffset!.y }
            : undefined,
          handleOut: v.handleOut
            ? { x: v.handleOut.x + this.ghostDragOffset!.x, y: v.handleOut.y + this.ghostDragOffset!.y }
            : undefined,
        }));
        const isClosed = ctx.model.isElementClosed(el);
        const d = ctx.model.compilePathD(movedVerts, isClosed);
        html += `<path d="${d}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.8" vector-effect="non-scaling-stroke" />`;
      }
    });
    return html;
  }
}
