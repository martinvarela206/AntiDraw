import { PathVertex, NodeType, Point, VectorElement } from './VectorModel.js';

export interface SelectedNodeRef {
  elementId: string;
  vertexId: string;
  isHandleIn?: boolean;
  isHandleOut?: boolean;
}

export class NodeEditorTool {
  public selectedVertexId: string | null = null;
  public selectedSegmentIdx: number | null = null;
  public selectedHandleType: 'vertex' | 'handleIn' | 'handleOut' | null = null;
  public fusionThreshold: number = 8.0; // Proximity distance in px to auto-fuse endpoints

  /**
   * ARCHITECTURAL RATIONALE: Anchor vs. Handle Hit Priority and Collapsed Handle Immunity
   *
   * Why this solution is engineered this way:
   * 1. Distance-Proportional Disambiguation:
   *    Naive implementations check either handles first or vertices first with fixed radii.
   *    When a handle is close to its anchor (or collapsed at length < 2px), a handle-first check
   *    falsely intercepts clicks intended for the anchor vertex, blocking node dragging and
   *    preventing double-click node deletion (`hitNode.type` returning 'handleIn' instead of 'vertex').
   *    By comparing exact Euclidean distance `dAnchor` vs `dHandle`, the control point closest to
   *    the cursor wins unambiguously.
   * 2. Collapsed Handle Immunity (`handleLen >= 2`):
   *    Handles residing at (v.x, v.y) represent linear/sharp endpoints or unextended tangents.
   *    They must never intercept clicks over the anchor.
   * 3. Visibility-Constrained Hit Testing:
   *    Only the selected vertex (and immediately adjacent segments) display interactive handles
   *    in the UI. Evaluating handles of unselected vertices creates invisible phantom click targets.
   */
  public hitTestVertices(
    vertices: PathVertex[],
    pt: Point,
    radius: number = 12,
    selectedVertexId: string | null = null
  ): { vertex: PathVertex; type: 'vertex' | 'handleIn' | 'handleOut' } | null {
    let bestHit: { vertex: PathVertex; type: 'vertex' | 'handleIn' | 'handleOut'; dist: number } | null = null;

    // 1. Check all anchor vertices
    for (const v of vertices) {
      const dAnchor = Math.hypot(pt.x - v.x, pt.y - v.y);
      if (dAnchor <= radius) {
        if (!bestHit || dAnchor < bestHit.dist - 0.001) {
          bestHit = { vertex: v, type: 'vertex', dist: dAnchor };
        } else if (bestHit && Math.abs(dAnchor - bestHit.dist) <= 0.001) {
          // If coincident nodes share the exact same location, prioritize the currently selected vertex
          if (v.id === selectedVertexId) {
            bestHit = { vertex: v, type: 'vertex', dist: dAnchor };
          }
        }
      }
    }

    // 2. Check handles of selected vertex and adjacent visible handles
    if (selectedVertexId) {
      const selIdx = vertices.findIndex((v) => v.id === selectedVertexId);
      if (selIdx >= 0) {
        const candidateIndices = [selIdx];
        const prevIdx = selIdx > 0 ? selIdx - 1 : vertices.length - 1;
        const nextIdx = (selIdx + 1) % vertices.length;
        candidateIndices.push(prevIdx, nextIdx);

        for (const idx of candidateIndices) {
          const v = vertices[idx];
          if (!v) continue;

          if (v.handleIn) {
            const dIn = Math.hypot(pt.x - v.handleIn.x, pt.y - v.handleIn.y);
            const handleLen = Math.hypot(v.handleIn.x - v.x, v.handleIn.y - v.y);
            // Ignore collapsed handles (< 2px from anchor)
            if (handleLen >= 2 && dIn <= radius) {
              // Handle overrides anchor only if it is strictly closer than anchor
              if (!bestHit || dIn < bestHit.dist) {
                bestHit = { vertex: v, type: 'handleIn', dist: dIn };
              }
            }
          }

          if (v.handleOut) {
            const dOut = Math.hypot(pt.x - v.handleOut.x, pt.y - v.handleOut.y);
            const handleLen = Math.hypot(v.handleOut.x - v.x, v.handleOut.y - v.y);
            // Ignore collapsed handles (< 2px from anchor)
            if (handleLen >= 2 && dOut <= radius) {
              if (!bestHit || dOut < bestHit.dist) {
                bestHit = { vertex: v, type: 'handleOut', dist: dOut };
              }
            }
          }
        }
      }
    }

    return bestHit ? { vertex: bestHit.vertex, type: bestHit.type } : null;
  }

