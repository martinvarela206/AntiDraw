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

export interface MarkerTemplate {
  key: string;
  viewBox: string;
  baseRefX: number;
  baseRefY: number;
  markerWidth: number;
  markerHeight: number;
  pos: 'start' | 'mid' | 'end' | 'all';
  innerXml: (color: string) => string;
}

export const MARKER_TEMPLATES: Record<string, MarkerTemplate> = {
  'arrow-open-start': {
    key: 'arrow-open-start',
    viewBox: '0 0 10 10',
    baseRefX: 1,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<path d="M 9 1.5 L 1 5 L 9 8.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
  },
  'arrow-open-end': {
    key: 'arrow-open-end',
    viewBox: '0 0 10 10',
    baseRefX: 9,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
  },
  'arrow-filled-start': {
    key: 'arrow-filled-start',
    viewBox: '0 0 10 10',
    baseRefX: 1,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<path d="M 10 1.5 L 1 5 L 10 8.5 Z" fill="${c}" />`,
  },
  'arrow-filled-end': {
    key: 'arrow-filled-end',
    viewBox: '0 0 10 10',
    baseRefX: 9,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="${c}" />`,
  },
  'arrow-filled-mid': {
    key: 'arrow-filled-mid',
    viewBox: '0 0 10 10',
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 6,
    markerHeight: 6,
    pos: 'mid',
    innerXml: (c) => `<path d="M 1 1.5 L 9 5 L 1 8.5 Z" fill="${c}" />`,
  },
  'circle-dot': {
    key: 'circle-dot',
    viewBox: '0 0 10 10',
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<circle cx="5" cy="5" r="3.5" fill="${c}" />`,
  },
  'square-block': {
    key: 'square-block',
    viewBox: '0 0 10 10',
    baseRefX: 5,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 5,
    pos: 'all',
    innerXml: (c) => `<rect x="2" y="2" width="6" height="6" fill="${c}" />`,
  },
  'bar-cap-start': {
    key: 'bar-cap-start',
    viewBox: '0 0 10 10',
    baseRefX: 2,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 6,
    pos: 'start',
    innerXml: (c) => `<line x1="2" y1="1" x2="2" y2="9" stroke="${c}" stroke-width="2" stroke-linecap="round" />`,
  },
  'bar-cap-end': {
    key: 'bar-cap-end',
    viewBox: '0 0 10 10',
    baseRefX: 8,
    baseRefY: 5,
    markerWidth: 5,
    markerHeight: 6,
    pos: 'end',
    innerXml: (c) => `<line x1="8" y1="1" x2="8" y2="9" stroke="${c}" stroke-width="2" stroke-linecap="round" />`,
  },
};

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
   */
  public static loadSvgString(svgText: string, ctx: IVectorModelSerializerContext): void {
    if (!svgText || !svgText.trim()) {
      ctx.createDefaultCanvas();
      return;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      if (!svgEl) {
        ctx.createDefaultCanvas();
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

      ctx.canvas.width = width;
      ctx.canvas.height = height;
      ctx.canvas.viewBox = viewBox;
      ctx.canvas.backgroundColor = bg;
      ctx.elements.length = 0;

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
        clone.querySelectorAll('[id^="ad-marker-"]').forEach((m) => m.remove());
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
          ctx.customDefs = '';
        } else {
          ctx.customDefs = clone.innerHTML
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .join('\n')
            .trim();
        }
      } else {
        ctx.customDefs = '';
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
                        const matMatch = gTrans.match(/matrix\(\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/i);
                        if (matMatch) {
                          const a = parseFloat(matMatch[1]);
                          const b = parseFloat(matMatch[2]);
                          const c = parseFloat(matMatch[3]);
                          const d = parseFloat(matMatch[4]);
                          const e = parseFloat(matMatch[5]);
                          const f = parseFloat(matMatch[6]);
                          gradConfig.cx = Math.round(e * 1000) / 1000;
                          gradConfig.cy = Math.round(f * 1000) / 1000;
                          const angleRad = Math.atan2(b, a);
                          gradConfig.rotation = Math.round(((angleRad * 180) / Math.PI) * 10) / 10;
                          gradConfig.rx = Math.round(Math.hypot(a, b) * 1000) / 1000;
                          gradConfig.ry = Math.round(Math.hypot(c, d) * 1000) / 1000;
                          gradConfig.r = gradConfig.rx;
                        } else {
                          const rotMatch = gTrans.match(/rotate\(([-\d.]+)/);
                          if (rotMatch) gradConfig.rotation = parseFloat(rotMatch[1]);
                          const scaleMatch = gTrans.match(/scale\(1,\s*([-\d.]+)\)/);
                          if (scaleMatch && gradConfig.rx) {
                            const sy = parseFloat(scaleMatch[1]);
                            gradConfig.ry = Math.round(gradConfig.rx * sy * 1000) / 1000;
                          }
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
            elem.vertices = ctx.parsePathD(attrs.d || '', nodeTypesStr);
            elem.isClosed = (attrs.d || '').toUpperCase().includes('Z');

            /**
             * ARCHITECTURAL RATIONALE: Parametric Path Attribute Preservation (FIX-22)
             * Standard SVG 1.1 lacks native attributes for partial arcs, annular wedges, and custom corner radii
             * on standard tags (<ellipse>, <rect>), so AntiDraw serializes them as compliant <path> elements with
             * `data-shape="..."` and `data-parametric="true"`.
             * Crucially, scalar geometric attributes (cx, cy, rx, ry, x, y, width, height) MUST NOT be deleted
             * when ingesting parametric paths, otherwise all geometry inspector controls reset to 0 upon reload.
             * Cleanup is strictly restricted to true freeform paths (`data-parametric !== 'true'`).
             */
            const isParametricPath =
              attrs['data-shape'] &&
              ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(attrs['data-shape']) &&
              attrs['data-parametric'] === 'true';

            if (isParametricPath) {
              elem.isParametric = true;
              elem.shapeType = attrs['data-shape'] as ParametricShapeType;
              elem.tagName = attrs['data-shape'];
            } else {
              shapeAttrs.forEach((sa) => delete elem.attributes[sa]);
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
            elem.vertices = ctx.convertShapeToVertices(tag, attrs);
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

          ctx.elements.push(elem);
        }
      });
    } catch (e) {
      console.error('Failed to parse SVG string', e);
      ctx.createDefaultCanvas();
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
    let out = STANDARD_MARKERS_INNER_XML;

    elements.forEach((el) => {
      const offset = parseFloat(el.attributes['data-marker-offset'] || '0') || 0;
      const markerSize = el.attributes['data-marker-size'] ? parseFloat(el.attributes['data-marker-size']) : 6;
      const markerUnits = el.attributes['data-marker-units'] || 'strokeWidth';
      const markerColor = el.attributes['data-marker-color'] || 'context-stroke';

      const isCustom = offset !== 0 ||
        el.attributes['data-marker-size'] !== undefined ||
        el.attributes['data-marker-units'] !== undefined ||
        (el.attributes['data-marker-color'] !== undefined && el.attributes['data-marker-color'] !== 'context-stroke');
      if (!isCustom) return;

      const checkMarker = (attrName: 'marker-start' | 'marker-mid' | 'marker-end', pos: 'start' | 'mid' | 'end') => {
        const val = el.attributes[attrName];
        if (!val || val === 'none') return;

        let matchKey: string | null = null;
        for (const k of Object.keys(MARKER_TEMPLATES)) {
          if (val.includes(k)) {
            matchKey = k;
            break;
          }
        }
        if (!matchKey) return;

        const tpl = MARKER_TEMPLATES[matchKey];
        let refX = tpl.baseRefX;
        if (pos === 'start') {
          refX = Math.round((tpl.baseRefX + offset) * 100) / 100;
        } else {
          refX = Math.round((tpl.baseRefX - offset) * 100) / 100;
        }

        const sizeScale = markerSize / 6;
        const mw = Math.round(tpl.markerWidth * sizeScale * 100) / 100;
        const mh = Math.round(tpl.markerHeight * sizeScale * 100) / 100;

        const customId = `ad-marker-${matchKey}-${el.id}`;
        el.attributes[attrName] = `url(#${customId})`;

        out += `    <marker id="${customId}" viewBox="${tpl.viewBox}" refX="${refX}" refY="${tpl.baseRefY}" markerWidth="${mw}" markerHeight="${mh}" markerUnits="${markerUnits}" orient="auto">\n`;
        out += `      ${tpl.innerXml(markerColor)}\n`;
        out += `    </marker>\n`;
      };

      checkMarker('marker-start', 'start');
      checkMarker('marker-mid', 'mid');
      checkMarker('marker-end', 'end');
    });

    return out;
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
