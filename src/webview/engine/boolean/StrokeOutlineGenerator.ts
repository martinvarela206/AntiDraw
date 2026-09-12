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
   * Converts a stroked vector element into a closed, filled polygon representation of its stroke outline.
   */
  public static outlineStroke(element: VectorElement, model: VectorModel): VectorElement | null {
    if (!element.vertices || element.vertices.length < 2) return null;

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

      // Append marker geometry into thickPolygons
      const markerOffset = parseFloat(element.attributes['data-marker-offset'] || '0') || 0;
      const markerSize = element.attributes['data-marker-size'] ? parseFloat(element.attributes['data-marker-size']) : 6;
      const markerUnits = element.attributes['data-marker-units'] || 'strokeWidth';

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
        const mPolys = this.createMarkerPolygons(markerStartType, sp[0], v0Tan, strokeWidth, markerOffset, markerSize, markerUnits);
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

          const mPolys = this.createMarkerPolygons(markerMidType, curr, midTan, strokeWidth, markerOffset, markerSize, markerUnits);
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
          const mPolys = this.createMarkerPolygons(markerEndType, firstV, vnTan, strokeWidth, markerOffset, markerSize, markerUnits);
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
          const mPolys = this.createMarkerPolygons(markerEndType, lastV, vnTan, strokeWidth, markerOffset, markerSize, markerUnits);
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

    return PolygonUtils.multiPolygonToElement(merged, newId, baseAttrs, model);
  }
}
