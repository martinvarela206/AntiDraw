import {
  CanvasSettings,
  DropShadowConfig,
  GradientConfig,
  GradientStop,
  InnerShadowConfig,
  ParametricShapeType,
  PathVertex,
  RectCorners,
  VectorElement,
} from '../VectorModel.js';
import { PathGeometryCompiler } from '../geometry/PathGeometryCompiler.js';

export interface IVectorModelSerializerContext {
  canvas: CanvasSettings;
  elements: VectorElement[];
  customDefs: string;
  createDefaultCanvas(): void;
  parsePathD(d: string, nodeTypesStr?: string): PathVertex[];
  convertShapeToVertices(tag: string, attrs: Record<string, string>): PathVertex[];
  isParametricElement(el: VectorElement): boolean;
  syncParametricAttributes(el: VectorElement): void;
  isRect(el: VectorElement): boolean;
  getRectCorners(el: VectorElement, w: number, h: number): RectCorners;
  calculateEffectiveCorners(w: number, h: number, corners: RectCorners): { tl: number; tr: number; br: number; bl: number };
  compileRectD(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): string;
  compileEllipseD(cx: number, cy: number, rx: number, ry: number, type: 'pie' | 'arc', startAngle: number, endAngle: number): string;
  isElementClosed(el: VectorElement): boolean;
  compilePathD(vertices: PathVertex[], isClosed?: boolean): string;
}

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export {
  STANDARD_MARKERS_INNER_XML,
  MarkerTemplate,
  MARKER_TEMPLATES,
  SvgMarkerCatalog,
} from './SvgMarkerCatalog.js';
import { SvgMarkerCatalog } from './SvgMarkerCatalog.js';
export { SvgDeserializer } from './SvgDeserializer.js';
import { SvgDeserializer } from './SvgDeserializer.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated SVG Serialization & Deserialization Service (SvgSerializer)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates XML document parsing, SVG tag extraction, filter/gradient defs compilation,
 *    and string generation from core vector state management in VectorModel.
 *
 * 2. Defs Sanitation & Ghost Comment Prevention (FIX-20):
 *    Explicitly purges template comments and orphaned marker/filter/gradient blocks to prevent
 *    comment accumulation over save-reload cycles.
 *
 * 3. Self-Healing Filter and Gradient Binding:
 *    Synchronizes element references to compiled filter and gradient IDs during serialization.
 *
 * 4. Parametric Geometry Preservation (FEAT-01, FEAT-02, FEAT-03):
 *    Exports native SVG primitives (<rect>, <ellipse>, <circle>, <line>, <polyline>, <polygon>)
 *    where standard-compliant, falling back cleanly to <path> with parametric metadata when
 *    complex non-uniform corner radii or partial arcs are configured.
 */
export class SvgSerializer {
  /**
   * Parses an SVG document string and populates the model canvas, custom defs, and vector elements.
   * Delegated to SvgDeserializer to adhere to Single Responsibility Principle (SRP).
   */
  public static loadSvgString(svgText: string, ctx: IVectorModelSerializerContext): void {
    SvgDeserializer.loadSvgString(svgText, ctx);
  }

