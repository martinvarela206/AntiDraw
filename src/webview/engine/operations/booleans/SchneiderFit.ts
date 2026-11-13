import { Point } from '../../../core/geom/Point.js';
import { PathVertex } from '../../../core/model/VectorTypes.js';

/**
 * ARCHITECTURAL RATIONALE: Schneider Cubic Bézier Curve Fitting (SchneiderFit)
 *
 * Algorithm Reference:
 * Philip J. Schneider, "An Algorithm for Automatically Fitting Digitized Curves",
 * Graphics Gems, Academic Press, 1990, pp. 612-626.
 *
 * Problem:
 * Constructive Area Geometry (CAG) via Martinez-Rueda (`polygon-clipping`) operates
 * on dense polygon boundaries. Converting Bézier curves into hundreds of polygonal
 * segments produces jagged, hyper-fragmented geometry when recombined.
 *
 * Solution:
 * Re-approximate discrete polygonal point chains with an optimal sequence of
 * smooth, cubic Bézier splines within a configurable Euclidean error tolerance (`epsilon`).
 * Preserves tangency continuity (C1) and produces minimal, human-editable vector vertices.
 */

export interface CubicBezier {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  isCornerStart?: boolean;
  isCornerEnd?: boolean;
}

export interface SchneiderFitOptions {
  errorTolerance?: number;
  zoom?: number;
  scale?: number;
  cornerAngle?: number; // Corner detection threshold in degrees (default 60 deg)
  detectCorners?: boolean; // Enable sharp corner segmentation (default true)
}

export class SchneiderFit {
  /**
   * Resolves effective fitting error tolerance adaptively based on document scale and zoom level.
   */
  public static resolveAdaptiveTolerance(
    baseTolerance: number = 2.0,
    zoom: number = 1.0,
    scale: number = 1.0
  ): number {
    const z = Math.max(0.01, zoom);
    const s = Math.max(0.01, scale);
    return Math.max(0.05, baseTolerance / (z * s));
  }

  /**
   * Detects indices of sharp directional corners along a digitized point chain.
   */
  public static detectCornerIndices(
    points: Point[],
    angleThresholdDeg: number = 60
  ): number[] {
    if (!points || points.length < 3) return [];

    const cornerIndices: number[] = [];
    const minLengthSq = 1e-6;

    for (let i = 1; i < points.length - 1; i++) {
      const pPrev = points[i - 1];
      const pCurr = points[i];
      const pNext = points[i + 1];

      const v1x = pCurr.x - pPrev.x;
      const v1y = pCurr.y - pPrev.y;
      const v2x = pNext.x - pCurr.x;
      const v2y = pNext.y - pCurr.y;

      const len1Sq = v1x * v1x + v1y * v1y;
      const len2Sq = v2x * v2x + v2y * v2y;

      if (len1Sq < minLengthSq || len2Sq < minLengthSq) continue;

      const len1 = Math.sqrt(len1Sq);
      const len2 = Math.sqrt(len2Sq);

      const dotVal = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const clampedDot = Math.max(-1, Math.min(1, dotVal));
      const angleDeg = (Math.acos(clampedDot) * 180) / Math.PI;

      if (angleDeg >= angleThresholdDeg) {
        // Suppress consecutive false-positive clusters by keeping local extremum
        if (cornerIndices.length > 0 && cornerIndices[cornerIndices.length - 1] === i - 1) {
          // Compare angle with previous corner
          const prevIdx = cornerIndices[cornerIndices.length - 1];
          const pP0 = points[prevIdx - 1];
          const pP1 = points[prevIdx];
          const pP2 = points[prevIdx + 1];
          const dP1 = (pP1.x - pP0.x) * (pP2.x - pP1.x) + (pP1.y - pP0.y) * (pP2.y - pP1.y);
          const lP = Math.hypot(pP1.x - pP0.x, pP1.y - pP0.y) * Math.hypot(pP2.x - pP1.x, pP2.y - pP1.y);
          const prevAngle = lP > 0 ? (Math.acos(Math.max(-1, Math.min(1, dP1 / lP))) * 180) / Math.PI : 0;
          if (angleDeg > prevAngle) {
            cornerIndices[cornerIndices.length - 1] = i;
          }
        } else {
          cornerIndices.push(i);
        }
      }
    }

    return cornerIndices;
  }

