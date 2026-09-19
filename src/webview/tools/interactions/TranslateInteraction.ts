import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';
import { NodeCatalogService } from '../../engine/selection/NodeCatalogService.js';
import { BaseHelper } from '../../ui/helpers/index.js';
import { SnappingEngine } from '../../engine/canvas/SnappingEngine.js';

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
  public isAnchorPicked: boolean = false;

  /**
   * ARCHITECTURAL RATIONALE: Proximity Anchor Detection (FIX-05)
   * Evaluates all vertices of the selected elements, parametric handles, positional landmarks,
   * bounding box keypoints, and the group bounding box pivot/center.
   * If any landmark is within `20 / zoom` pixels of `pt`, the closest one is returned
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
  ): { point: Point; isPickedNode: boolean } {
    const threshold = 20 / (zoom || 1);
    let bestPt: Point = { x: pt.x, y: pt.y };
    let bestDist = threshold;
    let isPickedNode = false;

    if (groupBox) {
      const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
      const pivot = ctx.selectionTool.getPivot(groupBox, singleEl);
      const dPivot = Math.hypot(pt.x - pivot.x, pt.y - pivot.y);
      if (dPivot < bestDist) {
        bestDist = dPivot;
        bestPt = { x: pivot.x, y: pivot.y };
        isPickedNode = true;
      }
      const boxPts: Point[] = [
        { x: groupBox.x, y: groupBox.y },
        { x: groupBox.x + groupBox.width, y: groupBox.y },
        { x: groupBox.x, y: groupBox.y + groupBox.height },
        { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
        { x: groupBox.x + groupBox.width / 2, y: groupBox.y },
        { x: groupBox.x + groupBox.width / 2, y: groupBox.y + groupBox.height },
        { x: groupBox.x, y: groupBox.y + groupBox.height / 2 },
        { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height / 2 },
      ];
      for (const bp of boxPts) {
        const d = Math.hypot(pt.x - bp.x, pt.y - bp.y);
        if (d < bestDist) {
          bestDist = d;
          bestPt = bp;
          isPickedNode = true;
        }
      }
    }

    const snappable = NodeCatalogService.collectSnappableNodes(selectedEls, {
      structural: true,
      handles: true,
      positional: true,
    });
    for (const p of snappable) {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        bestPt = p;
        isPickedNode = true;
      }
    }

    return { point: bestPt, isPickedNode };
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
      const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
      const pivot = ctx.selectionTool.getPivot(groupBox, singleEl);
      if (Math.hypot(pt.x - pivot.x, pt.y - pivot.y) <= threshold) {
        return true;
      }
      const boxPts: Point[] = [
        { x: groupBox.x, y: groupBox.y },
        { x: groupBox.x + groupBox.width, y: groupBox.y },
        { x: groupBox.x, y: groupBox.y + groupBox.height },
        { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
        { x: groupBox.x + groupBox.width / 2, y: groupBox.y },
        { x: groupBox.x + groupBox.width / 2, y: groupBox.y + groupBox.height },
        { x: groupBox.x, y: groupBox.y + groupBox.height / 2 },
        { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height / 2 },
      ];
      for (const bp of boxPts) {
        if (Math.hypot(pt.x - bp.x, pt.y - bp.y) <= threshold) return true;
      }
    }

    const snappable = NodeCatalogService.collectSnappableNodes(selectedEls, {
      structural: true,
      handles: true,
      positional: true,
    });
    for (const p of snappable) {
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= threshold) {
        return true;
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
    const anchorInfo = this.findClosestMoveAnchor(ctx, selectedEls, pt, groupBox, z);
    this.dragAnchorPt = anchorInfo.point;
    this.isAnchorPicked = anchorInfo.isPickedNode;
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

    // Collect other unselected nodes (structural, handles, positional)
    const otherVertices = ctx.getOtherVertices(Array.from(ctx.selectionTool.selectedElementIds));

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
          const isPieOrArc = el.attributes['data-ellipse-type'] === 'pie' || el.attributes['data-ellipse-type'] === 'arc';

          /**
           * ARCHITECTURAL RATIONALE: Faithful Arc Compilation on Translation (FIX-23)
           * When moving active vectors in selection mode, parametric arc and pie primitives must retain
           * their canonical SVG arc commands ('A') via `compileEllipseD`.
           * Overwriting `el.attributes.d` with generic Bézier cubic approximations (`compilePathD`) degrades
           * geometric precision and causes circular arcs to serialize as freeform spline curves.
           */
          const innerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
          if (ctx.model.isParametricElement(el) && (isPieOrArc || innerRatio > 0)) {
            const oldCx = parseFloat(el.attributes.cx || '0');
            const oldCy = parseFloat(el.attributes.cy || '0');
            const newCx = Math.round((oldCx + this.ghostDragOffset!.x) * 100) / 100;
            const newCy = Math.round((oldCy + this.ghostDragOffset!.y) * 100) / 100;
            el.attributes.cx = newCx.toString();
            el.attributes.cy = newCy.toString();
            const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
            const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
            const type = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
            const s = parseFloat(el.attributes['data-start-angle'] || '0');
            const e = parseFloat(el.attributes['data-end-angle'] || '360');
            el.attributes.d = ctx.model.compileEllipseD(newCx, newCy, rx, ry, type, s, e, innerRatio);
            if (innerRatio > 0) {
              el.attributes['fill-rule'] = 'evenodd';
            }
          } else {
            el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
            if (ctx.model.isParametricElement(el)) {
              ctx.model.syncParametricAttributes(el);
            }
          }
        }
      });
      // Translate custom pivot solidarily with moved vectors
      ctx.selectionTool.updatePivotOnTranslate(this.ghostDragOffset.x, this.ghostDragOffset.y, selectedEls);

      // Compensate gradients for elements with lockPosition === false
      selectedEls.forEach((el) => {
        if (el.attributes['data-gradient']) {
          const box = ctx.selectionTool.getBoundingBox(el);
          if (box) {
            ctx.selectionTool.compensateGradientOnTranslate(el, this.ghostDragOffset!.x, this.ghostDragOffset!.y, box);
          }
        }
      });

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

    // Visual halo for active drag anchor
    const z = ctx.canvasMgr.zoom || 1;
    const inv = BaseHelper.getInverseScale(z);
    const curAnchorX = this.dragAnchorPt.x + this.ghostDragOffset.x;
    const curAnchorY = this.dragAnchorPt.y + this.ghostDragOffset.y;
    const isSnapped = SnappingEngine.lastSnapResult !== null;

    const haloRingR = isSnapped ? 9 : 7;
    const strokeColor = isSnapped ? '#00f0ff' : '#38bdf8';
    const centerColor = isSnapped ? '#00f0ff' : '#0284c7';

    html += `
      <g transform="translate(${curAnchorX}, ${curAnchorY}) scale(${inv})" pointer-events="none">
        <circle cx="0" cy="0" r="${haloRingR}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="3 2" />
        ${isSnapped ? `<circle cx="0" cy="0" r="13" fill="none" stroke="#00f0ff" stroke-width="1" opacity="0.4" />` : ''}
        <circle cx="0" cy="0" r="2.5" fill="${centerColor}" />
      </g>
    `;

    return html;
  }
}
