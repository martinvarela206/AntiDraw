import { PathVertex, NodeType, Point, VectorElement } from './VectorModel.js';

export interface SelectedNodeRef {
  elementId: string;
  vertexId: string;
  isHandleIn?: boolean;
  isHandleOut?: boolean;
}

export class NodeEditorTool {
  public selectedVertexId: string | null = null;
  public selectedHandleType: 'vertex' | 'handleIn' | 'handleOut' | null = null;
  public fusionThreshold: number = 8.0; // Proximity distance in px to auto-fuse endpoints

  // Find vertex or handle under mouse cursor with priority for selected handles
  public hitTestVertices(
    vertices: PathVertex[],
    pt: Point,
    radius: number = 12,
    selectedVertexId: string | null = null
  ): { vertex: PathVertex; type: 'vertex' | 'handleIn' | 'handleOut' } | null {
    // 1. Priority: check handles of the currently selected vertex first
    if (selectedVertexId) {
      const selV = vertices.find((v) => v.id === selectedVertexId);
      if (selV) {
        if (selV.handleIn && Math.hypot(pt.x - selV.handleIn.x, pt.y - selV.handleIn.y) <= radius) {
          return { vertex: selV, type: 'handleIn' };
        }
        if (selV.handleOut && Math.hypot(pt.x - selV.handleOut.x, pt.y - selV.handleOut.y) <= radius) {
          return { vertex: selV, type: 'handleOut' };
        }
      }
    }

    // 2. Check handles of all vertices
    for (const v of vertices) {
      if (v.handleIn && Math.hypot(pt.x - v.handleIn.x, pt.y - v.handleIn.y) <= radius) {
        return { vertex: v, type: 'handleIn' };
      }
      if (v.handleOut && Math.hypot(pt.x - v.handleOut.x, pt.y - v.handleOut.y) <= radius) {
        return { vertex: v, type: 'handleOut' };
      }
    }

    // 3. Check main vertex anchor positions
    for (const v of vertices) {
      if (Math.hypot(pt.x - v.x, pt.y - v.y) <= radius) {
        return { vertex: v, type: 'vertex' };
      }
    }

    return null;
  }

  /**
   * ARCHITECTURAL RATIONALE: Topological Endpoint Auto-Fusion
   * Why this solution is engineered this way:
   * 1. Scope Restriction (isFreeEndpoint): Auto-fusion is strictly limited to the first (index 0)
   *    or last (index n-1) vertex of an open path. Merging an interior vertex would create an invalid
   *    non-manifold branch in standard SVG path geometry (SVG paths cannot represent 3-way branch points).
   * 2. Proximity Snapping (fusionThreshold = 8px): Provides tactile magnetic snapping when closing
   *    a contour or joining two separate path endpoints together.
   * 3. Override Modifier (isShiftPressed): Holding Shift deliberately bypasses fusion, enabling users
   *    to place endpoints intimately close to other vertices without accidental joining.
   */
  public moveVertex(
    vertices: PathVertex[],
    vertexId: string,
    newPos: Point,
    isShiftPressed: boolean = false,
    allElements: VectorElement[] = []
  ): { updatedVertices: PathVertex[]; fused: boolean } {
    const vIndex = vertices.findIndex((v) => v.id === vertexId);
    if (vIndex === -1) return { updatedVertices: vertices, fused: false };

    const targetV = vertices[vIndex];
    const dx = newPos.x - targetV.x;
    const dy = newPos.y - targetV.y;

    let finalPos = { ...newPos };
    let isFused = false;

    // Check Auto-Fusion for free endpoints (first or last vertex of open path)
    const isFreeEndpoint = (vIndex === 0 || vIndex === vertices.length - 1) && targetV.command !== 'Z';

    if (isFreeEndpoint && !isShiftPressed) {
      // Search for nearby free endpoints in current or other paths
      for (const el of allElements) {
        if (!el.vertices) continue;
        for (let i = 0; i < el.vertices.length; i++) {
          const otherV = el.vertices[i];
          if (otherV.id === vertexId) continue; // Skip self

          const isOtherEndpoint = (i === 0 || i === el.vertices.length - 1);
          if (isOtherEndpoint) {
            const dist = Math.hypot(newPos.x - otherV.x, newPos.y - otherV.y);
            if (dist <= this.fusionThreshold) {
              finalPos = { x: otherV.x, y: otherV.y };
              isFused = true;
              break;
            }
          }
        }
        if (isFused) break;
      }
    }

    const updated = vertices.map((v) => {
      if (v.id !== vertexId) return v;

      const nextV: PathVertex = {
        ...v,
        x: finalPos.x,
        y: finalPos.y,
      };

      // Shift handle relative positions along with vertex
      if (v.handleIn) {
        nextV.handleIn = { x: v.handleIn.x + dx, y: v.handleIn.y + dy };
      }
      if (v.handleOut) {
        nextV.handleOut = { x: v.handleOut.x + dx, y: v.handleOut.y + dy };
      }

      return nextV;
    });

    return { updatedVertices: updated, fused: isFused };
  }

