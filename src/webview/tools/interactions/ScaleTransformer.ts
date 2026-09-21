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
      const el = ctx.model.elements.find((e) => e.id === id);
      const isRect = el ? ctx.model.isRect(el) : false;

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

      /**
       * ARCHITECTURAL RATIONALE: Unscaled Corner Radius Ghost Stabilization
       * When scaleCorners is false (padlock unlocked, default vector behavior):
       * Reconstructs the rectangle ghost topology directly using its exact original pixel corner
       * radii so the preview does not display false corner stretching during drag.
       */
      if (isRect && !ctx.selectionTool.scaleCorners && el) {
        const tempBox = ctx.selectionTool.getBoundingBox({ ...el, vertices: transformed });
        if (tempBox && tempBox.width > 0 && tempBox.height > 0) {
          const corners = ctx.model.getRectCorners(el, tempBox.width, tempBox.height);
          if (corners.unit === 'px') {
            const eff = ctx.model.calculateEffectiveCorners(tempBox.width, tempBox.height, corners);
            const rectVerts = ctx.model.convertRectToVertices(
              tempBox.x,
              tempBox.y,
              tempBox.width,
              tempBox.height,
              eff.tl,
              eff.tr,
              eff.br,
              eff.bl
            );
            ghostMap.set(id, rectVerts);
            return;
          }
        }
      }

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

    const oldBox = initialBox;
    const scaleX = oldBox && oldBox.width > 0 && newBox ? newBox.width / oldBox.width : 1;
    const scaleY = oldBox && oldBox.height > 0 && newBox ? newBox.height / oldBox.height : 1;
    const uniformScale = Math.sqrt(Math.abs(scaleX * scaleY));

    /**
     * ARCHITECTURAL RATIONALE: Proportional Stroke Width Scaling (Figma K Parity / FEAT-TRANS-01)
     * When ctx.selectionTool.scaleStroke is true (padlock closed):
     * Multiplies the base stroke-width by the uniform scaling factor uniformScale.
     * When false (padlock open, default):
     * The stroke-width remains invariant regardless of element dimension scaling.
     */
    if (ctx.selectionTool.scaleStroke && uniformScale > 0.0001) {
      selectedEls.forEach((el) => {
        const initAttrs = initialAttributesMap.get(el.id);
        const oldStrokeStr = (initAttrs && initAttrs['stroke-width']) || el.attributes['stroke-width'];
        if (oldStrokeStr !== undefined) {
          const oldStroke = parseFloat(oldStrokeStr) || 1;
          const newStroke = Math.max(0.1, Math.round(oldStroke * uniformScale * 100) / 100);
          el.attributes['stroke-width'] = newStroke.toString();
        }
      });
    }

    /**
     * ARCHITECTURAL RATIONALE: Parametric Rectangle Corner Scaling (FEAT-TRANS-01)
     * When ctx.selectionTool.scaleCorners is true (padlock closed):
     * Multiplies absolute pixel corner radii by the uniform scaling factor.
     * When false (padlock open, default):
     * Preserves the absolute pixel corner radii exactly without elongation or distortion.
     */
    selectedEls.forEach((el) => {
      if (ctx.model.isRect(el)) {
        const initAttrs = initialAttributesMap.get(el.id);
        const elBox = ctx.selectionTool.getBoundingBox(el);
        if (elBox && elBox.width > 0 && elBox.height > 0) {
          const corners = ctx.model.getRectCorners(el, elBox.width, elBox.height);
          if (corners.unit === 'px') {
            const factor = ctx.selectionTool.scaleCorners ? uniformScale : 1;
            const initCorners = initAttrs ? ctx.model.parseCornersFromAttrs(initAttrs, elBox.width, elBox.height) : corners;
            const newTl = Math.round(initCorners.tl * factor * 100) / 100;
            const newTr = Math.round(initCorners.tr * factor * 100) / 100;
            const newBr = Math.round(initCorners.br * factor * 100) / 100;
            const newBl = Math.round(initCorners.bl * factor * 100) / 100;

            if (corners.mode === 'uniform') {
              el.attributes['data-corner-radius'] = newTl.toString();
              el.attributes.rx = newTl.toString();
              el.attributes.ry = newTl.toString();
            } else {
              el.attributes['data-corner-radius'] = `${newTl},${newTr},${newBr},${newBl}`;
              el.attributes['data-corner-tl'] = newTl.toString();
              el.attributes['data-corner-tr'] = newTr.toString();
              el.attributes['data-corner-br'] = newBr.toString();
              el.attributes['data-corner-bl'] = newBl.toString();
            }

            const eff = ctx.model.calculateEffectiveCorners(elBox.width, elBox.height, { ...corners, tl: newTl, tr: newTr, br: newBr, bl: newBl });
            el.attributes.d = ctx.model.compileRectD(elBox.x, elBox.y, elBox.width, elBox.height, eff.tl, eff.tr, eff.br, eff.bl);
            el.vertices = ctx.model.convertRectToVertices(elBox.x, elBox.y, elBox.width, elBox.height, eff.tl, eff.tr, eff.br, eff.bl);
            el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
            ctx.model.syncParametricAttributes(el);
          }
        }
      }
    });

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
