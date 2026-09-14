import { NodeType, PathVertex, Point, VectorElement } from '../VectorModel.js';
import { PathGeometryCompiler, formatNum } from '../geometry/PathGeometryCompiler.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Parametric Ellipse, Pie & Arc Service (EllipsePrimitive)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates elliptical arc calculation, pie wedge topology, open arc parameterization,
 *    and canonical 4-vertex cubic Bézier representations from VectorModel.
 *
 * 2. Native SVG Ellipse Path Formulation (FEAT-02):
 *    Compiles native SVG path strings using standard 'A', 'L', and 'Z' commands:
 *    - 'ellipse': compiles full 360° closed path via two 180° arcs.
 *    - 'pie': begins at center (M cx cy), draws radius line to start angle (L x1 y1),
 *      curves along arc to end angle (A rx ry 0 largeArc sweep x2 y2), and closes back to center (Z).
 *    - 'arc': begins at start angle (M x1 y1), curves along perimeter to end angle, and remains open (no Z).
 *
 * 3. Unified Vertex Approximation for Canvas & Inspector:
 *    Produces unified PathVertex[] representation for canvas rendering and bounding box calculation
 *    using De Casteljau subdivision of elliptical arcs into <= 90° segments.
 */
export class EllipsePrimitive {
  /**
   * Technical Rationale (FIX-19):
   * Identifies whether a vector element represents an ellipse or circle primitive.
   */
  public static isEllipse(el: VectorElement): boolean {
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

  public static isCircle(el: VectorElement): boolean {
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
   * ARCHITECTURAL RATIONALE: Faithful Parametric Arc, Pie & Donut/Ring Path Compilation (FEAT-02 & FEAT-10)
   *
   * 1. Support for Donut (Rosca) and Annular Sectors (Rosca Parcial):
   *    When `innerRatio > 0`:
   *    - Full 360° circle/ellipse compiles as two concentric ellipses (outer clockwise + inner counter-clockwise),
   *      rendering a clean ring/donut under standard SVG winding rules.
   *    - Partial wedge (pie) compiles as an annular sector: outer perimeter arc, straight radial spoke inward,
   *      inner concentric arc in reverse, and straight radial spoke closing back to outer start.
   *    - Both configurations seamlessly revert to solid shapes when `innerRatio` returns to 0.
   */
  public static compileEllipseD(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    type: 'ellipse' | 'pie' | 'arc' = 'ellipse',
    startAngleDeg: number = 0,
    endAngleDeg: number = 360,
    innerRatio: number = 0
  ): string {
    rx = Math.max(0.1, rx);
    ry = Math.max(0.1, ry);
    innerRatio = Math.max(0, Math.min(0.95, innerRatio));

    const isFull = type === 'ellipse' || Math.abs(endAngleDeg - startAngleDeg) >= 360;

    if (isFull) {
      const x0 = cx + rx;
      const x1 = cx - rx;
      let d = `M ${formatNum(x0)} ${formatNum(cy)} A ${formatNum(rx)} ${formatNum(ry)} 0 1 1 ${formatNum(x1)} ${formatNum(cy)} A ${formatNum(rx)} ${formatNum(ry)} 0 1 1 ${formatNum(x0)} ${formatNum(cy)} Z`;
      if (innerRatio > 0) {
        const inRx = rx * innerRatio;
        const inRy = ry * innerRatio;
        const inX0 = cx + inRx;
        const inX1 = cx - inRx;
        // Inner hole running in reverse sweep (0) for evenodd and non-zero winding filling
        d += ` M ${formatNum(inX0)} ${formatNum(cy)} A ${formatNum(inRx)} ${formatNum(inRy)} 0 1 0 ${formatNum(inX1)} ${formatNum(cy)} A ${formatNum(inRx)} ${formatNum(inRy)} 0 1 0 ${formatNum(inX0)} ${formatNum(cy)} Z`;
      }
      return d;
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
      if (innerRatio > 0) {
        // Annular sector / Rosca Parcial:
        // Outer arc from 1 to 2, straight radial line to inner 2, inner arc in reverse (sweep 0) to inner 1, radial line back to 1
        const inRx = rx * innerRatio;
        const inRy = ry * innerRatio;
        const inX1 = cx + inRx * Math.cos(a1);
        const inY1 = cy + inRy * Math.sin(a1);
        const inX2 = cx + inRx * Math.cos(a2);
        const inY2 = cy + inRy * Math.sin(a2);
        return `M ${formatNum(x1)} ${formatNum(y1)} A ${formatNum(rx)} ${formatNum(ry)} 0 ${largeArc} ${sweep} ${formatNum(x2)} ${formatNum(y2)} L ${formatNum(inX2)} ${formatNum(inY2)} A ${formatNum(inRx)} ${formatNum(inRy)} 0 ${largeArc} 0 ${formatNum(inX1)} ${formatNum(inY1)} Z`;
      } else {
        return `M ${formatNum(cx)} ${formatNum(cy)} L ${formatNum(x1)} ${formatNum(y1)} A ${formatNum(rx)} ${formatNum(ry)} 0 ${largeArc} ${sweep} ${formatNum(x2)} ${formatNum(y2)} Z`;
      }
    } else {
      // type === 'arc'
      return `M ${formatNum(x1)} ${formatNum(y1)} A ${formatNum(rx)} ${formatNum(ry)} 0 ${largeArc} ${sweep} ${formatNum(x2)} ${formatNum(y2)}`;
    }
  }

  /**
   * ARCHITECTURAL RATIONALE: Parametric Ellipse, Pie, Arc & Donut Vertices Generation (FEAT-02 & FEAT-10)
   */
  public static convertEllipseToVertices(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    type: 'ellipse' | 'pie' | 'arc' = 'ellipse',
    startAngleDeg: number = 0,
    endAngleDeg: number = 360,
    innerRatio: number = 0
  ): PathVertex[] {
    rx = Math.max(0.1, rx);
    ry = Math.max(0.1, ry);
    innerRatio = Math.max(0, Math.min(0.95, innerRatio));

    const isFull = type === 'ellipse' || Math.abs(endAngleDeg - startAngleDeg) >= 360;

    if (isFull) {
      let idx = 0;
      const mkV = (x: number, y: number, hIn?: Point, hOut?: Point, nodeType: NodeType = 'symmetric', cmd: string = 'C'): PathVertex => ({
        id: `v_${idx++}`,
        x,
        y,
        handleIn: hIn,
        handleOut: hOut,
        nodeType: nodeType,
        command: cmd as any,
      });
      const k = 0.5522847498;
      const ox = rx * k;
      const oy = ry * k;
      const outerVerts = [
        mkV(cx, cy - ry, { x: cx - ox, y: cy - ry }, { x: cx + ox, y: cy - ry }, 'symmetric', 'M'),
        mkV(cx + rx, cy, { x: cx + rx, y: cy - oy }, { x: cx + rx, y: cy + oy }, 'symmetric', 'C'),
        mkV(cx, cy + ry, { x: cx + ox, y: cy + ry }, { x: cx - ox, y: cy + ry }, 'symmetric', 'C'),
        mkV(cx - rx, cy, { x: cx - rx, y: cy + oy }, { x: cx - rx, y: cy - oy }, 'symmetric', 'C'),
      ];

      if (innerRatio > 0) {
        const inRx = rx * innerRatio;
        const inRy = ry * innerRatio;
        const inOx = inRx * k;
        const inOy = inRy * k;
        // Inner vertices oriented counter-clockwise
        const innerVerts = [
          mkV(cx, cy - inRy, { x: cx + inOx, y: cy - inRy }, { x: cx - inOx, y: cy - inRy }, 'symmetric', 'M'),
          mkV(cx - inRx, cy, { x: cx - inRx, y: cy - inOy }, { x: cx - inRx, y: cy + inOy }, 'symmetric', 'C'),
          mkV(cx, cy + inRy, { x: cx - inOx, y: cy + inRy }, { x: cx + inOx, y: cy + inRy }, 'symmetric', 'C'),
          mkV(cx + inRx, cy, { x: cx + inRx, y: cy + inOy }, { x: cx + inRx, y: cy - inOy }, 'symmetric', 'C'),
        ];
        return [...outerVerts, ...innerVerts];
      }

      return outerVerts;
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

    const beziers = PathGeometryCompiler.arcToBezier(x1, y1, rx, ry, 0, largeArc, sweep, x2, y2);
    const vertices: PathVertex[] = [];
    let idx = 0;

    if (type === 'pie') {
      if (innerRatio > 0) {
        // Annular Sector (Rosca Parcial)
        const inRx = rx * innerRatio;
        const inRy = ry * innerRatio;
        const inX1 = cx + inRx * Math.cos(a1);
        const inY1 = cy + inRy * Math.sin(a1);
        const inX2 = cx + inRx * Math.cos(a2);
        const inY2 = cy + inRy * Math.sin(a2);

        // Vertex 0: Outer start point
        const v0: PathVertex = {
          id: `v_${idx++}`,
          x: x1,
          y: y1,
          nodeType: 'asymmetric',
          command: 'M',
        };
        if (beziers.length > 0) {
          v0.handleOut = { x: beziers[0].p1.x, y: beziers[0].p1.y };
        }
        vertices.push(v0);

        // Outer arc vertices
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

        // Inner reverse arc from (inX2, inY2) to (inX1, inY1) with sweep = 0
        const innerBeziers = PathGeometryCompiler.arcToBezier(inX2, inY2, inRx, inRy, 0, largeArc, 0, inX1, inY1);

        // Inner start vertex (straight spoke from outer terminal)
        const vInnerStart: PathVertex = {
          id: `v_${idx++}`,
          x: inX2,
          y: inY2,
          nodeType: 'asymmetric',
          command: 'L',
        };
        if (innerBeziers.length > 0) {
          vInnerStart.handleOut = { x: innerBeziers[0].p1.x, y: innerBeziers[0].p1.y };
        }
        vertices.push(vInnerStart);

        for (let bIdx = 0; bIdx < innerBeziers.length; bIdx++) {
          const b = innerBeziers[bIdx];
          const isTerminal = bIdx === innerBeziers.length - 1;
          const vArc: PathVertex = {
            id: `v_${idx++}`,
            x: b.p.x,
            y: b.p.y,
            handleIn: { x: b.p2.x, y: b.p2.y },
            nodeType: isTerminal ? 'sharp' : 'smooth',
            command: 'C',
          };
          if (!isTerminal && bIdx + 1 < innerBeziers.length) {
            vArc.handleOut = { x: innerBeziers[bIdx + 1].p1.x, y: innerBeziers[bIdx + 1].p1.y };
          }
          vertices.push(vArc);
        }
      } else {
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
}
