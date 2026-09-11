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

/**
 * ARCHITECTURAL RATIONALE: Standard SVG Marker Catalog (<marker>)
 * 
 * 1. Hardware-Accelerated Contextual Inheritance (context-stroke):
 *    In modern SVG2 (Chromium/Webkit/Gecko), `fill="context-stroke"` and `stroke="context-stroke"`
 *    allow marker primitives to automatically inherit the runtime stroke color and opacity of the
 *    referencing vector element without generating duplicate <marker> entries for every color variant.
 * 
 * 2. Explicit Forward & Reverse Orientation Geometry:
 *    Rather than relying on inconsistent browser edge cases with `orient="auto-start-reverse"`,
 *    dedicated `-start` (pointing outward backwards, refX=1 or 2) and `-end` (pointing forward, refX=8 or 9)
 *    markers are generated with explicit `orient="auto"`. This guarantees absolute geometric fidelity
 *    across standalone vector viewers, Inkscape, Illustrator, and web browsers.
 * 
 * 3. Proportional Scaling (markerUnits="strokeWidth"):
 *    Default markerUnits="strokeWidth" ensures that when an illustrator thickens the path stroke,
 *    dimension arrows and end caps scale up proportionally without clipping or visual disconnect.
 */
export const STANDARD_MARKERS_INNER_XML = `    <!-- AntiDraw Standard SVG Markers -->
    <!-- Arrow Open Start (Cota abierta inicial) -->
    <marker id="ad-marker-arrow-open-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 9 1.5 L 1 5 L 9 8.5" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>
    <!-- Arrow Open End (Cota abierta final) -->
    <marker id="ad-marker-arrow-open-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </marker>

    <!-- Arrow Filled Start (Triángulo lleno inicial) -->
    <marker id="ad-marker-arrow-filled-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 10 1.5 L 1 5 L 10 8.5 Z" fill="context-stroke" />
    </marker>
    <!-- Arrow Filled End (Triángulo lleno final) -->
    <marker id="ad-marker-arrow-filled-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="context-stroke" />
    </marker>
    <!-- Arrow Filled Mid (Flecha direccional intermedia) -->
    <marker id="ad-marker-arrow-filled-mid" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 1 1.5 L 9 5 L 1 8.5 Z" fill="context-stroke" />
    </marker>

    <!-- Circle Dot (Punto circular terminal/nodo) -->
    <marker id="ad-marker-circle-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <circle cx="5" cy="5" r="3.5" fill="context-stroke" />
    </marker>

    <!-- Square Block (Terminal cuadrado) -->
    <marker id="ad-marker-square-block" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <rect x="2" y="2" width="6" height="6" fill="context-stroke" />
    </marker>

    <!-- Bar Cap Start (Remate perpendicular en T inicial) -->
    <marker id="ad-marker-bar-cap-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="5" markerHeight="6" orient="auto">
      <line x1="2" y1="1" x2="2" y2="9" stroke="context-stroke" stroke-width="2" stroke-linecap="round" />
    </marker>
    <!-- Bar Cap End (Remate perpendicular en T final) -->
    <marker id="ad-marker-bar-cap-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="6" orient="auto">
      <line x1="8" y1="1" x2="8" y2="9" stroke="context-stroke" stroke-width="2" stroke-linecap="round" />
    </marker>\n`;

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

  public loadSvgString(svgText: string): void {
    if (!svgText || !svgText.trim()) {
      this.createDefaultCanvas();
      return;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      if (!svgEl) {
        this.createDefaultCanvas();
        return;
      }

      // Read Canvas settings
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      const vbAttr = svgEl.getAttribute('viewBox');
      const styleAttr = svgEl.getAttribute('style') || '';

      let width = wAttr ? parseFloat(wAttr) : 800;
      let height = hAttr ? parseFloat(hAttr) : 600;
      if (isNaN(width) || width <= 0) width = 800;
      if (isNaN(height) || height <= 0) height = 600;

      let viewBox = vbAttr || `0 0 ${width} ${height}`;

      let bg = '#ffffff';
      const bgMatch = styleAttr.match(/background-color:\s*([^;]+)/i);
      if (bgMatch) {
        bg = bgMatch[1].trim();
      } else if (svgEl.getAttribute('background-color')) {
        bg = svgEl.getAttribute('background-color')!;
      }

      this.canvas = { width, height, viewBox, backgroundColor: bg };
      this.elements = [];

      // HISTORICAL ARCHITECTURE (FIX-20):
      // Strict Defs Sanitization & Orphaned Comments Elimination.
      // Why this was built:
      // Previously, when cloning <defs>, standard markers (`ad-marker-*`), filters (`ad-filter-*`),
      // and gradients (`ad-grad-*`) elements were removed from the DOM clone, but their accompanying
      // XML comments (e.g. "<!-- AntiDraw Standard SVG Markers -->", "<!-- Arrow Open Start -->", etc.)
      // and whitespace text nodes remained in clone.innerHTML. When serialized back to SVG via `toSvgString`,
      // STANDARD_MARKERS_INNER_XML was prepended while the leftover comments in this.customDefs were appended.
      // Over repeated save/reload cycles or when deleting vectors with markers, orphaned comments multiplied
      // uncontrollably in <defs>.
      // Solution:
      // 1. Explicitly traverse and remove all XML comment nodes referring to AntiDraw markers, filters, or gradients.
      // 2. If no valid child element tags remain in clone, treat customDefs as strictly empty ('').
      // 3. Normalize residual whitespace, preventing ghost comment accumulation in SVG files.
      const defsEl = svgEl.querySelector('defs');
      if (defsEl) {
        const clone = defsEl.cloneNode(true) as HTMLElement;
        const markerIds = [
          'ad-marker-arrow-open-start', 'ad-marker-arrow-open-end',
          'ad-marker-arrow-filled-start', 'ad-marker-arrow-filled-end',
          'ad-marker-arrow-filled-mid', 'ad-marker-circle-dot',
          'ad-marker-square-block', 'ad-marker-bar-cap-start', 'ad-marker-bar-cap-end'
        ];
        markerIds.forEach((id) => {
          const m = clone.querySelector(`#${id}`);
          if (m) m.remove();
        });
        clone.querySelectorAll('[id^="ad-filter-"]').forEach((f) => f.remove());
        clone.querySelectorAll('[id^="ad-grad-"]').forEach((g) => g.remove());

        // Remove all comment nodes associated with AntiDraw template blocks or orphaned markers
        const removeOrphanComments = (parent: Node) => {
          const nodes = Array.from(parent.childNodes);
          for (const node of nodes) {
            if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
              const text = node.nodeValue || '';
              if (
                text.includes('AntiDraw') ||
                text.includes('marker') ||
                text.includes('Arrow') ||
                text.includes('Circle Dot') ||
                text.includes('Square Block') ||
                text.includes('Bar Cap') ||
                text.includes('Filter') ||
                text.includes('Gradient')
              ) {
                node.remove();
              }
            } else if (node.hasChildNodes()) {
              removeOrphanComments(node);
            }
          }
        };
        removeOrphanComments(clone);

        // If no functional child elements remain in clone, defs had only standard AntiDraw resources
        if (clone.children.length === 0) {
          this.customDefs = '';
        } else {
          this.customDefs = clone.innerHTML
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .join('\n')
            .trim();
        }
      } else {
        this.customDefs = '';
      }

      // Parse child vector elements
      // HISTORICAL ARCHITECTURE (FIX-19):
      // Strict ID Deduplication and Collision Prevention.
      // If external SVGs or previous saves contain duplicate or missing IDs, assign a fresh unique ID
      // so no two vector elements ever share the same identifier in memory or DOM lookups.
      const usedIds = new Set<string>();
      const children = Array.from(svgEl.children);
      children.forEach((child, idx) => {
        const tag = child.tagName.toLowerCase();
        if (['path', 'rect', 'ellipse', 'circle', 'line', 'polygon', 'polyline', 'star'].includes(tag)) {
          const attrs: Record<string, string> = {};
          for (let i = 0; i < child.attributes.length; i++) {
            const attr = child.attributes[i];
            attrs[attr.name] = attr.value;
          }

          // Import drop-shadow metadata from external <feDropShadow> filter if not already stored
          if (!attrs['data-drop-shadow'] && attrs['filter'] && defsEl) {
            const match = attrs['filter'].match(/url\(#([^)]+)\)/);
            if (match) {
              const filterId = match[1];
              const filterEl = defsEl.querySelector(`#${filterId}`);
              if (filterEl) {
                const dropEl = filterEl.querySelector('feDropShadow');
                if (dropEl) {
                  const dx = parseFloat(dropEl.getAttribute('dx') || '4') || 4;
                  const dy = parseFloat(dropEl.getAttribute('dy') || '4') || 4;
                  const blur = parseFloat(dropEl.getAttribute('stdDeviation') || '4') || 4;
                  const color = dropEl.getAttribute('flood-color') || '#000000';
                  const opacity = parseFloat(dropEl.getAttribute('flood-opacity') || '0.5') || 0.5;
                  attrs['data-drop-shadow'] = JSON.stringify({ enabled: true, dx, dy, blur, color, opacity });
                }
              }
            }
          }

          // Import gradient metadata from external <linearGradient> or <radialGradient> if not already stored
          if (!attrs['data-gradient'] && attrs['fill'] && defsEl) {
            const match = attrs['fill'].match(/url\(#([^)]+)\)/);
            if (match) {
              const gradId = match[1];
              const gradEl = defsEl.querySelector(`#${gradId}`);
              if (gradEl) {
                const gradTag = gradEl.tagName.toLowerCase();
                if (gradTag === 'lineargradient' || gradTag === 'radialgradient') {
                  const isLinear = gradTag === 'lineargradient';
                  const stopEls = Array.from(gradEl.querySelectorAll('stop'));
                  const stops: GradientStop[] = stopEls.map((s, sIdx) => {
                    const offStr = s.getAttribute('offset') || '0';
                    const offVal = offStr.includes('%') ? parseFloat(offStr) / 100 : parseFloat(offStr);
                    const color = s.getAttribute('stop-color') || '#000000';
                    const opStr = s.getAttribute('stop-opacity');
                    const op = opStr ? parseFloat(opStr) : 1;
                    return {
                      id: `stop_${sIdx}`,
                      offset: isNaN(offVal) ? 0 : offVal,
                      color,
                      opacity: isNaN(op) ? 1 : op,
                    };
                  });
                  if (stops.length >= 2) {
                    const gradConfig: GradientConfig = {
                      type: isLinear ? 'linear' : 'radial',
                      stops,
                    };
                    if (!isLinear) {
                      const parsePctOrNum = (val: string | null, defVal: number): number => {
                        if (!val) return defVal;
                        return val.includes('%') ? parseFloat(val) / 100 : parseFloat(val);
                      };
                      gradConfig.cx = parsePctOrNum(gradEl.getAttribute('cx'), 0.5);
                      gradConfig.cy = parsePctOrNum(gradEl.getAttribute('cy'), 0.5);
                      gradConfig.r = parsePctOrNum(gradEl.getAttribute('r'), 0.5);
                      gradConfig.rx = parsePctOrNum(gradEl.getAttribute('rx'), gradConfig.r);
                      gradConfig.ry = parsePctOrNum(gradEl.getAttribute('ry'), gradConfig.r);
                      if (gradEl.hasAttribute('fx')) gradConfig.fx = parsePctOrNum(gradEl.getAttribute('fx'), gradConfig.cx);
                      if (gradEl.hasAttribute('fy')) gradConfig.fy = parsePctOrNum(gradEl.getAttribute('fy'), gradConfig.cy);

                      const gTrans = gradEl.getAttribute('gradientTransform');
                      if (gTrans) {
                        const rotMatch = gTrans.match(/rotate\(([-\d.]+)/);
                        if (rotMatch) gradConfig.rotation = parseFloat(rotMatch[1]);
                        const scaleMatch = gTrans.match(/scale\(1,\s*([-\d.]+)\)/);
                        if (scaleMatch && gradConfig.rx) {
                          const sy = parseFloat(scaleMatch[1]);
                          gradConfig.ry = Math.round(gradConfig.rx * sy * 1000) / 1000;
                        }
                      }
                    }
                    attrs['data-gradient'] = JSON.stringify(gradConfig);
                  }
                }
              }
            }
          }

          let elementId = attrs.id;
          if (!elementId || usedIds.has(elementId)) {
            elementId = `el_${idx}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
            attrs.id = elementId;
          }
          usedIds.add(elementId);

          const elem: VectorElement = {
            id: elementId,
            tagName: tag,
            attributes: attrs,
          };

          const shapeAttrs = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];

          if (tag === 'path') {
            const nodeTypesStr = attrs['data-node-types'] || '';
            elem.vertices = this.parsePathD(attrs.d || '', nodeTypesStr);
            elem.isClosed = (attrs.d || '').toUpperCase().includes('Z');
            shapeAttrs.forEach((sa) => delete elem.attributes[sa]);
            if (attrs['data-shape'] && ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(attrs['data-shape']) && attrs['data-parametric'] === 'true') {
              elem.isParametric = true;
              elem.shapeType = attrs['data-shape'] as ParametricShapeType;
              elem.tagName = attrs['data-shape'];
            } else {
              elem.isParametric = false;
              elem.shapeType = 'path';
            }
          } else {
            /**
             * ARCHITECTURAL RATIONALE: Native Parametric Shape Ingestion (FEAT-01)
             * Instead of destroying native SVG primitives (<rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>)
             * by forcibly mutating them into <path>, AntiDraw preserves their original tagName, parametric attributes,
             * and data-shape markers while calculating unified vertices for canvas rendering and bounding box calculation.
             */
            elem.vertices = this.convertShapeToVertices(tag, attrs);
            elem.tagName = tag;
            elem.isParametric = true;
            elem.shapeType = tag as ParametricShapeType;
            elem.attributes['data-shape'] = tag;
            elem.attributes['data-parametric'] = 'true';
            elem.isClosed = tag !== 'line' && tag !== 'polyline';
          }

          /**
           * HISTORICAL ARCHITECTURE (FIX-13):
           * Open Vector Fill Restriction & Simulated Fill Elimination.
           *
           * Underlying Technical Justification:
           * The SVG specification dictates that when an open path (missing 'Z' command) has a fill
           * other than 'none', the browser automatically simulates a closure by connecting the
           * terminal vertex back to the origin vertex with an invisible straight line.
           * In professional vector illustration (CorelDraw, Illustrator, Figma), open strokes
           * must never have artificial fills unless explicitly closed.
           *
           * Technical Solution:
           * When importing or unrolling an open element, `fill` is strictly forced to 'none'
           * and any associated `data-gradient` attributes are deleted to prevent corrupt defs.
           */
          if (!elem.isClosed) {
            elem.attributes.fill = 'none';
            delete elem.attributes['data-gradient'];
          }

          this.elements.push(elem);
        }
      });
    } catch (e) {
      console.error('Failed to parse SVG string', e);
      this.createDefaultCanvas();
    }
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
  public compileElementFilters(): string {
    let out = '';
    this.elements.forEach((el) => {
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
  public compileElementGradients(): string {
    let out = '';
    this.elements.forEach((el) => {
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
          const rad = (grad.angle * Math.PI) / 180;
          x1 = Math.round((0.5 - 0.5 * Math.cos(rad)) * 1000) / 1000;
          y1 = Math.round((0.5 - 0.5 * Math.sin(rad)) * 1000) / 1000;
          x2 = Math.round((0.5 + 0.5 * Math.cos(rad)) * 1000) / 1000;
          y2 = Math.round((0.5 + 0.5 * Math.sin(rad)) * 1000) / 1000;
        }

        out += `    <linearGradient id="${gradId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="objectBoundingBox">\n`;
      } else {
        const cx = grad.cx ?? 0.5;
        const cy = grad.cy ?? 0.5;
        const rx = grad.rx ?? grad.r ?? 0.5;
        const ry = grad.ry ?? grad.r ?? 0.5;
        const fx = grad.fx ?? cx;
        const fy = grad.fy ?? cy;
        const rotation = grad.rotation ?? 0;

        // In SVG <radialGradient>, r is the reference radius. Using rx as base,
        // any differing ry or rotation is expressed cleanly via gradientTransform.
        const r = rx;
        const sy = rx > 0.0001 ? Math.round((ry / rx) * 1000) / 1000 : 1;

        let transformAttr = '';
        if (Math.abs(sy - 1) > 0.001 || Math.abs(rotation) > 0.1) {
          /**
           * ARCHITECTURAL RATIONALE: Multiaxis Radial Gradient via gradientTransform (FIX-06)
           * SVG specification allows elliptical shaping and arbitrary rotation of radial gradients
           * through gradientTransform="translate(cx, cy) rotate(deg) scale(1, sy) translate(-cx, -cy)".
           * This guarantees solidary rotation and multi-axis rx/ry aspect preservation across all
           * SVG viewers and renderers without warping into circles upon bounding box aspect changes.
           */
          transformAttr = ` gradientTransform="translate(${cx}, ${cy}) rotate(${rotation}) scale(1, ${sy}) translate(-${cx}, -${cy})"`;
        }

        out += `    <radialGradient id="${gradId}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}"${transformAttr} gradientUnits="objectBoundingBox">\n`;
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

  public toSvgString(): string {
    const { width, height, viewBox, backgroundColor } = this.canvas;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" style="background-color: ${backgroundColor};">\n`;

    // Detect if any vector element makes use of SVG marker terminations
    const hasMarkers = this.elements.some(
      (el) => !!(el.attributes['marker-start'] || el.attributes['marker-mid'] || el.attributes['marker-end'])
    );
    const filterDefs = this.compileElementFilters();
    const gradientDefs = this.compileElementGradients();

    const hasCustomDefs = !!(this.customDefs && this.customDefs.trim().length > 0);
    if (hasMarkers || filterDefs.length > 0 || gradientDefs.length > 0 || hasCustomDefs) {
      svg += `  <defs id="antidraw-defs">\n`;
      if (hasMarkers) {
        svg += STANDARD_MARKERS_INNER_XML;
      }
      if (filterDefs.length > 0) {
        svg += filterDefs;
      }
      if (gradientDefs.length > 0) {
        svg += gradientDefs;
      }
      if (hasCustomDefs) {
        svg += `    ${this.customDefs.trim()}\n`;
      }
      svg += `  </defs>\n`;
    }

    this.elements.forEach((el) => {
      // HISTORICAL ARCHITECTURE (FIX-19): Guarantee attributes.id strictly reflects model el.id upon serialization
      el.attributes.id = el.id;

      if (this.isParametricElement(el) && el.tagName !== 'path') {
        /**
         * ARCHITECTURAL RATIONALE: Native Parametric SVG Export (FEAT-01 & FEAT-02)
         * Preserves original SVG primitives (<rect>, <ellipse>, <circle>, <line>, <polyline>, <polygon>)
         * in the output SVG document without converting them to path commands.
         * For parametric ellipse in 'pie' or 'arc' mode: native SVG lacks start/end angle attributes,
         * so AntiDraw serializes them as compliant <path> carrying parametric metadata (data-shape="ellipse",
         * data-parametric="true", data-ellipse-type, data-start-angle, data-end-angle, cx, cy, rx, ry),
         * guaranteeing standard SVG renderers display the wedge or arc without losing re-editability.
         */
        this.syncParametricAttributes(el);
        const cleanAttrs: Record<string, string> = { ...el.attributes };
        const ellipseType = cleanAttrs['data-ellipse-type'];

        if (ellipseType === 'pie' || ellipseType === 'arc') {
          const cx = parseFloat(cleanAttrs.cx || '0');
          const cy = parseFloat(cleanAttrs.cy || '0');
          const rx = parseFloat(cleanAttrs.rx || '1');
          const ry = parseFloat(cleanAttrs.ry || '1');
          const startAngle = parseFloat(cleanAttrs['data-start-angle'] || '0');
          const endAngle = parseFloat(cleanAttrs['data-end-angle'] || '360');

          cleanAttrs.d = this.compileEllipseD(cx, cy, rx, ry, ellipseType as 'pie' | 'arc', startAngle, endAngle);
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
        } else if (this.isRect(el)) {
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
          const corners = this.getRectCorners(el, w, h);
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
            const eff = this.calculateEffectiveCorners(w, h, corners);
            cleanAttrs.d = this.compileRectD(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
            cleanAttrs['data-shape'] = 'rect';
            cleanAttrs['data-parametric'] = 'true';
            delete cleanAttrs['data-node-types'];
            svg += `  <path`;
            for (const [key, val] of Object.entries(cleanAttrs)) {
              svg += ` ${key}="${escapeXml(val)}"`;
            }
            svg += ` />\n`;
          }
        } else {
          delete cleanAttrs.d;
          delete cleanAttrs['data-node-types'];

          if (!this.isElementClosed(el)) {
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
          el.attributes.d = this.compilePathD(el.vertices, el.isClosed);
          // Persist nodeType for each vertex so re-parsing restores it reliably
          el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
        }

        /**
         * HISTORICAL ARCHITECTURE (FIX-13):
         * Open Vector Fill Suppression in SVG Serialization.
         * If an element is open (!isElementClosed), its fill attribute is strictly set to 'none'
         * and any gradient definitions are unlinked to eliminate false straight-line polygon fills.
         */
        if (!this.isElementClosed(el)) {
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

  private createDefaultCanvas() {
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
}

function formatNum(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
