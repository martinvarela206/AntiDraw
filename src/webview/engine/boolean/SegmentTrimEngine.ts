import { VectorElement, PathVertex, VectorModel, Point } from '../VectorModel.js';
import { PolygonUtils } from './PolygonUtils.js';

export interface TrimSubSegment {
  id: string;
  sourceElementId: string;
  subpathId?: string;
  isClosedSubpath?: boolean;
  subpathSeq?: number;
  subpathTotal?: number;
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
  subpathId: string;
  isClosedSubpath: boolean;
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
            subpathId: raw.subpathId,
            isClosedSubpath: raw.isClosedSubpath,
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

    // Populate subpathSeq and subpathTotal per subpath
    const bySubpath = new Map<string, TrimSubSegment[]>();
    for (const s of subSegments) {
      if (s.subpathId) {
        if (!bySubpath.has(s.subpathId)) bySubpath.set(s.subpathId, []);
        bySubpath.get(s.subpathId)!.push(s);
      }
    }
    for (const list of bySubpath.values()) {
      for (let i = 0; i < list.length; i++) {
        list[i].subpathSeq = i;
        list[i].subpathTotal = list.length;
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
        if (Math.hypot(lastV.x - vertices[0].x, lastV.y - vertices[0].y) <= Math.max(SegmentTrimEngine.EPSILON, 0.1)) {
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

    const eps = SegmentTrimEngine.EPSILON;

    // Spatial node registry for remaining subsegments to evaluate junction valence
    interface NodeInfo {
      pt: Point;
      segs: Array<{ seg: TrimSubSegment; end: 'p1' | 'p2' }>;
    }
    const nodes: NodeInfo[] = [];
    const getNodeAt = (p: Point): NodeInfo => {
      for (const n of nodes) {
        if (Math.hypot(n.pt.x - p.x, n.pt.y - p.y) <= eps) return n;
      }
      const n: NodeInfo = { pt: p, segs: [] };
      nodes.push(n);
      return n;
    };

    for (const s of remaining) {
      getNodeAt(s.p1).segs.push({ seg: s, end: 'p1' });
      getNodeAt(s.p2).segs.push({ seg: s, end: 'p2' });
    }

    // Check if an intermediate connection point P is a branch barrier
    const isBarrier = (p: Point, sourceElementId: string): boolean => {
      const node = getNodeAt(p);
      const k = node.segs.length;
      if (k === 2 || k === 4) return false;
      // If k == 3 or k >= 5 and subsegments from other elements converge here, it's an ambiguous branch barrier
      const hasOtherElements = node.segs.some((item) => item.seg.sourceElementId !== sourceElementId);
      return hasOtherElements;
    };

    // 1. Group remaining subsegments by subpathId to form natural continuous chains
    const subsegsBySubpath = new Map<string, TrimSubSegment[]>();
    const unassigned: TrimSubSegment[] = [];

    for (const s of remaining) {
      if (s.subpathId !== undefined) {
        if (!subsegsBySubpath.has(s.subpathId)) {
          subsegsBySubpath.set(s.subpathId, []);
        }
        subsegsBySubpath.get(s.subpathId)!.push(s);
      } else {
        unassigned.push(s);
      }
    }

    interface ChainRecord {
      id: string;
      items: Array<{ seg: TrimSubSegment; forward: boolean }>;
      pStart: Point;
      pEnd: Point;
      isClosed: boolean;
      sourceElementId: string;
    }

    const naturalChains: ChainRecord[] = [];
    let chainCounter = 1;

    for (const [subpathId, list] of subsegsBySubpath.entries()) {
      list.sort((a, b) => (a.subpathSeq ?? 0) - (b.subpathSeq ?? 0));
      const isClosedSubpath = list[0]?.isClosedSubpath ?? false;
      const total = list[0]?.subpathTotal ?? list.length;
      const remainingSeqs = new Set(list.map((s) => s.subpathSeq ?? 0));

      // If it was closed and NO subsegments were deleted, check for branch barriers
      let hasBarrierInFullLoop = false;
      if (isClosedSubpath && list.length === total) {
        for (const s of list) {
          if (isBarrier(s.p1, s.sourceElementId) || isBarrier(s.p2, s.sourceElementId)) {
            hasBarrierInFullLoop = true;
            break;
          }
        }
        if (!hasBarrierInFullLoop) {
          naturalChains.push({
            id: `chain_${chainCounter++}`,
            items: list.map((s) => ({ seg: s, forward: true })),
            pStart: list[0].p1,
            pEnd: list[list.length - 1].p2,
            isClosed: true,
            sourceElementId: list[0].sourceElementId,
          });
          continue;
        }
      }

      const canConnectToNext = (curSeg: TrimSubSegment, nextSeq: number): boolean => {
        if (!remainingSeqs.has(nextSeq)) return false;
        if (isBarrier(curSeg.p2, curSeg.sourceElementId)) return false;
        return true;
      };

      // Otherwise, trace open continuous runs along this subpath
      const visitedSeqs = new Set<number>();
      for (const seg of list) {
        const seq = seg.subpathSeq ?? 0;
        if (visitedSeqs.has(seq)) continue;

        // Find start of run
        let startSeq = seq;
        if (isClosedSubpath) {
          while (true) {
            const prevSeq = (startSeq - 1 + total) % total;
            if (!remainingSeqs.has(prevSeq) || visitedSeqs.has(prevSeq)) break;
            const prevSeg = list.find((s) => (s.subpathSeq ?? 0) === prevSeq);
            if (!prevSeg || !canConnectToNext(prevSeg, startSeq)) break;
            startSeq = prevSeq;
            if (startSeq === seq) break;
          }
        } else {
          while (startSeq > 0) {
            const prevSeq = startSeq - 1;
            if (!remainingSeqs.has(prevSeq)) break;
            const prevSeg = list.find((s) => (s.subpathSeq ?? 0) === prevSeq);
            if (!prevSeg || !canConnectToNext(prevSeg, startSeq)) break;
            startSeq = prevSeq;
          }
        }

        const run: TrimSubSegment[] = [];
        let curSeq = startSeq;
        while (remainingSeqs.has(curSeq) && !visitedSeqs.has(curSeq)) {
          visitedSeqs.add(curSeq);
          const curSeg = list.find((s) => (s.subpathSeq ?? 0) === curSeq);
          if (curSeg) {
            run.push(curSeg);
            const nextSeq = isClosedSubpath ? (curSeq + 1) % total : curSeq + 1;
            if (!canConnectToNext(curSeg, nextSeq)) break;
            if (isClosedSubpath && nextSeq === startSeq) break;
            curSeq = nextSeq;
          } else {
            break;
          }
        }

        if (run.length > 0) {
          const isLoop = isClosedSubpath && run.length === total && !hasBarrierInFullLoop;
          naturalChains.push({
            id: `chain_${chainCounter++}`,
            items: run.map((s) => ({ seg: s, forward: true })),
            pStart: run[0].p1,
            pEnd: run[run.length - 1].p2,
            isClosed: isLoop,
            sourceElementId: run[0].sourceElementId,
          });
        }
      }
    }

    // For any unassigned subsegments (fallback): each is a single-segment chain
    for (const u of unassigned) {
      naturalChains.push({
        id: `chain_${chainCounter++}`,
        items: [{ seg: u, forward: true }],
        pStart: u.p1,
        pEnd: u.p2,
        isClosed: false,
        sourceElementId: u.sourceElementId,
      });
    }

    // 2. Separate closed cycles from open chains
    const closedChains = naturalChains.filter((c) => c.isClosed);
    let openChains = naturalChains.filter((c) => !c.isClosed);

    // 3. Topological welding of open chains at degree-2 cut endpoints
    let changed = true;
    while (changed && openChains.length > 0) {
      changed = false;

      interface EndpointRef {
        chainIdx: number;
        end: 'start' | 'end';
        pt: Point;
      }

      const clusters: EndpointRef[][] = [];
      const findCluster = (p: Point) => {
        for (const cl of clusters) {
          if (Math.hypot(cl[0].pt.x - p.x, cl[0].pt.y - p.y) <= eps) {
            return cl;
          }
        }
        return null;
      };

      for (let cIdx = 0; cIdx < openChains.length; cIdx++) {
        const c = openChains[cIdx];
        // start endpoint
        let clStart = findCluster(c.pStart);
        if (!clStart) {
          clStart = [];
          clusters.push(clStart);
        }
        clStart.push({ chainIdx: cIdx, end: 'start', pt: c.pStart });

        // end endpoint
        let clEnd = findCluster(c.pEnd);
        if (!clEnd) {
          clEnd = [];
          clusters.push(clEnd);
        }
        clEnd.push({ chainIdx: cIdx, end: 'end', pt: c.pEnd });
      }

      for (const cl of clusters) {
        if (cl.length === 2) {
          const refA = cl[0];
          const refB = cl[1];

          // If both ends belong to the SAME chain: it formed a closed cycle!
          if (refA.chainIdx === refB.chainIdx) {
            const ch = openChains[refA.chainIdx];
            ch.isClosed = true;
            closedChains.push(ch);
            openChains.splice(refA.chainIdx, 1);
            changed = true;
            break;
          }

          // Merge chain B into chain A
          const idxA = Math.min(refA.chainIdx, refB.chainIdx);
          const idxB = Math.max(refA.chainIdx, refB.chainIdx);
          const rA = refA.chainIdx === idxA ? refA : refB;
          const rB = refA.chainIdx === idxB ? refA : refB;

          const chainA = openChains[idxA];
          const chainB = openChains[idxB];

          let itemsB = [...chainB.items];
          const pStartB = chainB.pStart;
          const pEndB = chainB.pEnd;

          if (rA.end === 'end' && rB.end === 'start') {
            chainA.items.push(...itemsB);
            chainA.pEnd = pEndB;
          } else if (rA.end === 'end' && rB.end === 'end') {
            itemsB.reverse();
            itemsB = itemsB.map((item) => ({ seg: item.seg, forward: !item.forward }));
            chainA.items.push(...itemsB);
            chainA.pEnd = pStartB;
          } else if (rA.end === 'start' && rB.end === 'end') {
            chainA.items.unshift(...itemsB);
            chainA.pStart = pStartB;
          } else if (rA.end === 'start' && rB.end === 'start') {
            itemsB.reverse();
            itemsB = itemsB.map((item) => ({ seg: item.seg, forward: !item.forward }));
            chainA.items.unshift(...itemsB);
            chainA.pStart = pEndB;
          }

          openChains.splice(idxB, 1);
          changed = true;
          break;
        }
      }
    }

    // Check if any open chain has coincident start and end
    for (let i = openChains.length - 1; i >= 0; i--) {
      const ch = openChains[i];
      if (Math.hypot(ch.pStart.x - ch.pEnd.x, ch.pStart.y - ch.pEnd.y) <= eps) {
        ch.isClosed = true;
        closedChains.push(ch);
        openChains.splice(i, 1);
      }
    }

    // 4. Assemble synthesized VectorElements
    const synthesizedElements: VectorElement[] = [];
    for (const c of [...closedChains, ...openChains]) {
      synthesizedElements.push(assembleElementFromChain(c.items, c.isClosed));
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

      for (let spIdx = 0; spIdx < subpaths.length; spIdx++) {
        const sp = subpaths[spIdx];
        if (sp.length < 2) continue;
        const subpathId = `${el.id}_sp_${spIdx}`;
        const isClosedSubpath = isClosed;

        const count = isClosed && sp.length >= 3 ? sp.length : sp.length - 1;
        for (let i = 0; i < count; i++) {
          const vA = sp[i];
          const vB = sp[(i + 1) % sp.length];

          if (vA.handleOut || vB.handleIn) {
            const h1 = vA.handleOut ? { x: vA.handleOut.x, y: vA.handleOut.y } : { x: vA.x, y: vA.y };
            const h2 = vB.handleIn ? { x: vB.handleIn.x, y: vB.handleIn.y } : { x: vB.x, y: vB.y };
            raw.push({
              sourceElementId: el.id,
              subpathId,
              isClosedSubpath,
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
              subpathId,
              isClosedSubpath,
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
