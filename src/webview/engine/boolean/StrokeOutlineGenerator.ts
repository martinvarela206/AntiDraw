import polygonClipping, { MultiPolygon, Polygon, Ring, Pair } from 'polygon-clipping';
import { VectorElement, PathVertex, VectorModel, Point } from '../VectorModel.js';
import { PolygonUtils } from './PolygonUtils.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Stroke-to-Path Outline Generator (StrokeOutlineGenerator)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Converting parametric or stroked paths to filled outline polygons is an extrusion and planar
 *    synthesis operation. Isolating this subsystem from boolean operations avoids mixing thick-curve
 *    tessellation, marker positioning, join mitering, and linecap generation with polygon clipping.
 *
 * 2. High-Fidelity SVG Marker Planar Geometry Extraction:
 *    - In SVG standard (<marker markerUnits="strokeWidth">), markers are defined within a canonical
 *      viewBox (e.g. 0 0 10 10) with an anchor reference point (refX, refY).
 *    - By mapping marker points (X, Y) through the 2D affine transformation:
 *        x' = anchor.x + ((X - refX) * sx * cos - (Y - refY) * sy * sin)
 *        y' = anchor.y + ((X - refX) * sx * sin + (Y - refY) * sy * cos)
 *      the converted polygon precisely matches the onscreen position, scale, and orientation
 *      rendered natively by the browser.
 *
 * 3. Planar Boolean Welded Unity:
 *    Adding marker polygons directly to thickPolygons before polygonClipping.union() ensures
 *    a single, continuous, non-self-intersecting closed vector.
 *
 * 4. Tangent Stability & Degeneracy Immunity:
 *    If incoming/outgoing tangent vectors collapse to zero length (< 0.0001), fallback tangents
 *    are computed from adjacent vertex chords or outgoing tangents, preventing NaN singularities.
 *
 * 5. HISTORICAL ARCHITECTURE (FIX-15) - Exact Marker Topology & Linecap Fidelity:
 *    - Open Arrow ('arrow-open'): In SVG `<path d="M 9 1.5 L 1 5 L 9 8.5" stroke-linecap="round" stroke-linejoin="round" />`,
 *      both terminal wing tips (p0, p2) have round linecaps (discs of radius halfLeg) and the apex (p1) has a round join disc.
 *    - Bar Cap ('bar-cap'): In SVG `<line stroke-linecap="round" stroke-width="2" />`, the perpendicular bar terminates with
 *      semicircular round caps at (refX, 1) and (refX, 9). Semicircular discs are placed at both ends to yield a faithful capsule.
 *    - Circle Dot ('circle-dot'): Discretized with 32 polygon vertices for silky circular contour without visible polygonal facets.
 *
 * 6. HISTORICAL ARCHITECTURE (FIX-15B) - Uniform Scaling & Capsule Calibration (preserveAspectRatio):
 *    `transform` enforces uniform scaling `scale = min(mw/10, mh/10) * strokeWidth`, and `rCap = 1.0 * scale = 0.5 * strokeWidth`.
 *    The semicircular round caps align with the bar edges with zero error, forming an exact capsule matching native SVG.
 *
 * 7. Geometric Stroke Join Extrusion (Miter, Bevel, Round):
 *    In SVG, stroke-linejoin determines how two connected stroke segments meet:
 *    - 'miter': The outer edges of the stroke are extended until they meet at a sharp point.
 *      W3C SVG specification imposes the `stroke-miterlimit` ratio rule:
 *      miterRatio = miterLength / strokeWidth = 1 / sin(theta / 2).
 *      If miterRatio <= strokeMiterlimit, a sharp miter corner is rendered.
 *      If miterRatio > strokeMiterlimit, the join is clipped to a flat bevel.
 *    - 'bevel': The outer corner is truncated with a flat triangle connecting the outer stroke edges.
 *    - 'round': A circular disc of radius strokeWidth/2 rounds off the outer corner.
 */
