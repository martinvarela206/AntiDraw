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
  compileEllipseD(cx: number, cy: number, rx: number, ry: number, type?: 'ellipse' | 'pie' | 'arc', startAngleDeg?: number, endAngleDeg?: number): string;
  convertEllipseToVertices(cx: number, cy: number, rx: number, ry: number, type?: 'ellipse' | 'pie' | 'arc', startAngleDeg?: number, endAngleDeg?: number): PathVertex[];
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

  /**
   * ARCHITECTURAL RATIONALE: Hybrid Model Primitives & Parametric State Identification (FEAT-01)
   */
  public static isParametricElement(el: VectorElement): boolean {
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

      element.attributes.d = ctx.compileEllipseD(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle);
      element.vertices = ctx.convertEllipseToVertices(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle);
      element.isClosed = ellipseType !== 'arc';
      delete element.attributes['data-ellipse-type'];
      delete element.attributes['data-start-angle'];
      delete element.attributes['data-end-angle'];
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
      'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points',
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
    el.isClosed = detected.primitive !== 'line' && detected.primitive !== 'polyline';

    if (!el.isClosed) {
      el.attributes.fill = 'none';
      delete el.attributes['data-gradient'];
    }

    return detected.primitive;
  }
}
