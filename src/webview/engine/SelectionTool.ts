import { VectorElement, PathVertex, Point, GradientConfig } from './VectorModel.js';
import { EllipsePrimitive } from './primitives/EllipsePrimitive.js';
import { PathGeometryCompiler } from './geometry/PathGeometryCompiler.js';
import { StrokeOutlineGenerator } from './boolean/StrokeOutlineGenerator.js';
import { BoundingBox, BoundingBoxCalculator } from './geometry/BoundingBoxCalculator.js';
import { HandleType, HitTestResult, HitTestService } from './selection/HitTestService.js';
import { QuadCorners } from './geometry/ProjectiveHomography.js';
import type { Polygon } from 'polygon-clipping';

export { BoundingBox, BoundingBoxCalculator } from './geometry/BoundingBoxCalculator.js';
export { HandleType, HitTestResult, HitTestService } from './selection/HitTestService.js';
export { QuadCorners } from './geometry/ProjectiveHomography.js';

export interface DragState {
  initialElement: VectorElement;
  initialBox: BoundingBox;
  initialVertices: PathVertex[];
  startPoint: Point;
  activeHandle: HandleType | 'move' | null;
}

export class SelectionTool {
  public selectedElementIds: Set<string> = new Set();
  public hoveredElementId: string | null = null;
  public hoverTolerance: number = 3.0; // 3px diameter stroke tolerance
  public marqueeRect: { x: number; y: number; width: number; height: number } | null = null;
  public isToggleMarquee: boolean = false;
  public isDeselectMarquee: boolean = false;
  public isTouchingMarquee: boolean = false;

  /**
   * ARCHITECTURAL RATIONALE: Vector-Relative Rotation Pivot Lifecyle & Persistence
   *
   * 1. Technical Justification for Vector-Relative Persistence:
   *    Historically, `customPivot` was stored only as a transient in-memory coordinate `Point | null`.
   *    When elements were rotated, translated, scaled, or deselected, `customPivot` either remained
   *    frozen in static canvas coordinates or was wiped out to `null`. This broke the mental model of
   *    anchoring a rotation pivot to an element's feature (such as a corner or articulated joint).
   *
   * 2. Why Synchronized Affine Transformations:
   *    When an element transforms (translation by dx/dy, affine rotation by theta around an arbitrary center,
   *    or bounding-box scaling by sx/sy), any attached custom pivot must undergo the IDENTICAL affine
   *    mapping. This guarantees numerical stability and rotational invariance across repeated, successive
   *    transforms without drift or manual re-anchoring.
   *
   * 3. Discarded Alternate Approaches:
   *    - Naive AABB-relative percentage storage (relX, relY as 0..1 fractions of width/height):
   *      Discarded because axis-aligned bounding boxes (AABBs) recalculate dynamically upon rotation,
   *      causing a bounding box to expand and alter its aspect ratio when rotated, which catastrophically
   *      deforms and shifts normalized relative percentages.
   *    - Centroid-relative offsets in global space:
   *      Storing world coordinates directly on `element.attributes['data-pivot']` and mapping them
   *      solidarily during rotation, translation, and scaling ensures absolute geometric accuracy,
   *      exact SVG serialization, and seamless undo/redo snapshotting.
   */
  public customPivot: Point | null = null;
  public selectionMode: 'move' | 'scale' | 'rotate' | 'distort' = 'scale';
  public activeDistortCorner: 'nw' | 'ne' | 'se' | 'sw' = 'nw';
  public selectedDistortCorners: Set<'nw' | 'ne' | 'se' | 'sw'> = new Set(['nw']);
  public currentDistortQuad: QuadCorners | null = null;
  public isAspectRatioLocked: boolean = false;
  /**
   * ARCHITECTURAL RATIONALE: Proportional Scale Locks (Figma K Parity / FEAT-TRANS-01)
   * - scaleStroke: When true (padlock locked), multiplies stroke-width by the uniform scaling factor.
   *   When false (default vector behavior), preserves the original stroke-width.
   * - scaleCorners: When true (padlock locked), multiplies parametric rectangle corner radii by the uniform scaling factor.
   *   When false (default vector behavior), preserves constant absolute pixel corner radii.
   */
  public scaleStroke: boolean = false;
  public scaleCorners: boolean = false;