  /**
   * Hit test to find if cursor is near a path segment (straight line or cubic Bézier).
   */
  public hitTestSegment(
    vertices: PathVertex[],
    pt: Point,
    tolerance: number = 8,
    isClosed: boolean = true
  ): number | null {
    const n = vertices.length;
    if (n < 2) return null;
    const segmentCount = isClosed ? n : n - 1;

    for (let i = 0; i < segmentCount; i++) {
      const v1 = vertices[i];
      const nextIdx = (i + 1) % n;
      const v2 = vertices[nextIdx];
      const isCurve = !!(v1.handleOut || v2.handleIn);

      const h1 = v1.handleOut || { x: v1.x, y: v1.y };
      const h2 = v2.handleIn || { x: v2.x, y: v2.y };

      const dist = isCurve
        ? distToBezierPoint(pt, v1, h1, h2, v2)
        : distToSegmentPoint(pt, v1, v2);

      if (dist <= tolerance) {
        return i;
      }
    }
    return null;
  }

  /**
   * ARCHITECTURAL RATIONALE: Solidary Segment Translation
   * Why both boundary vertices move together solidarily:
   * 1. Vector Manipulation Standard (CorelDraw / Illustrator): Dragging a segment path directly
   *    allows the user to reposition an entire edge without requiring marquee or multi-shift selection.
   * 2. Zero Curvature Distortion: By shifting both bounding vertices (index i and nextIdx) and their
   *    respective handleIn and handleOut coordinates by the exact same delta (dx, dy), the segment's
   *    internal polynomial curvature and geometric tangent continuity remain 100% intact.
   * 3. Numerical Stability: Operating via delta translation instead of non-linear projection avoids
   *    runaway coordinates or oscillation when dragging close to zero length.
   */
  public moveSegment(
    vertices: PathVertex[],
    segmentIdx: number,
    dx: number,
    dy: number,
    isClosed: boolean = true
  ): PathVertex[] {
    const n = vertices.length;
    if (segmentIdx < 0 || segmentIdx >= n) return vertices;
    const nextIdx = (segmentIdx + 1) % n;
    if (!isClosed && segmentIdx === n - 1) return vertices;

    return vertices.map((v, idx) => {
      if (idx === segmentIdx || idx === nextIdx) {
        const nextV: PathVertex = {
          ...v,
          x: v.x + dx,
          y: v.y + dy,
        };
        if (v.handleIn) {
          nextV.handleIn = { x: v.handleIn.x + dx, y: v.handleIn.y + dy };
        }
        if (v.handleOut) {
          nextV.handleOut = { x: v.handleOut.x + dx, y: v.handleOut.y + dy };
        }
        return nextV;
      }
      return v;
    });
  }

  /**
   * ARCHITECTURAL RATIONALE: Segment Mode Transitions (To Line / To Curve)
   * Why explicit segment conversion is engineered this way:
   * 1. CorelDraw Paradigm: In professional vector workflows, users often block out shapes with
   *    straight lines, then convert individual segments to Bézier curves on demand.
   * 2. To Line (C -> L): Deletes outgoing handle from v1 and incoming handle into v2, setting command to 'L'.
   *    This immediately flattens the segment with zero residual curvature artifacts or orphaned handles.
   * 3. To Curve (L -> C): Calculates standard 1/3 and 2/3 control points along the secant chord.
   *    This creates a cubic Bézier polynomial that starts identical to the straight line, providing
   *    immediate handles that the user can pull or tweak without distorting the initial layout.
   */
  public convertSegmentToLine(vertices: PathVertex[], segmentIdx: number, isClosed: boolean = true): PathVertex[] {
    const n = vertices.length;
    if (segmentIdx < 0 || segmentIdx >= n) return vertices;
    const nextIdx = (segmentIdx + 1) % n;
    if (!isClosed && segmentIdx === n - 1) return vertices;

    return vertices.map((v, idx) => {
      if (idx === segmentIdx) {
        return { ...v, handleOut: undefined };
      }
      if (idx === nextIdx) {
        return {
          ...v,
          handleIn: undefined,
          command: v.command === 'M' ? 'M' : 'L',
        };
      }
      return v;
    });
  }

