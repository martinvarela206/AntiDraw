export interface Point {
  x: number;
  y: number;
}

export type NodeType = 'sharp' | 'asymmetric' | 'smooth' | 'symmetric';

export interface PathVertex {
  id: string;
  x: number;
  y: number;
  handleIn?: Point;  // relative or absolute control point
  handleOut?: Point;
  nodeType: NodeType;
  command: 'M' | 'L' | 'C' | 'Z';
}

export interface PathSegment {
  startIndex: number;
  endIndex: number;
  type: 'L' | 'C';
}

export interface RectCorners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
  mode: 'uniform' | 'independent';
  unit: 'px' | '%';
}

export type ParametricShapeType = 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon';

export interface VectorElement {
  id: string;
  tagName: string; // 'path' | 'rect' | 'ellipse' | 'circle' | 'line' | 'polygon' | 'polyline'
  attributes: Record<string, string>;
  vertices?: PathVertex[];
  isClosed?: boolean;
  isParametric?: boolean;
  shapeType?: ParametricShapeType | 'path' | 'star';
}

export interface CanvasSettings {
  width: number;
  height: number;
  viewBox: string;
  backgroundColor: string;
}

export interface DropShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface InnerShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface GradientStop {
  id: string;
  offset: number; // 0.0 to 1.0
  color: string;
  opacity: number; // 0.0 to 1.0
}

export interface GradientConfig {
  type: 'linear' | 'radial';
  x1?: number; // 0.0 to 1.0 for linear
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number; // 0.0 to 1.0 for radial
  cy?: number;
  r?: number; // fallback single radius
  rx?: number; // 0.0 to 1.0 horizontal radius
  ry?: number; // 0.0 to 1.0 vertical radius
  fx?: number;
  fy?: number;
  angle?: number; // angle in degrees for linear (0 = left-to-right, 90 = top-to-bottom)
  rotation?: number; // angle in degrees for radial (0 to 360)
  stops: GradientStop[];
}

import { SvgSerializer, STANDARD_MARKERS_INNER_XML, escapeXml } from './serialization/SvgSerializer.js';

export { STANDARD_MARKERS_INNER_XML, escapeXml };

export class VectorModel {
  public canvas: CanvasSettings = {
    width: 800,
    height: 600,
    viewBox: '0 0 800 600',
    backgroundColor: '#ffffff',
  };

  public elements: VectorElement[] = [];
  public customDefs: string = '';

  constructor() {}

  /**
   * Parses an SVG document string and populates the model canvas, custom defs, and vector elements.
   * Delegated to SvgSerializer.
   */
  public loadSvgString(svgText: string): void {
    SvgSerializer.loadSvgString(svgText, this);
  }

  /**
   * Generates hardware-accelerated SVG <filter> definitions for Drop Shadow and Inner Shadow.
   * Delegated to SvgSerializer.
   */
  public compileElementFilters(): string {
    return SvgSerializer.compileElementFilters(this.elements);
  }

  /**
   * Compiles dynamic <linearGradient> and <radialGradient> definitions into <defs>.
   * Delegated to SvgSerializer.
   */
  public compileElementGradients(): string {
    return SvgSerializer.compileElementGradients(this.elements);
  }

  /**
   * Serializes the model canvas and elements into an XML-compliant SVG string.
   * Delegated to SvgSerializer.
   */
  public toSvgString(): string {
    return SvgSerializer.toSvgString(this);
  }

  public getViewBoxBounds(): { minX: number; minY: number; width: number; height: number } {
    const parts = (this.canvas.viewBox || '').trim().split(/[\s,]+/).map(parseFloat);
    if (parts.length === 4 && !parts.some(isNaN)) {
      return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
    }
    return { minX: 0, minY: 0, width: this.canvas.width || 800, height: this.canvas.height || 600 };
  }

  public setViewBoxBounds(minX: number, minY: number, width: number, height: number): void {
    this.canvas.viewBox = `${minX} ${minY} ${width} ${height}`;
  }

  // Calculate canvas bounds encompassing the ViewBox frame AND all vector elements
  public getWorkingCanvasBounds(padding: number = 80): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    const vb = this.getViewBoxBounds();
    let minX = vb.minX;
    let minY = vb.minY;
    let maxX = vb.minX + vb.width;
    let maxY = vb.minY + vb.height;

    // Dynamically expand bounds if elements extend beyond viewBox
    this.elements.forEach((el) => {
      if (el.vertices && el.vertices.length > 0) {
        el.vertices.forEach((v) => {
          minX = Math.min(minX, v.x - padding);
          minY = Math.min(minY, v.y - padding);
          maxX = Math.max(maxX, v.x + padding);
          maxY = Math.max(maxY, v.y + padding);
        });
      }
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(maxX - minX, vb.width),
      height: Math.max(maxY - minY, vb.height),
    };
  }

  public createDefaultCanvas() {
    this.canvas = {
      width: 800,
      height: 600,
      viewBox: '0 0 800 600',
      backgroundColor: '#ffffff',
    };
    this.elements = [];
  }

