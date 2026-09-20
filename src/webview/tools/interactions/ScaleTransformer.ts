import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import { HandleType, BoundingBox } from '../../engine/SelectionTool.js';

export interface ScaleComputeContext {
  pt: Point;
  dragStartPt: Point;
  activeHandle: string;
  initialBox: BoundingBox;
  initialBoxPadding: number;
  initialElementsMap: Map<string, PathVertex[]>;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
}

export interface ScaleComputeResult {
  ghostMap: Map<string, PathVertex[]>;
  snappedPt: Point | null;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Scale Transformation Handler (ScaleTransformer)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates bounding-box directional handle manipulation (8 handles: nw, ne, se, sw, n, s, e, w),
 *    magnetic vertex/grid/guideline snapping on scale handles, proportional aspect-ratio lock,
 *    and non-destructive parametric scaling commit.
 *
 * 2. Non-Destructive Parametric Transformation (FIX-21):
 *    Under non-rotational scale (`activeHandle !== 'rotate'`), the affine bounding box transform
 *    is mapped directly to center and radii:
 *      newCx = newBox.x + (oldCx - oldBox.x) * scaleX
 *      newCy = newBox.y + (oldCy - oldBox.y) * scaleY
 *      newRx = oldRx * |scaleX|
 *      newRy = oldRy * |scaleY|
 *    The exact SVG path is recompiled via `compileEllipseD` preserving native SVG arc commands ('A')
 *    and maintaining full parametric inspector controls.
 *
 * 3. Aspect Ratio & Anchor Symmetry:
 *    Handles proportional constraints (via model `isAspectRatioLocked` or Ctrl key)
 *    and symmetric expansion from center (via Alt key / shiftKey modifier).
 */
export class ScaleTransformer {
  /**
   * Calculates the origin coordinates of the grab handle on the unscaled bounding box.
   */
  public static calculateInitialHandlePoint(b: BoundingBox, handle: string): Point {
    let x = b.x;
    let y = b.y;

    switch (handle) {
      case 'nw':
        x = b.x;
        y = b.y;
        break;
      case 'n':
        x = b.cx;
        y = b.y;
        break;
      case 'ne':
        x = b.x + b.width;
        y = b.y;
        break;
      case 'w':
        x = b.x;
        y = b.cy;
        break;
      case 'e':
        x = b.x + b.width;
        y = b.cy;
        break;
      case 'sw':
        x = b.x;
        y = b.y + b.height;
        break;
      case 's':
        x = b.cx;
        y = b.y + b.height;
        break;
      case 'se':
        x = b.x + b.width;
        y = b.y + b.height;
        break;
    }

    return { x, y };
  }

  /**
   * Computes snapped handle displacement against unselected vertices and guide rails.
   */
  public static computeHandleDisplacement(
    ctx: ToolContext,
    pt: Point,
    dragStartPt: Point,
    activeHandle: string,
    initialBox: BoundingBox
  ): { effectiveDx: number; effectiveDy: number; snappedPt: Point | null } {
    const handlePt = this.calculateInitialHandlePoint(initialBox, activeHandle);

    const otherVertices = ctx.getOtherVertices(Array.from(ctx.selectionTool.selectedElementIds));

    const rawDx = pt.x - dragStartPt.x;
    const rawDy = pt.y - dragStartPt.y;

    const isXHandle = ['nw', 'ne', 'w', 'e', 'sw', 'se'].includes(activeHandle);
    const isYHandle = ['nw', 'n', 'ne', 'sw', 's', 'se'].includes(activeHandle);

    const rawTargetX = handlePt.x + (isXHandle ? rawDx : 0);
    const rawTargetY = handlePt.y + (isYHandle ? rawDy : 0);

    const targetHandlePt: Point = { x: rawTargetX, y: rawTargetY };
    const snappedHandlePt = ctx.snapPoint(targetHandlePt, otherVertices);

    /**
     * ARCHITECTURAL RATIONALE: Axial Scale Constraint & Snapping Decoupling
     * When dragging single-axis handles (e.g. 'n', 's' for vertical or 'e', 'w' for horizontal),
     * the unconstrained axis must remain strictly invariant. Snapping calculations on the unconstrained
     * axis are disregarded so transverse grid points, cell centers, or guide intersections do not
     * trigger false displacements or misplaced snap target indicators.
     */
    const effectiveTargetX = isXHandle ? snappedHandlePt.x : rawTargetX;
    const effectiveTargetY = isYHandle ? snappedHandlePt.y : rawTargetY;

    const effectiveDx = isXHandle ? effectiveTargetX - handlePt.x : 0;
    const effectiveDy = isYHandle ? effectiveTargetY - handlePt.y : 0;

    const didSnapX = isXHandle && Math.abs(snappedHandlePt.x - rawTargetX) > 0.001;
    const didSnapY = isYHandle && Math.abs(snappedHandlePt.y - rawTargetY) > 0.001;
    const didSnap = didSnapX || didSnapY;

    const snappedPt: Point | null = didSnap
      ? {
          x: isXHandle && didSnapX ? snappedHandlePt.x : rawTargetX,
          y: isYHandle && didSnapY ? snappedHandlePt.y : rawTargetY,
        }
      : null;

    return {
      effectiveDx,
      effectiveDy,
      snappedPt,
    };
  }

