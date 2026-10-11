import {
  GradientConfig,
  GradientStop,
  ParametricShapeType,
  VectorElement,
} from '../VectorModel.js';
import { IVectorModelSerializerContext } from './SvgSerializer.js';
import type { CompanionMetadata } from '../../bridge/VsCodeBridge.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated SVG Deserialization Service (SvgDeserializer)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates XML document parsing, SVG tag extraction, viewBox and canvas property ingestion,
 *    filter and gradient defs reconstruction, and parametric primitive restoration away from
 *    outbound SVG generation in SvgSerializer.
 *
 * 2. Defs Sanitization & Ghost Comment Elimination (FIX-20):
 *    Explicitly traverses and strips AntiDraw template comments, orphaned markers, filters,
 *    and gradients to prevent unbounded comment growth across repeated save/reload cycles.
 *
 * 3. Strict ID Deduplication and Collision Prevention (FIX-19):
 *    Guarantees that every imported element receives a unique identifier in memory, resolving
 *    missing or duplicate IDs from external SVGs before registering into VectorModel.
 *
 * 4. Parametric Geometry Restoration (FEAT-01, FEAT-02, FEAT-03, FIX-22):
 *    Preserves native primitives (<rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>)
 *    and restores parametric paths without stripping essential scalar geometric attributes.
 *
 * 5. Open Vector Fill Restriction (FIX-13):
 *    Prevents browser-simulated straight-line chord fills on open paths by forcing fill='none'
 *    unless explicitly closed.
 *
 * 6. Companion JSON State Fusion (Rule 18 / FIX-SVG-01):
 *    Reconstructs full parametric and proprietary element state (data-shape, data-parametric,
 *    data-node-types, data-gradient, etc.) by fusing clean W3C SVG markup with metadata.elements
 *    persisted in the companion JSON file.
 */
