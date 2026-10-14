import { Point, VectorElement } from '../VectorModel.js';
import { GuideLine } from './GuideManager.js';
import { EdgeSnappingService } from './EdgeSnappingService.js';

export interface CurveSegment {
  type: 'linear' | 'cubic';
  p0: Point;
  p1?: Point;
  p2?: Point;
  p3: Point;
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * ARCHITECTURAL RATIONALE: Universal Intersection Snapping Service (IntersectionSnappingService)
 *
 * 1. Scope & Capabilities:
 *    Detects all geometric crossing points between:
 *    - Path × Path (Line × Line, Line × Bézier, Bézier × Bézier)
 *    - Path × Ruler Guide Line (Line × Guide, Bézier × Guide)
 *    - Ruler Guide × Ruler Guide (Guide × Guide)
 *
 * 2. Mathematical Methods:
 *    - Analytical 2D determinant solution for linear intersections (Line × Line, Line × Guide, Guide × Guide).
 *    - Alternating Orthogonal Projection Fixed-Point algorithm (`meeting`) for Cubic Bézier intersections
 *      with logarithmic convergence O(log(1/ε)) capped strictly at 32 iterations.
 *
 * 3. Canonical Hierarchy Compliance:
 *    Anchor / Vertex ('node') > Intersection ('intersection') > Edge / Contour ('edge').
 */
export class IntersectionSnappingService {
  /**
   * Extracts linear and cubic Bézier segments with bounding boxes from a vector element.
   */
  public static extractSegments(el: VectorElement): CurveSegment[] {
    const segments: CurveSegment[] = [];

    const isEllipse =
      el.tagName === 'circle' ||
      el.tagName === 'ellipse' ||
      el.shapeType === 'circle' ||
      el.shapeType === 'ellipse' ||
      el.attributes['data-primitive'] === 'ellipse' ||
      el.attributes['data-primitive'] === 'circle';

    if (isEllipse) {
      const cx = parseFloat(el.attributes.cx || '0');
      const cy = parseFloat(el.attributes.cy || '0');
      const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
      const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
      const kappa = 0.5522847498307936;
      const ox = rx * kappa;
      const oy = ry * kappa;

      // 4 canonical cubic Bézier quadrants approximating ellipse
      // Quadrant 1: Right -> Bottom
      segments.push(this.createCubicSegment(
        { x: cx + rx, y: cy },
        { x: cx + rx, y: cy + oy },
        { x: cx + ox, y: cy + ry },
        { x: cx, y: cy + ry }
      ));
      // Quadrant 2: Bottom -> Left
      segments.push(this.createCubicSegment(
        { x: cx, y: cy + ry },
        { x: cx - ox, y: cy + ry },
        { x: cx - rx, y: cy + oy },
        { x: cx - rx, y: cy }
      ));
      // Quadrant 3: Left -> Top
      segments.push(this.createCubicSegment(
        { x: cx - rx, y: cy },
        { x: cx - rx, y: cy - oy },
        { x: cx - ox, y: cy - ry },
        { x: cx, y: cy - ry }
      ));
      // Quadrant 4: Top -> Right
      segments.push(this.createCubicSegment(
        { x: cx, y: cy - ry },
        { x: cx + ox, y: cy - ry },
        { x: cx + rx, y: cy - oy },
        { x: cx + rx, y: cy }
      ));
      return segments;
    }

    if (el.vertices && el.vertices.length > 1) {
      const count = el.vertices.length;
      const isClosed =
        el.isClosed !== false &&
        (el.tagName === 'polygon' || el.tagName === 'rect' || el.isClosed === true);
      const segCount = isClosed ? count : count - 1;

      for (let i = 0; i < segCount; i++) {
        const v1 = el.vertices[i];
        const v2 = el.vertices[(i + 1) % count];

        if (v1.handleOut || v2.handleIn) {
          const p0 = { x: v1.x, y: v1.y };
          const p1 = v1.handleOut ? { x: v1.handleOut.x, y: v1.handleOut.y } : p0;
          const p3 = { x: v2.x, y: v2.y };
          const p2 = v2.handleIn ? { x: v2.handleIn.x, y: v2.handleIn.y } : p3;
          segments.push(this.createCubicSegment(p0, p1, p2, p3));
        } else {
          const p0 = { x: v1.x, y: v1.y };
          const p3 = { x: v2.x, y: v2.y };
          segments.push({
            type: 'linear',
            p0,
            p3,
            box: {
              minX: Math.min(p0.x, p3.x),
              minY: Math.min(p0.y, p3.y),
              maxX: Math.max(p0.x, p3.x),
              maxY: Math.max(p0.y, p3.y),
            },
          });
        }
      }
    }

    return segments;
  }