  /**
   * ARCHITECTURAL RATIONALE: Dynamic SVG Filter Compilation
   * Why this exists:
   * Generates hardware-accelerated SVG <filter> definitions for Drop Shadow and Inner Shadow
   * directly within <defs>, binding them to elements via `filter="url(#ad-filter-shadow-${id})"`.
   *
   * Technical Justification & Edge Cases:
   * 1. feDropShadow is used for drop shadow as it is natively supported by modern SVG2 renderers
   *    and runs on the GPU.
   * 2. Inner Shadow is constructed using a composite inversion pipeline (SourceAlpha out offset -> blur -> flood -> in SourceAlpha).
   *    Alternative considered: Inset box-shadow CSS. Discarded because CSS box-shadow does not conform to
   *    arbitrary vector path outlines (Bézier curves, polygons, stars) and is ignored in standalone SVG files.
   * 3. Both shadows can coexist simultaneously on a single element through chained feComposite over operations.
   */
  public static compileElementFilters(elements: VectorElement[]): string {
    let out = '';
    elements.forEach((el) => {
      const dsStr = el.attributes['data-drop-shadow'];
      const isStr = el.attributes['data-inner-shadow'];
      let ds: DropShadowConfig | null = null;
      let is: InnerShadowConfig | null = null;
      try {
        if (dsStr) ds = JSON.parse(dsStr);
      } catch {}
      try {
        if (isStr) is = JSON.parse(isStr);
      } catch {}

      const hasDs = !!(ds && ds.enabled);
      const hasIs = !!(is && is.enabled);

      if (!hasDs && !hasIs) return;

      const filterId = `ad-filter-shadow-${el.id}`;

      /**
       * ARCHITECTURAL RATIONALE: Self-Healing Filter URL Binding
       * If the element's id was modified (e.g. during Boolean operations, cloning, or
       * deserialization), its filter attribute might point to an obsolete ID.
       * Re-syncing ensures the filter reference matches the compiled <filter> definition in <defs>.
       */
      if (el.attributes['filter'] && el.attributes['filter'].includes('ad-filter-shadow-')) {
        el.attributes['filter'] = `url(#${filterId})`;
      }

      // Generous filter region prevents clipping blurred shadow margins
      out += `    <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">\n`;

      if (hasDs && !hasIs) {
        out += `      <feDropShadow dx="${ds!.dx}" dy="${ds!.dy}" stdDeviation="${ds!.blur}" flood-color="${ds!.color}" flood-opacity="${ds!.opacity}" />\n`;
      } else if (!hasDs && hasIs) {
        out += `      <feOffset dx="${is!.dx}" dy="${is!.dy}" in="SourceAlpha" result="offset-alpha" />\n`;
        out += `      <feComposite operator="out" in="SourceAlpha" in2="offset-alpha" result="inverse-alpha" />\n`;
        out += `      <feGaussianBlur in="inverse-alpha" stdDeviation="${is!.blur}" result="blurred-shadow" />\n`;
        out += `      <feFlood flood-color="${is!.color}" flood-opacity="${is!.opacity}" result="shadow-color" />\n`;
        out += `      <feComposite operator="in" in="shadow-color" in2="blurred-shadow" result="colored-shadow" />\n`;
        out += `      <feComposite operator="in" in="colored-shadow" in2="SourceAlpha" result="clipped-inner-shadow" />\n`;
        out += `      <feComposite operator="over" in="clipped-inner-shadow" in2="SourceGraphic" />\n`;
      } else if (hasDs && hasIs) {
        out += `      <feDropShadow dx="${ds!.dx}" dy="${ds!.dy}" stdDeviation="${ds!.blur}" flood-color="${ds!.color}" flood-opacity="${ds!.opacity}" result="drop-shadow-graphic" />\n`;
        out += `      <feOffset dx="${is!.dx}" dy="${is!.dy}" in="SourceAlpha" result="offset-alpha" />\n`;
        out += `      <feComposite operator="out" in="SourceAlpha" in2="offset-alpha" result="inverse-alpha" />\n`;
        out += `      <feGaussianBlur in="inverse-alpha" stdDeviation="${is!.blur}" result="blurred-shadow" />\n`;
        out += `      <feFlood flood-color="${is!.color}" flood-opacity="${is!.opacity}" result="shadow-color" />\n`;
        out += `      <feComposite operator="in" in="shadow-color" in2="blurred-shadow" result="colored-shadow" />\n`;
        out += `      <feComposite operator="in" in="colored-shadow" in2="SourceAlpha" result="clipped-inner-shadow" />\n`;
        out += `      <feComposite operator="over" in="clipped-inner-shadow" in2="drop-shadow-graphic" />\n`;
      }

      out += `    </filter>\n`;
    });
    return out;
  }

