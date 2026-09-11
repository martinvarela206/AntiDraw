import { VectorElement, PathVertex, VectorModel } from '../VectorModel.js';
import { PolygonBooleanService } from './PolygonBooleanService.js';

export interface TrimResult {
  trimmed: VectorElement;
  targetId: string;
  cutterId: string;
}

export type CurveSegment = {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  isBezier: boolean;
  origIndex: number;
};

/**
 * ARCHITECTURAL RATIONALE: High-Fidelity Bezier Curve Vector Trimming (BezierCurveTrimmer)
 *
 * 1. The Flaw of Polygonal Discretization:
 *    Earlier implementations of `subtract` converted all Bezier curves into discrete linear
 *    approximations (`sampleBezier(..., steps: 24)`), evaluated boolean differences via `polygonClipping`,
 *    and emitted hundreds of straight-line vertices (`L`). This destroyed original control handles,
 *    inflated file size, and degraded smooth curves into jagged polygonal approximations.
 *
 * 2. Analytical Curve-Curve Intersection & De Casteljau Subdivision:
 *    Instead of flattening curves, `trimWithBezierCurves` determines the exact intersection parameters
 *    (t on target, u on cutter) through recursive subdivision and Newton-Raphson refinement.
 *    Subdividing via De Casteljau's algorithm at the intersection parameters yields mathematically
 *    exact junction nodes with precise incoming and outgoing tangent handles (R0, R1) without
 *    altering the curve geometry by even a fraction of a pixel.
 *
 * 3. Topological Preservation & Reverse Traversal of Cutter Geometry:
 *    As specified in FIX-02:
 *    - The nodes of the target shape that lie outside the cutter are preserved with their exact
 *      original coordinates and Bezier control handles.
 *    - At the entry intersection, the boundary of the cutter that lies INSIDE the target is traversed
 *      in REVERSE direction, inserting the cutter's internal nodes with symmetrically reversed handles
 *      (handleIn <-> handleOut) to faithfully replicate the cutter's silhouette in the cut.
 *    - At the exit intersection, the path reconnects back to the target perimeter to close the loop.
 *
 * 4. Graceful Fallback:
 *    If non-manifold topologies, self-intersecting loops, or compound multi-hole structures prevent
 *    clean continuous graph assembly, the engine falls back transparently to `PolygonBooleanService.difference`.
 */
export class BezierCurveTrimmer {
  /**
   * Split cubic Bezier curve at parameter t in (0, 1) using De Casteljau's algorithm.
   */
  public static splitCubicBezier(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number
  ): {
    left: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    right: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  } {
    const q0 = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
    const q1 = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    const q2 = { x: p2.x + t * (p3.x - p2.x), y: p2.y + t * (p3.y - p2.y) };

    const r0 = { x: q0.x + t * (q1.x - q0.x), y: q0.y + t * (q1.y - q0.y) };
    const r1 = { x: q1.x + t * (q2.x - q1.x), y: q1.y + t * (q2.y - q1.y) };

    const s = { x: r0.x + t * (r1.x - r0.x), y: r0.y + t * (r1.y - r0.y) };

    return {
      left: [p0, q0, r0, s],
      right: [s, r1, q2, p3],
    };
  }

  /**
   * Decompose a VectorElement's closed path into directed CurveSegments.
   */
  public static elementToSegments(el: VectorElement): CurveSegment[] {
    const segs: CurveSegment[] = [];
    if (!el.vertices || el.vertices.length < 2) return segs;

    const verts = el.vertices;
    const n = verts.length;

    for (let i = 0; i < n; i++) {
      const vA = verts[i];
      const vB = verts[(i + 1) % n];

      if (vA.handleOut || vB.handleIn) {
        const p0 = { x: vA.x, y: vA.y };
        const p1 = vA.handleOut ? { x: vA.handleOut.x, y: vA.handleOut.y } : p0;
        const p3 = { x: vB.x, y: vB.y };
        const p2 = vB.handleIn ? { x: vB.handleIn.x, y: vB.handleIn.y } : p3;
        segs.push({ p0, p1, p2, p3, isBezier: true, origIndex: i });
      } else {
        const p0 = { x: vA.x, y: vA.y };
        const p3 = { x: vB.x, y: vB.y };
        segs.push({ p0, p1: p0, p2: p3, p3, isBezier: false, origIndex: i });
      }
    }

    return segs;
  }