  public convertSegmentToCurve(vertices: PathVertex[], segmentIdx: number, isClosed: boolean = true): PathVertex[] {
    const n = vertices.length;
    if (segmentIdx < 0 || segmentIdx >= n) return vertices;
    const nextIdx = (segmentIdx + 1) % n;
    if (!isClosed && segmentIdx === n - 1) return vertices;

    const v1 = vertices[segmentIdx];
    const v2 = vertices[nextIdx];

    const h1 = {
      x: v1.x + (v2.x - v1.x) / 3,
      y: v1.y + (v2.y - v1.y) / 3,
    };
    const h2 = {
      x: v1.x + (2 * (v2.x - v1.x)) / 3,
      y: v1.y + (2 * (v2.y - v1.y)) / 3,
    };

    return vertices.map((v, idx) => {
      if (idx === segmentIdx) {
        return { ...v, handleOut: h1 };
      }
      if (idx === nextIdx) {
        return {
          ...v,
          handleIn: h2,
          command: 'C',
          nodeType: v.nodeType === 'sharp' ? 'smooth' : v.nodeType,
        };
      }
      return v;
    });
  }

  /**
   * ARCHITECTURAL RATIONALE: Topological Contour Auto-Closure ('Z') and Coincident Node Fusion
   * Why this solution is engineered this way:
   * 1. Vector Graph Closure: An open path in SVG does not fill predictably across different renderers
   *    unless explicitly terminated with the 'Z' (closepath) operator.
   * 2. Preserves Node Identities and Prevents Terminal Stacking:
   *    If the last vertex is already coincident with the initial anchor point (within fusionThreshold),
   *    retaining both before applying 'Z' causes duplicate coincident nodes to be stacked at the origin.
   *    In such cases, any incoming handle from the terminal node is transferred to the origin node,
   *    and the redundant terminal vertex is cleanly removed before closing.
   * 3. Idempotent: If the path is already closed or has fewer than 2 vertices, this operation is a safe no-op.
   */
  public closePath(vertices: PathVertex[]): { updatedVertices: PathVertex[]; isClosed: boolean } {
    if (!vertices || vertices.length < 2) return { updatedVertices: vertices, isClosed: false };
    const updated = vertices.map((v) => ({ ...v }));
    const firstV = updated[0];
    const lastV = updated[updated.length - 1];

    if (Math.hypot(lastV.x - firstV.x, lastV.y - firstV.y) <= this.fusionThreshold) {
      if (lastV.handleIn && !firstV.handleIn) {
        firstV.handleIn = { ...lastV.handleIn };
      }
      if (lastV.handleOut && !firstV.handleOut) {
        firstV.handleOut = { ...lastV.handleOut };
      }
      updated.pop();
    }

    return { updatedVertices: updated, isClosed: true };
  }

