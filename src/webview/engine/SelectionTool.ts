import { VectorElement, PathVertex, Point } from './VectorModel.js';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export type HandleType =
  | 'nw' | 'n' | 'ne'
  | 'w'  |       'e'
  | 'sw' | 's' | 'se'
  | 'rotate';

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
  public isDeselectMarquee: boolean = false;

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
    }
    this.selectedElementIds.clear();
    this.selectedElementIds.add(id);
    if (element) {
      this.restorePivotForElement(element);
    }
  }

  public toggleSelect(id: string): void {
    this.customPivot = null;
    if (this.selectedElementIds.has(id)) {
      this.selectedElementIds.delete(id);
    } else {
      this.selectedElementIds.add(id);
    }
  }

  public deselect(id: string): void {
    this.customPivot = null;
    this.selectedElementIds.delete(id);
  }

  public deselectAll(): void {
    this.customPivot = null;
    this.selectedElementIds.clear();
  }

  public getPivot(box: BoundingBox): Point {
    return this.customPivot ? { ...this.customPivot } : { x: box.cx, y: box.cy };
  }

  /**
   * Sets custom pivot and persists coordinates on element attributes when single element is selected.
   */
  public setCustomPivotForElement(element: VectorElement | undefined, pt: Point): void {
    this.customPivot = { x: pt.x, y: pt.y };
    if (element) {
      element.attributes['data-pivot'] = JSON.stringify({
        x: Math.round(pt.x * 100) / 100,
        y: Math.round(pt.y * 100) / 100,
      });
    }
  }

  /**
   * Restores custom pivot from element `data-pivot` attribute if present.
   */
  public restorePivotForElement(element: VectorElement): void {
    if (element.attributes && element.attributes['data-pivot']) {
      try {
        const parsed = JSON.parse(element.attributes['data-pivot']);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          this.customPivot = { x: parsed.x, y: parsed.y };
        }
      } catch {}
    }
  }

  /**
   * Resets custom pivot to null and cleans attribute from element if provided.
   */
  public resetPivot(element?: VectorElement): void {
    this.customPivot = null;
    if (element && element.attributes && element.attributes['data-pivot']) {
      delete element.attributes['data-pivot'];
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

  public hitTestPivot(box: BoundingBox, pt: Point, radius: number = 8): boolean {
    const pivot = this.getPivot(box);
    return Math.hypot(pt.x - pivot.x, pt.y - pivot.y) <= radius;
  }

  // Calculate bounding box for a single element
  public getBoundingBox(element: VectorElement): BoundingBox | null {
    if (!element.vertices || element.vertices.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    element.vertices.forEach((v) => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });

    if (minX === Infinity) return null;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    return {
      x: minX,
      y: minY,
      width,
      height,
      cx: minX + width / 2,
      cy: minY + height / 2,
    };
  }

  // Calculate padded bounding box for selection mask & resize handles
  public getSelectionBoundingBox(element: VectorElement, padding: number = 6): BoundingBox | null {
    const box = this.getBoundingBox(element);
    if (!box) return null;
    return {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + padding * 2,
      height: box.height + padding * 2,
      cx: box.cx,
      cy: box.cy,
    };
  }

  // Calculate composite group bounding box for multiple elements
  public getGroupBoundingBox(elements: VectorElement[]): BoundingBox | null {
    if (!elements || elements.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((el) => {
      if (!el.vertices) return;
      el.vertices.forEach((v) => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      });
    });

    if (minX === Infinity) return null;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    return {
      x: minX,
      y: minY,
      width,
      height,
      cx: minX + width / 2,
      cy: minY + height / 2,
    };
  }

  // Calculate composite group selection bounding box with padding
  public getGroupSelectionBoundingBox(elements: VectorElement[], padding: number = 6): BoundingBox | null {
    const box = this.getGroupBoundingBox(elements);
    if (!box) return null;
    return {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + padding * 2,
      height: box.height + padding * 2,
      cx: box.cx,
      cy: box.cy,
    };
  }

  /**
   * ARCHITECTURAL RATIONALE: Strict Containment Marquee vs Box Intersection
   * Why this solution is engineered this way:
   * In vector illustration workflows, drawings frequently feature large background rectangles, containers,
   * or surrounding artboards. An intersection-based marquee selection (capturing any element touched by the box)
   * leads to severe friction because dragging a selection box almost invariably touches the large background object,
   * selecting it unintentionally.
   * Strict 100% containment (box.x >= mLeft && bRight <= mRight && ...) guarantees that only elements
   * intentionally encapsulated inside the marquee are selected.
   */
  public hitTestMarquee(
    elements: VectorElement[],
    marquee: { x: number; y: number; width: number; height: number }
  ): string[] {
    const hits: string[] = [];
    const mLeft = Math.min(marquee.x, marquee.x + marquee.width);
    const mRight = Math.max(marquee.x, marquee.x + marquee.width);
    const mTop = Math.min(marquee.y, marquee.y + marquee.height);
    const mBottom = Math.max(marquee.y, marquee.y + marquee.height);

    elements.forEach((el) => {
      const box = this.getBoundingBox(el);
      if (!box) return;

      const bRight = box.x + box.width;
      const bBottom = box.y + box.height;

      // Strict containment: bounding box must be 100% inside marquee selection
      const isInside =
        box.x >= mLeft &&
        bRight <= mRight &&
        box.y >= mTop &&
        bBottom <= mBottom;

      if (isInside) {
        hits.push(el.id);
      }
    });

    return hits;
  }

  /**
   * ARCHITECTURAL RATIONALE: Zoom-Independent Physical Screen Hit Tolerances
   * Why effectiveTolerance is scaled by (1 / zoomScale):
   * Without zoom compensation, hit-test radii are fixed in SVG world coordinates:
   * - At high zoom (e.g. 800%), a 10px world tolerance equates to an enormous 80px physical area on screen,
   *   causing clicks far away from a path to erroneously trigger selection.
   * - At low zoom (e.g. 20%), a 10px world tolerance shrinks to 2 physical pixels, making thin paths
   *   infuriatingly difficult to hit.
   * Scaling tolerance inversely by zoomScale maintains a consistent, comfortable physical screen-pixel hit target.
   */
  public hitTest(
    elements: VectorElement[],
    pt: Point,
    zoomScale: number = 1.0
  ): { element: VectorElement; hitOnFill: boolean } | null {
    const effectiveTolerance = Math.max((this.hoverTolerance / 2) / (zoomScale || 1), 3);

    // Search top-to-bottom (reverse array)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el.vertices || el.vertices.length === 0) continue;

      const fill = el.attributes.fill || 'none';
      const isFilled = fill !== 'none' && fill !== 'transparent' && fill !== 'rgba(0,0,0,0)';
      const isClosed = el.isClosed !== false;

      // 1. Edge/Stroke Hit test
      const edgeHit = this.hitTestPathEdge(el.vertices, pt, effectiveTolerance, isClosed);
      if (edgeHit) {
        return { element: el, hitOnFill: false };
      }

      // 2. Fill area hit test
      if (isFilled && isClosed && this.hitTestPolygonFill(el.vertices, pt)) {
        return { element: el, hitOnFill: true };
      }
    }

    return null;
  }

  // Distance from point to path edge segments (lines and Bezier curves)
  private hitTestPathEdge(
    vertices: PathVertex[],
    pt: Point,
    tolerance: number,
    isClosed: boolean = true
  ): boolean {
    if (!vertices || vertices.length < 2) return false;
    const count = isClosed ? vertices.length : vertices.length - 1;

    for (let i = 0; i < count; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % vertices.length];

      if (p1.handleOut || p2.handleIn) {
        const h1 = p1.handleOut || { x: p1.x, y: p1.y };
        const h2 = p2.handleIn || { x: p2.x, y: p2.y };
        if (distToBezier(pt, p1, h1, h2, p2) <= tolerance) {
          return true;
        }
      } else {
        if (distToSegment(pt, p1, p2) <= tolerance) {
          return true;
        }
      }
    }
    return false;
  }

  // Polygon point-in-polygon fill test
  private hitTestPolygonFill(vertices: PathVertex[], pt: Point): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;

      const intersect =
        yi > pt.y !== yj > pt.y &&
        pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.00001) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Check hit on 8 bounding box resize handles + 1 rotation handle
  public hitTestHandle(
    box: BoundingBox,
    pt: Point,
    handleRadius: number = 12,
    rotateOffset: number = 20
  ): HandleType | null {
    const handles: { type: HandleType; x: number; y: number }[] = [
      { type: 'nw', x: box.x, y: box.y },
      { type: 'n',  x: box.cx, y: box.y },
      { type: 'ne', x: box.x + box.width, y: box.y },
      { type: 'w',  x: box.x, y: box.cy },
      { type: 'e',  x: box.x + box.width, y: box.cy },
      { type: 'sw', x: box.x, y: box.y + box.height },
      { type: 's',  x: box.cx, y: box.y + box.height },
      { type: 'se', x: box.x + box.width, y: box.y + box.height },
      { type: 'rotate', x: box.cx, y: box.y - rotateOffset },
    ];

    for (const h of handles) {
      const dx = pt.x - h.x;
      const dy = pt.y - h.y;
      if (Math.hypot(dx, dy) <= handleRadius) {
        return h.type;
      }
    }

    return null;
  }

  // Resize / Scale vector element vertices based on drag handle movement
  public transformVertices(
    initialVertices: PathVertex[],
    initialBox: BoundingBox,
    handle: HandleType,
    dx: number,
    dy: number,
    padding: number = 6
  ): PathVertex[] {
    let newX = initialBox.x;
    let newY = initialBox.y;
    let newW = initialBox.width;
    let newH = initialBox.height;

    switch (handle) {
      case 'e':
        newW += dx;
        break;
      case 'w':
        newX += dx;
        newW -= dx;
        break;
      case 's':
        newH += dy;
        break;
      case 'n':
        newY += dy;
        newH -= dy;
        break;
      case 'se':
        newW += dx;
        newH += dy;
        break;
      case 'nw':
        newX += dx;
        newW -= dx;
        newY += dy;
        newH -= dy;
        break;
      case 'ne':
        newW += dx;
        newY += dy;
        newH -= dy;
        break;
      case 'sw':
        newX += dx;
        newW -= dx;
        newH += dy;
        break;
    }

    const minDim = padding * 2 + 2;
    if (newW < minDim) newW = minDim;
    if (newH < minDim) newH = minDim;

    // Tight boxes before and after
    const initialTightX = initialBox.x + padding;
    const initialTightY = initialBox.y + padding;
    const initialTightW = Math.max(initialBox.width - padding * 2, 1);
    const initialTightH = Math.max(initialBox.height - padding * 2, 1);

    const newTightX = newX + padding;
    const newTightY = newY + padding;
    const newTightW = Math.max(newW - padding * 2, 1);
    const newTightH = Math.max(newH - padding * 2, 1);

    const scaleX = newTightW / initialTightW;
    const scaleY = newTightH / initialTightH;

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
}

// Distance from point to line segment
function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Distance from point to cubic Bezier curve (sampled)
function distToBezier(p: Point, p0: Point, p1: Point, p2: Point, p3: Point, samples: number = 20): number {
  let minDist = Infinity;
  let prevPt = p0;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const currPt: Point = {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
    const d = distToSegment(p, prevPt, currPt);
    if (d < minDist) minDist = d;
    prevPt = currPt;
  }

  return minDist;
}