  /**
   * ARCHITECTURAL RATIONALE: Continuous Geometric Node Class Transitions
   * Why node conversion behaves this way:
   * 1. 'sharp' (Cusp / Angular):
   *    Completely deletes handleIn/handleOut and converts command 'C' -> 'L' (unless first vertex 'M').
   *    Rationale: Leaving zero-length or collapsed handles introduces numerical edge cases in SVG exporters
   *    and rendering engines. Explicit 'L' commands produce pure linear vectors.
   * 2. 'asymmetric' (Free Handles):
   *    Allows handleIn and handleOut to rotate and scale independently without collinearity constraint.
   * 3. 'smooth' (Collinear Tangents, Independent Lengths):
   *    Enforces 180° opposite angle (angle = atan2(dy, dx) + PI) ensuring C1 slope continuity across
   *    the vertex while allowing asymmetric curvature intensity on each side.
   * 4. 'symmetric' (Mirrored Tangents):
   *    Enforces both 180° opposite angle and identical Euclidean distance (distOut = distIn) ensuring
   *    balanced curvature on both incoming and outgoing curve segments.
   */
  public setNodeType(vertices: PathVertex[], vertexId: string, nodeType: NodeType): PathVertex[] {
    return vertices.map((v) => {
      if (v.id !== vertexId) return v;

      const updated = { ...v, nodeType };

      if (nodeType === 'sharp') {
        // Remove handles completely and reset Bézier curvature
        updated.handleIn = undefined;
        updated.handleOut = undefined;
        if (updated.command !== 'M') {
          updated.command = 'L';
        }
        return updated;
      }

      if (nodeType === 'asymmetric') {
        // If it had no handles, create default independent handles
        if (!updated.handleIn && !updated.handleOut) {
          updated.handleIn = { x: v.x - 20, y: v.y };
          updated.handleOut = { x: v.x + 20, y: v.y };
          if (updated.command !== 'M') {
            updated.command = 'C';
          }
        }
        return updated;
      }

      if (nodeType === 'smooth' || nodeType === 'symmetric') {
        // Ensure both handles exist before enforcing collinearity
        if (!updated.handleIn && !updated.handleOut) {
          // No handles at all — create default collinear handles (20px each direction)
          updated.handleIn  = { x: v.x - 20, y: v.y };
          updated.handleOut = { x: v.x + 20, y: v.y };
          if (updated.command !== 'M') {
            updated.command = 'C';
          }
        } else if (!updated.handleIn && updated.handleOut) {
          // Mirror handleOut to create handleIn
          const dx = updated.handleOut.x - v.x;
          const dy = updated.handleOut.y - v.y;
          updated.handleIn = { x: v.x - dx, y: v.y - dy };
          if (updated.command !== 'M') {
            updated.command = 'C';
          }
        } else if (updated.handleIn && !updated.handleOut) {
          // Mirror handleIn to create handleOut
          const dx = updated.handleIn.x - v.x;
          const dy = updated.handleIn.y - v.y;
          updated.handleOut = { x: v.x - dx, y: v.y - dy };
        }

        // Enforce collinearity now that both handles exist
        const dx = updated.handleIn!.x - v.x;
        const dy = updated.handleIn!.y - v.y;
        const angle = Math.atan2(dy, dx) + Math.PI;
        const distOut = nodeType === 'symmetric'
          ? Math.hypot(dx, dy)
          : Math.hypot(updated.handleOut!.x - v.x, updated.handleOut!.y - v.y);
        updated.handleOut = {
          x: v.x + Math.cos(angle) * distOut,
          y: v.y + Math.sin(angle) * distOut,
        };
        return updated;
      }

      return updated;
    });
  }

