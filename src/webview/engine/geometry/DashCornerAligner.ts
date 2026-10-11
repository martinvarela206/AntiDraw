import { Point } from '../../core/geom/Point.js';
import { VectorElement, PathVertex } from '../VectorModel.js';

export interface FittedDashResult {
  dashArray: number[];
  dashString: string;
  isFitted: boolean;
}

/**
 * ARCHITECTURAL RATIONALE: Dash Corner Alignment Algorithm (Plan::fitted)
 *
 * Modeled after VectorCraft's `crates/effects/src/stroke/dash.rs`:
 * Standard SVG `stroke-dasharray` cuts corners mid-dash or inside a gap.
 * In professional vector editors (Illustrator, VectorCraft), the arc length
 * of each sub-segment between sharp corners/vertices is measured, and the periodic
 * dash pattern `(dash + gap)` is scaled by a minimal fraction so that an integer
 * number of periods fits the segment.
 *
 * Corner Centering:
 * 1. For standard dashes (dash > 0):
 *    Each edge begins and ends with half a dash (d / 2). When two edges meet at a corner,
 *    the two half-dashes combine to form a full dash centered exactly on the corner vertex.
 * 2. For circular dots (dash === 0, stroke-linecap="round"):
 *    Each edge starts with a dot at the corner vertex, followed by fitted gaps,
 *    guaranteeing that a circular disk is positioned squarely on every corner vertex.
 */
export class DashCornerAligner {
  /**
   * Parses an SVG `stroke-dasharray` string into an array of non-negative numbers.
   * If the array length is odd, SVG specifications mandate duplicating it to make it even.
   */
  public static parseDashPattern(dashStr: string): number[] {
    if (!dashStr || typeof dashStr !== 'string') return [];
    const parts = dashStr
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && n >= 0);