export class SvgDeserializer {
  /**
   * Parses an SVG document string and populates the model canvas, custom defs, and vector elements.
   * Fuses companion metadata into element attributes to rehydrate full parametric editor state.
   */
  public static loadSvgString(
    svgText: string,
    ctx: IVectorModelSerializerContext,
    companionMetadata?: CompanionMetadata | null
  ): void {
    if (!svgText || !svgText.trim()) {
      ctx.createDefaultCanvas();
      return;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        console.warn('[AntiDraw:SvgDeserializer] XML parser error detectado al procesar SVG');
      }

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
      if (!Number.isFinite(width) || width <= 0) width = 800;
      if (!Number.isFinite(height) || height <= 0) height = 600;

      let viewBox = vbAttr || `0 0 ${width} ${height}`;
      if (vbAttr) {
        const vbNums = vbAttr.trim().split(/[\s,]+/).map((v) => parseFloat(v));
        if (
          vbNums.length !== 4 ||
          vbNums.some((n) => !Number.isFinite(n)) ||
          vbNums[2] <= 0 ||
          vbNums[3] <= 0
        ) {
          viewBox = `0 0 ${width} ${height}`;
        }
      }

      // ARCHITECTURAL RATIONALE: Standard SVG Transparency Preservation
      // Standard W3C SVG documents have transparent canvas backgrounds by default unless explicitly declared.
      // Initializing bg to 'none' ensures that SVGs without a background-color declaration render
      // with fill="none" on the artboard <rect id="__artboard_bg__">, preserving transparency
      // and preventing unwanted solid white boxes without requiring intrusive checkerboard patterns.
      let bg = 'none';
      const bgMatch = styleAttr.match(/background-color:\s*([^;]+)/i);
      if (bgMatch) {
        bg = bgMatch[1].trim();
      } else if (svgEl.getAttribute('background-color')) {
        bg = svgEl.getAttribute('background-color')!;
      }

      const parAttr = svgEl.getAttribute('preserveAspectRatio');
      const rootFill = svgEl.getAttribute('fill') || '';
      const rootStroke = svgEl.getAttribute('stroke') || '';
      const rootStrokeWidth = svgEl.getAttribute('stroke-width') || '';
      const rootStrokeLinecap = svgEl.getAttribute('stroke-linecap') || '';
      const rootStrokeLinejoin = svgEl.getAttribute('stroke-linejoin') || '';

      ctx.canvas.width = width;
      ctx.canvas.height = height;
      ctx.canvas.viewBox = viewBox;
      ctx.canvas.backgroundColor = bg;
      ctx.canvas.preserveAspectRatio = parAttr || 'xMidYMid meet';
      ctx.canvas.svgFill = rootFill;
      ctx.canvas.svgStroke = rootStroke;
      ctx.canvas.svgStrokeWidth = rootStrokeWidth;
      ctx.canvas.svgStrokeLinecap = rootStrokeLinecap;
      ctx.canvas.svgStrokeLinejoin = rootStrokeLinejoin;

      if (companionMetadata?.canvas?.currentColor) {
        ctx.canvas.currentColor = companionMetadata.canvas.currentColor;
      } else if (!ctx.canvas.currentColor) {
        ctx.canvas.currentColor = '#000000';
      }

      if (companionMetadata?.swatches && Array.isArray(companionMetadata.swatches)) {
        ctx.swatches = companionMetadata.swatches;
      }

      ctx.elements.length = 0;

      // Strict Defs Sanitization & Orphaned Comments Elimination (FIX-20)
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

      /**
       * ARCHITECTURAL RATIONALE: W3C SVG Presentation Attribute Cascading Inheritance (FIX-CASCADING-ATTRS)
       * In W3C SVG 1.1 / 2.0 specifications, presentation attributes (fill, stroke, stroke-width,
       * opacity, etc.) declared on <svg> or container <g> elements automatically inherit down to child
       * vector elements unless overridden explicitly on the child or via inline style.
       * Extracting inheritable attributes and recursing through <g> containers prevents imported
       * SVG icons (e.g. grid.svg, Feather, Heroicons) from defaulting to solid black fills and invisible
       * 0-width strokes on child <rect> and <line> elements.
       */
      const INHERITABLE_PRESENTATION_ATTRS = [
        'fill',
        'fill-opacity',
        'fill-rule',
        'stroke',
        'stroke-width',
        'stroke-linecap',
        'stroke-linejoin',
        'stroke-miterlimit',
        'stroke-dasharray',
        'stroke-dashoffset',
        'stroke-opacity',
        'opacity',
        'color',
      ];

      const extractPresentationAttrs = (el: Element): Record<string, string> => {
        const res: Record<string, string> = {};
        for (const a of INHERITABLE_PRESENTATION_ATTRS) {
          if (el.hasAttribute(a)) {
            res[a] = el.getAttribute(a)!;
          }
        }
        const style = el.getAttribute('style');
        if (style) {
          const decls = style.split(';');
          for (const d of decls) {
            const colon = d.indexOf(':');
            if (colon > 0) {
              const prop = d.substring(0, colon).trim().toLowerCase();
              const val = d.substring(colon + 1).trim();
              if (INHERITABLE_PRESENTATION_ATTRS.includes(prop) && val) {
                res[prop] = val;
              }
            }
          }
        }
        return res;
      };

      const rootInheritedAttrs = extractPresentationAttrs(svgEl);

      // Parse child vector elements with recursive group and cascading presentation attribute inheritance
      const usedIds = new Set<string>();
      let elementIdx = 0;

      const parseNode = (node: Element, inherited: Record<string, string>) => {
        const tag = node.tagName.toLowerCase();
        if (tag === 'g') {
          const groupInherited = { ...inherited, ...extractPresentationAttrs(node) };
          Array.from(node.children).forEach((ch) => parseNode(ch, groupInherited));
          return;
        }

        if (['path', 'rect', 'ellipse', 'circle', 'line', 'polygon', 'polyline', 'star'].includes(tag)) {
          // Suppress importing compiled secondary appearance layers as orphaned standalone canvas elements
          const nodeClass = node.getAttribute('class') || '';
          const nodeId = node.getAttribute('id') || '';
          const isSecondaryAppearanceLayer =
            nodeClass.includes('ad-appearance-stroke-slave') ||
            node.getAttribute('data-appearance-role') === 'secondary-stroke' ||
            /__stroke_/.test(nodeId);

          if (isSecondaryAppearanceLayer) {
            return;
          }

          const idx = elementIdx++;
          const attrs: Record<string, string> = {};
          for (let i = 0; i < node.attributes.length; i++) {
            const attr = node.attributes[i];
            attrs[attr.name] = attr.value;
          }

          // Merge inline presentation styles if present
          const inlinePres = extractPresentationAttrs(node);
          for (const [k, v] of Object.entries(inlinePres)) {
            if (attrs[k] === undefined) {
              attrs[k] = v;
            }
          }

          // Cascade inherited presentation attributes from ancestor <svg> or <g>
          for (const [k, v] of Object.entries(inherited)) {
            if (attrs[k] === undefined) {
              attrs[k] = v;
            }
          }

          const parseFinite = (val: string | null, defVal: number): number => {
            if (!val) return defVal;
            const n = parseFloat(val);
            return Number.isFinite(n) ? n : defVal;
          };

          // Import drop-shadow metadata from external <feDropShadow> filter if not already stored
          if (!attrs['data-drop-shadow'] && attrs['filter'] && defsEl) {
            const match = attrs['filter'].match(/url\(#([^)]+)\)/);
            if (match) {
              const filterId = match[1];
              const filterEl = defsEl.querySelector(`#${filterId}`);
              if (filterEl) {
                const dropEl = filterEl.querySelector('feDropShadow');
                if (dropEl) {
                  const dx = parseFinite(dropEl.getAttribute('dx'), 4);
                  const dy = parseFinite(dropEl.getAttribute('dy'), 4);
                  const blur = Math.max(0, parseFinite(dropEl.getAttribute('stdDeviation'), 4));
                  const color = dropEl.getAttribute('flood-color') || '#000000';
                  const opacity = Math.max(0, Math.min(1, parseFinite(dropEl.getAttribute('flood-opacity'), 0.5)));
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
                    const safeOffset = Number.isFinite(offVal) ? Math.max(0, Math.min(1, offVal)) : 0;
                    const color = s.getAttribute('stop-color') || '#000000';
                    const opStr = s.getAttribute('stop-opacity');
                    const op = opStr ? parseFloat(opStr) : 1;
                    const safeOp = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1;
                    return {
                      id: `stop_${sIdx}`,
                      offset: safeOffset,
                      color,
                      opacity: safeOp,
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
                        const raw = val.includes('%') ? parseFloat(val) / 100 : parseFloat(val);
                        return Number.isFinite(raw) ? raw : defVal;
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
                        const matMatch = gTrans.match(
                          /matrix\(\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/i
                        );
                        if (matMatch) {
                          const a = parseFinite(matMatch[1], 1);
                          const b = parseFinite(matMatch[2], 0);
                          const c = parseFinite(matMatch[3], 0);
                          const d = parseFinite(matMatch[4], 1);
                          const e = parseFinite(matMatch[5], 0);
                          const f = parseFinite(matMatch[6], 0);
                          gradConfig.cx = Math.round(e * 1000) / 1000;
                          gradConfig.cy = Math.round(f * 1000) / 1000;
                          const angleRad = Math.atan2(b, a);
                          gradConfig.rotation = Math.round(((angleRad * 180) / Math.PI) * 10) / 10;
                          gradConfig.rx = Math.round(Math.hypot(a, b) * 1000) / 1000;
                          gradConfig.ry = Math.round(Math.hypot(c, d) * 1000) / 1000;
                          gradConfig.r = gradConfig.rx;
                        } else {
                          const rotMatch = gTrans.match(/rotate\(([-\d.]+)/);
                          if (rotMatch) gradConfig.rotation = parseFinite(rotMatch[1], 0);
                          const scaleMatch = gTrans.match(/scale\(1,\s*([-\d.]+)\)/);
                          if (scaleMatch && gradConfig.rx) {
                            const sy = parseFinite(scaleMatch[1], 1);
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

          // Sanitize corrupted numerical attributes (NaN, Infinity)
          for (const [k, v] of Object.entries(attrs)) {
            if (typeof v === 'string' && (v.includes('NaN') || v.includes('Infinity'))) {
              if (['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy'].includes(k)) {
                attrs[k] = '0';
              } else if (['width', 'height', 'r', 'rx', 'ry'].includes(k)) {
                attrs[k] = '50';
              }
            }
          }

          let elementId = attrs.id;
          if (!elementId || usedIds.has(elementId)) {
            elementId = `el_${idx}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
            attrs.id = elementId;
          }
          usedIds.add(elementId);

          // Rehydrate proprietary attributes from companion JSON metadata (Rule 18 / FIX-SVG-01)
          if (companionMetadata?.elements && companionMetadata.elements[elementId]) {
            Object.assign(attrs, companionMetadata.elements[elementId]);
          }

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

            const isParametricPath =
              attrs['data-shape'] &&
              ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'star'].includes(attrs['data-shape']) &&
              attrs['data-parametric'] === 'true';

            if (isParametricPath) {
              elem.isParametric = true;
              elem.shapeType = attrs['data-shape'] as ParametricShapeType | 'star';
              elem.tagName = attrs['data-shape'] === 'star' ? 'path' : attrs['data-shape'];
            } else {
              shapeAttrs.forEach((sa) => delete elem.attributes[sa]);
              elem.isParametric = false;
              elem.shapeType = 'path';
            }
          } else {
            elem.vertices = ctx.convertShapeToVertices(tag, attrs);
            elem.tagName = tag;
            elem.isParametric = true;
            elem.shapeType = tag as ParametricShapeType;
            elem.attributes['data-shape'] = tag;
            elem.attributes['data-parametric'] = 'true';
            elem.isClosed = tag !== 'line' && tag !== 'polyline';
          }

          if (!elem.isClosed) {
            if (attrs.fill === undefined || tag === 'line') {
              elem.attributes.fill = 'none';
            }
            if (elem.attributes.fill === 'none') {
              delete elem.attributes['data-gradient'];
            }
          }

          ctx.elements.push(elem);
        }
      };

      Array.from(svgEl.children).forEach((child) => parseNode(child, rootInheritedAttrs));
    } catch (e) {
      console.error('Failed to parse SVG string', e);
      ctx.createDefaultCanvas();
    }
  }
}