  // Backward compatibility getter & setter
  public get selectedElementId(): string | null {
    return this.selectedElementIds.values().next().value || null;
  }

  public set selectedElementId(id: string | null) {
    this.selectedElementIds.clear();
    if (id) {
      this.selectedElementIds.add(id);
    }
    this.customPivot = null;
  }

  public isSelected(id: string): boolean {
    return this.selectedElementIds.has(id);
  }

  public select(id: string, element?: VectorElement): void {
    if (this.selectedElementIds.size !== 1 || !this.selectedElementIds.has(id)) {
      this.customPivot = null;
      this.selectionMode = 'scale';
    }
    this.selectedElementIds.clear();
    this.selectedElementIds.add(id);
    if (element) {
      this.restorePivotForElement(element);
    }
  }

  public toggleSelect(id: string): void {
    this.customPivot = null;
    this.selectionMode = 'scale';
    if (this.selectedElementIds.has(id)) {
      this.selectedElementIds.delete(id);
    } else {
      this.selectedElementIds.add(id);
    }
  }

  public deselect(id: string): void {
    this.customPivot = null;
    this.selectedElementIds.delete(id);
    if (this.selectedElementIds.size === 0) {
      this.selectionMode = 'scale';
    }
  }

  public deselectAll(): void {
    this.customPivot = null;
    this.selectedElementIds.clear();
    this.selectionMode = 'scale';
  }

  /**
   * ARCHITECTURAL RATIONALE: Canonical Center for Ellipses, Pies, Arcs and Donut Rings (FIX-09)
   * Why: For parametric ellipses, circles, pies, arcs, and donuts, the bounding box of a partial arc
   * fluctuates dynamically as start and end angles change (e.g. a 90° arc only spans a single quadrant).
   * If the default rotation pivot were taken from `box.cx, box.cy`, the center marker would shift wildly
   * across the canvas as the circle is opened, and rotating the arc would wobble off-center instead of
   * revolving smoothly along its natural circular trajectory.
   * Discarded alternatives:
   * - Using `box.cx, box.cy` unconditionally: Destroys circular rotation behavior for partial arcs and donuts.
   * - Forcing a full-circle bounding box for partial arcs: Distorts resize handles and selection bounds.
   * Solution: When `customPivot` is null and a single parametric ellipse/arc/rosca is selected, return
   * the canonical center `(cx, cy)` of the circle. Otherwise, fallback to `box.cx, box.cy`.
   */
  public getPivot(box: BoundingBox, element?: VectorElement): Point {
    if (this.customPivot) {
      return { ...this.customPivot };
    }
    if (element && EllipsePrimitive.isEllipse(element)) {
      const cx = parseFloat(element.attributes.cx || '0');
      const cy = parseFloat(element.attributes.cy || '0');
      return { x: cx, y: cy };
    }
    return { x: box.cx, y: box.cy };
  }

  public elementPivots: Map<string, Point> = new Map();

  /**
   * Sets custom pivot and persists coordinates for the element when single element is selected.
   */
  public setCustomPivotForElement(element: VectorElement | undefined, pt: Point): void {
    this.customPivot = { x: pt.x, y: pt.y };
    if (element) {
      this.elementPivots.set(element.id, {
        x: Math.round(pt.x * 100) / 100,
        y: Math.round(pt.y * 100) / 100,
      });
    }
  }

  /**
   * Restores custom pivot for element if present in elementPivots.
   */
  public restorePivotForElement(element: VectorElement): void {
    const pivot = this.elementPivots.get(element.id);
    if (pivot) {
      this.customPivot = { x: pivot.x, y: pivot.y };
    }
  }

  /**
   * Resets custom pivot to null and cleans it from elementPivots if provided.
   */
  public resetPivot(element?: VectorElement): void {
    this.customPivot = null;
    if (element) {
      this.elementPivots.delete(element.id);
    }
  }