export class StrokeOutlineGenerator {
  /**
   * Helper to parse marker identifier from an attribute value like 'url(#ad-marker-arrow-filled-start)'
   */
  public static parseMarkerType(attrVal?: string): string {
    if (!attrVal || attrVal === 'none') return 'none';
    const m = attrVal.match(/#(?:\w+-)*marker-([^'")\s]+)/) || attrVal.match(/#([^'")\s]+)/);
    if (!m) return 'none';
    return m[1];
  }

  /**
   * ARCHITECTURAL RATIONALE: Exact W3C SVG 2 Tangent Direction Limits (Section 13.6.2)
   *
   * When computing marker orientation on Bézier curves, naive tangent evaluations frequently fail
   * when the first control handle coincides with the vertex anchor (e.g. P0 == P1 or P2 == P3),
   * causing B'(0) or B'(1) to collapse to zero vector (0, 0).
   *
   * Falling back to the chord (P3 - P0) introduces severe angular errors (often 10° - 30°), causing
   * arrow markers to be tilted or misdirected.
   *
   * Standard W3C SVG 2 Limit Algorithm:
   * - At start of cubic segment:
   *     1. If P1 != P0, tangent = P1 - P0.
   *     2. Else if P2 != P0, tangent = P2 - P0.
   *     3. Else tangent = P3 - P0.
   * - At end of cubic segment:
   *     1. If P2 != P3, tangent = P3 - P2.
   *     2. Else if P1 != P3, tangent = P3 - P1.
   *     3. Else tangent = P3 - P0.
   */
  public static computeStartTangent(sp: PathVertex[]): Point {
    if (sp.length < 2) return { x: 1, y: 0 };
    const p0 = sp[0];
    const p1 = sp[1];
    if (p0.handleOut && Math.hypot(p0.handleOut.x - p0.x, p0.handleOut.y - p0.y) > 1e-4) {
      return { x: p0.handleOut.x - p0.x, y: p0.handleOut.y - p0.y };
    }
    if (p1.handleIn && Math.hypot(p1.handleIn.x - p0.x, p1.handleIn.y - p0.y) > 1e-4) {
      return { x: p1.handleIn.x - p0.x, y: p1.handleIn.y - p0.y };
    }
    return { x: p1.x - p0.x, y: p1.y - p0.y };
  }

  public static computeEndTangent(sp: PathVertex[]): Point {
    if (sp.length < 2) return { x: 1, y: 0 };
    const lastIdx = sp.length - 1;
    const p3 = sp[lastIdx];
    const p0 = sp[lastIdx - 1];
    if (p3.handleIn && Math.hypot(p3.x - p3.handleIn.x, p3.y - p3.handleIn.y) > 1e-4) {
      return { x: p3.x - p3.handleIn.x, y: p3.y - p3.handleIn.y };
    }
    if (p0.handleOut && Math.hypot(p3.x - p0.handleOut.x, p3.y - p0.handleOut.y) > 1e-4) {
      return { x: p3.x - p0.handleOut.x, y: p3.y - p0.handleOut.y };
    }
    return { x: p3.x - p0.x, y: p3.y - p0.y };
  }

  public static computeMidTangent(prev: PathVertex, curr: PathVertex, next: PathVertex): Point {
    let inTan: Point = { x: curr.x - prev.x, y: curr.y - prev.y };
    const hIn = curr.handleIn;
    const hPrevOut = prev.handleOut;
    if (hIn && Math.hypot(curr.x - hIn.x, curr.y - hIn.y) > 1e-4) {
      inTan = { x: curr.x - hIn.x, y: curr.y - hIn.y };
    } else if (hPrevOut && Math.hypot(curr.x - hPrevOut.x, curr.y - hPrevOut.y) > 1e-4) {
      inTan = { x: curr.x - hPrevOut.x, y: curr.y - hPrevOut.y };
    }
    const inLen = Math.hypot(inTan.x, inTan.y) || 1;
    const uIn = { x: inTan.x / inLen, y: inTan.y / inLen };

    let outTan: Point = { x: next.x - curr.x, y: next.y - curr.y };
    const hOut = curr.handleOut;
    const hNextIn = next.handleIn;
    if (hOut && Math.hypot(hOut.x - curr.x, hOut.y - curr.y) > 1e-4) {
      outTan = { x: hOut.x - curr.x, y: hOut.y - curr.y };
    } else if (hNextIn && Math.hypot(hNextIn.x - curr.x, hNextIn.y - curr.y) > 1e-4) {
      outTan = { x: hNextIn.x - curr.x, y: hNextIn.y - curr.y };
    }
    const outLen = Math.hypot(outTan.x, outTan.y) || 1;
    const uOut = { x: outTan.x / outLen, y: outTan.y / outLen };

    let mid = { x: uIn.x + uOut.x, y: uIn.y + uOut.y };
    if (Math.hypot(mid.x, mid.y) < 1e-4) mid = uOut;
    return mid;
  }

  /**
   * Generates planar polygons for SVG markers aligned to anchor point and tangent vector.
   */
  public static createMarkerPolygons(
    markerId: string,
    anchor: Point,
    tangent: Point,
    strokeWidth: number,
    offset: number = 0,
    markerSize: number = 6,
    markerUnits: string = 'strokeWidth'
  ): Polygon[] {
    if (!markerId || markerId === 'none') return [];

    const len = Math.hypot(tangent.x, tangent.y);
    if (len < 0.0001) return [];
    const cos = tangent.x / len;
    const sin = tangent.y / len;

    const sizeScale = markerSize / 6;
    const unitScale = markerUnits === 'userSpaceOnUse' ? 1 : strokeWidth;

    const transform = (X: number, Y: number, refX: number, refY: number, mw: number, mh: number): Pair => {
      // W3C SVG Specification: <marker> preserveAspectRatio defaults to 'xMidYMid meet'.
      // Enforces uniform scale S = min(mw, mh) / 10 * unitScale, preventing aspect ratio distortion.
      const scale = Math.min((mw * sizeScale) / 10, (mh * sizeScale) / 10) * unitScale;
      const dx = (X - refX) * scale;
      const dy = (Y - refY) * scale;
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
        refX = 1 + offset;
        refY = 5;
        pts = [[10, 1.5], [1, 5], [10, 8.5]];
      } else if (markerId.includes('end')) {
        refX = 9 - offset;
        refY = 5;
        pts = [[0, 1.5], [9, 5], [0, 8.5]];
      } else {
        // mid
        refX = 5 - offset;
        refY = 5;
        pts = [[1, 1.5], [9, 5], [1, 8.5]];
      }
      const ring: Ring = pts.map(([x, y]) => transform(x, y, refX, refY, mw, mh));
      ring.push([ring[0][0], ring[0][1]]);
      polys.push([ring]);
    } else if (markerId.includes('circle-dot')) {
      // 32-step smooth circle matching cx=5, cy=5, r=3.5 in 10x10 viewBox with mw=5, mh=5
      const isStart = markerId.includes('start');
      const refX = isStart ? 5 + offset : 5 - offset;
      const center = transform(5, 5, refX, 5, 5, 5);
      const r = 3.5 * 0.5 * sizeScale * unitScale;
      polys.push(makeCircle(center[0], center[1], r, 32));
    } else if (markerId.includes('square-block')) {
      const isStart = markerId.includes('start');
      const refX = isStart ? 5 + offset : 5 - offset;
      const refY = 5;
      const mw = 5;
      const mh = 5;
      const corners: [number, number][] = [[2, 2], [8, 2], [8, 8], [2, 8]];
      const ring: Ring = corners.map(([x, y]) => transform(x, y, refX, refY, mw, mh));
      ring.push([ring[0][0], ring[0][1]]);
      polys.push([ring]);
    } else if (markerId.includes('bar-cap')) {
      const isStart = markerId.includes('start');
      const baseRefX = isStart ? 2 : 8;
      const refX = isStart ? baseRefX + offset : baseRefX - offset;
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

      // FIX-15B: Uniform aspect ratio calibration
      const scale = Math.min((mw * sizeScale) / 10, (mh * sizeScale) / 10) * unitScale;
      const rCap = 1.0 * scale;

      const pTop = transform(refX, 1, refX, refY, mw, mh);
      const pBottom = transform(refX, 9, refX, refY, mw, mh);
      polys.push(makeCircle(pTop[0], pTop[1], rCap, 16));
      polys.push(makeCircle(pBottom[0], pBottom[1], rCap, 16));
    } else if (markerId.includes('arrow-open')) {
      let p0: [number, number], p1: [number, number], p2: [number, number];
      let refX = 5;
      let refY = 5;
      const mw = 6;
      const mh = 6;
      if (markerId.includes('start')) {
        refX = 1 + offset;
        refY = 5;
        p0 = [9, 1.5];
        p1 = [1, 5];
        p2 = [9, 8.5];
      } else if (markerId.includes('end')) {
        refX = 9 - offset;
        refY = 5;
        p0 = [1, 1.5];
        p1 = [9, 5];
        p2 = [1, 8.5];
      } else {
        refX = 5 - offset;
        refY = 5;
        p0 = [1, 1.5];
        p1 = [9, 5];
        p2 = [1, 8.5];
      }

      const tp0 = transform(p0[0], p0[1], refX, refY, mw, mh);
      const tp1 = transform(p1[0], p1[1], refX, refY, mw, mh);
      const tp2 = transform(p2[0], p2[1], refX, refY, mw, mh);

      const legWidth = Math.max(1, 0.25 * strokeWidth);
      const halfLeg = legWidth / 2;

      const makeThickLeg = (a: Pair, b: Pair): Polygon => {
        const ldx = b[0] - a[0];
        const ldy = b[1] - a[1];
        const llen = Math.hypot(ldx, ldy) || 1;
        const lnx = (-ldy / llen) * halfLeg;
        const lny = (ldx / llen) * halfLeg;
        const legRing: Ring = [
          [a[0] + lnx, a[1] + lny],
          [b[0] + lnx, b[1] + lny],
          [b[0] - lnx, b[1] - lny],
          [a[0] - lnx, a[1] - lny],
          [a[0] + lnx, a[1] + lny],
        ];
        return [legRing];
      };

      polys.push(makeThickLeg(tp0, tp1));
      polys.push(makeThickLeg(tp1, tp2));
      polys.push(makeCircle(tp0[0], tp0[1], halfLeg, 16));
      polys.push(makeCircle(tp1[0], tp1[1], halfLeg, 16));
      polys.push(makeCircle(tp2[0], tp2[1], halfLeg, 16));
    }

    return polys;
  }

