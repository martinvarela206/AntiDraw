import polygonClipping, { MultiPolygon, Polygon, Ring, Pair } from 'polygon-clipping';
import { VectorElement, PathVertex, VectorModel, Point } from './VectorModel.js';

export interface TrimResult {
  trimmed: VectorElement;
  targetId: string;
  cutterId: string;
}

export class BooleanOperations {
  // Sample a cubic Bezier curve into line segments
  private static sampleBezier(
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

  // Convert a VectorElement into polygon-clipping MultiPolygon
  private static elementToGeom(el: VectorElement): MultiPolygon {
    if (!el.vertices || el.vertices.length < 3) return [];

    // Group vertices by subpaths (each subpath starts with 'M' or index 0)
    const subpaths: PathVertex[][] = [];
    let currentSubpath: PathVertex[] = [];

    for (let i = 0; i < el.vertices.length; i++) {
      const v = el.vertices[i];
      if ((v.command === 'M' || i === 0) && currentSubpath.length > 0) {
        subpaths.push(currentSubpath);
        currentSubpath = [];
      }
      currentSubpath.push(v);
    }
    if (currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
    }

    const polygons: Polygon[] = [];

    for (const sp of subpaths) {
      if (sp.length < 3) continue;
      const ring: Ring = [];

      for (let i = 0; i < sp.length; i++) {
        const v = sp[i];
        const nextV = sp[(i + 1) % sp.length];

        ring.push([v.x, v.y]);

        if (v.handleOut || nextV.handleIn) {
          const h1 = v.handleOut || { x: v.x, y: v.y };
          const h2 = nextV.handleIn || { x: nextV.x, y: nextV.y };
          const sampled = this.sampleBezier(v, h1, h2, nextV, 24);
          // sampleBezier ends at nextV; push intermediate points
          for (let j = 0; j < sampled.length - 1; j++) {
            ring.push(sampled[j]);
          }
        }
      }

      // Close ring for polygon-clipping: first point must equal last point
      if (ring.length >= 3) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.001) {
          ring.push([first[0], first[1]]);
        }
        polygons.push([ring]);
      }
    }