  private static createCubicSegment(p0: Point, p1: Point, p2: Point, p3: Point): CurveSegment {
    return {
      type: 'cubic',
      p0,
      p1,
      p2,
      p3,
      box: {
        minX: Math.min(p0.x, p1.x, p2.x, p3.x),
        minY: Math.min(p0.y, p1.y, p2.y, p3.y),
        maxX: Math.max(p0.x, p1.x, p2.x, p3.x),
        maxY: Math.max(p0.y, p1.y, p2.y, p3.y),
      },
    };
  }

  /**
   * Computes analytical intersection between two 2D line segments.
   */
  public static intersectSegments(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
    const dax = a2.x - a1.x;
    const day = a2.y - a1.y;
    const dbx = b2.x - b1.x;
    const dby = b2.y - b1.y;

    const det = dax * dby - day * dbx;
    if (Math.abs(det) < 1e-6) return null;

    const dx = b1.x - a1.x;
    const dy = b1.y - a1.y;

    const t = (dx * dby - dy * dbx) / det;
    const u = (dx * day - dy * dax) / det;

    const eps = 1e-4;
    if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
      const clampedT = Math.max(0, Math.min(1, t));
      return {
        x: a1.x + clampedT * dax,
        y: a1.y + clampedT * day,
      };
    }

    return null;
  }

  /**
   * Computes unit normal vector for horizontal, vertical, or angled guideline.
   */
  public static getGuideNormal(g: GuideLine): { nx: number; ny: number } {
    if (g.orientation === 'horizontal') {
      return { nx: 0, ny: 1 };
    }
    if (g.orientation === 'vertical') {
      return { nx: 1, ny: 0 };
    }
    const rad = ((g.angle || 0) * Math.PI) / 180;
    return { nx: -Math.sin(rad), ny: Math.cos(rad) };
  }

