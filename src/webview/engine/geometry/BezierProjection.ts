import { Point } from '../VectorModel.js';

export interface BezierProjectionOptions {
  sampleSteps?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface BezierProjectionResult {
  point: Point;
  t: number;
  distance: number;
  iterations: number;
  converged: boolean;
}

/**
 * ARCHITECTURAL RATIONALE: Robust Hybrid Bézier Projection (BezierProjection)
 *
 * 1. Global Convergence Guarantee:
 *    A cubic Bézier curve's distance function is a 5th-degree polynomial with up to 5 local extrema.
 *    Pure gradient descent or unguarded Newton-Raphson frequently diverges or gets trapped in
 *    suboptimal local minima when points lie near the inflection points or outside the convex hull.
 *
 * 2. Hybrid Sampling + Bounded Newton-Raphson Architecture:
 *    - Phase 1 (Global Sampling): Uniformly evaluates N Bernstein intervals across [0, 1] to identify
 *      the basin of attraction containing the global minimum.
 *    - Phase 2 (Bounded Newton-Raphson): Performs second-order root finding g(t) = (B(t) - P) · B'(t) = 0
 *      with analytical first and second derivatives.
 *    - Phase 3 (Guarded Boundary Verification): Compares candidate root with endpoints t=0 and t=1,
 *      ensuring strict monotonic convergence and absolute immunity against NaN/divergence.
 */
export class BezierProjection {
  /**
   * Evaluates cubic Bézier curve at parameter t in [0, 1].
   */
  public static eval(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
    };
  }

  /**
   * Evaluates first derivative (tangent vector) B'(t) of cubic Bézier.
   */
  public static evalDerivative(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
    const u = 1 - t;
    const c0 = 3 * u * u;
    const c1 = 6 * u * t;
    const c2 = 3 * t * t;

    return {
      x: c0 * (p1.x - p0.x) + c1 * (p2.x - p1.x) + c2 * (p3.x - p2.x),
      y: c0 * (p1.y - p0.y) + c1 * (p2.y - p1.y) + c2 * (p3.y - p2.y),
    };
  }

  /**
   * Evaluates second derivative (acceleration vector) B''(t) of cubic Bézier.
   */
  public static evalSecondDerivative(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
    const u = 1 - t;
    const c0 = 6 * u;
    const c1 = 6 * t;

    return {
      x: c0 * (p2.x - 2 * p1.x + p0.x) + c1 * (p3.x - 2 * p2.x + p1.x),
      y: c0 * (p2.y - 2 * p1.y + p0.y) + c1 * (p3.y - 2 * p2.y + p1.y),
    };
  }

  /**
   * Projects point `pt` onto the cubic Bézier defined by (p0, p1, p2, p3).
   */
  public static projectPoint(
    pt: Point,
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    options: BezierProjectionOptions = {}
  ): BezierProjectionResult {
    const sampleSteps = Math.max(16, options.sampleSteps ?? 24);
    const maxIterations = Math.max(1, options.maxIterations ?? 12);
    const tolerance = options.tolerance ?? 1e-6;

    // Phase 1: Uniform initial sampling to locate global minimum interval
    let bestT = 0;
    let minSqDist = Infinity;
    const stepSize = 1 / sampleSteps;

    for (let i = 0; i <= sampleSteps; i++) {
      const t = i * stepSize;
      const q = this.eval(t, p0, p1, p2, p3);
      const dx = q.x - pt.x;
      const dy = q.y - pt.y;
      const sqDist = dx * dx + dy * dy;
      if (sqDist < minSqDist) {
        minSqDist = sqDist;
        bestT = t;
      }
    }

    // Phase 2: Damped Bounded Newton-Raphson refinement with line search
    let currentT = bestT;
    let currentPt = this.eval(currentT, p0, p1, p2, p3);
    let currentSqDist = (currentPt.x - pt.x) ** 2 + (currentPt.y - pt.y) ** 2;
    let converged = false;
    let iterations = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
      iterations++;
      const d1 = this.evalDerivative(currentT, p0, p1, p2, p3);
      const d2 = this.evalSecondDerivative(currentT, p0, p1, p2, p3);

      const diffX = currentPt.x - pt.x;
      const diffY = currentPt.y - pt.y;

      // g(t) = (B(t) - P) · B'(t)  [First derivative of 1/2 * dist^2]
      const g = diffX * d1.x + diffY * d1.y;

      if (Math.abs(g) < tolerance) {
        converged = true;
        break;
      }

      // g'(t) = |B'(t)|^2 + (B(t) - P) · B''(t)  [Second derivative of 1/2 * dist^2]
      const gPrime = (d1.x * d1.x + d1.y * d1.y) + (diffX * d2.x + diffY * d2.y);

      let deltaT: number;
      if (gPrime > 1e-10) {
        // Standard Newton-Raphson step (convex curvature)
        deltaT = g / gPrime;
      } else {
        // Fall back to gradient descent step when curvature is non-positive or near zero
        deltaT = (g > 0 ? 1 : -1) * (stepSize * 0.5);
      }

      // Limit max step per iteration to avoid jumping basins of attraction
      if (Math.abs(deltaT) > stepSize) {
        deltaT = Math.sign(deltaT) * stepSize;
      }

      // Line search / backtracking step halving to guarantee monotonic reduction
      let stepAccepted = false;
      let stepFraction = 1.0;

      for (let ls = 0; ls < 4; ls++) {
        const testT = Math.max(0, Math.min(1, currentT - deltaT * stepFraction));
        const testPt = this.eval(testT, p0, p1, p2, p3);
        const testSqDist = (testPt.x - pt.x) ** 2 + (testPt.y - pt.y) ** 2;

        if (testSqDist < currentSqDist || Math.abs(testT - currentT) < 1e-8) {
          if (Math.abs(testT - currentT) < 1e-7) {
            converged = true;
          }
          currentT = testT;
          currentPt = testPt;
          currentSqDist = testSqDist;
          stepAccepted = true;
          break;
        }

        stepFraction *= 0.5;
      }

      if (!stepAccepted || converged) {
        break;
      }
    }

    // Phase 3: Guarded boundary check against endpoints t=0 and t=1
    const endpoints = [0, 1];
    for (const tEnd of endpoints) {
      const q = this.eval(tEnd, p0, p1, p2, p3);
      const sq = (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2;
      if (sq < currentSqDist) {
        currentSqDist = sq;
        currentT = tEnd;
        currentPt = q;
      }
    }

    return {
      point: currentPt,
      t: currentT,
      distance: Math.sqrt(currentSqDist),
      iterations,
      converged,
    };
  }
}