  /**
   * Translates custom pivot solidarily with vector displacement.
   */
  public updatePivotOnTranslate(dx: number, dy: number, elements?: VectorElement[]): void {
    if (!this.customPivot) return;
    this.customPivot = {
      x: this.customPivot.x + dx,
      y: this.customPivot.y + dy,
    };
    if (elements && elements.length === 1) {
      this.setCustomPivotForElement(elements[0], this.customPivot);
    }
  }

  /**
   * Rotates custom pivot solidarily with angular rotation around specified pivot center.
   * If rotation was performed around customPivot itself, coordinates remain numerically invariant.
   */
  public updatePivotOnRotate(pivotCenter: Point, angleRad: number, elements?: VectorElement[]): void {
    if (!this.customPivot) return;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = this.customPivot.x - pivotCenter.x;
    const dy = this.customPivot.y - pivotCenter.y;
    this.customPivot = {
      x: pivotCenter.x + dx * cos - dy * sin,
      y: pivotCenter.y + dx * sin + dy * cos,
    };
    if (elements && elements.length === 1) {
      this.setCustomPivotForElement(elements[0], this.customPivot);
    }
  }

  /**
   * Scales custom pivot solidarily with bounding box resize transformation.
   */
  public updatePivotOnScale(initialBox: BoundingBox, newBox: BoundingBox, elements?: VectorElement[]): void {
    if (!this.customPivot) return;
    const initialW = Math.max(initialBox.width, 1);
    const initialH = Math.max(initialBox.height, 1);
    const scaleX = newBox.width / initialW;
    const scaleY = newBox.height / initialH;
    const relX = this.customPivot.x - initialBox.x;
    const relY = this.customPivot.y - initialBox.y;
    this.customPivot = {
      x: newBox.x + relX * scaleX,
      y: newBox.y + relY * scaleY,
    };
    if (elements && elements.length === 1) {
      this.setCustomPivotForElement(elements[0], this.customPivot);
    }
  }

  /**
   * Transforms custom pivot solidarily with affine shear / skew transformation.
   */
  public updatePivotOnSkew(transformPoint: (p: Point) => Point, elements?: VectorElement[]): void {
    if (!this.customPivot) return;
    this.customPivot = transformPoint(this.customPivot);
    if (elements && elements.length === 1) {
      this.setCustomPivotForElement(elements[0], this.customPivot);
    }
  }

  public hitTestPivot(box: BoundingBox, pt: Point, radius: number = 8, element?: VectorElement): boolean {
    return HitTestService.hitTestPivot(this.getPivot(box, element), pt, radius);
  }

  /**
   * ARCHITECTURAL RATIONALE: Pure Outermost Anchor Node Bounding Box
   *
   * 1. Evolution from Complex Stroke/Marker Heuristics (FIX-24) to Pure Anchor Frame:
   *    In previous iterations, `getBoundingBox` attempted to synthesize analytical bounding envelopes
   *    encompassing all SVG rendering heuristics (stroke width half-thickness, miter joins at sharp angles,
   *    marker polygons, and cubic Bézier curve extrema).
   *    However, across heterogeneous geometries (e.g. stars with acute miter vertices, polylines with
   *    different join types, and strokes with variable marker offsets), stroke and marker synthesis
   *    frequently diverged from the user's intended anchor frame, making precise CAD alignment and
   *    snapping to grid/guidelines highly unpredictable.
   *
   * 2. Designer-Centric Predictability:
   *    The bounding box and selection handles adapt strictly to the outermost anchor vertices of the
   *    vector (min/max X and Y of element.vertices). Visual decorations (stroke thickness, joins,
   *    caps, and markers) are treated as stylistic properties that do not distort the underlying
   *    geometric anchor frame.
   *
   * 3. Exact Snap-To Alignment:
   *    When dragging scale handles, the outer anchor nodes of the vector land with sub-pixel
   *    precision directly on grid intersections, guidelines, and other vector vertices.
   */
  public getBoundingBox(element: VectorElement): BoundingBox | null {
    return BoundingBoxCalculator.getBoundingBox(element);
  }