  /**
   * Fits a series of cubic Bézier curves to a sequence of digitized 2D points,
   * featuring analytical corner segmentation and adaptive zoom/scale tolerance.
   *
   * @param points Array of sequential digitized points
   * @param errorToleranceOrOptions Maximum allowed Euclidean distance or SchneiderFitOptions
   * @returns Array of fitted cubic Bézier segments
   */
  public static fitCurve(
    points: Point[],
    errorToleranceOrOptions: number | SchneiderFitOptions = 2.0
  ): CubicBezier[] {
    if (!points || points.length < 2) return [];

    let baseError = 2.0;
    let zoom = 1.0;
    let scale = 1.0;
    let detectCorners = true;
    let cornerAngle = 60;

    if (typeof errorToleranceOrOptions === 'number') {
      baseError = errorToleranceOrOptions;
    } else if (errorToleranceOrOptions) {
      baseError = errorToleranceOrOptions.errorTolerance ?? 2.0;
      zoom = errorToleranceOrOptions.zoom ?? 1.0;
      scale = errorToleranceOrOptions.scale ?? 1.0;
      detectCorners = errorToleranceOrOptions.detectCorners ?? true;
      cornerAngle = errorToleranceOrOptions.cornerAngle ?? 60;
    }

    const effectiveTolerance = this.resolveAdaptiveTolerance(baseError, zoom, scale);

    if (points.length === 2) {
      return [
        {
          p0: { ...points[0] },
          p1: {
            x: points[0].x + (points[1].x - points[0].x) / 3,
            y: points[0].y + (points[1].y - points[0].y) / 3,
          },
          p2: {
            x: points[1].x - (points[1].x - points[0].x) / 3,
            y: points[1].y - (points[1].y - points[0].y) / 3,
          },
          p3: { ...points[1] },
        },
      ];
    }

    // Analytical corner detection & segmentation
    const corners = detectCorners ? this.detectCornerIndices(points, cornerAngle) : [];

    if (corners.length === 0) {
      const tHat1 = this.computeLeftTangent(points, 0);
      const tHat2 = this.computeRightTangent(points, points.length - 1);
      const result: CubicBezier[] = [];
      this.fitCubic(points, 0, points.length - 1, tHat1, tHat2, effectiveTolerance, result);
      return result;
    }

    // Segment point chain across detected corners
    const partitions: { first: number; last: number }[] = [];
    let startIdx = 0;
    for (const cIdx of corners) {
      if (cIdx > startIdx) {
        partitions.push({ first: startIdx, last: cIdx });
        startIdx = cIdx;
      }
    }
    if (startIdx < points.length - 1) {
      partitions.push({ first: startIdx, last: points.length - 1 });
    }

    const allCurves: CubicBezier[] = [];
    for (let p = 0; p < partitions.length; p++) {
      const { first, last } = partitions[p];
      if (last - first < 1) continue;

      const subPoints = points.slice(first, last + 1);
      const tHat1 = this.computeLeftTangent(subPoints, 0);
      const tHat2 = this.computeRightTangent(subPoints, subPoints.length - 1);
      const segmentCurves: CubicBezier[] = [];
      this.fitCubic(subPoints, 0, subPoints.length - 1, tHat1, tHat2, effectiveTolerance, segmentCurves);

      if (segmentCurves.length > 0) {
        if (p > 0) segmentCurves[0].isCornerStart = true;
        if (p < partitions.length - 1) segmentCurves[segmentCurves.length - 1].isCornerEnd = true;
        allCurves.push(...segmentCurves);
      }
    }

    return allCurves;
  }

