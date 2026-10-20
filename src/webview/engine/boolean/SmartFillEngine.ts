import { VectorElement, PathVertex, VectorModel, Point } from '../VectorModel.js';
import { PolygonUtils } from './PolygonUtils.js';
import { Pair } from 'polygon-clipping';

export interface SmartFillOptions {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  tolerance?: number;
}

export interface EnclosedRegion {
  id: string;
  ring: Point[];
  area: number;
  signedArea: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface Segment {
  p1: Point;
  p2: Point;
  splits: number[];
}

interface HalfEdge {
  id: number;
  from: number;
  to: number;
  angle: number;
  twinId: number;
}

/**
 * ARCHITECTURAL RATIONALE: Planar Graph Arrangement & Smart Fill Engine (SmartFillEngine)
 *
 * 1. Planar Graph Sub-Division (DCEL - Doubly Connected Edge List):
 *    Unlike raster flood-fills or simple polygon-clipping operations that require closed polygons,
 *    Smart Fill decomposes the visible vector contours (both open paths, lines, and closed shapes)
 *    into a planar arrangement of non-intersecting edges and vertices.
 *
 * 2. High-Precision Segment Intersection & De-clustering:
 *    Calculates all analytical line-line intersections across sampled Bézier curves and straight edges.
 *    Splits each edge into atomic sub-segments and quantizes vertex coordinates with an spatial hash
 *    to eliminate floating-point micro-cracks and numerical singularities.
 *
 * 3. Topological Face Extraction:
 *    At each vertex, outgoing half-edges are sorted by polar angle in counter-clockwise order.
 *    Traversing from each incoming half-edge to the next outgoing half-edge in cyclic angular order
 *    partitions the edge set into minimal bounded faces (regions) and the unbounded exterior face.
 *
 * 4. Minimal Enclosing Region Point Query (Ray-Casting):
 *    Identifies the unique bounded face enclosing the user's click coordinate P = (x, y).
 *    In concentric or nested configurations, selects the minimal area face to ensure exact hit resolution.
 *
 * 5. Analytical Smoothing & Vector Synthesis:
 *    Re-fits the resulting polygonal boundary ring through Schneider cubic Bézier fitting (`PolygonUtils.ringToFittedVertices`),
 *    preserving sharp corner angles while restoring smooth continuous curves. Synthesizes an independent
 *    freeform `<path>` element with `fill-rule="evenodd"` and leaves original source vectors unmutated.
 */
export class SmartFillEngine {
  /**
   * Detects all minimal bounded enclosed regions formed by intersecting vector elements.
   */
  public static detectAllRegions(elements: VectorElement[], model: VectorModel): EnclosedRegion[] {
    if (!elements || elements.length === 0) return [];

    // 1. Extract linear segments from all elements
    const rawSegments = this.extractSegments(elements, model);
    if (rawSegments.length < 2) {
      // If there are fewer than 2 segments, check if a single closed element exists
      if (elements.length === 1 && model.isElementClosed(elements[0]) && elements[0].vertices && elements[0].vertices.length >= 3) {
        return [this.elementToSingleRegion(elements[0])];
      }
      return [];
    }

    // 2. Compute all pairwise intersections and split segments
    const splitSegments = this.splitIntersectingSegments(rawSegments);
    if (splitSegments.length < 3) return [];

    // 3. Build planar graph (quantize vertices and build half-edges)
    const { vertices, halfEdges, outEdges } = this.buildPlanarGraph(splitSegments);
    if (vertices.length < 3 || halfEdges.length < 6) return [];

    // 4. Extract all face cycles
    const rawFaces = this.extractFaces(vertices, halfEdges, outEdges);

    // 5. Filter out outer infinite face and degenerate 0-area cycles
    return this.filterBoundedRegions(rawFaces, vertices);
  }

