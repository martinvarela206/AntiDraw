import { VectorElement } from '../VectorModel.js';

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
   * Computes the axis-aligned bounding box bounding all outermost anchor vertices of an element.
   */
  public static getBoundingBox(element: VectorElement): BoundingBox | null {
    if (element.tagName === 'g' && element.children && element.children.length > 0) {
      return this.getGroupBoundingBox(element.children);
    }
    if (element.tagName === 'image') {
      if (element.vertices && element.vertices.length > 0) {
        return this.getVerticesBoundingBox(element.vertices);
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
    return this.getVerticesBoundingBox(element.vertices);
  }

  /**
   * Computes the bounding box of an arbitrary list of 2D points or vertices.
   */
  public static getVerticesBoundingBox(vertices: { x: number; y: number }[]): BoundingBox | null {
    if (!vertices || vertices.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
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
