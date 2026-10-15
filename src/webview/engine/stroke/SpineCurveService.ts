import { Point, PathVertex, VectorElement, VectorModel } from '../VectorModel.js';
import { SchneiderFit, CubicBezier } from '../operations/booleans/SchneiderFit.js';
import { PathGeometryCompiler } from '../geometry/PathGeometryCompiler.js';

export interface WidthControlPoint {
  t: number; // Normalized parameter [0, 1] along curve
  width: number; // Total stroke width at parameter t
  widthLeft?: number; // Optional asymmetric left width
  widthRight?: number; // Optional asymmetric right width
}

export interface SketchParams {
  amplitude: number; // Modulation intensity [0, 1]
  frequency: number; // Spatial frequency of ink harmonics
  seed: number; // Pseudo-random seed for deterministic reproduction
  roughness: number; // High-frequency jitter / paper texture irregularity [0, 1]
}

export interface WidthProfile {
  points: WidthControlPoint[];
  mode?: 'uniform' | 'variable' | 'sketch';
  sketchParams?: SketchParams;
}

export interface SpinePoint {
  point: Point;
  tangent: Point;
  normal: Point;
  t: number;
  width: number;
  widthLeft: number;
  widthRight: number;
  leftPt: Point;
  rightPt: Point;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Parametric Spine Curve & Variable Stroke Engine (SpineCurveService)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates the parametric evaluation of curve backbones P(t), analytical orthogonal normal projection
 *    N(t) = (-T_y(t), T_x(t)), width function interpolation w(t), organic sketch ink modulation,
 *    and Schneider cubic Bézier curve fitting from general vector model manipulation.
 *
 * 2. High-Precision Analytical Orthogonal Normal Extrusion:
 *    For any parametric curve P(t), the velocity vector v(t) = P'(t) defines the unit tangent
 *    T(t) = v(t) / ||v(t)||. The right-handed orthogonal normal is N(t) = (-T_y, T_x).
 *    Boundary points are synthesized analytically without finite-difference approximation:
 *      P_L(t) = P(t) - (w_L(t) / 2) * N(t)
 *      P_R(t) = P(t) + (w_R(t) / 2) * N(t)
 *
 * 3. Smooth Monotonic Hermite Width Interpolation:
 *    Between discrete width control points (t_k, w_k), w(t) is interpolated with smooth C1 cubic
 *    Hermite splines h(s) = 3s^2 - 2s^3, preventing sharp discontinuities and tangent kinking.
 *
 * 4. Deterministic Multi-Harmonic Sketch Ink Modulation:
 *    Simulates the organic pressure and calligraphic flow of fountain/dipping pens via harmonic
 *    superposition:
 *      f(t) = sin(2π ω t + φ) + 0.5 sin(4.6π ω t + 1.2) + 0.25 sin(9.2π ω t + 2.4) + roughness * noise(t, seed)
 *    Deterministic pseudo-random noise ensures that exported SVGs and undo/redo states produce
 *    100% reproducible geometry without temporal fluttering.
 *
 * 5. Schneider Cubic Bézier Curve Fitting (Anti-Polygonization):
 *    Digitized boundary samples are re-parameterized and fitted into smooth cubic Bézier splines
 *    (CubicBezier) within an error tolerance epsilon, completely avoiding jagged polygonal flattening.
 */
export class SpineCurveService {
  public static readonly WIDTH_PROFILE_ATTR = 'data-stroke-width-profile';

  /**
   * Deterministic pseudo-random noise generator using fractional sine hashing.
   */
  public static pseudoNoise(t: number, seed: number = 42): number {
    const s = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1; // Range [-1, 1]
  }

