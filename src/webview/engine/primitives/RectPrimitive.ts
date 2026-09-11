import { PathVertex, RectCorners, VectorElement } from '../VectorModel.js';
import { PathGeometryCompiler } from '../geometry/PathGeometryCompiler.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Parametric Rectangle Service (RectPrimitive)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates all rectangle-specific logic: independent corner radii parsing,
 *    proportional CSS/SVG corner overlap constraint scaling, cubic Bézier quadrant vertex
 *    generation (using standard kappa constant k ≈ 0.55228475), and SVG path compilation.
 *
 * 2. Independent Corner Radii & Units:
 *    Supports both uniform and individual corner radii (TL, TR, BR, BL) in pixels ('px') or percentages ('%').
 *
 * 3. Exact Corner Bézier Quadrant Compilation:
 *    Constructs topologically sound closed polygon or rounded contours with 90-degree quadrant
 *    cubic Bézier handles matching kappa constant k = 4/3 * (sqrt(2) - 1) ≈ 0.55228474983.
 *    Each rounded corner yields 2 smooth vertices (entry and exit) with directional tangent handles.
 *    Sharp corners (radius 0) yield exactly 1 sharp vertex.
 */
export class RectPrimitive {
  /**
   * ARCHITECTURAL RATIONALE: Rect Primitive Identification (FEAT-03)
   */
  public static isRect(el: VectorElement): boolean {
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
   * ARCHITECTURAL RATIONALE: Independent Corner Radii Parsing & Extraction (FEAT-03)
   */
  public static getRectCorners(el: VectorElement, w: number = 100, h: number = 100): RectCorners {
    return this.parseCornersFromAttrs(el.attributes || {}, w, h);
  }

  public static parseCornersFromAttrs(attrs: Record<string, string>, _w: number = 100, _h: number = 100): RectCorners {
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
  public static calculateEffectiveCorners(
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
   */
  public static convertRectToVertices(
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
        y,
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

  public static compileRectD(
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
    return PathGeometryCompiler.compilePathD(verts, true);
  }
}