  /**
   * Finds the minimal enclosed region containing point P from an already detected list of regions.
   */
  public static findRegionAtPoint(pt: Point, regions: EnclosedRegion[]): EnclosedRegion | null {
    if (!regions || regions.length === 0) return null;

    const matchingRegions: EnclosedRegion[] = [];
    for (const region of regions) {
      // Fast AABB pre-check
      if (
        pt.x < region.bounds.minX - 0.5 ||
        pt.x > region.bounds.maxX + 0.5 ||
        pt.y < region.bounds.minY - 0.5 ||
        pt.y > region.bounds.maxY + 0.5
      ) {
        continue;
      }

      if (this.pointInPolygon(pt, region.ring)) {
        matchingRegions.push(region);
      }
    }

    if (matchingRegions.length === 0) return null;

    // Pick the innermost, minimal area region
    matchingRegions.sort((a, b) => a.area - b.area);
    return matchingRegions[0];
  }

  /**
   * Detects the minimal enclosed region containing point P and returns a new independent filled VectorElement.
   */
  public static fillRegionAtPoint(
    pt: Point,
    elements: VectorElement[],
    model: VectorModel,
    options?: SmartFillOptions,
    precomputedRegions?: EnclosedRegion[]
  ): VectorElement | null {
    const regions =
      precomputedRegions && precomputedRegions.length > 0
        ? precomputedRegions
        : this.detectAllRegions(elements, model);
    if (regions.length === 0) return null;

    const targetRegion = this.findRegionAtPoint(pt, regions);
    if (!targetRegion) return null;

    // Convert region ring to fitted vertices and SVG path
    return this.regionToVectorElement(targetRegion, model, options);
  }

  /**
   * Tests whether a 2D point is inside a polygon ring using the Jordan curve theorem ray-casting algorithm.
   */
  public static pointInPolygon(pt: Point, ring: Point[]): boolean {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i].x;
      const yi = ring[i].y;
      const xj = ring[j].x;
      const yj = ring[j].y;

      const intersect =
        yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Decomposes all input vector elements into linear segments.
   */
  private static extractSegments(elements: VectorElement[], model: VectorModel): Segment[] {
    const segments: Segment[] = [];

    const addSeg = (p1: Point, p2: Point) => {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist > 0.05) {
        segments.push({
          p1: { x: p1.x, y: p1.y },
          p2: { x: p2.x, y: p2.y },
          splits: [0, 1],
        });
      }
    };

    for (const el of elements) {
      let vertices = el.vertices;
      if (!vertices || vertices.length === 0) {
        vertices = model.convertShapeToVertices(el.tagName, el.attributes);
      }
      if (!vertices || vertices.length < 2) continue;

      const isClosed = model.isElementClosed(el);

      // Group vertices by subpaths
      const subpaths: PathVertex[][] = [];
      let currentSubpath: PathVertex[] = [];

      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        if ((v.command === 'M' || i === 0) && currentSubpath.length > 0) {
          subpaths.push(currentSubpath);
          currentSubpath = [];
        }
        currentSubpath.push(v);
      }
      if (currentSubpath.length > 0) {
        subpaths.push(currentSubpath);
      }

      for (const sp of subpaths) {
        if (sp.length < 2) continue;

        for (let i = 0; i < sp.length - 1; i++) {
          const vA = sp[i];
          const vB = sp[i + 1];

          if (vA.handleOut || vB.handleIn) {
            const h1 = vA.handleOut || { x: vA.x, y: vA.y };
            const h2 = vB.handleIn || { x: vB.x, y: vB.y };
            const sampled = PolygonUtils.sampleBezier(vA, h1, h2, vB, 20);
            let prevPt = { x: vA.x, y: vA.y };
            for (const pt of sampled) {
              const nextPt = { x: pt[0], y: pt[1] };
              addSeg(prevPt, nextPt);
              prevPt = nextPt;
            }
          } else {
            addSeg({ x: vA.x, y: vA.y }, { x: vB.x, y: vB.y });
          }
        }

        // Close subpath if required
        if (isClosed && sp.length >= 3) {
          const vLast = sp[sp.length - 1];
          const vFirst = sp[0];
          if (vLast.handleOut || vFirst.handleIn) {
            const h1 = vLast.handleOut || { x: vLast.x, y: vLast.y };
            const h2 = vFirst.handleIn || { x: vFirst.x, y: vFirst.y };
            const sampled = PolygonUtils.sampleBezier(vLast, h1, h2, vFirst, 20);
            let prevPt = { x: vLast.x, y: vLast.y };
            for (const pt of sampled) {
              const nextPt = { x: pt[0], y: pt[1] };
              addSeg(prevPt, nextPt);
              prevPt = nextPt;
            }
          } else {
            addSeg({ x: vLast.x, y: vLast.y }, { x: vFirst.x, y: vFirst.y });
          }
        }
      }
    }