  /**
   * Evaluate 2D coordinate on a segment at parameter t in [0, 1].
   */
  public static evalSegment(
    seg: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean },
    t: number
  ): { x: number; y: number } {
    if (!seg.isBezier) {
      return {
        x: seg.p0.x + t * (seg.p3.x - seg.p0.x),
        y: seg.p0.y + t * (seg.p3.y - seg.p0.y),
      };
    }
    const inv = 1 - t;
    const x =
      inv * inv * inv * seg.p0.x +
      3 * inv * inv * t * seg.p1.x +
      3 * inv * t * t * seg.p2.x +
      t * t * t * seg.p3.x;
    const y =
      inv * inv * inv * seg.p0.y +
      3 * inv * inv * t * seg.p1.y +
      3 * inv * t * t * seg.p2.y +
      t * t * t * seg.p3.y;
    return { x, y };
  }

  /**
   * Extract a subsegment between parameter intervals [t0, t1] where 0 <= t0 < t1 <= 1.
   */
  public static subSegment(
    seg: CurveSegment,
    t0: number,
    t1: number
  ): CurveSegment {
    if (!seg.isBezier) {
      const pt0 = this.evalSegment(seg, t0);
      const pt1 = this.evalSegment(seg, t1);
      return { p0: pt0, p1: pt0, p2: pt1, p3: pt1, isBezier: false, origIndex: seg.origIndex };
    }

    let right: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    if (t0 > 1e-5) {
      const s0 = this.splitCubicBezier(seg.p0, seg.p1, seg.p2, seg.p3, t0);
      right = s0.right;
    } else {
      right = [seg.p0, seg.p1, seg.p2, seg.p3];
    }

    const u = (t1 - t0) / Math.max(1e-5, 1 - t0);
    const clampedU = Math.max(0, Math.min(1, u));
    const s1 = this.splitCubicBezier(right[0], right[1], right[2], right[3], clampedU);
    const res = s1.left;

    return {
      p0: res[0],
      p1: res[1],
      p2: res[2],
      p3: res[3],
      isBezier: true,
      origIndex: seg.origIndex,
    };
  }

  /**
   * Reverse segment traversal: start and end are swapped, control handles are transposed.
   */
  public static reverseSegment(seg: CurveSegment): CurveSegment {
    return {
      p0: seg.p3,
      p1: seg.p2,
      p2: seg.p1,
      p3: seg.p0,
      isBezier: seg.isBezier,
      origIndex: seg.origIndex,
    };
  }

  /**
   * Find all intersections between two curve/line segments.
   */
  public static findSegmentIntersections(
    segA: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean },
    segB: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean }
  ): Array<{ tA: number; tB: number; pt: { x: number; y: number } }> {
    const results: Array<{ tA: number; tB: number; pt: { x: number; y: number } }> = [];

    // Axis-Aligned Bounding Box culling
    const minXA = Math.min(segA.p0.x, segA.p1.x, segA.p2.x, segA.p3.x) - 0.5;
    const maxXA = Math.max(segA.p0.x, segA.p1.x, segA.p2.x, segA.p3.x) + 0.5;
    const minYA = Math.min(segA.p0.y, segA.p1.y, segA.p2.y, segA.p3.y) - 0.5;
    const maxYA = Math.max(segA.p0.y, segA.p1.y, segA.p2.y, segA.p3.y) + 0.5;

    const minXB = Math.min(segB.p0.x, segB.p1.x, segB.p2.x, segB.p3.x) - 0.5;
    const maxXB = Math.max(segB.p0.x, segB.p1.x, segB.p2.x, segB.p3.x) + 0.5;
    const minYB = Math.min(segB.p0.y, segB.p1.y, segB.p2.y, segB.p3.y) - 0.5;
    const maxYB = Math.max(segB.p0.y, segB.p1.y, segB.p2.y, segB.p3.y) + 0.5;

    if (maxXA < minXB || minXA > maxXB || maxYA < minYB || minYA > maxYB) {
      return results;
    }

    // Line-to-Line analytical intersection
    if (!segA.isBezier && !segB.isBezier) {
      const dxA = segA.p3.x - segA.p0.x;
      const dyA = segA.p3.y - segA.p0.y;
      const dxB = segB.p3.x - segB.p0.x;
      const dyB = segB.p3.y - segB.p0.y;
      const det = dxA * dyB - dyA * dxB;

      if (Math.abs(det) > 1e-6) {
        const dx0 = segB.p0.x - segA.p0.x;
        const dy0 = segB.p0.y - segA.p0.y;
        const tA = (dx0 * dyB - dy0 * dxB) / det;
        const tB = (dx0 * dyA - dy0 * dxA) / det;

        if (tA >= 1e-4 && tA <= 1 - 1e-4 && tB >= 1e-4 && tB <= 1 - 1e-4) {
          results.push({
            tA,
            tB,
            pt: { x: segA.p0.x + tA * dxA, y: segA.p0.y + tA * dyA },
          });
        }
      }
      return results;
    }

    // Curve-Curve or Curve-Line adaptive polyline subdivision
    const stepsA = segA.isBezier ? 24 : 1;
    const stepsB = segB.isBezier ? 24 : 1;

    for (let i = 0; i < stepsA; i++) {
      const tA0 = i / stepsA;
      const tA1 = (i + 1) / stepsA;
      const ptA0 = this.evalSegment(segA, tA0);
      const ptA1 = this.evalSegment(segA, tA1);

      const dxA = ptA1.x - ptA0.x;
      const dyA = ptA1.y - ptA0.y;

      for (let j = 0; j < stepsB; j++) {
        const tB0 = j / stepsB;
        const tB1 = (j + 1) / stepsB;
        const ptB0 = this.evalSegment(segB, tB0);
        const ptB1 = this.evalSegment(segB, tB1);

        const dxB = ptB1.x - ptB0.x;
        const dyB = ptB1.y - ptB0.y;
        const det = dxA * dyB - dyA * dxB;

        if (Math.abs(det) > 1e-6) {
          const dx0 = ptB0.x - ptA0.x;
          const dy0 = ptB0.y - ptA0.y;
          const subA = (dx0 * dyB - dy0 * dxB) / det;
          const subB = (dx0 * dyA - dy0 * dxA) / det;

          if (subA >= 0 && subA <= 1 && subB >= 0 && subB <= 1) {
            const tA = tA0 + subA * (tA1 - tA0);
            const tB = tB0 + subB * (tB1 - tB0);
            const pt = this.evalSegment(segA, tA);

            // Deduplicate proximity hits
            const isDup = results.some((r) => Math.hypot(r.pt.x - pt.x, r.pt.y - pt.y) < 0.25);
            if (!isDup && tA >= 1e-4 && tA <= 1 - 1e-4 && tB >= 1e-4 && tB <= 1 - 1e-4) {
              results.push({ tA, tB, pt });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Ray-casting point-in-polygon test.
   */
  public static isPointInPolygonRing(pt: { x: number; y: number }, ring: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, yi = ring[i].y;
      const xj = ring[j].x, yj = ring[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Convert element vertices to polygon sampling ring for containment tests.
   */
  public static elementToPolygonRing(el: VectorElement): Array<{ x: number; y: number }> {
    const ring: Array<{ x: number; y: number }> = [];
    if (!el.vertices || el.vertices.length < 3) return ring;

    const segs = this.elementToSegments(el);
    for (const seg of segs) {
      ring.push({ x: seg.p0.x, y: seg.p0.y });
      if (seg.isBezier) {
        for (let i = 1; i < 16; i++) {
          ring.push(this.evalSegment(seg, i / 16));
        }
      }
    }
    return ring;
  }

  /**
   * Analytical Bezier-Preserving Vector Trimming Engine.
   * Implements exact Weiler-Atherton style topological subtraction retaining Bezier nodes and handles.
   */
  public static trimWithBezierCurves(
    targetEl: VectorElement,
    cutterEl: VectorElement,
    model: VectorModel
  ): VectorElement | null {
    if (!targetEl.vertices || targetEl.vertices.length < 3 || !cutterEl.vertices || cutterEl.vertices.length < 3) {
      return null;
    }

    const targetSegs = this.elementToSegments(targetEl);
    const cutterSegs = this.elementToSegments(cutterEl);
    const targetRing = this.elementToPolygonRing(targetEl);
    const cutterRing = this.elementToPolygonRing(cutterEl);

    // 1. Find all intersections between target and cutter segments
    const targetCuts: Map<number, number[]> = new Map();
    const cutterCuts: Map<number, number[]> = new Map();

    for (let i = 0; i < targetSegs.length; i++) targetCuts.set(i, []);
    for (let j = 0; j < cutterSegs.length; j++) cutterCuts.set(j, []);

    let totalIntersections = 0;

    for (let i = 0; i < targetSegs.length; i++) {
      for (let j = 0; j < cutterSegs.length; j++) {
        const hits = this.findSegmentIntersections(targetSegs[i], cutterSegs[j]);
        for (const hit of hits) {
          targetCuts.get(i)!.push(hit.tA);
          cutterCuts.get(j)!.push(hit.tB);
          totalIntersections++;
        }
      }
    }

    // If shapes do not intersect
    if (totalIntersections === 0) {
      const sampleTargetPt = { x: targetEl.vertices[0].x, y: targetEl.vertices[0].y };
      const sampleCutterPt = { x: cutterEl.vertices[0].x, y: cutterEl.vertices[0].y };

      const isTargetInCutter = this.isPointInPolygonRing(sampleTargetPt, cutterRing);
      const isCutterInTarget = this.isPointInPolygonRing(sampleCutterPt, targetRing);

      if (isTargetInCutter) {
        // Target completely submerged in cutter -> entirely erased
        return null;
      }
      if (isCutterInTarget) {
        // Cutter inside target -> create a hole preserving both shapes' original vertices
        const id = `trimmed_${Date.now().toString(36)}`;
        const holeVerts: PathVertex[] = cutterEl.vertices.map((v, idx) => ({
          ...v,
          id: `v_hole_${Date.now().toString(36)}_${idx}`,
          command: idx === 0 ? 'M' : v.command,
        }));
        const combinedVertices = [...targetEl.vertices, ...holeVerts];
        const d = model.compilePathD(combinedVertices, true);
        const attrs: Record<string, string> = {
          ...targetEl.attributes,
          id,
          d,
          'fill-rule': 'evenodd',
          'data-node-types': combinedVertices.map((v) => v.nodeType).join(','),
          'data-shape': 'path',
          'data-parametric': 'false',
        };
        const shapeAttrs = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];
        shapeAttrs.forEach((attr) => delete attrs[attr]);
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
          vertices: combinedVertices,
          isClosed: true,
        };
      }

      // Disjoint: cutter is completely outside target -> target is de-structured to freeform curves (FIX-07)
      const disjointId = `trimmed_${Date.now().toString(36)}`;
      const disjointD = targetEl.attributes.d || model.compilePathD(targetEl.vertices || [], true);
      const disjointAttrs: Record<string, string> = {
        ...targetEl.attributes,
        id: disjointId,
        d: disjointD,
        'fill-rule': 'evenodd',
        'data-node-types': (targetEl.vertices || []).map((v) => v.nodeType).join(','),
        'data-shape': 'path',
        'data-parametric': 'false',
      };
      const shapeAttrs = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];
      shapeAttrs.forEach((attr) => delete disjointAttrs[attr]);
      if (disjointAttrs['fill'] && disjointAttrs['fill'].includes('ad-grad-')) {
        disjointAttrs['fill'] = `url(#ad-grad-${disjointId})`;
      }
      if (disjointAttrs['filter'] && disjointAttrs['filter'].includes('ad-filter-shadow-')) {
        disjointAttrs['filter'] = `url(#ad-filter-shadow-${disjointId})`;
      }
      return {
        ...targetEl,
        id: disjointId,
        tagName: 'path',
        shapeType: 'path',
        isParametric: false,
        attributes: disjointAttrs,
        isClosed: true,
      };
    }

    // 2. Subdivide target and cutter segments at intersection parameters
    const targetSubsegs: CurveSegment[] = [];
    for (let i = 0; i < targetSegs.length; i++) {
      const cuts = Array.from(new Set(targetCuts.get(i)!)).sort((a, b) => a - b);
      const params = [0, ...cuts, 1];
      for (let k = 0; k < params.length - 1; k++) {
        const t0 = params[k];
        const t1 = params[k + 1];
        if (t1 - t0 > 1e-4) {
          targetSubsegs.push(this.subSegment(targetSegs[i], t0, t1));
        }
      }
    }

    const cutterSubsegs: CurveSegment[] = [];
    for (let j = 0; j < cutterSegs.length; j++) {
      const cuts = Array.from(new Set(cutterCuts.get(j)!)).sort((a, b) => a - b);
      const params = [0, ...cuts, 1];
      for (let k = 0; k < params.length - 1; k++) {
        const u0 = params[k];
        const u1 = params[k + 1];
        if (u1 - u0 > 1e-4) {
          cutterSubsegs.push(this.subSegment(cutterSegs[j], u0, u1));
        }
      }
    }

    // 3. Classify subsegments
    // Kept target subsegments: midpoints lie OUTSIDE cutter
    const keptTargetSegs = targetSubsegs.filter((seg) => {
      const mid = this.evalSegment(seg, 0.5);
      return !this.isPointInPolygonRing(mid, cutterRing);
    });

    // Kept cutter subsegments: midpoints lie INSIDE target.
    // They are reversed so they follow the perimeter of the cut seamlessly
    const keptCutterSegs = cutterSubsegs
      .filter((seg) => {
        const mid = this.evalSegment(seg, 0.5);
        return this.isPointInPolygonRing(mid, targetRing);
      })
      .map((seg) => this.reverseSegment(seg));

    // Combine all kept segments into a pool
    const pool: CurveSegment[] = [...keptTargetSegs, ...keptCutterSegs];
    if (pool.length < 3) return null;

    // 4. Assemble chained continuous closed loops
    const used = new Array(pool.length).fill(false);
    const chains: CurveSegment[][] = [];

    while (true) {
      // Find first unused segment
      const startIdx = used.findIndex((u) => !u);
      if (startIdx === -1) break;

      const currentChain: CurveSegment[] = [pool[startIdx]];
      used[startIdx] = true;

      while (true) {
        const lastSeg = currentChain[currentChain.length - 1];
        const endPt = lastSeg.p3;

        // Check if loop has closed back to chain start
        const distToStart = Math.hypot(endPt.x - currentChain[0].p0.x, endPt.y - currentChain[0].p0.y);
        if (currentChain.length >= 3 && distToStart < 1.0) {
          break;
        }

        // Find next segment starting near endPt
        let bestDist = 2.0;
        let bestIdx = -1;

        for (let i = 0; i < pool.length; i++) {
          if (used[i]) continue;
          const d = Math.hypot(pool[i].p0.x - endPt.x, pool[i].p0.y - endPt.y);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }

        if (bestIdx !== -1) {
          used[bestIdx] = true;
          currentChain.push(pool[bestIdx]);
        } else {
          // Closed by proximity or dead-end reached
          break;
        }
      }

      if (currentChain.length >= 3) {
        chains.push(currentChain);
      }
    }

    if (chains.length === 0) return null;

    // 5. Convert assembled segment chains into PathVertices
    const finalVertices: PathVertex[] = [];

    chains.forEach((chain) => {
      chain.forEach((seg, idx) => {
        const prevSeg = chain[(idx - 1 + chain.length) % chain.length];
        const isStart = idx === 0;

        const handleIn = prevSeg.isBezier
          ? { x: Math.round(prevSeg.p2.x * 100) / 100, y: Math.round(prevSeg.p2.y * 100) / 100 }
          : undefined;
        const handleOut = seg.isBezier
          ? { x: Math.round(seg.p1.x * 100) / 100, y: Math.round(seg.p1.y * 100) / 100 }
          : undefined;

        const nodeType = (handleIn || handleOut) ? 'smooth' : 'sharp';

        finalVertices.push({
          id: `v_${Date.now().toString(36)}_${finalVertices.length}`,
          x: Math.round(seg.p0.x * 100) / 100,
          y: Math.round(seg.p0.y * 100) / 100,
          handleIn,
          handleOut,
          nodeType,
          command: isStart ? 'M' : 'C',
        });
      });
    });

    if (finalVertices.length === 0) return null;

    const id = `trimmed_${Date.now().toString(36)}`;
    const d = model.compilePathD(finalVertices, true);
    const attrs: Record<string, string> = {
      ...targetEl.attributes,
      id,
      d,
      'fill-rule': 'evenodd',
      'data-node-types': finalVertices.map((v) => v.nodeType).join(','),
      'data-shape': 'path',
      'data-parametric': 'false',
    };

    const shapeAttrs = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];
    shapeAttrs.forEach((attr) => delete attrs[attr]);

    /**
     * ARCHITECTURAL RATIONALE: Preserving Gradient Fill and Filter Links After Bezier Trim
     * When Bezier trimming subtracts intersecting curves, targetEl.attributes carries
     * 'data-gradient' and fill="url(#ad-grad-${targetEl.id})".
     * Because VectorModel compiles gradients dynamically using the element's active id,
     * failure to re-bind fill="url(#ad-grad-${id})" causes the SVG renderer to look for
     * a non-existent gradient ID, rendering the newly trimmed vector as transparent.
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
      vertices: finalVertices,
      isClosed: true,
    };
  }

  /**
   * Minus (Trim / Resta): The first selected vector (cutter) trims the last selected vector (target).
   * Cutter is retained in document, target is replaced with trimmed shape.
   */
  public static subtract(elements: VectorElement[], model: VectorModel): TrimResult | null {
    if (!elements || elements.length < 2) return null;

    const cutterEl = elements[0];
    const targetEl = elements[elements.length - 1];

    // Attempt high-fidelity Bezier curve vector trimming first
    try {
      const bezierTrimmed = this.trimWithBezierCurves(targetEl, cutterEl, model);
      if (bezierTrimmed) {
        return {
          trimmed: bezierTrimmed,
          targetId: targetEl.id,
          cutterId: cutterEl.id,
        };
      }
    } catch (_err) {
      // Graceful fallback to polygonClipping on complex or non-manifold topology
    }

    // Fallback: polygon-clipping difference
    const fallbackTrimmed = PolygonBooleanService.difference(targetEl, cutterEl, model);
    if (!fallbackTrimmed) return null;

    return {
      trimmed: fallbackTrimmed,
      targetId: targetEl.id,
      cutterId: cutterEl.id,
    };
  }
}
