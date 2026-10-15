import {
  GradientConfig,
  GradientStop,
  ParametricShapeType,
  VectorElement,
} from '../VectorModel.js';
import { IVectorModelSerializerContext } from './SvgSerializer.js';
import type { CompanionMetadata } from '../../bridge/VsCodeBridge.js';
import { formatNum } from '../geometry/PathGeometryCompiler.js';
import { RectPrimitive } from '../primitives/RectPrimitive.js';

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
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'font-variant',
        'line-height',
        'letter-spacing',
        'word-spacing',
        'text-anchor',
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
              } else if (prop === 'font' && val) {
                const expanded = SvgDeserializer.parseFontShorthand(val);
                if (expanded) {
                  Object.assign(res, expanded);
                }
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
          const gAttrs: Record<string, string> = {};
          if (node.hasAttribute('style')) gAttrs.style = node.getAttribute('style')!;
          if (node.hasAttribute('transform')) gAttrs.transform = node.getAttribute('transform')!;
          SvgDeserializer.cleanStyleAttr(gAttrs);
          if (gAttrs.transform) {
            gAttrs.transform = SvgDeserializer.normalizeTransform(gAttrs.transform);
          }
          const groupInherited = { ...inherited, ...extractPresentationAttrs(node), ...gAttrs };
          Array.from(node.children).forEach((ch) => parseNode(ch, groupInherited));
          return;
        }

        // Inkscape SVG 1.2 <flowRoot> flowing text compatibility
        if (tag === 'flowroot') {
          const flowRegion = node.querySelector('flowRegion');
          const flowRect = flowRegion ? flowRegion.querySelector('rect') : null;
          const rx = flowRect ? parseFloat(flowRect.getAttribute('x') || '0') : 0;
          const ry = flowRect ? parseFloat(flowRect.getAttribute('y') || '0') : 0;
          const rw = flowRect ? parseFloat(flowRect.getAttribute('width') || '100') : 100;
          const rh = flowRect ? parseFloat(flowRect.getAttribute('height') || '50') : 50;

          const paraEls = Array.from(node.querySelectorAll('flowPara'));

          const idx = elementIdx++;
          let textElemId = node.getAttribute('id') || `flow_${idx}_${Date.now().toString(36)}`;
          if (usedIds.has(textElemId)) {
            textElemId = `flow_${idx}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
          }
          usedIds.add(textElemId);

          const elemAttrs: Record<string, string> = {};
          for (let i = 0; i < node.attributes.length; i++) {
            const attr = node.attributes[i];
            elemAttrs[attr.name] = attr.value;
          }

          const inlinePres = extractPresentationAttrs(node);
          for (const [k, v] of Object.entries(inlinePres)) {
            if (elemAttrs[k] === undefined) elemAttrs[k] = v;
          }
          for (const [k, v] of Object.entries(inherited)) {
            if (elemAttrs[k] === undefined) elemAttrs[k] = v;
          }

          SvgDeserializer.cleanStyleAttr(elemAttrs);
          if (elemAttrs.transform) {
            elemAttrs.transform = SvgDeserializer.normalizeTransform(elemAttrs.transform);
          }

          const fontSize = parseFloat(elemAttrs['font-size'] || '14') || 14;
          elemAttrs.id = textElemId;
          elemAttrs.x = rx.toString();
          elemAttrs.y = (ry + fontSize).toString();
          elemAttrs['data-area-type'] = 'true';
          elemAttrs['data-flow-region-x'] = rx.toString();
          elemAttrs['data-flow-region-y'] = ry.toString();
          elemAttrs['data-flow-region-width'] = rw.toString();
          elemAttrs['data-flow-region-height'] = rh.toString();

          const textElem: VectorElement = {
            id: textElemId,
            tagName: 'text',
            attributes: elemAttrs,
            children: [],
            isClosed: true,
            vertices: [
              { id: `${textElemId}_v0`, x: rx, y: ry, nodeType: 'sharp', command: 'M' },
              { id: `${textElemId}_v1`, x: rx + rw, y: ry, nodeType: 'sharp', command: 'L' },
              { id: `${textElemId}_v2`, x: rx + rw, y: ry + rh, nodeType: 'sharp', command: 'L' },
              { id: `${textElemId}_v3`, x: rx, y: ry + rh, nodeType: 'sharp', command: 'L' },
            ],
          };

          const textLines: string[] = [];
          paraEls.forEach((pEl, pIdx) => {
            const pText = pEl.textContent || '';
            textLines.push(pText);
            const pPres = extractPresentationAttrs(pEl);
            const pAttrs: Record<string, string> = {};
            for (let i = 0; i < pEl.attributes.length; i++) {
              pAttrs[pEl.attributes[i].name] = pEl.attributes[i].value;
            }
            SvgDeserializer.cleanStyleAttr(pAttrs);
            const tspanAttrs: Record<string, string> = {
              x: rx.toString(),
              dy: pIdx === 0 ? '0' : `${Math.round(fontSize * 1.25)}`,
              ...pPres,
              ...pAttrs,
            };
            textElem.children!.push({
              id: `${textElemId}_para_${pIdx}`,
              tagName: 'tspan',
              attributes: tspanAttrs,
              textContent: pText,
            });
          });

          textElem.textContent = textLines.join('\n');
          ctx.elements.push(textElem);
          return;
        }

        // Standard W3C SVG <text> support
        if (tag === 'text') {
          const idx = elementIdx++;
          let textElemId = node.getAttribute('id') || `text_${idx}_${Date.now().toString(36)}`;
          if (usedIds.has(textElemId)) {
            textElemId = `text_${idx}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
          }
          usedIds.add(textElemId);

          const elemAttrs: Record<string, string> = {};
          for (let i = 0; i < node.attributes.length; i++) {
            const attr = node.attributes[i];
            elemAttrs[attr.name] = attr.value;
          }

          const inlinePres = extractPresentationAttrs(node);
          for (const [k, v] of Object.entries(inlinePres)) {
            if (elemAttrs[k] === undefined) elemAttrs[k] = v;
          }
          for (const [k, v] of Object.entries(inherited)) {
            if (elemAttrs[k] === undefined) elemAttrs[k] = v;
          }

          SvgDeserializer.cleanStyleAttr(elemAttrs);
          if (elemAttrs.transform) {
            elemAttrs.transform = SvgDeserializer.normalizeTransform(elemAttrs.transform);
          }

          elemAttrs.id = textElemId;
          const fontSize = parseFloat(elemAttrs['font-size'] || '14') || 14;
          const tx = parseFloat(elemAttrs.x || '0') || 0;
          const ty = parseFloat(elemAttrs.y || '0') || 0;

          const textElem: VectorElement = {
            id: textElemId,
            tagName: 'text',
            attributes: elemAttrs,
            children: [],
            isClosed: false,
          };

          const tspans = Array.from(node.querySelectorAll('tspan'));
          if (tspans.length > 0) {
            tspans.forEach((ts, tsIdx) => {
              const tsAttrs: Record<string, string> = {};
              for (let i = 0; i < ts.attributes.length; i++) {
                tsAttrs[ts.attributes[i].name] = ts.attributes[i].value;
              }
              const tsPres = extractPresentationAttrs(ts);
              SvgDeserializer.cleanStyleAttr(tsAttrs);
              Object.assign(tsAttrs, tsPres);
              textElem.children!.push({
                id: ts.getAttribute('id') || `${textElemId}_ts_${tsIdx}`,
                tagName: 'tspan',
                attributes: tsAttrs,
                textContent: ts.textContent || '',
              });
            });
            textElem.textContent = tspans.map((t) => t.textContent || '').join('\n');
          } else {
            textElem.textContent = node.textContent || '';
          }

          const estWidth = Math.max(20, (textElem.textContent.length || 5) * (fontSize * 0.6));
          const estHeight = fontSize * 1.2;
          textElem.vertices = [
            { id: `${textElemId}_v0`, x: tx, y: ty - fontSize, nodeType: 'sharp', command: 'M' },
            { id: `${textElemId}_v1`, x: tx + estWidth, y: ty - fontSize, nodeType: 'sharp', command: 'L' },
            { id: `${textElemId}_v2`, x: tx + estWidth, y: ty, nodeType: 'sharp', command: 'L' },
            { id: `${textElemId}_v3`, x: tx, y: ty, nodeType: 'sharp', command: 'L' },
          ];

          ctx.elements.push(textElem);
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

          SvgDeserializer.cleanStyleAttr(attrs);
          if (attrs.transform) {
            attrs.transform = SvgDeserializer.normalizeTransform(attrs.transform);
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
              if (attrs['data-shape'] === 'rect') {
                const corners = RectPrimitive.parseCornersFromAttrs(attrs);
                const isUniform = corners.mode === 'uniform' || (corners.tl === corners.tr && corners.tr === corners.br && corners.br === corners.bl);
                elem.tagName = isUniform && corners.unit === 'px' ? 'rect' : 'path';

                // Restore scalar geometry coordinates if stripped from clean <path>
                if (attrs['data-rect-x'] && !attrs.x) attrs.x = attrs['data-rect-x'];
                if (attrs['data-rect-y'] && !attrs.y) attrs.y = attrs['data-rect-y'];
                if (attrs['data-rect-w'] && !attrs.width) attrs.width = attrs['data-rect-w'];
                if (attrs['data-rect-h'] && !attrs.height) attrs.height = attrs['data-rect-h'];

                if ((!attrs.x || !attrs.width) && elem.vertices && elem.vertices.length > 0) {
                  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                  elem.vertices.forEach((v) => {
                    minX = Math.min(minX, v.x);
                    minY = Math.min(minY, v.y);
                    maxX = Math.max(maxX, v.x);
                    maxY = Math.max(maxY, v.y);
                  });
                  if (!attrs.x) attrs.x = formatNum(minX);
                  if (!attrs.y) attrs.y = formatNum(minY);
                  if (!attrs.width) attrs.width = formatNum(Math.max(1, maxX - minX));
                  if (!attrs.height) attrs.height = formatNum(Math.max(1, maxY - minY));
                }

                if (isUniform && corners.unit === 'px') {
                  if (corners.tl > 0) {
                    attrs.rx = corners.tl.toString();
                    attrs.ry = corners.tl.toString();
                  }
                  delete attrs.d;
                }
              } else if (attrs['data-shape'] === 'ellipse' || attrs['data-shape'] === 'circle') {
                const ellipseType = (attrs['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
                const sAngle = parseFloat(attrs['data-start-angle'] || '0');
                const eAngle = parseFloat(attrs['data-end-angle'] || '360');
                const innerRatio = parseFloat(attrs['data-inner-ratio'] || '0');
                const isFull = ellipseType === 'ellipse' && Math.abs(eAngle - sAngle) >= 360 && innerRatio === 0;

                elem.tagName = isFull ? (attrs['data-shape'] === 'circle' ? 'circle' : 'ellipse') : 'path';

                // Restore scalar center & radii if stripped from clean <path>
                if (attrs['data-ellipse-cx'] && !attrs.cx) attrs.cx = attrs['data-ellipse-cx'];
                if (attrs['data-ellipse-cy'] && !attrs.cy) attrs.cy = attrs['data-ellipse-cy'];
                if (attrs['data-ellipse-rx'] && !attrs.rx) attrs.rx = attrs['data-ellipse-rx'];
                if (attrs['data-ellipse-ry'] && !attrs.ry) attrs.ry = attrs['data-ellipse-ry'];

                if ((!attrs.cx || !attrs.rx) && elem.vertices && elem.vertices.length > 0) {
                  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                  elem.vertices.forEach((v) => {
                    minX = Math.min(minX, v.x);
                    minY = Math.min(minY, v.y);
                    maxX = Math.max(maxX, v.x);
                    maxY = Math.max(maxY, v.y);
                  });
                  if (!attrs.cx) attrs.cx = formatNum((minX + maxX) / 2);
                  if (!attrs.cy) attrs.cy = formatNum((minY + maxY) / 2);
                  if (!attrs.rx) attrs.rx = formatNum(Math.max(1, (maxX - minX) / 2));
                  if (!attrs.ry) attrs.ry = formatNum(Math.max(1, (maxY - minY) / 2));
                }

                if (isFull) {
                  delete attrs.d;
                }
              } else {
                elem.tagName = attrs['data-shape'] === 'star' ? 'path' : attrs['data-shape'];
              }
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

  /**
   * Normalizes length strings (e.g., '10px', '12pt', '2in', '5mm') into unitless SVG scalar numbers.
   */
  public static normalizeLength(val: string): string {
    val = val.trim();
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return val;
    if (val.endsWith('px')) {
      return formatNum(num);
    } else if (val.endsWith('pt')) {
      return formatNum(num * (96 / 72));
    } else if (val.endsWith('in')) {
      return formatNum(num * 96);
    } else if (val.endsWith('mm')) {
      return formatNum(num * (96 / 25.4));
    } else if (val.endsWith('cm')) {
      return formatNum(num * (960 / 25.4));
    }
    return formatNum(num);
  }

  /**
   * Normalizes angle strings ('45deg', '1.57rad', '100grad', '0.25turn') into canonical degrees.
   */
  public static normalizeAngle(val: string): string {
    val = val.trim();
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return val;
    if (val.endsWith('deg')) {
      return formatNum(num);
    } else if (val.endsWith('grad')) {
      return formatNum((num * 360) / 400);
    } else if (val.endsWith('rad')) {
      return formatNum((num * 180) / Math.PI);
    } else if (val.endsWith('turn')) {
      return formatNum(num * 360);
    }
    return formatNum(num);
  }

  /**
   * Normalizes CSS transform declarations into canonical unitless SVG standard attribute format.
   * Converts units (px, deg, rad, grad, turn) and remaps single-axis functions (translateX, translateY, scaleX, scaleY, skew).
   */
  public static normalizeTransform(transformStr: string): string {
    if (!transformStr || !transformStr.trim()) return '';
    const fnRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
    const parts: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = fnRegex.exec(transformStr)) !== null) {
      const fn = match[1].toLowerCase();
      const rawArgs = match[2].trim();
      const args = rawArgs.split(/[\s,]+/).filter(Boolean);

      switch (fn) {
        case 'translatex': {
          const x = SvgDeserializer.normalizeLength(args[0] || '0');
          parts.push(`translate(${x}, 0)`);
          break;
        }
        case 'translatey': {
          const y = SvgDeserializer.normalizeLength(args[0] || '0');
          parts.push(`translate(0, ${y})`);
          break;
        }
        case 'translate': {
          const x = SvgDeserializer.normalizeLength(args[0] || '0');
          if (args.length >= 2) {
            const y = SvgDeserializer.normalizeLength(args[1]);
            parts.push(`translate(${x}, ${y})`);
          } else {
            parts.push(`translate(${x}, 0)`);
          }
          break;
        }
        case 'scalex': {
          const sx = SvgDeserializer.normalizeLength(args[0] || '1');
          parts.push(`scale(${sx}, 1)`);
          break;
        }
        case 'scaley': {
          const sy = SvgDeserializer.normalizeLength(args[0] || '1');
          parts.push(`scale(1, ${sy})`);
          break;
        }
        case 'scale': {
          const sx = SvgDeserializer.normalizeLength(args[0] || '1');
          if (args.length >= 2) {
            const sy = SvgDeserializer.normalizeLength(args[1]);
            parts.push(`scale(${sx}, ${sy})`);
          } else {
            parts.push(`scale(${sx})`);
          }
          break;
        }
        case 'rotate': {
          const angle = SvgDeserializer.normalizeAngle(args[0] || '0');
          if (args.length >= 3) {
            const cx = SvgDeserializer.normalizeLength(args[1]);
            const cy = SvgDeserializer.normalizeLength(args[2]);
            parts.push(`rotate(${angle}, ${cx}, ${cy})`);
          } else {
            parts.push(`rotate(${angle})`);
          }
          break;
        }
        case 'skew': {
          const ax = SvgDeserializer.normalizeAngle(args[0] || '0');
          if (args.length >= 2) {
            const ay = SvgDeserializer.normalizeAngle(args[1]);
            parts.push(`skewX(${ax}) skewY(${ay})`);
          } else {
            parts.push(`skewX(${ax})`);
          }
          break;
        }
        case 'skewx': {
          const ax = SvgDeserializer.normalizeAngle(args[0] || '0');
          parts.push(`skewX(${ax})`);
          break;
        }
        case 'skewy': {
          const ay = SvgDeserializer.normalizeAngle(args[0] || '0');
          parts.push(`skewY(${ay})`);
          break;
        }
        case 'matrix': {
          const normArgs = args.map((a) => SvgDeserializer.normalizeLength(a));
          parts.push(`matrix(${normArgs.join(', ')})`);
          break;
        }
        default: {
          const normArgs = args.map((a) => SvgDeserializer.normalizeLength(a));
          parts.push(`${fn}(${normArgs.join(', ')})`);
          break;
        }
      }
    }

    return parts.join(' ');
  }

  /**
   * Decomposes CSS font shorthand (e.g., 'italic bold 16px/1.5 "Inter", sans-serif') into its constituent SVG longhands.
   */
  public static parseFontShorthand(fontStr: string): Record<string, string> | null {
    if (!fontStr || !fontStr.trim()) return null;
    const trimmed = fontStr.trim();

    const sizeFamilyRegex = /(?:^|\s)(?:(100|200|300|400|500|600|700|800|900)\s+)?([0-9.]+(?:px|pt|em|rem|%|vw|vh)?)(?:\/([0-9.]+(?:px|pt|em|rem|%)?))?\s+(.+)$/i;
    const match = trimmed.match(sizeFamilyRegex);
    if (!match) return null;

    const optWeight = match[1];
    const sizeStr = match[2];
    const lineHeightStr = match[3];
    const familyStr = match[4];

    const matchStartIndex = trimmed.indexOf(match[0].trim());
    const prefix = trimmed.substring(0, matchStartIndex).trim();
    const result: Record<string, string> = {};

    if (optWeight) {
      result['font-weight'] = optWeight;
    }

    if (prefix) {
      const tokens = prefix.split(/\s+/);
      for (const token of tokens) {
        const lower = token.toLowerCase();
        if (['italic', 'oblique'].includes(lower)) {
          result['font-style'] = lower;
        } else if (['bold', 'bolder', 'lighter'].includes(lower) || /^[1-9]00$/.test(lower)) {
          result['font-weight'] = lower;
        } else if (lower === 'small-caps') {
          result['font-variant'] = 'small-caps';
        } else if (lower === 'normal') {
          if (!result['font-style']) result['font-style'] = 'normal';
        }
      }
    }

    const numSize = parseFloat(sizeStr);
    result['font-size'] = Number.isFinite(numSize) ? formatNum(numSize) : sizeStr;

    if (lineHeightStr) {
      result['line-height'] = lineHeightStr;
    }

    if (familyStr) {
      result['font-family'] = familyStr.trim();
    }

    return result;
  }

  /**
   * Cleans an element's inline style attribute, extracting and normalizing transform
   * and expanding font shorthand into direct element attributes.
   */
  public static cleanStyleAttr(attrs: Record<string, string>): void {
    if (!attrs.style) return;
    const decls = attrs.style.split(';');
    const remainingDecls: string[] = [];

    for (const d of decls) {
      const colon = d.indexOf(':');
      if (colon <= 0) continue;
      const prop = d.substring(0, colon).trim().toLowerCase();
      const val = d.substring(colon + 1).trim();
      if (!val) continue;

      if (prop === 'transform') {
        const norm = SvgDeserializer.normalizeTransform(val);
        if (norm) {
          attrs.transform = attrs.transform ? `${attrs.transform} ${norm}` : norm;
        }
      } else if (prop === 'font') {
        const expanded = SvgDeserializer.parseFontShorthand(val);
        if (expanded) {
          for (const [k, v] of Object.entries(expanded)) {
            if (attrs[k] === undefined) attrs[k] = v;
          }
        }
      } else {
        remainingDecls.push(`${prop}:${val}`);
      }
    }

    if (remainingDecls.length > 0) {
      attrs.style = remainingDecls.join(';');
    } else {
      delete attrs.style;
    }
  }
}