  // Update Bezier handles according to Node Type (Asymmetric, Smooth/Uniform, Symmetric)
  public moveHandle(
    vertices: PathVertex[],
    vertexId: string,
    handleType: 'handleIn' | 'handleOut',
    newHandlePos: Point
  ): PathVertex[] {
    return vertices.map((v) => {
      if (v.id !== vertexId) return v;

      const updatedV = { ...v };

      if (handleType === 'handleIn') {
        updatedV.handleIn = { ...newHandlePos };
        if (v.nodeType !== 'asymmetric') {
          const dx = newHandlePos.x - v.x;
          const dy = newHandlePos.y - v.y;
          const angle = Math.atan2(dy, dx) + Math.PI;

          if (v.nodeType === 'symmetric') {
            const dist = Math.hypot(dx, dy);
            updatedV.handleOut = {
              x: v.x + Math.cos(angle) * dist,
              y: v.y + Math.sin(angle) * dist,
            };
          } else {
            // smooth: preserve handleOut length, mirror direction
            const outDist = v.handleOut
              ? Math.hypot(v.handleOut.x - v.x, v.handleOut.y - v.y)
              : Math.hypot(dx, dy);
            updatedV.handleOut = {
              x: v.x + Math.cos(angle) * outDist,
              y: v.y + Math.sin(angle) * outDist,
            };
          }
        }
      } else {
        updatedV.handleOut = { ...newHandlePos };
        if (v.nodeType !== 'asymmetric') {
          const dx = newHandlePos.x - v.x;
          const dy = newHandlePos.y - v.y;
          const angle = Math.atan2(dy, dx) + Math.PI;

          if (v.nodeType === 'symmetric') {
            const dist = Math.hypot(dx, dy);
            updatedV.handleIn = {
              x: v.x + Math.cos(angle) * dist,
              y: v.y + Math.sin(angle) * dist,
            };
          } else {
            const inDist = v.handleIn
              ? Math.hypot(v.handleIn.x - v.x, v.handleIn.y - v.y)
              : Math.hypot(dx, dy);
            updatedV.handleIn = {
              x: v.x + Math.cos(angle) * inDist,
              y: v.y + Math.sin(angle) * inDist,
            };
          }
        }
      }

      return updatedV;
    });
  }

  // Split selected vertex into two independent free endpoints
  public splitNode(vertices: PathVertex[], vertexId: string): PathVertex[] {
    const idx = vertices.findIndex((v) => v.id === vertexId);
    if (idx === -1) return vertices;

    const target = vertices[idx];
    const newV: PathVertex = {
      ...target,
      id: `v_split_${Date.now().toString(36)}`,
      x: target.x + 10,
      y: target.y + 10,
      handleIn: target.handleIn ? { x: target.handleIn.x + 10, y: target.handleIn.y + 10 } : undefined,
      handleOut: target.handleOut ? { x: target.handleOut.x + 10, y: target.handleOut.y + 10 } : undefined,
    };

    const result = [...vertices];
    result.splice(idx + 1, 0, newV);
    return result;
  }

  /**
   * ARCHITECTURAL RATIONALE: Vertex Removal Topology Preservation
   * Why this solution is engineered this way:
   * 1. Subpath Origin Preservation: If removing index 0 (initial point), the subsequent vertex
   *    must adopt command 'M' and clear handleIn to maintain valid SVG grammar without an orphaned start tangent.
   * 2. Curvature Continuity: If removing a cubic curve vertex ('C'), the preceding vertex inherits
   *    the removed vertex's handleOut, preventing a jarring collapse of the adjacent curve segment.
   */
  public deleteVertex(vertices: PathVertex[], vertexId: string): PathVertex[] {
    const idx = vertices.findIndex((v) => v.id === vertexId);
    if (idx === -1 || vertices.length <= 1) return vertices;

    const updated = [...vertices];
    const removed = updated.splice(idx, 1)[0];

    // If removed the first vertex of a subpath, ensure new first vertex is 'M'
    if (idx === 0 && updated.length > 0) {
      updated[0] = { ...updated[0], command: 'M', handleIn: undefined };
    } else if (idx > 0 && idx < updated.length) {
      const prev = updated[idx - 1];
      if (removed.command === 'C') {
        if (!prev.handleOut && removed.handleOut) {
          prev.handleOut = { ...removed.handleOut };
        }
      }
    }

    return updated;
  }

