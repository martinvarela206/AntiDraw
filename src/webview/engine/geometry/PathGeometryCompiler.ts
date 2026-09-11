import { NodeType, PathVertex, Point } from '../VectorModel.js';

export function formatNum(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Path Geometry Compilation & Parsing Service (PathGeometryCompiler)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates SVG path string serialization, command tokenization, coordinate parsing,
 *    topological endpoint deduplication, and W3C elliptical arc-to-Bézier decomposition
 *    from general VectorModel state management.
 *
 * 2. High-Precision Command Tokenization:
 *    Robustly extracts single-letter commands (M, L, H, V, C, S, Q, T, A, Z) and floating-point
 *    arguments, supporting relative coordinates, chained commands, and exponent notation.
 *
 * 3. Topological Closing and Redundant Vertex Cleanup:
 *    Fuses coincident terminal vertices back into the subpath initial anchor point upon closure,
 *    transferring tangent control handles to preserve exact curvature continuity without duplicate nodes.
 */
export class PathGeometryCompiler {
  /**
   * Parse Path 'd' attribute string into structured vertices.
   */
  public static parsePathD(d: string, nodeTypesStr: string = ''): PathVertex[] {
    const vertices: PathVertex[] = [];
    if (!d) return vertices;

    // Tokenize command letters and numbers
    const commandRegex = /([a-zA-Z])|([-+]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][-+]?\d+)?)/g;
    let match: RegExpExecArray | null;
    let currentCmd = '';
    const tokens: (string | number)[] = [];

    while ((match = commandRegex.exec(d)) !== null) {
      if (match[1]) {
        tokens.push(match[1]);
      } else if (match[2]) {
        tokens.push(parseFloat(match[2]));
      }
    }

    let i = 0;
    let curX = 0;
    let curY = 0;
    let vIndex = 0;

    while (i < tokens.length) {
      const token = tokens[i];
      if (typeof token === 'string') {
        currentCmd = token;
        i++;
      }

      const isRelative = currentCmd === currentCmd.toLowerCase() && currentCmd !== 'z';
      const cmdUpper = currentCmd.toUpperCase();

      if (cmdUpper === 'M' || cmdUpper === 'L') {
        if (i + 1 >= tokens.length) break;
        let x = tokens[i] as number;
        let y = tokens[i + 1] as number;
        i += 2;
        if (isRelative) {
          x += curX;
          y += curY;
        }
        curX = x;
        curY = y;

        vertices.push({
          id: `v_${vIndex++}`,
          x,
          y,
          nodeType: 'asymmetric',
          command: cmdUpper as 'M' | 'L',
        });
      } else if (cmdUpper === 'H') {
        if (i >= tokens.length) break;
        let x = tokens[i] as number;
        i += 1;
        if (isRelative) x += curX;
        curX = x;
        vertices.push({
          id: `v_${vIndex++}`,
          x: curX,
          y: curY,
          nodeType: 'asymmetric',
          command: 'L',
        });
      } else if (cmdUpper === 'V') {
        if (i >= tokens.length) break;
        let y = tokens[i] as number;
        i += 1;
        if (isRelative) y += curY;
        curY = y;
        vertices.push({
          id: `v_${vIndex++}`,
          x: curX,
          y: curY,
          nodeType: 'asymmetric',
          command: 'L',
        });
      } else if (cmdUpper === 'C') {
        if (i + 5 >= tokens.length) break;
        let x1 = tokens[i] as number;
        let y1 = tokens[i + 1] as number;
        let x2 = tokens[i + 2] as number;
        let y2 = tokens[i + 3] as number;
        let x = tokens[i + 4] as number;
        let y = tokens[i + 5] as number;
        i += 6;

        if (isRelative) {
          x1 += curX; y1 += curY;
          x2 += curX; y2 += curY;
          x += curX;  y += curY;
        }

        if (vertices.length > 0) {
          const prev = vertices[vertices.length - 1];
          prev.handleOut = { x: x1, y: y1 };
        }

        curX = x;
        curY = y;

        vertices.push({
          id: `v_${vIndex++}`,
          x,
          y,
          handleIn: { x: x2, y: y2 },
          nodeType: 'asymmetric',
          command: 'C',
        });
      } else if (cmdUpper === 'S') {
        if (i + 3 >= tokens.length) break;
        let x2 = tokens[i] as number;
        let y2 = tokens[i + 1] as number;
        let x = tokens[i + 2] as number;
        let y = tokens[i + 3] as number;
        i += 4;

        if (isRelative) {
          x2 += curX; y2 += curY;
          x += curX;  y += curY;
        }

        let x1 = curX;
        let y1 = curY;
        if (vertices.length > 0) {
          const prev = vertices[vertices.length - 1];
          if (prev.handleOut) {
            x1 = 2 * curX - prev.handleOut.x;
            y1 = 2 * curY - prev.handleOut.y;
          }
          prev.handleOut = { x: x1, y: y1 };
        }

        curX = x;
        curY = y;

        vertices.push({
          id: `v_${vIndex++}`,
          x,
          y,
          handleIn: { x: x2, y: y2 },
          nodeType: 'asymmetric',
          command: 'C',
        });
      } else if (cmdUpper === 'A') {
        if (i + 6 >= tokens.length) break;
        const rx = Math.abs(tokens[i] as number);
        const ry = Math.abs(tokens[i + 1] as number);
        const rot = tokens[i + 2] as number;
        const largeArc = (tokens[i + 3] as number) ? 1 : 0;
        const sweep = (tokens[i + 4] as number) ? 1 : 0;
        let x = tokens[i + 5] as number;
        let y = tokens[i + 6] as number;
        i += 7;
        if (isRelative) {
          x += curX;
          y += curY;
        }
        const beziers = PathGeometryCompiler.arcToBezier(curX, curY, rx, ry, rot, largeArc, sweep, x, y);
        for (const b of beziers) {
          if (vertices.length > 0) {
            vertices[vertices.length - 1].handleOut = { x: b.p1.x, y: b.p1.y };
          }
          vertices.push({
            id: `v_${vIndex++}`,
            x: b.p.x,
            y: b.p.y,
            handleIn: { x: b.p2.x, y: b.p2.y },
            nodeType: 'smooth',
            command: 'C',
          });
        }
        curX = x;
        curY = y;
      } else if (cmdUpper === 'Z') {
        // ARCHITECTURAL RATIONALE: Parsing Terminal Coincident Nodes in 'Z' Subpaths
        // When standard SVG generators emit an explicit final coordinate identical to the subpath origin
        // prior to 'Z' (e.g. `M 0 0 L 100 0 L 0 0 Z`), naive parsers store both endpoints, creating two
        // stacked coincident nodes at the closure point. If the last parsed vertex coincides with the origin
        // of the active subpath, we fuse any incoming handle into the origin and eliminate the redundant vertex.
        if (vertices.length >= 2) {
          let subpathStartIdx = 0;
          for (let k = vertices.length - 1; k >= 0; k--) {
            if (vertices[k].command === 'M') {
              subpathStartIdx = k;
              break;
            }
          }
          const startV = vertices[subpathStartIdx];
          const lastV = vertices[vertices.length - 1];
          if (lastV !== startV && Math.hypot(lastV.x - startV.x, lastV.y - startV.y) <= 0.5) {
            if (lastV.handleIn && !startV.handleIn) {
              startV.handleIn = { ...lastV.handleIn };
            }
            vertices.pop();
          }
        }
      } else {
        i++;
      }
    }

    // Restore nodeType from the encoded attribute
    if (nodeTypesStr) {
      const types = nodeTypesStr.split(',');
      vertices.forEach((v, idx) => {
        const t = types[idx] as NodeType;
        if (t === 'symmetric' || t === 'smooth' || t === 'asymmetric' || t === 'sharp') {
          v.nodeType = t;
        }
      });
    }

    return vertices;
  }

  /**
   * ARCHITECTURAL RATIONALE: W3C SVG 1.1 Appendix F.6 Arc-to-Bézier Conversion Engine (FEAT-02)
   *
   * Why this exists:
   * Standard SVG elliptical arc commands ('A' / 'a') define arcs using endpoint parameterization
   * (rx, ry, x-axis-rotation, large-arc-flag, sweep-flag, x, y). However, internal vector engines,
   * node editors, and canvas rendering pipelines operate on center/cubic Bézier curves ('C').
   * This algorithm converts any arbitrary elliptical arc into equivalent cubic Bézier segments (<= 90° each)
   * with sub-pixel mathematical precision.
   *
   * Edge Cases Handled:
   * 1. Coincident endpoints: returns empty array.
   * 2. Zero or negative radii: treated as straight line.
   * 3. Insufficient radii: automatically scaled up by Lambda factor as mandated by W3C specification.
   * 4. Numerical stability: radicals clamped with Math.max(0, ...) to prevent NaN from floating point inaccuracies.
   */
  public static arcToBezier(
    x1: number,
    y1: number,
    rx: number,
    ry: number,
    phiDeg: number,
    largeArc: number,
    sweep: number,
    x2: number,
    y2: number
  ): { p1: Point; p2: Point; p: Point }[] {
    if (Math.hypot(x2 - x1, y2 - y1) < 1e-6) {
      return [];
    }
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    if (rx < 1e-6 || ry < 1e-6) {
      return [{ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, p: { x: x2, y: y2 } }];
    }

    const phi = (phiDeg * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    // Step 1: Compute (x1', y1')
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;

    // Step 2: Ensure radii are large enough
    const prx = rx * rx;
    const pry = ry * ry;
    const px1p = x1p * x1p;
    const py1p = y1p * y1p;
    const lambda = px1p / prx + py1p / pry;
    if (lambda > 1) {
      const sqrtLambda = Math.sqrt(lambda);
      rx *= sqrtLambda;
      ry *= sqrtLambda;
    }

    // Step 3: Compute (cx', cy')
    const sign = largeArc === sweep ? -1 : 1;
    const num = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p);
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const factor = sign * Math.sqrt(den > 0 ? num / den : 0);
    const cxp = factor * ((rx * y1p) / ry);
    const cyp = factor * (-(ry * x1p) / rx);

    // Step 4: Compute center (cx, cy)
    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

    // Step 5: Compute start angle and angle delta
    const ux = (x1p - cxp) / rx;
    const uy = (y1p - cyp) / ry;
    const vx = (-x1p - cxp) / rx;
    const vy = (-y1p - cyp) / ry;

    const angleBetween = (uX: number, uY: number, vX: number, vY: number): number => {
      const dot = uX * vX + uY * vY;
      const len = Math.sqrt(uX * uX + uY * uY) * Math.sqrt(vX * vX + vY * vY);
      const val = Math.max(-1, Math.min(1, dot / (len || 1)));
      const ang = Math.acos(val);
      return uX * vY - uY * vX < 0 ? -ang : ang;
    };

    let startAngle = angleBetween(1, 0, ux, uy);
    let deltaAngle = angleBetween(ux, uy, vx, vy);

    if (sweep === 0 && deltaAngle > 0) {
      deltaAngle -= 2 * Math.PI;
    } else if (sweep === 1 && deltaAngle < 0) {
      deltaAngle += 2 * Math.PI;
    }

    // Step 6: Subdivide into segments of at most PI / 2
    const numSegments = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2)));
    const segDelta = deltaAngle / numSegments;
    const alpha = (4 / 3) * Math.tan(segDelta / 4);

    const segments: { p1: Point; p2: Point; p: Point }[] = [];
    let currentAngle = startAngle;

    for (let s = 0; s < numSegments; s++) {
      const nextAngle = currentAngle + segDelta;

      const cosA1 = Math.cos(currentAngle);
      const sinA1 = Math.sin(currentAngle);
      const cosA2 = Math.cos(nextAngle);
      const sinA2 = Math.sin(nextAngle);

      // Points on unit circle with tangent handles
      const ep1x = cosA1 - alpha * sinA1;
      const ep1y = sinA1 + alpha * cosA1;
      const ep2x = cosA2 + alpha * sinA2;
      const ep2y = sinA2 - alpha * cosA2;
      const endX = cosA2;
      const endY = sinA2;

      // Transform to ellipse and rotate
      const mapPt = (uX: number, uY: number): Point => {
        const sX = uX * rx;
        const sY = uY * ry;
        return {
          x: cosPhi * sX - sinPhi * sY + cx,
          y: sinPhi * sX + cosPhi * sY + cy,
        };
      };

      segments.push({
        p1: mapPt(ep1x, ep1y),
        p2: mapPt(ep2x, ep2y),
        p: mapPt(endX, endY),
      });

      currentAngle = nextAngle;
    }

    return segments;
  }

  /**
   * ARCHITECTURAL RATIONALE: Topological Closing & Coincident Endpoint Unification
   *
   * Why this solution is engineered this way:
   * 1. Redundant Terminal Vertex Elimination:
   *    In SVG path geometry, the 'Z' command instructs the rendering engine to connect the pen back
   *    to the initial 'M' anchor point. If an authoring tool commits a terminal vertex whose coordinates
   *    coincide with the starting point, storing both vertices generates a redundant zero-length segment.
   *    This results in duplicate coincident nodes in the Node Editor, double control handles, and invalid
   *    self-intersections during boolean clipping.
   *
   * 2. Curvature Continuity & Tangent Inheritance (Handle Transfer):
   *    When eliminating the redundant closing vertex, its incoming Bézier handle (`handleIn`) must be
   *    safely transferred to the initial anchor point (`v0.handleIn`) if `v0` does not possess one.
   *    This preserves the exact mathematical curvature of the closing segment without altering topology.
   *
   * 3. Micro-Offset Deduplication:
   *    Consecutive clicks occurring within <= 0.5px (e.g. from rapid double-clicks) are automatically
   *    deduplicated to prevent zero-length sub-segments while preserving intentional macro shapes.
   *
   * Discarded Alternate Approaches:
   * - Leaving vertices uncleaned and only adjusting `compilePathD`: Discarded because the Node Editor,
   *   subdivision algorithms, and boolean engines operate directly on `el.vertices`. Having redundant
   *   vertices in memory causes UI desynchronization and double-selection glitches.
   */
  public static unifyClosingVertices(vertices: PathVertex[], isClosed?: boolean, closingTol: number = 0.5): PathVertex[] {
    if (!vertices || vertices.length === 0) return [];

    // Step 1: Deduplicate consecutive identical/micro-offset vertices
    const cleanVerts: PathVertex[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (cleanVerts.length === 0) {
        cleanVerts.push({ ...v });
      } else {
        const prev = cleanVerts[cleanVerts.length - 1];
        if (Math.hypot(v.x - prev.x, v.y - prev.y) > 0.5) {
          cleanVerts.push({ ...v });
        }
      }
    }

    // Step 2: If closed, detect and fuse redundant terminal vertex into initial vertex
    if (isClosed && cleanVerts.length >= 2) {
      const firstV = cleanVerts[0];
      const lastV = cleanVerts[cleanVerts.length - 1];
      const dist = Math.hypot(lastV.x - firstV.x, lastV.y - firstV.y);

      if (dist <= closingTol) {
        // Inherit incoming tangent handle if the initial vertex lacks it
        if (lastV.handleIn && !firstV.handleIn) {
          firstV.handleIn = { ...lastV.handleIn };
        }
        if (lastV.handleOut && !firstV.handleOut) {
          firstV.handleOut = { ...lastV.handleOut };
        }
        cleanVerts.pop();
      }
    }

    return cleanVerts;
  }

  /**
   * Convert vertices back into SVG 'd' string with proper per-subpath closing and Bézier curves.
   */
  public static compilePathD(vertices: PathVertex[], isClosed?: boolean): string {
    if (!vertices || vertices.length === 0) return '';

    // Group vertices by subpath (each subpath begins with command 'M' or first vertex)
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

    const dParts: string[] = [];

    for (const sp of subpaths) {
      if (sp.length === 0) continue;

      // ARCHITECTURAL RATIONALE: Coincident Closing Subpath Trimming
      // If the caller supplied a closed subpath where the final vertex is already coincident
      // with the starting vertex, we trim the terminal duplicate so that the closing 'Z' command
      // closes directly from the true preceding anchor, avoiding a zero-length line/curve.
      let effSp = sp;
      let closingHandleIn: Point | undefined;
      let closingHandleOut: Point | undefined;
      if (isClosed && sp.length >= 2) {
        const first = sp[0];
        const last = sp[sp.length - 1];
        if (Math.hypot(last.x - first.x, last.y - first.y) <= 0.5) {
          closingHandleIn = last.handleIn;
          closingHandleOut = last.handleOut;
          effSp = sp.slice(0, sp.length - 1);
        }
      }

      let spD = `M ${formatNum(effSp[0].x)} ${formatNum(effSp[0].y)}`;

      for (let i = 1; i < effSp.length; i++) {
        const v = effSp[i];
        const prev = effSp[i - 1];
        if (prev.handleOut || v.handleIn) {
          const h1 = prev.handleOut || { x: prev.x, y: prev.y };
          const h2 = v.handleIn || { x: v.x, y: v.y };
          spD += ` C ${formatNum(h1.x)} ${formatNum(h1.y)} ${formatNum(h2.x)} ${formatNum(h2.y)} ${formatNum(v.x)} ${formatNum(v.y)}`;
        } else {
          spD += ` L ${formatNum(v.x)} ${formatNum(v.y)}`;
        }
      }

      if (isClosed && effSp.length > 1) {
        const first = effSp[0];
        const last = effSp[effSp.length - 1];
        const h1 = last.handleOut || (closingHandleOut ? closingHandleOut : undefined);
        const h2 = first.handleIn || (closingHandleIn ? closingHandleIn : undefined);
        if (h1 || h2) {
          const h1Pt = h1 || { x: last.x, y: last.y };
          const h2Pt = h2 || { x: first.x, y: first.y };
          spD += ` C ${formatNum(h1Pt.x)} ${formatNum(h1Pt.y)} ${formatNum(h2Pt.x)} ${formatNum(h2Pt.y)} ${formatNum(first.x)} ${formatNum(first.y)} Z`;
        } else {
          spD += ' Z';
        }
      }

      dParts.push(spD);
    }

    return dParts.join(' ');
  }
}