  /**
   * Evaluates the width w(t), w_left(t), and w_right(t) at parameter t in [0, 1].
   */
  public static evaluateWidth(
    profile: WidthProfile | undefined,
    baseWidth: number,
    t: number
  ): { width: number; widthLeft: number; widthRight: number } {
    const clampedT = Math.max(0, Math.min(1, t));
    let w = baseWidth > 0 ? baseWidth : 1;
    let wLeft = w / 2;
    let wRight = w / 2;

    if (profile && profile.points && profile.points.length > 0) {
      const pts = [...profile.points].sort((a, b) => a.t - b.t);

      if (clampedT <= pts[0].t) {
        w = pts[0].width;
        wLeft = pts[0].widthLeft !== undefined ? pts[0].widthLeft : w / 2;
        wRight = pts[0].widthRight !== undefined ? pts[0].widthRight : w / 2;
      } else if (clampedT >= pts[pts.length - 1].t) {
        const last = pts[pts.length - 1];
        w = last.width;
        wLeft = last.widthLeft !== undefined ? last.widthLeft : w / 2;
        wRight = last.widthRight !== undefined ? last.widthRight : w / 2;
      } else {
        // Find interval [pts[i], pts[i+1]]
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          if (clampedT >= p0.t && clampedT <= p1.t) {
            const span = p1.t - p0.t;
            const s = span > 1e-6 ? (clampedT - p0.t) / span : 0;
            // Smooth C1 Hermite interpolation: h(s) = 3s^2 - 2s^3
            const h = s * s * (3 - 2 * s);

            w = p0.width + (p1.width - p0.width) * h;
            const left0 = p0.widthLeft !== undefined ? p0.widthLeft : p0.width / 2;
            const left1 = p1.widthLeft !== undefined ? p1.widthLeft : p1.width / 2;
            wLeft = left0 + (left1 - left0) * h;

            const right0 = p0.widthRight !== undefined ? p0.widthRight : p0.width / 2;
            const right1 = p1.widthRight !== undefined ? p1.widthRight : p1.width / 2;
            wRight = right0 + (right1 - right0) * h;
            break;
          }
        }
      }
    }

    // Apply sketch ink modulation if active
    if (profile && profile.mode === 'sketch') {
      const sp = profile.sketchParams || {
        amplitude: 0.5,
        frequency: 4,
        seed: 42,
        roughness: 0.25,
      };

      const omega = sp.frequency || 4;
      const seed = sp.seed || 42;
      const amp = sp.amplitude !== undefined ? sp.amplitude : 0.5;
      const rough = sp.roughness !== undefined ? sp.roughness : 0.25;

      const harm1 = Math.sin(2 * Math.PI * omega * clampedT);
      const harm2 = 0.5 * Math.sin(4.6 * Math.PI * omega * clampedT + 1.2);
      const harm3 = 0.25 * Math.sin(9.2 * Math.PI * omega * clampedT + 2.4);
      const noise = this.pseudoNoise(clampedT * 20, seed) * rough;

      const mod = 1 + amp * (harm1 + harm2 + harm3 + noise);
      // Ensure positive non-zero stroke width
      const factor = Math.max(0.08, mod);
      w *= factor;
      wLeft *= factor;
      wRight *= factor;
    }

    return {
      width: Math.max(0.1, Number(w.toFixed(3))),
      widthLeft: Math.max(0.05, Number(wLeft.toFixed(3))),
      widthRight: Math.max(0.05, Number(wRight.toFixed(3))),
    };
  }

  /**
   * Evaluates position P(t) and velocity P'(t) for a cubic Bézier segment.
   */
  public static evalCubicBezier(
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    t: number
  ): { pt: Point; dPt: Point } {
    const inv = 1 - t;
    const inv2 = inv * inv;
    const inv3 = inv2 * inv;
    const t2 = t * t;
    const t3 = t2 * t;

    const x = inv3 * p0.x + 3 * inv2 * t * p1.x + 3 * inv * t2 * p2.x + t3 * p3.x;
    const y = inv3 * p0.y + 3 * inv2 * t * p1.y + 3 * inv * t2 * p2.y + t3 * p3.y;

    // First derivative P'(t)
    const dx =
      3 * inv2 * (p1.x - p0.x) +
      6 * inv * t * (p2.x - p1.x) +
      3 * t2 * (p3.x - p2.x);
    const dy =
      3 * inv2 * (p1.y - p0.y) +
      6 * inv * t * (p2.y - p1.y) +
      3 * t2 * (p3.y - p2.y);

    return {
      pt: { x, y },
      dPt: { x: dx, y: dy },
    };
  }