    if (parts.length === 0) return [];
    // If odd length, duplicate pattern per W3C SVG spec
    if (parts.length % 2 !== 0) {
      return [...parts, ...parts];
    }
    return parts;
  }

  /**
   * Approximates the arc length of a cubic Bézier curve via 16-step numerical integration.
   */
  public static computeCubicBezierLength(
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    steps: number = 16
  ): number {
    let length = 0;
    let prevX = p0.x;
    let prevY = p0.y;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;

      const curX = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
      const curY = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;

      const dx = curX - prevX;
      const dy = curY - prevY;
      length += Math.hypot(dx, dy);

      prevX = curX;
      prevY = curY;
    }
    return length;
  }

  /**
   * Extracts the constituent edge or segment lengths and closed status of an element.
   */
  public static getElementSegments(el: VectorElement): { lengths: number[]; isClosed: boolean } {
    const tagName = el.tagName?.toLowerCase() || '';

    // 1. Rect
    if (tagName === 'rect' || el.shapeType === 'rect') {
      const w = Math.abs(parseFloat(el.attributes['width'] || '0'));
      const h = Math.abs(parseFloat(el.attributes['height'] || '0'));
      if (w > 0 && h > 0) {
        return { lengths: [w, h, w, h], isClosed: true };
      }
    }

    // 2. Line
    if (tagName === 'line' || el.shapeType === 'line') {
      const x1 = parseFloat(el.attributes['x1'] || '0');
      const y1 = parseFloat(el.attributes['y1'] || '0');
      const x2 = parseFloat(el.attributes['x2'] || '0');
      const y2 = parseFloat(el.attributes['y2'] || '0');
      const len = Math.hypot(x2 - x1, y2 - y1);
      return { lengths: [len > 0 ? len : 1], isClosed: false };
    }

    // 3. Polygon and Polyline
    if (tagName === 'polygon' || tagName === 'polyline' || el.shapeType === 'polygon' || el.shapeType === 'polyline') {
      const isClosed = tagName === 'polygon' || el.shapeType === 'polygon';
      const ptsAttr = el.attributes['points'] || '';
      const coords = ptsAttr.trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
      const points: Point[] = [];
      for (let i = 0; i < coords.length; i += 2) {
        if (i + 1 < coords.length) {
          points.push({ x: coords[i], y: coords[i + 1] });
        }
      }

      if (points.length >= 2) {
        const lengths: number[] = [];
        for (let i = 0; i < points.length - 1; i++) {
          lengths.push(Math.max(0.001, Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)));
        }
        if (isClosed && points.length >= 3) {
          const lastIdx = points.length - 1;
          lengths.push(Math.max(0.001, Math.hypot(points[0].x - points[lastIdx].x, points[0].y - points[lastIdx].y)));
        }
        return { lengths, isClosed };
      }
    }

    // 4. Circle
    if (tagName === 'circle' || el.shapeType === 'circle') {
      const r = Math.abs(parseFloat(el.attributes['r'] || '0'));
      if (r > 0) {
        // Divide into 4 quadrants for 4-way symmetry at 0°, 90°, 180°, 270°
        const quadLen = (2 * Math.PI * r) / 4;
        return { lengths: [quadLen, quadLen, quadLen, quadLen], isClosed: true };
      }
    }

    // 5. Ellipse
    if (tagName === 'ellipse' || el.shapeType === 'ellipse') {
      const rx = Math.abs(parseFloat(el.attributes['rx'] || '0'));
      const ry = Math.abs(parseFloat(el.attributes['ry'] || '0'));
      if (rx > 0 && ry > 0) {
        // Ramanujan approximation for ellipse perimeter
        const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
        const perim = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
        const quadLen = perim / 4;
        return { lengths: [quadLen, quadLen, quadLen, quadLen], isClosed: true };
      }
    }

    // 6. Path with Vertices
    if (el.vertices && el.vertices.length >= 2) {
      const vertices = el.vertices;
      const isClosed = el.isClosed || vertices.some((v) => v.command === 'Z');
      const lengths: number[] = [];
      const n = vertices.length;

      for (let i = 0; i < n; i++) {
        if (i === n - 1 && !isClosed) break;
        const curV = vertices[i];
        const nextV = vertices[(i + 1) % n];

        if (curV.handleOut || nextV.handleIn) {
          const p0 = { x: curV.x, y: curV.y };
          const p1 = curV.handleOut ? { x: curV.handleOut.x, y: curV.handleOut.y } : p0;
          const p2 = nextV.handleIn ? { x: nextV.handleIn.x, y: nextV.handleIn.y } : { x: nextV.x, y: nextV.y };
          const p3 = { x: nextV.x, y: nextV.y };
          const bLen = this.computeCubicBezierLength(p0, p1, p2, p3);
          lengths.push(Math.max(0.001, bLen));
        } else {
          const sLen = Math.hypot(nextV.x - curV.x, nextV.y - curV.y);
          lengths.push(Math.max(0.001, sLen));
        }
      }

      if (lengths.length > 0) {
        return { lengths, isClosed };
      }
    }

    // Fallback: estimate from bounding box or single segment
    return { lengths: [100], isClosed: false };
  }

  /**
   * Fits a dash/gap pattern to an individual edge of length `L`.
   */
  public static fitPatternToEdge(
    L: number,
    dash: number,
    gap: number,
    isDot: boolean
  ): { array: number[]; startDash: number; endDash: number } {
    if (L <= 0.0001) {
      return { array: [], startDash: 0, endDash: 0 };
    }

    if (isDot) {
      // Circular dots: dash is 0
      const safeGap = Math.max(0.5, gap);
      const k = Math.max(1, Math.round(L / safeGap));
      const fittedGap = L / k;
      const array: number[] = [];
      for (let i = 0; i < k; i++) {
        array.push(0, fittedGap);
      }
      return { array, startDash: 0, endDash: 0 };
    }

    // Standard dashes: dash > 0
    const safeDash = Math.max(0.5, dash);
    const safeGap = Math.max(0.5, gap);
    const nominalPeriod = safeDash + safeGap;
    const k = Math.max(1, Math.round(L / nominalPeriod));
    const fittedPeriod = L / k;
    const scale = fittedPeriod / nominalPeriod;
    const fittedDash = safeDash * scale;
    const fittedGap = safeGap * scale;

    const halfDash = fittedDash / 2;
    const array: number[] = [];

    // Edge structure:
    // starts with halfDash, then (k - 1) cycles of (fittedGap, fittedDash), then fittedGap, ending with halfDash
    array.push(halfDash);
    for (let i = 0; i < k - 1; i++) {
      array.push(fittedGap, fittedDash);
    }
    array.push(fittedGap, halfDash);

    return { array, startDash: halfDash, endDash: halfDash };
  }

  /**
   * Computes the fitted `stroke-dasharray` for a vector element given a nominal dash pattern.
   */
  public static calculateFittedDashArray(
    el: VectorElement,
    nominalDashPattern: number[]
  ): number[] {
    if (nominalDashPattern.length < 2) return nominalDashPattern;

    const dash = nominalDashPattern[0];
    const gap = nominalDashPattern[1];
    const isDot = dash <= 0.0001;

    const { lengths, isClosed } = this.getElementSegments(el);
    if (lengths.length === 0) return nominalDashPattern;

    if (isDot) {
      // For dots, concatenate dot-gap pairs
      const combined: number[] = [];
      for (const len of lengths) {
        const edge = this.fitPatternToEdge(len, dash, gap, true);
        combined.push(...edge.array);
      }
      return combined;
    }

    // For standard dashes:
    // Generate arrays for all edges and merge consecutive half-dashes at corners
    const edgeResults = lengths.map((len) => this.fitPatternToEdge(len, dash, gap, false));
    const combined: number[] = [];

    const numEdges = edgeResults.length;
    for (let i = 0; i < numEdges; i++) {
      const cur = edgeResults[i];
      if (cur.array.length < 2) continue;

      if (i === 0) {
        // First edge starts with its leading half-dash
        combined.push(cur.array[0]);
      }

      // Middle components (excluding first and last half-dash)
      for (let j = 1; j < cur.array.length - 1; j++) {
        combined.push(cur.array[j]);
      }

      if (i < numEdges - 1) {
        // Corner between edge i and edge i + 1:
        // Merge trailing half-dash of cur with leading half-dash of next
        const next = edgeResults[i + 1];
        const cornerDash = cur.endDash + next.startDash;
        combined.push(cornerDash);
      } else {
        // Final edge
        if (isClosed && numEdges > 1) {
          // Closed shape: trailing half-dash of final edge meets leading half-dash of edge 0
          // In SVG, the pattern closes, so we leave the last element as trailing half-dash
          combined.push(cur.endDash);
        } else {
          // Open path: ends with halfDash (or full terminal cap)
          combined.push(cur.endDash);
        }
      }
    }

    return combined;
  }

  /**
   * High-level method: formats the fitted pattern into a concise SVG attribute string.
   */
  public static calculateFittedDashString(
    el: VectorElement,
    nominalDashStr: string
  ): string {
    const pattern = this.parseDashPattern(nominalDashStr);
    if (pattern.length < 2) return nominalDashStr;

    const fitted = this.calculateFittedDashArray(el, pattern);
    if (!fitted || fitted.length === 0) return nominalDashStr;

    return fitted
      .map((val) => {
        const rounded = Math.round(val * 100) / 100;
        return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
      })
      .join(' ');
  }

  /**
   * Synchronizes the fitted dash array if the element has corner alignment active.
   * Can be invoked after resizing, scaling, or editing vertices.
   */
  public static updateFittedDashIfActive(el: VectorElement): boolean {
    if (el.attributes['data-dash-align'] !== 'corners') return false;
    const nominal = el.attributes['data-dash-nominal'] || el.attributes['stroke-dasharray'];
    if (!nominal) return false;

    const fittedStr = this.calculateFittedDashString(el, nominal);
    el.attributes['stroke-dasharray'] = fittedStr;
    return true;
  }
}