  /**
   * ARCHITECTURAL RATIONALE: Zero-Clearance Tight Selection Bounding Box
   * 1. Exact Alignment with Physical Geometry & Inspector Metrics:
   *    Previous iterations utilized an artificial padding (16 / z) around the vector boundary.
   *    While this separated handles from vector nodes, it introduced a visual floating gap,
   *    disconnected the handles from the real physical extents of the vector, and caused the selection
   *    box dimensions to diverge from the exact W and H metrics reported in the properties panel.
   *    Configuring padding = 0 aligns the selection outline and 8 scale handles flush against the
   *    analytical bounds (stroke limits and marker polygons) of the vector, enabling precise CAD-like
   *    visual inspection and alignment.
   * 2. Snapping Accuracy:
   *    Tight bounding boxes allow scale handles to snap directly to grid intersections, guidelines,
   *    artboard edges, and other vector vertices without requiring offset compensation.
   */
  public getSelectionBoundingBox(element: VectorElement, padding: number = 0): BoundingBox | null {
    return BoundingBoxCalculator.getSelectionBoundingBox(element, padding);
  }

  // Calculate composite group bounding box for multiple elements
  public getGroupBoundingBox(elements: VectorElement[]): BoundingBox | null {
    return BoundingBoxCalculator.getGroupBoundingBox(elements);
  }

  // Calculate composite group selection bounding box with padding (tight zero-clearance by default)
  public getGroupSelectionBoundingBox(elements: VectorElement[], padding: number = 0): BoundingBox | null {
    return BoundingBoxCalculator.getGroupSelectionBoundingBox(elements, padding);
  }

  public hitTestMarquee(
    elements: VectorElement[],
    marquee: { x: number; y: number; width: number; height: number },
    touching: boolean = false
  ): string[] {
    return HitTestService.hitTestMarquee(elements, marquee, touching);
  }

  public hitTest(
    elements: VectorElement[],
    pt: Point,
    zoomScale: number = 1.0
  ): HitTestResult | null {
    return HitTestService.hitTest(elements, pt, zoomScale, this.hoverTolerance);
  }

  public hitTestHandle(
    box: BoundingBox,
    pt: Point,
    handleRadius: number = 12,
    rotateOffset: number = 20,
    mode: 'move' | 'scale' | 'rotate' | 'distort' | 'transform' = 'scale',
    currentQuad?: QuadCorners | null
  ): HandleType | null {
    return HitTestService.hitTestHandle(box, pt, handleRadius, rotateOffset, mode, currentQuad || this.currentDistortQuad);
  }

