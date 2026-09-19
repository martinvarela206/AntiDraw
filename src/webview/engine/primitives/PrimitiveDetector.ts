import {
  NodeType,
  ParametricShapeType,
  PathVertex,
  Point,
  VectorElement,
} from '../VectorModel.js';
import { formatNum, PathGeometryCompiler } from '../geometry/PathGeometryCompiler.js';
import { RectPrimitive } from './RectPrimitive.js';
import { EllipsePrimitive } from './EllipsePrimitive.js';

export interface IVectorModelPrimitiveContext {
  isElementClosed(el: VectorElement): boolean;
  isEllipse(el: VectorElement): boolean;
  isRect(el: VectorElement): boolean;
  compileEllipseD(cx: number, cy: number, rx: number, ry: number, type?: 'ellipse' | 'pie' | 'arc', startAngleDeg?: number, endAngleDeg?: number, innerRatio?: number): string;
  convertEllipseToVertices(cx: number, cy: number, rx: number, ry: number, type?: 'ellipse' | 'pie' | 'arc', startAngleDeg?: number, endAngleDeg?: number, innerRatio?: number): PathVertex[];
  getRectCorners(el: VectorElement, w?: number, h?: number): any;
  calculateEffectiveCorners(w: number, h: number, corners: any): any;
  convertRectToVertices(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): PathVertex[];
  compilePathD(vertices: PathVertex[], isClosed?: boolean): string;
  convertShapeToVertices(tag: string, attrs: Record<string, string>): PathVertex[];
}

/**
 * ARCHITECTURAL RATIONALE: Primitive Detection & Shape Conversion Service (PrimitiveDetector)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates parametric vs freeform curve transformations, shape detection heuristics,
 *    attribute synchronization, and primitive vertex synthesis from VectorModel.
 *
 * 2. Hybrid Model Primitives & Parametric State Identification (FEAT-01):
 *    Maintains native SVG tags (<rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>)
 *    in memory and serialization, while synchronizing unified vertices in the background
 *    for universal bounding boxes, transforms, and snapping.
 *
 * 3. Inverse Geometric Analyzer for SVG Primitives (FEAT-05):
 *    Analyzes an arbitrary <path> element's topology, vertices, angles, and Bézier curvatures
 *    to determine whether it mathematically matches a canonical SVG primitive.
 */
export class PrimitiveDetector {
  public static isLine(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    return el.tagName === 'line' || el.attributes?.['data-shape'] === 'line';
  }

  public static isPolyline(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    return el.tagName === 'polyline' || el.attributes?.['data-shape'] === 'polyline';
  }

  public static isPolygon(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    return el.tagName === 'polygon' || el.attributes?.['data-shape'] === 'polygon';
  }

  public static isStar(el: VectorElement): boolean {
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') return false;
    return (
      el.tagName === 'star' ||
      el.shapeType === 'star' ||
      el.attributes?.['data-shape'] === 'star' ||
      (el.attributes?.['data-star-points'] !== undefined && el.attributes?.cx !== undefined) ||
      ((el.tagName === 'polygon' || el.shapeType === 'polygon' || el.attributes?.['data-shape'] === 'polygon') && el.attributes?.cx !== undefined)
    );
  }