  /**
   * Computes analytical intersection between an infinite guideline and a line segment.
   */
  public static intersectGuideAndSegment(g: GuideLine, s1: Point, s2: Point): Point | null {
    const { nx, ny } = this.getGuideNormal(g);
    const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : 0);
    const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : 0);

    const d1 = nx * (s1.x - px) + ny * (s1.y - py);
    const d2 = nx * (s2.x - px) + ny * (s2.y - py);

    if (d1 * d2 > 0) return null;
    if (Math.abs(d1 - d2) < 1e-6) return null;

    const t = d1 / (d1 - d2);
    const clampedT = Math.max(0, Math.min(1, t));
    return {
      x: s1.x + clampedT * (s2.x - s1.x),
      y: s1.y + clampedT * (s2.y - s1.y),
    };
  }

  /**
   * Computes analytical intersection between two infinite guidelines.
   */
  public static intersectGuides(g1: GuideLine, g2: GuideLine): Point | null {
    const { nx: n1x, ny: n1y } = this.getGuideNormal(g1);
    const { nx: n2x, ny: n2y } = this.getGuideNormal(g2);

    const g1px = g1.pivotX ?? (g1.orientation === 'vertical' ? g1.position : 0);
    const g1py = g1.pivotY ?? (g1.orientation === 'horizontal' ? g1.position : 0);
    const g2px = g2.pivotX ?? (g2.orientation === 'vertical' ? g2.position : 0);
    const g2py = g2.pivotY ?? (g2.orientation === 'horizontal' ? g2.position : 0);

    const d1 = n1x * g1px + n1y * g1py;
    const d2 = n2x * g2px + n2y * g2py;

    const det = n1x * n2y - n1y * n2x;
    if (Math.abs(det) < 1e-4) return null;

    return {
      x: (d1 * n2y - d2 * n1y) / det,
      y: (n1x * d2 - n2x * d1) / det,
    };
  }

  /**
   * Alternating Orthogonal Projection Fixed-Point algorithm (`meeting`) for Cubic Bézier curves.
   * Converges with logarithmic rate O(log(1/ε)), capped strictly at 32 iterations.
   */
  public static intersectBezierMeeting(
    p0: Point, p1: Point, p2: Point, p3: Point,
    q0: Point, q1: Point, q2: Point, q3: Point,
    queryPt: Point,
    threshold: number
  ): Point | null {
    let pA = EdgeSnappingService.projectPointToCubicBezier(queryPt, p0, p1, p2, p3);

    for (let iter = 0; iter < 32; iter++) {
      const qB = EdgeSnappingService.projectPointToCubicBezier(pA, q0, q1, q2, q3);
      const nextPA = EdgeSnappingService.projectPointToCubicBezier(qB, p0, p1, p2, p3);

      const dist = Math.hypot(pA.x - qB.x, pA.y - qB.y);
      if (dist < 1.5) {
        const mid = { x: (pA.x + qB.x) / 2, y: (pA.y + qB.y) / 2 };
        if (Math.hypot(queryPt.x - mid.x, queryPt.y - mid.y) <= threshold) {
          return mid;
        }
        return null;
      }

      if (Math.hypot(nextPA.x - pA.x, nextPA.y - pA.y) < 0.05) {
        if (dist <= 2.5) {
          const mid = { x: (pA.x + qB.x) / 2, y: (pA.y + qB.y) / 2 };
          if (Math.hypot(queryPt.x - mid.x, queryPt.y - mid.y) <= threshold) {
            return mid;
          }
        }
        break;
      }

      pA = nextPA;
    }

    return null;
  }

  /**
   * Alternating Orthogonal Projection algorithm for Line Segment × Cubic Bézier curve.
   */
  public static intersectSegmentAndBezier(
    s1: Point, s2: Point,
    p0: Point, p1: Point, p2: Point, p3: Point,
    queryPt: Point,
    threshold: number
  ): Point | null {
    let pC = EdgeSnappingService.projectPointToCubicBezier(queryPt, p0, p1, p2, p3);

    for (let iter = 0; iter < 32; iter++) {
      const qS = EdgeSnappingService.projectPointToSegment(pC, s1, s2);
      const nextPC = EdgeSnappingService.projectPointToCubicBezier(qS, p0, p1, p2, p3);

      const dist = Math.hypot(pC.x - qS.x, pC.y - qS.y);
      if (dist < 1.5) {
        const mid = { x: (pC.x + qS.x) / 2, y: (pC.y + qS.y) / 2 };
        if (Math.hypot(queryPt.x - mid.x, queryPt.y - mid.y) <= threshold) {
          return mid;
        }
        return null;
      }

      if (Math.hypot(nextPC.x - pC.x, nextPC.y - pC.y) < 0.05) {
        if (dist <= 2.5) {
          const mid = { x: (pC.x + qS.x) / 2, y: (pC.y + qS.y) / 2 };
          if (Math.hypot(queryPt.x - mid.x, queryPt.y - mid.y) <= threshold) {
            return mid;
          }
        }
        break;
      }

      pC = nextPC;
    }

    return null;
  }

  /**
   * Computes intersection between an infinite guideline and a Cubic Bézier curve.
   */
  public static intersectGuideAndBezier(
    g: GuideLine,
    p0: Point, p1: Point, p2: Point, p3: Point,
    queryPt: Point,
    threshold: number
  ): Point | null {
    const { nx, ny } = this.getGuideNormal(g);
    const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : 0);
    const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : 0);

    // Fast reject if all 4 control points lie strictly on one side of the line
    const d0 = nx * (p0.x - px) + ny * (p0.y - py);
    const d1 = nx * (p1.x - px) + ny * (p1.y - py);
    const d2 = nx * (p2.x - px) + ny * (p2.y - py);
    const d3 = nx * (p3.x - px) + ny * (p3.y - py);

    if ((d0 > 0 && d1 > 0 && d2 > 0 && d3 > 0) || (d0 < 0 && d1 < 0 && d2 < 0 && d3 < 0)) {
      return null;
    }

    // Alternating projection onto guideline
    let pC = EdgeSnappingService.projectPointToCubicBezier(queryPt, p0, p1, p2, p3);

    for (let iter = 0; iter < 32; iter++) {
      const proj = nx * (pC.x - px) + ny * (pC.y - py);
      const qG: Point = { x: pC.x - proj * nx, y: pC.y - proj * ny };
      const nextPC = EdgeSnappingService.projectPointToCubicBezier(qG, p0, p1, p2, p3);

      const dist = Math.hypot(pC.x - qG.x, pC.y - qG.y);
      if (dist < 1.5) {
        const mid = { x: (pC.x + qG.x) / 2, y: (pC.y + qG.y) / 2 };
        if (Math.hypot(queryPt.x - mid.x, queryPt.y - mid.y) <= threshold) {
          return mid;
        }
        return null;
      }

      if (Math.hypot(nextPC.x - pC.x, nextPC.y - pC.y) < 0.05) {
        if (dist <= 2.5) {
          const mid = { x: (pC.x + qG.x) / 2, y: (pC.y + qG.y) / 2 };
          if (Math.hypot(queryPt.x - mid.x, queryPt.y - mid.y) <= threshold) {
            return mid;
          }
        }
        break;
      }

      pC = nextPC;
    }

    return null;
  }

  /**
   * Collects all candidate intersections within threshold of `pt`:
   * - Path × Path
   * - Path × Guide
   * - Guide × Guide
   */
  public static collectAllIntersections(
    pt: Point,
    elements: VectorElement[],
    guides: GuideLine[],
    excludeElementIds: string[] = [],
    excludeGuideId?: string,
    threshold: number = 8
  ): Point[] {
    const intersections: Point[] = [];
    const activeGuides = guides.filter((g) => g.visible !== false && g.id !== excludeGuideId);
    const activeElements = elements.filter((el) => !excludeElementIds.includes(el.id));

    // 1. Guide × Guide Intersections
    for (let i = 0; i < activeGuides.length; i++) {
      for (let j = i + 1; j < activeGuides.length; j++) {
        const inter = this.intersectGuides(activeGuides[i], activeGuides[j]);
        if (inter && Math.hypot(pt.x - inter.x, pt.y - inter.y) <= threshold) {
          intersections.push(inter);
        }
      }
    }

    // Pre-extract segments of active elements that are near pt
    const elementSegments: { elId: string; segments: CurveSegment[] }[] = [];
    for (const el of activeElements) {
      const segs = this.extractSegments(el).filter((s) => {
        return (
          pt.x >= s.box.minX - threshold &&
          pt.x <= s.box.maxX + threshold &&
          pt.y >= s.box.minY - threshold &&
          pt.y <= s.box.maxY + threshold
        );
      });
      if (segs.length > 0) {
        elementSegments.push({ elId: el.id, segments: segs });
      }
    }

    // 2. Guide × Path Intersections
    for (const g of activeGuides) {
      for (const es of elementSegments) {
        for (const seg of es.segments) {
          if (seg.type === 'linear') {
            const inter = this.intersectGuideAndSegment(g, seg.p0, seg.p3);
            if (inter && Math.hypot(pt.x - inter.x, pt.y - inter.y) <= threshold) {
              intersections.push(inter);
            }
          } else if (seg.type === 'cubic') {
            const inter = this.intersectGuideAndBezier(g, seg.p0, seg.p1!, seg.p2!, seg.p3, pt, threshold);
            if (inter) {
              intersections.push(inter);
            }
          }
        }
      }
    }

    // 3. Path × Path Intersections
    for (let i = 0; i < elementSegments.length; i++) {
      for (let j = i; j < elementSegments.length; j++) {
        const esA = elementSegments[i];
        const esB = elementSegments[j];
        const isSameElement = i === j;

        for (let si = 0; si < esA.segments.length; si++) {
          const sjStart = isSameElement ? si + 2 : 0; // skip adjacent segments of same element
          for (let sj = sjStart; sj < esB.segments.length; sj++) {
            const segA = esA.segments[si];
            const segB = esB.segments[sj];

            // Bounding box overlap filter
            if (
              segA.box.maxX < segB.box.minX - threshold ||
              segA.box.minX > segB.box.maxX + threshold ||
              segA.box.maxY < segB.box.minY - threshold ||
              segA.box.minY > segB.box.maxY + threshold
            ) {
              continue;
            }

            if (segA.type === 'linear' && segB.type === 'linear') {
              const inter = this.intersectSegments(segA.p0, segA.p3, segB.p0, segB.p3);
              if (inter && Math.hypot(pt.x - inter.x, pt.y - inter.y) <= threshold) {
                intersections.push(inter);
              }
            } else if (segA.type === 'cubic' && segB.type === 'cubic') {
              const inter = this.intersectBezierMeeting(
                segA.p0, segA.p1!, segA.p2!, segA.p3,
                segB.p0, segB.p1!, segB.p2!, segB.p3,
                pt,
                threshold
              );
              if (inter) {
                intersections.push(inter);
              }
            } else if (segA.type === 'linear' && segB.type === 'cubic') {
              const inter = this.intersectSegmentAndBezier(
                segA.p0, segA.p3,
                segB.p0, segB.p1!, segB.p2!, segB.p3,
                pt,
                threshold
              );
              if (inter) {
                intersections.push(inter);
              }
            } else if (segA.type === 'cubic' && segB.type === 'linear') {
              const inter = this.intersectSegmentAndBezier(
                segB.p0, segB.p3,
                segA.p0, segA.p1!, segA.p2!, segA.p3,
                pt,
                threshold
              );
              if (inter) {
                intersections.push(inter);
              }
            }
          }
        }
      }
    }

    // Deduplicate intersection points within 0.1px
    const unique: Point[] = [];
    for (const ip of intersections) {
      if (!unique.some((u) => Math.hypot(u.x - ip.x, u.y - ip.y) < 0.1)) {
        unique.push(ip);
      }
    }

    return unique;
  }

  /**
   * Finds the closest universal intersection to `pt` within `threshold`.
   */
  public static findClosestIntersection(
    pt: Point,
    elements: VectorElement[],
    guides: GuideLine[],
    excludeElementIds: string[] = [],
    excludeGuideId?: string,
    threshold: number = 8
  ): Point | null {
    const inters = this.collectAllIntersections(
      pt,
      elements,
      guides,
      excludeElementIds,
      excludeGuideId,
      threshold
    );

    if (inters.length === 0) return null;

    let bestDist = Infinity;
    let bestInter: Point | null = null;
    for (const ip of inters) {
      const d = Math.hypot(pt.x - ip.x, pt.y - ip.y);
      if (d < bestDist) {
        bestDist = d;
        bestInter = ip;
      }
    }

    return bestInter;
  }
}