  /**
   * ARCHITECTURAL RATIONALE: Hardware-Accelerated SVG Gradient Compilation
   * Why this exists:
   * Compiles dynamic <linearGradient> and <radialGradient> definitions into <defs>,
   * referencing them via `fill="url(#ad-grad-${id})"`.
   *
   * Technical Justification & Coordinate Systems:
   * 1. Uses `gradientUnits="objectBoundingBox"` so gradients automatically scale, stretch,
   *    and adapt proportionally when vector objects are transformed or resized.
   * 2. For linear gradients, angle is converted into normalized coordinates:
   *    theta = (angle * Math.PI) / 180;
   *    x1 = 0.5 - 0.5 * Math.cos(theta); y1 = 0.5 - 0.5 * Math.sin(theta);
   *    x2 = 0.5 + 0.5 * Math.cos(theta); y2 = 0.5 + 0.5 * Math.sin(theta);
   *    This aligns with standard CSS linear-gradient where 0° points left-to-right and 90° points top-to-bottom.
   * 3. For radial gradients, default cx=0.5, cy=0.5, r=0.5 produces a centered circular/elliptical glow conforming to the bounding box.
   */
  /**
   * ARCHITECTURAL RATIONALE: Directional Span-Aware Radial Gradient Matrix (FIX-RadialScaleLock)
   *
   * 1. The Anisotropic Aspect & Rotation Coupling Defect:
   *    In SVG, `gradientUnits="objectBoundingBox"` maps coordinates [0, 1] x [0, 1] to the element's
   *    bounding box (W, H). Previously, FIX-21 defined physical radii as Rx = grad.rx * W and Ry = grad.ry * H
   *    and then rotated by angle theta. While this ensured axis orthogonality, it introduced a catastrophic
   *    directional inversion when theta != 0:
   *    At theta = 90° (vertical axis), Axis 1 had radius Rx = grad.rx * W (proportional strictly to WIDTH).
   *    When the vector was scaled vertically (H changed while W remained constant), Axis 1 radius remained
   *    completely frozen in screen space ("el relleno radial se mantiene fijo en el sentido vertical").
   *    Simultaneously, Axis 2 (horizontal at theta = 90°) had radius Ry = grad.ry * H, causing the horizontal
   *    extent of the gradient to explode when resizing vertically.
   *
   * 2. Directional Bounding Box Span Formulation:
   *    The characteristic span of a bounding box (W, H) along a direction vector u = (cos(theta), sin(theta))
   *    is given by:
   *      spanU = sqrt((W * cos(theta))^2 + (H * sin(theta))^2)
   *    and along the orthogonal direction v = (-sin(theta), cos(theta)):
   *      spanV = sqrt((W * sin(theta))^2 + (H * cos(theta))^2)
   *    When theta = 0°:  spanU = W, spanV = H (natural horizontal and vertical box bounds).
   *    When theta = 90°: spanU = H, spanV = W (correctly binds the vertical axis to H and horizontal axis to W).
   *    Physical radii on screen are therefore:
   *      R1 = grad.rx * spanU
   *      R2 = grad.ry * spanV
   *    Mapping the unit circle in gradient space (u', v') to canvas pixels (X, Y):
   *      [X - Cx] = R1 * cos(theta) * u' - R2 * sin(theta) * v'
   *      [Y - Cy] = R1 * sin(theta) * u' + R2 * cos(theta) * v'
   *    Expressing in SVG objectBoundingBox units where X = x0 + u*W and Y = y0 + v*H yields:
   *      a = (R1 * cos(theta)) / W
   *      b = (R1 * sin(theta)) / H
   *      c = -(R2 * sin(theta)) / W
   *      d = (R2 * cos(theta)) / H
   *      e = cx
   *      f = cy
   *    This guarantees:
   *    - Strict axis orthogonality (dot product a*c*W^2 + b*d*H^2 = -R1*R2*cos*sin + R1*R2*sin*cos = 0).
   *    - Natural solidary scaling: when scaling along any axis, the gradient radius along that axis
   *      scales proportionally with the vector geometry, eliminating vertical freezing and horizontal distortion.
   *    - In-code stability: determinant det = ad - bc = (R1 * R2) / (W * H) > 0 at all angles.
   *
   * 3. Exact Focal Point Inverse Mapping:
   *    Focal offset (dfx = fx - cx, dfy = fy - cy) is mapped to local gradient space via the inverse matrix:
   *      u'_f = (d * dfx - c * dfy) / det
   *      v'_f = (-b * dfx + a * dfy) / det
   *    clamped to length <= 0.98 to avoid W3C boundary singularities.
   */
  public static computeRadialGradientMatrix(
    grad: GradientConfig,
    bbox: { width: number; height: number }
  ): { cx: number; cy: number; r: number; fx: number; fy: number; transform: string; transformAttr: string } {
    const W = Math.max(bbox.width, 1);
    const H = Math.max(bbox.height, 1);
    const cx = grad.cx ?? 0.5;
    const cy = grad.cy ?? 0.5;
    const rx = Math.max(0.001, grad.rx ?? grad.r ?? 0.5);
    const ry = Math.max(0.001, grad.ry ?? grad.r ?? 0.5);
    const fx = grad.fx ?? cx;
    const fy = grad.fy ?? cy;
    const rotation = grad.rotation ?? 0;
    const rad = (rotation * Math.PI) / 180;

    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Characteristic bounding box spans along rotated axes
    const spanU = Math.hypot(W * cos, H * sin);
    const spanV = Math.hypot(W * sin, H * cos);

    const R1 = rx * spanU;
    const R2 = ry * spanV;

    const a = (R1 * cos) / W;
    const b = (R1 * sin) / H;
    const c = -(R2 * sin) / W;
    const d = (R2 * cos) / H;
    const e = cx;
    const f = cy;

    let uF = 0;
    let vF = 0;
    const det = a * d - b * c; // Equivalent to (R1 * R2) / (W * H)
    if (det > 0.000001) {
      const dfx = fx - cx;
      const dfy = fy - cy;
      uF = (d * dfx - c * dfy) / det;
      vF = (-b * dfx + a * dfy) / det;
      const fDist = Math.hypot(uF, vF);
      if (fDist > 0.98) {
        uF = (uF / fDist) * 0.98;
        vF = (vF / fDist) * 0.98;
      }
    }

    const fmt = (n: number) => (Math.round(n * 10000) / 10000).toString();
    const transform = `matrix(${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(d)} ${fmt(e)} ${fmt(f)})`;
    const transformAttr = ` gradientTransform="${transform}"`;

    return {
      cx: 0,
      cy: 0,
      r: 1,
      fx: Math.round(uF * 10000) / 10000,
      fy: Math.round(vF * 10000) / 10000,
      transform,
      transformAttr,
    };
  }