  /**
   * ARCHITECTURAL RATIONALE: Hybrid Model Primitives & Parametric State Identification (FEAT-01 & FEAT-07)
   */
  public static isParametricElement(el: VectorElement): boolean {
    if (el.isParametric === false) return false;
    if (el.shapeType === 'path') return false;
    if (el.attributes?.['data-shape'] === 'path' || el.attributes?.['data-parametric'] === 'false') {
      return false;
    }
    if (el.isParametric === true) return true;
    if (el.shapeType) return true;
    if (['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'star'].includes(el.tagName)) return true;
    if (el.attributes && ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'star'].includes(el.attributes['data-shape'])) {
      return true;
    }
    return false;
  }

  /**
   * ARCHITECTURAL RATIONALE: De-structuring Parametric Primitives to Freeform Curves (FEAT-01, FIX-07 & FEAT-02)
   */
  public static convertToCurves(element: VectorElement, ctx: IVectorModelPrimitiveContext): void {
    const ellipseType = element.attributes['data-ellipse-type'];
    if (ctx.isEllipse(element) && (ellipseType === 'pie' || ellipseType === 'arc')) {
      const cx = parseFloat(element.attributes.cx || '0');
      const cy = parseFloat(element.attributes.cy || '0');
      const rx = parseFloat(element.attributes.rx || element.attributes.r || '1');
      const ry = parseFloat(element.attributes.ry || element.attributes.r || '1');
      const startAngle = parseFloat(element.attributes['data-start-angle'] || '0');
      const endAngle = parseFloat(element.attributes['data-end-angle'] || '360');
      const innerRatio = parseFloat(element.attributes['data-inner-ratio'] || '0');

      element.attributes.d = ctx.compileEllipseD(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle, innerRatio);
      element.vertices = ctx.convertEllipseToVertices(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle, innerRatio);
      element.isClosed = ellipseType !== 'arc';
      delete element.attributes['data-ellipse-type'];
      delete element.attributes['data-start-angle'];
      delete element.attributes['data-end-angle'];
      delete element.attributes['data-inner-ratio'];
    }

    if (ctx.isRect(element)) {
      const x = parseFloat(element.attributes.x || '0');
      const y = parseFloat(element.attributes.y || '0');
      const w = parseFloat(element.attributes.width || '100');
      const h = parseFloat(element.attributes.height || '100');
      const corners = ctx.getRectCorners(element, w, h);
      const eff = ctx.calculateEffectiveCorners(w, h, corners);
      element.vertices = ctx.convertRectToVertices(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
      element.attributes.d = ctx.compilePathD(element.vertices, true);
      element.isClosed = true;
    }

    if (this.isStar(element)) {
      element.isParametric = false;
      element.shapeType = 'path';
      element.tagName = 'path';
      element.attributes['data-shape'] = 'path';
      element.attributes['data-parametric'] = 'false';
      delete element.attributes['data-star-points'];
      delete element.attributes['data-star-inner-ratio'];
      delete element.attributes['points'];
      delete element.attributes['innerRatio'];
    }

    element.isParametric = false;
    element.shapeType = 'path';
    element.tagName = 'path';
    element.attributes['data-shape'] = 'path';
    element.attributes['data-parametric'] = 'false';
    if (element.vertices && element.vertices.length > 0 && !element.attributes.d) {
      element.attributes.d = ctx.compilePathD(element.vertices, element.isClosed);
    }
    if (element.vertices && element.vertices.length > 0) {
      element.attributes['data-node-types'] = element.vertices.map((v) => v.nodeType).join(',');
    }
    const shapeAttrs = [
      'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'innerRatio',
      'data-star-points', 'data-star-inner-ratio',
      'data-corner-mode', 'data-corner-unit', 'data-corner-radius', 'data-corner-tl', 'data-corner-tr', 'data-corner-br', 'data-corner-bl'
    ];
    shapeAttrs.forEach((attr) => delete element.attributes[attr]);
  }

  /**
   * ARCHITECTURAL RATIONALE: Mandatory De-structuring for Vector-Vector Operations (FIX-07)
   */
  public static ensureCurves(element: VectorElement, ctx: IVectorModelPrimitiveContext): void {
    if (this.isParametricElement(element)) {
      this.convertToCurves(element, ctx);
    }
  }

  /**
   * Synchronizes native SVG attributes from internal vertices for clean parametric serialization.
   */
  public static syncParametricAttributes(element: VectorElement): void {
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
        if (Math.abs(rx - ry) > 0.5) {
          element.tagName = 'ellipse';
          element.shapeType = 'ellipse';
          element.attributes['data-shape'] = 'ellipse';
          delete element.attributes.r;
          element.attributes.rx = formatNum(rx);
          element.attributes.ry = formatNum(ry);
        } else {
          element.attributes.r = formatNum((rx + ry) / 2);
        }
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
    } else if (tag === 'star' || element.attributes?.['data-shape'] === 'star') {
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
      element.attributes.rx = formatNum(rx);
      element.attributes.ry = formatNum(ry);
    }
  }

  /**
   * Convert shape tags (rect, circle, ellipse, star, line, polygon) to path vertices.
   */
  public static convertShapeToVertices(tag: string, attrs: Record<string, string>): PathVertex[] {
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
      const corners = RectPrimitive.parseCornersFromAttrs(attrs, w, h);
      const eff = RectPrimitive.calculateEffectiveCorners(w, h, corners);
      return RectPrimitive.convertRectToVertices(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseFloat(attrs.cx || '50');
      const cy = parseFloat(attrs.cy || '50');
      const rx = tag === 'circle' ? parseFloat(attrs.r || '50') : parseFloat(attrs.rx || '50');
      const ry = tag === 'circle' ? parseFloat(attrs.r || '50') : parseFloat(attrs.ry || '50');
      const ellipseType = (attrs['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
      const startAngle = parseFloat(attrs['data-start-angle'] || '0');
      const endAngle = parseFloat(attrs['data-end-angle'] || '360');

      if (ellipseType === 'pie' || ellipseType === 'arc') {
        return EllipsePrimitive.convertEllipseToVertices(cx, cy, rx, ry, ellipseType, startAngle, endAngle);
      }

      const k = 0.5522847498;
      const ox = rx * k;
      const oy = ry * k;

      // 4 points (top 12h, right 3h, bottom 6h, left 9h)
      vertices.push(mkV(cx, cy - ry, { x: cx - ox, y: cy - ry }, { x: cx + ox, y: cy - ry }, 'symmetric'));
      vertices.push(mkV(cx + rx, cy, { x: cx + rx, y: cy - oy }, { x: cx + rx, y: cy + oy }, 'symmetric'));
      vertices.push(mkV(cx, cy + ry, { x: cx + ox, y: cy + ry }, { x: cx - ox, y: cy + ry }, 'symmetric'));
      vertices.push(mkV(cx - rx, cy, { x: cx - rx, y: cy + oy }, { x: cx - rx, y: cy - oy }, 'symmetric'));
    } else if (tag === 'star' || ((tag === 'polygon' || tag === 'path') && attrs.cx)) {
      const cx = parseFloat(attrs.cx || '50');
      const cy = parseFloat(attrs.cy || '50');
      const rx = parseFloat(attrs.rx || attrs.r || '50');
      const ry = parseFloat(attrs.ry || attrs.r || '50');
      const points = Math.max(3, Math.min(64, parseInt(attrs['data-star-points'] || attrs['data-polygon-sides'] || attrs.points || '5', 10)));
      const regularRatio = Math.cos(Math.PI / points);
      let innerRatio = parseFloat(attrs['data-star-inner-ratio'] || attrs.innerRatio || regularRatio.toString());
      if (isNaN(innerRatio) || innerRatio <= 0) innerRatio = regularRatio;
      innerRatio = Math.max(0.05, Math.min(2.0, innerRatio));

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
   */
  public static detectPrimitiveFromPath(
    el: VectorElement,
    isClosed: boolean,
    tolerance: number = 1.0
  ): {
    primitive: ParametricShapeType;
    attributes: Record<string, string>;
  } | null {
    if (!el.vertices || el.vertices.length < 2) return null;

    const verts = el.vertices;
    const n = verts.length;

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

    // 5. Pie Sector check (FEAT-06): closed, >= 3 vertices, 1 apex with straight spokes, curved arc contour
    if (isClosed) {
      const pie = this.detectPieSector(verts, tolerance);
      if (pie) return pie;
    }

    // 6. Arc check (FEAT-06): open, >= 2 vertices, circular or elliptical Bézier curvature
    if (!isClosed) {
      const arc = this.detectArc(verts, tolerance);
      if (arc) return arc;
    }

    return null;
  }

  /**
   * ARCHITECTURAL RATIONALE: Inverse Geometric Analyzer for Elliptical & Circular Pie Sectors (FEAT-06)
   *
   * 1. Topological Signature of Pie Sectors (Wedges):
   *    - The path must be closed (isClosed === true) with N >= 3 vertices.
   *    - Exactly one apex vertex C = (cx, cy) connects the two straight radial boundary spokes:
   *      an incoming straight spoke from the terminal arc perimeter vertex, and
   *      an outgoing straight spoke toward the initial arc perimeter vertex.
   *    - The apex node C itself possesses no Bézier control handles (|handleIn| <= tol and |handleOut| <= tol).
   *    - The remaining N - 1 vertices form the curved perimeter arc. At least one perimeter segment
   *      must have non-zero Bézier handles (distinguishing a pie wedge from a generic polygon).
   *
   * 2. Parameter Identification (Center, Radii, Angular Bounds):
   *    - Center (cx, cy) is analytically identical to the coordinates of the apex vertex C.
   *    - Arc start vertex V_start and arc end vertex V_end lie on the boundary perimeter.
   *    - For circular sectors: radial distances r_start = hypot(V_start - C) and r_end = hypot(V_end - C)
   *      are equal within tolerance, establishing r = (r_start + r_end) / 2.
   *    - For axis-aligned elliptical sectors: solves the canonical ellipse equation
   *      (x - cx)^2 / rx^2 + (y - cy)^2 / ry^2 = 1 across multiple non-collinear boundary points.
   *    - Start angle and end angle are determined via atan2 relative to the center and normalized to [0, 360).
   *    - Clockwise angular sweep is verified by sampling intermediate perimeter points.
   *
   * 3. Regenerative Verification:
   *    - To guarantee zero false positives, candidate parameters (cx, cy, rx, ry, type='pie', start, end)
   *      are synthesized into canonical vertices via EllipsePrimitive.convertEllipseToVertices and matched
   *      against the path's actual vertices within tolerance.
   */
  private static detectPieSector(
    verts: PathVertex[],
    tolerance: number
  ): { primitive: ParametricShapeType; attributes: Record<string, string> } | null {
    const n = verts.length;
    if (n < 3) return null;

    const hasNoHandles = (v: PathVertex): boolean => {
      const hInDist = v.handleIn ? Math.hypot(v.handleIn.x - v.x, v.handleIn.y - v.y) : 0;
      const hOutDist = v.handleOut ? Math.hypot(v.handleOut.x - v.x, v.handleOut.y - v.y) : 0;
      return hInDist <= tolerance && hOutDist <= tolerance;
    };

    // Identify candidate apex vertices C where:
    // 1. C has no handles.
    // 2. Incoming edge from prev has no handleOut.
    // 3. Outgoing edge to next has no handleIn.
    const apexIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = verts[i];
      if (!hasNoHandles(v)) continue;

      const prev = verts[(i - 1 + n) % n];
      const next = verts[(i + 1) % n];

      const prevHOut = prev.handleOut ? Math.hypot(prev.handleOut.x - prev.x, prev.handleOut.y - prev.y) : 0;
      const nextHIn = next.handleIn ? Math.hypot(next.handleIn.x - next.x, next.handleIn.y - next.y) : 0;

      if (prevHOut <= tolerance && nextHIn <= tolerance) {
        apexIndices.push(i);
      }
    }

    // A pie wedge has exactly 1 apex (the center of the circle/ellipse).
    if (apexIndices.length !== 1) return null;

    const apexIdx = apexIndices[0];
    const C = verts[apexIdx];
    const cx = C.x;
    const cy = C.y;

    const arcVerts: PathVertex[] = [];
    for (let k = 1; k < n; k++) {
      arcVerts.push(verts[(apexIdx + k) % n]);
    }

    // Ensure there is at least one curved segment along the arc
    const hasCurvedSegment = arcVerts.some((v) => {
      const hIn = v.handleIn ? Math.hypot(v.handleIn.x - v.x, v.handleIn.y - v.y) : 0;
      const hOut = v.handleOut ? Math.hypot(v.handleOut.x - v.x, v.handleOut.y - v.y) : 0;
      return hIn > tolerance || hOut > tolerance;
    });
    if (!hasCurvedSegment) return null;

    const vStart = arcVerts[0];
    const vEnd = arcVerts[arcVerts.length - 1];

    const rStart = Math.hypot(vStart.x - cx, vStart.y - cy);
    const rEnd = Math.hypot(vEnd.x - cx, vEnd.y - cy);
    if (rStart <= tolerance || rEnd <= tolerance) return null;

    const isCircularCandidate = Math.abs(rStart - rEnd) <= tolerance * 2;
    const candidates: { rx: number; ry: number; isCircle: boolean }[] = [];

    if (isCircularCandidate) {
      const r = (rStart + rEnd) / 2;
      candidates.push({ rx: r, ry: r, isCircle: true });
    }

    // Collect analytical sample points along the arc contour
    const samplePts: Point[] = [vStart];
    for (let i = 0; i < arcVerts.length - 1; i++) {
      const p0 = arcVerts[i];
      const p3 = arcVerts[i + 1];
      const p1 = p0.handleOut || p0;
      const p2 = p3.handleIn || p3;
      samplePts.push({
        x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
        y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y,
      });
    }
    samplePts.push(vEnd);

    // Solve for axis-aligned elliptical candidates using pairs of non-collinear sample points
    for (let i = 0; i < samplePts.length; i++) {
      for (let j = i + 1; j < samplePts.length; j++) {
        const pA = samplePts[i];
        const pB = samplePts[j];
        const u1 = Math.pow(pA.x - cx, 2);
        const v1 = Math.pow(pA.y - cy, 2);
        const u2 = Math.pow(pB.x - cx, 2);
        const v2 = Math.pow(pB.y - cy, 2);
        const det = u1 * v2 - u2 * v1;
        if (Math.abs(det) > 1e-3) {
          const X = (v2 - v1) / det;
          const Y = (u1 - u2) / det;
          if (X > 0 && Y > 0) {
            const rx = 1 / Math.sqrt(X);
            const ry = 1 / Math.sqrt(Y);
            if (rx > tolerance && ry > tolerance && Math.abs(rx - ry) > tolerance) {
              if (!candidates.some((c) => Math.abs(c.rx - rx) < 1 && Math.abs(c.ry - ry) < 1)) {
                candidates.push({ rx, ry, isCircle: false });
              }
            }
          }
        }
      }
    }

    const normAngle = (deg: number): number => {
      const a = ((deg % 360) + 360) % 360;
      return Math.abs(a - 360) < 0.01 ? 0 : a;
    };

    for (const cand of candidates) {
      const { rx, ry, isCircle } = cand;

      const aStart = normAngle((Math.atan2((vStart.y - cy) / ry, (vStart.x - cx) / rx) * 180) / Math.PI);
      const aEnd = normAngle((Math.atan2((vEnd.y - cy) / ry, (vEnd.x - cx) / rx) * 180) / Math.PI);

      let a1 = aStart;
      let a2 = aEnd;

      const midV = samplePts[Math.floor(samplePts.length / 2)];
      const aMid = normAngle((Math.atan2((midV.y - cy) / ry, (midV.x - cx) / rx) * 180) / Math.PI);

      const spanStartEnd = ((aEnd - aStart) % 360 + 360) % 360 || 360;
      const spanStartMid = ((aMid - aStart) % 360 + 360) % 360;

      if (!(spanStartMid > 0 && spanStartMid < spanStartEnd)) {
        a1 = aEnd;
        a2 = aStart;
      }

      const canonical = EllipsePrimitive.convertEllipseToVertices(cx, cy, rx, ry, 'pie', a1, a2);
      if (canonical.length !== n) continue;

      let matchedForward = true;
      for (let j = 0; j < n; j++) {
        const c = canonical[j];
        const v = verts[(apexIdx + j) % n];
        if (Math.hypot(v.x - c.x, v.y - c.y) > tolerance * 2) {
          matchedForward = false;
          break;
        }
      }

      let matchedReverse = false;
      if (!matchedForward) {
        matchedReverse = true;
        for (let j = 0; j < n; j++) {
          const c = canonical[j];
          const v = verts[(apexIdx - j + n) % n];
          if (Math.hypot(v.x - c.x, v.y - c.y) > tolerance * 2) {
            matchedReverse = false;
            break;
          }
        }
      }

      if (matchedForward || matchedReverse) {
        const attrs: Record<string, string> = {
          cx: formatNum(cx),
          cy: formatNum(cy),
          rx: formatNum(rx),
          ry: formatNum(ry),
          'data-ellipse-type': 'pie',
          'data-start-angle': formatNum(a1),
          'data-end-angle': formatNum(a2),
        };
        if (isCircle) {
          attrs.r = formatNum((rx + ry) / 2);
          return { primitive: 'circle', attributes: attrs };
        } else {
          return { primitive: 'ellipse', attributes: attrs };
        }
      }
    }

    return null;
  }

  /**
   * ARCHITECTURAL RATIONALE: Inverse Geometric Analyzer for Open Arcs (FEAT-06)
   *
   * 1. Topological Signature of Open Arcs:
   *    - The path must be open (isClosed === false) with N >= 2 vertices.
   *    - At least one vertex has non-zero Bézier handles (distinguishing from line/polyline).
   *
   * 2. Analytical Circumcenter Derivation:
   *    - Samples the initial vertex V_0, terminal vertex V_m, and an intermediate point P_mid.
   *    - Computes circumcenter (cx, cy) and radius r = hypot(P - (cx, cy)) via determinant geometry.
   *    - Normalizes angles to [0, 360) and resolves sweep orientation using the intermediate sample point.
   *
   * 3. Regenerative Verification:
   *    - Synthesizes canonical vertices with EllipsePrimitive.convertEllipseToVertices(cx, cy, rx, ry, 'arc', a1, a2).
   *    - Validates points within tolerance in both forward and reverse orientations.
   */
  private static detectArc(
    verts: PathVertex[],
    tolerance: number
  ): { primitive: ParametricShapeType; attributes: Record<string, string> } | null {
    const n = verts.length;
    if (n < 2) return null;

    const hasAnyHandle = verts.some((v) => {
      const hIn = v.handleIn ? Math.hypot(v.handleIn.x - v.x, v.handleIn.y - v.y) : 0;
      const hOut = v.handleOut ? Math.hypot(v.handleOut.x - v.x, v.handleOut.y - v.y) : 0;
      return hIn > tolerance || hOut > tolerance;
    });
    if (!hasAnyHandle) return null;

    const p0 = verts[0];
    const pm = verts[n - 1];

    let pMid: Point;
    if (n >= 3) {
      const midIdx = Math.floor((n - 1) / 2);
      pMid = { x: verts[midIdx].x, y: verts[midIdx].y };
    } else {
      const hOut = p0.handleOut || p0;
      const hIn = pm.handleIn || pm;
      pMid = {
        x: 0.125 * p0.x + 0.375 * hOut.x + 0.375 * hIn.x + 0.125 * pm.x,
        y: 0.125 * p0.y + 0.375 * hOut.y + 0.375 * hIn.y + 0.125 * pm.y,
      };
    }

    const x1 = p0.x, y1 = p0.y;
    const x2 = pMid.x, y2 = pMid.y;
    const x3 = pm.x, y3 = pm.y;

    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(D) < 1e-4) return null;

    const cx = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / D;
    const cy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / D;

    const r1 = Math.hypot(x1 - cx, y1 - cy);
    const r2 = Math.hypot(x2 - cx, y2 - cy);
    const r3 = Math.hypot(x3 - cx, y3 - cy);

    if (r1 <= tolerance || r2 <= tolerance || r3 <= tolerance) return null;

    const normAngle = (deg: number): number => {
      const a = ((deg % 360) + 360) % 360;
      return Math.abs(a - 360) < 0.01 ? 0 : a;
    };

    const candidates: { rx: number; ry: number; isCircle: boolean }[] = [];

    if (Math.abs(r1 - r2) <= tolerance * 2.5 && Math.abs(r1 - r3) <= tolerance * 2.5) {
      const avgR = (r1 + r2 + r3) / 3;
      const allVertsOnCircle = verts.every((v) => Math.abs(Math.hypot(v.x - cx, v.y - cy) - avgR) <= tolerance * 2.5);
      if (allVertsOnCircle) {
        candidates.push({ rx: avgR, ry: avgR, isCircle: true });
      }
    }

    for (const cand of candidates) {
      const { rx, ry, isCircle } = cand;

      const a0 = normAngle((Math.atan2((p0.y - cy) / ry, (p0.x - cx) / rx) * 180) / Math.PI);
      const am = normAngle((Math.atan2((pm.y - cy) / ry, (pm.x - cx) / rx) * 180) / Math.PI);
      const aMid = normAngle((Math.atan2((pMid.y - cy) / ry, (pMid.x - cx) / rx) * 180) / Math.PI);

      let a1 = a0;
      let a2 = am;

      const span0m = ((am - a0) % 360 + 360) % 360 || 360;
      const span0mid = ((aMid - a0) % 360 + 360) % 360;

      if (!(span0mid > 0 && span0mid < span0m)) {
        a1 = am;
        a2 = a0;
      }

      const canonical = EllipsePrimitive.convertEllipseToVertices(cx, cy, rx, ry, 'arc', a1, a2);
      if (canonical.length !== n) continue;

      let matchedForward = true;
      for (let j = 0; j < n; j++) {
        const c = canonical[j];
        const v = verts[j];
        if (Math.hypot(v.x - c.x, v.y - c.y) > tolerance * 2) {
          matchedForward = false;
          break;
        }
      }

      let matchedReverse = false;
      if (!matchedForward) {
        matchedReverse = true;
        for (let j = 0; j < n; j++) {
          const c = canonical[j];
          const v = verts[n - 1 - j];
          if (Math.hypot(v.x - c.x, v.y - c.y) > tolerance * 2) {
            matchedReverse = false;
            break;
          }
        }
      }

      if (matchedForward || matchedReverse) {
        const attrs: Record<string, string> = {
          cx: formatNum(cx),
          cy: formatNum(cy),
          rx: formatNum(rx),
          ry: formatNum(ry),
          'data-ellipse-type': 'arc',
          'data-start-angle': formatNum(a1),
          'data-end-angle': formatNum(a2),
        };
        if (isCircle) {
          attrs.r = formatNum((rx + ry) / 2);
          return { primitive: 'circle', attributes: attrs };
        } else {
          return { primitive: 'ellipse', attributes: attrs };
        }
      }
    }

    return null;
  }

  /**
   * Converts a <path> element to its recognized native SVG primitive.
   */
  public static convertPathToPrimitive(el: VectorElement, ctx: IVectorModelPrimitiveContext): ParametricShapeType | null {
    const isClosed = ctx.isElementClosed(el);
    const detected = this.detectPrimitiveFromPath(el, isClosed);
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
    el.vertices = ctx.convertShapeToVertices(detected.primitive, el.attributes);

    const ellipseType = detected.attributes['data-ellipse-type'];
    if (ellipseType === 'arc') {
      el.isClosed = false;
      el.attributes.fill = 'none';
      delete el.attributes['data-gradient'];
    } else if (ellipseType === 'pie') {
      el.isClosed = true;
    } else {
      el.isClosed = detected.primitive !== 'line' && detected.primitive !== 'polyline';
    }

    if (ellipseType === 'pie' || ellipseType === 'arc') {
      const cx = parseFloat(el.attributes.cx || '0');
      const cy = parseFloat(el.attributes.cy || '0');
      const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
      const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
      const startAngle = parseFloat(el.attributes['data-start-angle'] || '0');
      const endAngle = parseFloat(el.attributes['data-end-angle'] || '360');
      const innerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
      el.attributes.d = ctx.compileEllipseD(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle, innerRatio);
    }

    if (!el.isClosed) {
      el.attributes.fill = 'none';
      delete el.attributes['data-gradient'];
    }

    return detected.primitive;
  }
}