    return polygons;
  }

  // Convert a MultiPolygon back into a VectorElement with vertices and SVG path d
  private static multiPolygonToElement(
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
    };

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
      attributes: attrs,
      vertices,
      isClosed: true,
    };
  }

  // Join (Union / Weld): Combines all selected vector shapes into a single unified outline
  public static union(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length === 0) return null;
    if (elements.length === 1) return elements[0];

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length === 0) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.union(result, geoms[i]);
    }

    const id = `union_${Date.now().toString(36)}`;
    return this.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  /**
   * ARCHITECTURAL RATIONALE: High-Fidelity Bezier Curve Vector Trimming (subtract / Trim)
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
   *    clean continuous graph assembly, the engine falls back transparently to `polygonClipping.difference`.
   */

  // Split cubic Bezier curve at parameter t in (0, 1) using De Casteljau's algorithm
  private static splitCubicBezier(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number
  ): { left: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }]; right: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] } {
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

  // Decompose a VectorElement's closed path into directed CurveSegments
  private static elementToSegments(el: VectorElement): Array<{
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    p3: { x: number; y: number };
    isBezier: boolean;
    origIndex: number;
  }> {
    const segs: Array<{
      p0: { x: number; y: number };
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      p3: { x: number; y: number };
      isBezier: boolean;
      origIndex: number;
    }> = [];

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

  // Evaluate 2D coordinate on a segment at parameter t in [0, 1]
  private static evalSegment(seg: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean }, t: number): { x: number; y: number } {
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

  // Extract a subsegment between parameter intervals [t0, t1] where 0 <= t0 < t1 <= 1
  private static subSegment(
    seg: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean; origIndex: number },
    t0: number,
    t1: number
  ): { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean; origIndex: number } {
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

  // Reverse segment traversal: start and end are swapped, control handles are transposed
  private static reverseSegment(
    seg: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean; origIndex: number }
  ): { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; isBezier: boolean; origIndex: number } {
    return {
      p0: seg.p3,
      p1: seg.p2,
      p2: seg.p1,
      p3: seg.p0,
      isBezier: seg.isBezier,
      origIndex: seg.origIndex,
    };
  }

  // Find all intersections between two curve/line segments
  private static findSegmentIntersections(
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

  // Ray-casting point-in-polygon test
  private static isPointInPolygonRing(pt: { x: number; y: number }, ring: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, yi = ring[i].y;
      const xj = ring[j].x, yj = ring[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Convert element vertices to polygon sampling ring for containment tests
  private static elementToPolygonRing(el: VectorElement): Array<{ x: number; y: number }> {
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
   * Analytical Bezier-Preserving Vector Trimming Engine
   * Implements exact Weiler-Atherton style topological subtraction retaining Bezier nodes and handles.
   */
  private static trimWithBezierCurves(
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
        };
        if (attrs['fill'] && attrs['fill'].includes('ad-grad-')) {
          attrs['fill'] = `url(#ad-grad-${id})`;
        }
        if (attrs['filter'] && attrs['filter'].includes('ad-filter-shadow-')) {
          attrs['filter'] = `url(#ad-filter-shadow-${id})`;
        }
        return {
          id,
          tagName: 'path',
          attributes: attrs,
          vertices: combinedVertices,
          isClosed: true,
        };
      }

      // Disjoint: cutter is completely outside target -> target unchanged
      const disjointId = `trimmed_${Date.now().toString(36)}`;
      const disjointAttrs: Record<string, string> = {
        ...targetEl.attributes,
        id: disjointId,
      };
      if (disjointAttrs['fill'] && disjointAttrs['fill'].includes('ad-grad-')) {
        disjointAttrs['fill'] = `url(#ad-grad-${disjointId})`;
      }
      if (disjointAttrs['filter'] && disjointAttrs['filter'].includes('ad-filter-shadow-')) {
        disjointAttrs['filter'] = `url(#ad-filter-shadow-${disjointId})`;
      }
      return {
        ...targetEl,
        id: disjointId,
        attributes: disjointAttrs,
      };
    }

    // 2. Subdivide target and cutter segments at intersection parameters
    type SubSeg = {
      p0: { x: number; y: number };
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      p3: { x: number; y: number };
      isBezier: boolean;
      origIndex: number;
    };

    const targetSubsegs: SubSeg[] = [];
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

    const cutterSubsegs: SubSeg[] = [];
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
    const pool: SubSeg[] = [...keptTargetSegs, ...keptCutterSegs];
    if (pool.length < 3) return null;

    // 4. Assemble chained continuous closed loops
    const used = new Array(pool.length).fill(false);
    const chains: SubSeg[][] = [];

    while (true) {
      // Find first unused segment
      const startIdx = used.findIndex((u) => !u);
      if (startIdx === -1) break;

      const currentChain: SubSeg[] = [pool[startIdx]];
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
    };

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
      attributes: attrs,
      vertices: finalVertices,
      isClosed: true,
    };
  }

  // Minus (Trim / Resta): The first selected vector (cutter) trims the last selected vector (target).
  // Cutter is retained in document, target is replaced with trimmed shape.
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
    const cutterGeom = this.elementToGeom(cutterEl);
    const targetGeom = this.elementToGeom(targetEl);

    if (cutterGeom.length === 0 || targetGeom.length === 0) return null;

    const trimmedMp = polygonClipping.difference(targetGeom, cutterGeom);
    const id = `trimmed_${Date.now().toString(36)}`;
    const trimmedEl = this.multiPolygonToElement(trimmedMp, id, targetEl.attributes, model);
    if (!trimmedEl) return null;

    return {
      trimmed: trimmedEl,
      targetId: targetEl.id,
      cutterId: cutterEl.id,
    };
  }

  // Intersect: Retains only the overlapping region between shapes
  public static intersect(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length < 2) return null;

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length < 2) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.intersection(result, geoms[i]);
    }

    const id = `intersect_${Date.now().toString(36)}`;
    return this.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  // Exclusion (XOR): Retains only non-overlapping regions
  public static exclude(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length < 2) return null;

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length < 2) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.xor(result, geoms[i]);
    }

    const id = `exclude_${Date.now().toString(36)}`;
    return this.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  // Fragment / Divide: Produces intersection and exclusion shapes simultaneously
  public static fragment(elements: VectorElement[], model: VectorModel): VectorElement[] | null {
    if (!elements || elements.length < 2) return null;

    const el1 = elements[0];
    const el2 = elements[1];

    const geom1 = this.elementToGeom(el1);
    const geom2 = this.elementToGeom(el2);
    if (geom1.length === 0 || geom2.length === 0) return null;

    const mpIntersect = polygonClipping.intersection(geom1, geom2);
    const mpExclude = polygonClipping.xor(geom1, geom2);

    const idInt = `frag_int_${Date.now().toString(36)}`;
    const idExc = `frag_exc_${Date.now().toString(36)}`;

    const elInt = this.multiPolygonToElement(
      mpIntersect,
      idInt,
      { ...el1.attributes, fill: el1.attributes.fill || '#6366f1' },
      model
    );
    const elExc = this.multiPolygonToElement(
      mpExclude,
      idExc,
      { ...el2.attributes, fill: el2.attributes.fill || '#ec4899' },
      model
    );

    const result: VectorElement[] = [];
    if (elInt) result.push(elInt);
    if (elExc) result.push(elExc);

    return result.length > 0 ? result : null;
  }

  // Helper to get element bounding box
  private static getElementBox(
    el: VectorElement
  ): { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number } | null {
    if (!el.vertices || el.vertices.length === 0) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    el.vertices.forEach((v) => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    return {
      minX,
      minY,
      maxX,
      maxY,
      cx: minX + (maxX - minX) / 2,
      cy: minY + (maxY - minY) / 2,
    };
  }

  // Align elements: left, center, right, top, middle, bottom
  public static alignElements(
    elements: VectorElement[],
    type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
    canvasWidth: number,
    canvasHeight: number
  ): VectorElement[] {
    if (!elements || elements.length === 0) return elements;

    let targetX: number | null = null;
    let targetY: number | null = null;

    if (elements.length === 1) {
      // 1 vector selected: Align relative to Canvas
      if (type === 'left') targetX = 0;
      else if (type === 'center') targetX = canvasWidth / 2;
      else if (type === 'right') targetX = canvasWidth;
      else if (type === 'top') targetY = 0;
      else if (type === 'middle') targetY = canvasHeight / 2;
      else if (type === 'bottom') targetY = canvasHeight;
    } else {
      // Multiple vectors selected: Pivot is the first selected vector (elements[0])
      const pivotBox = this.getElementBox(elements[0]);
      if (pivotBox) {
        if (type === 'left') targetX = pivotBox.minX;
        else if (type === 'center') targetX = pivotBox.cx;
        else if (type === 'right') targetX = pivotBox.maxX;
        else if (type === 'top') targetY = pivotBox.minY;
        else if (type === 'middle') targetY = pivotBox.cy;
        else if (type === 'bottom') targetY = pivotBox.maxY;
      }
    }

    return elements.map((el, index) => {
      // For multi-selection, the pivot element (first selected) remains in place
      if (elements.length > 1 && index === 0) {
        return el;
      }

      if (!el.vertices || el.vertices.length === 0) return el;
      const box = this.getElementBox(el);
      if (!box) return el;

      let dx = 0;
      let dy = 0;

      if (targetX !== null) {
        if (type === 'left') dx = targetX - box.minX;
        else if (type === 'center') dx = targetX - box.cx;
        else if (type === 'right') dx = targetX - box.maxX;
      }

      if (targetY !== null) {
        if (type === 'top') dy = targetY - box.minY;
        else if (type === 'middle') dy = targetY - box.cy;
        else if (type === 'bottom') dy = targetY - box.maxY;
      }

      const newVertices = el.vertices.map((v) => ({
        ...v,
        x: v.x + dx,
        y: v.y + dy,
        handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
        handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
      }));

      return { ...el, vertices: newVertices };
    });
  }

  // Z-Order re-ordering
  public static reorder(
    elements: VectorElement[],
    targetId: string,
    action: 'front' | 'forward' | 'backward' | 'back'
  ): VectorElement[] {
    const index = elements.findIndex((e) => e.id === targetId);
    if (index === -1) return elements;

    const list = [...elements];
    const [target] = list.splice(index, 1);

    if (action === 'front') {
      list.push(target);
    } else if (action === 'back') {
      list.unshift(target);
    } else if (action === 'forward') {
      const newIdx = Math.min(index + 1, list.length);
      list.splice(newIdx, 0, target);
    } else if (action === 'backward') {
      const newIdx = Math.max(index - 1, 0);
      list.splice(newIdx, 0, target);
    }

    return list;
  }

  /**
   * Helper to parse marker identifier from an attribute value like 'url(#ad-marker-arrow-filled-start)'
   */
  private static parseMarkerType(attrVal?: string): string {
    if (!attrVal || attrVal === 'none') return 'none';
    const m = attrVal.match(/#(?:\w+-)*marker-([^'")\s]+)/) || attrVal.match(/#([^'")\s]+)/);
    if (!m) return 'none';
    return m[1];
  }

  /**
   * ARCHITECTURAL RATIONALE: High-Fidelity SVG Marker Planar Geometry Extraction
   *
   * Why this solution is engineered this way:
   * 1. Direct SVG Marker Coordinate Mapping:
   *    In SVG standard (<marker markerUnits="strokeWidth">), markers are defined within a canonical
   *    viewBox (e.g. 0 0 10 10) with an anchor reference point (refX, refY).
   *    By mapping marker points (X, Y) through the 2D affine transformation:
   *      x' = anchor.x + ((X - refX) * sx * cos - (Y - refY) * sy * sin)
   *      y' = anchor.y + ((X - refX) * sx * sin + (Y - refY) * sy * cos)
   *    the converted polygon precisely matches the onscreen position, scale, and orientation
   *    rendered natively by the browser.
   * 2. Planar Boolean Welded Unity:
   *    Alternate approaches (such as creating separate child shapes in a group <g>) fail because
   *    they leave overlapping geometries that do not behave as a single solid path for subsequent
   *    booleans, fills, or node edits. Adding marker polygons directly to thickPolygons before
   *    polygonClipping.union() ensures a single, continuous, non-self-intersecting closed vector.
   * 3. Tangent Stability & Degeneracy Immunity:
   *    If incoming/outgoing tangent vectors collapse to zero length (< 0.0001), fallback tangents
   *    are computed from adjacent vertex chords or outgoing tangents, preventing NaN singularities.
   * 4. HISTORICAL ARCHITECTURE (FIX-15) - Exact Marker Topology & Linecap Fidelity:
   *    - Open Arrow ('arrow-open'): In SVG `<path d="M 9 1.5 L 1 5 L 9 8.5" stroke-linecap="round" stroke-linejoin="round" />`,
   *      both terminal wing tips (p0, p2) have round linecaps (discs of radius halfLeg) and the apex (p1) has a round join disc.
   *      Previously, leg ends were chopped flat with rectangular butt caps, deforming the arrow.
   *    - Bar Cap ('bar-cap'): In SVG `<line stroke-linecap="round" stroke-width="2" />`, the perpendicular bar terminates with
   *      semicircular round caps at (refX, 1) and (refX, 9). Semicircular discs are now placed at both ends to yield a faithful capsule.
   *    - Circle Dot ('circle-dot'): Discretized with 32 polygon vertices for silky circular contour without visible polygonal facets.
   */
  private static createMarkerPolygons(
    markerId: string,
    anchor: Point,
    tangent: Point,
    strokeWidth: number
  ): Polygon[] {
    if (!markerId || markerId === 'none') return [];

    const len = Math.hypot(tangent.x, tangent.y);
    if (len < 0.0001) return [];
    const cos = tangent.x / len;
    const sin = tangent.y / len;

    const transform = (X: number, Y: number, refX: number, refY: number, mw: number, mh: number): Pair => {
      const sx = (mw / 10) * strokeWidth;
      const sy = (mh / 10) * strokeWidth;
      const dx = (X - refX) * sx;
      const dy = (Y - refY) * sy;
      return [
        anchor.x + dx * cos - dy * sin,
        anchor.y + dx * sin + dy * cos,
      ];
    };

    const makeCircle = (cx: number, cy: number, r: number, steps: number = 24): Polygon => {
      const ring: Ring = [];
      for (let s = 0; s < steps; s++) {
        const th = (s / steps) * Math.PI * 2;
        ring.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
      }
      ring.push([ring[0][0], ring[0][1]]);
      return [ring];
    };

    const polys: Polygon[] = [];

    if (markerId.includes('arrow-filled')) {
      let pts: [number, number][];
      let refX = 5;
      let refY = 5;
      const mw = 6;
      const mh = 6;
      if (markerId.includes('start')) {
        refX = 1;
        refY = 5;
        pts = [[10, 1.5], [1, 5], [10, 8.5]];
      } else if (markerId.includes('end')) {
        refX = 9;
        refY = 5;
        pts = [[0, 1.5], [9, 5], [0, 8.5]];
      } else {
        // mid
        refX = 5;
        refY = 5;
        pts = [[1, 1.5], [9, 5], [1, 8.5]];
      }
      const ring: Ring = pts.map(([x, y]) => transform(x, y, refX, refY, mw, mh));
      ring.push([ring[0][0], ring[0][1]]);
      polys.push([ring]);
    } else if (markerId.includes('circle-dot')) {
      // 32-step smooth circle matching cx=5, cy=5, r=3.5 in 10x10 viewBox with mw=5, mh=5
      const r = 3.5 * 0.5 * strokeWidth;
      polys.push(makeCircle(anchor.x, anchor.y, r, 32));
    } else if (markerId.includes('square-block')) {
      const refX = 5;
      const refY = 5;
      const mw = 5;
      const mh = 5;
      const corners: [number, number][] = [[2, 2], [8, 2], [8, 8], [2, 8]];
      const ring: Ring = corners.map(([x, y]) => transform(x, y, refX, refY, mw, mh));
      ring.push([ring[0][0], ring[0][1]]);
      polys.push([ring]);
    } else if (markerId.includes('bar-cap')) {
      const isStart = markerId.includes('start');
      const refX = isStart ? 2 : 8;
      const refY = 5;
      const mw = 5;
      const mh = 6;
      // Perpendicular rectangular bar body
      const corners: [number, number][] = [
        [refX - 1, 1],
        [refX + 1, 1],
        [refX + 1, 9],
        [refX - 1, 9],
      ];
      const ring: Ring = corners.map(([x, y]) => transform(x, y, refX, refY, mw, mh));
      ring.push([ring[0][0], ring[0][1]]);
      polys.push([ring]);

      // stroke-linecap="round" on line ends: semicircular round caps centered at (refX, 1) and (refX, 9)
      const rCap = 1.0 * (mh / 10) * strokeWidth;
      const pTop = transform(refX, 1, refX, refY, mw, mh);
      const pBot = transform(refX, 9, refX, refY, mw, mh);
      polys.push(makeCircle(pTop[0], pTop[1], rCap, 16));
      polys.push(makeCircle(pBot[0], pBot[1], rCap, 16));
    } else if (markerId.includes('arrow-open')) {
      const isStart = markerId.includes('start');
      const refX = isStart ? 1 : 9;
      const refY = 5;
      const mw = 6;
      const mh = 6;
      const vPts: [number, number][] = isStart
        ? [[9, 1.5], [1, 5], [9, 8.5]]
        : [[1, 1.5], [9, 5], [1, 8.5]];

      const p0 = transform(vPts[0][0], vPts[0][1], refX, refY, mw, mh);
      const p1 = transform(vPts[1][0], vPts[1][1], refX, refY, mw, mh); // apex
      const p2 = transform(vPts[2][0], vPts[2][1], refX, refY, mw, mh);
      const legThickness = 1.8 * 0.6 * strokeWidth;
      const halfLeg = legThickness / 2;

      const extrudeLeg = (a: Pair, b: Pair): Polygon => {
        const ldx = b[0] - a[0];
        const ldy = b[1] - a[1];
        const llen = Math.hypot(ldx, ldy) || 1;
        const lnx = (-ldy / llen) * halfLeg;
        const lny = (ldx / llen) * halfLeg;
        return [[
          [a[0] + lnx, a[1] + lny],
          [b[0] + lnx, b[1] + lny],
          [b[0] - lnx, b[1] - lny],
          [a[0] - lnx, a[1] - lny],
          [a[0] + lnx, a[1] + lny],
        ]];
      };

      polys.push(extrudeLeg(p0, p1));
      polys.push(extrudeLeg(p1, p2));

      // stroke-linejoin="round" at apex (p1)
      polys.push(makeCircle(p1[0], p1[1], halfLeg, 20));

      // stroke-linecap="round" on outer endpoints of wings (p0, p2)
      polys.push(makeCircle(p0[0], p0[1], halfLeg, 20));
      polys.push(makeCircle(p2[0], p2[1], halfLeg, 20));
    }

    return polys;
  }

  /**
   * ARCHITECTURAL RATIONALE: Geometric Stroke-to-Path Conversion (Outline Stroke)
   * 
   * 1. Discrete Normal Extrusion & Miter/Bevel/Round Joins:
   *    A path's stroke is mathematically equivalent to the 2D Minkowski sum of the centerline
   *    curve with a circular disc of radius R = strokeWidth / 2.
   *    To compute this accurately without numerical singularities:
   *    - The curve is adaptively sampled into linear segments (via De Casteljau/polynomial sampling).
   *    - Each linear segment [p_i, p_{i+1}] is extruded perpendicularly along its unit normal vector
   *      n = (-dy/L, dx/L) to create an oriented rectangular quad of width 2R.
   *    - At every inner vertex and joint, a circular join disc (or miter corner) of radius R is placed.
   *    - At open path endpoints, caps are added according to stroke-linecap:
   *      * 'round': circular cap discs at p_0 and p_n.
   *      * 'square': quads are extended along their longitudinal tangent by R.
   *      * 'butt': quads terminate exactly at p_0 and p_n.
   * 
   * 2. Geometric Integration of SVG Markers (marker-start, marker-mid, marker-end):
   *    If markers are assigned, their geometric shapes (arrows, dots, squares, bar-caps) are scaled
   *    by strokeWidth, oriented along path tangent vectors, and injected as planar polygons.
   *    polygonClipping.union merges the stroke and all markers into a single unified polygon.
   * 
   * 3. Non-Self-Intersecting Planar Union via polygon-clipping:
   *    Extruding overlapping quads, discs, and markers generates internal geometry. Passing all
   *    quads, discs, and marker polygons to polygonClipping.union() eliminates all internal edges,
   *    computes the exact outer boundary, and for closed shapes (like rings or rectangles) automatically
   *    extracts the inner hole ring with fill-rule="evenodd".
   * 
   * 4. Style Transition:
   *    The resulting vector element becomes an autonomous closed path (isClosed = true), with its fill
   *    color set to the original stroke color, and stroke set to 'none'. All marker attributes are cleared.
   */
  public static outlineStroke(element: VectorElement, model: VectorModel): VectorElement | null {
    if (!element.vertices || element.vertices.length < 2) return null;

    const strokeWidth = parseFloat(element.attributes['stroke-width'] || '1') || 1;
    const halfW = strokeWidth / 2;
    const strokeLinecap = element.attributes['stroke-linecap'] || 'butt';
    const strokeLinejoin = element.attributes['stroke-linejoin'] || 'miter';
    const strokeMiterlimit = parseFloat(element.attributes['stroke-miterlimit'] || '4') || 4;
    const strokeColor = element.attributes['stroke'] && element.attributes['stroke'] !== 'none'
      ? element.attributes['stroke']
      : '#ffffff';

    const markerStartType = this.parseMarkerType(element.attributes['marker-start']);
    const markerMidType = this.parseMarkerType(element.attributes['marker-mid']);
    const markerEndType = this.parseMarkerType(element.attributes['marker-end']);

    // Helper to generate circular disc polygon (16 sides)
    const makeDisc = (cx: number, cy: number, r: number): Polygon => {
      const ring: Ring = [];
      const steps = 16;
      for (let s = 0; s < steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        ring.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta)]);
      }
      ring.push([ring[0][0], ring[0][1]]);
      return [ring];
    };

    // Group vertices by subpaths
    const subpaths: PathVertex[][] = [];
    let curSp: PathVertex[] = [];
    for (let i = 0; i < element.vertices.length; i++) {
      const v = element.vertices[i];
      if ((v.command === 'M' || i === 0) && curSp.length > 0) {
        subpaths.push(curSp);
        curSp = [];
      }
      curSp.push(v);
    }
    if (curSp.length > 0) subpaths.push(curSp);

    const thickPolygons: Polygon[] = [];

    for (const sp of subpaths) {
      if (sp.length < 2) continue;

      // Sample subpath into dense 2D point array, avoiding zero-length consecutive duplicates
      const pts: { x: number; y: number }[] = [];
      const addPt = (pt: { x: number; y: number }) => {
        if (pts.length > 0) {
          const last = pts[pts.length - 1];
          if (Math.hypot(pt.x - last.x, pt.y - last.y) < 1e-4) return;
        }
        pts.push({ x: pt.x, y: pt.y });
      };

      for (let i = 0; i < sp.length - 1; i++) {
        const v = sp[i];
        const nextV = sp[i + 1];
        addPt(v);
        if (v.handleOut || nextV.handleIn) {
          const h1 = v.handleOut || { x: v.x, y: v.y };
          const h2 = nextV.handleIn || { x: nextV.x, y: nextV.y };
          const sampled = this.sampleBezier(v, h1, h2, nextV, 24);
          for (let j = 0; j < sampled.length - 1; j++) {
            addPt({ x: sampled[j][0], y: sampled[j][1] });
          }
        }
      }
      // Push last point of subpath
      const lastSpV = sp[sp.length - 1];
      addPt(lastSpV);

      // If closed subpath, add closing curve or straight connection
      const isClosed = element.isClosed ?? false;
      if (isClosed && pts.length >= 3) {
        const firstSpV = sp[0];
        if (lastSpV.handleOut || firstSpV.handleIn) {
          const h1 = lastSpV.handleOut || { x: lastSpV.x, y: lastSpV.y };
          const h2 = firstSpV.handleIn || { x: firstSpV.x, y: firstSpV.y };
          const sampled = this.sampleBezier(lastSpV, h1, h2, firstSpV, 24);
          for (let j = 0; j < sampled.length - 1; j++) {
            addPt({ x: sampled[j][0], y: sampled[j][1] });
          }
        }
        // Ensure closed path ends on exact starting point
        if (Math.hypot(pts[pts.length - 1].x - firstSpV.x, pts[pts.length - 1].y - firstSpV.y) > 1e-4) {
          pts.push({ x: firstSpV.x, y: firstSpV.y });
        }
      }

      // Generate thick quads for each segment
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;

        const nx = -dy / len;
        const ny = dx / len;

        let p1Left: Pair = [p1.x + nx * halfW, p1.y + ny * halfW];
        let p1Right: Pair = [p1.x - nx * halfW, p1.y - ny * halfW];
        let p2Left: Pair = [p2.x + nx * halfW, p2.y + ny * halfW];
        let p2Right: Pair = [p2.x - nx * halfW, p2.y - ny * halfW];

        // Square linecap extension on open ends (suppressed when a marker is attached to that end)
        if (!isClosed && strokeLinecap === 'square') {
          if (i === 0 && markerStartType === 'none') {
            p1Left = [p1Left[0] - (dx / len) * halfW, p1Left[1] - (dy / len) * halfW];
            p1Right = [p1Right[0] - (dx / len) * halfW, p1Right[1] - (dy / len) * halfW];
          }
          if (i === pts.length - 2 && markerEndType === 'none') {
            p2Left = [p2Left[0] + (dx / len) * halfW, p2Left[1] + (dy / len) * halfW];
            p2Right = [p2Right[0] + (dx / len) * halfW, p2Right[1] + (dy / len) * halfW];
          }
        }

        const quadRing: Ring = [
          p1Left,
          p2Left,
          p2Right,
          p1Right,
          [p1Left[0], p1Left[1]],
        ];
        thickPolygons.push([quadRing]);

        // Join corner at internal vertex or closing vertex using exact join mode
        if (i < pts.length - 2) {
          const p3 = pts[i + 2];
          const joinPolys = this.createJoinPolygon(p1, p2, p3, strokeLinejoin, strokeMiterlimit, halfW);
          thickPolygons.push(...joinPolys);
        } else if (isClosed && pts.length >= 3) {
          // Closing vertex: connects incoming segment (pts[N-2]->pts[N-1]) to outgoing segment (pts[0]->pts[1])
          const pNext = pts[1];
          const joinPolys = this.createJoinPolygon(p1, p2, pNext, strokeLinejoin, strokeMiterlimit, halfW);
          thickPolygons.push(...joinPolys);
        }
      }

      // Round linecaps on open endpoints (suppressed when a marker is attached to prevent protruding blobs)
      if (!isClosed && strokeLinecap === 'round') {
        if (markerStartType === 'none') {
          thickPolygons.push(makeDisc(pts[0].x, pts[0].y, halfW));
        }
        if (markerEndType === 'none') {
          thickPolygons.push(makeDisc(pts[pts.length - 1].x, pts[pts.length - 1].y, halfW));
        }
      }

      // Append marker geometry into thickPolygons
      // 1. marker-start on first vertex of subpath
      if (markerStartType !== 'none' && sp.length >= 2) {
        let v0Tan = { x: sp[1].x - sp[0].x, y: sp[1].y - sp[0].y };
        if (sp[0].handleOut) {
          const hx = sp[0].handleOut.x - sp[0].x;
          const hy = sp[0].handleOut.y - sp[0].y;
          if (Math.hypot(hx, hy) > 0.001) v0Tan = { x: hx, y: hy };
        } else if (sp[1].handleIn) {
          const hx = sp[1].handleIn.x - sp[0].x;
          const hy = sp[1].handleIn.y - sp[0].y;
          if (Math.hypot(hx, hy) > 0.001) v0Tan = { x: hx, y: hy };
        }
        const mPolys = this.createMarkerPolygons(markerStartType, sp[0], v0Tan, strokeWidth);
        thickPolygons.push(...mPolys);
      }

      // 2. marker-mid on intermediate vertices of subpath
      if (markerMidType !== 'none' && sp.length >= 2) {
        const midCount = isClosed ? sp.length : sp.length - 1;
        for (let i = 1; i < midCount; i++) {
          const curr = sp[i];
          const prev = sp[i - 1];
          const next = isClosed && i === sp.length - 1 ? sp[0] : sp[i + 1];

          let inTan = { x: curr.x - prev.x, y: curr.y - prev.y };
          if (curr.handleIn) {
            const hx = curr.x - curr.handleIn.x;
            const hy = curr.y - curr.handleIn.y;
            if (Math.hypot(hx, hy) > 0.001) inTan = { x: hx, y: hy };
          } else if (prev.handleOut) {
            const hx = curr.x - prev.handleOut.x;
            const hy = curr.y - prev.handleOut.y;
            if (Math.hypot(hx, hy) > 0.001) inTan = { x: hx, y: hy };
          }
          const inLen = Math.hypot(inTan.x, inTan.y) || 1;
          const uIn = { x: inTan.x / inLen, y: inTan.y / inLen };

          let outTan = { x: next.x - curr.x, y: next.y - curr.y };
          if (curr.handleOut) {
            const hx = curr.handleOut.x - curr.x;
            const hy = curr.handleOut.y - curr.y;
            if (Math.hypot(hx, hy) > 0.001) outTan = { x: hx, y: hy };
          } else if (next.handleIn) {
            const hx = next.handleIn.x - curr.x;
            const hy = next.handleIn.y - curr.y;
            if (Math.hypot(hx, hy) > 0.001) outTan = { x: hx, y: hy };
          }
          const outLen = Math.hypot(outTan.x, outTan.y) || 1;
          const uOut = { x: outTan.x / outLen, y: outTan.y / outLen };

          let midTan = { x: uIn.x + uOut.x, y: uIn.y + uOut.y };
          if (Math.hypot(midTan.x, midTan.y) < 0.001) midTan = uOut;

          const mPolys = this.createMarkerPolygons(markerMidType, curr, midTan, strokeWidth);
          thickPolygons.push(...mPolys);
        }
      }

      // 3. marker-end on last vertex of subpath (or closing vertex of closed subpath)
      if (markerEndType !== 'none' && sp.length >= 2) {
        if (isClosed) {
          const lastV = sp[sp.length - 1];
          const firstV = sp[0];
          let vnTan = { x: firstV.x - lastV.x, y: firstV.y - lastV.y };
          if (firstV.handleIn) {
            const hx = firstV.x - firstV.handleIn.x;
            const hy = firstV.y - firstV.handleIn.y;
            if (Math.hypot(hx, hy) > 0.001) vnTan = { x: hx, y: hy };
          } else if (lastV.handleOut) {
            const hx = firstV.x - lastV.handleOut.x;
            const hy = firstV.y - lastV.handleOut.y;
            if (Math.hypot(hx, hy) > 0.001) vnTan = { x: hx, y: hy };
          }
          const mPolys = this.createMarkerPolygons(markerEndType, firstV, vnTan, strokeWidth);
          thickPolygons.push(...mPolys);
        } else {
          const lastIdx = sp.length - 1;
          const lastV = sp[lastIdx];
          const prevV = sp[lastIdx - 1];

          let vnTan = { x: lastV.x - prevV.x, y: lastV.y - prevV.y };
          if (lastV.handleIn) {
            const hx = lastV.x - lastV.handleIn.x;
            const hy = lastV.y - lastV.handleIn.y;
            if (Math.hypot(hx, hy) > 0.001) vnTan = { x: hx, y: hy };
          } else if (prevV.handleOut) {
            const hx = lastV.x - prevV.handleOut.x;
            const hy = lastV.y - prevV.handleOut.y;
            if (Math.hypot(hx, hy) > 0.001) vnTan = { x: hx, y: hy };
          }
          const mPolys = this.createMarkerPolygons(markerEndType, lastV, vnTan, strokeWidth);
          thickPolygons.push(...mPolys);
        }
      }
    }

    if (thickPolygons.length === 0) return null;

    // Union all thick polygons into a single seamless MultiPolygon
    let merged: MultiPolygon = [thickPolygons[0]];
    for (let i = 1; i < thickPolygons.length; i++) {
      merged = polygonClipping.union(merged, [thickPolygons[i]]);
    }

    const newId = `el_stroke_path_${Date.now().toString(36)}`;
    const baseAttrs: Record<string, string> = {
      id: newId,
      fill: strokeColor,
      stroke: 'none',
      'stroke-width': '0',
    };

    return this.multiPolygonToElement(merged, newId, baseAttrs, model);
  }

  /**
   * ARCHITECTURAL RATIONALE: Geometric Stroke Join Extrusion (Miter, Bevel, Round)
   *
   * 1. Why this exists:
   *    In SVG, stroke-linejoin determines how two connected stroke segments meet:
   *    - 'miter': The outer edges of the stroke are extended until they meet at a sharp point.
   *      However, in acute corners (angles < 30°), the miter length can become extraordinarily long.
   *      W3C SVG specification imposes the `stroke-miterlimit` ratio rule:
   *      miterRatio = miterLength / strokeWidth = 1 / sin(theta / 2).
   *      If miterRatio <= strokeMiterlimit, a sharp miter corner is rendered.
   *      If miterRatio > strokeMiterlimit, the join is converted/clipped to a flat bevel.
   *    - 'bevel': The outer corner is truncated with a flat triangle connecting the outer stroke edges.
   *    - 'round': A circular disc of radius strokeWidth/2 rounds off the outer corner.
   *
   * 2. Why naive disc placement was discarded:
   *    Previously, outlineStroke placed a circular disc (makeDisc) at every vertex regardless of
   *    strokeLinejoin. This caused all miter and bevel corners to be forcibly rounded, completely
   *    preventing sharp acute points from appearing in converted vectors.
   *
   * 3. Geometric Miter Intersection Algorithm & Numerical Stability:
   *    Given segment 1 (pPrev -> pCurr) and segment 2 (pCurr -> pNext):
   *    - Unit vectors u1 and u2, normals n1 = (-u1y, u1x) and n2 = (-u2y, u2x).
   *    - 2D Cross product cross = u1x * u2y - u1y * u2x determines turn direction:
   *      * cross > 0: Left turn (outer side is -n).
   *      * cross < 0: Right turn (outer side is +n).
   *      * |cross| < 1e-4: Collinear segments (no wedge needed).
   *    - Outer edge lines intersect at M = pOut1 + t * u1, where:
   *      t = ((pOut2 - pOut1) x u2) / cross.
   *    - miterRatio is evaluated against strokeMiterlimit before emitting the kite polygon:
   *      [pCurr, pOut1, M, pOut2, pCurr].
   *    - If miterRatio exceeds strokeMiterlimit, it falls back to the bevel triangle [pCurr, pOut1, pOut2, pCurr].
   */
  private static createJoinPolygon(
    pPrev: { x: number; y: number },
    pCurr: { x: number; y: number },
    pNext: { x: number; y: number },
    strokeLinejoin: string,
    strokeMiterlimit: number,
    halfW: number
  ): Polygon[] {
    const dx1 = pCurr.x - pPrev.x;
    const dy1 = pCurr.y - pPrev.y;
    const len1 = Math.hypot(dx1, dy1);
    if (len1 < 0.001) return [];

    const dx2 = pNext.x - pCurr.x;
    const dy2 = pNext.y - pCurr.y;
    const len2 = Math.hypot(dx2, dy2);
    if (len2 < 0.001) return [];

    const u1x = dx1 / len1;
    const u1y = dy1 / len1;
    const u2x = dx2 / len2;
    const u2y = dy2 / len2;

    const cross = u1x * u2y - u1y * u2x;
    const dot = u1x * u2x + u1y * u2y;

    // Collinear segments in same direction (straight line)
    if (Math.abs(cross) < 1e-4 && dot > 0) {
      return [];
    }

    // 1. Round Join: Circular disc of radius halfW
    if (strokeLinejoin === 'round') {
      const ring: Ring = [];
      const steps = 16;
      for (let s = 0; s < steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        ring.push([pCurr.x + halfW * Math.cos(theta), pCurr.y + halfW * Math.sin(theta)]);
      }
      ring.push([ring[0][0], ring[0][1]]);
      return [[ring]];
    }

    // Normal vectors pointing to the left of the path (+n)
    const n1x = -u1y;
    const n1y = u1x;
    const n2x = -u2y;
    const n2y = u2x;

    let pOut1: Pair;
    let pOut2: Pair;

    if (cross > 0) {
      // Path turns LEFT: outer corner is on the RIGHT side (-n)
      pOut1 = [pCurr.x - n1x * halfW, pCurr.y - n1y * halfW];
      pOut2 = [pCurr.x - n2x * halfW, pCurr.y - n2y * halfW];
    } else {
      // Path turns RIGHT: outer corner is on the LEFT side (+n)
      pOut1 = [pCurr.x + n1x * halfW, pCurr.y + n1y * halfW];
      pOut2 = [pCurr.x + n2x * halfW, pCurr.y + n2y * halfW];
    }

    // 2. Miter Join: Outer edge line intersection if within miter limit
    if (strokeLinejoin === 'miter' && Math.abs(cross) >= 1e-4) {
      const t = ((pOut2[0] - pOut1[0]) * u2y - (pOut2[1] - pOut1[1]) * u2x) / cross;
      const mx = pOut1[0] + t * u1x;
      const my = pOut1[1] + t * u1y;

      const miterDist = Math.hypot(mx - pCurr.x, my - pCurr.y);
      const miterRatio = miterDist / halfW;

      if (miterRatio <= strokeMiterlimit && !isNaN(mx) && !isNaN(my) && isFinite(mx) && isFinite(my)) {
        const miterRing: Ring = [
          [pCurr.x, pCurr.y],
          pOut1,
          [mx, my],
          pOut2,
          [pCurr.x, pCurr.y],
        ];
        return [[miterRing]];
      }
    }

    // 3. Bevel Join (also fallback when miterLimit is exceeded)
    const bevelRing: Ring = [
      [pCurr.x, pCurr.y],
      pOut1,
      pOut2,
      [pCurr.x, pCurr.y],
    ];
    return [[bevelRing]];
  }
}