  /**
   * Fits digitized points and compiles them into a sequence of PathVertex nodes
   * with accurate corner node typing.
   */
  public static fitPointsToVertices(
    points: Point[],
    errorToleranceOrOptions: number | SchneiderFitOptions = 2.0,
    isClosed: boolean = false
  ): PathVertex[] {
    const curves = this.fitCurve(points, errorToleranceOrOptions);
    if (curves.length === 0) return [];

    const vertices: PathVertex[] = [];

    // First vertex
    vertices.push({
      id: `v_fit_${Date.now()}_0`,
      x: curves[0].p0.x,
      y: curves[0].p0.y,
      handleOut: { x: curves[0].p1.x, y: curves[0].p1.y },
      nodeType: curves[0].isCornerStart ? 'sharp' : 'smooth',
      command: 'M',
    });

    for (let i = 0; i < curves.length; i++) {
      const c = curves[i];
      const isLast = i === curves.length - 1;
      const nextCurve = !isLast ? curves[i + 1] : null;
      const isSharp = c.isCornerEnd || (nextCurve && nextCurve.isCornerStart);

      vertices.push({
        id: `v_fit_${Date.now()}_${i + 1}`,
        x: c.p3.x,
        y: c.p3.y,
        handleIn: { x: c.p2.x, y: c.p2.y },
        handleOut: nextCurve ? { x: nextCurve.p1.x, y: nextCurve.p1.y } : undefined,
        nodeType: isSharp ? 'sharp' : 'smooth',
        command: isLast && isClosed ? 'Z' : 'C',
      });
    }

    return vertices;
  }

  private static fitCubic(
    points: Point[],
    first: number,
    last: number,
    tHat1: Point,
    tHat2: Point,
    error: number,
    acc: CubicBezier[]
  ): void {
    const nPts = last - first + 1;

    // Base case: exactly 2 points
    if (nPts === 2) {
      const dist = Math.hypot(points[last].x - points[first].x, points[last].y - points[first].y) / 3.0;
      acc.push({
        p0: { ...points[first] },
        p1: { x: points[first].x + tHat1.x * dist, y: points[first].y + tHat1.y * dist },
        p2: { x: points[last].x + tHat2.x * dist, y: points[last].y + tHat2.y * dist },
        p3: { ...points[last] },
      });
      return;
    }

    // Parameterize points by chord length
    const u = this.chordLengthParameterize(points, first, last);

    // Generate initial Bézier curve
    let bezCurve = this.generateBezier(points, first, last, u, tHat1, tHat2);

    // Find max error and split point
    const maxErrorResult = this.computeMaxError(points, first, last, bezCurve, u);

    if (maxErrorResult.maxDist < error) {
      acc.push(bezCurve);
      return;
    }

    // If error is not too massive, try Reparameterize (Newton-Raphson iteration)
    if (maxErrorResult.maxDist < error * error * 2) {
      for (let i = 0; i < 4; i++) {
        const uPrime = this.reparameterize(bezCurve, points, first, last, u);
        bezCurve = this.generateBezier(points, first, last, uPrime, tHat1, tHat2);
        const check = this.computeMaxError(points, first, last, bezCurve, uPrime);
        if (check.maxDist < error) {
          acc.push(bezCurve);
          return;
        }
      }
    }

    // Split at index of maximum deviation
    let splitPoint = maxErrorResult.splitPoint;
    if (splitPoint <= first) splitPoint = first + 1;
    if (splitPoint >= last) splitPoint = last - 1;

    const tHatCenter = this.computeCenterTangent(points, splitPoint);
    const negTHatCenter = { x: -tHatCenter.x, y: -tHatCenter.y };

    this.fitCubic(points, first, splitPoint, tHat1, tHatCenter, error, acc);
    this.fitCubic(points, splitPoint, last, negTHatCenter, tHat2, error, acc);
  }