  /**
   * Samples a curve backbone with analytical normal orthogonal offsets P(t) ± (w(t) / 2) * N(t).
   */
  public static sampleSpineCurve(
    element: VectorElement,
    baseWidth?: number,
    profile?: WidthProfile,
    samplesPerSegment: number = 24
  ): SpinePoint[] {
    const vertices = element.vertices && element.vertices.length > 0
      ? element.vertices
      : PathGeometryCompiler.parsePathD(element.attributes.d || '');

    if (!vertices || vertices.length < 2) return [];

    const effectiveWidth = baseWidth !== undefined
      ? baseWidth
      : parseFloat(element.attributes['stroke-width'] || '1') || 1;

    const effectiveProfile = profile || this.getWidthProfile(element) || undefined;

    // Segment definition along vertices
    const segments: { p0: Point; p1: Point; p2: Point; p3: Point; isCubic: boolean }[] = [];
    const count = vertices.length;
    const isClosed = element.isClosed ?? false;
    const segCount = isClosed ? count : count - 1;

    for (let i = 0; i < segCount; i++) {
      const v0 = vertices[i];
      const v1 = vertices[(i + 1) % count];

      const p0 = { x: v0.x, y: v0.y };
      const p3 = { x: v1.x, y: v1.y };

      if (v0.handleOut || v1.handleIn) {
        const p1 = v0.handleOut ? { x: v0.handleOut.x, y: v0.handleOut.y } : p0;
        const p2 = v1.handleIn ? { x: v1.handleIn.x, y: v1.handleIn.y } : p3;
        segments.push({ p0, p1, p2, p3, isCubic: true });
      } else {
        // Linear segment represented as degree-elevated cubic
        segments.push({
          p0,
          p1: { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
          p2: { x: p3.x - (p3.x - p0.x) / 3, y: p3.y - (p3.y - p0.y) / 3 },
          p3,
          isCubic: false,
        });
      }
    }

    if (segments.length === 0) return [];

    const totalSegs = segments.length;
    const spinePoints: SpinePoint[] = [];

    for (let sIdx = 0; sIdx < totalSegs; sIdx++) {
      const seg = segments[sIdx];
      const stepCount = sIdx === totalSegs - 1 ? samplesPerSegment : samplesPerSegment - 1;

      for (let step = 0; step <= stepCount; step++) {
        const localT = step / samplesPerSegment;
        const globalT = (sIdx + localT) / totalSegs;

        let pt: Point;
        let dPt: Point;

        if (seg.isCubic) {
          const evalRes = this.evalCubicBezier(seg.p0, seg.p1, seg.p2, seg.p3, localT);
          pt = evalRes.pt;
          dPt = evalRes.dPt;
        } else {
          pt = {
            x: seg.p0.x + (seg.p3.x - seg.p0.x) * localT,
            y: seg.p0.y + (seg.p3.y - seg.p0.y) * localT,
          };
          dPt = {
            x: seg.p3.x - seg.p0.x,
            y: seg.p3.y - seg.p0.y,
          };
        }

        // Tangent vector
        let len = Math.hypot(dPt.x, dPt.y);
        let uTan: Point;
        if (len > 1e-5) {
          uTan = { x: dPt.x / len, y: dPt.y / len };
        } else {
          // Chord fallback for zero velocity
          const chordDx = seg.p3.x - seg.p0.x;
          const chordDy = seg.p3.y - seg.p0.y;
          const cLen = Math.hypot(chordDx, chordDy) || 1;
          uTan = { x: chordDx / cLen, y: chordDy / cLen };
        }

        // Right-handed orthogonal normal: N = (-uTan.y, uTan.x)
        const uNorm: Point = { x: -uTan.y, y: uTan.x };

        // Width evaluation w(t)
        const wInfo = this.evaluateWidth(effectiveProfile, effectiveWidth, globalT);

        // Orthogonal boundary offsets
        // Left offset: P(t) - w_left * N(t)
        const leftPt: Point = {
          x: pt.x - wInfo.widthLeft * uNorm.x,
          y: pt.y - wInfo.widthLeft * uNorm.y,
        };
        // Right offset: P(t) + w_right * N(t)
        const rightPt: Point = {
          x: pt.x + wInfo.widthRight * uNorm.x,
          y: pt.y + wInfo.widthRight * uNorm.y,
        };

        spinePoints.push({
          point: pt,
          tangent: uTan,
          normal: uNorm,
          t: globalT,
          width: wInfo.width,
          widthLeft: wInfo.widthLeft,
          widthRight: wInfo.widthRight,
          leftPt,
          rightPt,
        });
      }
    }

    return spinePoints;
  }

  /**
   * Synthesizes a smooth, closed vector element representing the stroke outline using Schneider
   * cubic Bézier curve fitting.
   */
  public static generateVariableOutline(
    element: VectorElement,
    baseWidth?: number,
    profile?: WidthProfile,
    options: { linecap?: string; errorTolerance?: number } = {}
  ): VectorElement | null {
    const spine = this.sampleSpineCurve(element, baseWidth, profile, 24);
    if (spine.length < 2) return null;

    const linecap = options.linecap || element.attributes['stroke-linecap'] || 'butt';
    const errorTolerance = options.errorTolerance !== undefined ? options.errorTolerance : 1.5;
    const isClosed = element.isClosed ?? false;

    const strokeColor = element.attributes.stroke || '#000000';
    const boundaryPoints: Point[] = [];

    if (!isClosed) {
      // 1. Start Cap
      const first = spine[0];
      const startT = first.tangent;
      const startNorm = first.normal;

      if (linecap === 'round') {
        // Semicircular arc bridging leftPt to rightPt in direction -startT
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const angle = Math.PI - (i / steps) * Math.PI; // from π to 0
          // cos(angle) along -normal, sin(angle) along -tangent
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const r = first.widthLeft;
          const capPt: Point = {
            x: first.point.x + r * cosA * startNorm.x - r * sinA * startT.x,
            y: first.point.y + r * cosA * startNorm.y - r * sinA * startT.y,
          };
          boundaryPoints.push(capPt);
        }
      } else if (linecap === 'square') {
        const halfExt = first.widthLeft;
        boundaryPoints.push({
          x: first.leftPt.x - halfExt * startT.x,
          y: first.leftPt.y - halfExt * startT.y,
        });
        boundaryPoints.push({
          x: first.rightPt.x - halfExt * startT.x,
          y: first.rightPt.y - halfExt * startT.y,
        });
        boundaryPoints.push(first.rightPt);
      } else {
        // Butt cap
        boundaryPoints.push(first.leftPt);
        boundaryPoints.push(first.rightPt);
      }

      // 2. Right Boundary (0 -> 1)
      for (let i = 1; i < spine.length; i++) {
        boundaryPoints.push(spine[i].rightPt);
      }

      // 3. End Cap
      const last = spine[spine.length - 1];
      const endT = last.tangent;
      const endNorm = last.normal;

      if (linecap === 'round') {
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const angle = -(i / steps) * Math.PI; // from 0 to -π
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const r = last.widthRight;
          const capPt: Point = {
            x: last.point.x + r * cosA * endNorm.x - r * sinA * endT.x,
            y: last.point.y + r * cosA * endNorm.y - r * sinA * endT.y,
          };
          boundaryPoints.push(capPt);
        }
      } else if (linecap === 'square') {
        const halfExt = last.widthRight;
        boundaryPoints.push({
          x: last.rightPt.x + halfExt * endT.x,
          y: last.rightPt.y + halfExt * endT.y,
        });
        boundaryPoints.push({
          x: last.leftPt.x + halfExt * endT.x,
          y: last.leftPt.y + halfExt * endT.y,
        });
        boundaryPoints.push(last.leftPt);
      } else {
        // Butt cap
        boundaryPoints.push(last.rightPt);
        boundaryPoints.push(last.leftPt);
      }

      // 4. Left Boundary (1 -> 0, reversed)
      for (let i = spine.length - 2; i >= 0; i--) {
        boundaryPoints.push(spine[i].leftPt);
      }
    } else {
      // Closed loop outline
      for (const sp of spine) {
        boundaryPoints.push(sp.rightPt);
      }
    }