  public static compileElementGradients(elements: VectorElement[]): string {
    let out = '';
    elements.forEach((el) => {
      const gradStr = el.attributes['data-gradient'];
      if (!gradStr) return;
      let grad: GradientConfig | null = null;
      try {
        grad = JSON.parse(gradStr);
      } catch {}
      if (!grad || !grad.stops || grad.stops.length === 0) return;

      const gradId = `ad-grad-${el.id}`;

      /**
       * ARCHITECTURAL RATIONALE: Self-Healing Dynamic Gradient URL Binding
       * Why this exists:
       * When vector elements undergo Boolean operations (Trim, Union, Intersect, Exclude),
       * cloning, or ID mutations, their attributes may carry stale gradient URL references
       * (e.g. fill="url(#ad-grad-old_id)") while the gradient definition in <defs> is
       * compiled under the element's active ID (id="ad-grad-new_id").
       * This self-healing binding synchronizes el.attributes['fill'] = `url(#ad-grad-${el.id})`
       * directly during compilation, ensuring SVG renderers always locate the active gradient
       * and preventing trimmed or modified vectors from visually losing their fill.
       */
      if (el.attributes['fill'] && el.attributes['fill'].includes('ad-grad-')) {
        el.attributes['fill'] = `url(#${gradId})`;
      }

      if (grad.type === 'linear') {
        let x1 = grad.x1 ?? 0;
        let y1 = grad.y1 ?? 0;
        let x2 = grad.x2 ?? 1;
        let y2 = grad.y2 ?? 0;

        if (grad.angle !== undefined) {
          const cx = grad.cx ?? 0.5;
          const cy = grad.cy ?? 0.5;
          const halfLen = grad.r ?? 0.5;
          const rad = (grad.angle * Math.PI) / 180;
          x1 = Math.round((cx - halfLen * Math.cos(rad)) * 1000) / 1000;
          y1 = Math.round((cy - halfLen * Math.sin(rad)) * 1000) / 1000;
          x2 = Math.round((cx + halfLen * Math.cos(rad)) * 1000) / 1000;
          y2 = Math.round((cy + halfLen * Math.sin(rad)) * 1000) / 1000;
        }

        out += `    <linearGradient id="${gradId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="objectBoundingBox">\n`;
      } else {
        // Calculate element's visual bounding box for anisotropic aspect ratio compensation
        let bboxWidth = 100;
        let bboxHeight = 100;
        if (el.vertices && el.vertices.length > 0) {
          const isClosed = el.isClosed ?? (el.attributes.d ? /z/i.test(el.attributes.d) : true);
          const bounds = PathGeometryCompiler.computeVerticesBoundingBox(el.vertices, isClosed);
          if (bounds) {
            bboxWidth = bounds.width;
            bboxHeight = bounds.height;
          }
        } else if (el.attributes.width && el.attributes.height) {
          bboxWidth = Math.max(parseFloat(el.attributes.width) || 100, 1);
          bboxHeight = Math.max(parseFloat(el.attributes.height) || 100, 1);
        } else if (el.attributes.rx && el.attributes.ry) {
          bboxWidth = Math.max((parseFloat(el.attributes.rx) || 50) * 2, 1);
          bboxHeight = Math.max((parseFloat(el.attributes.ry) || 50) * 2, 1);
        } else if (el.attributes.r) {
          const rad = Math.max(parseFloat(el.attributes.r) || 50, 1);
          bboxWidth = rad * 2;
          bboxHeight = rad * 2;
        }

        const comp = SvgSerializer.computeRadialGradientMatrix(grad, { width: bboxWidth, height: bboxHeight });
        out += `    <radialGradient id="${gradId}" cx="${comp.cx}" cy="${comp.cy}" r="${comp.r}" fx="${comp.fx}" fy="${comp.fy}"${comp.transformAttr} gradientUnits="objectBoundingBox">\n`;
      }

      // Sort stops by offset ascending
      const sortedStops = [...grad.stops].sort((a, b) => a.offset - b.offset);
      sortedStops.forEach((stop) => {
        const offPct = Math.round(stop.offset * 100);
        const op = stop.opacity !== undefined ? stop.opacity : 1;
        out += `      <stop offset="${offPct}%" stop-color="${stop.color}" stop-opacity="${op}" />\n`;
      });

      if (grad.type === 'linear') {
        out += `    </linearGradient>\n`;
      } else {
        out += `    </radialGradient>\n`;
      }
    });
    return out;
  }