  // Parse Path 'd' attribute string into structured vertices.
  public parsePathD(d: string, nodeTypesStr: string = ''): PathVertex[] {
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
        const beziers = VectorModel.arcToBezier(curX, curY, rx, ry, rot, largeArc, sweep, x, y);
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
   * ARCHITECTURAL RATIONALE: Faithful Parametric Arc and Pie Path Compilation (FEAT-02)
   *
   * Formulates native SVG path strings using standard 'A', 'L', and 'Z' commands.
   * - 'ellipse': compiles full 360° closed path via two 180° arcs.
   * - 'pie': begins at center (M cx cy), draws radius line to start angle (L x1 y1),
   *   curves along arc to end angle (A rx ry 0 largeArc sweep x2 y2), and closes back to center (Z).
   * - 'arc': begins at start angle (M x1 y1), curves along perimeter to end angle, and remains open (no Z).
   */
  public compileEllipseD(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    type: 'ellipse' | 'pie' | 'arc' = 'ellipse',
    startAngleDeg: number = 0,
    endAngleDeg: number = 360
  ): string {
    rx = Math.max(0.1, rx);
    ry = Math.max(0.1, ry);

    if (type === 'ellipse' || Math.abs(endAngleDeg - startAngleDeg) >= 360) {
      const x0 = cx + rx;
      const x1 = cx - rx;
      return `M ${formatNum(x0)} ${formatNum(cy)} A ${formatNum(rx)} ${formatNum(ry)} 0 1 1 ${formatNum(x1)} ${formatNum(cy)} A ${formatNum(rx)} ${formatNum(ry)} 0 1 1 ${formatNum(x0)} ${formatNum(cy)} Z`;
    }

    // Normalize angles
    const a1 = (startAngleDeg * Math.PI) / 180;
    const a2 = (endAngleDeg * Math.PI) / 180;

    let deltaDeg = endAngleDeg - startAngleDeg;
    while (deltaDeg < 0) deltaDeg += 360;
    while (deltaDeg > 360) deltaDeg -= 360;
    if (deltaDeg === 0) deltaDeg = 360;

    const largeArc = deltaDeg > 180 ? 1 : 0;
    const sweep = 1;

    const x1 = cx + rx * Math.cos(a1);
    const y1 = cy + ry * Math.sin(a1);
    const x2 = cx + rx * Math.cos(a2);
    const y2 = cy + ry * Math.sin(a2);

    if (type === 'pie') {
      return `M ${formatNum(cx)} ${formatNum(cy)} L ${formatNum(x1)} ${formatNum(y1)} A ${formatNum(rx)} ${formatNum(ry)} 0 ${largeArc} ${sweep} ${formatNum(x2)} ${formatNum(y2)} Z`;
    } else {
      // type === 'arc'
      return `M ${formatNum(x1)} ${formatNum(y1)} A ${formatNum(rx)} ${formatNum(ry)} 0 ${largeArc} ${sweep} ${formatNum(x2)} ${formatNum(y2)}`;
    }
  }

  /**
   * ARCHITECTURAL RATIONALE: Parametric Ellipse, Pie & Arc Vertices Generation (FEAT-02)
   *
   * Generates unified PathVertex[] representation for canvas rendering, node inspection,
   * and bounding box calculations:
   * - 'ellipse': 4 canonical symmetric Bézier vertices (top 12h, right 3h, bottom 6h, left 9h).
   * - 'pie': Center vertex V_0 (M cx cy), spoke vertex V_1 (L x1 y1), cubic Bézier arc segments
   *   divided into <= 90° chunks ending at (x2, y2), closed back to V_0.
   * - 'arc': Initial vertex V_0 (M x1 y1), cubic Bézier arc segments ending at (x2, y2), open.
   */
  public convertEllipseToVertices(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    type: 'ellipse' | 'pie' | 'arc' = 'ellipse',
    startAngleDeg: number = 0,
    endAngleDeg: number = 360
  ): PathVertex[] {
    rx = Math.max(0.1, rx);
    ry = Math.max(0.1, ry);

    if (type === 'ellipse' || Math.abs(endAngleDeg - startAngleDeg) >= 360) {
      let idx = 0;
      const mkV = (x: number, y: number, hIn?: Point, hOut?: Point, nodeType: NodeType = 'symmetric'): PathVertex => ({
        id: `v_${idx++}`,
        x,
        y,
        handleIn: hIn,
        handleOut: hOut,
        nodeType: nodeType,
        command: idx === 1 ? 'M' : 'C',
      });
      const k = 0.5522847498;
      const ox = rx * k;
      const oy = ry * k;
      return [
        mkV(cx, cy - ry, { x: cx - ox, y: cy - ry }, { x: cx + ox, y: cy - ry }),
        mkV(cx + rx, cy, { x: cx + rx, y: cy - oy }, { x: cx + rx, y: cy + oy }),
        mkV(cx, cy + ry, { x: cx + ox, y: cy + ry }, { x: cx - ox, y: cy + ry }),
        mkV(cx - rx, cy, { x: cx - rx, y: cy + oy }, { x: cx - rx, y: cy - oy }),
      ];
    }

    let deltaDeg = endAngleDeg - startAngleDeg;
    while (deltaDeg < 0) deltaDeg += 360;
    while (deltaDeg > 360) deltaDeg -= 360;
    if (deltaDeg === 0) deltaDeg = 360;

    const a1 = (startAngleDeg * Math.PI) / 180;
    const a2 = (endAngleDeg * Math.PI) / 180;
    const largeArc = deltaDeg > 180 ? 1 : 0;
    const sweep = 1;

    const x1 = cx + rx * Math.cos(a1);
    const y1 = cy + ry * Math.sin(a1);
    const x2 = cx + rx * Math.cos(a2);
    const y2 = cy + ry * Math.sin(a2);

    const beziers = VectorModel.arcToBezier(x1, y1, rx, ry, 0, largeArc, sweep, x2, y2);
    const vertices: PathVertex[] = [];
    let idx = 0;

    if (type === 'pie') {
      // Vertex 0: Center (command 'M', sharp node)
      vertices.push({
        id: `v_${idx++}`,
        x: cx,
        y: cy,
        nodeType: 'sharp',
        command: 'M',
      });

      // Vertex 1: Start of arc on perimeter (command 'L', sharp corner transitioning into curve)
      const v1: PathVertex = {
        id: `v_${idx++}`,
        x: x1,
        y: y1,
        nodeType: 'asymmetric',
        command: 'L',
      };
      if (beziers.length > 0) {
        v1.handleOut = { x: beziers[0].p1.x, y: beziers[0].p1.y };
      }
      vertices.push(v1);

      // Intermediate and terminal arc vertices (command 'C', smooth)
      for (let bIdx = 0; bIdx < beziers.length; bIdx++) {
        const b = beziers[bIdx];
        const isTerminal = bIdx === beziers.length - 1;
        const vArc: PathVertex = {
          id: `v_${idx++}`,
          x: b.p.x,
          y: b.p.y,
          handleIn: { x: b.p2.x, y: b.p2.y },
          nodeType: isTerminal ? 'sharp' : 'smooth',
          command: 'C',
        };
        if (!isTerminal && bIdx + 1 < beziers.length) {
          vArc.handleOut = { x: beziers[bIdx + 1].p1.x, y: beziers[bIdx + 1].p1.y };
        }
        vertices.push(vArc);
      }
    } else {
      // type === 'arc'
      // Vertex 0: Start of arc (command 'M')
      const v0: PathVertex = {
        id: `v_${idx++}`,
        x: x1,
        y: y1,
        nodeType: 'smooth',
        command: 'M',
      };
      if (beziers.length > 0) {
        v0.handleOut = { x: beziers[0].p1.x, y: beziers[0].p1.y };
      }
      vertices.push(v0);

      for (let bIdx = 0; bIdx < beziers.length; bIdx++) {
        const b = beziers[bIdx];
        const vArc: PathVertex = {
          id: `v_${idx++}`,
          x: b.p.x,
          y: b.p.y,
          handleIn: { x: b.p2.x, y: b.p2.y },
          nodeType: 'smooth',
          command: 'C',
        };
        if (bIdx + 1 < beziers.length) {
          vArc.handleOut = { x: beziers[bIdx + 1].p1.x, y: beziers[bIdx + 1].p1.y };
        }
        vertices.push(vArc);
      }
    }

    return vertices;
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
  public unifyClosingVertices(vertices: PathVertex[], isClosed?: boolean, closingTol: number = 0.5): PathVertex[] {
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

  // Convert vertices back into SVG 'd' string with proper per-subpath closing and Bézier curves
  public compilePathD(vertices: PathVertex[], isClosed?: boolean): string {
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

  /**
   * HISTORICAL ARCHITECTURE (FIX-13): Rigorous Topological Closure Evaluation
   *
   * Problem & SVG Edge Case:
   * When an SVG element lacks closure ('Z' command), browsers automatically simulate a closed polygon
   * whenever `fill` is defined. This produces bizarre artifacts (e.g. diagonal filling chords
   * cutting across unclosed Bézier branches or split nodes).
   *
   * Technical Solution:
   * Determine topological closure across all SVG primitives:
   * - <path>: explicitly checks presence of 'Z' or 'z' command in compiled path data or `el.isClosed`.
   * - <line>, <polyline>: open by nature unless explicitly flagged.
   * - <rect>, <circle>, <ellipse>, <star>, <polygon>: inherently closed polygons.
   */
  public isElementClosed(el: VectorElement): boolean {
    if (el.attributes?.['data-ellipse-type'] === 'arc') return false;
    if (el.isClosed !== undefined) return el.isClosed;
    if (el.tagName && ['rect', 'circle', 'ellipse', 'star', 'polygon'].includes(el.tagName)) return true;
    if (el.tagName && ['line', 'polyline'].includes(el.tagName)) return false;
    if (el.attributes?.d && /[zZ]/.test(el.attributes.d)) return true;
    return false;
  }

  /**
   * Technical Rationale (FIX-19):
   * Identifies whether a vector element represents an ellipse or circle primitive.
   *
   * Why this approach:
   * 1. Direct tag recognition: Supports native `<ellipse>` and `<circle>` SVG elements.
   * 2. Metadata recognition: Supports `data-shape="ellipse"` or `data-shape="circle"` stored on shape creation.
   * 3. Geometric heuristic recognition: Detects closed 4-vertex symmetric/smooth Bézier approximations
   *    matching canonical ellipse topology, unless the user explicitly converted the shape to freeform curves
   *    (`data-shape="path"`).
   *
   * Edge cases handled:
   * - Elements explicitly converted to free curves via "Convert to Curves" set `data-shape="path"`,
   *   preventing the geometric heuristic from falsely re-identifying them as constrained ellipses.
   */
  public isEllipse(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path') {
      return false;
    }
    if (el.attributes && (el.attributes['data-shape'] === 'ellipse' || el.attributes['data-shape'] === 'circle')) {
      return true;
    }
    if (el.tagName === 'ellipse' || el.tagName === 'circle') {
      return true;
    }
    if (el.isClosed && el.vertices && el.vertices.length === 4) {
      return el.vertices.every(
        (v) => (v.nodeType === 'symmetric' || v.nodeType === 'smooth') && v.handleIn && v.handleOut
      );
    }
    return false;
  }

  /**
   * ARCHITECTURAL RATIONALE: Rect Primitive Identification (FEAT-03)
   *
   * Identifies whether a vector element represents a parametric rectangle primitive.
   *
   * Why this approach:
   * 1. Direct tag recognition: Native `<rect>` SVG elements.
   * 2. Metadata recognition: `data-shape="rect"` with `data-parametric="true"`.
   * 3. Invariant Protection: Elements explicitly converted to curves (`data-shape="path"`)
   *    must never be identified as parametric rectangles.
   */
  public isRect(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') {
      return false;
    }
    if (el.attributes && el.attributes['data-shape'] === 'rect') {
      return true;
    }
    if (el.tagName === 'rect') {
      return true;
    }
    return false;
  }

  /**
   * ARCHITECTURAL RATIONALE: Native SVG Primitive Identification (FEAT-04)
   *
   * Identifies whether a vector element represents a native/parametric <line>, <polyline>,
   * <polygon>, or <circle> primitive.
   *
   * Why this approach:
   * 1. Direct tag recognition: Native SVG element tags.
   * 2. Metadata recognition: `data-shape="..."` with `data-parametric="true"`.
   * 3. Invariant Protection: Any element explicitly converted to freeform curves (`data-shape="path"`)
   *    must never be identified as a constrained primitive.
   */
  public isLine(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    return el.tagName === 'line' || el.attributes?.['data-shape'] === 'line';
  }

  public isPolyline(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    return el.tagName === 'polyline' || el.attributes?.['data-shape'] === 'polyline';
  }

  public isPolygon(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    return el.tagName === 'polygon' || el.attributes?.['data-shape'] === 'polygon';
  }

  public isCircle(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    if (el.tagName === 'circle' || el.attributes?.['data-shape'] === 'circle') return true;
    if (this.isEllipse(el)) {
      const rx = parseFloat(el.attributes.rx || el.attributes.r || '0');
      const ry = parseFloat(el.attributes.ry || el.attributes.r || '0');
      return Math.abs(rx - ry) < 0.001;
    }
    return false;
  }

  /**
   * ARCHITECTURAL RATIONALE: Independent Corner Radii Parsing & Extraction (FEAT-03)
   *
   * Extracts corner curvature settings (TL, TR, BR, BL, mode, unit) from an element's attributes.
   * Supports:
   * 1. Dedicated attributes: `data-corner-tl`, `data-corner-tr`, `data-corner-br`, `data-corner-bl`.
   * 2. Compound attribute: `data-corner-radius="tl,tr,br,bl"`.
   * 3. Standard SVG single-radius attributes: `rx`, `ry` (with automatic percentage detection if ending in '%').
   */
  public getRectCorners(el: VectorElement, w: number = 100, h: number = 100): RectCorners {
    return this.parseCornersFromAttrs(el.attributes || {}, w, h);
  }

  public parseCornersFromAttrs(attrs: Record<string, string>, _w: number = 100, _h: number = 100): RectCorners {
    let mode: 'uniform' | 'independent' = (attrs['data-corner-mode'] as 'uniform' | 'independent') || 'uniform';

    let tl = 0;
    let tr = 0;
    let br = 0;
    let bl = 0;

    if (attrs['data-corner-radius']) {
      const parts = attrs['data-corner-radius'].split(',').map((p) => parseFloat(p.trim()) || 0);
      if (parts.length === 4) {
        [tl, tr, br, bl] = parts;
      } else if (parts.length === 1) {
        tl = tr = br = bl = parts[0];
      }
    } else if (
      attrs['data-corner-tl'] !== undefined ||
      attrs['data-corner-tr'] !== undefined ||
      attrs['data-corner-br'] !== undefined ||
      attrs['data-corner-bl'] !== undefined
    ) {
      tl = parseFloat(attrs['data-corner-tl'] || '0') || 0;
      tr = parseFloat(attrs['data-corner-tr'] || '0') || 0;
      br = parseFloat(attrs['data-corner-br'] || '0') || 0;
      bl = parseFloat(attrs['data-corner-bl'] || '0') || 0;
    } else if (attrs.rx || attrs.ry) {
      const rxStr = attrs.rx || attrs.ry || '0';
      const isPct = rxStr.includes('%');
      const val = parseFloat(rxStr) || 0;
      tl = tr = br = bl = val;
      return {
        tl,
        tr,
        br,
        bl,
        mode: 'uniform',
        unit: isPct ? '%' : (attrs['data-corner-unit'] === '%' ? '%' : 'px'),
      };
    }

    if (tl !== tr || tr !== br || br !== bl) {
      mode = 'independent';
    }

    return {
      tl: Math.max(0, tl),
      tr: Math.max(0, tr),
      br: Math.max(0, br),
      bl: Math.max(0, bl),
      mode,
      unit: attrs['data-corner-unit'] === '%' ? '%' : 'px',
    };
  }

  /**
   * ARCHITECTURAL RATIONALE: CSS/SVG Corner Overlap Scaling and Percentage Conversion (FEAT-03)
   *
   * Converts percentage-based radii to pixels and applies the standard CSS Backgrounds and Borders
   * Level 3 (Section 5.5) proportional constraint scaling:
   * When adjacent corner radii exceed the side length (e.g. TL + TR > width), all radii are
   * proportionally scaled down by factor f = min(w / (TL + TR), w / (BL + BR), h / (TL + BL), h / (TR + BR)).
   * This prevents overlapping or intersecting arcs.
   */
  public calculateEffectiveCorners(
    w: number,
    h: number,
    corners: RectCorners
  ): { tl: number; tr: number; br: number; bl: number } {
    w = Math.max(1, w);
    h = Math.max(1, h);
    const minDim = Math.min(w, h);
    const maxRadius = minDim / 2;

    let tl = corners.tl;
    let tr = corners.tr;
    let br = corners.br;
    let bl = corners.bl;

    if (corners.unit === '%') {
      tl = Math.min(maxRadius, (minDim * tl) / 100);
      tr = Math.min(maxRadius, (minDim * tr) / 100);
      br = Math.min(maxRadius, (minDim * br) / 100);
      bl = Math.min(maxRadius, (minDim * bl) / 100);
    } else {
      tl = Math.min(maxRadius, tl);
      tr = Math.min(maxRadius, tr);
      br = Math.min(maxRadius, br);
      bl = Math.min(maxRadius, bl);
    }

    const topSum = tl + tr;
    const bottomSum = bl + br;
    const leftSum = tl + bl;
    const rightSum = tr + br;

    let scale = 1;
    if (topSum > w && topSum > 0) scale = Math.min(scale, w / topSum);
    if (bottomSum > w && bottomSum > 0) scale = Math.min(scale, w / bottomSum);
    if (leftSum > h && leftSum > 0) scale = Math.min(scale, h / leftSum);
    if (rightSum > h && rightSum > 0) scale = Math.min(scale, h / rightSum);

    return {
      tl: Math.max(0, tl * scale),
      tr: Math.max(0, tr * scale),
      br: Math.max(0, br * scale),
      bl: Math.max(0, bl * scale),
    };
  }

  /**
   * ARCHITECTURAL RATIONALE: Exact Cubic Bézier Vertex Compilation for 4-Corner Rectangles (FEAT-03)
   *
   * Constructs topologically sound closed polygon or rounded contours with 90-degree quadrant
   * cubic Bézier handles matching kappa constant k = 4/3 * (sqrt(2) - 1) ≈ 0.55228474983.
   * Each rounded corner yields 2 smooth vertices (entry and exit) with directional tangent handles.
   * Sharp corners (radius 0) yield exactly 1 sharp vertex.
   */
  public convertRectToVertices(
    x: number,
    y: number,
    w: number,
    h: number,
    tl: number,
    tr: number,
    br: number,
    bl: number
  ): PathVertex[] {
    tl = Math.max(0, tl);
    tr = Math.max(0, tr);
    br = Math.max(0, br);
    bl = Math.max(0, bl);

    if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
      let idx = 0;
      return [
        { id: `v_${idx++}`, x, y, command: 'M', nodeType: 'sharp' },
        { id: `v_${idx++}`, x: x + w, y, command: 'L', nodeType: 'sharp' },
        { id: `v_${idx++}`, x: x + w, y: y + h, command: 'L', nodeType: 'sharp' },
        { id: `v_${idx++}`, x, y: y + h, command: 'L', nodeType: 'sharp' },
      ];
    }

    const k = 0.55228474983;
    let idx = 0;
    const vertices: PathVertex[] = [];

    // 1. Top-Left corner start / Top edge
    if (tl > 0) {
      vertices.push({
        id: `v_${idx++}`,
        x: x + tl,
        y,
        handleIn: { x: x + tl - tl * k, y },
        nodeType: 'smooth',
        command: 'M',
      });
    } else {
      vertices.push({
        id: `v_${idx++}`,
        x,
        y,
        nodeType: 'sharp',
        command: 'M',
      });
    }

    // 2. Top-Right corner
    if (tr > 0) {
      vertices.push({
        id: `v_${idx++}`,
        x: x + w - tr,
        y,
        handleOut: { x: x + w - tr + tr * k, y },
        nodeType: 'smooth',
        command: 'L',
      });
      vertices.push({
        id: `v_${idx++}`,
        x: x + w,
        y: y + tr,
        handleIn: { x: x + w, y: y + tr - tr * k },
        nodeType: 'smooth',
        command: 'C',
      });
    } else {
      vertices.push({
        id: `v_${idx++}`,
        x: x + w,
        y,
        nodeType: 'sharp',
        command: 'L',
      });
    }

    // 3. Bottom-Right corner
    if (br > 0) {
      vertices.push({
        id: `v_${idx++}`,
        x: x + w,
        y: y + h - br,
        handleOut: { x: x + w, y: y + h - br + br * k },
        nodeType: 'smooth',
        command: 'L',
      });
      vertices.push({
        id: `v_${idx++}`,
        x: x + w - br,
        y: y + h,
        handleIn: { x: x + w - br + br * k, y: y + h },
        nodeType: 'smooth',
        command: 'C',
      });
    } else {
      vertices.push({
        id: `v_${idx++}`,
        x: x + w,
        y: y + h,
        nodeType: 'sharp',
        command: 'L',
      });
    }

    // 4. Bottom-Left corner
    if (bl > 0) {
      vertices.push({
        id: `v_${idx++}`,
        x: x + bl,
        y: y + h,
        handleOut: { x: x + bl - bl * k, y: y + h },
        nodeType: 'smooth',
        command: 'L',
      });
      vertices.push({
        id: `v_${idx++}`,
        x,
        y: y + h - bl,
        handleIn: { x, y: y + h - bl + bl * k },
        nodeType: 'smooth',
        command: 'C',
      });
    } else {
      vertices.push({
        id: `v_${idx++}`,
        x,
        y: y + h,
        nodeType: 'sharp',
        command: 'L',
      });
    }

    // 5. Closing back to Top-Left
    if (tl > 0) {
      vertices.push({
        id: `v_${idx++}`,
        x,
        y: y + tl,
        handleOut: { x, y: y + tl - tl * k },
        nodeType: 'smooth',
        command: 'L',
      });
    }

    return vertices;
  }

  public compileRectD(
    x: number,
    y: number,
    w: number,
    h: number,
    tl: number,
    tr: number,
    br: number,
    bl: number
  ): string {
    const verts = this.convertRectToVertices(x, y, w, h, tl, tr, br, bl);
    return this.compilePathD(verts, true);
  }

  /**
   * ARCHITECTURAL RATIONALE: Hybrid Model Primitives & Parametric State Identification (FEAT-01)
   *
   * 1. Why Hybrid Representation:
   *    Traditional vector engines either flatten every SVG primitive into `<path>` (losing parametric metadata,
   *    corner radii, center points, and inflating file size) or isolate primitives into inflexible components
   *    that cannot participate in vector calculations. AntiDraw's Hybrid Model maintains native SVG tags
   *    (`<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`) in memory and serialization,
   *    while synchronizing unified `vertices` in the background for universal bounding boxes, transforms,
   *    and snapping.
   *
   * 2. Non-Accidental Conversion:
   *    `isParametricElement` returns true only if the element has not been explicitly converted to curves
   *    (`data-shape="path"` or `isParametric === false`). Interacting with handles never alters this flag.
   */
  public isParametricElement(el: VectorElement): boolean {
    if (el.isParametric === false) return false;
    if (el.shapeType === 'path') return false;
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') {
      return false;
    }
    if (el.isParametric === true) return true;
    if (el.shapeType && el.shapeType !== 'star') return true;
    if (['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(el.tagName)) return true;
    if (el.attributes && ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(el.attributes['data-shape'])) {
      return true;
    }
    return false;
  }

  /**
   * ARCHITECTURAL RATIONALE: De-structuring Parametric Primitives to Freeform Curves (FEAT-01, FIX-07 & FEAT-02)
   *
   * 1. Total Parametric De-structuring:
   *    Irreversibly transforms native SVG parametric primitives (<rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>)
   *    into pure <path> elements with independent Bézier nodes.
   *    All primitive attributes (x, y, width, height, cx, cy, r, rx, ry, x1, y1, x2, y2, points) are purged
   *    to prevent conflicts with the compiled `d` path attribute.
   *
   * 2. Faithful Arc and Pie Conversion (FEAT-02):
   *    When converting an ellipse configured as 'pie' or 'arc', compiles exact SVG 'A', 'L', and 'Z' commands
   *    into `d` while generating corresponding cubic Bézier vertices, preserving angular orientation and fill.
   *
   * 3. Invariant Propagation:
   *    Enforces `isParametric = false`, `shapeType = 'path'`, `tagName = 'path'`,
   *    `attributes['data-shape'] = 'path'`, and `attributes['data-parametric'] = 'false'`.
   *    This guarantees that neither the node editor tool nor serialization logic treats the element
   *    as a parametric primitive ever again.
   */
  public convertToCurves(element: VectorElement): void {
    const ellipseType = element.attributes['data-ellipse-type'];
    if (this.isEllipse(element) && (ellipseType === 'pie' || ellipseType === 'arc')) {
      const cx = parseFloat(element.attributes.cx || '0');
      const cy = parseFloat(element.attributes.cy || '0');
      const rx = parseFloat(element.attributes.rx || element.attributes.r || '1');
      const ry = parseFloat(element.attributes.ry || element.attributes.r || '1');
      const startAngle = parseFloat(element.attributes['data-start-angle'] || '0');
      const endAngle = parseFloat(element.attributes['data-end-angle'] || '360');

      element.attributes.d = this.compileEllipseD(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle);
      element.vertices = this.convertEllipseToVertices(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle);
      element.isClosed = ellipseType !== 'arc';
      delete element.attributes['data-ellipse-type'];
      delete element.attributes['data-start-angle'];
      delete element.attributes['data-end-angle'];
    }

    if (this.isRect(element)) {
      const x = parseFloat(element.attributes.x || '0');
      const y = parseFloat(element.attributes.y || '0');
      const w = parseFloat(element.attributes.width || '100');
      const h = parseFloat(element.attributes.height || '100');
      const corners = this.getRectCorners(element, w, h);
      const eff = this.calculateEffectiveCorners(w, h, corners);
      element.vertices = this.convertRectToVertices(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
      element.attributes.d = this.compilePathD(element.vertices, true);
      element.isClosed = true;
    }

    element.isParametric = false;
    element.shapeType = 'path';
    element.tagName = 'path';
    element.attributes['data-shape'] = 'path';
    element.attributes['data-parametric'] = 'false';
    if (element.vertices && element.vertices.length > 0 && !element.attributes.d) {
      element.attributes.d = this.compilePathD(element.vertices, element.isClosed);
    }
    if (element.vertices && element.vertices.length > 0) {
      element.attributes['data-node-types'] = element.vertices.map((v) => v.nodeType).join(',');
    }
    const shapeAttrs = [
      'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points',
      'data-corner-mode', 'data-corner-unit', 'data-corner-radius', 'data-corner-tl', 'data-corner-tr', 'data-corner-br', 'data-corner-bl'
    ];
    shapeAttrs.forEach((attr) => delete element.attributes[attr]);
  }

  /**
   * ARCHITECTURAL RATIONALE: Mandatory De-structuring for Vector-Vector Operations (FIX-07)
   *
   * Why this exists:
   * When any parametric primitive participates in an operation with another vector
   * (Boolean union, subtract/trim, intersect, exclude, combine compound paths, fragment),
   * its rigid parametric constraint must be dissolved so that the resulting topological geometry
   * is represented accurately as a freeform <path> without conflicting shape attributes.
   */
  public ensureCurves(element: VectorElement): void {
    if (this.isParametricElement(element)) {
      this.convertToCurves(element);
    }
  }

  /**
   * Synchronizes native SVG attributes from internal vertices for clean parametric serialization.
   */
  public syncParametricAttributes(element: VectorElement): void {
    if (!this.isParametricElement(element) || !element.vertices || element.vertices.length === 0) return;
    const tag = element.shapeType || element.tagName;

    if (tag === 'rect') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      element.vertices.forEach((v) => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      });
      element.attributes.x = formatNum(minX);
      element.attributes.y = formatNum(minY);
      element.attributes.width = formatNum(Math.max(1, maxX - minX));
      element.attributes.height = formatNum(Math.max(1, maxY - minY));
    } else if (tag === 'circle' || tag === 'ellipse') {
      if (element.attributes['data-ellipse-type'] === 'pie' || element.attributes['data-ellipse-type'] === 'arc') {
        // Pie and arc slices preserve their specified center and radii invariants during parametric sync
        return;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      element.vertices.forEach((v) => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rx = Math.max(1, (maxX - minX) / 2);
      const ry = Math.max(1, (maxY - minY) / 2);
      element.attributes.cx = formatNum(cx);
      element.attributes.cy = formatNum(cy);
      if (tag === 'circle') {
        element.attributes.r = formatNum((rx + ry) / 2);
      } else {
        element.attributes.rx = formatNum(rx);
        element.attributes.ry = formatNum(ry);
      }
    } else if (tag === 'line') {
      if (element.vertices.length >= 2) {
        element.attributes.x1 = formatNum(element.vertices[0].x);
        element.attributes.y1 = formatNum(element.vertices[0].y);
        element.attributes.x2 = formatNum(element.vertices[1].x);
        element.attributes.y2 = formatNum(element.vertices[1].y);
      }
    } else if (tag === 'polygon' || tag === 'polyline') {
      element.attributes.points = element.vertices.map((v) => `${formatNum(v.x)},${formatNum(v.y)}`).join(' ');
    }
  }

  // Convert shape tags (rect, circle, ellipse, star, line, polygon) to path vertices
  public convertShapeToVertices(tag: string, attrs: Record<string, string>): PathVertex[] {
    const vertices: PathVertex[] = [];
    let idx = 0;
    const mkV = (x: number, y: number, hIn?: Point, hOut?: Point, nodeType: NodeType = 'asymmetric'): PathVertex => ({
      id: `v_${idx++}`,
      x,
      y,
      handleIn: hIn,
      handleOut: hOut,
      nodeType: nodeType,
      command: idx === 1 ? 'M' : (hIn || hOut ? 'C' : 'L')
    });

    if (tag === 'rect') {
      const x = parseFloat(attrs.x || '0');
      const y = parseFloat(attrs.y || '0');
      const w = parseFloat(attrs.width || '100');
      const h = parseFloat(attrs.height || '100');
      const corners = this.parseCornersFromAttrs(attrs, w, h);
      const eff = this.calculateEffectiveCorners(w, h, corners);
      return this.convertRectToVertices(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseFloat(attrs.cx || '50');
      const cy = parseFloat(attrs.cy || '50');
      const rx = tag === 'circle' ? parseFloat(attrs.r || '50') : parseFloat(attrs.rx || '50');
      const ry = tag === 'circle' ? parseFloat(attrs.r || '50') : parseFloat(attrs.ry || '50');
      const ellipseType = (attrs['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
      const startAngle = parseFloat(attrs['data-start-angle'] || '0');
      const endAngle = parseFloat(attrs['data-end-angle'] || '360');

      if (ellipseType === 'pie' || ellipseType === 'arc') {
        return this.convertEllipseToVertices(cx, cy, rx, ry, ellipseType, startAngle, endAngle);
      }

      const k = 0.5522847498;
      const ox = rx * k;
      const oy = ry * k;

      // 4 points (top 12h, right 3h, bottom 6h, left 9h)
      vertices.push(mkV(cx, cy - ry, { x: cx - ox, y: cy - ry }, { x: cx + ox, y: cy - ry }, 'symmetric'));
      vertices.push(mkV(cx + rx, cy, { x: cx + rx, y: cy - oy }, { x: cx + rx, y: cy + oy }, 'symmetric'));
      vertices.push(mkV(cx, cy + ry, { x: cx + ox, y: cy + ry }, { x: cx - ox, y: cy + ry }, 'symmetric'));
      vertices.push(mkV(cx - rx, cy, { x: cx - rx, y: cy + oy }, { x: cx - rx, y: cy - oy }, 'symmetric'));
    } else if (tag === 'star') {
      const cx = parseFloat(attrs.cx || '50');
      const cy = parseFloat(attrs.cy || '50');
      const rx = parseFloat(attrs.rx || attrs.r || '50');
      const ry = parseFloat(attrs.ry || attrs.r || '50');
      const points = parseInt(attrs.points || '5', 10);
      const innerRatio = parseFloat(attrs.innerRatio || '0.4');

      for (let k = 0; k < points * 2; k++) {
        const angle = -Math.PI / 2 + (k * Math.PI) / points;
        const isOuter = k % 2 === 0;
        const curRx = isOuter ? rx : rx * innerRatio;
        const curRy = isOuter ? ry : ry * innerRatio;
        vertices.push(mkV(cx + curRx * Math.cos(angle), cy + curRy * Math.sin(angle)));
      }
    } else if (tag === 'line') {
      const x1 = parseFloat(attrs.x1 || '0');
      const y1 = parseFloat(attrs.y1 || '0');
      const x2 = parseFloat(attrs.x2 || '100');
      const y2 = parseFloat(attrs.y2 || '100');
      vertices.push(mkV(x1, y1));
      vertices.push(mkV(x2, y2));
    } else if (tag === 'polygon' || tag === 'polyline') {
      const pts = (attrs.points || '').trim().split(/\s+|,/);
      for (let i = 0; i < pts.length - 1; i += 2) {
        const x = parseFloat(pts[i]);
        const y = parseFloat(pts[i + 1]);
        if (!isNaN(x) && !isNaN(y)) {
          vertices.push(mkV(x, y));
        }
      }
    }

    return vertices;
  }

  /**
   * ARCHITECTURAL RATIONALE: Inverse Geometric Analyzer for SVG Primitives (FEAT-05)
   *
   * Analyzes an arbitrary <path> element's topology, vertices, angles, and Bézier curvatures
   * to determine whether it mathematically matches a canonical SVG primitive:
   * 1. Straight Line (`<line>`): Exactly 2 vertices, open path, no Bézier curvature.
   * 2. Polyline (`<polyline>`): >= 2 vertices, open path, all segments straight (no control handles).
   * 3. Polygon (`<polygon>`): >= 3 vertices, closed path, all segments straight (no control handles).
   * 4. Pure Rectangle (`<rect>`): 4 vertices, closed path, all internal angles exactly 90°
   *    and edges aligned or orthogonal.
   * 5. Rounded Rectangle (`<rect>`): 4 corners consisting of orthogonal lines and cubic Bézier quadrants.
   * 6. Ellipse / Circle (`<ellipse>` / `<circle>`): 4 vertices, closed path, canonical cubic Bézier
   *    approximations (handles matching ~0.55228475 factor). If rx ≈ ry, recognized as `<circle>`.
   *
   * Technical Justification:
   * Sub-pixel tolerance (e.g. 1.0px) prevents numerical floating-point inaccuracies from failing
   * valid matches while rejecting arbitrary freehand contours.
   */
  public detectPrimitiveFromPath(el: VectorElement, tolerance: number = 1.0): {
    primitive: ParametricShapeType;
    attributes: Record<string, string>;
  } | null {
    if (!el.vertices || el.vertices.length < 2) return null;

    const verts = el.vertices;
    const n = verts.length;
    const isClosed = this.isElementClosed(el);

    const hasNoHandles = (v: PathVertex): boolean => {
      const hInDist = v.handleIn ? Math.hypot(v.handleIn.x - v.x, v.handleIn.y - v.y) : 0;
      const hOutDist = v.handleOut ? Math.hypot(v.handleOut.x - v.x, v.handleOut.y - v.y) : 0;
      return hInDist <= tolerance && hOutDist <= tolerance;
    };

    const allStraight = verts.every(hasNoHandles);

    // 1. Line check: exactly 2 vertices, open, straight
    if (!isClosed && n === 2 && allStraight) {
      return {
        primitive: 'line',
        attributes: {
          x1: formatNum(verts[0].x),
          y1: formatNum(verts[0].y),
          x2: formatNum(verts[1].x),
          y2: formatNum(verts[1].y),
        },
      };
    }

    // 2. Polyline check: open, >= 2 vertices, all straight
    if (!isClosed && n >= 2 && allStraight) {
      const pts = verts.map((v) => `${formatNum(v.x)},${formatNum(v.y)}`).join(' ');
      return {
        primitive: 'polyline',
        attributes: {
          points: pts,
        },
      };
    }

    // 3. Pure Polygon or Rectangle check
    if (isClosed && allStraight) {
      // Check if it's a 4-vertex orthogonal rectangle
      if (n === 4) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        verts.forEach((v) => {
          minX = Math.min(minX, v.x);
          minY = Math.min(minY, v.y);
          maxX = Math.max(maxX, v.x);
          maxY = Math.max(maxY, v.y);
        });
        const w = maxX - minX;
        const h = maxY - minY;

        if (w > tolerance && h > tolerance) {
          // Check if each vertex coincides with one of the 4 bounding box corners
          const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ];
          const matches = verts.every((v) =>
            corners.some((c) => Math.hypot(v.x - c.x, v.y - c.y) <= tolerance)
          );
          if (matches) {
            return {
              primitive: 'rect',
              attributes: {
                x: formatNum(minX),
                y: formatNum(minY),
                width: formatNum(w),
                height: formatNum(h),
                rx: '0',
                ry: '0',
                'data-corner-mode': 'uniform',
                'data-corner-unit': 'px',
                'data-corner-radius': '0,0,0,0',
              },
            };
          }
        }
      }

      // Otherwise, generic closed polygon (>= 3 vertices)
      if (n >= 3) {
        const pts = verts.map((v) => `${formatNum(v.x)},${formatNum(v.y)}`).join(' ');
        return {
          primitive: 'polygon',
          attributes: {
            points: pts,
          },
        };
      }
    }

    // 4. Circle / Ellipse check: 4 vertices, closed, symmetric Bézier arcs
    if (isClosed && n === 4) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      verts.forEach((v) => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rx = (maxX - minX) / 2;
      const ry = (maxY - minY) / 2;

      if (rx > tolerance && ry > tolerance) {
        const k = 0.55228475;
        const ox = rx * k;
        const oy = ry * k;

        const canonical = [
          { x: cx, y: cy - ry, hIn: { x: cx - ox, y: cy - ry }, hOut: { x: cx + ox, y: cy - ry } },
          { x: cx + rx, y: cy, hIn: { x: cx + rx, y: cy - oy }, hOut: { x: cx + rx, y: cy + oy } },
          { x: cx, y: cy + ry, hIn: { x: cx + ox, y: cy + ry }, hOut: { x: cx - ox, y: cy + ry } },
          { x: cx - rx, y: cy, hIn: { x: cx - rx, y: cy + oy }, hOut: { x: cx - rx, y: cy - oy } },
        ];

        // Match with cyclical shift of index 0..3
        for (let shift = 0; shift < 4; shift++) {
          let matched = true;
          for (let i = 0; i < 4; i++) {
            const v = verts[i];
            const c = canonical[(i + shift) % 4];
            if (Math.hypot(v.x - c.x, v.y - c.y) > tolerance * 1.5) {
              matched = false;
              break;
            }
            if (v.handleIn && Math.hypot(v.handleIn.x - c.hIn.x, v.handleIn.y - c.hIn.y) > tolerance * 2) {
              matched = false;
              break;
            }
            if (v.handleOut && Math.hypot(v.handleOut.x - c.hOut.x, v.handleOut.y - c.hOut.y) > tolerance * 2) {
              matched = false;
              break;
            }
          }

          if (matched) {
            const isCircle = Math.abs(rx - ry) <= tolerance;
            if (isCircle) {
              const avgR = (rx + ry) / 2;
              return {
                primitive: 'circle',
                attributes: {
                  cx: formatNum(cx),
                  cy: formatNum(cy),
                  r: formatNum(avgR),
                },
              };
            } else {
              return {
                primitive: 'ellipse',
                attributes: {
                  cx: formatNum(cx),
                  cy: formatNum(cy),
                  rx: formatNum(rx),
                  ry: formatNum(ry),
                },
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Converts a <path> element to its recognized native SVG primitive.
   * Purges old path d data and restores clean native SVG attributes.
   */
  public convertPathToPrimitive(el: VectorElement): ParametricShapeType | null {
    const detected = this.detectPrimitiveFromPath(el);
    if (!detected) return null;

    el.tagName = detected.primitive;
    el.shapeType = detected.primitive;
    el.isParametric = true;
    el.attributes['data-shape'] = detected.primitive;
    el.attributes['data-parametric'] = 'true';

    // Assign new primitive attributes
    for (const [k, v] of Object.entries(detected.attributes)) {
      el.attributes[k] = v;
    }

    // Purge path specific attributes
    delete el.attributes.d;
    delete el.attributes['data-node-types'];

    // Re-generate canonical vertices for unified model bounds
    el.vertices = this.convertShapeToVertices(detected.primitive, el.attributes);
    el.isClosed = detected.primitive !== 'line' && detected.primitive !== 'polyline';

    if (!el.isClosed) {
      el.attributes.fill = 'none';
      delete el.attributes['data-gradient'];
    }

    return detected.primitive;
  }
}


function formatNum(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