    if (boundaryPoints.length < 3) return null;

    // 5. Fit boundary point chain into smooth cubic Bézier splines (SchneiderFit)
    const fittedCurves: CubicBezier[] = SchneiderFit.fitCurve(boundaryPoints, errorTolerance);

    const outVertices: PathVertex[] = [];

    if (fittedCurves.length > 0) {
      outVertices.push({
        id: `v_out_0`,
        x: Number(fittedCurves[0].p0.x.toFixed(3)),
        y: Number(fittedCurves[0].p0.y.toFixed(3)),
        handleOut: {
          x: Number(fittedCurves[0].p1.x.toFixed(3)),
          y: Number(fittedCurves[0].p1.y.toFixed(3)),
        },
        command: 'M',
        nodeType: 'smooth',
      });

      for (let i = 0; i < fittedCurves.length; i++) {
        const curve = fittedCurves[i];
        const nextCurve = fittedCurves[i + 1];
        outVertices.push({
          id: `v_out_${i + 1}`,
          x: Number(curve.p3.x.toFixed(3)),
          y: Number(curve.p3.y.toFixed(3)),
          handleIn: {
            x: Number(curve.p2.x.toFixed(3)),
            y: Number(curve.p2.y.toFixed(3)),
          },
          handleOut: nextCurve
            ? {
                x: Number(nextCurve.p1.x.toFixed(3)),
                y: Number(nextCurve.p1.y.toFixed(3)),
              }
            : undefined,
          command: 'C',
          nodeType: 'smooth',
        });
      }
    } else {
      // Fallback: direct sampling without curve reduction
      boundaryPoints.forEach((p, idx) => {
        outVertices.push({
          id: `v_out_${idx}`,
          x: Number(p.x.toFixed(3)),
          y: Number(p.y.toFixed(3)),
          command: idx === 0 ? 'M' : 'L',
          nodeType: 'sharp',
        });
      });
    }

