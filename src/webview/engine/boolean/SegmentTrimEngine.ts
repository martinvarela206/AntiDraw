import { VectorElement, PathVertex, VectorModel, Point } from '../VectorModel.js';
import { PolygonUtils } from './PolygonUtils.js';

export interface TrimSubSegment {
  id: string;
  sourceElementId: string;
  p1: Point;
  p2: Point;
  isBezier?: boolean;
  h1?: Point;
  h2?: Point;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  fill?: string;
}

interface RawSeg {
  sourceElementId: string;
  p1: Point;
  p2: Point;
  isBezier?: boolean;
  h1?: Point;
  h2?: Point;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  fill?: string;
  splits: number[]; // parameters in [0, 1]
}

/**
 * ARCHITECTURAL RATIONALE: Analytical Segment Trimming & Topological Graph Welding (SegmentTrimEngine)
 *
 * 1. Decomposition into Atomic Sub-Strokes:
 *    Decomposes overlapping and intersecting vector paths (both open and closed) into discrete,
 *    non-crossing sub-segments bounded by mutual intersection points and terminal anchors.
 *
 * 2. Real-Time Spatial Hit-Testing & Hover Identification:
 *    Allows immediate, low-latency ray-testing to highlight the exact sub-stroke candidate beneath
 *    the cursor with an ephemeral highlight overlay.
 *
 * 3. Topological Valence Evaluation (N-Way Node Junctions):
 *    When a sub-stroke is deleted, the incident degree (valence k) at each junction node is evaluated:
 *    - If k == 2: Exactly two sub-strokes meet at this node. They are seamlessly merged/welded together
 *      into a single continuous vector path sharing that vertex. If they originated from different
 *      source vectors, the vectors are unified. If the chain forms a closed cycle, it is synthesized
 *      into a closed <path> (e.g. hashtag # transformed into a square).
 *    - If k >= 3: Three or more sub-strokes converge at this node. To prevent ambiguity in winding
 *      and topology, they remain separate branches meeting at that shared coordinate without automatic merger.
 *    - If k == 1: Dangling open endpoint.
 *
 * 4. Deterministic Lossless Vector Synthesis:
 *    Original stroke properties (color, width, dash, caps, joins) and companion metadata are preserved
 *    in the newly synthesized paths.
 */
export class SegmentTrimEngine {
  public static readonly EPSILON: number = 0.05;

