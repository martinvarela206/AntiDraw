import { MultiPolygon, Pair, Ring } from 'polygon-clipping';
import { VectorElement, PathVertex, VectorModel, Point } from '../VectorModel.js';
import { SchneiderFit, CubicBezier } from '../operations/booleans/SchneiderFit.js';

/**
 * ARCHITECTURAL RATIONALE: Shared Polygon & Bézier Utility Functions
 *
 * Provides shared sampling, conversion, and sanitization functions used across
 * constructive area geometry (boolean operations) and stroke outline extrusion.
 * Integrates Schneider cubic Bézier curve fitting to prevent polygonal fragmentation.
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
   * Fits a sampled polygon ring into smooth cubic Bézier curves (SchneiderFit) while
   * preserving sharp corners intact.
   */
  public static ringToFittedVertices(cleanRing: Pair[], errorTolerance: number = 1.5): PathVertex[] {
    const n = cleanRing.length;
    if (n < 3) return [];

    if (n <= 4) {
      return cleanRing.map((pt, idx) => ({
        id: `v_${Date.now().toString(36)}_${idx}`,
        x: Math.round(pt[0] * 100) / 100,
        y: Math.round(pt[1] * 100) / 100,
        command: idx === 0 ? 'M' : 'L',
        nodeType: 'sharp',
      }));
    }

    // 1. Detect sharp corner indices where deflection angle exceeds threshold (~32 degrees, cos < 0.85)
    const cornerIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      const prev = cleanRing[(i - 1 + n) % n];
      const curr = cleanRing[i];
      const next = cleanRing[(i + 1) % n];

      const v1x = curr[0] - prev[0];
      const v1y = curr[1] - prev[1];
      const v2x = next[0] - curr[0];
      const v2y = next[1] - curr[1];

      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);

      if (len1 > 1e-4 && len2 > 1e-4) {
        const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
        if (dot < 0.85) {
          cornerIndices.push(i);
        }
      }
    }

    const isChainStraight = (chain: Pair[]): boolean => {
      if (chain.length <= 2) return true;
      const pStart = chain[0];
      const pEnd = chain[chain.length - 1];
      const dx = pEnd[0] - pStart[0];
      const dy = pEnd[1] - pStart[1];
      const lineLen = Math.hypot(dx, dy);
      if (lineLen < 1e-4) return true;

      for (let k = 1; k < chain.length - 1; k++) {
        const pt = chain[k];
        const dist = Math.abs(dy * pt[0] - dx * pt[1] + pEnd[0] * pStart[1] - pEnd[1] * pStart[0]) / lineLen;
        if (dist > 0.8) return false;
      }
      return true;
    };

    const assembledVertices: PathVertex[] = [];

    const appendCurves = (curves: CubicBezier[], isChainStart: boolean) => {
      curves.forEach((c, cIdx) => {
        if (cIdx === 0 && isChainStart) {
          assembledVertices.push({
            id: `v_${Date.now().toString(36)}_${assembledVertices.length}`,
            x: Math.round(c.p0.x * 100) / 100,
            y: Math.round(c.p0.y * 100) / 100,
            handleOut: {
              x: Math.round(c.p1.x * 100) / 100,
              y: Math.round(c.p1.y * 100) / 100,
            },
            command: assembledVertices.length === 0 ? 'M' : 'L',
            nodeType: 'smooth',
          });
        } else if (assembledVertices.length > 0) {
          const prevV = assembledVertices[assembledVertices.length - 1];
          prevV.handleOut = {
            x: Math.round(c.p1.x * 100) / 100,
            y: Math.round(c.p1.y * 100) / 100,
          };
          if (prevV.nodeType !== 'sharp') {
            prevV.nodeType = 'smooth';
          }
        }

        assembledVertices.push({
          id: `v_${Date.now().toString(36)}_${assembledVertices.length}`,
          x: Math.round(c.p3.x * 100) / 100,
          y: Math.round(c.p3.y * 100) / 100,
          handleIn: {
            x: Math.round(c.p2.x * 100) / 100,
            y: Math.round(c.p2.y * 100) / 100,
          },
          command: 'C',
          nodeType: 'smooth',
        });
      });
    };

    if (cornerIndices.length === 0) {
      const pts: Point[] = cleanRing.map((p) => ({ x: p[0], y: p[1] }));
      const fitted = SchneiderFit.fitCurve(pts, errorTolerance);
      if (fitted.length > 0) {
        appendCurves(fitted, true);
        return assembledVertices;
      }
    }

    const numCorners = cornerIndices.length;
    for (let c = 0; c < numCorners; c++) {
      const startIdx = cornerIndices[c];
      const endIdx = cornerIndices[(c + 1) % numCorners];

      const chain: Pair[] = [];
      let curr = startIdx;
      while (true) {
        chain.push(cleanRing[curr]);
        if (curr === endIdx) break;
        curr = (curr + 1) % n;
      }

      const isStart = c === 0;

      if (isChainStraight(chain)) {
        if (isStart) {
          assembledVertices.push({
            id: `v_${Date.now().toString(36)}_${assembledVertices.length}`,
            x: Math.round(chain[0][0] * 100) / 100,
            y: Math.round(chain[0][1] * 100) / 100,
            command: 'M',
            nodeType: 'sharp',
          });
        }
        assembledVertices.push({
          id: `v_${Date.now().toString(36)}_${assembledVertices.length}`,
          x: Math.round(chain[chain.length - 1][0] * 100) / 100,
          y: Math.round(chain[chain.length - 1][1] * 100) / 100,
          command: 'L',
          nodeType: 'sharp',
        });
      } else {
        const pts: Point[] = chain.map((p) => ({ x: p[0], y: p[1] }));
        const curves = SchneiderFit.fitCurve(pts, errorTolerance);
        if (curves.length > 0) {
          appendCurves(curves, isStart);
        } else {
          if (isStart) {
            assembledVertices.push({
              id: `v_${Date.now().toString(36)}_${assembledVertices.length}`,
              x: Math.round(chain[0][0] * 100) / 100,
              y: Math.round(chain[0][1] * 100) / 100,
              command: 'M',
              nodeType: 'sharp',
            });
          }
          assembledVertices.push({
            id: `v_${Date.now().toString(36)}_${assembledVertices.length}`,
            x: Math.round(chain[chain.length - 1][0] * 100) / 100,
            y: Math.round(chain[chain.length - 1][1] * 100) / 100,
            command: 'L',
            nodeType: 'sharp',
          });
        }
      }
    }

    return assembledVertices;
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

        // Fit curve using Schneider cubic Bézier fitting
        const fittedRingVerts = this.ringToFittedVertices(cleanRing, 1.5);
        if (fittedRingVerts.length > 0) {
          // Ensure first vertex of each ring is 'M'
          fittedRingVerts[0].command = 'M';
          fittedRingVerts.forEach((v) => vertices.push(v));
        } else {
          // Fallback to direct linear sampling if fitting yielded empty
          cleanRing.forEach((pt, idx) => {
            vertices.push({
              id: `v_${Date.now().toString(36)}_${vertices.length}`,
              x: Math.round(pt[0] * 100) / 100,
              y: Math.round(pt[1] * 100) / 100,
              command: idx === 0 ? 'M' : 'L',
              nodeType: 'sharp',
            });
          });
        }
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