    return segments;
  }

  /**
   * Finds all intersections between segment pairs and splits them into atomic segments.
   */
  private static splitIntersectingSegments(segments: Segment[]): Array<{ p1: Point; p2: Point }> {
    const n = segments.length;

    for (let i = 0; i < n; i++) {
      const s1 = segments[i];
      const a1 = s1.p1;
      const b1 = s1.p2;

      const minX1 = Math.min(a1.x, b1.x);
      const maxX1 = Math.max(a1.x, b1.x);
      const minY1 = Math.min(a1.y, b1.y);
      const maxY1 = Math.max(a1.y, b1.y);

      for (let j = i + 1; j < n; j++) {
        const s2 = segments[j];
        const a2 = s2.p1;
        const b2 = s2.p2;

        const minX2 = Math.min(a2.x, b2.x);
        const maxX2 = Math.max(a2.x, b2.x);
        const minY2 = Math.min(a2.y, b2.y);
        const maxY2 = Math.max(a2.y, b2.y);

        // AABB check with tolerance
        if (minX1 > maxX2 + 0.05 || maxX1 < minX2 - 0.05 || minY1 > maxY2 + 0.05 || maxY1 < minY2 - 0.05) {
          continue;
        }

        const dx1 = b1.x - a1.x;
        const dy1 = b1.y - a1.y;
        const dx2 = b2.x - a2.x;
        const dy2 = b2.y - a2.y;

        const det = dx1 * dy2 - dy1 * dx2;

        if (Math.abs(det) > 1e-8) {
          const dx0 = a2.x - a1.x;
          const dy0 = a2.y - a1.y;
          const t1 = (dx0 * dy2 - dy0 * dx2) / det;
          const t2 = (dx0 * dy1 - dy0 * dx1) / det;

          if (t1 >= -1e-5 && t1 <= 1 + 1e-5 && t2 >= -1e-5 && t2 <= 1 + 1e-5) {
            const clampedT1 = Math.max(0, Math.min(1, t1));
            const clampedT2 = Math.max(0, Math.min(1, t2));
            s1.splits.push(clampedT1);
            s2.splits.push(clampedT2);
          }
        } else {
          // Collinear check
          const distSq = dx1 * dx1 + dy1 * dy1;
          if (distSq > 1e-6) {
            const cross = (a2.x - a1.x) * dy1 - (a2.y - a1.y) * dx1;
            if (Math.abs(cross) < 1e-4) {
              const projA = ((a2.x - a1.x) * dx1 + (a2.y - a1.y) * dy1) / distSq;
              const projB = ((b2.x - a1.x) * dx1 + (b2.y - a1.y) * dy1) / distSq;
              if (projA >= 0 && projA <= 1) s1.splits.push(projA);
              if (projB >= 0 && projB <= 1) s1.splits.push(projB);
            }
          }
        }
      }
    }

    // Subdivide segments at split points
    const atomicSegments: Array<{ p1: Point; p2: Point }> = [];

    for (const seg of segments) {
      seg.splits.sort((a, b) => a - b);

      // Deduplicate splits
      const cleanSplits: number[] = [];
      for (const t of seg.splits) {
        if (cleanSplits.length === 0 || t - cleanSplits[cleanSplits.length - 1] > 1e-4) {
          cleanSplits.push(t);
        }
      }

      for (let k = 0; k < cleanSplits.length - 1; k++) {
        const t0 = cleanSplits[k];
        const t1 = cleanSplits[k + 1];

        const pt0: Point = {
          x: seg.p1.x + t0 * (seg.p2.x - seg.p1.x),
          y: seg.p1.y + t0 * (seg.p2.y - seg.p1.y),
        };
        const pt1: Point = {
          x: seg.p1.x + t1 * (seg.p2.x - seg.p1.x),
          y: seg.p1.y + t1 * (seg.p2.y - seg.p1.y),
        };

        if (Math.hypot(pt1.x - pt0.x, pt1.y - pt0.y) > 0.05) {
          atomicSegments.push({ p1: pt0, p2: pt1 });
        }
      }
    }

    return atomicSegments;
  }

  /**
   * Quantizes vertices into unified graph nodes and creates directed half-edges.
   */
  private static buildPlanarGraph(segments: Array<{ p1: Point; p2: Point }>): {
    vertices: Point[];
    halfEdges: HalfEdge[];
    outEdges: Map<number, number[]>;
  } {
    const vertices: Point[] = [];
    const cellSize = 5;
    const grid = new Map<string, number[]>();

    const getVertex = (pt: Point): number => {
      const cellX = Math.floor(pt.x / cellSize);
      const cellY = Math.floor(pt.y / cellSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${cellX + dx},${cellY + dy}`;
          const list = grid.get(key);
          if (list) {
            for (const vIdx of list) {
              const v = vertices[vIdx];
              if (Math.hypot(v.x - pt.x, v.y - pt.y) <= 0.15) {
                return vIdx;
              }
            }
          }
        }
      }

      const idx = vertices.length;
      vertices.push({ x: pt.x, y: pt.y });
      const currentKey = `${cellX},${cellY}`;
      if (!grid.has(currentKey)) {
        grid.set(currentKey, []);
      }
      grid.get(currentKey)!.push(idx);
      return idx;
    };

    const halfEdges: HalfEdge[] = [];
    const outEdges = new Map<number, number[]>();
    const edgeSet = new Set<string>();

    for (const seg of segments) {
      const u = getVertex(seg.p1);
      const v = getVertex(seg.p2);

      if (u === v) continue;

      const edgeKey = u < v ? `${u}_${v}` : `${v}_${u}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);

      const ptU = vertices[u];
      const ptV = vertices[v];

      const angleUV = Math.atan2(ptV.y - ptU.y, ptV.x - ptU.x);
      const angleVU = Math.atan2(ptU.y - ptV.y, ptU.x - ptV.x);

      const id1 = halfEdges.length;
      const id2 = id1 + 1;

      halfEdges.push({ id: id1, from: u, to: v, angle: angleUV, twinId: id2 });
      halfEdges.push({ id: id2, from: v, to: u, angle: angleVU, twinId: id1 });

      if (!outEdges.has(u)) outEdges.set(u, []);
      if (!outEdges.has(v)) outEdges.set(v, []);

      outEdges.get(u)!.push(id1);
      outEdges.get(v)!.push(id2);
    }

    // Sort outgoing half-edges around each vertex in CCW angular order
    for (const [_, list] of outEdges.entries()) {
      list.sort((a, b) => halfEdges[a].angle - halfEdges[b].angle);
    }

    return { vertices, halfEdges, outEdges };
  }

  /**
   * Traverses the planar DCEL graph to extract minimal face cycles.
   */
  private static extractFaces(
    vertices: Point[],
    halfEdges: HalfEdge[],
    outEdges: Map<number, number[]>
  ): Array<{ vertexIndices: number[]; area: number }> {
    const nextEdge = new Int32Array(halfEdges.length);

    for (let eIdx = 0; eIdx < halfEdges.length; eIdx++) {
      const edge = halfEdges[eIdx];
      const v = edge.to;
      const twinId = edge.twinId;
      const outgoing = outEdges.get(v);

      if (!outgoing || outgoing.length === 0) {
        nextEdge[eIdx] = twinId;
        continue;
      }

      const twinIdx = outgoing.indexOf(twinId);
      if (twinIdx === -1) {
        nextEdge[eIdx] = outgoing[0];
        continue;
      }

      // Next half-edge in CCW order around vertex v
      const nextIdx = (twinIdx + 1) % outgoing.length;
      nextEdge[eIdx] = outgoing[nextIdx];
    }

    const visited = new Uint8Array(halfEdges.length);
    const faces: Array<{ vertexIndices: number[]; area: number }> = [];

    for (let startE = 0; startE < halfEdges.length; startE++) {
      if (visited[startE]) continue;

      const cycle: number[] = [];
      let curr = startE;
      let count = 0;

      while (!visited[curr] && count < halfEdges.length) {
        visited[curr] = 1;
        cycle.push(halfEdges[curr].from);
        curr = nextEdge[curr];
        count++;
        if (curr === startE) break;
      }

      if (curr === startE && cycle.length >= 3) {
        // Calculate signed area via Shoelace formula
        let signedArea = 0;
        const k = cycle.length;
        for (let i = 0; i < k; i++) {
          const p1 = vertices[cycle[i]];
          const p2 = vertices[cycle[(i + 1) % k]];
          signedArea += p1.x * p2.y - p2.x * p1.y;
        }
        signedArea /= 2;

        faces.push({ vertexIndices: cycle, area: signedArea });
      }
    }

    return faces;
  }

  /**
   * Discards the infinite outer face and 0-area cycles, returning clean EnclosedRegions.
   */
  private static filterBoundedRegions(
    faces: Array<{ vertexIndices: number[]; area: number }>,
    vertices: Point[]
  ): EnclosedRegion[] {
    if (faces.length === 0) return [];

    // Compute scene bounding box
    let sceneMinX = Infinity;
    let sceneMinY = Infinity;
    let sceneMaxX = -Infinity;
    let sceneMaxY = -Infinity;

    for (const v of vertices) {
      if (v.x < sceneMinX) sceneMinX = v.x;
      if (v.x > sceneMaxX) sceneMaxX = v.x;
      if (v.y < sceneMinY) sceneMinY = v.y;
      if (v.y > sceneMaxY) sceneMaxY = v.y;
    }

    // A test point far outside the entire scene
    const exteriorPt: Point = { x: sceneMinX - 100, y: sceneMinY - 100 };

    const regions: EnclosedRegion[] = [];

    for (const face of faces) {
      if (face.area > -0.5) continue;

      const k = face.vertexIndices.length;
      let totalTurn = 0;
      for (let i = 0; i < k; i++) {
        const prev = vertices[face.vertexIndices[(i - 1 + k) % k]];
        const curr = vertices[face.vertexIndices[i]];
        const next = vertices[face.vertexIndices[(i + 1) % k]];
        const a = Math.atan2(curr.y - prev.y, curr.x - prev.x);
        const b = Math.atan2(next.y - curr.y, next.x - curr.x);
        let turn = b - a;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        while (turn < -Math.PI) turn += 2 * Math.PI;
        totalTurn += turn;
      }

      // In screen coordinates (where +Y is down), clockwise-traversed bounded interior faces
      // have total curvature strictly equal to -2*PI. The outer face has positive or non -2*PI curvature.
      if (Math.abs(totalTurn + 2 * Math.PI) > 0.5) continue;

      const absArea = Math.abs(face.area);

      const rawRing: Point[] = face.vertexIndices.map((idx) => vertices[idx]);

      // Simplify duplicate consecutive points
      const dedupRing: Point[] = [];
      for (let i = 0; i < rawRing.length; i++) {
        const p = rawRing[i];
        if (
          dedupRing.length === 0 ||
          Math.hypot(p.x - dedupRing[dedupRing.length - 1].x, p.y - dedupRing[dedupRing.length - 1].y) > 0.05
        ) {
          dedupRing.push(p);
        }
      }

      // Prune collinear vertices along straight edges
      const ring: Point[] = [];
      const m = dedupRing.length;
      for (let i = 0; i < m; i++) {
        const prev = dedupRing[(i - 1 + m) % m];
        const curr = dedupRing[i];
        const next = dedupRing[(i + 1) % m];
        const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
        const dot = (curr.x - prev.x) * (next.x - curr.x) + (curr.y - prev.y) * (next.y - curr.y);
        if (Math.abs(cross) < 1e-3 && dot > 0) {
          continue; // Skip redundant collinear point
        }
        ring.push(curr);
      }

      if (ring.length < 3) continue;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      const id = `region_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      regions.push({
        id,
        ring,
        area: absArea,
        signedArea: face.area,
        bounds: { minX, minY, maxX, maxY },
      });
    }

    return regions;
  }

  /**
   * Converts a single closed element directly into an EnclosedRegion.
   */
  private static elementToSingleRegion(el: VectorElement): EnclosedRegion {
    const ring: Point[] = (el.vertices || []).map((v) => ({ x: v.x, y: v.y }));
    let signedArea = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % n];
      signedArea += p1.x * p2.y - p2.x * p1.y;
    }
    signedArea /= 2;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    return {
      id: `region_${el.id}`,
      ring,
      area: Math.abs(signedArea),
      signedArea,
      bounds: { minX, minY, maxX, maxY },
    };
  }

  /**
   * Converts an EnclosedRegion into fitted PathVertex array.
   */
  public static regionToVertices(region: EnclosedRegion): PathVertex[] {
    const cleanPairs: Pair[] = [];
    for (let i = 0; i < region.ring.length; i++) {
      const p = region.ring[i];
      if (
        cleanPairs.length === 0 ||
        Math.hypot(p.x - cleanPairs[cleanPairs.length - 1][0], p.y - cleanPairs[cleanPairs.length - 1][1]) > 0.05
      ) {
        cleanPairs.push([p.x, p.y]);
      }
    }

    let fittedVertices: PathVertex[] = [];
    if (cleanPairs.length >= 3) {
      fittedVertices = PolygonUtils.ringToFittedVertices(cleanPairs, 1.5);
    }

    if (fittedVertices.length === 0) {
      fittedVertices = cleanPairs.map((pt, idx) => ({
        id: `v_${Date.now().toString(36)}_${idx}`,
        x: Math.round(pt[0] * 100) / 100,
        y: Math.round(pt[1] * 100) / 100,
        command: idx === 0 ? 'M' : 'L',
        nodeType: 'sharp',
      }));
    }

    if (fittedVertices.length > 0) {
      fittedVertices[0].command = 'M';
    }

    return fittedVertices;
  }

  /**
   * Compiles the SVG path 'd' string for an enclosed region.
   */
  public static compileRegionD(region: EnclosedRegion, model: VectorModel): string {
    const vertices = this.regionToVertices(region);
    return model.compilePathD(vertices, true);
  }

  /**
   * Converts an EnclosedRegion into a fully formed VectorElement with Bézier fitting.
   */
  private static regionToVectorElement(
    region: EnclosedRegion,
    model: VectorModel,
    options?: SmartFillOptions
  ): VectorElement {
    const fittedVertices = this.regionToVertices(region);
    const id = `smart_fill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const d = model.compilePathD(fittedVertices, true);

    const fillColor = options?.fillColor || '#6366f1';
    const strokeColor = options?.strokeColor || 'none';
    const strokeWidth = options?.strokeWidth !== undefined ? String(options.strokeWidth) : '1';

    const attrs: Record<string, string> = {
      id,
      d,
      fill: fillColor,
      stroke: strokeColor,
      'stroke-width': strokeWidth,
      'fill-rule': 'evenodd',
      'data-node-types': fittedVertices.map((v) => v.nodeType).join(','),
      'data-shape': 'path',
      'data-parametric': 'false',
    };

    return {
      id,
      tagName: 'path',
      shapeType: 'path',
      isParametric: false,
      attributes: attrs,
      vertices: fittedVertices,
      isClosed: true,
    };
  }
}
