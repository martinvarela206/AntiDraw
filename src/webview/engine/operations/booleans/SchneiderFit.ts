import { Point } from '../../../core/geom/Point.js';
import { PathVertex } from '../../VectorModel.js';

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
}

export class SchneiderFit {
  /**
   * Fits a series of cubic Bézier curves to a sequence of digitized 2D points.
   *
   * @param points Array of sequential digitized points
   * @param errorTolerance Maximum allowed Euclidean pixel distance (e.g. 1.0 to 4.0)
   * @returns Array of fitted cubic Bézier segments
   */
  public static fitCurve(points: Point[], errorTolerance: number = 2.0): CubicBezier[] {
    if (points.length < 2) return [];
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

    const tHat1 = this.computeLeftTangent(points, 0);
    const tHat2 = this.computeRightTangent(points, points.length - 1);
    const result: CubicBezier[] = [];
    this.fitCubic(points, 0, points.length - 1, tHat1, tHat2, errorTolerance, result);
    return result;
  }

  /**
   * Fits digitized points and compiles them into a sequence of PathVertex nodes.
   */
  public static fitPointsToVertices(
    points: Point[],
    errorTolerance: number = 2.0,
    isClosed: boolean = false
  ): PathVertex[] {
    const curves = this.fitCurve(points, errorTolerance);
    if (curves.length === 0) return [];

    const vertices: PathVertex[] = [];

    // First vertex
    vertices.push({
      id: `v_fit_${Date.now()}_0`,
      x: curves[0].p0.x,
      y: curves[0].p0.y,
      handleOut: { x: curves[0].p1.x, y: curves[0].p1.y },
      nodeType: 'smooth',
      command: 'M',
    });

    for (let i = 0; i < curves.length; i++) {
      const c = curves[i];
      const isLast = i === curves.length - 1;
      const nextCurve = !isLast ? curves[i + 1] : null;

      vertices.push({
        id: `v_fit_${Date.now()}_${i + 1}`,
        x: c.p3.x,
        y: c.p3.y,
        handleIn: { x: c.p2.x, y: c.p2.y },
        handleOut: nextCurve ? { x: nextCurve.p1.x, y: nextCurve.p1.y } : undefined,
        nodeType: 'smooth',
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