  // Resize / Scale vector element vertices based on drag handle movement
  public transformVertices(
    initialVertices: PathVertex[],
    initialBox: BoundingBox,
    handle: HandleType,
    dx: number,
    dy: number,
    padding: number = 0,
    fromCenter: boolean = false,
    proportional: boolean = false
  ): PathVertex[] {
    let newX = initialBox.x;
    let newY = initialBox.y;
    let newW = initialBox.width;
    let newH = initialBox.height;

    // 1. Calculate new width and height
    switch (handle) {
      case 'e':
        newW += fromCenter ? dx * 2 : dx;
        break;
      case 'w':
        newW -= fromCenter ? dx * 2 : dx;
        if (!fromCenter) newX += dx;
        break;
      case 's':
        newH += fromCenter ? dy * 2 : dy;
        break;
      case 'n':
        newH -= fromCenter ? dy * 2 : dy;
        if (!fromCenter) newY += dy;
        break;
      case 'se':
        newW += fromCenter ? dx * 2 : dx;
        newH += fromCenter ? dy * 2 : dy;
        break;
      case 'nw':
        newW -= fromCenter ? dx * 2 : dx;
        newH -= fromCenter ? dy * 2 : dy;
        if (!fromCenter) { newX += dx; newY += dy; }
        break;
      case 'ne':
        newW += fromCenter ? dx * 2 : dx;
        newH -= fromCenter ? dy * 2 : dy;
        if (!fromCenter) newY += dy;
        break;
      case 'sw':
        newW -= fromCenter ? dx * 2 : dx;
        newH += fromCenter ? dy * 2 : dy;
        if (!fromCenter) newX += dx;
        break;
    }

    // 2. Adjust for proportional scaling (Ctrl or aspect ratio lock)
    if (proportional) {
      const ratio = initialBox.width / initialBox.height;
      if (['n', 's'].includes(handle)) {
        const diffW = (newH * ratio) - newW;
        newW = newH * ratio;
        if (!fromCenter) newX -= diffW / 2;
      } else if (['e', 'w'].includes(handle)) {
        const diffH = (newW / ratio) - newH;
        newH = newW / ratio;
        if (!fromCenter) newY -= diffH / 2;
      } else {
        if (newW / ratio > newH) {
          const diffH = (newW / ratio) - newH;
          newH = newW / ratio;
          if (!fromCenter && (handle === 'nw' || handle === 'ne')) newY -= diffH;
        } else {
          const diffW = (newH * ratio) - newW;
          newW = newH * ratio;
          if (!fromCenter && (handle === 'nw' || handle === 'sw')) newX -= diffW;
        }
      }
    }

    // 3. Keep center fixed if scaling from center
    if (fromCenter) {
      newX = initialBox.x + initialBox.width / 2 - newW / 2;
      newY = initialBox.y + initialBox.height / 2 - newH / 2;
    }

    /**
     * ARCHITECTURAL RATIONALE: Interactive Negative Scale & Real-Time Reflection
     * Previously clamped to `minDim = 2`, preventing users from dragging past the opposing
     * anchor to mirror objects interactively across X or Y axes.
     * By preserving the algebraic sign of `newW` and `newH`, vertices and Bézier handles reflect
     * symmetrically across the fixed anchor line without requiring a separate mirror modal.
     * Singularities (|w| < 1 or |h| < 1) are normalized to ±1 to prevent division-by-zero.
     */
    const signW = newW < 0 ? -1 : 1;
    const signH = newH < 0 ? -1 : 1;
    const absW = Math.max(Math.abs(newW), 1);
    const absH = Math.max(Math.abs(newH), 1);

    const initialTightX = initialBox.x + padding;
    const initialTightY = initialBox.y + padding;
    const initialTightW = Math.max(initialBox.width - padding * 2, 1);
    const initialTightH = Math.max(initialBox.height - padding * 2, 1);

    const scaleX = (absW * signW) / initialTightW;
    const scaleY = (absH * signH) / initialTightH;

    const newTightX = newX + padding;
    const newTightY = newY + padding;

    return initialVertices.map((v) => {
      const next: PathVertex = {
        ...v,
        x: newTightX + (v.x - initialTightX) * scaleX,
        y: newTightY + (v.y - initialTightY) * scaleY,
      };

      if (v.handleIn) {
        next.handleIn = {
          x: newTightX + (v.handleIn.x - initialTightX) * scaleX,
          y: newTightY + (v.handleIn.y - initialTightY) * scaleY,
        };
      }
      if (v.handleOut) {
        next.handleOut = {
          x: newTightX + (v.handleOut.x - initialTightX) * scaleX,
          y: newTightY + (v.handleOut.y - initialTightY) * scaleY,
        };
      }
      return next;
    });
  }

  /**
   * ARCHITECTURAL RATIONALE: Rigorous Affine 2D Rotation Around Arbitrary Pivot
   * Rotates every vertex coordinate and its associated Bézier control handles (`handleIn`, `handleOut`)
   * by `angleRad` around the specified arbitrary pivot point `(pivot.x, pivot.y)`.
   *
   * Mathematical Rationale:
   * x' = pivot.x + (x - pivot.x) * cos(theta) - (y - pivot.y) * sin(theta)
   * y' = pivot.y + (x - pivot.x) * sin(theta) + (y - pivot.y) * cos(theta)
   *
   * Why control handles must be rotated identically:
   * Bézier handles are absolute coordinates in SVG space. If only the anchor point is rotated,
   * or if handles are rotated relative to the anchor instead of the global pivot, the curve tangents
   * and curvature deform disastrously. Rotating all handle positions around the same global pivot
   * preserves exact curve fidelity and shape integrity across any angle.
   */
  public rotateVerticesAroundPivot(
    initialVertices: PathVertex[],
    pivot: Point,
    angleRad: number
  ): PathVertex[] {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const rotatePoint = (p: Point): Point => {
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      return {
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
      };
    };

    return initialVertices.map((v) => {
      const next: PathVertex = {
        ...v,
        ...rotatePoint(v),
      };

      if (v.handleIn) {
        next.handleIn = rotatePoint(v.handleIn);
      }
      if (v.handleOut) {
        next.handleOut = rotatePoint(v.handleOut);
      }
      return next;
    });
  }