  /**
   * ARCHITECTURAL RATIONALE: Exact Bézier Subdivision via De Casteljau Algorithm
   * Why this solution is engineered this way:
   * Inserting a vertex onto an existing cubic Bézier segment MUST NOT alter the curve's visible trajectory.
   * Naive solutions (e.g. placing a linear node or guessing handle directions) distort the curvature.
   * By:
   * 1. Finding parameter t in [0, 1] on the cubic polynomial minimizing distance to the click point, and
   * 2. Applying De Casteljau's geometric construction,
   * the segment is split into two cubic sub-curves (v1 -> p01 -> p012 -> p0123) and (p0123 -> p123 -> p23 -> v2)
   * that reproduce 100% of the original polynomial contour with mathematical precision and C1 smoothness.
   */
  public insertVertexOnPath(
    vertices: PathVertex[],
    pt: Point,
    tolerance: number = 8,
    isClosed: boolean = true
  ): { updatedVertices: PathVertex[]; newVertexId: string } | null {
    const n = vertices.length;
    if (n < 2) return null;

    const segmentCount = isClosed ? n : n - 1;

    for (let i = 0; i < segmentCount; i++) {
      const v1 = vertices[i];
      const nextIdx = (i + 1) % n;
      const v2 = vertices[nextIdx];
      const isCurve = !!(v1.handleOut || v2.handleIn);

      const h1 = v1.handleOut || { x: v1.x, y: v1.y };
      const h2 = v2.handleIn  || { x: v2.x, y: v2.y };

      const dist = isCurve
        ? distToBezierPoint(pt, v1, h1, h2, v2)
        : distToSegmentPoint(pt, v1, v2);

      if (dist <= tolerance) {
        const newId = `v_add_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        if (isCurve) {
          // Find the t parameter on the cubic Bezier closest to pt
          let bestT = 0.5;
          let bestDist = Infinity;
          for (let step = 0; step <= 40; step++) {
            const t = step / 40;
            const mt = 1 - t;
            const bx = mt**3 * v1.x + 3*mt**2*t * h1.x + 3*mt*t**2 * h2.x + t**3 * v2.x;
            const by = mt**3 * v1.y + 3*mt**2*t * h1.y + 3*mt*t**2 * h2.y + t**3 * v2.y;
            const d = Math.hypot(pt.x - bx, pt.y - by);
            if (d < bestDist) { bestDist = d; bestT = t; }
          }

          // De Casteljau subdivision at bestT
          const t = bestT;
          const mt = 1 - t;

          const p01x = mt * v1.x + t * h1.x;
          const p01y = mt * v1.y + t * h1.y;
          const p12x = mt * h1.x + t * h2.x;
          const p12y = mt * h1.y + t * h2.y;
          const p23x = mt * h2.x + t * v2.x;
          const p23y = mt * h2.y + t * v2.y;

          const p012x = mt * p01x + t * p12x;
          const p012y = mt * p01y + t * p12y;
          const p123x = mt * p12x + t * p23x;
          const p123y = mt * p12y + t * p23y;

          const p0123x = mt * p012x + t * p123x;
          const p0123y = mt * p012y + t * p123y;

          // New vertex sits at p0123 with split handles
          const newVertex: PathVertex = {
            id: newId,
            x: p0123x,
            y: p0123y,
            handleIn:  { x: p012x, y: p012y },
            handleOut: { x: p123x, y: p123y },
            nodeType: 'smooth',
            command: 'C',
          };

          // Update v1's handleOut to left split
          const updated = vertices.map((v, idx) => {
            if (idx === i) return { ...v, handleOut: { x: p01x, y: p01y } };
            if (idx === nextIdx) return { ...v, handleIn: { x: p23x, y: p23y } };
            return v;
          });
          if (i === n - 1) {
            updated.push(newVertex);
          } else {
            updated.splice(i + 1, 0, newVertex);
          }
          return { updatedVertices: updated, newVertexId: newId };
        } else {
          // Straight segment: insert linear node
          const newVertex: PathVertex = {
            id: newId,
            x: pt.x,
            y: pt.y,
            nodeType: 'asymmetric',
            command: 'L',
          };
          const updated = [...vertices];
          if (i === n - 1) {
            updated.push(newVertex);
          } else {
            updated.splice(i + 1, 0, newVertex);
          }
          return { updatedVertices: updated, newVertexId: newId };
        }
      }
    }
    return null;
  }
}

function distToSegmentPoint(p: Point, v: Point, w: Point): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function distToBezierPoint(p: Point, p0: Point, p1: Point, p2: Point, p3: Point): number {
  let minDist = Infinity;
  let prevPt = p0;
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const mt = 1 - t;
    const currPt: Point = {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
    const d = distToSegmentPoint(p, prevPt, currPt);
    if (d < minDist) minDist = d;
    prevPt = currPt;
  }
  return minDist;
}