  private static generateBezier(
    points: Point[],
    first: number,
    last: number,
    uPrime: number[],
    tHat1: Point,
    tHat2: Point
  ): CubicBezier {
    const p0 = points[first];
    const p3 = points[last];
    const nPts = last - first + 1;

    // Compute determinants and least-squares alpha values
    const a: [Point, Point][] = [];
    for (let i = 0; i < nPts; i++) {
      const u = uPrime[i];
      const b0 = (1 - u) * (1 - u) * (1 - u);
      const b1 = 3 * u * (1 - u) * (1 - u);
      const b2 = 3 * u * u * (1 - u);
      const b3 = u * u * u;

      a.push([
        { x: tHat1.x * b1, y: tHat1.y * b1 },
        { x: tHat2.x * b2, y: tHat2.y * b2 },
      ]);
    }

    let c00 = 0;
    let c01 = 0;
    let c11 = 0;
    let x0 = 0;
    let x1 = 0;

    for (let i = 0; i < nPts; i++) {
      const u = uPrime[i];
      const b0 = (1 - u) * (1 - u) * (1 - u);
      const b1 = 3 * u * (1 - u) * (1 - u);
      const b2 = 3 * u * u * (1 - u);
      const b3 = u * u * u;

      c00 += this.dot(a[i][0], a[i][0]);
      c01 += this.dot(a[i][0], a[i][1]);
      c11 += this.dot(a[i][1], a[i][1]);

      const pt = points[first + i];
      const tmp = {
        x: pt.x - (b0 * p0.x + b1 * p0.x + b2 * p3.x + b3 * p3.x),
        y: pt.y - (b0 * p0.y + b1 * p0.y + b2 * p3.y + b3 * p3.y),
      };

      x0 += this.dot(a[i][0], tmp);
      x1 += this.dot(a[i][1], tmp);
    }

    const detC0C1 = c00 * c11 - c01 * c01;
    let alphaL = 0;
    let alphaR = 0;

    if (Math.abs(detC0C1) > 1e-12) {
      alphaL = (x0 * c11 - x1 * c01) / detC0C1;
      alphaR = (c00 * x1 - c01 * x0) / detC0C1;
    } else {
      const dist = Math.hypot(p3.x - p0.x, p3.y - p0.y) / 3.0;
      alphaL = dist;
      alphaR = dist;
    }

    // If alpha negative or aberrant, fall back to chord approximation
    if (alphaL < 1e-6 || alphaR < 1e-6) {
      const dist = Math.hypot(p3.x - p0.x, p3.y - p0.y) / 3.0;
      alphaL = dist;
      alphaR = dist;
    }

    return {
      p0: { ...p0 },
      p1: { x: p0.x + tHat1.x * alphaL, y: p0.y + tHat1.y * alphaL },
      p2: { x: p3.x + tHat2.x * alphaR, y: p3.y + tHat2.y * alphaR },
      p3: { ...p3 },
    };
  }

  private static reparameterize(
    bez: CubicBezier,
    points: Point[],
    first: number,
    last: number,
    u: number[]
  ): number[] {
    const nPts = last - first + 1;
    const uPrime: number[] = [];

    for (let i = 0; i < nPts; i++) {
      uPrime.push(this.newtonRaphsonRootFind(bez, points[first + i], u[i]));
    }
    return uPrime;
  }

  private static newtonRaphsonRootFind(bez: CubicBezier, p: Point, u: number): number {
    const q = this.evaluateBezier(bez, u);
    const qPrime = this.evaluateBezierDerivative(bez, u);
    const qPrime2 = this.evaluateBezierSecondDerivative(bez, u);

    const diff = { x: q.x - p.x, y: q.y - p.y };
    const num = diff.x * qPrime.x + diff.y * qPrime.y;
    const den = qPrime.x * qPrime.x + qPrime.y * qPrime.y + diff.x * qPrime2.x + diff.y * qPrime2.y;

    if (Math.abs(den) < 1e-12) return u;
    const uNext = u - num / den;
    return Math.max(0, Math.min(1, uNext));
  }