  /**
   * Generates join polygon between two connected segments.
   */
  public static createJoinPolygon(
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

  /**
   * ARCHITECTURAL RATIONALE: Analytical Bézier Parallel Curve Extrusion (FEAT-23)
   *
   * 1. Preserving Exact Node Topology (2N rule):
   *    Instead of segment tessellation and polygon clipping that turns curves into 60+ faceted
   *    polygonal vertices, this analytical engine constructs the parallel offset curve directly in Bézier
   *    space. For an open path of N nodes, it generates a closed contour with exactly 2N nodes:
   *    N nodes forward along the Right boundary (+h), and N nodes backward along the Left boundary (-h).
   *
   * 2. Differential Curvature & Proportional Handle Scaling:
   *    In parallel curve differential geometry, the offset curve radius is R' = R + d.
   *    As the curve bends through angle deltaTheta over chord length L:
   *      - The Convex side (longer arc) scales handles by s_convex = 1 + (|deltaTheta| * halfW) / L > 1,
   *        rendering a wider, smoother curvature.
   *      - The Concave side (shorter arc) scales handles by s_concave = 1 - (|deltaTheta| * halfW) / L < 1,
   *        rendering a tighter, more pronounced curvature.
   *
   * 3. Seamless End-Caps & Zero Artifacts:
   *    Synthesizes butt, round, or square caps directly in Bézier coordinates without numerical drift.
   */
  public static analyticalOutlineStroke(element: VectorElement, model: VectorModel): VectorElement | null {
    if (!element.vertices || element.vertices.length < 2) return null;
    const isClosed = element.isClosed ?? false;
    // Analytical parallel extrusion is specialized for open paths (e.g. lines, polylines, curves)
    if (isClosed) return null;

    // Check if there are multiple subpaths (M commands after index 0)
    let mCount = 0;
    for (const v of element.vertices) {
      if (v.command === 'M') mCount++;
      if (mCount > 1) return null; // Fallback to clipping for multi-subpath compound paths
    }

    const strokeWidth = parseFloat(element.attributes['stroke-width'] || '1') || 1;
    const strokeLinecap = element.attributes['stroke-linecap'] || 'butt';
    const strokeColor = element.attributes['stroke'] || '#000000';
    const halfW = strokeWidth / 2;

    const sp = element.vertices;
    const N = sp.length;
    if (N < 2) return null;

    // Compute unit tangents and right-normals for each vertex
    const tangents: Point[] = [];
    const normals: Point[] = [];

    for (let i = 0; i < N; i++) {
      let t: Point;
      if (i === 0) {
        t = this.computeStartTangent(sp);
      } else if (i === N - 1) {
        t = this.computeEndTangent(sp);
      } else {
        t = this.computeMidTangent(sp[i - 1], sp[i], sp[i + 1]);
      }
      const len = Math.hypot(t.x, t.y) || 1;
      const u: Point = { x: t.x / len, y: t.y / len };
      tangents.push(u);
      // Right normal in screen coordinates (X right, Y down): (-u.y, u.x)
      normals.push({ x: -u.y, y: u.x });
    }

    // Compute offset positions P_{i, R} and P_{i, L}
    const rightPts: Point[] = [];
    const leftPts: Point[] = [];

    for (let i = 0; i < N; i++) {
      const v = sp[i];
      const u = tangents[i];
      const n = normals[i];

      let miterScale = 1.0;
      if (i > 0 && i < N - 1) {
        const inDx = v.x - sp[i - 1].x;
        const inDy = v.y - sp[i - 1].y;
        const inLen = Math.hypot(inDx, inDy) || 1;
        const uIn: Point = { x: inDx / inLen, y: inDy / inLen };
        const dot = uIn.x * u.x + uIn.y * u.y;
        if (dot > 0.1) {
          miterScale = Math.min(2.0, 1 / dot);
        }
      }

      let capShiftX = 0;
      let capShiftY = 0;
      if (strokeLinecap === 'square') {
        if (i === 0) {
          capShiftX = -u.x * halfW;
          capShiftY = -u.y * halfW;
        } else if (i === N - 1) {
          capShiftX = u.x * halfW;
          capShiftY = u.y * halfW;
        }
      }

      const offsetDist = halfW * miterScale;
      rightPts.push({
        x: Math.round((v.x + n.x * offsetDist + capShiftX) * 100) / 100,
        y: Math.round((v.y + n.y * offsetDist + capShiftY) * 100) / 100,
      });
      leftPts.push({
        x: Math.round((v.x - n.x * offsetDist + capShiftX) * 100) / 100,
        y: Math.round((v.y - n.y * offsetDist + capShiftY) * 100) / 100,
      });
    }

    // Now evaluate segments between V_k and V_{k+1}
    interface SegmentCurveData {
      hasCurve: boolean;
      hOutR?: Point;
      hInR?: Point;
      hOutL?: Point;
      hInL?: Point;
    }

    const segmentsData: SegmentCurveData[] = [];

    for (let k = 0; k < N - 1; k++) {
      const v0 = sp[k];
      const v1 = sp[k + 1];
      const hasCurve = !!(v0.handleOut || v1.handleIn);

      if (!hasCurve) {
        segmentsData.push({ hasCurve: false });
        continue;
      }

      const p0 = { x: v0.x, y: v0.y };
      const p1 = v0.handleOut ? { x: v0.handleOut.x, y: v0.handleOut.y } : p0;
      const p2 = v1.handleIn ? { x: v1.handleIn.x, y: v1.handleIn.y } : { x: v1.x, y: v1.y };
      const p3 = { x: v1.x, y: v1.y };

      // Tangents at start and end of segment
      let t0 = { x: p1.x - p0.x, y: p1.y - p0.y };
      if (Math.hypot(t0.x, t0.y) < 1e-4) t0 = { x: p2.x - p0.x, y: p2.y - p0.y };
      if (Math.hypot(t0.x, t0.y) < 1e-4) t0 = { x: p3.x - p0.x, y: p3.y - p0.y };

      let t3 = { x: p3.x - p2.x, y: p3.y - p2.y };
      if (Math.hypot(t3.x, t3.y) < 1e-4) t3 = { x: p3.x - p1.x, y: p3.y - p1.y };
      if (Math.hypot(t3.x, t3.y) < 1e-4) t3 = { x: p3.x - p0.x, y: p3.y - p0.y };

      const th0 = Math.atan2(t0.y, t0.x);
      const th3 = Math.atan2(t3.y, t3.x);
      let dTheta = th3 - th0;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;

      const chordLen = Math.hypot(p3.x - p0.x, p3.y - p0.y) || 1;
      const scaleDelta = (halfW * dTheta) / chordLen;

      // In screen coordinates (Y down):
      // When dTheta > 0 (turning right/clockwise):
      // Left side is outside/convex (longer arc) -> s_L = 1 + scaleDelta > 1
      // Right side is inside/concave (shorter arc) -> s_R = 1 - scaleDelta < 1
      const sR = Math.max(0.1, Math.min(3.0, 1 - scaleDelta));
      const sL = Math.max(0.1, Math.min(3.0, 1 + scaleDelta));

      const origOut = { x: p1.x - p0.x, y: p1.y - p0.y };
      const origIn = { x: p2.x - p3.x, y: p2.y - p3.y };

      const pr0 = rightPts[k];
      const pr1 = rightPts[k + 1];
      const pl0 = leftPts[k];
      const pl1 = leftPts[k + 1];

      // Right side curve (forward from pr0 to pr1)
      const hOutR = {
        x: Math.round((pr0.x + origOut.x * sR) * 100) / 100,
        y: Math.round((pr0.y + origOut.y * sR) * 100) / 100,
      };
      const hInR = {
        x: Math.round((pr1.x + origIn.x * sR) * 100) / 100,
        y: Math.round((pr1.y + origIn.y * sR) * 100) / 100,
      };

      // ARCHITECTURAL RATIONALE: Control Point Mapping for Time-Reversed Bézier Curves
      // Under Bézier curve time-reversal Q(u) = C(1-u) for u in [0, 1], the control points
      // are exactly inverted in sequence: (Q0, Q1, Q2, Q3) = (P3, P2, P1, P0).
      // Specifically:
      // - The outgoing tangent from Q0 (offset of P3, pl1) into the segment points towards Q1 (offset of P2).
      //   The vector from P3 to P2 is (p2 - p3), which is `origIn`.
      //   Therefore, Q1 = pl1 + origIn * sL.
      // - The incoming tangent approaching Q3 (offset of P0, pl0) from the segment originates at Q2 (offset of P1).
      //   The vector from P0 to P1 is (p1 - p0), which is `origOut`.
      //   Therefore, Q2 = pl0 + origOut * sL.
      //
      // Bug Fix & Historical Rationale:
      // Naively subtracting `origIn * sL` and `origOut * sL` inverted the control vectors by 180 degrees,
      // directing the handles away from the adjacent segment and causing self-intersecting cusp loops / pinches
      // on convex arcs. Adding `origIn * sL` and `origOut * sL` aligns the control points along the continuous
      // curvature direction of the outer contour.
      const hOutL = {
        x: Math.round((pl1.x + origIn.x * sL) * 100) / 100,
        y: Math.round((pl1.y + origIn.y * sL) * 100) / 100,
      };
      const hInL = {
        x: Math.round((pl0.x + origOut.x * sL) * 100) / 100,
        y: Math.round((pl0.y + origOut.y * sL) * 100) / 100,
      };

      segmentsData.push({
        hasCurve: true,
        hOutR,
        hInR,
        hOutL,
        hInL,
      });
    }

    // Now construct vertices array of the closed vector (length = 2 * N)
    const outVertices: PathVertex[] = [];

    // 1. Right side (Forward from 0 to N-1)
    for (let i = 0; i < N; i++) {
      const pt = rightPts[i];
      const origV = sp[i];
      const id = `v_outline_r_${i}_${Date.now().toString(36)}`;

      let cmd: 'M' | 'L' | 'C' = 'M';
      let handleIn: Point | undefined = undefined;
      let handleOut: Point | undefined = undefined;

      if (i > 0) {
        const seg = segmentsData[i - 1];
        if (seg.hasCurve) {
          cmd = 'C';
          handleIn = seg.hInR;
        } else {
          cmd = 'L';
        }
      }

      if (i < N - 1) {
        const nextSeg = segmentsData[i];
        if (nextSeg.hasCurve) {
          handleOut = nextSeg.hOutR;
        }
      }

      outVertices.push({
        id,
        x: pt.x,
        y: pt.y,
        command: cmd,
        handleIn,
        handleOut,
        nodeType: origV.nodeType,
      });
    }

    // 2. Left side (Backward from N-1 down to 0)
    for (let i = N - 1; i >= 0; i--) {
      const pt = leftPts[i];
      const origV = sp[i];
      const id = `v_outline_l_${i}_${Date.now().toString(36)}`;

      let cmd: 'M' | 'L' | 'C' = 'L';
      let handleIn: Point | undefined = undefined;
      let handleOut: Point | undefined = undefined;

      if (i === N - 1) {
        // End cap connection from rightPts[N-1] to leftPts[N-1]
        if (strokeLinecap === 'round') {
          cmd = 'C';
          const u = tangents[N - 1];
          const kRound = halfW * 0.55228475;
          outVertices[outVertices.length - 1].handleOut = {
            x: Math.round((rightPts[N - 1].x + u.x * kRound) * 100) / 100,
            y: Math.round((rightPts[N - 1].y + u.y * kRound) * 100) / 100,
          };
          handleIn = {
            x: Math.round((leftPts[N - 1].x + u.x * kRound) * 100) / 100,
            y: Math.round((leftPts[N - 1].y + u.y * kRound) * 100) / 100,
          };
        } else {
          cmd = 'L';
        }

        if (N > 1 && segmentsData[N - 2].hasCurve) {
          handleOut = segmentsData[N - 2].hOutL;
        }
      } else {
        // Segment i (moving backward from i+1 to i)
        const seg = segmentsData[i];
        if (seg.hasCurve) {
          cmd = 'C';
          handleIn = seg.hInL;
        } else {
          cmd = 'L';
        }

        if (i > 0 && segmentsData[i - 1].hasCurve) {
          handleOut = segmentsData[i - 1].hOutL;
        }
      }

      outVertices.push({
        id,
        x: pt.x,
        y: pt.y,
        command: cmd,
        handleIn,
        handleOut,
        nodeType: origV.nodeType,
      });
    }

    // 3. Start cap closing back to rightPts[0]
    if (strokeLinecap === 'round') {
      const u0 = tangents[0];
      const kRound = halfW * 0.55228475;
      outVertices[outVertices.length - 1].handleOut = {
        x: Math.round((leftPts[0].x - u0.x * kRound) * 100) / 100,
        y: Math.round((leftPts[0].y - u0.y * kRound) * 100) / 100,
      };
      outVertices[0].handleIn = {
        x: Math.round((rightPts[0].x - u0.x * kRound) * 100) / 100,
        y: Math.round((rightPts[0].y - u0.y * kRound) * 100) / 100,
      };
    }

    const d = model.compilePathD(outVertices, true);
    const newId = `el_stroke_path_${Date.now().toString(36)}`;

    return {
      id: newId,
      tagName: 'path',
      attributes: {
        id: newId,
        d,
        fill: strokeColor,
        stroke: 'none',
        'stroke-width': '0',
        'data-node-types': outVertices.map((v) => v.nodeType || 'sharp').join(','),
        'data-shape': 'path',
        'data-parametric': 'false',
      },
      vertices: outVertices,
      isClosed: true,
      isParametric: false,
      shapeType: 'path',
    };
  }

  /**
   * Converts a stroked vector element into a closed, filled polygon representation of its stroke outline.
   */
  public static outlineStroke(element: VectorElement, model: VectorModel): VectorElement | null {
    if (!element.vertices || element.vertices.length < 2) return null;

    // 1. Try analytical Bézier parallel curve extrusion (exact 2N node count & proportional curvature)
    const analytical = this.analyticalOutlineStroke(element, model);
    if (analytical) {
      return analytical;
    }

    // 2. Fallback to planar polygon clipping for closed loops or composite subpaths
    const strokeWidth = parseFloat(element.attributes['stroke-width'] || '1') || 1;
    const strokeLinecap = element.attributes['stroke-linecap'] || 'butt';
    const strokeLinejoin = element.attributes['stroke-linejoin'] || 'miter';
    const strokeMiterlimit = parseFloat(element.attributes['stroke-miterlimit'] || '4') || 4;
    const strokeColor = element.attributes['stroke'] || '#000000';

    const markerStartType = this.parseMarkerType(element.attributes['marker-start']);
    const markerMidType = this.parseMarkerType(element.attributes['marker-mid']);
    const markerEndType = this.parseMarkerType(element.attributes['marker-end']);

    const halfW = strokeWidth / 2;

    const makeDisc = (cx: number, cy: number, r: number, steps: number = 16): Polygon => {
      const ring: Ring = [];
      for (let s = 0; s < steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        ring.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta)]);
      }
      ring.push([ring[0][0], ring[0][1]]);
      return [ring];
    };

    // Deconstruct element into subpaths
    const subpaths: PathVertex[][] = [];
    let currentSp: PathVertex[] = [];
    element.vertices.forEach((v, idx) => {
      if (v.command === 'M' && idx > 0) {
        if (currentSp.length > 0) subpaths.push(currentSp);
        currentSp = [v];
      } else {
        currentSp.push(v);
      }
    });
    if (currentSp.length > 0) subpaths.push(currentSp);

    const thickPolygons: Polygon[] = [];

    for (const sp of subpaths) {
      if (sp.length < 2) continue;

      const pts: Array<{ x: number; y: number }> = [];
      const addPt = (p: { x: number; y: number }) => {
        if (pts.length === 0 || Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) > 0.001) {
          pts.push({ x: p.x, y: p.y });
        }
      };

      for (let i = 0; i < sp.length - 1; i++) {
        const v = sp[i];
        const nextV = sp[i + 1];
        addPt(v);
        if (v.handleOut || nextV.handleIn) {
          const h1 = v.handleOut || { x: v.x, y: v.y };
          const h2 = nextV.handleIn || { x: nextV.x, y: nextV.y };
          const sampled = PolygonUtils.sampleBezier(v, h1, h2, nextV, 24);
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
          const sampled = PolygonUtils.sampleBezier(lastSpV, h1, h2, firstSpV, 24);
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

    return PolygonUtils.multiPolygonToElement(merged, newId, baseAttrs, model);
  }

  /**
   * ARCHITECTURAL RATIONALE: Independent Vector Synthesis for SVG Markers (FIX-22)
   *
   * 1. Separation of Concerns & Independent Topology:
   *    Instead of merging marker shapes into the stroke polygon mesh through destructive planar
   *    boolean operations, each active marker (marker-start, marker-mid, marker-end) is converted
   *    into its own independent <path> VectorElement. This preserves exact geometry (e.g. 3 clean
   *    vertices for an arrow head), enables independent repositioning/coloring, and eliminates
   *    unwanted boolean artifact vertices.
   *
   * 2. Strict SVG 2 Tangent Direction Limits:
   *    Uses `computeStartTangent`, `computeEndTangent`, and `computeMidTangent` to evaluate tangent
   *    limits even when anchor and control point coincide (e.g. P0 == P1 or P2 == P3), matching
   *    native browser rendering with sub-pixel fidelity.
   *
   * 3. Affine Coordinate Synthesis:
   *    Maps canonical marker coordinates (0 0 10 10) through:
   *      x' = anchor.x + (dx * cos - dy * sin)
   *      y' = anchor.y + (dx * sin + dy * cos)
   *    where dx = (X - refX) * scale, dy = (Y - refY) * scale.
   */
  public static createMarkerElements(element: VectorElement, model: VectorModel): VectorElement[] {
    if (!element.vertices || element.vertices.length < 2) return [];

    const markerStartType = this.parseMarkerType(element.attributes['marker-start']);
    const markerMidType = this.parseMarkerType(element.attributes['marker-mid']);
    const markerEndType = this.parseMarkerType(element.attributes['marker-end']);

    if (markerStartType === 'none' && markerMidType === 'none' && markerEndType === 'none') {
      return [];
    }

    const strokeWidth = parseFloat(element.attributes['stroke-width'] || '1') || 1;
    const markerOffset = parseFloat(element.attributes['data-marker-offset'] || '0') || 0;
    const markerSize = element.attributes['data-marker-size'] ? parseFloat(element.attributes['data-marker-size']) : 6;
    const markerUnits = element.attributes['data-marker-units'] || 'strokeWidth';

    const customColor = element.attributes['data-marker-color'];
    const markerColor = (customColor && customColor !== 'context-stroke')
      ? customColor
      : (element.attributes['stroke'] || '#ffffff');

    // Deconstruct element into subpaths
    const subpaths: PathVertex[][] = [];
    let currentSp: PathVertex[] = [];
    element.vertices.forEach((v, idx) => {
      if (v.command === 'M' && idx > 0) {
        if (currentSp.length > 0) subpaths.push(currentSp);
        currentSp = [v];
      } else {
        currentSp.push(v);
      }
    });
    if (currentSp.length > 0) subpaths.push(currentSp);

    const isClosed = element.isClosed ?? false;
    const markerElements: VectorElement[] = [];

    const sizeScale = markerSize / 6;
    const unitScale = markerUnits === 'userSpaceOnUse' ? 1 : strokeWidth;

    const buildMarker = (
      markerId: string,
      anchor: Point,
      tangent: Point,
      pos: 'start' | 'mid' | 'end'
    ): VectorElement | null => {
      if (!markerId || markerId === 'none') return null;
      const len = Math.hypot(tangent.x, tangent.y);
      if (len < 1e-4) return null;
      const cos = tangent.x / len;
      const sin = tangent.y / len;

      const transformPoint = (X: number, Y: number, refX: number, refY: number, mw: number, mh: number): Point => {
        const scale = Math.min((mw * sizeScale) / 10, (mh * sizeScale) / 10) * unitScale;
        const dx = (X - refX) * scale;
        const dy = (Y - refY) * scale;
        return {
          x: Math.round((anchor.x + dx * cos - dy * sin) * 100) / 100,
          y: Math.round((anchor.y + dx * sin + dy * cos) * 100) / 100,
        };
      };

      const newId = `el_marker_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

      if (markerId.includes('arrow-filled')) {
        let pts: [number, number][];
        let refX = 5;
        const refY = 5;
        const mw = 6;
        const mh = 6;
        if (pos === 'start') {
          refX = 1 + markerOffset;
          pts = [[10, 1.5], [1, 5], [10, 8.5]];
        } else if (pos === 'end') {
          refX = 9 - markerOffset;
          pts = [[0, 1.5], [9, 5], [0, 8.5]];
        } else {
          refX = 5 - markerOffset;
          pts = [[1, 1.5], [9, 5], [1, 8.5]];
        }

        const tPts = pts.map(([x, y]) => transformPoint(x, y, refX, refY, mw, mh));
        const verts: PathVertex[] = tPts.map((p, idx) => ({
          id: `v_${Date.now().toString(36)}_${idx}`,
          x: p.x,
          y: p.y,
          command: idx === 0 ? 'M' : 'L',
          nodeType: 'sharp',
        }));

        const d = `M ${tPts[0].x} ${tPts[0].y} L ${tPts[1].x} ${tPts[1].y} L ${tPts[2].x} ${tPts[2].y} Z`;
        return {
          id: newId,
          tagName: 'path',
          attributes: {
            id: newId,
            d,
            fill: markerColor,
            stroke: 'none',
            'stroke-width': '0',
          },
          vertices: verts,
          isClosed: true,
        };
      }

      if (markerId.includes('arrow-open')) {
        let pts: [number, number][];
        let refX = 5;
        const refY = 5;
        const mw = 6;
        const mh = 6;
        if (pos === 'start') {
          refX = 1 + markerOffset;
          pts = [[9, 1.5], [1, 5], [9, 8.5]];
        } else if (pos === 'end') {
          refX = 9 - markerOffset;
          pts = [[1, 1.5], [9, 5], [1, 8.5]];
        } else {
          refX = 5 - markerOffset;
          pts = [[1, 1.5], [9, 5], [1, 8.5]];
        }

        const tPts = pts.map(([x, y]) => transformPoint(x, y, refX, refY, mw, mh));
        const verts: PathVertex[] = tPts.map((p, idx) => ({
          id: `v_${Date.now().toString(36)}_${idx}`,
          x: p.x,
          y: p.y,
          command: idx === 0 ? 'M' : 'L',
          nodeType: 'sharp',
        }));

        const scale = Math.min((mw * sizeScale) / 10, (mh * sizeScale) / 10) * unitScale;
        const openStrokeWidth = Math.max(0.5, Math.round(1.8 * scale * 100) / 100);
        const d = `M ${tPts[0].x} ${tPts[0].y} L ${tPts[1].x} ${tPts[1].y} L ${tPts[2].x} ${tPts[2].y}`;
        return {
          id: newId,
          tagName: 'path',
          attributes: {
            id: newId,
            d,
            fill: 'none',
            stroke: markerColor,
            'stroke-width': openStrokeWidth.toString(),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          vertices: verts,
          isClosed: false,
        };
      }

      if (markerId.includes('square-block')) {
        const refX = pos === 'start' ? 5 + markerOffset : 5 - markerOffset;
        const refY = 5;
        const mw = 5;
        const mh = 5;
        const corners: [number, number][] = [[2, 2], [8, 2], [8, 8], [2, 8]];
        const tPts = corners.map(([x, y]) => transformPoint(x, y, refX, refY, mw, mh));
        const verts: PathVertex[] = tPts.map((p, idx) => ({
          id: `v_${Date.now().toString(36)}_${idx}`,
          x: p.x,
          y: p.y,
          command: idx === 0 ? 'M' : 'L',
          nodeType: 'sharp',
        }));
        const d = `M ${tPts[0].x} ${tPts[0].y} L ${tPts[1].x} ${tPts[1].y} L ${tPts[2].x} ${tPts[2].y} L ${tPts[3].x} ${tPts[3].y} Z`;
        return {
          id: newId,
          tagName: 'path',
          attributes: {
            id: newId,
            d,
            fill: markerColor,
            stroke: 'none',
            'stroke-width': '0',
          },
          vertices: verts,
          isClosed: true,
        };
      }

      if (markerId.includes('circle-dot')) {
        const refX = pos === 'start' ? 5 + markerOffset : 5 - markerOffset;
        const refY = 5;
        const mw = 5;
        const mh = 5;
        const center = transformPoint(5, 5, refX, refY, mw, mh);
        const scale = Math.min((mw * sizeScale) / 10, (mh * sizeScale) / 10) * unitScale;
        const r = Math.round(3.5 * scale * 100) / 100;
        const k = Math.round(r * 0.55228475 * 100) / 100;

        const verts: PathVertex[] = [
          {
            id: `v_${Date.now().toString(36)}_0`,
            x: center.x + r,
            y: center.y,
            command: 'M',
            handleIn: { x: center.x + r, y: center.y - k },
            handleOut: { x: center.x + r, y: center.y + k },
            nodeType: 'smooth',
          },
          {
            id: `v_${Date.now().toString(36)}_1`,
            x: center.x,
            y: center.y + r,
            command: 'C',
            handleIn: { x: center.x + k, y: center.y + r },
            handleOut: { x: center.x - k, y: center.y + r },
            nodeType: 'smooth',
          },
          {
            id: `v_${Date.now().toString(36)}_2`,
            x: center.x - r,
            y: center.y,
            command: 'C',
            handleIn: { x: center.x - r, y: center.y + k },
            handleOut: { x: center.x - r, y: center.y - k },
            nodeType: 'smooth',
          },
          {
            id: `v_${Date.now().toString(36)}_3`,
            x: center.x,
            y: center.y - r,
            command: 'C',
            handleIn: { x: center.x - k, y: center.y - r },
            handleOut: { x: center.x + k, y: center.y - r },
            nodeType: 'smooth',
          },
        ];
        const d = `M ${center.x + r} ${center.y} C ${center.x + r} ${center.y + k} ${center.x + k} ${center.y + r} ${center.x} ${center.y + r} C ${center.x - k} ${center.y + r} ${center.x - r} ${center.y + k} ${center.x - r} ${center.y} C ${center.x - r} ${center.y - k} ${center.x - k} ${center.y - r} ${center.x} ${center.y - r} C ${center.x + k} ${center.y - r} ${center.x + r} ${center.y - k} ${center.x + r} ${center.y} Z`;
        return {
          id: newId,
          tagName: 'path',
          attributes: {
            id: newId,
            d,
            fill: markerColor,
            stroke: 'none',
            'stroke-width': '0',
          },
          vertices: verts,
          isClosed: true,
        };
      }

      if (markerId.includes('bar-cap')) {
        const baseRefX = pos === 'start' ? 2 : 8;
        const refX = pos === 'start' ? baseRefX + markerOffset : baseRefX - markerOffset;
        const refY = 5;
        const mw = 5;
        const mh = 6;
        const p1 = transformPoint(refX, 1, refX, refY, mw, mh);
        const p2 = transformPoint(refX, 9, refX, refY, mw, mh);
        const scale = Math.min((mw * sizeScale) / 10, (mh * sizeScale) / 10) * unitScale;
        const capWidth = Math.max(1, Math.round(2 * scale * 100) / 100);
        const verts: PathVertex[] = [
          { id: `v_${Date.now().toString(36)}_0`, x: p1.x, y: p1.y, command: 'M', nodeType: 'sharp' },
          { id: `v_${Date.now().toString(36)}_1`, x: p2.x, y: p2.y, command: 'L', nodeType: 'sharp' },
        ];
        const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        return {
          id: newId,
          tagName: 'path',
          attributes: {
            id: newId,
            d,
            fill: 'none',
            stroke: markerColor,
            'stroke-width': capWidth.toString(),
            'stroke-linecap': 'round',
          },
          vertices: verts,
          isClosed: false,
        };
      }

      return null;
    };

    for (const sp of subpaths) {
      if (sp.length < 2) continue;

      if (markerStartType !== 'none') {
        const tan = this.computeStartTangent(sp);
        const mEl = buildMarker(markerStartType, sp[0], tan, 'start');
        if (mEl) markerElements.push(mEl);
      }

      if (markerMidType !== 'none') {
        const midCount = isClosed ? sp.length : sp.length - 1;
        for (let i = 1; i < midCount; i++) {
          const curr = sp[i];
          const prev = sp[i - 1];
          const next = isClosed && i === sp.length - 1 ? sp[0] : sp[i + 1];
          const tan = this.computeMidTangent(prev, curr, next);
          const mEl = buildMarker(markerMidType, curr, tan, 'mid');
          if (mEl) markerElements.push(mEl);
        }
      }

      if (markerEndType !== 'none') {
        const anchor = isClosed ? sp[0] : sp[sp.length - 1];
        const tan = this.computeEndTangent(sp);
        const mEl = buildMarker(markerEndType, anchor, tan, 'end');
        if (mEl) markerElements.push(mEl);
      }
    }

    return markerElements;
  }

  /**
   * Converts a stroked vector element and its markers into independent outline vector elements.
   */
  public static outlineStrokeElements(element: VectorElement, model: VectorModel): VectorElement[] {
    const results: VectorElement[] = [];
    const outlined = this.outlineStroke(element, model);
    if (outlined) {
      results.push(outlined);
    }
    const markers = this.createMarkerElements(element, model);
    results.push(...markers);
    return results;
  }
}