  /**
   * Only vector paths and shapes with strokes are trimable.
   * Non-vector elements (image, text, foreignObject, defs, style, etc.) are strictly excluded.
   */
  public static isTrimable(el: VectorElement): boolean {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tag);
  }

  /**
   * Finds the set of source element IDs belonging to the connected topological graph
   * of the deleted subsegments. Any element not connected to this sub-graph remains untouched.
   */
  public static findConnectedElementIds(
    allSubSegments: TrimSubSegment[],
    deletedSubSegIds: Set<string>
  ): Set<string> {
    const deletedSubSegs = allSubSegments.filter((s) => deletedSubSegIds.has(s.id));
    if (deletedSubSegs.length === 0) return new Set();

    const subSegById = new Map<string, TrimSubSegment>();
    for (const seg of allSubSegments) {
      subSegById.set(seg.id, seg);
    }

    const eps = SegmentTrimEngine.EPSILON;
    const touches = (s1: TrimSubSegment, s2: TrimSubSegment): boolean => {
      return (
        Math.hypot(s1.p1.x - s2.p1.x, s1.p1.y - s2.p1.y) <= eps ||
        Math.hypot(s1.p1.x - s2.p2.x, s1.p1.y - s2.p2.y) <= eps ||
        Math.hypot(s1.p2.x - s2.p1.x, s1.p2.y - s2.p1.y) <= eps ||
        Math.hypot(s1.p2.x - s2.p2.x, s1.p2.y - s2.p2.y) <= eps
      );
    };

    const initialElementIds = new Set(deletedSubSegs.map((s) => s.sourceElementId));
    const visitedSegIds = new Set<string>();
    const queue: TrimSubSegment[] = [];

    for (const seg of allSubSegments) {
      if (initialElementIds.has(seg.sourceElementId)) {
        visitedSegIds.add(seg.id);
        queue.push(seg);
      }
    }

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const seg of allSubSegments) {
        if (!visitedSegIds.has(seg.id)) {
          if (seg.sourceElementId === cur.sourceElementId || touches(seg, cur)) {
            visitedSegIds.add(seg.id);
            queue.push(seg);
          }
        }
      }
    }

    const affectedElementIds = new Set<string>();
    for (const id of visitedSegIds) {
      const s = subSegById.get(id);
      if (s) {
        affectedElementIds.add(s.sourceElementId);
      }
    }

    return affectedElementIds;
  }

  /**
   * Decomposes candidate elements into all atomic sub-segments partitioned by intersection points.
   */
  public static extractSubSegments(elements: VectorElement[], model: VectorModel): TrimSubSegment[] {
    if (!elements || elements.length === 0) return [];

    // 1. Extract linear and curved raw segments from all elements
    const rawSegments = this.extractRawSegments(elements, model);
    if (rawSegments.length === 0) return [];

    // 2. Find all mutual intersections and register split parameters
    this.computeIntersections(rawSegments);

    // 3. Subdivide raw segments at split parameters
    const subSegments: TrimSubSegment[] = [];
    let idCounter = 1;

    for (const raw of rawSegments) {
      const splits = Array.from(new Set(raw.splits)).sort((a, b) => a - b);
      for (let i = 0; i < splits.length - 1; i++) {
        const t0 = splits[i];
        const t1 = splits[i + 1];
        if (t1 - t0 < 1e-4) continue;

        let pt0: Point;
        let pt1: Point;
        let isBezier = false;
        let h1: Point | undefined;
        let h2: Point | undefined;

        if (raw.isBezier && raw.h1 && raw.h2) {
          isBezier = true;
          // De Casteljau subdivision for sub-interval [t0, t1]
          const subCurve = this.subdivideCubicBezier(raw.p1, raw.h1, raw.h2, raw.p2, t0, t1);
          pt0 = subCurve.p0;
          h1 = subCurve.p1;
          h2 = subCurve.p2;
          pt1 = subCurve.p3;
        } else {
          pt0 = {
            x: raw.p1.x + t0 * (raw.p2.x - raw.p1.x),
            y: raw.p1.y + t0 * (raw.p2.y - raw.p1.y),
          };
          pt1 = {
            x: raw.p1.x + t1 * (raw.p2.x - raw.p1.x),
            y: raw.p1.y + t1 * (raw.p2.y - raw.p1.y),
          };
        }

        const len = Math.hypot(pt1.x - pt0.x, pt1.y - pt0.y);
        if (len > 0.05) {
          subSegments.push({
            id: `subseg_${idCounter++}`,
            sourceElementId: raw.sourceElementId,
            p1: pt0,
            p2: pt1,
            isBezier,
            h1,
            h2,
            stroke: raw.stroke || '#ffffff',
            strokeWidth: raw.strokeWidth || 1,
            strokeDasharray: raw.strokeDasharray,
            strokeLinecap: raw.strokeLinecap,
            strokeLinejoin: raw.strokeLinejoin,
            fill: raw.fill,
          });
        }
      }
    }

    return subSegments;
  }

  /**
   * Finds the sub-segment closest to the cursor point within threshold.
   */
  public static findSubSegmentAtPoint(
    pt: Point,
    subSegments: TrimSubSegment[],
    threshold: number = 8
  ): TrimSubSegment | null {
    let closestSeg: TrimSubSegment | null = null;
    let minDistance = threshold;

    for (const seg of subSegments) {
      const dist = this.distanceToSubSegment(pt, seg);
      if (dist < minDistance) {
        minDistance = dist;
        closestSeg = seg;
      }
    }

    return closestSeg;
  }

  /**
   * Deletes one or more sub-segments by ID and executes topological welding on the remaining graph.
   * Returns the new list of VectorElements to replace the original source elements.
   */
  public static trimAndWeld(
    allSubSegments: TrimSubSegment[],
    deletedIds: Set<string>,
    originalElements: VectorElement[]
  ): VectorElement[] {
    const remaining = allSubSegments.filter((s) => !deletedIds.has(s.id));
    if (remaining.length === 0) return [];

    // 1. Quantize nodes into spatial clusters
    interface NodeRecord {
      id: string;
      pt: Point;
      incident: Array<{
        seg: TrimSubSegment;
        end: 'p1' | 'p2';
      }>;
    }

    const nodes: NodeRecord[] = [];

    const findOrCreateNode = (p: Point): NodeRecord => {
      for (const node of nodes) {
        if (Math.hypot(node.pt.x - p.x, node.pt.y - p.y) <= SegmentTrimEngine.EPSILON) {
          return node;
        }
      }
      const newNode: NodeRecord = {
        id: `node_${nodes.length + 1}`,
        pt: { x: p.x, y: p.y },
        incident: [],
      };
      nodes.push(newNode);
      return newNode;
    };

    // Populate incidence
    for (const seg of remaining) {
      const n1 = findOrCreateNode(seg.p1);
      const n2 = findOrCreateNode(seg.p2);
      n1.incident.push({ seg, end: 'p1' });
      n2.incident.push({ seg, end: 'p2' });
    }

    // 2. Trace continuous chains
    // A junction is weldable IF AND ONLY IF its degree k == 2.
    // If k >= 3 or k == 1, it is a boundary / termination point.
    const visitedSegs = new Set<string>();
    const synthesizedElements: VectorElement[] = [];

    // Helper: get the other node of a segment given one of its nodes
    const getOtherNode = (seg: TrimSubSegment, fromNode: NodeRecord): NodeRecord => {
      const dist1 = Math.hypot(fromNode.pt.x - seg.p1.x, fromNode.pt.y - seg.p1.y);
      const targetPt = dist1 <= SegmentTrimEngine.EPSILON ? seg.p2 : seg.p1;
      return nodes.find((n) => Math.hypot(n.pt.x - targetPt.x, n.pt.y - targetPt.y) <= SegmentTrimEngine.EPSILON) || fromNode;
    };

    // Helper: build path vertex chain from sequence of directed segments
    const assembleElementFromChain = (
      chain: Array<{ seg: TrimSubSegment; forward: boolean }>,
      isClosed: boolean
    ): VectorElement => {
      const first = chain[0];
      const startPt = first.forward ? first.seg.p1 : first.seg.p2;

      const vertices: PathVertex[] = [
        {
          id: `v_0`,
          x: Math.round(startPt.x * 100) / 100,
          y: Math.round(startPt.y * 100) / 100,
          command: 'M',
          nodeType: 'sharp',
        },
      ];

      for (let i = 0; i < chain.length; i++) {
        const item = chain[i];
        const seg = item.seg;
        const forward = item.forward;
        const endPt = forward ? seg.p2 : seg.p1;

        if (seg.isBezier && seg.h1 && seg.h2) {
          const hIn = forward ? seg.h2 : seg.h1;
          const hOut = forward ? seg.h1 : seg.h2;

          vertices[vertices.length - 1].handleOut = {
            x: Math.round(hOut.x * 100) / 100,
            y: Math.round(hOut.y * 100) / 100,
          };

          vertices.push({
            id: `v_${vertices.length}`,
            x: Math.round(endPt.x * 100) / 100,
            y: Math.round(endPt.y * 100) / 100,
            command: 'C',
            nodeType: 'smooth',
            handleIn: {
              x: Math.round(hIn.x * 100) / 100,
              y: Math.round(hIn.y * 100) / 100,
            },
          });
        } else {
          vertices.push({
            id: `v_${vertices.length}`,
            x: Math.round(endPt.x * 100) / 100,
            y: Math.round(endPt.y * 100) / 100,
            command: 'L',
            nodeType: 'sharp',
          });
        }
      }

      // If closed, remove duplicate coincident terminal vertex and set closed flag
      if (isClosed && vertices.length >= 3) {
        const lastV = vertices[vertices.length - 1];
        if (Math.hypot(lastV.x - vertices[0].x, lastV.y - vertices[0].y) <= SegmentTrimEngine.EPSILON) {
          vertices.pop();
        }
      }

      // Inherit styling from source element
      const srcEl = originalElements.find((el) => el.id === first.seg.sourceElementId);
      const stroke = srcEl?.attributes?.stroke || first.seg.stroke || '#ffffff';
      const strokeWidth = srcEl?.attributes?.['stroke-width'] || `${first.seg.strokeWidth || 1}`;
      const fill = isClosed ? srcEl?.attributes?.fill || 'none' : 'none';

      // Compile SVG d string
      let d = `M ${vertices[0].x} ${vertices[0].y}`;
      for (let i = 1; i < vertices.length; i++) {
        const v = vertices[i];
        if (v.command === 'C' && v.handleIn && vertices[i - 1].handleOut) {
          const prevOut = vertices[i - 1].handleOut!;
          d += ` C ${prevOut.x} ${prevOut.y} ${v.handleIn.x} ${v.handleIn.y} ${v.x} ${v.y}`;
        } else {
          d += ` L ${v.x} ${v.y}`;
        }
      }
      if (isClosed) {
        d += ' Z';
      }

      const newId = `trim_path_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      return {
        id: newId,
        tagName: 'path',
        attributes: {
          id: newId,
          d,
          fill,
          stroke,
          'stroke-width': strokeWidth,
          ...(first.seg.strokeDasharray ? { 'stroke-dasharray': first.seg.strokeDasharray } : {}),
          ...(first.seg.strokeLinecap ? { 'stroke-linecap': first.seg.strokeLinecap } : {}),
          ...(first.seg.strokeLinejoin ? { 'stroke-linejoin': first.seg.strokeLinejoin } : {}),
        },
        vertices,
      };
    };

    // Phase A: Trace chains starting from non-degree-2 nodes (degree 1 or degree >= 3)
    const terminalNodes = nodes.filter((n) => n.incident.length !== 2 && n.incident.length > 0);

    for (const startNode of terminalNodes) {
      for (const inc of startNode.incident) {
        if (visitedSegs.has(inc.seg.id)) continue;

        const chain: Array<{ seg: TrimSubSegment; forward: boolean }> = [];
        let curSeg = inc.seg;
        let curFromNode = startNode;

        while (curSeg && !visitedSegs.has(curSeg.id)) {
          visitedSegs.add(curSeg.id);
          const isForward = Math.hypot(curFromNode.pt.x - curSeg.p1.x, curFromNode.pt.y - curSeg.p1.y) <= SegmentTrimEngine.EPSILON;
          chain.push({ seg: curSeg, forward: isForward });

          const nextNode = getOtherNode(curSeg, curFromNode);
          if (nextNode.incident.length === 2) {
            // Find the other incident segment at this degree-2 node
            const otherInc = nextNode.incident.find((item) => item.seg.id !== curSeg.id);
            if (otherInc && !visitedSegs.has(otherInc.seg.id)) {
              curSeg = otherInc.seg;
              curFromNode = nextNode;
            } else {
              break;
            }
          } else {
            // Reached another terminal node (degree 1 or >= 3); terminate path without merger
            break;
          }
        }

        if (chain.length > 0) {
          const lastItem = chain[chain.length - 1];
          const lastEndPt = lastItem.forward ? lastItem.seg.p2 : lastItem.seg.p1;
          const isCycle = Math.hypot(startNode.pt.x - lastEndPt.x, startNode.pt.y - lastEndPt.y) <= SegmentTrimEngine.EPSILON;
          synthesizedElements.push(assembleElementFromChain(chain, isCycle));
        }
      }
    }

    // Phase B: Trace closed cycles (all remaining unvisited segments must have degree 2 at both ends)
    for (const seg of remaining) {
      if (visitedSegs.has(seg.id)) continue;

      const chain: Array<{ seg: TrimSubSegment; forward: boolean }> = [];
      let curSeg: TrimSubSegment | null = seg;
      let curFromNode = findOrCreateNode(seg.p1);

      while (curSeg && !visitedSegs.has(curSeg.id)) {
        visitedSegs.add(curSeg.id);
        const isForward = Math.hypot(curFromNode.pt.x - curSeg.p1.x, curFromNode.pt.y - curSeg.p1.y) <= SegmentTrimEngine.EPSILON;
        chain.push({ seg: curSeg, forward: isForward });

        const nextNode = getOtherNode(curSeg, curFromNode);
        if (nextNode.incident.length === 2) {
          const otherInc = nextNode.incident.find((item) => item.seg.id !== curSeg!.id);
          if (otherInc && !visitedSegs.has(otherInc.seg.id)) {
            curSeg = otherInc.seg;
            curFromNode = nextNode;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      if (chain.length > 0) {
        synthesizedElements.push(assembleElementFromChain(chain, true));
      }
    }

    return synthesizedElements;
  }

  // --------------------------------------------------------------------------
  // Private Geometric Utilities
  // --------------------------------------------------------------------------

  private static extractRawSegments(elements: VectorElement[], model: VectorModel): RawSeg[] {
    const raw: RawSeg[] = [];

    for (const el of elements) {
      if (!this.isTrimable(el)) continue;

      let vertices = el.vertices;
      if (!vertices || vertices.length === 0) {
        vertices = model.convertShapeToVertices(el.tagName, el.attributes);
      }
      if (!vertices || vertices.length < 2) continue;

      const isClosed = model.isElementClosed(el);
      const stroke = el.attributes?.stroke || '#ffffff';
      const strokeWidth = parseFloat(el.attributes?.['stroke-width'] || '1') || 1;
      const strokeDasharray = el.attributes?.['stroke-dasharray'];
      const strokeLinecap = el.attributes?.['stroke-linecap'];
      const strokeLinejoin = el.attributes?.['stroke-linejoin'];
      const fill = el.attributes?.fill;

      // Group vertices into subpaths
      const subpaths: PathVertex[][] = [];
      let cur: PathVertex[] = [];
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        if ((v.command === 'M' || i === 0) && cur.length > 0) {
          subpaths.push(cur);
          cur = [];
        }
        cur.push(v);
      }
      if (cur.length > 0) subpaths.push(cur);

      for (const sp of subpaths) {
        if (sp.length < 2) continue;

        const count = isClosed && sp.length >= 3 ? sp.length : sp.length - 1;
        for (let i = 0; i < count; i++) {
          const vA = sp[i];
          const vB = sp[(i + 1) % sp.length];

          if (vA.handleOut || vB.handleIn) {
            const h1 = vA.handleOut ? { x: vA.handleOut.x, y: vA.handleOut.y } : { x: vA.x, y: vA.y };
            const h2 = vB.handleIn ? { x: vB.handleIn.x, y: vB.handleIn.y } : { x: vB.x, y: vB.y };
            raw.push({
              sourceElementId: el.id,
              p1: { x: vA.x, y: vA.y },
              p2: { x: vB.x, y: vB.y },
              isBezier: true,
              h1,
              h2,
              stroke,
              strokeWidth,
              strokeDasharray,
              strokeLinecap,
              strokeLinejoin,
              fill,
              splits: [0, 1],
            });
          } else {
            raw.push({
              sourceElementId: el.id,
              p1: { x: vA.x, y: vA.y },
              p2: { x: vB.x, y: vB.y },
              stroke,
              strokeWidth,
              strokeDasharray,
              strokeLinecap,
              strokeLinejoin,
              fill,
              splits: [0, 1],
            });
          }
        }
      }
    }

    return raw;
  }

  private static computeIntersections(segments: RawSeg[]): void {
    const n = segments.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sA = segments[i];
        const sB = segments[j];

        // AABB check
        const minXA = Math.min(sA.p1.x, sA.p2.x, sA.h1?.x ?? Infinity, sA.h2?.x ?? Infinity);
        const maxXA = Math.max(sA.p1.x, sA.p2.x, sA.h1?.x ?? -Infinity, sA.h2?.x ?? -Infinity);
        const minYA = Math.min(sA.p1.y, sA.p2.y, sA.h1?.y ?? Infinity, sA.h2?.y ?? Infinity);
        const maxYA = Math.max(sA.p1.y, sA.p2.y, sA.h1?.y ?? -Infinity, sA.h2?.y ?? -Infinity);

        const minXB = Math.min(sB.p1.x, sB.p2.x, sB.h1?.x ?? Infinity, sB.h2?.x ?? Infinity);
        const maxXB = Math.max(sB.p1.x, sB.p2.x, sB.h1?.x ?? -Infinity, sB.h2?.x ?? -Infinity);
        const minYB = Math.min(sB.p1.y, sB.p2.y, sB.h1?.y ?? Infinity, sB.h2?.y ?? Infinity);
        const maxYB = Math.max(sB.p1.y, sB.p2.y, sB.h1?.y ?? -Infinity, sB.h2?.y ?? -Infinity);

        if (maxXA < minXB - 0.05 || minXA > maxXB + 0.05 || maxYA < minYB - 0.05 || minYA > maxYB + 0.05) {
          continue;
        }

        if (!sA.isBezier && !sB.isBezier) {
          // Line-line intersection
          const inter = this.lineLineIntersection(sA.p1, sA.p2, sB.p1, sB.p2);
          if (inter) {
            sA.splits.push(inter.tA);
            sB.splits.push(inter.tB);
          }
        } else {
          // Sample-based Bézier intersection
          this.curveIntersection(sA, sB);
        }
      }
    }
  }

  private static lineLineIntersection(
    p1: Point,
    p2: Point,
    p3: Point,
    p4: Point
  ): { tA: number; tB: number } | null {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < 1e-8) return null;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    if (ua >= -0.005 && ua <= 1.005 && ub >= -0.005 && ub <= 1.005) {
      return {
        tA: Math.max(0, Math.min(1, ua)),
        tB: Math.max(0, Math.min(1, ub)),
      };
    }
    return null;
  }

  private static curveIntersection(sA: RawSeg, sB: RawSeg): void {
    // Sample sA and sB into 16 piecewise line segments and compute pairwise linear intersections
    const steps = 16;
    const ptsA: Point[] = [];
    const ptsB: Point[] = [];

    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      ptsA.push(sA.isBezier && sA.h1 && sA.h2 ? this.evalCubicBezier(sA.p1, sA.h1, sA.h2, sA.p2, t) : {
        x: sA.p1.x + t * (sA.p2.x - sA.p1.x),
        y: sA.p1.y + t * (sA.p2.y - sA.p1.y),
      });
      ptsB.push(sB.isBezier && sB.h1 && sB.h2 ? this.evalCubicBezier(sB.p1, sB.h1, sB.h2, sB.p2, t) : {
        x: sB.p1.x + t * (sB.p2.x - sB.p1.x),
        y: sB.p1.y + t * (sB.p2.y - sB.p1.y),
      });
    }

    for (let a = 0; a < steps; a++) {
      for (let b = 0; b < steps; b++) {
        const inter = this.lineLineIntersection(ptsA[a], ptsA[a + 1], ptsB[b], ptsB[b + 1]);
        if (inter) {
          const tA = (a + inter.tA) / steps;
          const tB = (b + inter.tB) / steps;
          sA.splits.push(Math.max(0, Math.min(1, tA)));
          sB.splits.push(Math.max(0, Math.min(1, tB)));
        }
      }
    }
  }

  private static evalCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const inv = 1 - t;
    return {
      x: inv * inv * inv * p0.x + 3 * inv * inv * t * p1.x + 3 * inv * t * t * p2.x + t * t * t * p3.x,
      y: inv * inv * inv * p0.y + 3 * inv * inv * t * p1.y + 3 * inv * t * t * p2.y + t * t * t * p3.y,
    };
  }

  private static subdivideCubicBezier(
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    t0: number,
    t1: number
  ): { p0: Point; p1: Point; p2: Point; p3: Point } {
    const splitAt = (c0: Point, c1: Point, c2: Point, c3: Point, t: number) => {
      const q0 = { x: c0.x + t * (c1.x - c0.x), y: c0.y + t * (c1.y - c0.y) };
      const q1 = { x: c1.x + t * (c2.x - c1.x), y: c1.y + t * (c2.y - c1.y) };
      const q2 = { x: c2.x + t * (c3.x - c2.x), y: c2.y + t * (c3.y - c2.y) };
      const r0 = { x: q0.x + t * (q1.x - q0.x), y: q0.y + t * (q1.y - q0.y) };
      const r1 = { x: q1.x + t * (q2.x - q1.x), y: q1.y + t * (q2.y - q1.y) };
      const s = { x: r0.x + t * (r1.x - r0.x), y: r0.y + t * (r1.y - r0.y) };
      return {
        left: { p0: c0, p1: q0, p2: r0, p3: s },
        right: { p0: s, p1: r1, p2: q2, p3: c3 },
      };
    };

    let curve = { p0, p1, p2, p3 };
    if (t0 > 1e-5) {
      curve = splitAt(curve.p0, curve.p1, curve.p2, curve.p3, t0).right;
    }
    const u = (t1 - t0) / Math.max(1e-5, 1 - t0);
    return splitAt(curve.p0, curve.p1, curve.p2, curve.p3, Math.max(0, Math.min(1, u))).left;
  }

  private static distanceToSubSegment(pt: Point, seg: TrimSubSegment): number {
    if (!seg.isBezier) {
      return this.distanceToLineSegment(pt, seg.p1, seg.p2);
    }
    // For Bézier: sample 12 points and check minimum distance
    let minDist = Infinity;
    const samples = 12;
    let prev = seg.p1;
    for (let k = 1; k <= samples; k++) {
      const t = k / samples;
      const cur = this.evalCubicBezier(seg.p1, seg.h1 || seg.p1, seg.h2 || seg.p2, seg.p2, t);
      const d = this.distanceToLineSegment(pt, prev, cur);
      if (d < minDist) minDist = d;
      prev = cur;
    }
    return minDist;
  }

  private static distanceToLineSegment(pt: Point, p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-8) {
      return Math.hypot(pt.x - p1.x, pt.y - p1.y);
    }
    const t = Math.max(0, Math.min(1, ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    return Math.hypot(pt.x - projX, pt.y - projY);
  }
}