  /**
   * Generates transformed ghost vertices for all selected elements during scaling drag.
   */
  public static computeGhostScale(
    ctx: ToolContext,
    opts: ScaleComputeContext
  ): ScaleComputeResult {
    const { effectiveDx, effectiveDy, snappedPt } = this.computeHandleDisplacement(
      ctx,
      opts.pt,
      opts.dragStartPt,
      opts.activeHandle,
      opts.initialBox
    );

    /**
     * ARCHITECTURAL RATIONALE: Universal Scale Modifiers (Benchmark CorelDraw / Ai / Figma)
     * - Shift: Enforces 1:1 proportional aspect ratio lock.
     * - Alt: Scales symmetrically from center/pivot.
     * - Alt + Shift: Symmetrical concentric scaling maintaining 1:1 aspect ratio.
     * - Default (no modifiers): Free directional scaling anchored to opposing edge/corner.
     */
    const isProportional = ctx.selectionTool.isAspectRatioLocked || opts.shiftKey;
    const isFromCenter = opts.altKey;
    const ghostMap = new Map<string, PathVertex[]>();

    opts.initialElementsMap.forEach((origVerts, id) => {
      const transformed = ctx.selectionTool.transformVertices(
        origVerts,
        opts.initialBox,
        opts.activeHandle as HandleType,
        effectiveDx,
        effectiveDy,
        opts.initialBoxPadding,
        isFromCenter,
        isProportional
      );
      ghostMap.set(id, transformed);
    });

    return { ghostMap, snappedPt };
  }

  /**
   * Commits the scaled geometry to the document, updating parametric center/radii
   * or vertex paths, pivot position, and gradient compensations.
   */
  public static applyScaleCommit(
    ctx: ToolContext,
    ghostTransformMap: Map<string, PathVertex[]>,
    initialBox: BoundingBox,
    initialAttributesMap: Map<string, Record<string, string>>,
    initialElementsMap: Map<string, PathVertex[]>,
    selectedEls: VectorElement[]
  ): void {
    ghostTransformMap.forEach((transformedVerts, id) => {
      const el = ctx.model.elements.find((e) => e.id === id);
      if (!el) return;

      const isPieOrArc =
        el.attributes['data-ellipse-type'] === 'pie' || el.attributes['data-ellipse-type'] === 'arc';

      const innerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
      if ((isPieOrArc || innerRatio > 0) && ctx.model.isParametricElement(el) && initialBox) {
        const initAttrs = initialAttributesMap.get(id);
        const oldCx = parseFloat((initAttrs && initAttrs.cx) || el.attributes.cx || '0');
        const oldCy = parseFloat((initAttrs && initAttrs.cy) || el.attributes.cy || '0');
        const oldRx = parseFloat((initAttrs && (initAttrs.rx || initAttrs.r)) || el.attributes.rx || '1');
        const oldRy = parseFloat((initAttrs && (initAttrs.ry || initAttrs.r)) || el.attributes.ry || '1');
        const startAngle = parseFloat(el.attributes['data-start-angle'] || '0');
        const endAngle = parseFloat(el.attributes['data-end-angle'] || '360');
        const type = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'pie';

        const newBox = ctx.selectionTool.getBoundingBox({ ...el, vertices: transformedVerts });
        const oldBox = initialBox;
        if (newBox && oldBox.width > 0 && oldBox.height > 0) {
          const scaleX = newBox.width / oldBox.width;
          const scaleY = newBox.height / oldBox.height;
          const newCx = newBox.x + (oldCx - oldBox.x) * scaleX;
          const newCy = newBox.y + (oldCy - oldBox.y) * scaleY;
          const newRx = Math.max(0.1, oldRx * scaleX);
          const newRy = Math.max(0.1, oldRy * scaleY);

          el.attributes.cx = Math.round(newCx * 100) / 100 + '';
          el.attributes.cy = Math.round(newCy * 100) / 100 + '';
          el.attributes.rx = Math.round(newRx * 100) / 100 + '';
          el.attributes.ry = Math.round(newRy * 100) / 100 + '';
          el.attributes.d = ctx.model.compileEllipseD(newCx, newCy, newRx, newRy, type, startAngle, endAngle, innerRatio);
          el.vertices = ctx.model.convertEllipseToVertices(newCx, newCy, newRx, newRy, type, startAngle, endAngle, innerRatio);
          el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
          if (innerRatio > 0) {
            el.attributes['fill-rule'] = 'evenodd';
          }
          return;
        }
      }

      el.vertices = transformedVerts;
      const isClosed = ctx.model.isElementClosed(el);
      el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
      if (ctx.model.isParametricElement(el)) {
        ctx.model.syncParametricAttributes(el);
      }
    });

    const newBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
    if (newBox) {
      ctx.selectionTool.updatePivotOnScale(initialBox, newBox, selectedEls);
    }

    // Compensate gradients for elements with lockScale === false (FIX-FillLocks)
    selectedEls.forEach((el) => {
      if (el.attributes['data-gradient']) {
        const initialVerts = initialElementsMap.get(el.id);
        const oldElBox = initialVerts
          ? ctx.selectionTool.getBoundingBox({ ...el, vertices: initialVerts })
          : initialBox;
        const newElBox = ctx.selectionTool.getBoundingBox(el);
        if (oldElBox && newElBox) {
          ctx.selectionTool.compensateGradientOnScale(el, oldElBox, newElBox);
        }
      }
    });
  }
}
