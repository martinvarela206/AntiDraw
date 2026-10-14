import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';
import { NodeCatalogService } from '../../engine/selection/NodeCatalogService.js';
import { BaseHelper } from '../../engine/canvas/helpers/index.js';
import { SnappingEngine } from '../../engine/canvas/SnappingEngine.js';
import { EdgeSnappingService } from '../../engine/canvas/EdgeSnappingService.js';
import { VectorCloneHelper } from '../../engine/selection/VectorCloneHelper.js';

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
 * 3. Orthogonal Constraint & Duplicate Modifiers (ITEM-03):
 *    - `Ctrl`: Constrains translation strictly to the dominant axis (0° horizontal or 90° vertical),
 *      suppressing cross-axis snapping to prevent diagonal jumps.
 *    - `Alt`: Activates interactive duplication mode (`isDuplicateMode`), displaying a 'copy' cursor,
 *      rendering a '+' badge indicator, and creating independent cloned vector elements on release.
 *    - `Ctrl + Alt`: Combines orthogonal constraint with vector duplication.
 * 4. Atomic Undo & Host Synchronization:
 *    On pointer release, commits translated coordinates (or cloned elements) in a single undo step and
 *    synchronizes element metadata and custom pivot positions solidarily.
 */
export class TranslateInteraction {
  public initialElementsMap: Map<string, PathVertex[]> = new Map();
  public initialBox: any = null;
  public ghostDragOffset: Point | null = null;
  public dragAnchorPt: Point = { x: 0, y: 0 };
  public isAnchorPicked: boolean = false;
  public isDuplicateMode: boolean = false;
  public isOrthogonal: boolean = false;
  public isEdgeAnchor: boolean = false;

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
  ): { point: Point; isPickedNode: boolean; isEdgeAnchor: boolean } {
    const threshold = 24 / (zoom || 1);
    let bestPt: Point = { x: pt.x, y: pt.y };
    let bestDist = threshold;
    let isPickedNode = false;
    let isEdgeAnchor = false;

    // 1. High-priority evaluation of real vector nodes, centers, and handles
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

    // 2. Secondary fallback to bounding box pivot and keypoints
    if (groupBox && !isPickedNode) {
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

    /**
     * ARCHITECTURAL RATIONALE: Temporal Contour Anchor on Curve P(t) (Item 1.1 feat(snap))
     * When dragging an element by clicking on its contour/stroke farther than 24/zoom px from any vertex,
     * naive approaches either jump to an arbitrary distant vertex or drop magnetic alignment entirely.
     * By analytically projecting an ephemeral point P(t) onto the closest segment or Bézier curve,
     * this temporal anchor acts as the exact reference pivot for Smart Guides and magnetic snapping.
     */
    if (!isPickedNode) {
      const edgeThreshold = 14 / (zoom || 1);
      const edgeCand = EdgeSnappingService.snapToVectorEdges(
        pt,
        selectedEls,
        [],
        edgeThreshold
      );

      if (edgeCand) {
        bestPt = edgeCand.snappedPt;
        isPickedNode = true;
        isEdgeAnchor = true;
      }
    }

    /**
     * ARCHITECTURAL RATIONALE: Interior Body Drag Geometric Anchor Fallback (ITEM-01)
     * When dragging an element by clicking inside its fill or interior body (farther than threshold from any vertex),
     * naive approaches set `dragAnchorPt` to the arbitrary floating subpixel mouse coordinate.
     * Snapping that arbitrary subpixel to the grid results in vertices having fractional grid offsets.
     * By selecting the nearest structural vertex, corner, or center as `dragAnchorPt` even for interior clicks,
     * grid snapping aligns actual geometry (vertices and bounding lines) directly onto grid intersections.
     */
    if (!isPickedNode) {
      let nearestFeatureDist = Infinity;
      let nearestFeaturePt: Point = pt;

      for (const p of snappable) {
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < nearestFeatureDist) {
          nearestFeatureDist = d;
          nearestFeaturePt = p;
        }
      }

      if (groupBox) {
        const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
        const pivot = ctx.selectionTool.getPivot(groupBox, singleEl);
        const dPivot = Math.hypot(pt.x - pivot.x, pt.y - pivot.y);
        if (dPivot < nearestFeatureDist) {
          nearestFeatureDist = dPivot;
          nearestFeaturePt = { x: pivot.x, y: pivot.y };
        }
        const boxCorners: Point[] = [
          { x: groupBox.x, y: groupBox.y },
          { x: groupBox.x + groupBox.width, y: groupBox.y },
          { x: groupBox.x, y: groupBox.y + groupBox.height },
          { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
          { x: groupBox.x + groupBox.width / 2, y: groupBox.y + groupBox.height / 2 },
        ];
        for (const bp of boxCorners) {
          const d = Math.hypot(pt.x - bp.x, pt.y - bp.y);
          if (d < nearestFeatureDist) {
            nearestFeatureDist = d;
            nearestFeaturePt = bp;
          }
        }
      }

      if (nearestFeatureDist < Infinity) {
        bestPt = nearestFeaturePt;
      }
    }

    return { point: bestPt, isPickedNode, isEdgeAnchor };
  }

  public isNearSelectionAnchor(
    ctx: ToolContext,
    selectedEls: VectorElement[],
    pt: Point,
    groupBox: any,
    zoom: number
  ): boolean {
    const threshold = 24 / (zoom || 1);

    // 1. High-priority evaluation of real vector nodes, centers, and handles
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

    // 2. Secondary fallback to bounding box pivot and keypoints
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

    // 3. Contour / Edge Anchor on Curve P(t)
    const edgeThreshold = 14 / (zoom || 1);
    const edgeCand = EdgeSnappingService.snapToVectorEdges(pt, selectedEls, [], edgeThreshold);
    if (edgeCand) {
      return true;
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
    this.isEdgeAnchor = !!anchorInfo.isEdgeAnchor;
    this.initialElementsMap.clear();
    this.isDuplicateMode = false;
    this.isOrthogonal = false;
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
    dragStartPt: Point,
    e?: PointerEvent,
    callbacks?: SelectToolCallbacks
  ): boolean {
    if (this.initialElementsMap.size === 0) return false;

    const dx = pt.x - dragStartPt.x;
    const dy = pt.y - dragStartPt.y;

    this.isOrthogonal = !!(e && e.ctrlKey);
    this.isDuplicateMode = !!(e && e.altKey);

    if (callbacks?.setCursor) {
      callbacks.setCursor(this.isDuplicateMode ? 'copy' : 'move');
    }

    // Collect other unselected nodes (structural, handles, positional)
    const otherVertices = ctx.getOtherVertices(Array.from(ctx.selectionTool.selectedElementIds));

    // Detect stroke-width of single selected element for half-pixel awareness
    let strokeW: number | undefined;
    if (ctx.selectionTool.selectedElementIds.size === 1) {
      const elId = Array.from(ctx.selectionTool.selectedElementIds)[0];
      const el = ctx.model.elements.find((item) => item.id === elId);
      if (el) {
        const sw = parseFloat(el.attributes['stroke-width'] || el.attributes.strokeWidth || '0');
        if (!isNaN(sw) && sw > 0) strokeW = sw;
      }
    }

    /**
     * ARCHITECTURAL RATIONALE: Strict Orthogonal Constraint on Translation (Ctrl / Ctrl+Alt)
     * When Ctrl is active, movement is projected strictly onto the dominant Cartesian axis (0° or 90°):
     * - If |dx| >= |dy|, vertical delta is locked to 0. Snapping is performed with target Y fixed to anchor Y,
     *   and the resulting vertical delta is clamped to 0 to prevent cross-axis jump.
     * - If |dy| > |dx|, horizontal delta is locked to 0 with equivalent X clamping.
     */
    if (this.isOrthogonal) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        const rawTarget: Point = { x: this.dragAnchorPt.x + dx, y: this.dragAnchorPt.y };
        const snappedTarget = ctx.snapPoint(rawTarget, otherVertices, undefined, strokeW);
        this.ghostDragOffset = { x: snappedTarget.x - this.dragAnchorPt.x, y: 0 };
      } else {
        const rawTarget: Point = { x: this.dragAnchorPt.x, y: this.dragAnchorPt.y + dy };
        const snappedTarget = ctx.snapPoint(rawTarget, otherVertices, undefined, strokeW);
        this.ghostDragOffset = { x: 0, y: snappedTarget.y - this.dragAnchorPt.y };
      }
    } else {
      const rawTarget: Point = { x: this.dragAnchorPt.x + dx, y: this.dragAnchorPt.y + dy };
      const snappedTarget = ctx.snapPoint(rawTarget, otherVertices, undefined, strokeW);
      this.ghostDragOffset = {
        x: snappedTarget.x - this.dragAnchorPt.x,
        y: snappedTarget.y - this.dragAnchorPt.y,
      };
    }

    ctx.renderOverlay();
    return true;
  }

  public onPointerUp(
    ctx: ToolContext,
    callbacks: SelectToolCallbacks,
    e?: PointerEvent
  ): boolean {
    if (!this.ghostDragOffset) {
      this.initialElementsMap.clear();
      this.initialBox = null;
      this.isDuplicateMode = false;
      this.isOrthogonal = false;
      return false;
    }

    // Retain duplication mode if Alt is held at pointer release
    if (e && e.altKey) {
      this.isDuplicateMode = true;
    }

    let hasChanges = false;
    if (this.ghostDragOffset.x !== 0 || this.ghostDragOffset.y !== 0) {
      ctx.pushUndo();
      const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));

      if (this.isDuplicateMode) {
        /**
         * ARCHITECTURAL RATIONALE: Interactive Drag Duplication (Alt + Drag / Ctrl + Alt + Drag)
         *
         * 1. Non-destructive In-Place Preservation:
         *    Original source elements remain untouched at their initial geometry, matching professional
         *    standards (CorelDraw, Illustrator, Figma).
         *
         * 2. Comprehensive ID & SVG Reference Regeneration:
         *    Cloned elements receive unique element and vertex IDs (`el_${timestamp}_${rand}`, `v_${timestamp}_${rand}`).
         *    Internal SVG filter and gradient references are dynamically remapped to prevent cross-element
         *    rendering anomalies.
         *
         * 3. Selection Hand-off & Fluent Workflow:
         *    The selection switches to the newly generated clone(s), allowing subsequent drag or property adjustments
         *    immediately without deselecting.
         */
        const clonedElements: VectorElement[] = [];
        const newIds: string[] = [];

        selectedEls.forEach((srcEl) => {
          const clone = VectorCloneHelper.cloneWithOffset(srcEl, this.ghostDragOffset!, ctx.model);
          clonedElements.push(clone);
          newIds.push(clone.id);
        });

        clonedElements.forEach((c) => ctx.model.elements.push(c));

        ctx.selectionTool.deselectAll();
        newIds.forEach((id) => ctx.selectionTool.selectedElementIds.add(id));

        // Compensate gradients for cloned elements
        clonedElements.forEach((el) => {
          if (el.attributes['data-gradient']) {
            const box = ctx.selectionTool.getBoundingBox(el);
            if (box) {
              ctx.selectionTool.compensateGradientOnTranslate(el, this.ghostDragOffset!.x, this.ghostDragOffset!.y, box);
            }
          }
        });
      } else {
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
      }

      hasChanges = true;
    }

    this.ghostDragOffset = null;
    this.initialElementsMap.clear();
    this.initialBox = null;
    this.isDuplicateMode = false;
    this.isOrthogonal = false;

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
      this.isDuplicateMode = false;
      this.isOrthogonal = false;
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
    const strokeColor = this.isEdgeAnchor
      ? (isSnapped ? '#00f0ff' : '#06b6d4')
      : (isSnapped ? '#00f0ff' : '#38bdf8');
    const centerColor = this.isEdgeAnchor
      ? (isSnapped ? '#00f0ff' : '#0891b2')
      : (isSnapped ? '#00f0ff' : '#0284c7');

    // Duplicate badge indicator when dragging with Alt
    let badgeHtml = '';
    if (this.isDuplicateMode) {
      badgeHtml = `
        <g transform="translate(10, -10)">
          <circle cx="0" cy="0" r="6" fill="#22c55e" stroke="#ffffff" stroke-width="1.5" />
          <path d="M-3 0 L3 0 M0 -3 L0 3" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" />
        </g>
      `;
    }

    html += `
      <g transform="translate(${curAnchorX}, ${curAnchorY}) scale(${inv})" pointer-events="none">
        <circle cx="0" cy="0" r="${haloRingR}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="3 2" />
        ${isSnapped ? `<circle cx="0" cy="0" r="13" fill="none" stroke="#00f0ff" stroke-width="1" opacity="0.4" />` : ''}
        ${this.isEdgeAnchor ? `<rect x="-3" y="-3" width="6" height="6" transform="rotate(45)" fill="${centerColor}" stroke="#ffffff" stroke-width="0.75" />` : `<circle cx="0" cy="0" r="2.5" fill="${centerColor}" />`}
        ${badgeHtml}
      </g>
    `;

    return html;
  }
}