  /**
   * ARCHITECTURAL RATIONALE: Solidary Gradient Transformation on Rotation (FIX-06)
   *
   * 1. The Core Problem:
   *    In SVG, gradients defined with `objectBoundingBox` stretch across the element's axis-aligned bounding box (AABB).
   *    When a vector rotates, its AABB width and height change dynamically depending on the angle.
   *    Without solidary transformation, an elliptical or circular radial gradient deforms unpredictably,
   *    wobbling between horizontal ellipse, circle, and vertical ellipse as the bounding box aspect ratio shifts.
   *    Furthermore, linear gradient angles stay static in world space instead of turning with the object.
   *
   * 2. The Solidary Solution:
   *    - Linear Gradient: Increment `grad.angle` by `deltaAngleDeg`, maintaining orientation locked to the vector body.
   *    - Radial Gradient:
   *      a) Rotate absolute center (cx, cy) and focus (fx, fy) around the rotation pivot by `deltaAngleRad`,
   *         then re-project into normalized fractions of the element's new post-rotation bounding box.
   *      b) Measure physical world canvas radii (Rx = rx * oldBox.w, Ry = ry * oldBox.h) and re-normalize to
   *         (newBox.w, newBox.h). This guarantees the physical dispersion footprint in pixels remains invariant.
   *      c) Increment `grad.rotation` by `deltaAngleDeg`, ensuring the elliptical axes turn solidarily with the vector.
   */
  public rotateElementGradient(
    el: VectorElement,
    pivot: Point,
    deltaAngleRad: number,
    oldBox: BoundingBox,
    newBox: BoundingBox
  ): void {
    if (!el.attributes['data-gradient']) return;
    try {
      const grad: any = JSON.parse(el.attributes['data-gradient']);
      const deltaDeg = Math.round((deltaAngleRad * 180) / Math.PI);

      const shouldRotateAngle = grad.lockRotation !== false;
      const shouldRotatePos = grad.lockPosition !== false;

      if (grad.type === 'linear') {
        if (shouldRotateAngle) {
          let ang = (grad.angle ?? 0) + deltaDeg;
          ang = ((ang % 360) + 360) % 360;
          grad.angle = Math.round(ang);
        }
        if (oldBox.width > 0 && oldBox.height > 0 && newBox.width > 0 && newBox.height > 0) {
          const oldCxAbs = oldBox.x + (grad.cx ?? 0.5) * oldBox.width;
          const oldCyAbs = oldBox.y + (grad.cy ?? 0.5) * oldBox.height;
          let newCxAbs = oldCxAbs;
          let newCyAbs = oldCyAbs;
          if (shouldRotatePos) {
            const cos = Math.cos(deltaAngleRad);
            const sin = Math.sin(deltaAngleRad);
            const dxC = oldCxAbs - pivot.x;
            const dyC = oldCyAbs - pivot.y;
            newCxAbs = pivot.x + (dxC * cos - dyC * sin);
            newCyAbs = pivot.y + (dxC * sin + dyC * cos);
          }
          grad.cx = Math.round(((newCxAbs - newBox.x) / newBox.width) * 1000) / 1000;
          grad.cy = Math.round(((newCyAbs - newBox.y) / newBox.height) * 1000) / 1000;
        }
        el.attributes['data-gradient'] = JSON.stringify(grad);
      } else if (grad.type === 'radial') {
        if (oldBox.width <= 0 || oldBox.height <= 0 || newBox.width <= 0 || newBox.height <= 0) return;

        const cos = Math.cos(deltaAngleRad);
        const sin = Math.sin(deltaAngleRad);

        // 1. Center handling based on lockPosition
        const oldCxAbs = oldBox.x + (grad.cx ?? 0.5) * oldBox.width;
        const oldCyAbs = oldBox.y + (grad.cy ?? 0.5) * oldBox.height;
        let newCxAbs = oldCxAbs;
        let newCyAbs = oldCyAbs;
        if (shouldRotatePos) {
          const dxC = oldCxAbs - pivot.x;
          const dyC = oldCyAbs - pivot.y;
          newCxAbs = pivot.x + (dxC * cos - dyC * sin);
          newCyAbs = pivot.y + (dxC * sin + dyC * cos);
        }
        grad.cx = Math.round(((newCxAbs - newBox.x) / newBox.width) * 1000) / 1000;
        grad.cy = Math.round(((newCyAbs - newBox.y) / newBox.height) * 1000) / 1000;

        // 2. Focus handling based on lockPosition
        if (grad.fx !== undefined || grad.fy !== undefined) {
          const oldFxAbs = oldBox.x + (grad.fx ?? grad.cx ?? 0.5) * oldBox.width;
          const oldFyAbs = oldBox.y + (grad.fy ?? grad.cy ?? 0.5) * oldBox.height;
          let newFxAbs = oldFxAbs;
          let newFyAbs = oldFyAbs;
          if (shouldRotatePos) {
            const dxF = oldFxAbs - pivot.x;
            const dyF = oldFyAbs - pivot.y;
            newFxAbs = pivot.x + (dxF * cos - dyF * sin);
            newFyAbs = pivot.y + (dxF * sin + dyF * cos);
          }
          grad.fx = Math.round(((newFxAbs - newBox.x) / newBox.width) * 1000) / 1000;
          grad.fy = Math.round(((newFyAbs - newBox.y) / newBox.height) * 1000) / 1000;
        }

        // 3. Preserve physical canvas radii (Rx, Ry) to avoid aspect ratio mutation
        const oldRad = ((grad.rotation ?? 0) * Math.PI) / 180;
        const oldSpanU = Math.hypot(oldBox.width * Math.cos(oldRad), oldBox.height * Math.sin(oldRad));
        const oldSpanV = Math.hypot(oldBox.width * Math.sin(oldRad), oldBox.height * Math.cos(oldRad));
        const rxAbs = (grad.rx ?? grad.r ?? 0.5) * oldSpanU;
        const ryAbs = (grad.ry ?? grad.r ?? 0.5) * oldSpanV;

        // 4. Update gradient rotation angle only if lockRotation !== false
        let newRad = oldRad;
        if (shouldRotateAngle) {
          let rot = (grad.rotation ?? 0) + deltaDeg;
          rot = ((rot % 360) + 360) % 360;
          grad.rotation = Math.round(rot);
          newRad = (grad.rotation * Math.PI) / 180;
        }

        const newSpanU = Math.hypot(newBox.width * Math.cos(newRad), newBox.height * Math.sin(newRad));
        const newSpanV = Math.hypot(newBox.width * Math.sin(newRad), newBox.height * Math.cos(newRad));
        grad.rx = Math.round((rxAbs / (newSpanU || 1)) * 1000) / 1000;
        grad.ry = Math.round((ryAbs / (newSpanV || 1)) * 1000) / 1000;
        grad.r = grad.rx;

        el.attributes['data-gradient'] = JSON.stringify(grad);
      }
    } catch {}
  }