  /**
   * ARCHITECTURAL RATIONALE: Dynamic & Parametric SVG Markers with Offset & Sizing Support
   *
   * 1. Baseline Global Catalog:
   *    Always emits STANDARD_MARKERS_INNER_XML for default marker IDs without customization.
   *
   * 2. Parametric Marker Offsets & Sizing:
   *    - Offsets: shifts refX along curve tangents to eliminate protruding stroke butt caps.
   *    - Independent Sizing: scales markerWidth and markerHeight based on data-marker-size.
   *    - Scaling Units: supports markerUnits="strokeWidth" (relative, default) or "userSpaceOnUse" (absolute px).
   *
   * 3. Self-Healing Element-Scoped Marker IDs:
   *    If an element has customized markers (offset != 0, custom size, or absolute units), SvgSerializer compiles
   *    dedicated <marker id="ad-marker-${tplKey}-${el.id}"> in <defs> and synchronizes
   *    the element's marker-start/mid/end attributes to point to the customized definition.
   */
  public static compileElementMarkers(elements: VectorElement[]): string {
    return SvgMarkerCatalog.compileElementMarkers(elements);
  }

  /**
   * Serializes the model canvas and elements into an XML-compliant SVG string.
   */
  public static toSvgString(ctx: IVectorModelSerializerContext): string {
    const { width, height, viewBox, backgroundColor } = ctx.canvas;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" style="background-color: ${backgroundColor};">\n`;

    // Detect if any vector element makes use of SVG marker terminations
    const hasMarkers = ctx.elements.some(
      (el) => !!(el.attributes['marker-start'] || el.attributes['marker-mid'] || el.attributes['marker-end'])
    );
    const filterDefs = this.compileElementFilters(ctx.elements);
    const gradientDefs = this.compileElementGradients(ctx.elements);

    const hasCustomDefs = !!(ctx.customDefs && ctx.customDefs.trim().length > 0);
    if (hasMarkers || filterDefs.length > 0 || gradientDefs.length > 0 || hasCustomDefs) {
      svg += `  <defs id="antidraw-defs">\n`;
      if (hasMarkers) {
        svg += this.compileElementMarkers(ctx.elements);
      }
      if (filterDefs.length > 0) {
        svg += filterDefs;
      }
      if (gradientDefs.length > 0) {
        svg += gradientDefs;
      }
      if (hasCustomDefs) {
        svg += `    ${ctx.customDefs.trim()}\n`;
      }
      svg += `  </defs>\n`;
    }

    ctx.elements.forEach((el) => {
      // HISTORICAL ARCHITECTURE (FIX-19): Guarantee attributes.id strictly reflects model el.id upon serialization
      el.attributes.id = el.id;

      if (ctx.isParametricElement(el) && el.tagName !== 'path') {
        /**
         * ARCHITECTURAL RATIONALE: Native Parametric SVG Export (FEAT-01 & FEAT-02)
         * Preserves original SVG primitives (<rect>, <ellipse>, <circle>, <line>, <polyline>, <polygon>)
         * in the output SVG document without converting them to path commands.
         * For parametric ellipse in 'pie' or 'arc' mode: native SVG lacks start/end angle attributes,
         * so AntiDraw serializes them as compliant <path> carrying parametric metadata (data-shape="ellipse",
         * data-parametric="true", data-ellipse-type, data-start-angle, data-end-angle, cx, cy, rx, ry),
         * guaranteeing standard SVG renderers display the wedge or arc without losing re-editability.
         */
        ctx.syncParametricAttributes(el);
        const cleanAttrs: Record<string, string> = { ...el.attributes };
        const ellipseType = cleanAttrs['data-ellipse-type'];

        if (ellipseType === 'pie' || ellipseType === 'arc') {
          const cx = parseFloat(cleanAttrs.cx || '0');
          const cy = parseFloat(cleanAttrs.cy || '0');
          const rx = parseFloat(cleanAttrs.rx || '1');
          const ry = parseFloat(cleanAttrs.ry || '1');
          const startAngle = parseFloat(cleanAttrs['data-start-angle'] || '0');
          const endAngle = parseFloat(cleanAttrs['data-end-angle'] || '360');

          cleanAttrs.d = ctx.compileEllipseD(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle);
          cleanAttrs['data-shape'] = 'ellipse';
          cleanAttrs['data-parametric'] = 'true';

          if (ellipseType === 'arc') {
            cleanAttrs.fill = 'none';
            delete cleanAttrs['data-gradient'];
          }

          svg += `  <path`;
          for (const [key, val] of Object.entries(cleanAttrs)) {
            svg += ` ${key}="${escapeXml(val)}"`;
          }
          svg += ` />\n`;
        } else if (ctx.isRect(el)) {
          /**
           * ARCHITECTURAL RATIONALE: Native Parametric Rect Serialization (FEAT-03)
           * When all 4 corner radii are uniform and measured in pixels, serialize as native
           * SVG <rect x="..." y="..." width="..." height="..." rx="..." ry="..." />.
           * When corners have independent radii or percentage units, native SVG <rect> cannot
           * express them; serialize as compliant <path> carrying parametric rect metadata
           * (data-shape="rect", data-parametric="true", data-corner-radius, data-corner-unit, data-corner-mode, x, y, width, height)
           * guaranteeing standard SVG renderers display the exact corner geometry without losing re-editability in AntiDraw.
           */
          const x = parseFloat(cleanAttrs.x || '0');
          const y = parseFloat(cleanAttrs.y || '0');
          const w = parseFloat(cleanAttrs.width || '100');
          const h = parseFloat(cleanAttrs.height || '100');
          const corners = ctx.getRectCorners(el, w, h);
          const isUniform = corners.mode === 'uniform' || (corners.tl === corners.tr && corners.tr === corners.br && corners.br === corners.bl);

          if (isUniform && corners.unit === 'px') {
            cleanAttrs.rx = corners.tl.toString();
            cleanAttrs.ry = corners.tl.toString();
            delete cleanAttrs.d;
            delete cleanAttrs['data-node-types'];
            svg += `  <rect`;
            for (const [key, val] of Object.entries(cleanAttrs)) {
              svg += ` ${key}="${escapeXml(val)}"`;
            }
            svg += ` />\n`;
          } else {
            const eff = ctx.calculateEffectiveCorners(w, h, corners);
            cleanAttrs.d = ctx.compileRectD(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
            cleanAttrs['data-shape'] = 'rect';
            cleanAttrs['data-parametric'] = 'true';
            delete cleanAttrs['data-node-types'];
            svg += `  <path`;
            for (const [key, val] of Object.entries(cleanAttrs)) {
              svg += ` ${key}="${escapeXml(val)}"`;
            }
            svg += ` />\n`;
          }
        } else if (cleanAttrs['data-shape'] === 'star') {
          /**
           * ARCHITECTURAL RATIONALE: Native Parametric Star Serialization (FEAT-07)
           * Native SVG lacks a <star> element; serialize as compliant <path> carrying parametric metadata
           * (data-shape="star", data-parametric="true", data-star-points, data-star-inner-ratio, cx, cy, rx, ry),
           * guaranteeing standard SVG renderers display the exact polygon without losing re-editability in AntiDraw.
           */
          cleanAttrs.d = ctx.compilePathD(el.vertices || [], true);
          cleanAttrs['data-shape'] = 'star';
          cleanAttrs['data-parametric'] = 'true';
          delete cleanAttrs['data-node-types'];
          svg += `  <path`;
          for (const [key, val] of Object.entries(cleanAttrs)) {
            svg += ` ${key}="${escapeXml(val)}"`;
          }
          svg += ` />\n`;
        } else {
          delete cleanAttrs.d;
          delete cleanAttrs['data-node-types'];

          if (!ctx.isElementClosed(el)) {
            cleanAttrs.fill = 'none';
            delete cleanAttrs['data-gradient'];
          }

          svg += `  <${el.tagName}`;
          for (const [key, val] of Object.entries(cleanAttrs)) {
            svg += ` ${key}="${escapeXml(val)}"`;
          }
          svg += ` />\n`;
        }
      } else {
        if (el.vertices && el.vertices.length > 0) {
          el.attributes.d = ctx.compilePathD(el.vertices, el.isClosed);
          // Persist nodeType for each vertex so re-parsing restores it reliably
          el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
        }

        /**
         * HISTORICAL ARCHITECTURE (FIX-13):
         * Open Vector Fill Suppression in SVG Serialization.
         * If an element is open (!isElementClosed), its fill attribute is strictly set to 'none'
         * and any gradient definitions are unlinked to eliminate false straight-line polygon fills.
         */
        if (!ctx.isElementClosed(el)) {
          el.attributes.fill = 'none';
          delete el.attributes['data-gradient'];
        }

        svg += `  <${el.tagName}`;
        for (const [key, val] of Object.entries(el.attributes)) {
          svg += ` ${key}="${escapeXml(val)}"`;
        }
        svg += ` />\n`;
      }
    });

    svg += `</svg>`;
    return svg;
  }
}
