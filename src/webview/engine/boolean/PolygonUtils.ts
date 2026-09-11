import { MultiPolygon, Pair, Ring } from 'polygon-clipping';
import { VectorElement, PathVertex, VectorModel } from '../VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Shared Polygon & Bézier Utility Functions
 *
 * Provides shared sampling, conversion, and sanitization functions used across
 * constructive area geometry (boolean operations) and stroke outline extrusion.
 */
export class PolygonUtils {
  /**
   * Samples a cubic Bézier curve segment into a discrete sequence of line points.
   */
  public static sampleBezier(
    p1: { x: number; y: number },
    h1: { x: number; y: number },
    h2: { x: number; y: number },
    p2: { x: number; y: number },
    steps: number = 24
  ): Pair[] {
    const pts: Pair[] = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const inv = 1 - t;
      const x =
        inv * inv * inv * p1.x +
        3 * inv * inv * t * h1.x +
        3 * inv * t * t * h2.x +
        t * t * t * p2.x;
      const y =
        inv * inv * inv * p1.y +
        3 * inv * inv * t * h1.y +
        3 * inv * t * t * h2.y +
        t * t * t * p2.y;
      pts.push([x, y]);
    }
    return pts;
  }

  /**
   * Converts a polygon-clipping MultiPolygon back into an AntiDraw VectorElement with vertices and SVG path d.
   */
  public static multiPolygonToElement(
    mp: MultiPolygon,
    id: string,
    baseAttrs: Record<string, string>,
    model: VectorModel
  ): VectorElement | null {
    if (!mp || mp.length === 0) return null;

    const vertices: PathVertex[] = [];

    mp.forEach((polygon) => {
      polygon.forEach((ring) => {
        if (ring.length < 3) return;

        // Simplify consecutive duplicate points
        const cleanRing: Pair[] = [];
        for (let i = 0; i < ring.length; i++) {
          const pt = ring[i];
          if (
            cleanRing.length === 0 ||
            Math.hypot(pt[0] - cleanRing[cleanRing.length - 1][0], pt[1] - cleanRing[cleanRing.length - 1][1]) > 0.05
          ) {
            cleanRing.push(pt);
          }
        }

        // Drop the closing duplicate point for path vertices
        if (cleanRing.length >= 3) {
          const first = cleanRing[0];
          const last = cleanRing[cleanRing.length - 1];
          if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05) {
            cleanRing.pop();
          }
        }

        if (cleanRing.length < 3) return;

        cleanRing.forEach((pt, idx) => {
          vertices.push({
            id: `v_${Date.now().toString(36)}_${vertices.length}`,
            x: Math.round(pt[0] * 100) / 100,
            y: Math.round(pt[1] * 100) / 100,
            command: idx === 0 ? 'M' : 'L',
            nodeType: 'asymmetric',
          });
        });
      });
    });

    if (vertices.length === 0) return null;

    const d = model.compilePathD(vertices, true);
    const attrs: Record<string, string> = {
      ...baseAttrs,
      id,
      d,
      'fill-rule': 'evenodd',
      'data-node-types': vertices.map((v) => v.nodeType).join(','),
      'data-shape': 'path',
      'data-parametric': 'false',
    };

    /**
     * ARCHITECTURAL RATIONALE: Parametric Attribute Purging (FIX-07)
     * Why this exists:
     * When Boolean operations produce a new vector outline from parametric shapes (<rect>, <ellipse>, etc.),
     * copying baseAttrs blindly retains 'x', 'y', 'width', 'height', 'rx', 'ry', 'points', etc.
     * These residual attributes confuse the PropertyPanel and SVG serializer into treating the newly created
     * complex polygon as an unedited primitive, overwriting vertices with axis-aligned bounding boxes.
     * Explicitly deleting shape-specific attributes guarantees that the resulting geometry is treated strictly
     * as an editable freeform <path> (shapeType: 'path', isParametric: false).
     */
    const shapeAttrs = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];
    shapeAttrs.forEach((attr) => delete attrs[attr]);

    /**
     * ARCHITECTURAL RATIONALE: Gradient & Filter Reference Re-Targeting
     * Why this exists:
     * When Boolean operations produce new vector elements (with new IDs), copying
     * baseAttrs blindly leaves `fill="url(#ad-grad-${oldId})"` pointing to a defunct
     * defs ID that will no longer exist once the old element is replaced or removed.
     * Re-targeting to the new element `id` ensures that hardware-accelerated gradients
     * (both linear and radial) and drop/inner shadow filters remain bound and renderable.
     */
    if (attrs['fill'] && attrs['fill'].includes('ad-grad-')) {
      attrs['fill'] = `url(#ad-grad-${id})`;
    }
    if (attrs['filter'] && attrs['filter'].includes('ad-filter-shadow-')) {
      attrs['filter'] = `url(#ad-filter-shadow-${id})`;
    }

    return {
      id,
      tagName: 'path',
      shapeType: 'path',
      isParametric: false,
      attributes: attrs,
      vertices,
      isClosed: true,
    };
  }
}