  /**
   * ARCHITECTURAL RATIONALE: Fill Transformation Position Lock Compensation
   *
   * When `grad.lockPosition === false` (unlocked / candado abierto):
   * In standard SVG objectBoundingBox space, moving an element by (dx, dy) causes the
   * gradient to travel solidarily with the element. To keep the gradient stationary
   * in world coordinates (canvas space), the normalized coordinates [u, v] in the new box
   * must be shifted inversely by (-dx / width, -dy / height).
   */
  public compensateGradientOnTranslate(
    el: VectorElement,
    dx: number,
    dy: number,
    box: BoundingBox
  ): void {
    if (!el.attributes['data-gradient']) return;
    try {
      const grad: GradientConfig = JSON.parse(el.attributes['data-gradient']);
      if (grad.lockPosition !== false) return; // Default is locked (moves with vector)

      if (box.width <= 0 || box.height <= 0) return;

      const du = dx / box.width;
      const dv = dy / box.height;

      grad.cx = Math.round(((grad.cx ?? 0.5) - du) * 1000) / 1000;
      grad.cy = Math.round(((grad.cy ?? 0.5) - dv) * 1000) / 1000;

      if (grad.fx !== undefined) {
        grad.fx = Math.round((grad.fx - du) * 1000) / 1000;
      }
      if (grad.fy !== undefined) {
        grad.fy = Math.round((grad.fy - dv) * 1000) / 1000;
      }

      el.attributes['data-gradient'] = JSON.stringify(grad);
    } catch {}
  }