  /**
   * ARCHITECTURAL RATIONALE: Topological Endpoint Auto-Fusion (FIX-03)
   * Why this solution is engineered this way:
   * 1. Scope Restriction (isFreeEndpoint): Auto-fusion is strictly limited to the first (index 0)
   *    or last (index n-1) vertex of an open path. Merging an interior vertex would create an invalid
   *    non-manifold branch in standard SVG path geometry (SVG paths cannot represent 3-way branch points).
   * 2. Proximity Snapping (fusionThreshold = 8px): Provides tactile magnetic snapping when closing
   *    a contour or joining two separate path endpoints together.
   * 3. Explicit Intent via Ctrl Modifier (isCtrlPressed):
   *    Auto-fusion and topological welding MUST occur exclusively when the user explicitly holds the Ctrl key.
   *    Without Ctrl, endpoints can be placed, aligned, or crossed freely at any distance (even 0px)
   *    without accidental topological welding or path closure.
   */
  public moveVertex(
    vertices: PathVertex[],
    vertexId: string,
    newPos: Point,
    isCtrlPressed: boolean = false,
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

    if (isFreeEndpoint && isCtrlPressed) {
      // Search for nearby free endpoints in current or other paths
      for (const el of allElements) {
        if (!el.vertices) continue;
        for (let i = 0; i < el.vertices.length; i++) {
          const otherV = el.vertices[i];
          if (otherV.id === vertexId) continue; // Skip self

          const isOtherEndpoint = (i === 0 || i === el.vertices.length - 1);
          if (isOtherEndpoint) {
            // If otherV was originally coincident with targetV before dragging started,
            // do not block the user from separating them
            const initialSeparation = Math.hypot(targetV.x - otherV.x, targetV.y - otherV.y);
            if (initialSeparation < 0.001) {
              continue;
            }

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
   * 5. HISTORICAL ARCHITECTURE (FIX-14) - Tangential Secant Alignment:
   *    Previous Implementation:
   *    When switching a node without handles (`sharp`) to 'asymmetric', 'smooth', or 'symmetric', handles
   *    were inserted with a fixed horizontal X offset: `{ x: v.x - 20, y: v.y }` and `{ x: v.x + 20, y: v.y }`.
   *    On vertical, diagonal, or curved paths, this introduced artificial kinks, self-intersecting loops,
   *    and visual defects because the handles were completely oblivious to the path's direction of travel.
   *
   *    Solution:
   *    The generated handles are aligned tangentially to the trajectory of the path at the target vertex:
   *    1. Secant Tangent:
   *       Derived from the adjacent predecessor (P_prev) and successor (P_next) anchors in the containing subpath:
   *       t = P_next - P_prev, normalized to unit tangent tHat = t / ||t||.
   *    2. Boundary & Topology Awareness:
   *       - Closed contours (isClosed=true) wrap cyclically: P_prev = subpath[(k-1+M)%M], P_next = subpath[(k+1)%M].
   *       - Open contours (isClosed=false) use one-sided forward tangent at start (P_next - v) and backward tangent
   *         at end (v - P_prev).
   *       - Degenerate / coincident vertices fall back to forward/backward differences, or unit (1,0) if single-point.
   *    3. Proportional Lengths (distIn, distOut):
   *       If handles already existed, their custom Euclidean lengths are preserved. If newly created, lengths are
   *       proportional to adjacent chords (~chordLength / 3 clamped between 10px and 80px), preventing overshoot.
   *
   *    Discarded Alternatives:
   *    - Using average angle of existing handles: Fails when converting from 'sharp' where no handles exist.
   *    - Fixed 20px magnitude: Creates massive overshoot on tiny segments and invisible handles on large vectors.
   */
  public setNodeType(
    vertices: PathVertex[],
    vertexId: string,
    nodeType: NodeType,
    isClosed: boolean = false
  ): PathVertex[] {
    const targetIdx = vertices.findIndex((v) => v.id === vertexId);
    if (targetIdx === -1) return vertices;

    const targetV = vertices[targetIdx];

    // Identify the contiguous subpath containing the target vertex (delimited by 'M' commands)
    let spStart = targetIdx;
    while (spStart > 0 && vertices[spStart].command !== 'M') {
      spStart--;
    }
    let spEnd = targetIdx;
    while (spEnd < vertices.length - 1 && vertices[spEnd + 1].command !== 'M') {
      spEnd++;
    }
    const subpath = vertices.slice(spStart, spEnd + 1);
    const k = targetIdx - spStart;
    const M = subpath.length;

    // Resolve adjacent anchor points for tangential secant derivative
    let pPrev: Point | undefined;
    let pNext: Point | undefined;

    if (isClosed && M >= 2) {
      pPrev = subpath[(k - 1 + M) % M];
      pNext = subpath[(k + 1) % M];
    } else {
      if (k > 0) pPrev = subpath[k - 1];
      if (k < M - 1) pNext = subpath[k + 1];
    }

    // Calculate tangent vector t
    let tx = 0;
    let ty = 0;
    if (pPrev && pNext) {
      tx = pNext.x - pPrev.x;
      ty = pNext.y - pPrev.y;
      if (Math.hypot(tx, ty) < 1e-6) {
        tx = pNext.x - targetV.x;
        ty = pNext.y - targetV.y;
        if (Math.hypot(tx, ty) < 1e-6) {
          tx = targetV.x - pPrev.x;
          ty = targetV.y - pPrev.y;
        }
      }
    } else if (pNext) {
      tx = pNext.x - targetV.x;
      ty = pNext.y - targetV.y;
    } else if (pPrev) {
      tx = targetV.x - pPrev.x;
      ty = targetV.y - pPrev.y;
    }

    const tLen = Math.hypot(tx, ty);
    const tHat: Point = tLen >= 1e-6 ? { x: tx / tLen, y: ty / tLen } : { x: 1, y: 0 };

    // Calculate handle distances based on adjacent segment chords and existing handle lengths
    const distPrev = pPrev ? Math.hypot(targetV.x - pPrev.x, targetV.y - pPrev.y) : 0;
    const distNext = pNext ? Math.hypot(pNext.x - targetV.x, pNext.y - targetV.y) : 0;

    const existingDistIn = targetV.handleIn
      ? Math.hypot(targetV.handleIn.x - targetV.x, targetV.handleIn.y - targetV.y)
      : 0;
    const existingDistOut = targetV.handleOut
      ? Math.hypot(targetV.handleOut.x - targetV.x, targetV.handleOut.y - targetV.y)
      : 0;

    const defaultDistIn = distPrev > 0 ? Math.max(10, Math.min(distPrev / 3, 80)) : 20;
    const defaultDistOut = distNext > 0 ? Math.max(10, Math.min(distNext / 3, 80)) : 20;

    return vertices.map((v, idx) => {
      if (idx !== targetIdx) return v;

      const updated = { ...v, nodeType };

      if (nodeType === 'sharp') {
        // Remove handles completely and reset Bézier curvature to pure linear
        updated.handleIn = undefined;
        updated.handleOut = undefined;
        if (updated.command !== 'M') {
          updated.command = 'L';
        }
        return updated;
      }

      if (nodeType === 'asymmetric') {
        // If it had no handles, create default independent handles aligned tangentially
        if (!updated.handleIn && !updated.handleOut) {
          updated.handleIn = { x: v.x - tHat.x * defaultDistIn, y: v.y - tHat.y * defaultDistIn };
          updated.handleOut = { x: v.x + tHat.x * defaultDistOut, y: v.y + tHat.y * defaultDistOut };
          if (updated.command !== 'M') {
            updated.command = 'C';
          }
        }
        return updated;
      }

      if (nodeType === 'smooth' || nodeType === 'symmetric') {
        // Enforce collinear tangential alignment along the path's natural flow
        let distIn = existingDistIn > 0 ? existingDistIn : defaultDistIn;
        let distOut = existingDistOut > 0 ? existingDistOut : defaultDistOut;

        if (nodeType === 'symmetric') {
          // Identical Euclidean distance on both sides for balanced curvature
          const avgDist = (distIn + distOut) / 2;
          distIn = avgDist;
          distOut = avgDist;
        }

        updated.handleIn = { x: v.x - tHat.x * distIn, y: v.y - tHat.y * distIn };
        updated.handleOut = { x: v.x + tHat.x * distOut, y: v.y + tHat.y * distOut };
        if (updated.command !== 'M') {
          updated.command = 'C';
        }
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

  /**
   * ARCHITECTURAL RATIONALE: Exact-Position Vector Node Splitting
   *
   * Why this solution is engineered this way:
   * 1. Identical Spatial Coincidence:
   *    Splitting a vertex must never distort the geometry or translate vertices with arbitrary offsets (+10px).
   *    Both the terminating vertex and the originating vertex share the EXACT coordinates (target.x, target.y).
   * 2. Canonical Bézier Tangent Separation:
   *    A path vertex acts as a junction between incoming and outgoing segments:
   *    - The incoming endpoint retains `handleIn` (and clears `handleOut` since no path departs from it).
   *    - The outgoing endpoint retains `handleOut` (and clears `handleIn` since it begins a new contour/subpath).
   * 3. Closed Loop Unwrapping:
   *    When splitting a vertex in a closed path (isClosed === true), the loop unrolls into an open path:
   *    - The path begins at (target.x, target.y) with command 'M' and outgoing tangent handleOut.
   *    - It traverses through the remaining vertices in cyclical order.
   *    - It terminates back at (target.x, target.y) with incoming tangent handleIn.
   *    All intermediate segments, curvatures, and node types remain perfectly intact.
   * 4. Open Path Subpath Division:
   *    When splitting an interior vertex in an open path (isClosed === false), the path breaks into two subpaths:
   *    - Subpath 1 ends at (target.x, target.y) retaining handleIn.
   *    - Subpath 2 begins at (target.x, target.y) with command 'M', retaining handleOut.
   */
  public splitNode(
    vertices: PathVertex[],
    vertexId: string,
    isClosed: boolean = false
  ): { vertices: PathVertex[]; newVertexId?: string } {
    const idx = vertices.findIndex((v) => v.id === vertexId);
    if (idx === -1 || vertices.length < 2) return { vertices, newVertexId: undefined };

    const target = vertices[idx];

    // Case 1: Closed Path Unwrapping
    if (isClosed) {
      const n = vertices.length;
      // Start vertex begins open contour at target position
      const startV: PathVertex = {
        ...target,
        id: target.id,
        x: target.x,
        y: target.y,
        command: 'M',
        handleIn: undefined,
        handleOut: target.handleOut ? { ...target.handleOut } : undefined,
        nodeType: target.nodeType,
      };

      // Previous vertex in original cycle
      const prevIdx = (idx - 1 + n) % n;
      const prevV = vertices[prevIdx];

      // End vertex terminates open contour at target position
      const newEndId = `v_split_${Date.now().toString(36)}`;
      const endV: PathVertex = {
        ...target,
        id: newEndId,
        x: target.x,
        y: target.y,
        command: target.handleIn || prevV.handleOut ? 'C' : 'L',
        handleIn: target.handleIn ? { ...target.handleIn } : undefined,
        handleOut: undefined,
        nodeType: target.nodeType,
      };

      // Reassemble cyclical vertices: startV -> subsequent vertices -> previous vertices -> endV
      const reordered: PathVertex[] = [startV];
      for (let i = 1; i < n; i++) {
        const curr = { ...vertices[(idx + i) % n] };
        // If the original index 0 had command 'M', it now sits mid-sequence and continues from predecessor
        if (curr.command === 'M') {
          const predecessor = reordered[reordered.length - 1];
          curr.command = predecessor.handleOut || curr.handleIn ? 'C' : 'L';
        }
        reordered.push(curr);
      }
      reordered.push(endV);

      return { vertices: reordered, newVertexId: newEndId };
    }

    // Case 2: Open Path Endpoint Check
    if (idx === 0 || idx === vertices.length - 1) {
      // Cannot split an existing open endpoint
      return { vertices, newVertexId: target.id };
    }

    // Case 3: Open Path Interior Vertex Division (breaks into two continuous subpaths)
    const endV1: PathVertex = {
      ...target,
      x: target.x,
      y: target.y,
      handleIn: target.handleIn ? { ...target.handleIn } : undefined,
      handleOut: undefined,
    };

    const newStartId = `v_split_${Date.now().toString(36)}`;
    const startV2: PathVertex = {
      ...target,
      id: newStartId,
      x: target.x,
      y: target.y,
      command: 'M',
      handleIn: undefined,
      handleOut: target.handleOut ? { ...target.handleOut } : undefined,
    };

    const result = [
      ...vertices.slice(0, idx),
      endV1,
      startV2,
      ...vertices.slice(idx + 1),
    ];

    return { vertices: result, newVertexId: newStartId };
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