    // Compile SVG path d string
    const dStr = PathGeometryCompiler.compilePathD(outVertices, true);

    const newElement: VectorElement = {
      id: `stroke_outline_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      tagName: 'path',
      attributes: {
        id: `stroke_outline_${Date.now().toString(36)}`,
        d: dStr,
        fill: strokeColor !== 'none' ? strokeColor : '#000000',
        stroke: 'none',
        'fill-rule': 'evenodd',
        'data-shape': 'path',
        'data-parametric': 'false',
        'data-stroke-to-path': 'true',
      },
      vertices: outVertices,
      isClosed: true,
      isParametric: false,
      shapeType: 'path',
    };

    return newElement;
  }

  /**
   * Retrieves width profile from element attributes.
   */
  public static getWidthProfile(element: VectorElement): WidthProfile | null {
    const raw = element.attributes[this.WIDTH_PROFILE_ATTR];
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WidthProfile;
    } catch {
      return null;
    }
  }

  /**
   * Sets or purges width profile on element attributes.
   */
  public static setWidthProfile(element: VectorElement, profile: WidthProfile | null): void {
    if (!profile) {
      delete element.attributes[this.WIDTH_PROFILE_ATTR];
    } else {
      element.attributes[this.WIDTH_PROFILE_ATTR] = JSON.stringify(profile);
    }
  }

  /**
   * Applies organic sketch ink modulation to element's stroke width profile.
   */
  public static applySketchModulation(
    element: VectorElement,
    options: Partial<SketchParams> = {}
  ): WidthProfile {
    const baseWidth = parseFloat(element.attributes['stroke-width'] || '2') || 2;
    const sketchParams: SketchParams = {
      amplitude: options.amplitude !== undefined ? options.amplitude : 0.6,
      frequency: options.frequency !== undefined ? options.frequency : 5,
      seed: options.seed !== undefined ? options.seed : Math.floor(Math.random() * 10000),
      roughness: options.roughness !== undefined ? options.roughness : 0.3,
    };

    const profile: WidthProfile = {
      points: [
        { t: 0.0, width: baseWidth * 0.4 },
        { t: 0.15, width: baseWidth * 1.2 },
        { t: 0.5, width: baseWidth * 1.0 },
        { t: 0.85, width: baseWidth * 1.3 },
        { t: 1.0, width: baseWidth * 0.3 },
      ],
      mode: 'sketch',
      sketchParams,
    };

    this.setWidthProfile(element, profile);
    return profile;
  }

  /**
   * Applies a classic tapered profile (thick body, delicate needle endpoints).
   */
  public static applyTaperedProfile(
    element: VectorElement,
    startW?: number,
    midW?: number,
    endW?: number
  ): WidthProfile {
    const baseWidth = parseFloat(element.attributes['stroke-width'] || '3') || 3;
    const profile: WidthProfile = {
      points: [
        { t: 0.0, width: startW !== undefined ? startW : 0.5 },
        { t: 0.5, width: midW !== undefined ? midW : baseWidth * 2.0 },
        { t: 1.0, width: endW !== undefined ? endW : 0.5 },
      ],
      mode: 'variable',
    };

    this.setWidthProfile(element, profile);
    return profile;
  }

  /**
   * High-level smooth strokeToPath converter combining SpineCurveService with Schneider Bézier fitting.
   */
  public static outlineStrokeToSmoothPath(
    element: VectorElement,
    model: VectorModel
  ): VectorElement | null {
    const profile = this.getWidthProfile(element) || undefined;
    const strokeWidth = parseFloat(element.attributes['stroke-width'] || '1') || 1;

    // Convert using analytical normal and Schneider fitting
    const outline = this.generateVariableOutline(element, strokeWidth, profile, {
      linecap: element.attributes['stroke-linecap'] || 'butt',
      errorTolerance: 1.5,
    });

    return outline;
  }
}