  private static evaluateBezier(bez: CubicBezier, t: number): Point {
    const it = 1 - t;
    const b0 = it * it * it;
    const b1 = 3 * t * it * it;
    const b2 = 3 * t * t * it;
    const b3 = t * t * t;
    return {
      x: b0 * bez.p0.x + b1 * bez.p1.x + b2 * bez.p2.x + b3 * bez.p3.x,
      y: b0 * bez.p0.y + b1 * bez.p1.y + b2 * bez.p2.y + b3 * bez.p3.y,
    };
  }

  private static evaluateBezierDerivative(bez: CubicBezier, t: number): Point {
    const it = 1 - t;
    return {
      x: 3 * it * it * (bez.p1.x - bez.p0.x) + 6 * it * t * (bez.p2.x - bez.p1.x) + 3 * t * t * (bez.p3.x - bez.p2.x),
      y: 3 * it * it * (bez.p1.y - bez.p0.y) + 6 * it * t * (bez.p2.y - bez.p1.y) + 3 * t * t * (bez.p3.y - bez.p2.y),
    };
  }

  private static evaluateBezierSecondDerivative(bez: CubicBezier, t: number): Point {
    const it = 1 - t;
    return {
      x: 6 * it * (bez.p2.x - 2 * bez.p1.x + bez.p0.x) + 6 * t * (bez.p3.x - 2 * bez.p2.x + bez.p1.x),
      y: 6 * it * (bez.p2.y - 2 * bez.p1.y + bez.p0.y) + 6 * t * (bez.p3.y - 2 * bez.p2.y + bez.p1.y),
    };
  }

  private static computeMaxError(
    points: Point[],
    first: number,
    last: number,
    bezCurve: CubicBezier,
    u: number[]
  ): { maxDist: number; splitPoint: number } {
    let maxDist = 0;
    let splitPoint = Math.floor((first + last) / 2);

    for (let i = first + 1; i < last; i++) {
      const p = this.evaluateBezier(bezCurve, u[i - first]);
      const dist = Math.hypot(p.x - points[i].x, p.y - points[i].y);
      if (dist > maxDist) {
        maxDist = dist;
        splitPoint = i;
      }
    }

    return { maxDist, splitPoint };
  }

  private static chordLengthParameterize(points: Point[], first: number, last: number): number[] {
    const u: number[] = [0];
    for (let i = first + 1; i <= last; i++) {
      const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      u.push(u[u.length - 1] + d);
    }
    const total = u[u.length - 1];
    if (total === 0) return u.map(() => 0);
    return u.map((d) => d / total);
  }

  private static computeLeftTangent(points: Point[], end: number): Point {
    const d = { x: points[end + 1].x - points[end].x, y: points[end + 1].y - points[end].y };
    return this.normalize(d);
  }

  private static computeRightTangent(points: Point[], end: number): Point {
    const d = { x: points[end - 1].x - points[end].x, y: points[end - 1].y - points[end].y };
    return this.normalize(d);
  }

  private static computeCenterTangent(points: Point[], center: number): Point {
    const v1 = { x: points[center - 1].x - points[center].x, y: points[center - 1].y - points[center].y };
    const v2 = { x: points[center].x - points[center + 1].x, y: points[center].y - points[center + 1].y };
    const t = { x: (v1.x + v2.x) / 2.0, y: (v1.y + v2.y) / 2.0 };
    return this.normalize(t);
  }

  private static normalize(v: Point): Point {
    const len = Math.hypot(v.x, v.y);
    if (len === 0) return { x: 1, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  private static dot(u: Point, v: Point): number {
    return u.x * v.x + u.y * v.y;
  }
}
