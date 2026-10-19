import { VectorElement, PathVertex } from '../VectorModel.js';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

/**
 * ARCHITECTURAL RATIONALE: Analytical Bounding Box Calculator (SOLID / SRP)
 * Segregates analytical boundary calculation, group compositing, and selection clearance.
 *
 * 1. Evolution from Complex Stroke/Marker Heuristics (FIX-24) to Pure Anchor Frame:
 *    In previous iterations, bounding box calculations attempted to synthesize analytical bounding envelopes
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
export class BoundingBoxCalculator {
  /**
   * Evaluates a 1D cubic Bézier coordinate at parameter t in [0, 1].
   */
  private static evalBezier1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  /**
   * Finds the local extrema (min/max coordinates) for a 1D cubic Bézier curve segment.
   * Solves B'(t) = 0 for t in (0, 1).
   */
  private static computeBezierExtrema1D(p0: number, p1: number, p2: number, p3: number): number[] {
    const extrema: number[] = [];

    // Derivative B'(t) / 3 = a*t^2 + b*t + c
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * (p0 - 2 * p1 + p2);
    const c = p1 - p0;

    const EPSILON = 1e-9;

    if (Math.abs(a) < EPSILON) {
      // Linear equation: b*t + c = 0
      if (Math.abs(b) > EPSILON) {
        const t = -c / b;
        if (t > 0 && t < 1) {
          extrema.push(this.evalBezier1D(p0, p1, p2, p3, t));
        }
      }
    } else {
      // Quadratic equation: a*t^2 + b*t + c = 0
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtD = Math.sqrt(discriminant);
        const t1 = (-b - sqrtD) / (2 * a);
        const t2 = (-b + sqrtD) / (2 * a);

        if (t1 > 0 && t1 < 1) {
          extrema.push(this.evalBezier1D(p0, p1, p2, p3, t1));
        }
        if (t2 > 0 && t2 < 1) {
          extrema.push(this.evalBezier1D(p0, p1, p2, p3, t2));
        }
      }
    }

    return extrema;
  }

  /**
   * Computes the exact analytical geometric bounding box of a vector path,
   * encompassing both anchor vertices and the true mathematical extrema of all cubic Bézier arcs.
   */
  public static getPathBoundingBox(vertices: PathVertex[], isClosed: boolean = true): BoundingBox | null {
    if (!vertices || vertices.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // 1. Include all anchor vertices
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }

    // 2. Evaluate Bézier curve extrema on segments with control handles
    const n = vertices.length;
    if (n >= 2) {
      const segmentCount = isClosed ? n : n - 1;
      for (let i = 0; i < segmentCount; i++) {
        const v1 = vertices[i];
        const nextIdx = (i + 1) % n;
        const v2 = vertices[nextIdx];

        if (v1.handleOut || v2.handleIn) {
          const h1 = v1.handleOut || { x: v1.x, y: v1.y };
          const h2 = v2.handleIn || { x: v2.x, y: v2.y };

          // Fast preliminary check (Convex Hull Property):
          // If control points are within [minX, maxX, minY, maxY], the curve cannot exceed current bounds.
          const needsXCheck = h1.x < minX || h1.x > maxX || h2.x < minX || h2.x > maxX;
          const needsYCheck = h1.y < minY || h1.y > maxY || h2.y < minY || h2.y > maxY;

          if (needsXCheck) {
            const extremaX = this.computeBezierExtrema1D(v1.x, h1.x, h2.x, v2.x);
            for (const x of extremaX) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
          }

          if (needsYCheck) {
            const extremaY = this.computeBezierExtrema1D(v1.y, h1.y, h2.y, v2.y);
            for (const y of extremaY) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
      }
    }

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

  /**
   * Computes the axis-aligned bounding box bounding an element (including Bézier curve extrema).
   */
  public static getBoundingBox(element: VectorElement): BoundingBox | null {
    if (element.tagName === 'g' && element.children && element.children.length > 0) {
      return this.getGroupBoundingBox(element.children);
    }
    if (element.tagName === 'image') {
      if (element.vertices && element.vertices.length > 0) {
        return this.getPathBoundingBox(element.vertices as PathVertex[], false);
      }
      const x = parseFloat(element.attributes.x || '0');
      const y = parseFloat(element.attributes.y || '0');
      const w = Math.max(1, parseFloat(element.attributes.width || '100'));
      const h = Math.max(1, parseFloat(element.attributes.height || '100'));
      return {
        x,
        y,
        width: w,
        height: h,
        cx: x + w / 2,
        cy: y + h / 2,
      };
    }
    if (!element.vertices || element.vertices.length === 0) return null;
    const isClosed = element.isClosed !== false;
    return this.getPathBoundingBox(element.vertices as PathVertex[], isClosed);
  }

  /**
   * Computes the bounding box of an arbitrary list of 2D points or path vertices.
   */
  public static getVerticesBoundingBox(vertices: { x: number; y: number }[]): BoundingBox | null {
    if (!vertices || vertices.length === 0) return null;
    return this.getPathBoundingBox(vertices as PathVertex[], true);
  }

  /**
   * Computes selection bounding box with zero-clearance or specified padding.
   */
  public static getSelectionBoundingBox(element: VectorElement, padding: number = 0): BoundingBox | null {
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

  /**
   * Computes composite group bounding box encompassing multiple vector elements.
   */
  public static getGroupBoundingBox(elements: VectorElement[]): BoundingBox | null {
    if (!elements || elements.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((el) => {
      const box = this.getBoundingBox(el);
      if (box) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }
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

  /**
   * Computes composite group selection bounding box with padding (tight zero-clearance by default).
   */
  public static getGroupSelectionBoundingBox(elements: VectorElement[], padding: number = 0): BoundingBox | null {
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
}