  /**
   * ARCHITECTURAL RATIONALE: Fill Transformation Scale Lock Compensation
   *
   * When `grad.lockScale === false` (unlocked / candado abierto):
   * In standard SVG objectBoundingBox space, resizing an element by (scaleX, scaleY)
   * stretches the gradient along with the element. To keep the gradient's physical dimensions
   * in screen pixels strictly unchanged:
   * 1. Radial gradients:
   *    Physical radius along Axis 1: R1 = rx_old * spanU_old.
   *    In new box: rx_new = R1 / spanU_new.
   *    Physical radius along Axis 2: R2 = ry_old * spanV_old.
   *    In new box: ry_new = R2 / spanV_new.
   *    This guarantees that when unlocked, screen radii remain strictly constant across all angles.
   * 2. Linear gradients:
   *    Compensates half-length span inversely by average dimension change.
   * 3. Position interaction:
   *    If lockPosition is also false, ensures center remains pinned to world coordinates.
   */
  public compensateGradientOnScale(
    el: VectorElement,
    oldBox: BoundingBox,
    newBox: BoundingBox
  ): void {
    if (!el.attributes['data-gradient']) return;
    try {
      const grad: GradientConfig = JSON.parse(el.attributes['data-gradient']);
      if (grad.lockScale !== false) return; // Default is locked (scales with vector)

      if (oldBox.width <= 0 || oldBox.height <= 0 || newBox.width <= 0 || newBox.height <= 0) return;

      const scaleX = newBox.width / oldBox.width;
      const scaleY = newBox.height / oldBox.height;

      if (grad.type === 'radial') {
        const rad = ((grad.rotation ?? 0) * Math.PI) / 180;
        const cosRad = Math.cos(rad);
        const sinRad = Math.sin(rad);
        const oldSpanU = Math.hypot(oldBox.width * cosRad, oldBox.height * sinRad);
        const oldSpanV = Math.hypot(oldBox.width * sinRad, oldBox.height * cosRad);
        const rxAbs = (grad.rx ?? grad.r ?? 0.5) * oldSpanU;
        const ryAbs = (grad.ry ?? grad.rx ?? grad.r ?? 0.5) * oldSpanV;

        const newSpanU = Math.hypot(newBox.width * cosRad, newBox.height * sinRad);
        const newSpanV = Math.hypot(newBox.width * sinRad, newBox.height * cosRad);
        grad.rx = Math.round((rxAbs / (newSpanU || 1)) * 1000) / 1000;
        grad.ry = Math.round((ryAbs / (newSpanV || 1)) * 1000) / 1000;
        grad.r = grad.rx;
      } else if (grad.type === 'linear') {
        const r = grad.r ?? 0.5;
        const scaleAvg = Math.sqrt(scaleX * scaleY);
        grad.r = Math.round((r / scaleAvg) * 1000) / 1000;
      }

      if (grad.lockPosition === false) {
        const oldCx = oldBox.x + (grad.cx ?? 0.5) * oldBox.width;
        const oldCy = oldBox.y + (grad.cy ?? 0.5) * oldBox.height;
        grad.cx = Math.round(((oldCx - newBox.x) / newBox.width) * 1000) / 1000;
        grad.cy = Math.round(((oldCy - newBox.y) / newBox.height) * 1000) / 1000;
      }

      el.attributes['data-gradient'] = JSON.stringify(grad);
    } catch {}
  }
}

